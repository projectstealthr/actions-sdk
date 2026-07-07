# Framework notes — hard cases surfaced by the first five reference shapes

Purpose (design §9): the whole point of hand-building five deliberately different-shaped
actions/triggers before scaling is to make the framework's hard cases show up *now*, while a
breaking change is cheap. This is that log — every non-obvious case the shapes surfaced, how the
SDK handled it, and what's still open. It is the signal for "is the shape ready to mass-produce
actions on."

Shapes built (all live- or contract-tested with real data):

- `slack.send_channel_message` — dynamic dropdown picker, canonical action, managed rail (write).
- `slack.list_channels` — cursor-in-body pagination, managed rail.
- `github.list_issues` — Link-header pagination, **direct** rail, **apiKey** scheme (unauth read).
- `slack.new_message` — webhook trigger (handshake + HMAC + transform + dedup).
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
Activepieces repeats `if (!auth) return { disabled, placeholder }` in **every** dropdown loader.
The SDK centralises it in `resolveOptions`: loaders just return the options array; a missing
connection yields a disabled result automatically. A small, real DX win over the reference.

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

## OPEN / TODO — gaps to close before or during scale-up

### A. Webhook `onEnable`/`onDisable` is not yet live-exercised
Slack's Events API subscription URL is configured at the **app level**, so there is no
per-connection registration API — `slack.new_message` correctly omits `onEnable`/`onDisable`, and
its webhook contract (handshake echo, HMAC verify, transform, retry dedup) is proven by **real
signature vectors and payloads**, not a live inbound call (webhooks are inbound; there's nothing to
"call out" to for Slack). The SDK contract *does* support registration for providers that need it
(GitHub repo webhooks, Stripe), but that path has only unit coverage so far. **TODO: build one
register-per-connection webhook trigger (e.g. `github.new_issue` via repo webhooks) to live-exercise
`onEnable`/`onDisable` end-to-end** — that's the one part of the trigger contract without a live
proof.

### B. The managed (Composio) proxy carries JSON objects only
The proxy decodes bodies to JSON and mangles anything else, so `ComposioProxyTransport` rejects
non-object/binary bodies loudly (`unsupported_body`). Consequence: the `file` prop kind exists and
type-checks, but **file-upload actions (Slack `files.upload`, Drive uploads) cannot run on the
managed rail** — they need the direct rail, or a future multipart-capable managed path. No
reference action exercises `file` yet. **TODO before shipping any upload/download action:** decide
the file story (direct-rail-only, or extend the proxy contract) and add a `file` reference.

### C. Webhook triggers have a *second* credential
A webhook's signing secret (Slack signing secret) is **app-level config, distinct from the
connection's OAuth token**. The contract models this with a `secrets` bag passed to `verify(req,
secrets)` — but it means the runtime must plumb a second credential to webhook triggers, separate
from the auth handle. Worth confirming the platform's webhook config surface can carry it.

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
2. **Register-per-connection webhook path (Open A)** — live-exercise `onEnable`/`onDisable` on one
   real provider before authoring a batch of webhook triggers.

Everything else on the open list is tuning/hardening that rides on top of a sound contract, not a
change to it. Recommendation: proceed to the design's sequencing (transport-gap apps first), and
treat A and B as the two must-do framework tasks interleaved early.
