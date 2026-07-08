export {
  type SalesforceQueryResult,
  type SalesforceWriteResult,
  salesforceAuth,
  salesforceBaseUrl,
} from './common';
export {
  CREATE_RECORD_TYPE,
  createRecord,
  DELETE_RECORD_TYPE,
  deleteRecord,
  GET_RECORD_TYPE,
  getRecord,
  RUN_QUERY_TYPE,
  runQuery,
  SEARCH_TYPE,
  search,
  UPDATE_RECORD_TYPE,
  updateRecord,
} from './records';

import { createRecord, deleteRecord, getRecord, runQuery, search, updateRecord } from './records';

/** Every Salesforce action, for catalog builds and registration. */
export const salesforceActions = [
  runQuery,
  search,
  createRecord,
  getRecord,
  updateRecord,
  deleteRecord,
] as const;
