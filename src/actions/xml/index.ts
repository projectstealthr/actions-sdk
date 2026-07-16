export { convertJsonToXml, JSON_TO_XML_TYPE, type JsonToXmlResult } from './xml';

import { convertJsonToXml } from './xml';

/** Every XML action, for catalog builds and registration. */
export const xmlActions = [convertJsonToXml] as const;
