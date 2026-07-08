import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { resolveJiraBase } from './common';
import { createIssue, getIssue, searchIssues } from './issues';

/**
 * LIVE smoke tests for Jira Cloud via the Composio managed proxy (3LO OAuth).
 *
 * On the managed rail the site is NOT supplied: `resolveJiraBase` discovers the
 * `cloudId` from the token (`accessible-resources`) and routes through the gateway
 * `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3`. So JIRA_INSTANCE_URL is
 * optional here — it only matters on the direct/BYO rail, where the base falls back
 * to the site URL. Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally
 * JIRA_CONNECTED_ACCOUNT_ID; self-skips when any is absent.
 *
 * Required env:
 *   JIRA_CONNECTED_ACCOUNT_ID   ca_… for the connected Jira account
 * Optional:
 *   JIRA_INSTANCE_URL           https://<site>.atlassian.net — direct/BYO only; on
 *                               managed it just disambiguates which site to pick.
 * WRITE cycle (opt-in), any of:
 *   JIRA_LIVE_WRITE=1           run the write cycle, auto-discovering a project
 *   JIRA_PROJECT_KEY            e.g. ENG — pin the throwaway issue's project
 *   JIRA_ISSUE_TYPE             optional; defaults to "Task"
 *
 * READ smoke: `search_issues` with a BOUNDED JQL (`/search/jql` rejects an
 * unbounded query with 400). WRITE cycle: `create_issue` → `get_issue`. Jira ships
 * NO authored delete, and deleting an issue needs elevated project permission, so
 * the throwaway issue is LEFT in the project (per the batch guard-rail) and its key
 * is logged — remove it from the sandbox by hand.
 */
const JIRA_ACCOUNT = process.env.JIRA_CONNECTED_ACCOUNT_ID;
const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const canRead = Boolean(JIRA_ACCOUNT);
// Bounded JQL — `/search/jql` 400s an unbounded query; the bound is the caller's job.
const BOUNDED_JQL = 'created >= "2000-01-01" ORDER BY created DESC';

/** A project reference from `GET /rest/api/3/project/search`. */
interface ProjectSearchPage {
  values?: Array<{ key?: string }>;
}

/** Discover a writable project key live (first project the token can see). */
async function discoverProjectKey(http: HttpClient, auth: AuthHandle): Promise<string | undefined> {
  const base = await resolveJiraBase(http, auth, JIRA_INSTANCE_URL);
  const res = await http.get<ProjectSearchPage>(`${base}/project/search`, {
    auth,
    query: { maxResults: 1 },
  });
  return res.data.values?.[0]?.key;
}

liveComposioDescribe('jira — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: JIRA_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = canRead ? it : it.skip;

  gated(
    'searches issues on the connected site (bounded JQL, cloudId from the token)',
    async () => {
      const out = await searchIssues.execute({
        auth,
        http,
        // No instanceUrl — the managed rail resolves the site from the OAuth token.
        props: { jql: BOUNDED_JQL, maxResults: 1 },
      });
      expect(Array.isArray(out.issues)).toBe(true);
      expect(typeof out.count).toBe('number');
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      console.log(`live: jira.search_issues → ${out.count} issue(s) via api.atlassian.com gateway`);
    },
    30_000,
  );

  const writeEnabled =
    canRead && (process.env.JIRA_LIVE_WRITE === '1' || Boolean(process.env.JIRA_PROJECT_KEY));
  const maybeWrite = writeEnabled ? it : it.skip;
  maybeWrite(
    'create_issue → get_issue (project discovered live; issue is LEFT — no authored delete)',
    async () => {
      const project = process.env.JIRA_PROJECT_KEY ?? (await discoverProjectKey(http, auth));
      if (!project) {
        console.log('live: jira write skipped — no writable project found via /project/search');
        return;
      }
      const issueType = process.env.JIRA_ISSUE_TYPE ?? 'Task';
      const created = await createIssue.execute({
        auth,
        http,
        props: { project, issueType, summary: `Orchestr SDK live ${new Date().toISOString()}` },
      });
      expect(typeof created.key).toBe('string');

      const fetched = await getIssue.execute({
        auth,
        http,
        props: { issueIdOrKey: created.key },
      });
      expect(fetched.key).toBe(created.key);
      console.log(
        `live: jira.create_issue → ${created.key} (LEFT in ${project}; no authored delete — clean up by hand)`,
      );
    },
    45_000,
  );
});
