import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createIssue, getIssue } from './issues';
import { listTeams } from './teams';
import { linearGraphql, listLinearTeams } from './common';

/**
 * LIVE smoke tests for Linear (GraphQL) via the Composio managed proxy. Gated
 * behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * LINEAR_CONNECTED_ACCOUNT_ID — there is NO Linear connection on the shared
 * account yet, so this self-skips (verification queue: linear = PENDING).
 *
 * The read path (teams + the team picker) is benign. The create→get→archive
 * round-trip is a real WRITE on a throwaway issue in the first team, gated behind
 * LINEAR_LIVE_WRITE=1 and always cleaned up. Linear ships no authored archive/delete
 * action, so cleanup is a GraphQL teardown (the `issueArchive` mutation, a
 * recoverable soft-archive) of the exact issue created.
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

  const maybeWrite = LINEAR_ACCOUNT && process.env.LINEAR_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create_issue → get_issue → archive (GraphQL teardown; no authored archive)',
    async () => {
      const teams = await listLinearTeams(http, auth);
      const teamId = teams[0]?.id;
      if (!teamId) {
        console.log('live: linear — account has no team; skipping write cycle');
        return;
      }
      const created = await createIssue.execute({
        auth,
        http,
        props: { teamId, title: `Orchestr SDK live ${new Date().toISOString()}` },
      });
      expect(created.success).toBe(true);
      const issueId = created.issue.id;
      try {
        const fetched = await getIssue.execute({ auth, http, props: { issueId } });
        expect(fetched.id).toBe(issueId);
      } finally {
        await linearGraphql<{ issueArchive: { success: boolean } }>(
          http,
          auth,
          'mutation IssueArchive($id: String!) { issueArchive(id: $id) { success } }',
          { id: issueId },
        );
      }
      console.log(`live: linear create→get→archive ${created.issue.identifier}`);
    },
    60_000,
  );
});
