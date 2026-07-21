import type { JsonValue } from '../../../core/http/types';
import { asArray, asRecord } from '../generate-text';
import { normalizeUsage, throwNoTurn, toolNamesById } from './shared';
import type {
  AgentConversationMessage,
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResult,
  AgentToolCall,
  AgentToolSchema,
} from './types';

/**
 * Gemini `:generateContent` function calling — the classic REST shape the LLM
 * `generate_text` action already targets (contents/parts + `?key=` auth). Tools
 * are `{ functionDeclarations:[…] }`; the model's calls come back as `functionCall`
 * parts (role `model`, no call id — Gemini matches by NAME); results go back as
 * `functionResponse` parts in a user turn, keyed by the tool's name. Verified
 * against the generateContent function-calling reference (ai.google.dev/api).
 */

/** Gemini has no per-call id — synthesize a unique one; results still thread by name. */
function synthesizeId(name: string, index: number): string {
  return `${name}_${index}`;
}

/**
 * The keys Gemini's function-declaration `parameters` accepts — its `Schema` is an
 * OpenAPI-3.0 SUBSET, NOT full JSON Schema, and v1beta strict parsing 400s on any
 * unknown key ("Unknown name additionalProperties"). We ALLOWLIST rather than drop a
 * denylist so no JSON-Schema-only keyword (`additionalProperties`, `$schema`, `$defs`,
 * `oneOf`, `additionalItems`, …) can ever slip through: an unlisted key only loosens
 * the schema, never breaks the call. Verified against the generateContent Schema
 * reference (ai.google.dev/api/caching#Schema).
 */
const GEMINI_SCHEMA_KEYS = new Set([
  'type',
  'format',
  'title',
  'description',
  'nullable',
  'default',
  'enum',
  'items',
  'minItems',
  'maxItems',
  'properties',
  'required',
  'propertyOrdering',
  'minProperties',
  'maxProperties',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'example',
  'anyOf',
]);

/**
 * Recursively coerce ANY tool JSON schema into a Gemini-safe `Schema`: keep only the
 * allowlisted keys, recursing into `properties.*`, `items`, and `anyOf` (the nested
 * schema positions). A non-object node (string enum, number, array of `required`)
 * passes through untouched — only object nodes are filtered.
 */
function sanitizeGeminiSchema(schema: unknown): JsonValue {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema as JsonValue;
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const props: Record<string, JsonValue> = {};
      for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
        props[name] = sanitizeGeminiSchema(sub);
      }
      out.properties = props;
    } else if (key === 'items' || key === 'anyOf') {
      out[key] = sanitizeGeminiSchema(value);
    } else {
      out[key] = value as JsonValue;
    }
  }
  return out;
}

/**
 * True when a sanitized schema declares no parameters (an object type — or untyped —
 * with no properties). Gemini rejects a function declaration whose `parameters` is an
 * empty-properties object, so such a tool is emitted as a no-parameter function (the
 * `parameters` field omitted). This is the fate of the open/default tool schema.
 */
function isNoParamSchema(schema: JsonValue): boolean {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const props = schema.properties;
  const hasProps =
    props !== null && typeof props === 'object' && !Array.isArray(props) && Object.keys(props).length > 0;
  return (schema.type === undefined || schema.type === 'object') && !hasProps;
}

/** One bound tool → a Gemini `functionDeclaration`, `parameters` sanitized (omitted when no-param). */
function functionDeclaration(tool: AgentToolSchema): JsonValue {
  const parameters = sanitizeGeminiSchema(tool.parameters);
  return {
    name: tool.name,
    description: tool.description,
    ...(isNoParamSchema(parameters) ? {} : { parameters }),
  };
}

/** An assistant turn → a `model` content with a text part (if any) + `functionCall` parts. */
function modelContent(message: AgentConversationMessage): JsonValue {
  const parts: JsonValue[] = [];
  if (message.content) parts.push({ text: message.content });
  for (const call of message.toolCalls ?? []) {
    parts.push({ functionCall: { name: call.name, args: (call.input ?? {}) as JsonValue } });
  }
  return { role: 'model', parts: parts.length > 0 ? parts : [{ text: message.content }] };
}

/** Serialize the buffer to Gemini contents, merging runs of tool results into one user turn. */
function geminiContents(messages: readonly AgentConversationMessage[]): JsonValue {
  const names = toolNamesById(messages);
  const out: JsonValue[] = [];
  let pendingResponses: JsonValue[] = [];
  const flush = (): void => {
    if (pendingResponses.length > 0) {
      out.push({ role: 'user', parts: pendingResponses });
      pendingResponses = [];
    }
  };
  for (const message of messages) {
    if (message.role === 'tool') {
      const id = message.toolCallId ?? '';
      pendingResponses.push({
        functionResponse: { name: names.get(id) ?? id, response: { result: message.content } },
      });
      continue;
    }
    flush();
    if (message.role === 'user') out.push({ role: 'user', parts: [{ text: message.content }] });
    else out.push(modelContent(message));
  }
  flush();
  return out;
}

function buildBody(req: AgentModelRequest): JsonValue {
  const generationConfig: Record<string, JsonValue> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens;
  return {
    contents: geminiContents(req.messages),
    // A zero-tool request omits `tools` entirely — Gemini 400s on an empty
    // `functionDeclarations` (a tools-less "just reason" agent is valid; §2).
    ...(req.tools.length > 0
      ? { tools: [{ functionDeclarations: req.tools.map(functionDeclaration) }] }
      : {}),
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}

function parseResponse(data: unknown): AgentModelResult {
  const parts = asArray(asRecord(asRecord(asArray(asRecord(data)?.candidates)?.[0])?.content)?.parts);
  if (!parts) throwNoTurn('gemini');
  const textParts: string[] = [];
  const toolCalls: AgentToolCall[] = [];
  for (const raw of parts) {
    const part = asRecord(raw);
    const fnCall = asRecord(part?.functionCall);
    if (fnCall && typeof fnCall.name === 'string') {
      toolCalls.push({
        id: synthesizeId(fnCall.name, toolCalls.length),
        name: fnCall.name,
        input: fnCall.args ?? {},
      });
    } else if (typeof part?.text === 'string') {
      textParts.push(part.text);
    }
  }
  const text = textParts.join('');
  const usage = normalizeUsage(
    data,
    'usageMetadata',
    'promptTokenCount',
    'candidatesTokenCount',
    'totalTokenCount',
  );
  return { ...(text ? { text } : {}), toolCalls, ...(usage ? { usage } : {}) };
}

/** Gemini generateContent tool-aware adapter. */
export const geminiAgentAdapter: AgentModelAdapter = {
  buildUrl: (req) => `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`,
  buildBody,
  parseResponse,
};
