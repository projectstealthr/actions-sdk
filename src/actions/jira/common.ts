import type { BasicScheme } from '../../core/auth';
import { shortText } from '../../core/props';
import type { JsonValue } from '../../core/http/types';

/**
 * Shared Jira Cloud building blocks. Clean-room: the endpoints (`/rest/api/3/*`),
 * the HTTP-Basic (email + API token) auth, and the Atlassian Document Format
 * body shape are Jira's public REST v3 contract, read as *spec* and re-expressed
 * as our own code.
 *
 * Jira Cloud is **instance-scoped** — every call is rooted at the user's own
 * `https://<site>.atlassian.net`. That base is connection config, not a secret,
 * so it rides as a normal required prop (`instanceUrl`) rather than on the opaque
 * auth handle. (An `instanceUrl`-aware live picker — e.g. a project dropdown —
 * is blocked until the options-loader contract can pass set-prop values to a
 * loader; see docs/verification-queue.md.)
 */

/** Jira authenticates with HTTP Basic: `base64(email:apiToken)`. The transport attaches it. */
export const jiraAuth: BasicScheme = { type: 'basic' };

const API_PATH = '/rest/api/3';

/** Root every REST v3 call at the connection's own site, trailing slash tolerated. */
export function jiraBaseUrl(instanceUrl: string): string {
  return `${instanceUrl.replace(/\/+$/, '')}${API_PATH}`;
}

/** The required "which Jira site" prop every action shares. */
export function instanceUrlProp() {
  return shortText<true>({
    label: 'Instance URL',
    description: 'Your Jira site, e.g. https://your-domain.atlassian.net',
    required: true,
  });
}

/**
 * Wrap plain text in the smallest valid Atlassian Document Format document (one
 * paragraph) — Jira rich-text fields (description, comment body) require ADF, not
 * plain text. Returned as {@link JsonValue} so it drops straight into a request body.
 */
export function textToAdf(text: string): JsonValue {
  return {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/**
 * Jira references a project by numeric `id` or by its human `key` (e.g. `ENG`),
 * and an issue type / priority by `id` or `name`. Without a live picker we accept
 * either and shape the reference the API expects.
 */
export function projectRef(value: string): JsonValue {
  return /^\d+$/.test(value) ? { id: value } : { key: value };
}

export function namedRef(value: string): JsonValue {
  return /^\d+$/.test(value) ? { id: value } : { name: value };
}
