import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createTask } from './tasks';
import { listSpaces, listTeams } from './common';

/**
 * LIVE smoke tests for ClickUp via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * CLICKUP_CONNECTED_ACCOUNT_ID — there is NO ClickUp connection on the shared
 * account yet, so this self-skips (verification queue: clickup = PENDING).
 * Read-only.
 */
const CLICKUP_ACCOUNT = process.env.CLICKUP_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (CLICKUP_ACCOUNT ? it : it.skip);

liveComposioDescribe('clickup — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: CLICKUP_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  gated()(
    'teams + spaces load, and the list picker resolves via the hierarchy walk',
    async () => {
      const teams = await listTeams(http, auth);
      expect(teams.length).toBeGreaterThan(0);
      const spaces = await listSpaces(http, auth);
      expect(Array.isArray(spaces)).toBe(true);
      assertNoVendorStrings({ teams, spaces });
      const picker = await createTask.loadOptions('listId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(
        `live: clickup → ${teams.length} team(s), ${spaces.length} space(s), ${picker.options.length} list(s)`,
      );
    },
    45_000,
  );
});
