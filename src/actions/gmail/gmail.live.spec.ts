import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listLabels } from './labels';
import { findEmail, getProfile, listMessages, sendEmail } from './messages';

/**
 * LIVE smoke tests for Gmail via the Composio managed proxy. Gmail is a connected
 * account on the shared Composio account, so these run against a real mailbox and
 * return real data (design §7). Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY;
 * self-skips otherwise. Read-only — no email is sent.
 */
const GMAIL_ACCOUNT = process.env.GMAIL_CONNECTED_ACCOUNT_ID ?? 'ca_p-UFh0PsCUvv';

liveComposioDescribe('gmail — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: GMAIL_ACCOUNT,
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  it('get_profile returns the real mailbox profile', async () => {
    const out = await getProfile.execute({ auth, http, props: {} });
    expect(typeof out.emailAddress).toBe('string');
    expect(out.emailAddress).toContain('@');
    expect(typeof out.messagesTotal).toBe('number');
    console.log(`live: gmail.get_profile → ${out.emailAddress} (${out.messagesTotal} messages)`);
  }, 30_000);

  it('list_labels returns real labels and the picker loads them', async () => {
    const out = await listLabels.execute({ auth, http, props: {} });
    expect(out.count).toBeGreaterThan(0);
    expect(out.labels[0]).toHaveProperty('id');
    expect(out.labels[0]).toHaveProperty('name');
    assertNoVendorStrings(out);

    const picker = await listMessages.loadOptions('labelIds', { auth, http });
    expect(picker.disabled).toBe(false);
    expect(picker.options.length).toBeGreaterThan(0);
    console.log(`live: gmail.list_labels → ${out.count} label(s), e.g. ${out.labels[0]?.name}`);
  }, 30_000);

  it('list_messages returns real message ids', async () => {
    const out = await listMessages.execute({ auth, http, props: { limit: 3 } });
    expect(Array.isArray(out.messages)).toBe(true);
    for (const message of out.messages) {
      expect(typeof message.id).toBe('string');
      expect(typeof message.threadId).toBe('string');
    }
    console.log(`live: gmail.list_messages → ${out.count} message id(s)`);
  }, 30_000);

  it('find (gmail_search_mail) composes filters into a real search', async () => {
    const out = await findEmail.execute({ auth, http, props: { query: 'newer_than:5y', max: 2 } });
    expect(Array.isArray(out.messages)).toBe(true);
    expect(out.query).toBe('newer_than:5y');
    console.log(`live: gmail.gmail_search_mail → ${out.count} match(es) for "${out.query}"`);
  }, 30_000);

  // A real write — sends a benign mail to the mailbox's OWN address. Off by
  // default (adds a message to the inbox); opt in with GMAIL_LIVE_SEND=1.
  const maybeSend = process.env.GMAIL_LIVE_SEND === '1' ? it : it.skip;
  maybeSend(
    'send_email delivers a benign mail to the owner’s own address',
    async () => {
      const profile = await getProfile.execute({ auth, http, props: {} });
      const out = await sendEmail.execute({
        auth,
        http,
        props: {
          to: profile.emailAddress,
          subject: `Orchestr SDK live send ${new Date().toISOString()}`,
          body: 'Benign live-verification message from the Orchestr Action SDK.',
        },
      });
      expect(typeof out.id).toBe('string');
      console.log(`live: gmail.send_email → message ${out.id} to ${profile.emailAddress}`);
    },
    30_000,
  );
});
