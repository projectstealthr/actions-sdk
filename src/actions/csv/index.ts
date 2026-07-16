export {
  CSV_TO_JSON_TYPE,
  convertCsvToJson,
  convertJsonToCsv,
  type CsvToJsonResult,
  JSON_TO_CSV_TYPE,
  type JsonToCsvResult,
} from './csv';

import { convertCsvToJson, convertJsonToCsv } from './csv';

/** Every CSV action, for catalog builds and registration. */
export const csvActions = [convertCsvToJson, convertJsonToCsv] as const;
