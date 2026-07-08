import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createFolder, getFile, listFiles } from './files';

/**
 * LIVE smoke tests for Google Drive via the Composio managed proxy. Self-contained:
 * lists files, creates a throwaway folder, gets it back by id. JSON-metadata only
 * (binary content can't ride the managed rail — see common.ts). Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY; self-skips otherwise.
 */
const DRIVE_ACCOUNT = process.env.GOOGLEDRIVE_CONNECTED_ACCOUNT_ID ?? 'ca_-fITpAJbTmTT';

liveComposioDescribe('drive — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: DRIVE_ACCOUNT,
      schemeType: 'oauth2',
    });
  });

  it('lists the user’s real files', async () => {
    const out = await listFiles.execute({ auth, http, props: { limit: 5 } });
    expect(Array.isArray(out.files)).toBe(true);
    expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
    console.log(`live: drive.list_files → ${out.count} file(s)`);
  }, 30_000);

  it('creates a throwaway folder and gets it back by id', async () => {
    const folder = await createFolder.execute({
      auth,
      http,
      props: { name: `orchestr-sdk-live ${new Date().toISOString()}` },
    });
    expect(folder.mimeType).toBe('application/vnd.google-apps.folder');
    const got = await getFile.execute({ auth, http, props: { fileId: folder.id } });
    expect(got.id).toBe(folder.id);
    console.log(`live: drive.create_folder → ${folder.id}`);
  }, 60_000);
});
