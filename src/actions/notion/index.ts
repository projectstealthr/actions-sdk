export {
  databaseOptions,
  NOTION_API_BASE,
  type NotionObject,
  type NotionSearchResult,
  notionAuth,
  plainTitle,
} from './common';
export {
  GET_DATABASE_TYPE,
  getDatabase,
  QUERY_DATABASE_TYPE,
  queryDatabase,
  SEARCH_TYPE,
  search,
} from './databases';
export { CREATE_PAGE_TYPE, createPage, GET_PAGE_TYPE, getPage, UPDATE_PAGE_TYPE, updatePage } from './pages';

import { getDatabase, queryDatabase, search } from './databases';
import { createPage, getPage, updatePage } from './pages';

/** Every Notion action, for catalog builds and registration. */
export const notionActions = [search, getDatabase, queryDatabase, createPage, getPage, updatePage] as const;
