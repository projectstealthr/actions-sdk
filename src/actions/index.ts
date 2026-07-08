/**
 * The clean-room reference catalog. Each entry is a different framework shape
 * (design §9) chosen to surface the SDK's hard cases before scaling:
 *  - slack.send_channel_message — dynamic dropdown (live picker), managed rail
 *  - slack.list_channels        — cursor pagination, managed rail
 *  - github.list_issues         — Link-header pagination, direct rail, apiKey scheme
 *  - slack.new_message          — webhook trigger (app-level: handshake + signature + transform)
 *  - github.new_push            — registered webhook trigger (onEnable/onDisable + signature)
 *  - slack.new_channel          — polling trigger (dedup)
 */
export * as slack from './slack';
export * as github from './github';
export * as jira from './jira';
export * as linear from './linear';
export * as stripe from './stripe';
export * as airtable from './airtable';
export * as calendly from './calendly';
export * as salesforce from './salesforce';
export * as intercom from './intercom';
export * as mailchimp from './mailchimp';
export * as zendesk from './zendesk';
export * as hubspot from './hubspot';
export * as gmail from './gmail';
export * as notion from './notion';
export * as sheets from './sheets';
export * as docs from './docs';
export * as drive from './drive';
export * as slides from './slides';
export * as calendar from './calendar';
export * as asana from './asana';
export * as clickup from './clickup';
export * as todoist from './todoist';
export * as dropbox from './dropbox';
export * as typeform from './typeform';
export * as zoom from './zoom';
export * as outlook from './outlook';

import { newChannel, newMessage } from './slack';
import { getFile, listChannels, sendChannelMessage, uploadFile } from './slack';
import { listIssues, newPush } from './github';
import { jiraActions } from './jira';
import { linearActions } from './linear';
import { stripeActions } from './stripe';
import { airtableActions } from './airtable';
import { calendlyActions } from './calendly';
import { salesforceActions } from './salesforce';
import { intercomActions } from './intercom';
import { mailchimpActions } from './mailchimp';
import { zendeskActions } from './zendesk';
import { hubspotActions } from './hubspot';
import { gmailActions } from './gmail';
import { notionActions } from './notion';
import { sheetsActions } from './sheets';
import { docsActions } from './docs';
import { driveActions } from './drive';
import { slidesActions } from './slides';
import { calendarActions } from './calendar';
import { asanaActions } from './asana';
import { clickupActions } from './clickup';
import { todoistActions } from './todoist';
import { dropboxActions } from './dropbox';
import { typeformActions } from './typeform';
import { zoomActions } from './zoom';
import { outlookActions } from './outlook';

/** Every reference action, for catalog builds and registration. */
export const referenceActions = [sendChannelMessage, listChannels, listIssues, getFile, uploadFile] as const;

/** Every reference trigger. */
export const referenceTriggers = [newMessage, newChannel, newPush] as const;

/**
 * The full clean-room catalog — every app's actions, flattened for catalog
 * builds and provider registration. Grows app-by-app as the SDK scales beyond
 * the reference set.
 */
export const catalogActions = [
  sendChannelMessage,
  listChannels,
  listIssues,
  getFile,
  uploadFile,
  ...jiraActions,
  ...linearActions,
  ...stripeActions,
  ...airtableActions,
  ...calendlyActions,
  ...salesforceActions,
  ...intercomActions,
  ...mailchimpActions,
  ...zendeskActions,
  ...hubspotActions,
  ...gmailActions,
  ...notionActions,
  ...sheetsActions,
  ...docsActions,
  ...driveActions,
  ...slidesActions,
  ...calendarActions,
  ...asanaActions,
  ...clickupActions,
  ...todoistActions,
  ...dropboxActions,
  ...typeformActions,
  ...zoomActions,
  ...outlookActions,
];
