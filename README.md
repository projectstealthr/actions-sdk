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
  strategies.
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
  testing/                       # live gate, Composio harness, in-memory store, fakes
```

## Status

Framework de-risked on five shapes; all gates green (tsc, eslint, tests incl. live). Not yet
wired into the platform's piece-runner (that `OrchestrActionsProvider` seam lives in
`workflow-service` — the moat side). See `docs/FRAMEWORK-NOTES.md` for the readiness assessment
and what to settle before mass-producing actions.
