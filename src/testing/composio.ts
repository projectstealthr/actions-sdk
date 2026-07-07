import type { AuthHandle } from '../core/auth';
import { createComposioAuth } from '../core/auth-factories';
import { composioApiKey, DEFAULT_SLACK_ACCOUNT } from './live';

/**
 * Test harness: build a Composio-backed {@link AuthHandle} for live smoke tests
 * (design §7 — actions run against the real API through a managed connection).
 * Reads `COMPOSIO_API_KEY` from the environment; the connected-account id
 * defaults to the shared Slack fixture but can be overridden.
 */
export function composioSlackAuth(connectedAccountId: string = DEFAULT_SLACK_ACCOUNT): AuthHandle {
  const apiKey = composioApiKey();
  if (!apiKey) {
    throw new Error('composioSlackAuth requires COMPOSIO_API_KEY — gate the suite with liveComposioDescribe');
  }
  return createComposioAuth({ apiKey, connectedAccountId, schemeType: 'oauth2' });
}
