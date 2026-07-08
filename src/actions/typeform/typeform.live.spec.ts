import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { getForm, getFormFields, listFormsAction } from './forms';
import { listResponses } from './responses';

/**
 * LIVE smoke tests for Typeform via the Composio managed proxy. All actions are
 * benign reads over JSON — they stay on the managed rail. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires a connected account
 * id (TYPEFORM_CONNECTED_ACCOUNT_ID) — there is NO Typeform connection on the
 * shared account yet, so this self-skips until one is created (verification queue:
 * typeform = PENDING).
 */
const TYPEFORM_ACCOUNT = process.env.TYPEFORM_CONNECTED_ACCOUNT_ID;

liveComposioDescribe('typeform — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: TYPEFORM_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = TYPEFORM_ACCOUNT ? it : it.skip;

  gated(
    'lists forms and the picker loads them',
    async () => {
      const out = await listFormsAction.execute({ auth, http, props: { limit: 5 } });
      expect(Array.isArray(out.forms)).toBe(true);
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      const picker = await getForm.loadOptions('formId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: typeform.list_forms → ${out.count} form(s)`);
    },
    30_000,
  );

  gated(
    'reads the first form’s fields and responses',
    async () => {
      const forms = await listFormsAction.execute({ auth, http, props: { limit: 1 } });
      const formId = forms.forms[0]?.id;
      if (!formId) {
        console.log('live: typeform — account has no forms; skipping field/response read');
        return;
      }
      const fields = await getFormFields.execute({ auth, http, props: { formId } });
      expect(Array.isArray(fields.fields)).toBe(true);
      const responses = await listResponses.execute({ auth, http, props: { formId, limit: 3 } });
      expect(Array.isArray(responses.responses)).toBe(true);
      console.log(`live: typeform.get_form_fields → ${fields.count}; list_responses → ${responses.count}`);
    },
    45_000,
  );
});
