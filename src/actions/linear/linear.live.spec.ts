import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createIssue } from './issues';
import { listTeams } from './teams';

/**
 * LIVE smoke tests for Linear (GraphQL) via the Composio managed proxy. Gated
 * behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * LINEAR_CONNECTED_ACCOUNT_ID — there is NO Linear connection on the shared
 * account yet, so this self-skips (verification queue: linear = PENDING).
 * Read-only: it lists teams and resolves the live team picker.
 */
const LINEAR_ACCOUNT = process.env.LINEAR_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (LINEAR_ACCOUNT ? it : it.skip);

liveComposioDescribe('linear — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: LINEAR_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  gated()(
    'lists teams and the team picker resolves',
    async () => {
      const out = await listTeams.execute({ auth, http, props: {} });
      expect(Array.isArray(out.teams)).toBe(true);
      assertNoVendorStrings(out);
      const picker = await createIssue.loadOptions('teamId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: linear → ${out.count} team(s), picker ${picker.options.length} option(s)`);
    },
    30_000,
  );
});
