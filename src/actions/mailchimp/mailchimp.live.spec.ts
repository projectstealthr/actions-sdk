import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listAudiences, listCampaigns } from './lists';

/**
 * LIVE smoke tests for Mailchimp (Marketing API) via the Composio managed proxy.
 * Mailchimp is region-scoped — the host embeds a datacenter prefix — so every call
 * needs a `serverPrefix` prop. Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and
 * additionally requires MAILCHIMP_CONNECTED_ACCOUNT_ID AND MAILCHIMP_SERVER_PREFIX;
 * self-skips when either is absent (verification queue: mailchimp).
 *
 * Required env:
 *   MAILCHIMP_CONNECTED_ACCOUNT_ID   ca_… for the connected Mailchimp account
 *   MAILCHIMP_SERVER_PREFIX          e.g. us19 (the suffix on the API key)
 *
 * READ-ONLY. `add_member` is authored and works, but there is no authored
 * delete/archive-member action, so a created member couldn't be cleaned up via the
 * authored surface (and a "subscribed" add can trigger confirmation email) — per
 * the batch guard-rail (reversible-or-read-only) this stays read-only. Reads:
 * audiences (lists) and campaigns.
 */
const MC_ACCOUNT = process.env.MAILCHIMP_CONNECTED_ACCOUNT_ID;
const MC_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX;
const canRead = Boolean(MC_ACCOUNT && MC_PREFIX);
const serverPrefix = MC_PREFIX ?? 'us1';

liveComposioDescribe('mailchimp — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: MC_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = canRead ? it : it.skip;

  gated(
    'list_audiences + list_campaigns (read-only)',
    async () => {
      const audiences = await listAudiences.execute({ auth, http, props: { serverPrefix } });
      expect(Array.isArray(audiences.lists)).toBe(true);
      expect(JSON.stringify(audiences).toLowerCase()).not.toContain('composio');

      const campaigns = await listCampaigns.execute({ auth, http, props: { serverPrefix } });
      expect(Array.isArray(campaigns.campaigns)).toBe(true);
      console.log(`live: mailchimp → ${audiences.count} audience(s), ${campaigns.count} campaign(s)`);
    },
    30_000,
  );
});
