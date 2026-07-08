import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getBalance, getCustomer, listCustomers } from './reads';

/**
 * LIVE smoke tests for Stripe via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * STRIPE_CONNECTED_ACCOUNT_ID; self-skips otherwise (verification queue: stripe).
 *
 * Required env:
 *   STRIPE_CONNECTED_ACCOUNT_ID   ca_… for the connected Stripe account
 *
 * READ-ONLY by design. Stripe's writes require `application/x-www-form-urlencoded`
 * bodies with bracketed nested params, which the JSON-only client + transports
 * cannot express yet (framework gap #2, `form-body-blocked`) — so no create action
 * is authored and there is nothing safe to write. Reads: account balance,
 * customers, and the live customer picker (with search).
 */
const STRIPE_ACCOUNT = process.env.STRIPE_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('stripe — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: STRIPE_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = STRIPE_ACCOUNT ? it : it.skip;

  gated(
    'get_balance + list_customers + customer picker (read-only)',
    async () => {
      const balance = await getBalance.execute({ auth, http, props: {} });
      expect(Array.isArray(balance.available)).toBe(true);
      expect(JSON.stringify(balance).toLowerCase()).not.toContain('composio');

      const customers = await listCustomers.execute({ auth, http, props: { limit: 3 } });
      expect(Array.isArray(customers.data)).toBe(true);

      const picker = await getCustomer.loadOptions('customerId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(
        `live: stripe.get_balance → ${balance.available.length} currency bucket(s); ${customers.data.length} customer(s)`,
      );
    },
    30_000,
  );
});
