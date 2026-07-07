/**
 * The clean-room reference catalog. Each entry is a different framework shape
 * (design §9) chosen to surface the SDK's hard cases before scaling:
 *  - slack.send_channel_message — dynamic dropdown (live picker), managed rail
 *  - slack.list_channels        — cursor pagination, managed rail
 *  - github.list_issues         — Link-header pagination, direct rail, apiKey scheme
 *  - slack.new_message          — webhook trigger (handshake + signature + transform)
 *  - slack.new_channel          — polling trigger (dedup)
 */
export * as slack from './slack';
export * as github from './github';

import { newChannel, newMessage } from './slack';
import { listChannels, sendChannelMessage } from './slack';
import { listIssues } from './github';

/** Every reference action, for catalog builds and registration. */
export const referenceActions = [sendChannelMessage, listChannels, listIssues] as const;

/** Every reference trigger. */
export const referenceTriggers = [newMessage, newChannel] as const;
