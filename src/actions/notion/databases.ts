import { defineAction } from '../../core/action';
import type { JsonValue } from '../../core/http/types';
import { dropdown, json, number, shortText } from '../../core/props';
import {
  databaseOptions,
  NOTION_API_BASE,
  NOTION_HEADERS,
  type NotionObject,
  type NotionSearchResult,
  notionAuth,
} from './common';

/** Public types — stable across the AP→ours upgrade. */
export const SEARCH_TYPE = 'notion.search';
export const GET_DATABASE_TYPE = 'notion.get_database';
export const QUERY_DATABASE_TYPE = 'notion.query_database';

/** Search pages and databases the integration can access. */
export const search = defineAction({
  type: SEARCH_TYPE,
  name: 'Search',
  description: 'Search Notion pages and databases.',
  auth: notionAuth,
  props: {
    query: shortText({ label: 'Query', required: false }),
    filter: dropdown<string, false>({
      label: 'Only',
      required: false,
      options: [
        { label: 'Pages', value: 'page' },
        { label: 'Databases', value: 'database' },
      ],
    }),
    pageSize: number({ label: 'Max results', required: false, defaultValue: 50 }),
  },
  async run({ auth, props, http }): Promise<NotionSearchResult> {
    const body: Record<string, JsonValue> = { page_size: props.pageSize ?? 50 };
    if (props.query !== undefined) body.query = props.query;
    if (props.filter !== undefined) body.filter = { property: 'object', value: props.filter };
    const res = await http.post<NotionSearchResult>(`${NOTION_API_BASE}/search`, {
      auth,
      headers: NOTION_HEADERS,
      body,
    });
    return res.data;
  },
});

/** Retrieve a database's schema and metadata. The database picker is live. */
export const getDatabase = defineAction({
  type: GET_DATABASE_TYPE,
  name: 'Get database',
  description: 'Retrieve a Notion database by id.',
  auth: notionAuth,
  props: {
    databaseId: dropdown<string, true>({
      label: 'Database',
      description: 'Loaded live; type to search.',
      required: true,
      options: ({ auth, http, search: term }) => databaseOptions(http, auth, term),
    }),
  },
  async run({ auth, props, http }): Promise<NotionObject> {
    const res = await http.get<NotionObject>(
      `${NOTION_API_BASE}/databases/${encodeURIComponent(props.databaseId)}`,
      { auth, headers: NOTION_HEADERS },
    );
    return res.data;
  },
});

/**
 * Query the rows (pages) of a database with optional filter/sorts. The database
 * picker is live; the filter is raw Notion JSON (its shape depends on the DB's
 * own columns, which a picker can't yet resolve — see docs/verification-queue.md).
 */
export const queryDatabase = defineAction({
  type: QUERY_DATABASE_TYPE,
  name: 'Query database',
  description: 'Query the pages in a Notion database.',
  auth: notionAuth,
  props: {
    databaseId: dropdown<string, true>({
      label: 'Database',
      required: true,
      options: ({ auth, http, search: term }) => databaseOptions(http, auth, term),
    }),
    filter: json({ label: 'Filter', description: 'Raw Notion filter object.', required: false }),
    sorts: json({ label: 'Sorts', description: 'Raw Notion sorts array.', required: false }),
    pageSize: number({ label: 'Max results', required: false, defaultValue: 50 }),
  },
  async run({ auth, props, http }): Promise<{ results: NotionObject[]; has_more: boolean }> {
    const body: Record<string, JsonValue> = { page_size: props.pageSize ?? 50 };
    if (props.filter !== undefined) body.filter = props.filter;
    if (props.sorts !== undefined) body.sorts = props.sorts;
    const res = await http.post<NotionSearchResult>(
      `${NOTION_API_BASE}/databases/${encodeURIComponent(props.databaseId)}/query`,
      { auth, headers: NOTION_HEADERS, body },
    );
    return { results: res.data.results, has_more: res.data.has_more };
  },
});
