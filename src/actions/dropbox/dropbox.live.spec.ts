import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { DROPBOX_API_BASE } from './common';
import { createFolder, getFileMetadata, listFolder, search } from './files';

/**
 * LIVE smoke tests for Dropbox via the Composio managed proxy. All actions ride
 * the JSON-RPC host (`api.dropboxapi.com`), so they stay on the managed rail —
 * binary upload/download is intentionally out of scope (see common.ts).
 *
 * Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires a
 * connected account id (DROPBOX_CONNECTED_ACCOUNT_ID) — there is NO Dropbox
 * connection on the shared account yet, so this self-skips until one is created
 * (verification queue: dropbox = PENDING).
 *
 * The read path (list_folder/search/get_metadata) is benign. The
 * create→get→delete round-trip is a real WRITE on a throwaway folder, gated behind
 * DROPBOX_LIVE_WRITE=1 and always cleaned up. Dropbox ships no authored delete
 * action (metadata-only surface, no binary), so cleanup is a REST teardown
 * (`/files/delete_v2`) of the exact folder created, keeping re-runs idempotent.
 */
const DROPBOX_ACCOUNT = process.env.DROPBOX_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('dropbox — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: DROPBOX_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = DROPBOX_ACCOUNT ? it : it.skip;

  gated(
    'lists the root folder',
    async () => {
      const out = await listFolder.execute({ auth, http, props: { limit: 5 } });
      expect(Array.isArray(out.entries)).toBe(true);
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      console.log(`live: dropbox.list_dropbox_folder → ${out.count} entry(ies)`);
    },
    30_000,
  );

  gated(
    'searches the account',
    async () => {
      const out = await search.execute({ auth, http, props: { query: 'a', max: 3 } });
      expect(Array.isArray(out.entries)).toBe(true);
      console.log(`live: dropbox.search_dropbox → ${out.count} match(es)`);
    },
    30_000,
  );

  const maybeWrite = DROPBOX_ACCOUNT && process.env.DROPBOX_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'creates a throwaway folder, gets its metadata, then deletes it (REST teardown)',
    async () => {
      const path = `/orchestr-sdk-live-${Date.now()}`;
      const folder = await createFolder.execute({ auth, http, props: { path } });
      expect(folder['.tag']).toBe('folder');
      try {
        const meta = await getFileMetadata.execute({ auth, http, props: { path } });
        expect(meta.name).toBe(folder.name);
      } finally {
        await http.post(`${DROPBOX_API_BASE}/files/delete_v2`, { auth, body: { path } });
      }
      console.log(`live: dropbox create→get→delete ${folder.path_display ?? path}`);
    },
    60_000,
  );
});
