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
**no connection yet** → all PENDING until a human clicks Allow. The apps added
this run — `googlecalendar` (slug `calendar`), `asana`, `clickup`, `todoist` —
also have **no connection** on the shared account, so all four are **PENDING**
(authored + unit-tested; each carries a turnkey smoke command below). `trello`
was **NOT shipped** — see the framework gap.

## Live-spec matrix (consent sprint) — one command per app

Every app below now ships a `src/actions/<app>/<app>.live.spec.ts` that **self-skips**
when its env is absent (so `pnpm check` stays green with no connections) and **fully
verifies** — READ smoke plus, where a safe reversible write is expressible, a
WRITE → read-back → cleanup cycle — once its sandbox account is connected. Base
command:

```bash
cd actions-sdk
export COMPOSIO_API_KEY="$(grep -E '^COMPOSIO_API_KEY=' ../workflow-service/.env | cut -d= -f2- | tr -d '\"[:space:]')"
export ORCHESTR_LIVE=1
export <APP>_CONNECTED_ACCOUNT_ID="ca_…"          # from the connected-accounts list
# …plus any extra env in the table below to unlock that app's write cycle…
npx jest src/actions/<app>/<app>.live.spec.ts
```

Extra env is `KEY=value` on the same command line. Writes are **opt-in** — the base
command runs READs and self-skips the write until you add the `*_LIVE_WRITE=1` flag
(or the required id) so an accidental run never mutates anything.

| App | Extra env (beyond `<APP>_CONNECTED_ACCOUNT_ID` + Composio) | Write cycle | Cleanup |
|---|---|---|---|
| **jira** | none on managed (cloudId resolved from the token; `JIRA_INSTANCE_URL` is direct/BYO-only); write: `JIRA_LIVE_WRITE=1` (auto-discovers a project via `/project/search`) **or** `JIRA_PROJECT_KEY` (+ opt `JIRA_ISSUE_TYPE`, default Task) | `create_issue` → `get_issue` | **none** — no authored delete + deleting needs elevated perms; issue is **left** and its key logged (guard-rail) |
| **airtable** | write: `AIRTABLE_BASE_ID` + `AIRTABLE_TABLE_ID` (table without required fields) | `create_record` (empty `{}`) → `get_record` → `delete_record` | authored `delete_record` (self-cleaning) |
| **salesforce** | `SALESFORCE_INSTANCE_URL` (req, read+write; opt `SALESFORCE_API_VERSION`); write: `SALESFORCE_LIVE_WRITE=1` | create `Contact` (LastName only) → `get_record` → `delete_record` | authored `delete_record` (self-cleaning) |
| **calendly** | — | **read-only** (only write is `cancel` — destructive/irreversible; no create verb) | n/a |
| **intercom** | — | **read-only** (`create_contact` works, but no authored archive/delete → can't clean up) | n/a |
| **mailchimp** | `MAILCHIMP_SERVER_PREFIX` (req, e.g. us19) | **read-only** (`add_member` works, but no authored delete) | n/a |
| **zendesk** | `ZENDESK_SUBDOMAIN` (req) | **read-only** (`create_ticket` works, but no authored delete) | n/a |
| **stripe** | — | **read-only** (writes `form-body-blocked`, framework gap #2) | n/a |
| **asana** | write: `ASANA_LIVE_WRITE=1` | `create_task` (first workspace) → `get_task` | REST teardown `DELETE /tasks/{gid}` (no authored delete) |
| **clickup** | write: `CLICKUP_LIVE_WRITE=1` (opt `CLICKUP_LIST_ID`, else first list found) | `create_task` → `get_task` | REST teardown `DELETE /task/{id}` (no authored delete) |
| **todoist** | write: `TODOIST_LIVE_WRITE=1` | `create_task` (inbox) → `find_task` (read-back) | REST teardown `DELETE /tasks/{id}` (authored close leaves a completed task) |
| **hubspot** | write: `HUBSPOT_LIVE_WRITE=1` | `create_contact` (unique example.com email) → `get_contact` | REST teardown `DELETE …/contacts/{id}` → recycling bin (no authored delete) |
| **linear** | write: `LINEAR_LIVE_WRITE=1` | `create_issue` (first team) → `get_issue` | GraphQL teardown `issueArchive` — recoverable (no authored archive) |
| **notion** | write: `NOTION_DATABASE_ID` (a database the integration can write) | `get_database` (title prop) → `create_page` (row) → `get_page` | authored `update_page` `archived:true` → trash (self-cleaning) |
| **dropbox** | write: `DROPBOX_LIVE_WRITE=1` | `create_new_dropbox_folder` → `get_file_metadata` | REST teardown `/files/delete_v2` (no authored delete; metadata-only, no binary) |
| **calendar** | write: `CALENDAR_LIVE_WRITE=1` (account env is `GOOGLECALENDAR_CONNECTED_ACCOUNT_ID`) | `create` → `update` → `get` → `delete` event on `primary` | authored `delete_event` (self-cleaning) |
| **zoom** | write: `ZOOM_LIVE_WRITE=1` | `create_meeting` → `update` → `get` → `delete` | authored `delete_meeting` (self-cleaning) |
| **outlook** | write: `OUTLOOK_LIVE_SEND=1` + `OUTLOOK_TEST_ADDRESS` (send to SELF) | `send_email` to the owner's own address | n/a — send-to-self; no delete (guard-rail: send/draft only) |
| **typeform** | — | **read-only** (no safe reversible create — a form isn't a throwaway; responses go via the public form) | n/a |
| **gmail** | write: `GMAIL_LIVE_SEND=1` (send to SELF) — already LIVE-VERIFIED | `send_email` to the owner's own address | n/a — send-to-self |

**Teardown note.** Where an app ships no authored delete/archive action, the spec
cleans up the exact resource it just created via a raw REST/GraphQL call on the same
`http` + `auth` handle (documented per app above). This is test teardown of a
throwaway the spec owns — not a new product action (no offline golden test, no
catalog entry) — so the sandbox stays tidy and re-runs are idempotent without
widening the authored surface.

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

### Framework gap #2 — no form-encoded request bodies

The HTTP client + both transports serialise request bodies as **JSON only**
(`JSON.stringify` + `application/json`). Apps whose **writes** require
`application/x-www-form-urlencoded` with bracketed nested params (Stripe:
`address[line1]=…`; some OAuth token endpoints; Twilio) cannot express a write
today. Reads (GET + query params) are unaffected.

**Proposed additive fix:** let an action opt a request into form encoding (e.g.
`http.post(url, { auth, form: {...} })` or a `bodyEncoding: 'form'` option); the
transport bracket-encodes nested objects/arrays and sets the content-type.
Non-breaking — existing JSON callers are unchanged. **Write actions waiting on
this are tagged `form-body-blocked` below.**

### Framework gap #3 — no dual/query-param credential seam (STOPPED Trello)

Trello's REST API authenticates **every** call with TWO query params — an
application `key` and a per-user `token` (`?key=…&token=…`) — and requires **no**
per-request OAuth1 signature (the OAuth1 flow only mints the token; API calls are
plain key+token). The SDK's declarative auth seam can't represent this credential
shape: `ApiKeyScheme(in:'query')` emits a **single** param, and `DirectCredential`
carries a single value (bearer / apiKey) or a user/pass pair (basic) — none is a
clean "two named query params" credential. Consequences:

- **Direct/BYO rail:** cannot attach both `key` and `token` without either abusing
  `basic` (username=key, password=token) inside a `custom` scheme that appends
  them as query params — a misrepresentation of the auth in the connect UI — or
  extending `DirectCredential`. Both are hacks, not shipped.
- **Managed rail:** Composio would inject key+token server-side, but there is **no
  Trello connection** on the shared account, so this is unverifiable now.

**STOPPED and reported per the batch mandate — Trello is NOT shipped this run.**
The precise (non-)finding: it is **not** an OAuth1-*signing* gap (no HMAC needed);
it is a **credential-shape** gap in the auth seam. Proposed additive, non-breaking
fix: add a `DirectCredential` variant (e.g. `{ type: 'queryParams'; params }`) or
let `ApiKeyScheme` carry multiple named params, so a key+token app becomes a
declarative scheme rather than a bespoke signer. The other four apps this run
(calendar, asana, clickup, todoist) are unaffected. **Apps blocked by this gap are
tagged `dual-query-cred-blocked` below.**

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

### jira — VERIFIED live (managed, 2026-07-08) (6 actions)

- **Actions:** `create_issue`, `get_issue`, `update_issue`, `search_issues`,
  `add_comment`, `list_comments`.
- **Base resolution (rail-aware).** `resolveJiraBase` GETs Atlassian's
  `https://api.atlassian.com/oauth/token/accessible-resources` (absolute URL —
  it routes through the managed proxy) before each action:
  - **Managed / 3LO OAuth:** returns `[{ id: <cloudId>, url, name, scopes }]` → base
    is the gateway `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3` (picking
    the site matching `instanceUrl` when given, else the first). An OAuth token
    against the bare site URL 401s — this round-trip is what fixes that.
  - **Direct / BYO (HTTP-Basic):** `accessible-resources` is OAuth-only → 401 →
    falls back to `${instanceUrl}/rest/api/3`. `instanceUrl` is therefore optional
    (required only for a direct/BYO connection; ignored on managed).
- **`search_issues` migrated to `/search/jql`.** The old `GET /rest/api/3/search`
  now 410s. `/search/jql` requires an explicit `fields` param (default
  `summary,status,assignee,created`; overridable) and uses **token pagination**
  (`{ issues, nextPageToken? }`, advance with `?nextPageToken=`). The action walks
  the cursor via the SDK `paginate`, caps at `maxResults`, and returns
  `{ issues, count }`. JQL is passed through verbatim — `/search/jql` 400s an
  UNBOUNDED query, so bounding it is the caller's job.
- **Offline:** `src/actions/jira/jira.spec.ts` (9 golden cases: gateway base on the
  managed rail, direct-rail fallback, ADF shaping, project/issue-type refs, the
  `/search/jql` `nextPageToken` walk + `maxResults` cap, returnIssue).
- **Live (verified 2026-07-08, `ca_HX2FFl11tMVo`, site `orchestrflow.atlassian.net`,
  cloudId `b828af84-c9db-4ac5-bc7d-a07b26422193`):** read smoke `search_issues`
  with a BOUNDED JQL (`created >= "2000-01-01" ORDER BY created DESC`, 1 result) via
  the gateway; write cycle `create_issue` → `get_issue` (project discovered live via
  `GET /rest/api/3/project/search`) created `KAN-4`, left in place. Run:
  ```bash
  export COMPOSIO_API_KEY="$(grep -E '^COMPOSIO_API_KEY=' ../workflow-service/.env | cut -d= -f2- | tr -d '\"[:space:]')"
  ORCHESTR_LIVE=1 JIRA_CONNECTED_ACCOUNT_ID=ca_HX2FFl11tMVo JIRA_LIVE_WRITE=1 \
    npx jest src/actions/jira/jira.live.spec.ts
  ```
  (drop `JIRA_LIVE_WRITE=1` for read-only; on managed no `JIRA_INSTANCE_URL` needed.)
- **`picker-blocked`:** project + issue-type pickers (need a `projectId` refresher) —
  authored as text props for now.

### linear — PENDING (6 actions, 2 live pickers)

- **Actions:** `create_issue`, `update_issue`, `get_issue`, `list_issues`,
  `create_comment`, `list_teams`. GraphQL (single endpoint). All ids unchanged
  this batch.
- **`list_issues` now paginates** via Linear's GraphQL connection cursor
  (`pageInfo.endCursor` → `$after`) up to `limit`, returning `{ issues, count }`.
- **Auth:** personal API key in the `Authorization` header (no `Bearer`); managed
  OAuth attaches server-side. Base is fixed (`api.linear.app/graphql`).
- **Live pickers (work today):** team picker + assignee picker (both independent
  of other props). `picker-blocked`: state / label / project pickers (team-scoped
  refreshers) — id inputs for now.
- **Offline:** `src/actions/linear/linear.spec.ts` (9 golden cases incl. the
  GraphQL "errors at HTTP 200" path, the endCursor pagination walk, and the
  team-picker resolver).
- **Smoke (read, benign):** `list_teams` (no props) — also exercises the picker
  resolver. Or `list_issues` with `limit: 1`.
- **Connection needed:** Linear — Composio toolkit `linear`, managed OAUTH2.
  **No connection on the shared account yet → PENDING.**

  ```bash
  export LINEAR_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/linear/linear.live.spec.ts
  ```

### stripe — PENDING (6 read actions + live customer picker)

- **Actions (reads):** `get_customer`, `list_customers`, `search_customers`,
  `list_charges`, `list_subscriptions`, `get_balance`. Fixed base `api.stripe.com/v1`.
- **Auth:** secret key as Bearer (`apiKey` header, `Bearer ` prefix); managed
  Connect OAuth attaches server-side.
- **Live picker (works today):** customer picker — independent, and it uses the
  loader `search` term (`customers/search`) so it stays fast on large accounts.
- **`form-body-blocked`:** `create_customer`, `create_payment_link`,
  `create_refund`, `update_customer` — deferred until the client can send
  form-encoded bodies (framework gap #2).
- **Offline:** `src/actions/stripe/stripe.spec.ts` (6 golden cases incl. the
  customer picker with/without search).
- **Smoke (read, benign):** `get_balance` (no props).
- **Connection needed:** Stripe — Composio toolkit `stripe`, managed OAUTH2 (Connect).

### airtable — PENDING (6 actions, live base picker)

- **Actions:** `create_record`, `get_record`, `list_records`, `update_record`,
  `delete_record`, `list_bases`. Fixed base `api.airtable.com/v0`; JSON bodies
  (writes work). `list_records` follows the `offset` cursor via `cursorInBody`.
- **Auth:** personal access token as Bearer (`apiKey` header, `Bearer ` prefix);
  managed OAuth attaches server-side.
- **Live picker (works today):** base picker (independent). `picker-blocked`:
  table picker + field/view pickers (base/table refreshers) — text inputs for now.
- **Offline:** `src/actions/airtable/airtable.spec.ts` (7 golden cases incl. offset
  pagination + the base-picker resolver).
- **Smoke (read, benign):** `list_bases` (no props) — also exercises the picker.
- **Connection needed:** Airtable — Composio toolkit `airtable`, managed OAUTH2.
- **Catalog note:** registered in `src/actions/airtable/index.ts`
  (`airtableActions`); top-level `catalogActions` aggregation deferred (a parallel
  framework workstream holds `src/actions/index.ts` open — reconcile at the end).

### calendly — PENDING (6 actions, live event picker)

- **Actions:** `get_current_user`, `list_event_types`, `list_scheduled_events`,
  `get_scheduled_event`, `list_event_invitees`, `cancel_scheduled_event`. API v2,
  fixed base `api.calendly.com`, JSON. Reads auto-scope to the connected user via
  `/users/me`; pagination follows `pagination.next_page` (full-URL cursor).
- **Auth:** personal access token / managed OAuth as Bearer.
- **Live picker (works today):** scheduled-event picker — independent (it resolves
  the user URI itself), used by get / list_invitees / cancel.
- **Offline:** `src/actions/calendly/calendly.spec.ts` (5 golden cases incl.
  next_page pagination + the event picker).
- **Smoke (read, benign):** `get_current_user` (no props).
- **Connection needed:** Calendly — Composio toolkit `calendly`, managed OAUTH2.
- **Catalog note:** registered in its own `index.ts` (`calendlyActions`); top-level
  aggregation deferred (shared file held open by a parallel workstream).

### salesforce — PENDING (6 actions)

- **Actions:** `run_query` (SOQL), `search` (SOSL), `create_record`, `get_record`,
  `update_record`, `delete_record`. REST data API; JSON bodies (writes work);
  update/delete return 204 → synthesised `{ id, success }`.
- **Auth:** OAuth2 Bearer. Instance-scoped → `instanceUrl` + `apiVersion` (default
  v58.0) props on every action. Managed connections carry `instance_url` in
  account metadata; the BYO/direct rail uses the prop.
- **Offline:** `src/actions/salesforce/salesforce.spec.ts` (5 golden cases incl.
  the 204-no-content write handling and SOQL/URL shaping).
- **Smoke (read, benign):** `run_query` with `SELECT Id FROM Account LIMIT 1`.
- **Connection needed:** Salesforce — Composio toolkit `salesforce`, managed OAUTH2.
- **`picker-blocked`:** SObject / field pickers need `instanceUrl` (a prop) →
  text inputs for now.
- **Catalog note:** registered in its own `index.ts` (`salesforceActions`);
  top-level aggregation deferred.

### intercom — PENDING (6 actions, live admin picker)

- **Actions:** `list_contacts`, `get_contact`, `create_contact`,
  `search_contacts`, `list_conversations`, `list_admins`. Fixed base
  `api.intercom.io`, JSON. Pins `Intercom-Version: 2.11`; cursor pagination via
  `pages.next.starting_after`.
- **Auth:** access token as Bearer (BYO paste or managed OAuth). The matrix
  "transport gap" was the vendored `intercom-client` SDK bypassing the sentinel —
  not relevant to this clean-room REST client.
- **Live picker (works today):** owner/admin picker (independent) on
  `create_contact`.
- **Offline:** `src/actions/intercom/intercom.spec.ts` (6 golden cases incl.
  cursor pagination, the search DSL, and the admin picker).
- **Smoke (read, benign):** `list_admins` (no props) — also exercises the picker.
- **Connection needed:** Intercom — Composio toolkit `intercom`, managed OAUTH2.
- **Catalog note:** registered in its own `index.ts` (`intercomActions`).

### mailchimp — PENDING (6 actions)

- **Actions:** `list_audiences`, `get_list`, `list_campaigns`, `add_member`,
  `get_member`, `update_member`. Marketing API `/3.0`, JSON (writes work). Members
  are addressed by the MD5 subscriber hash of the lowercased email.
- **Auth:** BYO API key via HTTP Basic (any user + key); managed OAuth attaches a
  Bearer token server-side. Region-scoped host → `serverPrefix` prop (e.g. us19).
- **Offline:** `src/actions/mailchimp/mailchimp.spec.ts` (5 golden cases incl. a
  verified MD5 subscriber hash and the datacenter host).
- **Smoke (read, benign):** `list_audiences` with `serverPrefix` set.
- **Connection needed:** Mailchimp — Composio toolkit `mailchimp`, managed OAUTH2.
- **`picker-blocked`:** audience/list pickers need `serverPrefix` (a prop) → text
  inputs for now.
- **Catalog note:** registered in its own `index.ts` (`mailchimpActions`).

### zendesk — PENDING (6 actions)

- **Actions:** `create_ticket`, `get_ticket`, `update_ticket`, `list_tickets`,
  `search`, `list_users`. Support API `/api/v2`, JSON (writes work); `next_page`
  (full-URL) pagination.
- **Auth:** BYO via HTTP Basic (`{email}/token` + API token); managed OAuth
  attaches a Bearer token server-side. Subdomain-scoped → `subdomain` prop.
- **Offline:** `src/actions/zendesk/zendesk.spec.ts` (5 golden cases incl. the
  `{ ticket }` write envelope, internal-comment shaping, next_page pagination).
- **Smoke (read, benign):** `list_tickets` with `subdomain` set.
- **Connection needed:** Zendesk — Composio toolkit `zendesk`, managed OAUTH2.
- **`picker-blocked`:** assignee/group pickers need `subdomain` (a prop) → number/
  text inputs for now.
- **Catalog note:** registered in its own `index.ts` (`zendeskActions`).

### hubspot — PENDING (7 actions, live owner + pipeline pickers)

- **Actions:** `create_contact`, `get_contact`, `update_contact`,
  `list_contacts`, `search_contacts`, `create_deal`, `list_owners`. CRM v3, fixed
  base `api.hubapi.com`, JSON (writes work); `paging.next.after` cursor pagination.
- **Ids (this batch):** `create_deal` is a **coined** id `hubspot.create_deal`
  (AP's `hubspot.create-deal` is hyphenated → not a valid action namespace, so it
  ships alongside rather than replacing). The others kept their prior coined ids.
- **`search_contacts` now paginates** via the CRM v3 search `paging.next.after`
  cursor (POST-body cursor, small hand-rolled loop) up to `limit`, returning
  `{ contacts, count, total }`.
- **Auth:** OAuth / private-app token as Bearer.
- **Live pickers (work today):** owner picker (independent) on `create_contact`
  and `create_deal`; **deal-pipeline picker** (independent, `GET /crm/v3/pipelines/deals`)
  on `create_deal`. `picker-blocked`: `dealstage` depends on the chosen pipeline →
  text input for now.
- **Offline:** `src/actions/hubspot/hubspot.spec.ts` (8 golden cases incl. the
  `{ properties }` write shape, list + search cursor pagination, filterGroups
  search, the create_deal property mapping, owner + pipeline pickers).
- **Smoke (read, benign):** `list_owners` (no props) — also exercises the owner +
  pipeline pickers.
- **Connection needed:** HubSpot — Composio toolkit `hubspot`, managed OAUTH2.
  **No connection on the shared account yet → PENDING.**

  ```bash
  export HUBSPOT_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/hubspot/hubspot.live.spec.ts
  ```

- **Catalog note:** registered in its own `index.ts` (`hubspotActions`).

---

## Scope 2 (top-usage REST apps)

### gmail — LIVE-VERIFIED ✅ (7 actions, live label picker)

- **Actions:** `get_profile`, `list_messages`, `gmail_search_mail` (find by
  from/to/subject/query/label/max), `gmail_get_mail` (get), `send_email`,
  `list_labels`, `create_draft`. API v1, JSON — send/draft carry the RFC822
  message as a base64url `raw` string in a JSON body (no multipart, stays on the
  managed rail). `list_messages` + `gmail_search_mail` follow `nextPageToken`.
- **Catalog-id alignment:** the send/get/find ids reuse the platform's existing AP
  catalog ids (`gmail.send_email`, `gmail.gmail_get_mail`, `gmail.gmail_search_mail`)
  so the service dedup replaces the broken-on-managed AP rows with ours and any plan
  referencing the established id routes to our working action.
- **Auth:** OAuth2 Bearer. Fixed base `gmail.googleapis.com/gmail/v1/users/me`.
- **Live picker (works today):** label picker (independent) on `list_messages`
  and `gmail_search_mail`.
- **LIVE-VERIFIED 2026-07-08** via Composio account `ca_p-UFh0PsCUvv`
  (`get_profile` → m.huzefa1993@gmail.com, 8464 messages; `list_labels` → 16 real
  labels; `list_messages` → 3 real ids; `gmail_search_mail` → real matches;
  **`send_email` delivered a real benign message to the owner's own address**).
  `src/actions/gmail/gmail.live.spec.ts` (run with `ORCHESTR_LIVE=1` +
  `COMPOSIO_API_KEY`; the send is gated behind `GMAIL_LIVE_SEND=1`). Offline:
  `src/actions/gmail/gmail.spec.ts`.

### notion — PENDING (7 actions, live database picker)

- **Actions:** `search`, `get_database`, `query_database`, `create_page`,
  `get_page`, `update_page`, `append_to_page` (append block children). Fixed base
  `api.notion.com/v1`, JSON; pins `Notion-Version: 2022-06-28`.
- **Ids (this batch):** `append_to_page` **reuses** the AP catalog id
  `notion.append_to_page` (Notion's `PATCH /v1/blocks/{block_id}/children`; a page
  IS a block) so the dedup replaces that AP row. The other six kept their prior
  coined underscore ids (AP's are camelCase/`find_*`, not reusable).
- **`query_database` now paginates** via Notion's `start_cursor` (POST-body
  cursor, small hand-rolled loop) up to `limit`, returning `{ pages, count }` —
  matching the paginating-read convention of the other list actions.
- **Auth:** integration/OAuth token as Bearer.
- **Live picker (works today):** database picker — independent (searches objects
  filtered to databases) and honours the loader `search` term; used by
  get_database / query_database / create_page.
- **`picker-blocked`:** per-column property pickers depend on the chosen
  database's schema → `properties`/`filter`/`children` are raw Notion JSON for now.
- **Offline:** `src/actions/notion/notion.spec.ts` (6 golden cases incl. the
  start_cursor pagination, the append-block-children PATCH, the database picker
  with search + the plain-title helper).
- **Smoke (read, benign):** `search` with `filter: 'database'` (no query) — also
  exercises the database picker.
- **Connection needed:** Notion — Composio toolkit `notion`, managed OAUTH2.
  **No connection on the shared account yet → PENDING.**

  ```bash
  export NOTION_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/notion/notion.live.spec.ts
  ```

- **Catalog note:** registered in its own `index.ts` (`notionActions`).

---

## Scope 2 (Google apps — the managed-broken class the SDK OWNS)

The AP Google pieces run on `googleapis`/`gaxios`, which the piece-runner's
managed transport can't patch → the sentinel token leaks and Google rejects the
call. There is no Composio-execution fallback for them either (they are not in
`managed-app-rails.ts`'s `FALLBACK_ONLY_APPS`), so a surfaced AP Google action
routes to the failing piece. Our clean-room actions ride the SDK's one http client
+ Composio proxy transport, which attaches the real token server-side — so managed
Gmail/Sheets/Docs/Drive/Slides actually work. The service dedup is app-aware for
these apps: OUR actions are offered and the un-reimplemented AP actions of the
same app are suppressed ("offered = works"). All five LIVE-VERIFIED 2026-07-08.

### sheets — LIVE-VERIFIED ✅ (6 actions, live spreadsheet picker)

- **Actions:** `create_spreadsheet`, `read_range`, `insert_row` (append),
  `update_row`, `clear_sheet`, `list_sheets`. API v4, JSON throughout;
  `insert_row`/`update_row` use `USER_ENTERED`. `insert_row`/`update_row` reuse the
  AP catalog ids (`sheets.insert_row`, `sheets.update_row`); the rest take clean
  ids (the AP equivalents are hyphenated, which the action namespace forbids).
- **Auth:** OAuth2 Bearer. Base `sheets.googleapis.com/v4/spreadsheets`.
- **Live picker (works today):** the `spreadsheetId` picker lists the user's
  spreadsheets via Drive `files.list` — independent of any other prop. The managed
  Sheets connection carries Drive scope (verified live); if a connection lacks it
  the loader throws and the platform degrades the field to free text.
- **`picker-blocked`:** a per-tab `sheet` picker would depend on the chosen
  `spreadsheetId` (a set prop the loader can't read) — so `range` is A1 text (e.g.
  `Sheet1!A1:C10`); `list_sheets` surfaces the tab names.
- **LIVE-VERIFIED 2026-07-08** via Composio account `ca_N_9ktTrHUUqN`
  (create → append → read `[["Name","Score"],["Ada","99"]]` → update → clear →
  list tabs; the Drive-backed picker returned 5 real spreadsheets).
  `src/actions/sheets/sheets.live.spec.ts`.

### docs — LIVE-VERIFIED ✅ (3 actions)

- **Actions:** `create_document`, `read_document` (returns derived plain text),
  `append_text` (a single `insertText` at end-of-segment). API v1, JSON. Reuses the
  AP catalog ids (`docs.create_document`, `docs.read_document`, `docs.append_text`).
- **Auth:** OAuth2 Bearer. Base `docs.googleapis.com/v1/documents`.
- **LIVE-VERIFIED 2026-07-08** via `ca_0gKJcMiZ6nEm` (create → append → read back
  "Hello Orchestr."). `src/actions/docs/docs.live.spec.ts`.

### drive — LIVE-VERIFIED ✅ (3 actions, JSON-metadata only)

- **Actions:** `list_files` (list/search via the raw `q` grammar, `nextPageToken`
  pagination), `get_file` (metadata by id), `create_folder`. API v3, JSON. AP ids
  are hyphenated → clean underscore ids.
- **MANAGED-FILE LIMITATION (surfaced honestly):** the managed proxy carries JSON
  only (docs/FRAMEWORK-NOTES.md §B), so uploading/downloading file **content**
  (`alt=media`, multipart `uploadType`) cannot ride the managed rail. These actions
  therefore cover the JSON-metadata surface only — no binary upload/download.
  Binary file movement needs a direct (bring-your-own) connection.
- **Auth:** OAuth2 Bearer. Base `www.googleapis.com/drive/v3/files`.
- **LIVE-VERIFIED 2026-07-08** via `ca_-fITpAJbTmTT` (list 5 real files; create a
  folder → get it back by id). `src/actions/drive/drive.live.spec.ts`.

### slides — LIVE-VERIFIED ✅ (2 actions)

- **Actions:** `create_presentation`, `get_presentation` (id/title/slide-count
  summary). API v1, JSON. `get_presentation` reuses the AP id; `create` is a clean
  new id (AP has no create).
- **Auth:** OAuth2 Bearer. Base `slides.googleapis.com/v1/presentations`.
- **LIVE-VERIFIED 2026-07-08** via `ca_8UbwbOB4w9nD` (create → get, 1 slide).
  `src/actions/slides/slides.live.spec.ts`.

### calendar — PENDING (6 actions, live calendar picker) — completes the Google suite

- **Actions:** `create_google_calendar_event` (create), `google_calendar_get_events`
  (list by time range), `google_calendar_get_event_by_id` (get), `update_event`
  (PATCH partial-update), `delete_event` (204 → synthesised confirmation),
  `list_calendars`. API v3, JSON throughout; `create` defaults `end` to start +
  30 min like the UI; `get_events` sets `singleEvents=true&orderBy=startTime` and
  follows `nextPageToken`. The first five reuse the platform's AP catalog ids;
  `list_calendars` is a clean id (AP has no equivalent).
- **Managed-broken class:** the AP Calendar piece runs on `googleapis`/`gaxios`
  (the same defect as gmail/sheets/docs/drive/slides), so `calendar` is now in the
  service's `MANAGED_BROKEN_APPS` set — the dedup offers **only** our actions for
  this app and suppresses the un-reimplemented AP calendar actions ("offered =
  works"). This **completes the owned Google suite.**
- **Auth:** OAuth2 Bearer. Base `www.googleapis.com/calendar/v3`.
- **Live picker (works today):** the `calendarId` picker lists the user's calendars
  via `/users/me/calendarList` — independent of any other prop; use `primary` for
  the default calendar. `list_calendars` also surfaces the ids.
- **Offline:** `src/actions/calendar/calendar.spec.ts` (9 golden cases incl. the
  +30-min default end, PATCH partial-update, the 204 delete synthesis, nextPageToken
  pagination, and the calendar picker).
- **Smoke (read, benign):** `list_calendars` (no props) — also exercises the picker.
  Set `GOOGLECALENDAR_CONNECTED_ACCOUNT_ID`; the write round-trip
  (create→update→get→delete a throwaway event) is gated behind `CALENDAR_LIVE_WRITE=1`.
- **Connection needed:** Google Calendar — Composio toolkit `googlecalendar`,
  managed OAUTH2. **No connection on the shared account yet → PENDING.**

  ```bash
  export GOOGLECALENDAR_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/calendar/calendar.live.spec.ts
  ```

---

## Scope 3 (project-management apps)

Standard JSON REST apps — they ride **both** rails (managed via Composio, or a BYO
token) with byte-identical action code, so they are NOT in `MANAGED_BROKEN_APPS`
(AP executes them fine on axios; our reused-id actions replace the AP row via the
exact-type rule, and AP's other actions stay as fallbacks). All PENDING — no
connection on the shared account yet.

### asana — PENDING (6 actions, live project + workspace pickers)

- **Actions:** `create_task`, `get_task`, `update_task`, `list_tasks` (by project),
  `list_projects` (optionally by workspace), `add_comment`. API v1, JSON with the
  `{ data: … }` request/response envelope; `create_task` reuses the AP id, the rest
  are clean ids (AP ships only `create_task`). `list_tasks` + `list_projects` follow
  Asana's `next_page.offset` cursor.
- **Ids (this batch):** `list_projects` is a **coined** id `asana.list_projects`
  (AP ships no Asana list-projects action). Helpers renamed to the codebase's
  `list<App><Resource>` convention (`listAsanaProjects`/`listAsanaWorkspaces`) so
  the short verb `listProjects` names the action.
- **Auth:** OAuth2 Bearer (managed) or a BYO personal access token attached the
  same way. Fixed base `app.asana.com/api/1.0`.
- **Live pickers (work today):** project picker (`/projects`) + workspace picker
  (`/workspaces`) — both independent of other props.
- **Offline:** `src/actions/asana/asana.spec.ts` (7 golden cases incl. the envelope
  wrap/unwrap, project→`projects[]` mapping, list_tasks + list_projects offset
  pagination, the project picker).
- **Smoke (read, benign):** `list_projects` (no props), `list_tasks` on any
  project — the live spec loads workspaces + projects and resolves the picker.
- **Connection needed:** Asana — Composio toolkit `asana`, managed OAUTH2.

  ```bash
  export ASANA_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/asana/asana.live.spec.ts
  ```

### clickup — PENDING (4 actions, live list picker via hierarchy walk)

- **Actions:** `create_task`, `get_list_task` (get by id — AP's "Get Task" id,
  reused), `update_task`, `list_tasks` (by list, `page`/`last_page` cursor).
  API v2, JSON; `create_task`/`update_task` reuse the AP ids, `get_list_task` reuses
  AP's get-task id, `list_tasks` is a clean id (AP's `list_workspace_tasks` is
  workspace-scoped). Static priority picker (1–4).
- **Auth:** personal token in a bare `Authorization` header (no `Bearer`); managed
  OAuth attaches server-side. Fixed base `api.clickup.com/api/v2`.
- **Live picker (works today):** the required `listId` picker is **independent** but
  walks the hierarchy — teams → spaces → (folderless lists + each folder's lists) —
  because ClickUp has no flat "list all lists" endpoint and a per-space picker would
  need a `space` refresher the loader can't read (gap #1). Cost: 1 + T (teams) + 2·S
  (spaces) requests per picker load, bounded by the account's real structure. A
  standalone `spaceOptions` resolver is exposed and exercised inside the walk. When
  the refresher gap closes, swap to a cheaper per-space picker.
- **Offline:** `src/actions/clickup/clickup.spec.ts` (5 golden cases incl. the
  page-cursor pagination and the full hierarchy-walk picker with folder paths).
- **Smoke (read, benign):** `list_tasks` on any list; the live spec loads teams +
  spaces and resolves the list picker.
- **Connection needed:** ClickUp — Composio toolkit `clickup`, managed OAUTH2.

  ```bash
  export CLICKUP_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/clickup/clickup.live.spec.ts
  ```

### todoist — PENDING (4 actions, live project picker)

- **Actions:** `create_task`, `find_task` (get tasks by project/filter),
  `update_task`, `mark_task_completed` (close, 204 → synthesised confirmation).
  REST v2, JSON, un-paginated list. **All four reuse the platform's AP ids** so the
  dedup replaces those rows with our working, live-picker versions. Static priority
  picker maps UI p1–p4 onto Todoist's inverted 4→1 wire scale.
- **Auth:** OAuth2 Bearer (managed) or a BYO token attached the same way. Fixed base
  `api.todoist.com/rest/v2`.
- **Live picker (works today):** project picker (`/projects`) — independent.
- **Offline:** `src/actions/todoist/todoist.spec.ts` (5 golden cases incl. the
  inverted priority, project-scoped get, POST partial-update, the 204 close, picker).
- **Smoke (read, benign):** `find_task` (no props) — the live spec loads projects +
  tasks and resolves the picker.
- **Connection needed:** Todoist — Composio toolkit `todoist`, managed OAUTH2.

  ```bash
  export TODOIST_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/todoist/todoist.live.spec.ts
  ```

### trello — NOT SHIPPED (framework gap — `dual-query-cred-blocked`)

- **Requested** (create_card / get_card / update_card / list_cards / move_card +
  board/list pickers) but **STOPPED and reported** rather than hacked. Trello
  authenticates with two query params (`key` + `token`) and needs no OAuth1
  request signing; the SDK's auth seam can't represent that dual-query-param
  credential without abusing `basic` in a `custom` scheme or extending
  `DirectCredential`. See **Framework gap #3** above for the precise finding and
  the proposed additive fix. Revisit once the seam gains a query-params credential
  variant (and a Trello connection exists to verify the managed rail).

---

## Scope 4 (Dropbox / Typeform / Zoom / Outlook batch)

Four standard JSON apps (Dropbox v2 RPC, Typeform, Zoom v2, Microsoft Graph mail).
All ride **both** rails with byte-identical action code, so **none is in
`MANAGED_BROKEN_APPS`** (they are axios/fetch-based, not gaxios — AP executes the
un-reimplemented actions fine, so those stay as fallbacks; only our reused-id
actions replace the matching AP row via the exact-type rule). All **PENDING** —
the shared Composio account has connections for slack/slides/sheets/drive/gmail/
github/docs only (checked the service `connections` table for owner
m.huzefa1993), so there is **no** dropbox/typeform/zoom/outlook connection to run
against. Each is authored + golden-tested; a turnkey smoke command is below.

**No new framework gap was hit this batch.** The three novel pagination shapes
(Typeform page-number + `before`-token, Graph `@odata.nextLink`, Dropbox's
POST-to-a-different-endpoint `list_folder/continue`) all slotted in as new
`nextPage` builders / a small hand-rolled loop, exactly as FRAMEWORK-NOTES §1
predicted — no change to `paginate`, `defineAction`, the http client, or the auth
seam. The Dropbox binary limitation is the already-documented managed-proxy §B
limitation (surfaced honestly, like drive), not a new gap.

### dropbox — PENDING (5 actions)

- **Actions:** `list_dropbox_folder` (list a folder, continue-cursor paginated),
  `get_file_metadata`, `create_new_dropbox_folder`, `search_dropbox`,
  `get_dropbox_file_link` (temporary direct-download URL). API v2 JSON-RPC on
  `api.dropboxapi.com`. The first four reuse AP's underscore ids (dedup replaces
  those AP rows); `get_file_metadata` is a clean new id.
- **FILE/BINARY LIMITATION (surfaced honestly, like drive):** Dropbox splits its
  API across `api.dropboxapi.com` (JSON RPC — what we cover) and
  `content.dropboxapi.com` (binary upload/download with a `Dropbox-API-Arg`
  header). The managed proxy carries JSON only (FRAMEWORK-NOTES §B), so the
  content endpoints can't ride the managed rail — **metadata/link actions only
  this batch, no byte upload/download.** `get_dropbox_file_link` returns a
  short-lived direct URL, the managed-safe way to hand a caller a file's contents.
- **Auth:** OAuth2 Bearer. Composio toolkit `dropbox`. No live picker — the folder
  `path` IS the primary input (a root-only picker would mislead), so paths are text.
- **Offline:** `src/actions/dropbox/dropbox.spec.ts` (7 golden cases incl. the
  list_folder→continue cursor loop, the limit-stop, and the nested search_v2 /
  create_folder_v2 envelope unwrapping).
- **Smoke (read, benign):** `list_dropbox_folder` on the root (path `""`). The
  create-folder round-trip is gated behind `DROPBOX_LIVE_WRITE=1`.
- **Connection needed:** Dropbox — Composio toolkit `dropbox`, managed OAUTH2.

  ```bash
  export DROPBOX_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/dropbox/dropbox.live.spec.ts
  ```

### typeform — PENDING (4 actions, live form picker)

- **Actions:** `list_forms` (page-number paginated), `get_form`, `list_responses`
  (by form, `before`-token paginated), `get_form_fields`. Fixed base
  `api.typeform.com`, JSON. AP ships only `custom_api_call` → all clean new ids.
- **Auth:** OAuth2 / personal token as Bearer.
- **Live picker (works today):** form picker (`/forms`) — independent, honours the
  loader `search` term; used by get_form / get_form_fields / list_responses.
- **Pagination:** two distinct shapes as new `nextPage` builders — `/forms` walks
  `page`/`page_count`; `/responses` walks the `before`=last-token cursor (responses
  are newest-first), stopping on a short page.
- **Offline:** `src/actions/typeform/typeform.spec.ts` (6 golden cases incl. both
  pagination shapes + the form picker).
- **Smoke (read, benign):** `list_forms` (no props) — also exercises the picker.
- **Connection needed:** Typeform — Composio toolkit `typeform`, managed OAUTH2.

  ```bash
  export TYPEFORM_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/typeform/typeform.live.spec.ts
  ```

### zoom — PENDING (5 actions, live host picker)

- **Actions:** `zoom_create_meeting`, `list_meetings` (`next_page_token`
  cursor), `zoom_find_meeting` (get by id), `zoom_update_meeting` (PATCH, 204 →
  synthesised confirmation), `delete_meeting` (204 → synthesised). API v2, JSON.
  create/find/update reuse AP's underscore ids (dedup replaces them);
  list/delete are clean new ids.
- **Auth:** OAuth2 Bearer. Fixed base `api.zoom.us/v2`.
- **Live picker (works today):** host picker (`/users`) — independent; used by
  create/list. Blank = the connected user (`me`). Requires `user:read:admin`; on a
  plan without it Zoom 4xxs and the platform degrades the field to free text.
- **Offline:** `src/actions/zoom/zoom.spec.ts` (7 golden cases incl. the "me"
  host fallback, `next_page_token` pagination, the 204 update/delete synthesis,
  and the host picker).
- **Smoke (read, benign):** `list_meetings` (host defaults to `me`). The
  create→update→get→delete round-trip is gated behind `ZOOM_LIVE_WRITE=1`.
- **Connection needed:** Zoom — Composio toolkit `zoom`, managed OAUTH2.

  ```bash
  export ZOOM_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/zoom/zoom.live.spec.ts
  ```

### outlook — PENDING (4 actions) — Microsoft Graph mail

- **Actions:** `send_email` (Graph `sendMail`, 202 → synthesised confirmation),
  `list_messages` (all or folder-scoped; `@odata.nextLink` cursor; `$search` adds
  the `ConsistencyLevel: eventual` header), `get_message`, `list_folders`
  (`@odata.nextLink` cursor). Base `graph.microsoft.com/v1.0/me`, JSON. AP's
  Outlook ids are hyphenated (`send-email`) or camelCase (`findEmail`) → all clean
  new ids (Outlook is NOT managed-broken, so AP's actions stay as fallbacks).
- **AUTH-SHAPE ASSUMPTION — verified by construction (batch ask):** Graph uses a
  standard `Authorization: Bearer <token>` over HTTPS — the same shape as every
  oauth2 app here. Our actions never set the header; on the managed rail the
  Composio proxy strips it and injects the connection's real Graph token
  server-side, keyed by `connected_account_id` — byte-identical to Google/Slack.
  So "Graph routes through the transport fine" holds by construction; a **live run
  is still needed** to confirm end-to-end (hence PENDING, not VERIFIED).
- **Encoding note:** Graph returns `/me/messages` newest-first by default, so we
  send **no** `$orderby` — deliberately avoiding URL-encoding a spaced OData value
  (`receivedDateTime desc` → `+`-vs-`%20`) that Graph's parser might reject and
  that we can't live-verify. (Google's `q` tolerates `+`-as-space, live-proven;
  Graph is a different parser, so we don't rely on it.)
- **Auth:** OAuth2 Bearer (Microsoft identity). Composio toolkit `outlook`.
- **Offline:** `src/actions/outlook/outlook.spec.ts` (7 golden cases incl. the
  sendMail body, the `$search`+ConsistencyLevel branch, the folder-scoped path,
  and `@odata.nextLink` pagination).
- **Smoke (read, benign):** `list_folders` (no props). The send is gated behind
  `OUTLOOK_LIVE_SEND=1` + `OUTLOOK_TEST_ADDRESS` and targets the owner's address.
- **Connection needed:** Outlook — Composio toolkit `outlook`, managed OAUTH2.

  ```bash
  export OUTLOOK_CONNECTED_ACCOUNT_ID="ca_...."
  ORCHESTR_LIVE=1 npx jest src/actions/outlook/outlook.live.spec.ts
  ```
