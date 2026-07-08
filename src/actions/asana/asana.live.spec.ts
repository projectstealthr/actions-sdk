import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createTask, getTask, listTasks } from './tasks';
import { ASANA_API_BASE, listAsanaProjects, listAsanaWorkspaces } from './common';

/**
 * LIVE smoke tests for Asana via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * ASANA_CONNECTED_ACCOUNT_ID — there is NO Asana connection on the shared account
 * yet, so this self-skips (verification queue: asana = PENDING).
 *
 * The read path (workspaces/projects + the project picker) is benign. The
 * create→get→delete round-trip is a real WRITE on a throwaway task, gated behind
 * ASANA_LIVE_WRITE=1 and always cleaned up. Asana ships no authored delete action,
 * so cleanup is a REST teardown (`DELETE /tasks/{gid}`) of the exact task the spec
 * just created — safe by construction and keeping the sandbox tidy for re-runs.
 */
const ASANA_ACCOUNT = process.env.ASANA_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (ASANA_ACCOUNT ? it : it.skip);

liveComposioDescribe('asana — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: ASANA_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  gated()(
    'workspaces + projects load, and the project picker resolves',
    async () => {
      const workspaces = await listAsanaWorkspaces(http, auth);
      expect(Array.isArray(workspaces)).toBe(true);
      const projects = await listAsanaProjects(http, auth);
      expect(Array.isArray(projects)).toBe(true);
      assertNoVendorStrings({ workspaces, projects });
      const picker = await listTasks.loadOptions('project', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: asana → ${workspaces.length} workspace(s), ${projects.length} project(s)`);
    },
    30_000,
  );

  const maybeWrite = ASANA_ACCOUNT && process.env.ASANA_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create_task → get_task → delete (REST teardown; no authored delete)',
    async () => {
      const workspaces = await listAsanaWorkspaces(http, auth);
      const workspace = workspaces[0]?.gid;
      if (!workspace) {
        console.log('live: asana — account has no workspace; skipping write cycle');
        return;
      }
      const created = await createTask.execute({
        auth,
        http,
        props: { name: `Orchestr SDK live ${new Date().toISOString()}`, workspace },
      });
      const taskId = created.gid;
      expect(typeof taskId).toBe('string');
      try {
        const fetched = await getTask.execute({ auth, http, props: { taskId } });
        expect(fetched.gid).toBe(taskId);
      } finally {
        await http.delete(`${ASANA_API_BASE}/tasks/${encodeURIComponent(taskId)}`, { auth });
      }
      console.log(`live: asana create→get→delete ${taskId}`);
    },
    60_000,
  );
});
