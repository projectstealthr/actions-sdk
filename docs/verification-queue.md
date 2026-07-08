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

### gmail — LIVE-VERIFIED ✅ (6 actions, live label picker)

- **Actions:** `get_profile`, `list_messages`, `get_message`, `send_message`,
  `list_labels`, `create_draft`. API v1, JSON — send/draft carry the RFC822
  message as a base64url `raw` string in a JSON body (no multipart, stays on the
  managed rail). `list_messages` follows `nextPageToken`.
- **Auth:** OAuth2 Bearer. Fixed base `gmail.googleapis.com/gmail/v1/users/me`.
- **Live picker (works today):** label picker (independent) on `list_messages`.
- **LIVE-VERIFIED 2026-07-08** via Composio account `ca_p-UFh0PsCUvv`
  (`gmail.get_profile` → m.huzefa1993@gmail.com, 8460 messages; `list_labels` →
  16 real labels; label picker loaded live; `list_messages` → 3 real ids).
  `src/actions/gmail/gmail.live.spec.ts` (run with `ORCHESTR_LIVE=1` +
  `COMPOSIO_API_KEY`). Offline: `src/actions/gmail/gmail.spec.ts` (5 cases incl. a
  decoded base64url `raw` MIME assertion).
- **Not live-smoked (write):** `send_message`, `create_draft` — authored + unit
  tested; not fired live to avoid sending real mail.

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
