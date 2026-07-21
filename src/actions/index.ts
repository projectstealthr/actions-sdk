/**
 * The clean-room reference catalog + the ported app catalog.
 *
 * Reference shapes (design §9) — one of each hard framework case:
 *  - slack.send_channel_message — dynamic dropdown (live picker), managed rail
 *  - slack.list_channels        — cursor pagination, managed rail
 *  - github.list_issues         — Link-header pagination, direct rail, apiKey scheme
 *  - slack.new_message          — webhook trigger (app-level: handshake + signature + transform)
 *  - github.new_push            — registered webhook trigger (onEnable/onDisable + signature)
 *  - slack.new_channel          — polling trigger (dedup)
 *
 * Ported no-auth utility apps — the self-host core Composio cannot serve, run
 * in-process offline at zero marginal cost. Phase 1 was pure/dependency-free
 * (`http, text, date, math, json, xml, csv, crypto, data_mapper, graphql,
 * hackernews, binance`); phase 2 adds the heavy-lib utilities on vetted
 * permissive dependencies (`pdf`, `qrcode`, plus the markdown/HTML, JSONata,
 * XLSX and XML-parse actions folded into the existing apps). Polling triggers
 * (`http.new_item`, `hackernews.new_story`, `rss.new_item`) exercise the SDK
 * polling framework end to end.
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
// Ported no-auth utility apps.
export * as http from './http';
export * as text from './text';
export * as date from './date';
export * as math from './math';
export * as json from './json';
export * as xml from './xml';
export * as csv from './csv';
export * as crypto from './crypto';
export * as data_mapper from './data-mapper';
export * as graphql from './graphql';
export * as hackernews from './hackernews';
export * as binance from './binance';
export * as pdf from './pdf';
export * as qrcode from './qrcode';
export * as rss from './rss';

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
// Ported utility apps: action arrays + polling triggers.
import { httpActions, newItem as httpNewItem } from './http';
import { textActions } from './text';
import { dateActions } from './date';
import { mathActions } from './math';
import { jsonActions } from './json';
import { xmlActions } from './xml';
import { csvActions } from './csv';
import { cryptoActions } from './crypto';
import { dataMapperActions } from './data-mapper';
import { graphqlActions } from './graphql';
import { hackernewsActions, newStory as hackernewsNewStory } from './hackernews';
import { binanceActions } from './binance';
import { pdfActions } from './pdf';
import { qrcodeActions } from './qrcode';
import { newItem as rssNewItem } from './rss';

/** Every reference trigger. */
export const referenceTriggers = [newMessage, newChannel, newPush] as const;

/**
 * The native no-auth utility actions, grouped for discoverability. These need no
 * credential (`none` scheme), run in-process at zero marginal cost, and work
 * offline — the self-host core carries them first.
 */
export const utilityActions = [
  ...httpActions,
  ...textActions,
  ...dateActions,
  ...mathActions,
  ...jsonActions,
  ...xmlActions,
  ...csvActions,
  ...cryptoActions,
  ...dataMapperActions,
  ...graphqlActions,
  ...hackernewsActions,
  ...binanceActions,
  ...pdfActions,
  ...qrcodeActions,
];

/**
 * Every registered polling trigger, flattened for catalog projection + runtime
 * registration — the polling counterpart of {@link catalogActions}. A consumer
 * projects each via `.toManifest()` (same path the action registry uses) and
 * drives one poll via `.runPoll({ auth, props, store })`; the SDK returns only
 * events unseen since the stored cursor (watermark + bounded dedup set).
 */
export const pollingTriggers = [newChannel, httpNewItem, hackernewsNewStory, rssNewItem] as const;

/** Every trigger the SDK ships — webhook + polling — for a unified catalog build. */
export const catalogTriggers = [newMessage, newPush, ...pollingTriggers];

/**
 * The full clean-room catalog — every app's actions, flattened for catalog
 * builds and provider registration. Grows app-by-app as the SDK scales.
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
  ...utilityActions,
];
