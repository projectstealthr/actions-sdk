import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getTasks } from './tasks';
import { listProjects } from './common';

/**
 * LIVE smoke tests for Todoist via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * TODOIST_CONNECTED_ACCOUNT_ID — there is NO Todoist connection on the shared
 * account yet, so this self-skips (verification queue: todoist = PENDING).
 * Read-only.
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
    expect(serialised).not.toContain('activepieces');
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
});
