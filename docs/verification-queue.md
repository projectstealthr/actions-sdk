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

### hubspot — PENDING (6 actions, live owner picker)

- **Actions:** `create_contact`, `get_contact`, `update_contact`,
  `list_contacts`, `search_contacts`, `list_owners`. CRM v3, fixed base
  `api.hubapi.com`, JSON (writes work); `paging.next.after` cursor pagination.
- **Auth:** OAuth / private-app token as Bearer.
- **Live picker (works today):** owner picker (independent) on `create_contact`.
- **Offline:** `src/actions/hubspot/hubspot.spec.ts` (5 golden cases incl. the
  `{ properties }` write shape, cursor pagination, filterGroups search, owner picker).
- **Smoke (read, benign):** `list_owners` (no props) — also exercises the picker.
- **Connection needed:** HubSpot — Composio toolkit `hubspot`, managed OAUTH2.
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

### notion — PENDING (6 actions, live database picker)

- **Actions:** `search`, `get_database`, `query_database`, `create_page`,
  `get_page`, `update_page`. Fixed base `api.notion.com/v1`, JSON; pins
  `Notion-Version: 2022-06-28`.
- **Auth:** integration/OAuth token as Bearer.
- **Live picker (works today):** database picker — independent (searches objects
  filtered to databases) and honours the loader `search` term; used by
  get_database / query_database / create_page.
- **`picker-blocked`:** per-column property pickers depend on the chosen
  database's schema → `properties`/`filter` are raw Notion JSON for now.
- **Offline:** `src/actions/notion/notion.spec.ts` (4 golden cases incl. the
  database picker with search + the plain-title helper).
- **Smoke (read, benign):** `search` with `filter: 'database'` (no query).
- **Connection needed:** Notion — Composio toolkit `notion`, managed OAUTH2.
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

### asana — PENDING (5 actions, live project + workspace pickers)

- **Actions:** `create_task`, `get_task`, `update_task`, `list_tasks` (by project),
  `add_comment`. API v1, JSON with the `{ data: … }` request/response envelope;
  `create_task` reuses the AP id, the rest are clean ids (AP ships only
  `create_task`). `list_tasks` follows Asana's `next_page.offset` cursor.
- **Auth:** OAuth2 Bearer (managed) or a BYO personal access token attached the
  same way. Fixed base `app.asana.com/api/1.0`.
- **Live pickers (work today):** project picker (`/projects`) + workspace picker
  (`/workspaces`) — both independent of other props.
- **Offline:** `src/actions/asana/asana.spec.ts` (6 golden cases incl. the envelope
  wrap/unwrap, project→`projects[]` mapping, offset pagination, the project picker).
- **Smoke (read, benign):** `list_tasks` on any project, or `listWorkspaces` — the
  live spec loads workspaces + projects and resolves the picker.
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
