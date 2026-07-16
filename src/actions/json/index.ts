export {
  convertJsonToText,
  convertTextToJson,
  JSON_TO_TEXT_TYPE,
  type JsonToTextResult,
  MERGE_JSON_TYPE,
  mergeJson,
  type MergeJsonResult,
  TEXT_TO_JSON_TYPE,
  type TextToJsonResult,
} from './json';

import { convertJsonToText, convertTextToJson, mergeJson } from './json';

/** Every JSON action, for catalog builds and registration. */
export const jsonActions = [convertJsonToText, convertTextToJson, mergeJson] as const;
