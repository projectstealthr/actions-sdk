/**
 * Wire-level shapes shared by the HTTP client and every transport. Kept
 * deliberately small and JSON-centric: an action describes *what* it wants
 * (method, url, headers, query, body); a {@link Transport} decides *how* the
 * credential is attached and where the bytes go (direct to the provider, or via
 * a managed proxy). The action never sees the difference.
 */

/** HTTP methods the SDK issues. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** JSON value — the body/response shape the transports can carry faithfully. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A single query parameter value; arrays repeat the key. */
export type QueryValue = string | number | boolean | undefined | null | Array<string | number | boolean>;

/**
 * A normalised outbound request. `url` is absolute; `query` is merged into it by
 * the client before the transport sees it. `body` must be JSON-serialisable —
 * binary/multipart is explicitly out of scope for the managed proxy transport
 * (it decodes bodies to JSON), so keeping the contract JSON-only means an action
 * behaves identically on both transports. Raw non-JSON payloads are rejected
 * loudly rather than silently mangled.
 */
export interface NormalizedRequest {
  method: HttpMethod;
  url: string;
  /** Header names are treated case-insensitively by transports. */
  headers: Record<string, string>;
  body?: JsonValue;
  /** Abort signal for cancellation/timeouts; transports must honour it. */
  signal?: AbortSignal;
}

/** A normalised response. `data` is parsed JSON when the body was JSON, else the raw text. */
export interface NormalizedResponse {
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  data: unknown;
}

/**
 * The transport seam. A transport takes a fully-formed request and returns a
 * response, or throws an {@link ActionError}. It owns credential attachment and
 * the network hop; it must NOT implement retries or pagination (those live in
 * the client, transport-agnostically). Non-2xx responses are returned, not
 * thrown — the client decides how to surface them.
 */
export interface Transport {
  /** A stable label for diagnostics ("direct", "composio-proxy"). Never secret. */
  readonly kind: string;
  send(request: NormalizedRequest): Promise<NormalizedResponse>;
}

/**
 * The subset of the WHATWG `fetch` signature the SDK depends on. Injecting it
 * (rather than reaching for the global) makes transports unit-testable without
 * monkey-patching `globalThis` and lets a host supply a proxy-aware fetch.
 */
export type FetchLike = (
  input: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  status: number;
  headers: { forEach(cb: (value: string, key: string) => void): void };
  text(): Promise<string>;
}

/** Resolve the runtime fetch, or throw a clear error if the host has none. */
export function resolveFetch(candidate?: FetchLike): FetchLike {
  if (candidate) return candidate;
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch === 'function') return globalFetch as FetchLike;
  throw new Error('No fetch implementation available — pass one explicitly (Node >= 18 has a global fetch)');
}

/** Lower-case every header key; drop null/undefined values. */
export function normalizeHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    out[name.toLowerCase()] = value;
  }
  return out;
}

/**
 * Append query params to a URL, preserving any already present. Arrays repeat
 * the key (`?a=1&a=2`); null/undefined values are dropped. Keeps the SDK's
 * URL-building in one audited place instead of scattered string concatenation.
 */
export function appendQuery(url: string, query?: Record<string, QueryValue>): string {
  if (!query) return url;
  const pairs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) pairs.append(key, String(v));
    } else {
      pairs.append(key, String(value));
    }
  }
  const search = pairs.toString();
  if (!search) return url;
  return url + (url.includes('?') ? '&' : '?') + search;
}
