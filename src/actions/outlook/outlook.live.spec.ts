import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listFolders } from './folders';
import { getMessage, listMessages, sendEmail } from './messages';

/**
 * LIVE smoke tests for Outlook (Microsoft Graph) via the Composio managed proxy —
 * the run that also confirms the Graph bearer-over-proxy auth-shape assumption
 * end-to-end (see common.ts). Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and
 * additionally requires a connected account id (OUTLOOK_CONNECTED_ACCOUNT_ID) —
 * there is NO Outlook connection on the shared account yet, so this self-skips
 * until one is created (verification queue: outlook = PENDING).
 *
 * Reads (list_folders/list_messages/get_message) are benign. The send is a real
 * WRITE, gated behind OUTLOOK_LIVE_SEND=1, and targets the owner's own address.
 */
const OUTLOOK_ACCOUNT = process.env.OUTLOOK_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('outlook — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: OUTLOOK_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = OUTLOOK_ACCOUNT ? it : it.skip;

  gated(
    'lists folders and messages, then reads the first message',
    async () => {
      const folders = await listFolders.execute({ auth, http, props: { limit: 10 } });
      expect(Array.isArray(folders.folders)).toBe(true);
      expect(JSON.stringify(folders).toLowerCase()).not.toContain('composio');

      const messages = await listMessages.execute({ auth, http, props: { limit: 3 } });
      expect(Array.isArray(messages.messages)).toBe(true);
      const messageId = messages.messages[0]?.id;
      if (messageId) {
        const msg = await getMessage.execute({ auth, http, props: { messageId } });
        expect(msg.id).toBe(messageId);
      }
      console.log(`live: outlook.list_folders → ${folders.count}; list_messages → ${messages.count}`);
    },
    45_000,
  );

  const maybeSend =
    OUTLOOK_ACCOUNT && process.env.OUTLOOK_LIVE_SEND === '1' && process.env.OUTLOOK_TEST_ADDRESS
      ? it
      : it.skip;
  maybeSend(
    'sends a benign email to the owner’s own address',
    async () => {
      const to = process.env.OUTLOOK_TEST_ADDRESS as string;
      const out = await sendEmail.execute({
        auth,
        http,
        props: { to, subject: `Orchestr SDK live ${new Date().toISOString()}`, body: 'Benign smoke test.' },
      });
      expect(out).toEqual({ sent: true });
      console.log(`live: outlook.send_email → delivered to ${to}`);
    },
    45_000,
  );
});
