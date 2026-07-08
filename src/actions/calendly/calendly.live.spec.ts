import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getCurrentUserAction, getScheduledEvent, listEventTypes, listScheduledEvents } from './events';

/**
 * LIVE smoke tests for Calendly via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * CALENDLY_CONNECTED_ACCOUNT_ID; self-skips otherwise (verification queue: calendly).
 *
 * Required env:
 *   CALENDLY_CONNECTED_ACCOUNT_ID   ca_… for the connected Calendly account
 *
 * READ-ONLY. Calendly's only authored write is `cancel_scheduled_event`, which is
 * destructive and NOT reversible (a canceled booking can't be un-canceled and
 * would disrupt a real invitee), and there is no authored "create event" verb — so
 * per the batch guard-rail this stays read-only. Reads: current user, event types,
 * scheduled events, and the live scheduled-event picker.
 */
const CALENDLY_ACCOUNT = process.env.CALENDLY_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('calendly — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: CALENDLY_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
    expect(serialised).not.toContain('activepieces');
  }

  const gated = CALENDLY_ACCOUNT ? it : it.skip;

  gated(
    'get_current_user + event types + scheduled events + event picker (read-only)',
    async () => {
      const user = await getCurrentUserAction.execute({ auth, http, props: {} });
      expect(typeof user.uri).toBe('string');
      expect(user.email).toContain('@');
      assertNoVendorStrings(user);

      const types = await listEventTypes.execute({ auth, http, props: {} });
      expect(Array.isArray(types.eventTypes)).toBe(true);

      const events = await listScheduledEvents.execute({ auth, http, props: { count: 5 } });
      expect(Array.isArray(events.events)).toBe(true);

      const picker = await getScheduledEvent.loadOptions('eventUuid', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(
        `live: calendly.get_current_user → ${user.email}; ${types.count} type(s), ${events.count} event(s)`,
      );
    },
    45_000,
  );
});
