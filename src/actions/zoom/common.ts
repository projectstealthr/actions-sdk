import type { AuthHandle, OAuth2Scheme } from '../../core/auth';
import type { HttpClient } from '../../core/http/client';
import { dropdown, type DropdownOption, type DropdownSchema } from '../../core/props';

/**
 * Shared Zoom (API v2) building blocks. Clean-room: the `/users/{id}/meetings`
 * and `/meetings/{id}` endpoints, OAuth2 Bearer auth, the numeric meeting `type`
 * enum, and the `next_page_token` cursor are Zoom's public contract, read as
 * *spec* and re-expressed here. JSON throughout, so every action stays on the
 * managed rail.
 */

export const ZOOM_API_BASE = 'https://api.zoom.us/v2';

/** Zoom authenticates with an OAuth2 bearer access token, attached by the transport. */
export const zoomAuth: OAuth2Scheme = {
  type: 'oauth2',
  scopes: ['meeting:read', 'meeting:write', 'user:read'],
};

/** A Zoom meeting (as returned by create/get). Fields Zoom may omit are optional. */
export interface ZoomMeeting {
  id: number;
  uuid?: string;
  host_id?: string;
  host_email?: string;
  topic: string;
  type: number;
  status?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  agenda?: string;
  created_at?: string;
  join_url?: string;
  start_url?: string;
}

/** One entry in the meetings list (a trimmed {@link ZoomMeeting}). */
export interface ZoomMeetingListEntry {
  id: number;
  uuid?: string;
  topic: string;
  type: number;
  start_time?: string;
  duration?: number;
  timezone?: string;
  join_url?: string;
}

/** A Zoom user, trimmed to what the user picker uses. */
export interface ZoomUser {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

/** Fetch the account's users — backs the (optional) host picker. */
export async function listUsers(http: HttpClient, auth: AuthHandle): Promise<ZoomUser[]> {
  const res = await http.get<{ users?: ZoomUser[] }>(`${ZOOM_API_BASE}/users`, {
    auth,
    query: { page_size: 300, status: 'active' },
  });
  return res.data.users ?? [];
}

/**
 * Live host picker — independent of any other prop (it lists the account's
 * users). Requires an account-level scope (`user:read:admin`); on a plan without
 * it, Zoom 4xxs and the platform degrades the field to free text. The meeting
 * host id is the user's canonical `id`; leaving the field blank means "me".
 */
export async function userOptions(http: HttpClient, auth: AuthHandle): Promise<DropdownOption<string>[]> {
  const users = await listUsers(http, auth);
  return users.map((user) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    const label = name && user.email ? `${name} (${user.email})` : user.email || name || user.id;
    return { label, value: user.id };
  });
}

/** The optional, live-picker `userId` prop shared by create/list. Blank = the connected user ("me"). */
export function userIdProp(): DropdownSchema<string, false> {
  return dropdown<string, false>({
    label: 'Host',
    description: 'The meeting host — loaded live. Leave blank to use the connected user.',
    required: false,
    options: ({ auth, http }) => userOptions(http, auth),
  });
}
