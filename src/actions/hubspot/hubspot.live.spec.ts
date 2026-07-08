import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createContact, getContact } from './contacts';
import { createDeal } from './deals';
import { listOwners } from './owners';
import { HUBSPOT_API_BASE } from './common';

/**
 * LIVE smoke tests for HubSpot via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * HUBSPOT_CONNECTED_ACCOUNT_ID — there is NO HubSpot connection on the shared
 * account yet, so this self-skips (verification queue: hubspot = PENDING).
 *
 * The read path (owners + owner/pipeline pickers) is benign. The create→get→delete
 * round-trip is a real WRITE on a throwaway contact (a unique example.com email),
 * gated behind HUBSPOT_LIVE_WRITE=1 and always cleaned up. HubSpot ships no
 * authored delete action, so cleanup is a REST teardown (`DELETE
 * /crm/v3/objects/contacts/{id}`, which archives to the recycling bin) of the exact
 * contact created.
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

  const maybeWrite = HUBSPOT_ACCOUNT && process.env.HUBSPOT_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create_contact → get_contact → delete (REST teardown; no authored delete)',
    async () => {
      const email = `orchestr-sdk-live-${Date.now()}@example.com`;
      const created = await createContact.execute({
        auth,
        http,
        props: { email, firstname: 'Orchestr', lastname: 'SDK Live' },
      });
      const contactId = created.id;
      expect(typeof contactId).toBe('string');
      try {
        const fetched = await getContact.execute({ auth, http, props: { contactId } });
        expect(fetched.id).toBe(contactId);
      } finally {
        await http.delete(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
          auth,
        });
      }
      console.log(`live: hubspot create→get→delete ${contactId}`);
    },
    60_000,
  );
});
