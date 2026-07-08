import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createPresentation, getPresentation } from './presentations';

/**
 * LIVE smoke tests for Google Slides via the Composio managed proxy. Self-contained:
 * creates a throwaway presentation, gets it back. Gated behind ORCHESTR_LIVE +
 * COMPOSIO_API_KEY; self-skips otherwise.
 */
const SLIDES_ACCOUNT = process.env.GOOGLESLIDES_CONNECTED_ACCOUNT_ID ?? 'ca_8UbwbOB4w9nD';

liveComposioDescribe('slides — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: SLIDES_ACCOUNT,
      schemeType: 'oauth2',
    });
  });

  it('creates a throwaway presentation and gets it back', async () => {
    const created = await createPresentation.execute({
      auth,
      http,
      props: { title: `orchestr-sdk-live ${new Date().toISOString()}` },
    });
    expect(typeof created.presentationId).toBe('string');
    const got = await getPresentation.execute({
      auth,
      http,
      props: { presentationId: created.presentationId },
    });
    expect(got.presentationId).toBe(created.presentationId);
    expect(got.slideCount).toBeGreaterThan(0);
    console.log(`live: slides.create_presentation → ${created.presentationId} (${got.slideCount} slide(s))`);
  }, 60_000);
});
