import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { createRecord, deleteRecord, getRecord, runQuery } from './records';

/**
 * LIVE smoke tests for Salesforce via the Composio managed proxy. Salesforce is
 * instance-scoped, so every call is rooted at the org's `instance_url`. Gated
 * behind ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * SALESFORCE_CONNECTED_ACCOUNT_ID AND SALESFORCE_INSTANCE_URL; self-skips when any
 * is absent (verification queue: salesforce).
 *
 * Required env:
 *   SALESFORCE_CONNECTED_ACCOUNT_ID  ca_… for the connected Salesforce account
 *   SALESFORCE_INSTANCE_URL          https://<org>.my.salesforce.com
 *   SALESFORCE_API_VERSION           optional; defaults to v58.0
 * WRITE cycle (opt-in):
 *   SALESFORCE_LIVE_WRITE=1
 *
 * READ smoke: `run_query` with a benign SOQL (`SELECT Id FROM Account LIMIT 1`).
 * WRITE cycle: `create_record` a Contact (only LastName, a required field) →
 * `get_record` → `delete_record`. Fully self-cleaning via the authored delete.
 */
const SF_ACCOUNT = process.env.SALESFORCE_CONNECTED_ACCOUNT_ID;
const SF_INSTANCE_URL = process.env.SALESFORCE_INSTANCE_URL;
const canRead = Boolean(SF_ACCOUNT && SF_INSTANCE_URL);
const instanceUrl = SF_INSTANCE_URL ?? 'https://missing.my.salesforce.com';
const apiVersion = process.env.SALESFORCE_API_VERSION ?? 'v58.0';

liveComposioDescribe('salesforce — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: SF_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = canRead ? it : it.skip;

  gated(
    'run_query returns records (benign SOQL)',
    async () => {
      const out = await runQuery.execute({
        auth,
        http,
        props: { instanceUrl, apiVersion, query: 'SELECT Id FROM Account LIMIT 1' },
      });
      expect(typeof out.totalSize).toBe('number');
      expect(Array.isArray(out.records)).toBe(true);
      console.log(`live: salesforce.run_query → totalSize ${out.totalSize}`);
    },
    30_000,
  );

  const maybeWrite = canRead && process.env.SALESFORCE_LIVE_WRITE === '1' ? it : it.skip;
  maybeWrite(
    'create Contact → get_record → delete_record (self-cleaning)',
    async () => {
      const sobject = 'Contact';
      const created = await createRecord.execute({
        auth,
        http,
        props: { instanceUrl, apiVersion, sobject, fields: { LastName: `Orchestr SDK live ${Date.now()}` } },
      });
      expect(created.success).toBe(true);
      const recordId = created.id;
      try {
        const fetched = await getRecord.execute({
          auth,
          http,
          props: { instanceUrl, apiVersion, sobject, recordId, fields: 'Id,LastName' },
        });
        expect((fetched as { Id?: string }).Id).toBe(recordId);
      } finally {
        const deleted = await deleteRecord.execute({
          auth,
          http,
          props: { instanceUrl, apiVersion, sobject, recordId },
        });
        expect(deleted.success).toBe(true);
      }
      console.log(`live: salesforce Contact create→get→delete ${recordId}`);
    },
    60_000,
  );
});
