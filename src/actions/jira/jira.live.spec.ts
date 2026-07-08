import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createIssue, getIssue, searchIssues } from './issues';

/**
 * LIVE smoke tests for Jira Cloud via the Composio managed proxy. Jira is
 * instance-scoped, so every call is rooted at the connected site — a `instanceUrl`
 * prop the opaque auth handle can't carry. Gated behind ORCHESTR_LIVE +
 * COMPOSIO_API_KEY, and additionally requires JIRA_CONNECTED_ACCOUNT_ID AND
 * JIRA_INSTANCE_URL; self-skips when any is absent (verification queue: jira).
 *
 * Required env:
 *   JIRA_CONNECTED_ACCOUNT_ID   ca_… for the connected Jira account
 *   JIRA_INSTANCE_URL           https://<site>.atlassian.net (the direct/BYO rail
 *                               roots calls here; the managed proxy forwards the URL)
 * WRITE cycle (opt-in), additionally:
 *   JIRA_LIVE_WRITE=1
 *   JIRA_PROJECT_KEY            e.g. ENG — the throwaway issue's project
 *   JIRA_ISSUE_TYPE             optional; defaults to "Task"
 *
 * READ smoke: `search_issues` with a benign JQL (`ORDER BY created DESC`, 1 result).
 * WRITE cycle: `create_issue` → `get_issue`. Jira ships NO authored delete action,
 * and deleting an issue needs elevated project permission, so the throwaway issue
 * is LEFT in the project (per the batch guard-rail) and its key is logged — remove
 * it from the sandbox by hand. No email/side effect beyond the issue itself.
 */
const JIRA_ACCOUNT = process.env.JIRA_CONNECTED_ACCOUNT_ID;
const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const canRead = Boolean(JIRA_ACCOUNT && JIRA_INSTANCE_URL);
const instanceUrl = JIRA_INSTANCE_URL ?? 'https://missing.atlassian.net';

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
    'searches issues on the connected site (benign JQL)',
    async () => {
      const out = await searchIssues.execute({
        auth,
        http,
        props: { instanceUrl, jql: 'ORDER BY created DESC', maxResults: 1 },
      });
      expect(Array.isArray(out.issues)).toBe(true);
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      console.log(`live: jira.search_issues → ${out.issues.length} issue(s)`);
    },
    30_000,
  );

  const maybeWrite =
    canRead && process.env.JIRA_LIVE_WRITE === '1' && process.env.JIRA_PROJECT_KEY ? it : it.skip;
  maybeWrite(
    'create_issue → get_issue (throwaway issue is LEFT — no authored delete)',
    async () => {
      const project = process.env.JIRA_PROJECT_KEY as string;
      const issueType = process.env.JIRA_ISSUE_TYPE ?? 'Task';
      const created = await createIssue.execute({
        auth,
        http,
        props: { instanceUrl, project, issueType, summary: `Orchestr SDK live ${new Date().toISOString()}` },
      });
      expect(typeof created.key).toBe('string');

      const fetched = await getIssue.execute({
        auth,
        http,
        props: { instanceUrl, issueIdOrKey: created.key },
      });
      expect(fetched.key).toBe(created.key);
      console.log(
        `live: jira.create_issue → ${created.key} (LEFT in ${project}; no authored delete — clean up by hand)`,
      );
    },
    45_000,
  );
});
