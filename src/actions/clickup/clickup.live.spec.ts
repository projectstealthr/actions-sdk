import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createTask, getTask } from './tasks';
import { CLICKUP_API_BASE, listAllLists, listSpaces, listTeams } from './common';

/**
 * LIVE smoke tests for ClickUp via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * CLICKUP_CONNECTED_ACCOUNT_ID — there is NO ClickUp connection on the shared
 * account yet, so this self-skips (verification queue: clickup = PENDING).
 *
 * The read path (teams/spaces + the list picker) is benign. The create→get→delete
 * round-trip is a real WRITE on a throwaway task, gated behind CLICKUP_LIVE_WRITE=1
 * and always cleaned up. The task lands in the first list the hierarchy walk finds
 * (override with CLICKUP_LIST_ID). ClickUp ships no authored delete action, so
 * cleanup is a REST teardown (`DELETE /task/{id}`) of the exact task created.
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

  const maybeWrite = CLICKUP_ACCOUNT && process.env.CLICKUP_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create_task → get_task → delete (REST teardown; no authored delete)',
    async () => {
      const listId = process.env.CLICKUP_LIST_ID ?? (await listAllLists(http, auth))[0]?.id;
      if (!listId) {
        console.log('live: clickup — account has no list; skipping write cycle');
        return;
      }
      const created = await createTask.execute({
        auth,
        http,
        props: { listId, name: `Orchestr SDK live ${new Date().toISOString()}` },
      });
      const taskId = created.id;
      expect(typeof taskId).toBe('string');
      try {
        const fetched = await getTask.execute({ auth, http, props: { taskId } });
        expect(fetched.id).toBe(taskId);
      } finally {
        await http.delete(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}`, { auth });
      }
      console.log(`live: clickup create→get→delete ${taskId}`);
    },
    60_000,
  );
});
