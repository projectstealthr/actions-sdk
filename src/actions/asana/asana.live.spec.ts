import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listTasks } from './tasks';
import { listProjects, listWorkspaces } from './common';

/**
 * LIVE smoke tests for Asana via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * ASANA_CONNECTED_ACCOUNT_ID — there is NO Asana connection on the shared account
 * yet, so this self-skips (verification queue: asana = PENDING). Read-only.
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
      const workspaces = await listWorkspaces(http, auth);
      expect(Array.isArray(workspaces)).toBe(true);
      const projects = await listProjects(http, auth);
      expect(Array.isArray(projects)).toBe(true);
      assertNoVendorStrings({ workspaces, projects });
      const picker = await listTasks.loadOptions('project', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: asana → ${workspaces.length} workspace(s), ${projects.length} project(s)`);
    },
    30_000,
  );
});
