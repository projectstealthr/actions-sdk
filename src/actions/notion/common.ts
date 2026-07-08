import type { ApiKeyScheme, AuthHandle } from '../../core/auth';
import type { HttpClient } from '../../core/http/client';
import type { JsonValue } from '../../core/http/types';
import type { DropdownOption } from '../../core/props';

/**
 * Shared Notion building blocks. Clean-room: the `/v1` endpoints, Bearer auth,
 * the required `Notion-Version` header, and the rich-text `title` shape are
 * Notion's public contract, read as *spec* and re-expressed here. JSON throughout.
 */

export const NOTION_API_BASE = 'https://api.notion.com/v1';

/** Notion pins a dated API version; the response shapes depend on it. */
export const NOTION_HEADERS: Record<string, string> = { 'notion-version': '2022-06-28' };

/** Notion authenticates with an integration/OAuth token as a Bearer credential. */
export const notionAuth: ApiKeyScheme = {
  type: 'apiKey',
  in: 'header',
  name: 'Authorization',
  prefix: 'Bearer ',
};

/** A Notion rich-text run (only the fields we read to derive a plain title). */
interface RichText {
  plain_text?: string;
}

/** A Notion object (database or page), trimmed to what pickers and reads use. */
export interface NotionObject {
  id: string;
  object: string;
  title?: RichText[];
  url?: string;
  properties?: Record<string, JsonValue>;
  archived?: boolean;
}

/** Search envelope. */
export interface NotionSearchResult {
  results: NotionObject[];
  has_more: boolean;
  next_cursor?: string | null;
}

/** Derive a human title from a Notion object's rich-text `title` array. */
export function plainTitle(object: NotionObject): string {
  const text = (object.title ?? [])
    .map((run) => run.plain_text ?? '')
    .join('')
    .trim();
  return text.length > 0 ? text : 'Untitled';
}

/**
 * Live database picker. Independent of any other prop — it searches objects
 * filtered to databases — so it works under today's loader contract and honours
 * the loader `search` term.
 */
export async function databaseOptions(
  http: HttpClient,
  auth: AuthHandle,
  search?: string,
): Promise<DropdownOption<string>[]> {
  const res = await http.post<NotionSearchResult>(`${NOTION_API_BASE}/search`, {
    auth,
    headers: NOTION_HEADERS,
    body: {
      ...(search ? { query: search } : {}),
      filter: { property: 'object', value: 'database' },
      page_size: 100,
    },
  });
  return res.data.results.map((database) => ({ label: plainTitle(database), value: database.id }));
}
