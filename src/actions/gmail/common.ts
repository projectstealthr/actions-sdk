import type { AuthHandle, OAuth2Scheme } from '../../core/auth';
import type { HttpClient } from '../../core/http/client';
import type { DropdownOption } from '../../core/props';

/**
 * Shared Gmail (API v1) building blocks. Clean-room: the `/gmail/v1/users/me`
 * endpoints, OAuth2 Bearer auth, and the base64url-`raw` send shape are Google's
 * public contract, read as *spec* and re-expressed here. Bodies and responses are
 * JSON — send carries the RFC822 message as a base64url string inside a JSON
 * `{ raw }`, so it stays on the managed rail (no multipart needed).
 */

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Gmail authenticates with an OAuth2 bearer access token, attached by the transport. */
export const gmailAuth: OAuth2Scheme = {
  type: 'oauth2',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
};

/** A Gmail label, trimmed to what the label picker uses. */
export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

/** A Gmail message reference (id + thread) as returned by list. */
export interface GmailMessageRef {
  id: string;
  threadId: string;
}

/** The `/profile` response. */
export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/** Fetch all labels — shared by the list action and the label picker. */
export async function listGmailLabels(http: HttpClient, auth: AuthHandle): Promise<GmailLabel[]> {
  const res = await http.get<{ labels: GmailLabel[] }>(`${GMAIL_API_BASE}/labels`, { auth });
  return res.data.labels ?? [];
}

/** Live label picker — independent of any other prop, so it works under today's loader contract. */
export async function labelOptions(http: HttpClient, auth: AuthHandle): Promise<DropdownOption<string>[]> {
  const labels = await listGmailLabels(http, auth);
  return labels.map((label) => ({ label: label.name, value: label.id }));
}

/**
 * Build an RFC822 message and base64url-encode it for Gmail's `raw` field.
 * Clean-room: the header/body layout and base64url encoding are the email + Gmail
 * spec, not copied code.
 */
export function buildRawMessage(input: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): string {
  const headers = [
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    ...(input.bcc ? [`Bcc: ${input.bcc}`] : []),
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  const mime = `${headers.join('\r\n')}\r\n\r\n${input.body}`;
  return Buffer.from(mime, 'utf8').toString('base64url');
}
