import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listCalendars } from './calendars';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from './events';

/**
 * LIVE smoke tests for Google Calendar via the Composio managed proxy — the rail
 * that fixes the managed-Google defect (design §7). Gated behind ORCHESTR_LIVE +
 * COMPOSIO_API_KEY, and additionally requires a connected account id
 * (GOOGLECALENDAR_CONNECTED_ACCOUNT_ID) — there is NO calendar connection on the
 * shared account yet, so this self-skips until one is created (verification
 * queue: calendar = PENDING).
 *
 * The read path (list_calendars/list_events/the picker) is benign. The
 * create→update→get→delete round-trip is a real WRITE on a throwaway event, so it
 * is gated behind CALENDAR_LIVE_WRITE=1 and always deletes what it created.
 */
const CALENDAR_ACCOUNT = process.env.GOOGLECALENDAR_CONNECTED_ACCOUNT_ID;

const gated = (): jest.It => (CALENDAR_ACCOUNT ? it : it.skip);

liveComposioDescribe('calendar — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: CALENDAR_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  gated()(
    'list_calendars returns real calendars and the picker loads them',
    async () => {
      const out = await listCalendars.execute({ auth, http, props: {} });
      expect(out.count).toBeGreaterThan(0);
      expect(out.calendars[0]).toHaveProperty('id');
      assertNoVendorStrings(out);
      const picker = await createEvent.loadOptions('calendarId', { auth, http });
      expect(picker.disabled).toBe(false);
      expect(picker.options.length).toBeGreaterThan(0);
      console.log(`live: calendar.list_calendars → ${out.count} calendar(s)`);
    },
    30_000,
  );

  gated()(
    'list_events returns real events for the primary calendar',
    async () => {
      const out = await listEvents.execute({ auth, http, props: { calendarId: 'primary', limit: 3 } });
      expect(Array.isArray(out.events)).toBe(true);
      console.log(`live: calendar.google_calendar_get_events → ${out.count} event(s)`);
    },
    30_000,
  );

  // A real WRITE round-trip: create → update → get → delete a throwaway event.
  const maybeWrite = CALENDAR_ACCOUNT && process.env.CALENDAR_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create → update → get → delete a throwaway event on the primary calendar',
    async () => {
      const start = new Date(Date.now() + 3_600_000).toISOString();
      const created = await createEvent.execute({
        auth,
        http,
        props: { calendarId: 'primary', title: `Orchestr SDK live ${start}`, start },
      });
      expect(typeof created.id).toBe('string');
      console.log(`live: calendar.create → ${created.id}`);

      const updated = await updateEvent.execute({
        auth,
        http,
        props: { calendarId: 'primary', eventId: created.id, title: 'Orchestr SDK live (updated)' },
      });
      expect(updated.summary).toBe('Orchestr SDK live (updated)');

      const fetched = await getEvent.execute({
        auth,
        http,
        props: { calendarId: 'primary', eventId: created.id },
      });
      expect(fetched.id).toBe(created.id);
      assertNoVendorStrings(fetched);

      const deleted = await deleteEvent.execute({
        auth,
        http,
        props: { calendarId: 'primary', eventId: created.id },
      });
      expect(deleted).toEqual({ deleted: true, eventId: created.id });
      console.log(`live: calendar.delete → ${created.id}`);
    },
    60_000,
  );
});
