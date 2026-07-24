/**
 * Orchestr Action SDK — public API.
 *
 * Clean-room, transport-agnostic actions & triggers. See `workflow-service` ADRs 0037/0038 + `docs/state/actions-and-execution.md`
 * for the reasoning; `docs/FRAMEWORK-NOTES.md` for the hard cases the reference
 * actions surfaced. `createAuthHandle`/`transportOf` are intentionally NOT
 * exported — the transport stays unreachable from action code (the auth seam).
 */

// Errors — the one failure shape.
export {
  ActionError,
  type ActionErrorCode,
  isRetryableStatus,
  type NormalizedFailure,
  normalizeError,
  redactSecrets,
} from './core/errors';

// Auth — schemes, the opaque handle, and the handle factories.
export {
  type ApiKeyScheme,
  type AuthHandle,
  type AuthScheme,
  type AuthSchemeType,
  type BasicScheme,
  type CustomScheme,
  type DirectCredential,
  type NoneScheme,
  type OAuth2Scheme,
} from './core/auth';
export { createComposioAuth, createDirectAuth } from './core/auth-factories';

// HTTP — client, transports, pagination, retry, wire types.
export {
  HttpClient,
  type HttpClientOptions,
  type HttpResponse,
  type RequestOptions,
} from './core/http/client';
export {
  type FetchLike,
  type FetchLikeResponse,
  FORM,
  type FormBody,
  type HttpMethod,
  isFormBody,
  isMultipartBody,
  type JsonValue,
  MULTIPART,
  type MultipartBody,
  type MultipartPart,
  type NormalizedRequest,
  type NormalizedResponse,
  type QueryValue,
  type RequestBody,
  type ResponseType,
  type Transport,
} from './core/http/types';
export {
  buildMultipart,
  encodeMultipart,
  type MultipartFileInput,
  type MultipartInput,
} from './core/http/multipart';
export { buildForm, encodeForm, type FormInput, type FormScalar } from './core/http/form';
export { ComposioProxyTransport, type ComposioProxyTransportOptions } from './core/http/transport-composio';
export { DirectTransport, type DirectTransportOptions } from './core/http/transport-direct';
export {
  cursorInBody,
  linkHeader,
  type NextPageFn,
  paginate,
  type PaginateOptions,
} from './core/http/pagination';
export { backoffDelay, DEFAULT_RETRY_POLICY, parseRetryAfter, type RetryPolicy } from './core/http/retry';
// SSRF guard for user-controlled outbound URLs — the single choke point every
// fully user-supplied URL boundary goes through (host allowlist honored). The
// service reuses `guardUserUrl` for its BYO-OAuth token endpoint (store-time +
// runtime), so the boundary can't drift from the SDK's own action/trigger sinks.
export { assertPublicUrl, guardUserUrl, isBlockedIp, ssrfAllowedHostsFromEnv } from './core/http/ssrf';

// Props — typed prop kinds + boundary validation.
export {
  type AnyPropSchema,
  type BasePropSchema,
  checkbox,
  dateTime,
  dropdown,
  type DropdownOption,
  type DropdownResult,
  type DropdownSchema,
  file,
  type FileInput,
  json,
  longText,
  multiSelect,
  type MultiSelectSchema,
  number,
  type OptionsContext,
  type OptionsSource,
  parseProps,
  type PropKind,
  type PropsSchema,
  type PropsValue,
  type PropValue,
  resolveOptions,
  shortText,
} from './core/props';

// Action + trigger primitives.
export {
  type Action,
  type ActionContext,
  type ActionDefinition,
  defineAction,
  type ExecuteInput,
} from './core/action';
export {
  defineTrigger,
  type DisableInput,
  type EnableInput,
  type HandleWebhookInput,
  type HandshakeResponse,
  type PollingContext,
  type PollingTrigger,
  type PollingTriggerDefinition,
  type PollInput,
  type PollResult,
  type TriggerStore,
  type WebhookContext,
  type WebhookRegistration,
  type WebhookRequest,
  type WebhookTrigger,
  type WebhookTriggerDefinition,
} from './core/trigger';

// Catalog serialisation (the platform manifest shape).
export {
  type ManifestEntry,
  type ManifestProp,
  type ManifestPropType,
  type ManifestSource,
  toManifestEntry,
} from './core/catalog';

// The tool-aware model call for the AI Agent node (ADR 0045) — a loop-internal
// engine primitive the service binds to its `AgentModelPort`, not a catalog action.
export {
  type AgentConversationMessage,
  type AgentModelAdapter,
  agentModelAdapters,
  type AgentModelRequest,
  type AgentModelResult,
  type AgentProvider,
  type AgentToolCall,
  type AgentToolSchema,
  type AgentUsage,
  anthropicAgentAdapter,
  callAgentModel,
  geminiAgentAdapter,
  mistralAgentAdapter,
  openaiAgentAdapter,
} from './actions/ai/agent-model';

// Reference actions + triggers.
export * as actions from './actions';
