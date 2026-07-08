import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createMeeting, deleteMeeting, getMeeting, listMeetings, updateMeeting } from './meetings';

/**
 * LIVE smoke tests for Zoom via the Composio managed proxy. All actions are JSON
 * over the managed rail. Gated behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and
 * additionally requires a connected account id (ZOOM_CONNECTED_ACCOUNT_ID) —
 * there is NO Zoom connection on the shared account yet, so this self-skips until
 * one is created (verification queue: zoom = PENDING).
 *
 * The read path (list_meetings) is benign. The create→update→get→delete
 * round-trip is a real WRITE on a throwaway meeting, gated behind
 * ZOOM_LIVE_WRITE=1 and always cleaned up.
 */
const ZOOM_ACCOUNT = process.env.ZOOM_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('zoom — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: ZOOM_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = ZOOM_ACCOUNT ? it : it.skip;

  gated(
    'lists the connected user’s meetings',
    async () => {
      const out = await listMeetings.execute({ auth, http, props: { limit: 5 } });
      expect(Array.isArray(out.meetings)).toBe(true);
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      console.log(`live: zoom.list_meetings → ${out.count} meeting(s)`);
    },
    30_000,
  );

  const maybeWrite = ZOOM_ACCOUNT && process.env.ZOOM_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create → update → get → delete a throwaway meeting',
    async () => {
      const created = await createMeeting.execute({
        auth,
        http,
        props: {
          topic: `Orchestr SDK live ${new Date().toISOString()}`,
          start_time: new Date(Date.now() + 3_600_000).toISOString(),
          duration: 15,
        },
      });
      expect(typeof created.id).toBe('number');
      const meetingId = String(created.id);
      console.log(`live: zoom.create → ${meetingId}`);

      const updated = await updateMeeting.execute({
        auth,
        http,
        props: { meetingId, topic: 'Orchestr SDK live (updated)' },
      });
      expect(updated.updated).toBe(true);

      const fetched = await getMeeting.execute({ auth, http, props: { meetingId } });
      expect(fetched.topic).toBe('Orchestr SDK live (updated)');

      const deleted = await deleteMeeting.execute({ auth, http, props: { meetingId } });
      expect(deleted).toEqual({ deleted: true, meetingId });
      console.log(`live: zoom.delete → ${meetingId}`);
    },
    60_000,
  );
});
