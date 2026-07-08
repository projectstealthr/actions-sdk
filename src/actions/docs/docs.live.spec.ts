import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { appendText, createDocument, readDocument } from './documents';

/**
 * LIVE smoke tests for Google Docs via the Composio managed proxy. Self-contained:
 * creates a throwaway doc, appends text, reads it back. Gated behind ORCHESTR_LIVE
 * + COMPOSIO_API_KEY; self-skips otherwise.
 */
const DOCS_ACCOUNT = process.env.GOOGLEDOCS_CONNECTED_ACCOUNT_ID ?? 'ca_0gKJcMiZ6nEm';

liveComposioDescribe('docs — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: DOCS_ACCOUNT,
      schemeType: 'oauth2',
    });
  });

  it('creates → appends → reads a throwaway document', async () => {
    const created = await createDocument.execute({
      auth,
      http,
      props: { title: `orchestr-sdk-live ${new Date().toISOString()}` },
    });
    expect(typeof created.documentId).toBe('string');
    console.log(`live: docs.create_document → ${created.documentId}`);

    await appendText.execute({
      auth,
      http,
      props: { documentId: created.documentId, text: 'Hello Orchestr.' },
    });

    const read = await readDocument.execute({ auth, http, props: { documentId: created.documentId } });
    expect(read.text).toContain('Hello Orchestr.');
    expect(JSON.stringify(read).toLowerCase()).not.toContain('composio');
    console.log(`live: docs.read_document → "${read.text.trim()}"`);
  }, 60_000);
});
