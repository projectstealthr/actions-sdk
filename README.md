# Orchestr Action SDK

Clean-room, transport-agnostic **actions & triggers** for the Orchestr automation platform.

This repo is the SDK skeleton and the first hand-built reference actions described in
`workflow-service/docs/action-sdk-design.md`. The goal of this first cut is to **de-risk the
framework** — nail the action contract, the auth seam, and the `http` client on a handful of
deliberately different-shaped actions before scaling the catalog.

## What this is (and is not)

**Is:** a standalone package that defines an action/trigger contract and a small runtime
(`http` client, prop schemas, auth seam) plus a growing catalog of clean-room actions. It is
designed to plug into the platform's existing piece-runner seam so it **coexists with
Activepieces** and takes over app-by-app (design §2, §6).

**Is not:** the moat. It never touches versioning/branching, the orchestration runtime,
AI-authored config, or the MCP surface. The action library is the *hands*; the moat is the
*nervous system* (design §2).

## Clean-room mandate

Every action here is **our own code**. The vendored Activepieces pieces and Composio tool
schemas were read **only as spec** — which endpoint, which inputs, which output shape. Ideas and
interfaces aren't copyrightable; the specific expression is ours (design §1). No Activepieces or
Composio source was copied.

## License

This repo uses the **Orchestr Sustainable Use License** (fair-code) in `LICENSE.md`, matching the
posture of the `workflow-service` repository — chosen here as a **placeholder pending a final
decision**. Because the SDK is explicitly framed as the OSS independence/integrity layer (design
§1–§2), a more permissive license (e.g. MIT) may be adopted later so the action catalog is
trivially adoptable and forkable. That decision is intentionally deferred and should be revisited
before any public release.

## Design at a glance

Four primitives, each doing one job (see `src/`):

- **`defineAction` / `defineTrigger`** — the contract. Triggers support both **polling** (with
  dedup + watermark) and **webhook** (handshake, signature verification, payload → events)
  strategies. Webhook triggers can **register per connection**: `onEnable({ webhookUrl, secret })`
  creates a real provider subscription (a GitHub repo webhook, a Stripe endpoint) pointing at our
  intake and returns a `WebhookRegistration` handle; `onDisable(handle)` deletes it. App-level
  webhooks (Slack) omit both. Live-proven end to end by `github.new_push`.
- **Prop schemas** — `shortText`, `longText`, `number`, `checkbox`, `dropdown` (static **and**
  async `options({ auth, http })` loaders — the config differentiator), `multiSelect`, `json`,
  `file`, `dateTime`. Fully typed: `props` inside `run` is inferred with no `any`. Serialise to
  the platform's UPPERCASE catalog tags via `toManifestEntry` so an app "silently upgrades" from
  an AP-backed action to ours (design §6).
- **The `http` client** — the real engineering. Auth injection via a pluggable transport,
  pagination helpers (cursor-in-body **and** Link-header), retry-with-backoff that respects
  `Retry-After` and idempotency, per-request timeouts, and **error normalisation**: every failure
  reduces to one shape `{ status, message, retryable }`.
- **The auth seam** — an action declares an `AuthScheme` and reads an **opaque `AuthHandle`**. The
  handle carries the resolved transport behind a private symbol; action code can never read the
  credential or learn its source. The same action runs **BYO/direct** (self-host) or **managed via
  Composio** with zero branching (design §5).

```ts
import { defineAction, dropdown, longText } from 'orchestr-actions-sdk';

export const sendChannelMessage = defineAction({
  type: 'slack.send_channel_message', // our public <slug>.<action> namespace
  name: 'Send message to a channel',
  description: 'Post a message to a Slack channel.',
  auth: slackOAuth,
  props: {
    channel: dropdown<string, true>({
      label: 'Channel',
      required: true,
      // The differentiator: options fetched live from the user's connection.
      options: async ({ auth, http }) => {
        const channels = await listSlackChannels(http, auth);
        return channels.map((c) => ({ label: `#${c.name}`, value: c.id }));
      },
    }),
    text: longText({ label: 'Message', required: true }),
  },
  async run({ auth, props, http }) {
    const res = await http.post('https://slack.com/api/chat.postMessage', {
      auth, // the seam injects the real credential; the action never sees it
      body: { channel: props.channel, text: props.text },
    });
    return assertSlackOk(res.data);
  },
});
```

## Reference catalog (the de-risking set)

Five deliberately different shapes (design §9), each live-tested against a real API:

| Type | Shape it proves | Rail / auth | Live status |
|---|---|---|---|
| `slack.send_channel_message` | dynamic dropdown picker + canonical action | Composio proxy / OAuth2 | picker + one benign write, real `ts` |
| `slack.list_channels` | **cursor** pagination | Composio proxy / OAuth2 | real channels |
| `github.list_issues` | **Link-header** pagination + second transport & scheme | Direct / apiKey (unauth) | 120 real issues, multi-page |
| `slack.new_message` | **webhook** trigger (handshake + HMAC + transform + dedup) | — | contract-tested (real HMAC vectors) |
| `slack.new_channel` | **polling** trigger (dedup + watermark) | Composio proxy / OAuth2 | real channels, dedup proven |

See `docs/FRAMEWORK-NOTES.md` for the hard cases these surfaced.

## Ported no-auth utility apps (AP-retirement phase 1)

The first wave of the Activepieces retirement: the 12 highest-value / lowest-risk **no-auth
utility apps**, re-implemented clean-room with **zero runtime dependencies** (Node built-ins only).
They need no credential (`none` scheme), run in-process at zero marginal cost, and work offline —
the self-host core Composio structurally cannot serve. Exposed via `actions.utilityActions` (folded
into `actions.catalogActions`).

| App | Actions | App | Actions |
|---|---|---|---|
| `http` | `send_request`, `parse_url` | `crypto` | hash / hmac / rsa / base64 / password (6) |
| `text` | concat/replace/split/find/… (9) | `csv` | csv↔json (2) |
| `date` | format / diff / add-subtract / … (9) | `xml` | json→xml (1) |
| `math` | add/sub/mul/div/mod/random (6) | `data_mapper` | advanced_mapping (1) |
| `json` | to-text / to-json / merge (3) | `graphql` | send_request (1) |
| `hackernews` | fetch_top_stories (1) | `binance` | fetch_crypto_pair_price (1) |

**Polling-trigger framework** — the SDK's `defineTrigger(polling)` contract is now wired end to end
and projected via `actions.pollingTriggers` (the polling counterpart of `catalogActions`; a consumer
projects each with `.toManifest()` and drives one poll via `.runPoll({ auth, props, store })`). The
framework returns only events unseen since the stored cursor (a `lastPolledAt` watermark + a bounded
`seen` dedup set — the same TIMEBASED semantics as the AP polling framework and the
`pollViaComposio` reroute). Reference polling triggers: `http.new_item`, `hackernews.new_story`,
`rss.new_item` (plus the pre-existing `slack.new_channel`).

## Heavy-lib utility apps (AP-retirement phase 2)

The second wave ports the utilities that phase-1 deferred because they need a third-party library.
Each dependency was vetted **permissive-only** (MIT / Apache-2.0 / BSD / ISC); nothing copyleft
ships. Same clean-room posture, same `none`-scheme / offline / zero-marginal-cost profile.

| App / action(s) | Library (license) |
|---|---|
| `pdf` — extract_text, pdf_page_count, text_to_pdf, image_to_pdf, merge_pdfs, extract_pdf_pages, add_text_to_pdf, add_image_to_pdf (8) | `pdf-lib` (MIT) + `unpdf` (MIT) for text extraction |
| `qrcode` — text_to_qrcode (1) | `qrcode` (MIT) |
| `text` — markdown_to_html, html_to_markdown, extract_from_html (3) | `showdown` (MIT), `turndown` (MIT), `node-html-parser` (MIT) |
| `json` — run_jsonata_query (1) | `jsonata` (MIT) |
| `csv` — convert_excel_to_csv (1) | `exceljs` (MIT) |
| `xml` — convert_xml_to_json (1) | `fast-xml-parser` (MIT) |

Extraction of PDF text needs the ESM-only `unpdf`; the CommonJS build loads it through a runtime
dynamic `import()`, and the Jest suite runs under `--experimental-vm-modules` to match.

**Deferred on licensing / portability grounds** (recorded rather than shipped on a copyleft dep):
- `crypto.openpgp_encrypt` — the canonical `openpgp.js` (all versions) is **LGPL-3.0**, outside the
  permissive allowlist; the only permissive pure-JS OpenPGP lib (kbpgp, BSD-3-Clause) is
  unmaintained. Revisit if the owner accepts LGPL for this leaf dep.
- `pdf.convert_to_image` (PDF → raster) — the AP action shells out to the poppler `pdftoppm`
  system binary (**GPL-2.0**), and there is no lightweight permissive pure-JS PDF rasteriser.

## Testing

```bash
pnpm test          # offline unit tests (live specs self-skip)
pnpm test:live     # runs live smoke tests too (needs credentials, see below)
pnpm check         # lint + format:check + typecheck + test
```

Live smoke tests hit real APIs and **self-skip with a printed reason** unless opted in — they are
never faked. Enable with:

- `ORCHESTR_LIVE=1` — enable live suites.
- `COMPOSIO_API_KEY=<key>` — required for the Composio-backed (Slack) live tests.
- `SLACK_TEST_CHANNEL_ID=<id>` — optional; enables the single benign write test.
- `SLACK_CONNECTED_ACCOUNT_ID=<ca__…>` — optional override of the shared Slack test account.

The GitHub live test needs only `ORCHESTR_LIVE=1` (it reads a public repo unauthenticated).

## Layout

```
src/
  core/
    action.ts, trigger.ts        # the contract
    props.ts, catalog.ts         # typed prop schemas + manifest serialisation
    auth.ts, auth-factories.ts   # the opaque auth seam + handle builders
    errors.ts                    # the one failure shape + normalisation
    http/
      client.ts                  # retry / timeout / normalisation
      transport-direct.ts        # BYO / public rail
      transport-composio.ts      # managed proxy rail
      pagination.ts, retry.ts, types.ts
  actions/
    slack/, github/              # the reference catalog
    http/, text/, date/, math/…  # ported no-auth utility apps (phase 1)
    rss/                         # trigger-only: rss.new_item polling
  testing/                       # live gate, Composio harness, in-memory store, fakes
```

## Status

Framework de-risked on five shapes; all gates green (tsc, eslint, tests incl. live). Not yet
wired into the platform's piece-runner (that `OrchestrActionsProvider` seam lives in
`workflow-service` — the moat side). See `docs/FRAMEWORK-NOTES.md` for the readiness assessment
and what to settle before mass-producing actions.
