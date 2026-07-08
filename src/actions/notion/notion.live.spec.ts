import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getDatabase, search } from './databases';

/**
 * LIVE smoke tests for Notion via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * NOTION_CONNECTED_ACCOUNT_ID — there is NO Notion connection on the shared
 * account yet, so this self-skips (verification queue: notion = PENDING).
 * Read-only: it searches databases and resolves the live database picker.
 */
const NOTION_ACCOUNT = process.env.NOTION_CONNECTED_ACCOUNT_ID;

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
});
