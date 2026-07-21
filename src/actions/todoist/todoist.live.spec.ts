import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createTask, getTasks } from './tasks';
import { listProjects, TODOIST_API_BASE } from './common';

/**
 * LIVE smoke tests for Todoist via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * TODOIST_CONNECTED_ACCOUNT_ID — there is NO Todoist connection on the shared
 * account yet, so this self-skips (verification queue: todoist = PENDING).
 *
 * The read path (projects/tasks + the project picker) is benign. The
 * create→read-back→delete round-trip is a real WRITE on a throwaway inbox task,
 * gated behind TODOIST_LIVE_WRITE=1 and always cleaned up. Todoist's authored
 * destructive verb is `mark_task_completed` (close), which leaves a completed task
 * rather than removing it, so cleanup is a REST teardown (`DELETE /tasks/{id}`) of
 * the exact task created, keeping re-runs idempotent.
 */
const TODOIST_ACCOUNT = process.env.TODOIST_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (TODOIST_ACCOUNT ? it : it.skip);

liveComposioDescribe('todoist — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: TODOIST_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  gated()(
    'projects + tasks load, and the project picker resolves',
    async () => {
      const projects = await listProjects(http, auth);
      expect(Array.isArray(projects)).toBe(true);
      const out = await getTasks.execute({ auth, http, props: {} });
      expect(Array.isArray(out.tasks)).toBe(true);
      assertNoVendorStrings({ projects, tasks: out.tasks });
      const picker = await getTasks.loadOptions('project', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: todoist → ${projects.length} project(s), ${out.count} task(s)`);
    },
    30_000,
  );

  const maybeWrite = TODOIST_ACCOUNT && process.env.TODOIST_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create_task → find_task (read-back) → delete (REST teardown)',
    async () => {
      const created = await createTask.execute({
        auth,
        http,
        props: { content: `Orchestr SDK live ${new Date().toISOString()}` },
      });
      const taskId = created.id;
      expect(typeof taskId).toBe('string');
      try {
        const found = await getTasks.execute({ auth, http, props: {} });
        expect(found.tasks.some((task) => task.id === taskId)).toBe(true);
      } finally {
        await http.delete(`${TODOIST_API_BASE}/tasks/${encodeURIComponent(taskId)}`, { auth });
      }
      console.log(`live: todoist create→find→delete ${taskId}`);
    },
    60_000,
  );
});
