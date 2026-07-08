import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getDatabase, search } from './databases';
import { createPage, getPage, updatePage } from './pages';

/**
 * LIVE smoke tests for Notion via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * NOTION_CONNECTED_ACCOUNT_ID — there is NO Notion connection on the shared
 * account yet, so this self-skips (verification queue: notion = PENDING).
 *
 * The read path (database search + the database picker) is benign. The
 * create→get→archive round-trip is a real WRITE gated behind a provided database:
 * set NOTION_DATABASE_ID to a database the integration can write to. The authored
 * `create_page` creates a page as a *database row* (its parent is a database, not a
 * page — hence a database id, not the guard-rail's page id), so the spec reads the
 * database's title-property name via `get_database`, creates a row, gets it, then
 * ARCHIVES it via the authored `update_page` (archived → trash). Fully self-cleaning
 * with authored actions only.
 */
const NOTION_ACCOUNT = process.env.NOTION_CONNECTED_ACCOUNT_ID;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const gated = (): jest.It => (NOTION_ACCOUNT ? it : it.skip);

liveComposioDescribe('notion — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: NOTION_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  gated()(
    'searches databases and the database picker resolves',
    async () => {
      const out = await search.execute({ auth, http, props: { filter: 'database' } });
      expect(Array.isArray(out.results)).toBe(true);
      assertNoVendorStrings(out);
      const picker = await getDatabase.loadOptions('databaseId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(
        `live: notion → ${out.results.length} database(s), picker ${picker.options.length} option(s)`,
      );
    },
    30_000,
  );

  const maybeWrite = NOTION_ACCOUNT && NOTION_DATABASE_ID ? it : it.skip;
  maybeWrite(
    'create_page (database row) → get_page → archive (authored update_page)',
    async () => {
      const databaseId = NOTION_DATABASE_ID as string;
      const db = await getDatabase.execute({ auth, http, props: { databaseId } });
      const schema = (db.properties ?? {}) as unknown as Record<string, { type?: string }>;
      const titleKey = Object.keys(schema).find((key) => schema[key]?.type === 'title');
      if (!titleKey) {
        console.log('live: notion — database has no title property; skipping write cycle');
        return;
      }
      const created = await createPage.execute({
        auth,
        http,
        props: {
          databaseId,
          properties: {
            [titleKey]: { title: [{ text: { content: `Orchestr SDK live ${new Date().toISOString()}` } }] },
          },
        },
      });
      const pageId = created.id;
      expect(typeof pageId).toBe('string');
      try {
        const fetched = await getPage.execute({ auth, http, props: { pageId } });
        expect(fetched.id).toBe(pageId);
      } finally {
        const archived = await updatePage.execute({ auth, http, props: { pageId, archived: 'true' } });
        expect(archived.archived).toBe(true);
      }
      console.log(`live: notion create→get→archive ${pageId}`);
    },
    60_000,
  );
});
