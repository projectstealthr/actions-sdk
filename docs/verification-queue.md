# Verification queue

Turnkey record of every clean-room action authored beyond the reference set, its
verification status, and exactly what a human consent-sprint needs to flip it
from PENDING to VERIFIED. Design law (action-sdk-design §7): **nothing is marked
READY without executing against the live API and returning real data.**

## How to run a smoke (turnkey)

The live harness is proven working (Slack, via the shared Composio account).
`COMPOSIO_API_KEY` lives in `workflow-service/.env`. To smoke an app once its
account is connected in Composio:

```bash
cd actions-sdk
export COMPOSIO_API_KEY="$(grep -E '^COMPOSIO_API_KEY=' ../workflow-service/.env | cut -d= -f2- | tr -d '\"[:space:]')"
export ORCHESTR_LIVE=1
export <APP>_CONNECTED_ACCOUNT_ID="ca_...."   # from the connected-accounts list
npx jest src/actions/<app>/<app>.live.spec.ts
```

Connected accounts already on the shared Composio account (live-verifiable **now**,
no new consent needed): `slack` (×2), `github`, `gmail`, `googlesheets`,
`googledocs`, `googledrive`, `googleslides`. Every scope-1 fallback app below has
**no connection yet** → all PENDING until a human clicks Allow.

## Status legend

- **LIVE-VERIFIED** — executed against the real API, returned real data.
- **PENDING** — authored + offline golden tests green; awaiting a connection.

---

## Framework gap surfaced this run (blocks a class of live pickers)

**Dynamic option loaders cannot see already-set prop values.** `OptionsContext`
is `{ auth, http, search }`; `resolveOptions`/`loadOptions` never pass the values
of other props, and the `refreshers` field declared on `dropdown`/`multiSelect`
schemas is stored but consumed nowhere. Consequences:

1. **Dependent pickers** (refreshers) can't be authored — e.g. Jira issue-type
   *by project*, Airtable table *by base*, Salesforce field *by object*.
2. **Instance-scoped app pickers** can't be authored — Jira/Zendesk/Salesforce
   build their base URL from an `instanceUrl`/`subdomain` **prop**, which the
   loader can't read, so even a flat "list projects" picker is blocked.

Independent pickers (auth + http only, fixed base URL — Slack channels, Linear
teams, Stripe products, …) are unaffected and ship as live loaders.

**Proposed additive fix (non-breaking):** extend `OptionsContext` with
`props?: Record<string, unknown>` (the already-entered prop values), thread it
through `Action.loadOptions(propName, { auth, http, search, props })` and
`resolveOptions`, and have the loader read its refreshers from there. Existing
loaders that ignore it keep working; the Slack picker is unchanged. This also
needs the platform inspector to send current prop values when it calls the
option-load endpoint — a platform-contract dependency, which is why it is
reported rather than changed here. **Pickers waiting on this fix are tagged
`picker-blocked` below.**

---

## Apps

### jira — PENDING (6 actions)

- **Actions:** `create_issue`, `get_issue`, `update_issue`, `search_issues`,
  `add_comment`, `list_comments`.
- **Auth:** HTTP Basic (email + API token). Base URL is per-site → `instanceUrl`
  prop on every action. Token: https://id.atlassian.com/manage-profile/security/api-tokens
- **Offline:** `src/actions/jira/jira.spec.ts` (7 golden cases: ADF shaping,
  project/issue-type refs, JQL body, returnIssue).
- **Smoke (read, benign):** `search_issues` with `jql: "ORDER BY created DESC"`,
  `maxResults: 1` — or `get_issue` on any known key.
- **Connection needed:** Jira (Atlassian) — Composio toolkit `jira`, managed
  OAUTH2. Note: managed Atlassian rewrites the base to
  `api.atlassian.com/ex/jira/<cloudId>`; the direct/BYO rail uses the
  `instanceUrl` prop as authored. Live smoke should target whichever rail the
  connection uses.
- **`picker-blocked`:** project + issue-type pickers (need `instanceUrl` / a
  `projectId` refresher) — authored as text props for now.

### linear — PENDING (6 actions, 2 live pickers)

- **Actions:** `create_issue`, `update_issue`, `get_issue`, `list_issues`,
  `create_comment`, `list_teams`. GraphQL (single endpoint).
- **Auth:** personal API key in the `Authorization` header (no `Bearer`); managed
  OAuth attaches server-side. Base is fixed (`api.linear.app/graphql`).
- **Live pickers (work today):** team picker + assignee picker (both independent
  of other props). `picker-blocked`: state / label / project pickers (team-scoped
  refreshers) — id inputs for now.
- **Offline:** `src/actions/linear/linear.spec.ts` (8 golden cases incl. the
  GraphQL "errors at HTTP 200" path and the team-picker resolver).
- **Smoke (read, benign):** `list_teams` (no props) — also exercises the picker
  resolver. Or `list_issues` with `limit: 1`.
- **Connection needed:** Linear — Composio toolkit `linear`, managed OAUTH2.
