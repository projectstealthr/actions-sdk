import { defineAction } from '../../core/action';
import { ActionError } from '../../core/errors';
import type { JsonValue } from '../../core/http/types';
import { checkbox, json, longText, number } from '../../core/props';

/**
 * JSON utilities — a no-auth ("none" scheme) app ported from the Activepieces
 * `json` piece. Pure, dependency-free transforms over JSON values.
 *
 * Deferred to a later phase (needs the `jsonata` dependency, out of scope for the
 * dependency-free phase-1): `run_jsonata_query`.
 */

function isPlainObject(value: JsonValue): value is { [k: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively merge `source` onto `target`; objects merge, everything else overwrites. */
function deepMerge(
  target: { [k: string]: JsonValue },
  source: { [k: string]: JsonValue },
): { [k: string]: JsonValue } {
  const out: { [k: string]: JsonValue } = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] =
      existing !== undefined && isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

export const JSON_TO_TEXT_TYPE = 'json.convert_json_to_text';
export interface JsonToTextResult {
  result: string;
}
export const convertJsonToText = defineAction({
  type: JSON_TO_TEXT_TYPE,
  name: 'Convert Json to Text',
  description: 'Serialise a JSON value to a string, optionally pretty-printed.',
  auth: { type: 'none' },
  props: {
    data: json({ label: 'JSON', required: true }),
    pretty: checkbox({ label: 'Pretty print', required: false, defaultValue: false }),
    indent: number({ label: 'Indent spaces', required: false, defaultValue: 2 }),
  },
  run: ({ props }): Promise<JsonToTextResult> => {
    const space = props.pretty ? (props.indent ?? 2) : undefined;
    return Promise.resolve({ result: JSON.stringify(props.data, null, space) });
  },
});

export const TEXT_TO_JSON_TYPE = 'json.convert_text_to_json';
export interface TextToJsonResult {
  result: JsonValue;
}
export const convertTextToJson = defineAction({
  type: TEXT_TO_JSON_TYPE,
  name: 'Convert Text to Json',
  description: 'Parse a JSON string into a JSON value.',
  auth: { type: 'none' },
  props: { text: longText({ label: 'Text', required: true }) },
  run: ({ props }): Promise<TextToJsonResult> => {
    try {
      return Promise.resolve({ result: JSON.parse(props.text) as JsonValue });
    } catch (err) {
      throw new ActionError({
        code: 'invalid_input',
        message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        retryable: false,
      });
    }
  },
});

export const MERGE_JSON_TYPE = 'json.merge_json';
export interface MergeJsonResult {
  result: { [k: string]: JsonValue };
}
export const mergeJson = defineAction({
  type: MERGE_JSON_TYPE,
  name: 'Merge JSON Objects',
  description: 'Merge two JSON objects; the second wins on key conflicts.',
  auth: { type: 'none' },
  props: {
    json1: json({ label: 'First object', required: true }),
    json2: json({ label: 'Second object', required: true }),
    deep: checkbox({ label: 'Deep merge', required: false, defaultValue: false }),
  },
  run: ({ props }): Promise<MergeJsonResult> => {
    if (!isPlainObject(props.json1) || !isPlainObject(props.json2)) {
      throw new ActionError({
        code: 'invalid_input',
        message: 'both inputs must be JSON objects',
        retryable: false,
      });
    }
    const result = props.deep ? deepMerge(props.json1, props.json2) : { ...props.json1, ...props.json2 };
    return Promise.resolve({ result });
  },
});
