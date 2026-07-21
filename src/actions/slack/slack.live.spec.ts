import type { AuthHandle } from '../../core/auth';
import { HttpClient } from '../../core/http/client';
import { composioSlackAuth } from '../../testing/composio';
import { liveComposioDescribe } from '../../testing/live';
import { MemoryStore } from '../../testing/memory-store';
import { listChannels } from './list-channels';
import { newChannel } from './new-channel.polling';
import { sendChannelMessage } from './send-channel-message';

/**
 * LIVE smoke tests (design §7): every reference action runs against the real
 * Slack workspace through the Composio managed proxy and returns real data.
 * Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY; self-skips otherwise. Runs only
 * read-only calls plus (opt-in) one benign write to SLACK_TEST_CHANNEL_ID.
 */
liveComposioDescribe('slack — live via Composio managed proxy', () => {
  // Lazy: the handle is built in beforeAll so a skipped suite never needs the key.
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = composioSlackAuth();
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  it('list_channels returns real channels via cursor pagination', async () => {
    const out = await listChannels.execute({ auth, props: { limit: 500 }, http });
    expect(out.count).toBeGreaterThan(0);
    expect(out.channels[0]).toHaveProperty('id');
    expect(out.channels[0]).toHaveProperty('name');
    assertNoVendorStrings(out);

    console.log(`live: slack.list_channels → ${out.count} real channel(s)`);
  }, 30_000);

  it('the send_channel_message channel picker loads real options live', async () => {
    const result = await sendChannelMessage.loadOptions('channel', { auth, http });
    expect(result.disabled).toBe(false);
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options[0]?.label.startsWith('#')).toBe(true);
    expect(typeof result.options[0]?.value).toBe('string');
    assertNoVendorStrings(result.options);

    console.log(
      `live: channel picker → ${result.options.length} option(s), e.g. ${result.options[0]?.label}`,
    );
  }, 30_000);

  it('new_channel polling emits real channels, then dedupes on the next poll', async () => {
    const store = new MemoryStore();
    const first = await newChannel.runPoll({ auth, props: {}, store });
    expect(first.events.length).toBeGreaterThan(0);
    const second = await newChannel.runPoll({ auth, props: {}, store });
    expect(second.events).toEqual([]);

    console.log(
      `live: slack.new_channel → ${first.events.length} first poll, ${second.events.length} second (deduped)`,
    );
  }, 30_000);

  // One benign write, opt-in only: set SLACK_TEST_CHANNEL_ID to a throwaway channel.
  const writeChannel = process.env.SLACK_TEST_CHANNEL_ID;
  (writeChannel ? it : it.skip)(
    'send_channel_message posts a message and returns a real ts',
    async () => {
      const out = await sendChannelMessage.execute({
        auth,
        http,
        props: {
          channel: writeChannel,
          text: `orchestr-actions-sdk live smoke ${new Date().toISOString()}`,
        },
      });
      expect(out.ok).toBe(true);
      expect(typeof out.ts).toBe('string');
      // Note: we do NOT assert "no vendor strings" here. chat.postMessage echoes
      // the posting bot's identity (bot_profile.name), which for a MANAGED
      // connection is Composio's shared app — genuine provider connection
      // metadata, not our code leaking a vendor string. On a BYO connection the
      // same field carries the customer's own app name. See FRAMEWORK-NOTES.md.
      expect(out.message?.text).toContain('orchestr-actions-sdk live smoke');

      console.log(`live: slack.send_channel_message → posted ts=${out.ts} in ${out.channel}`);
    },
    30_000,
  );
});
