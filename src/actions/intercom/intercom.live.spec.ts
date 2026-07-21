import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createContact, listContacts } from './contacts';
import { listAdmins } from './other';

/**
 * LIVE smoke tests for Intercom via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * INTERCOM_CONNECTED_ACCOUNT_ID; self-skips otherwise (verification queue: intercom).
 *
 * Required env:
 *   INTERCOM_CONNECTED_ACCOUNT_ID   ca_… for the connected Intercom account
 *
 * READ-ONLY. `create_contact` is authored and works, but Intercom's archive/delete
 * is NOT an authored action, so a created contact couldn't be cleaned up via the
 * authored surface — per the batch guard-rail (reversible-or-read-only) this stays
 * read-only to leave the sandbox tidy. Reads: admins, contacts, and the live
 * owner/admin picker on `create_contact`.
 */
const INTERCOM_ACCOUNT = process.env.INTERCOM_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('intercom — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: INTERCOM_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  const gated = INTERCOM_ACCOUNT ? it : it.skip;

  gated(
    'list_admins + list_contacts + admin picker (read-only)',
    async () => {
      const admins = await listAdmins.execute({ auth, http, props: {} });
      expect(Array.isArray(admins.admins)).toBe(true);
      assertNoVendorStrings(admins);

      const contacts = await listContacts.execute({ auth, http, props: { limit: 3 } });
      expect(Array.isArray(contacts.contacts)).toBe(true);

      const picker = await createContact.loadOptions('ownerId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: intercom → ${admins.count} admin(s), ${contacts.count} contact(s)`);
    },
    30_000,
  );
});
