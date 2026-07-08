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
];
