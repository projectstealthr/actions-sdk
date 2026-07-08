export {
  HUBSPOT_API_BASE,
  type HubspotObject,
  type HubspotOwner,
  hubspotAuth,
  listHubspotOwners,
  ownerOptions,
} from './common';
export {
  CREATE_CONTACT_TYPE,
  createContact,
  GET_CONTACT_TYPE,
  getContact,
  LIST_CONTACTS_TYPE,
  listContacts,
  SEARCH_CONTACTS_TYPE,
  searchContacts,
  UPDATE_CONTACT_TYPE,
  updateContact,
} from './contacts';
export { LIST_OWNERS_TYPE, listOwners } from './owners';

import { createContact, getContact, listContacts, searchContacts, updateContact } from './contacts';
import { listOwners } from './owners';

/** Every HubSpot action, for catalog builds and registration. */
export const hubspotActions = [
  createContact,
  getContact,
  updateContact,
  listContacts,
  searchContacts,
  listOwners,
] as const;
