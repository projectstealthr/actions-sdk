import { ActionError } from '../errors';
import {
  type FetchLike,
  isFormBody,
  isMultipartBody,
  type JsonValue,
  type NormalizedRequest,
  type NormalizedResponse,
  type RequestBody,
  resolveFetch,
  type Transport,
} from './types';

/**
 * Header names that must not ride to the proxy: the proxy issues its own
 * request (fresh host/content-length), attaches the real credential, and always
 * delivers the body as JSON — so our auth/content headers are Composio's to
 * set. Mirrors the platform's proven `managed-transport.js` strip list.
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  'authorization',
  'content-type',
  'content-length',
  'host',
  'connection',
  'accept-encoding',
  'transfer-encoding',
]);

/** Envelope headers describing the provider↔proxy wire, not our synthetic body. */
const STRIPPED_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

const DEFAULT_BASE_URL = 'https://backend.composio.dev';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface ComposioProxyTransportOptions {
  /** Composio API key (`x-api-key`). Never logged. */
  apiKey: string;
  /** The managed connected-account id, e.g. `ca__…`. */
  connectedAccountId: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface ProxyEnvelope {
  data?: unknown;
  status?: number;
  headers?: Record<string, unknown>;
}

/**
 * The managed rail (ADR 0037/0038). Rewrites an action's request into Composio's raw
 * HTTP proxy (`POST /api/v3/tools/execute/proxy`), which attaches the real
 * token server-side — so the SDK holds no provider credential for managed
 * connections. The action's request shape is identical to the direct rail; only
 * the transport differs, which is the whole point of the seam.
 *
 * Proxy contract (verified live 2026-07-07, and against the platform's
 * `managed-transport.js`): `endpoint` is a full URL; forwarded headers ride as
 * `parameters: [{ name, value, type: 'header' }]`; `body` must be a JSON object;
 * the response envelope is `{ data, status, headers }` where `status` is the
 * PROVIDER's status.
 */
export class ComposioProxyTransport implements Transport {
  readonly kind = 'composio-proxy';
  private readonly apiKey: string;
  private readonly connectedAccountId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ComposioProxyTransportOptions) {
    if (!options.apiKey) {
      throw new ActionError({
        code: 'auth_missing',
        message: 'ComposioProxyTransport requires an apiKey',
        retryable: false,
      });
    }
    if (!options.connectedAccountId) {
      throw new ActionError({
        code: 'auth_missing',
        message: 'ComposioProxyTransport requires a connectedAccountId',
        retryable: false,
      });
    }
    this.apiKey = options.apiKey;
    this.connectedAccountId = options.connectedAccountId;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = resolveFetch(options.fetchImpl);
  }

  async send(request: NormalizedRequest): Promise<NormalizedResponse> {
    this.assertNoBinary(request);
    const payload = this.buildPayload(request);

    // Compose the caller's abort signal (if any) with our timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = (): void => controller.abort();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', onAbort, { once: true });
    }

    let status: number;
    let text: string;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/v3/tools/execute/proxy`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      // A failure reaching Composio is a gateway problem — retryable, and the
      // real message (scrubbed) so operators can tell "proxy down" from "401".
      throw new ActionError({
        code: 'transport_unreachable',
        message: `Composio proxy unreachable: ${err instanceof Error ? err.message : String(err)}`,
        status: 0,
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
      if (request.signal) request.signal.removeEventListener('abort', onAbort);
    }

    if (status < 200 || status >= 300) {
      throw new ActionError({
        code: 'transport_unreachable',
        message: `Composio proxy request failed (${status}): ${text.slice(0, 300)}`,
        status,
        retryable: status >= 500 || status === 429,
      });
    }

    let envelope: ProxyEnvelope;
    try {
      envelope = JSON.parse(text) as ProxyEnvelope;
    } catch {
      throw new ActionError({
        code: 'transport_unreachable',
        message: 'Composio proxy returned a non-JSON response',
        status: 502,
        retryable: true,
      });
    }

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(envelope.headers ?? {})) {
      // Response header values are strings; ignore anything else the envelope carries.
      if (typeof value !== 'string') continue;
      if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name.toLowerCase()] = value;
    }
    return {
      status: typeof envelope.status === 'number' ? envelope.status : 200,
      headers,
      data: envelope.data,
    };
  }

  /**
   * The managed proxy carries JSON only: it decodes request bodies to JSON and
   * cannot return raw bytes. A file upload (multipart) or a binary download is
   * therefore impossible on this rail — reject it loudly and actionably rather
   * than silently corrupt the bytes. The managed FILE path is served elsewhere
   * (the runtime's Composio typed-tool fallback, where Composio moves the file
   * server-side); an SDK http action must use a direct/BYO connection for files.
   * See docs/FRAMEWORK-NOTES.md §B.
   */
  private assertNoBinary(request: NormalizedRequest): void {
    if (isMultipartBody(request.body)) {
      throw new ActionError({
        code: 'unsupported_body',
        message:
          'file uploads need a direct (bring-your-own) connection — the managed proxy carries JSON only',
        status: 0,
        retryable: false,
      });
    }
    if (isFormBody(request.body)) {
      throw new ActionError({
        code: 'unsupported_body',
        message:
          'form-encoded bodies need a direct (bring-your-own) connection — the managed proxy carries JSON only',
        status: 0,
        retryable: false,
      });
    }
    if (request.responseType === 'binary') {
      throw new ActionError({
        code: 'unsupported_body',
        message:
          'binary downloads need a direct (bring-your-own) connection — the managed proxy carries JSON only',
        status: 0,
        retryable: false,
      });
    }
  }

  private buildPayload(request: NormalizedRequest): Record<string, JsonValue> {
    const parameters: Array<{ name: string; value: string; type: 'header' }> = [];
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined || value === null) continue;
      if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
      parameters.push({ name, value: String(value), type: 'header' });
    }

    const payload: Record<string, JsonValue> = {
      connected_account_id: this.connectedAccountId,
      endpoint: request.url,
      method: request.method,
    };
    if (parameters.length > 0) payload.parameters = parameters;
    if (request.body !== undefined) payload.body = this.assertProxyableBody(request.body);
    return payload;
  }

  /**
   * The proxy delivers the body as JSON; it faithfully carries a JSON *object*
   * only (it decodes strings/form bodies to objects and mangles the rest). A
   * non-object body is rejected loudly here rather than silently corrupted —
   * the same limitation the platform's managed transport documents.
   */
  private assertProxyableBody(body: RequestBody): JsonValue {
    if (
      !isMultipartBody(body) &&
      !isFormBody(body) &&
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body)
    ) {
      return body;
    }
    throw new ActionError({
      code: 'unsupported_body',
      message: 'managed connections carry JSON object request bodies only (got a non-object body)',
      status: 0,
      retryable: false,
    });
  }
}
