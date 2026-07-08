import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createContact } from './contacts';
import { createDeal } from './deals';
import { listOwners } from './owners';

/**
 * LIVE smoke tests for HubSpot via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * HUBSPOT_CONNECTED_ACCOUNT_ID — there is NO HubSpot connection on the shared
 * account yet, so this self-skips (verification queue: hubspot = PENDING).
 * Read-only: it lists owners and resolves the live owner + pipeline pickers.
 */
const HUBSPOT_ACCOUNT = process.env.HUBSPOT_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (HUBSPOT_ACCOUNT ? it : it.skip);

liveComposioDescribe('hubspot — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: HUBSPOT_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  gated()(
    'lists owners and the owner + pipeline pickers resolve',
    async () => {
      const out = await listOwners.execute({ auth, http, props: {} });
      expect(Array.isArray(out.owners)).toBe(true);
      assertNoVendorStrings(out);
      const ownerPicker = await createContact.loadOptions('ownerId', { auth, http });
      expect(ownerPicker.disabled).toBe(false);
      const pipelinePicker = await createDeal.loadOptions('pipeline', { auth, http });
      expect(pipelinePicker.disabled).toBe(false);
      console.log(`live: hubspot → ${out.count} owner(s), ${pipelinePicker.options.length} deal pipeline(s)`);
    },
    30_000,
  );
});
