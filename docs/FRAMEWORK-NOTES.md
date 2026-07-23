# Framework notes — hard cases surfaced by the first five reference shapes

Purpose (ADR 0037/0038): the whole point of hand-building five deliberately different-shaped
actions/triggers before scaling is to make the framework's hard cases show up *now*, while a
breaking change is cheap. This is that log — every non-obvious case the shapes surfaced, how the
SDK handled it, and what's still open. It is the signal for "is the shape ready to mass-produce
actions on."

Shapes built (all live- or contract-tested with real data):

- `slack.send_channel_message` — dynamic dropdown picker, canonical action, managed rail (write).
- `slack.list_channels` — cursor-in-body pagination, managed rail.
- `github.list_issues` — Link-header pagination, **direct** rail, **apiKey** scheme (unauth read).
- `slack.new_message` — webhook trigger (app-level: handshake + HMAC + transform + dedup).
- `github.new_push` — **registered** webhook trigger (`onEnable`/`onDisable` create/delete a real
  repo webhook + HMAC verify + transform + dedup), live-proven.
- `slack.new_channel` — polling trigger (dedup + watermark), managed rail.

---

## RESOLVED — the framework absorbed these cleanly

### 1. Two totally different pagination shapes, one helper
Slack pages via a **body cursor** (`response_metadata.next_cursor`, empty = done); GitHub pages via
the **`Link` header** (`rel="next"`, a fully-formed next URL). These are structurally unrelated. A
single generic `paginate({ extractItems, nextPage })` with two ready-made `nextPage` builders
(`cursorInBody`, `linkHeader`) covered both without special-casing. **The abstraction held** — this
was the biggest risk to the "list actions scale trivially" claim, and it passed. New shapes
(offset/`page=N`, `X-Next-Token` headers) are new `nextPage` builders, not core changes.

### 2. Provider "failure at HTTP 200" (Slack `ok: false`)
Slack signals errors as **HTTP 200 with `{ ok: false, error }`** — invisible to any HTTP-status
check. The `http` client normalises HTTP-level failures; provider-envelope failures need a
per-provider assert (`assertSlackOk`) that maps `ok:false` into the SDK's one failure shape,
including retryability (`ratelimited` → retryable, `channel_not_found` → not). **Every "always
200" provider (Slack, many Google APIs, some Shopify endpoints) will need a small `assertXOk`
helper.** That's a recurring authoring step, not a framework gap — but it must be a checklist item,
because forgetting it means a failed step silently returns `{ ok:false }` as "success".

### 3. Idempotency-aware retries
`chat.postMessage` is a non-idempotent POST — retrying it on an ambiguous 5xx risks a **double
post**. But a status-0 failure (the request never reached the server) is always safe to retry. The
client encodes exactly this: retry when `retryable && (idempotent || status === 0)`, with GET/HEAD/
PUT/DELETE idempotent by default and an `idempotent: true` opt-in for keyed POSTs. Reads retry
freely; writes only retry when provably safe.

### 4. The auth seam is genuinely opaque *and* general
- Opacity: the transport rides on the handle behind a private `Symbol`; `Object.keys` and
  `JSON.stringify` expose only `{ scheme }`, and neither `transportOf` nor `createAuthHandle` is
  exported from the barrel. Action code **cannot** read the credential (tested).
- Generality: the same `github.list_issues` action ran unauthenticated over the **direct** rail
  (`none` credential) with an **apiKey** scheme, while every Slack action ran over the **Composio
  managed** rail with an **oauth2** scheme — no action-code differences. The seam spans
  {direct, managed} × {oauth2, apiKey, basic, none, custom}.

### 5. Timeout enforced independently of the transport
A transport that ignores the abort signal could hang the client forever. The client **races**
`transport.send()` against a rejecting timeout promise, so `timeoutMs` is enforced regardless of
transport behaviour (tested with a transport that ignores the signal).

### 6. Centralised "not connected" guard for dynamic options
Hand-authored option loaders otherwise repeat `if (!auth) return { disabled, placeholder }` in
**every** dropdown loader. The SDK centralises it in `resolveOptions`: loaders just return the
options array; a missing connection yields a disabled result automatically. A small, real DX win.

### 7. Typed prop-value inference required a language-level fix
`required: true` was being inferred as `boolean` (not the literal `true`), which collapsed
`PropsValue` to `never` and made `props.text` untyped. Fixed with **`const` type parameters**
(`<const R extends boolean>`, TS 5.0+), which preserve the boolean literal. Without this the entire
typed-props value story silently degrades. **Rule for new prop factories: use `const R`.**

### 8. Declaration-emit nameability (a T4-library constraint)
With `declaration: true`, every type reachable from a public signature must be exported —
`BasePropSchema`, and each action's response interface (`PostMessageResponse`, `GithubIssue`).
`tsc --noEmit` catches it. **Rule for new actions: export your response interfaces**, or the
package's `.d.ts` won't build.

---

## IMPORTANT SEMANTIC FINDING — "zero vendor strings" needs a precise definition

The single most interesting live finding. `chat.postMessage` echoes the **posting bot's identity**
in its response (`message.bot_profile.name`, avatar URLs). For a **managed** connection that bot is
Composio's shared Slack app — so the raw response literally contains the string `"composio"`.

This is **not** our code leaking a vendor string. It is genuine provider connection metadata, and
it is **connection-dependent**: the same action on a BYO/self-host connection returns the
customer's own app name there. So:

> "Zero vendor strings in output" means **the SDK's own authored output introduces no vendor
> strings** — our actions return the provider's response verbatim, wrapped in nothing. It does
> **not** and **cannot** mean "the provider's connection metadata never mentions the transport
> vendor," because that's outside our control and correct.

The reference tests encode this: read outputs (channels, issues) are asserted vendor-string-free
(meaningful — proves our shaping adds nothing); the write response is asserted on the echoed
message text instead, with a comment. **Action-authoring rule:** never post-process a provider
response to scrub connection identity — that would corrupt real data. The vendor-string guarantee
lives in *what we add*, which is nothing.

---

## RESOLVED (later) — registration + the second credential

### A. Webhook `onEnable`/`onDisable` — now live-proven ✅
`github.new_push` (a registered repo webhook) closes this. `onEnable` returns a
**`WebhookRegistration` handle** (`{ subscriptionId }` = the GitHub hook id) the runtime persists;
`onDisable` takes the handle back and deletes exactly that hook. Live-exercised against a real repo
(`src/actions/github/new-push.live.spec.ts`, gated behind `ORCHESTR_LIVE` + `GITHUB_LIVE_TOKEN` +
`GITHUB_TEST_REPO`): create hook → GET confirms it → **`verify()` accepts GitHub's own
`X-Hub-Signature-256`** over the real `ping` delivery (exact-bytes HMAC, keyed by the secret we
registered with) → delete hook → GET 404. The one part of the trigger contract that had only unit
coverage now has an end-to-end live proof.

Contract shape settled by building it: `onEnable(ctx) → WebhookRegistration | void`,
`onDisable(ctx & { registration })`, with `ctx.webhookUrl` + `ctx.secret` supplied by the runtime.
App-level webhooks (Slack) simply omit both hooks — `enable`/`disable` are no-ops returning
`undefined`.

### C. The second credential (signing secret) — now first-class ✅
Registered webhooks need a signing secret distinct from the connection's OAuth token (Open C). The
contract now carries it explicitly: the runtime generates one per trigger and passes it as
`ctx.secret` to `onEnable` (github registers the hook with it) and in the `verify` secrets bag
(`{ signingSecret }`) on every inbound delivery. One value, generated once, used to both register
and authenticate — see the runtime wiring in `workflow-service` (`SdkWebhookProvider` +
`TriggersService`).

## OPEN / TODO — gaps to close before or during scale-up

### B. The managed (Composio) proxy carries JSON objects only
The proxy decodes bodies to JSON and mangles anything else, so `ComposioProxyTransport` rejects
non-object/binary bodies loudly (`unsupported_body`). Consequence: the `file` prop kind exists and
type-checks, but **file-upload actions (Slack `files.upload`, Drive uploads) cannot run on the
managed rail** — they need the direct rail, or a future multipart-capable managed path. No
reference action exercises `file` yet. **TODO before shipping any upload/download action:** decide
the file story (direct-rail-only, or extend the proxy contract) and add a `file` reference.

### C. Webhook triggers have a *second* credential — RESOLVED
See "The second credential (signing secret) — now first-class" above: `ctx.secret` +
the `verify` secrets bag carry it, generated once per trigger by the runtime.

### D. `HttpResponse<T>` is a caller-asserted boundary cast
`http.get<SlackListResponse>()` casts `unknown → T` once; the action is then responsible for the
shape being right (and does — every reference narrows via an explicit interface). This is the
deliberate, documented boundary. It is *not* runtime-validated. For most actions that's correct
(the provider's contract is the source of truth). **If AI-authored actions become a thing, consider
an optional response validator** so a hallucinated shape fails loudly rather than flowing downstream.

### E. Rate-limit reality at scale is untested
Retry respects `Retry-After` and backs off, but we've only driven single calls. Slack's tiered rate
limits and GitHub's secondary limits will really bite at catalog scale. The mechanism is right; the
**tuning** (per-provider concurrency caps, shared token buckets) is unproven and belongs to the
runtime that hosts these actions, not the SDK — flagged so it isn't forgotten.

---

## Readiness assessment

**The shape is ready to mass-produce actions on.** The three things that would have forced a
painful migration if wrong — the pagination abstraction, the auth/transport seam, and error
normalisation — all held across five genuinely different shapes with real APIs. Typed props,
idempotent retries, and the catalog serialisation work. Nothing surfaced that requires a breaking
change to `defineAction`, `defineTrigger`, the `http` client, or the auth seam.

Two things to settle **before** scaling into the relevant app classes (not blockers for
REST-CRUD-shaped apps, which are the bulk):

1. **File/binary story (Open B)** — needed before any upload/download action; pick the rail.
2. ~~Register-per-connection webhook path (Open A)~~ — **DONE**: `github.new_push` live-proves
   `onEnable`/`onDisable` (create/delete a real repo webhook) + the `WebhookRegistration` handle +
   HMAC verify against GitHub's own signature. Registered webhook triggers can now be authored in
   batch on a proven contract.

Everything else on the open list is tuning/hardening that rides on top of a sound contract, not a
change to it. Recommendation: proceed to the design's sequencing (transport-gap apps first), and
treat A and B as the two must-do framework tasks interleaved early.
