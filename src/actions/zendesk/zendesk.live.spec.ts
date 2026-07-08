import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listTickets } from './tickets';
import { listUsers, search } from './other';

/**
 * LIVE smoke tests for Zendesk (Support API) via the Composio managed proxy.
 * Zendesk is subdomain-scoped, so every call needs a `subdomain` prop. Gated
 * behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * ZENDESK_CONNECTED_ACCOUNT_ID AND ZENDESK_SUBDOMAIN; self-skips when either is
 * absent (verification queue: zendesk).
 *
 * Required env:
 *   ZENDESK_CONNECTED_ACCOUNT_ID   ca_… for the connected Zendesk account
 *   ZENDESK_SUBDOMAIN              e.g. acme (from acme.zendesk.com)
 *
 * READ-ONLY. `create_ticket` is authored and works, but there is no authored
 * delete-ticket action (closing is not deletion) — a created ticket couldn't be
 * cleaned up via the authored surface, so per the batch guard-rail
 * (reversible-or-read-only) this stays read-only. Reads: tickets, users, and the
 * unified search.
 */
const ZD_ACCOUNT = process.env.ZENDESK_CONNECTED_ACCOUNT_ID;
const ZD_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const canRead = Boolean(ZD_ACCOUNT && ZD_SUBDOMAIN);
const subdomain = ZD_SUBDOMAIN ?? 'missing';

liveComposioDescribe('zendesk — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: ZD_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = canRead ? it : it.skip;

  gated(
    'list_tickets + list_users + search (read-only)',
    async () => {
      const tickets = await listTickets.execute({ auth, http, props: { subdomain, limit: 3 } });
      expect(Array.isArray(tickets.tickets)).toBe(true);
      expect(JSON.stringify(tickets).toLowerCase()).not.toContain('composio');

      const users = await listUsers.execute({ auth, http, props: { subdomain, limit: 3 } });
      expect(Array.isArray(users.users)).toBe(true);

      const results = await search.execute({ auth, http, props: { subdomain, query: 'type:ticket' } });
      expect(Array.isArray(results.results)).toBe(true);
      console.log(`live: zendesk → ${tickets.count} ticket(s), ${users.count} user(s)`);
    },
    45_000,
  );
});
