import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { listBases } from './bases';
import { createRecord, deleteRecord, getRecord } from './records';

/**
 * LIVE smoke tests for Airtable via the Composio managed proxy. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY, and additionally requires
 * AIRTABLE_CONNECTED_ACCOUNT_ID; self-skips otherwise (verification queue: airtable).
 *
 * Required env:
 *   AIRTABLE_CONNECTED_ACCOUNT_ID   ca_… for the connected Airtable account
 * WRITE cycle (opt-in — the table picker is picker-blocked, so the table is env):
 *   AIRTABLE_BASE_ID                appXXXXXXXXXXXXXX
 *   AIRTABLE_TABLE_ID               table name or id, pointing at a table WITHOUT
 *                                   required fields (the cycle creates a blank row)
 *
 * READ smoke: `list_bases` (no props) — also exercises the live base picker.
 * WRITE cycle: `create_record` (empty `{}` fields) → `get_record` → `delete_record`.
 * Fully self-cleaning via the authored delete, so re-runs are idempotent.
 */
const AIRTABLE_ACCOUNT = process.env.AIRTABLE_CONNECTED_ACCOUNT_ID;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

liveComposioDescribe('airtable — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: AIRTABLE_ACCOUNT ?? 'ca_MISSING',
      schemeType: 'oauth2',
    });
  });

  const gated = AIRTABLE_ACCOUNT ? it : it.skip;

  gated(
    'list_bases returns real bases and the base picker resolves',
    async () => {
      const out = await listBases.execute({ auth, http, props: {} });
      expect(Array.isArray(out.bases)).toBe(true);
      expect(JSON.stringify(out).toLowerCase()).not.toContain('composio');
      const picker = await createRecord.loadOptions('baseId', { auth, http });
      expect(picker.disabled).toBe(false);
      console.log(`live: airtable.list_bases → ${out.count} base(s)`);
    },
    30_000,
  );

  const maybeWrite = AIRTABLE_ACCOUNT && AIRTABLE_BASE_ID && AIRTABLE_TABLE_ID ? it : it.skip;
  maybeWrite(
    'create_record → get_record → delete_record (self-cleaning)',
    async () => {
      const baseId = AIRTABLE_BASE_ID as string;
      const tableId = AIRTABLE_TABLE_ID as string;
      const created = await createRecord.execute({
        auth,
        http,
        props: { baseId, tableId, fields: {}, typecast: true },
      });
      const recordId = created.id;
      expect(typeof recordId).toBe('string');
      try {
        const fetched = await getRecord.execute({ auth, http, props: { baseId, tableId, recordId } });
        expect(fetched.id).toBe(recordId);
      } finally {
        const deleted = await deleteRecord.execute({ auth, http, props: { baseId, tableId, recordId } });
        expect(deleted.deleted).toBe(true);
      }
      console.log(`live: airtable create→get→delete ${recordId}`);
    },
    60_000,
  );
});
