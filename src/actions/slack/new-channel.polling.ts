import { defineTrigger } from '../../core/trigger';
import { dropdown } from '../../core/props';
import { slackOAuth } from './common';
import { listSlackChannels, type SlackChannel } from './list-channels';

/** Public type for the polling trigger. */
export const NEW_CHANNEL_TYPE = 'slack.new_channel';

/**
 * A polling trigger (proves the polling strategy end to end): each poll lists
 * the workspace's channels; the SDK dedupes by channel id against the store, so
 * only channels not seen before fire. Uses only `channels:read` — the scope the
 * live harness has proven — so it is genuinely live-testable, and re-polling the
 * same set emits nothing (the dedup contract).
 */
export const newChannel = defineTrigger({
  type: NEW_CHANNEL_TYPE,
  strategy: 'polling',
  name: 'New channel',
  description: 'Fires when a new channel appears in the workspace.',
  auth: slackOAuth,
  props: {
    types: dropdown<string, false>({
      label: 'Channel types',
      required: false,
      defaultValue: 'public_channel',
      options: [
        { label: 'Public channels', value: 'public_channel' },
        { label: 'Public and private', value: 'public_channel,private_channel' },
      ],
    }),
  },
  async poll({ auth, props, http }): Promise<SlackChannel[]> {
    return listSlackChannels(http, auth, { types: props.types ?? 'public_channel', maxItems: 1000 });
  },
  dedupeKey: (channel) => channel.id,
});
