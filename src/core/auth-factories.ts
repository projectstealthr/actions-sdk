import { type AuthHandle, type AuthScheme, createAuthHandle, type DirectCredential } from './auth';
import { type FetchLike } from './http/types';
import { ComposioProxyTransport } from './http/transport-composio';
import { DirectTransport } from './http/transport-direct';

/**
 * Runtime seam (design §5): the SDK ships two ways to build the opaque
 * {@link AuthHandle} an action runs on. Which one the runtime picks — BYO/direct
 * or managed via Composio — is invisible to the action.
 */

/**
 * Build a handle that sends straight to the provider with a BYO credential
 * (self-host / pasted key / our own OAuth token). Pass a `{ type: 'none' }`
 * credential to hit public endpoints unauthenticated through the same rail.
 */
export function createDirectAuth(
  scheme: AuthScheme,
  credential: DirectCredential,
  options: { fetchImpl?: FetchLike } = {},
): AuthHandle {
  const transport = new DirectTransport({
    scheme,
    credential,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  return createAuthHandle(scheme.type, transport);
}

/**
 * Build a handle that routes through Composio's managed proxy — the SDK holds no
 * provider credential; Composio attaches it server-side. The declared scheme
 * type is carried for the catalog/UI, but the action never reads it.
 */
export function createComposioAuth(options: {
  apiKey: string;
  connectedAccountId: string;
  /** Scheme type surfaced on the handle for the UI; defaults to `oauth2`. */
  schemeType?: AuthScheme['type'];
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): AuthHandle {
  const transport = new ComposioProxyTransport({
    apiKey: options.apiKey,
    connectedAccountId: options.connectedAccountId,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  return createAuthHandle(options.schemeType ?? 'oauth2', transport);
}
