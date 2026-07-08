export {
  buildRawMessage,
  GMAIL_API_BASE,
  type GmailLabel,
  type GmailMessageRef,
  type GmailProfile,
  gmailAuth,
  labelOptions,
  listGmailLabels,
} from './common';
export {
  GET_MESSAGE_TYPE,
  GET_PROFILE_TYPE,
  type GmailMessage,
  type GmailSendResult,
  getMessage,
  getProfile,
  LIST_MESSAGES_TYPE,
  listMessages,
  SEND_MESSAGE_TYPE,
  sendMessage,
} from './messages';
export { CREATE_DRAFT_TYPE, createDraft, type GmailDraft, LIST_LABELS_TYPE, listLabels } from './labels';

import { createDraft, listLabels } from './labels';
import { getMessage, getProfile, listMessages, sendMessage } from './messages';

/** Every Gmail action, for catalog builds and registration. */
export const gmailActions = [
  getProfile,
  listMessages,
  getMessage,
  sendMessage,
  listLabels,
  createDraft,
] as const;
