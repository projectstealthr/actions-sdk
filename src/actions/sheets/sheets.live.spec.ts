import type { AuthHandle } from '../../core/auth';
import { createComposioAuth } from '../../core/auth-factories';
import { HttpClient } from '../../core/http/client';
import { composioApiKey, liveComposioDescribe } from '../../testing/live';
import { readRange } from './values';
import { clearSheet, insertRow, updateRow } from './values';
import { createSpreadsheet, listSheets } from './tabs';

/**
 * LIVE smoke tests for Google Sheets via the Composio managed proxy — the rail
 * that fixes the managed-Google defect (ADR 0037/0038). Fully self-contained: it
 * creates a throwaway spreadsheet, writes/reads/updates/clears it, then lists its
 * tabs and exercises the Drive-backed spreadsheet picker. Gated behind
 * ORCHESTR_LIVE + COMPOSIO_API_KEY; self-skips otherwise.
 */
const SHEETS_ACCOUNT = process.env.GOOGLESHEETS_CONNECTED_ACCOUNT_ID ?? 'ca_N_9ktTrHUUqN';

liveComposioDescribe('sheets — live via Composio managed proxy', () => {
  let auth: AuthHandle;
  const http = new HttpClient();
  beforeAll(() => {
    auth = createComposioAuth({
      apiKey: composioApiKey() as string,
      connectedAccountId: SHEETS_ACCOUNT,
      schemeType: 'oauth2',
    });
  });

  function assertNoVendorStrings(value: unknown): void {
    const serialised = JSON.stringify(value).toLowerCase();
    expect(serialised).not.toContain('composio');
  }

  it('creates → appends → reads → updates → clears → lists a throwaway spreadsheet', async () => {
    const created = await createSpreadsheet.execute({
      auth,
      http,
      props: { title: `orchestr-sdk-live ${new Date().toISOString()}` },
    });
    expect(typeof created.spreadsheetId).toBe('string');
    const id = created.spreadsheetId;
    console.log(`live: sheets.create_spreadsheet → ${id}`);

    const appended = await insertRow.execute({
      auth,
      http,
      props: {
        spreadsheetId: id,
        range: 'Sheet1',
        values: [
          ['Name', 'Score'],
          ['Ada', 99],
        ],
      },
    });
    expect(appended.updatedRows).toBe(2);

    const read = await readRange.execute({ auth, http, props: { spreadsheetId: id, range: 'Sheet1!A1:B2' } });
    expect(read.values).toEqual([
      ['Name', 'Score'],
      ['Ada', '99'],
    ]);
    assertNoVendorStrings(read);
    console.log(`live: sheets.read_range → ${JSON.stringify(read.values)}`);

    const updated = await updateRow.execute({
      auth,
      http,
      props: { spreadsheetId: id, range: 'Sheet1!B2', values: ['100'] },
    });
    expect(updated.updatedCells).toBe(1);

    const cleared = await clearSheet.execute({ auth, http, props: { spreadsheetId: id, range: 'Sheet1' } });
    expect(cleared.clearedRange).toContain('Sheet1');

    const tabs = await listSheets.execute({ auth, http, props: { spreadsheetId: id } });
    expect(tabs.count).toBeGreaterThan(0);
    expect(tabs.sheets[0]).toHaveProperty('title');
  }, 60_000);

  it('the spreadsheet picker loads the user’s real spreadsheets', async () => {
    const picker = await readRange.loadOptions('spreadsheetId', { auth, http });
    expect(picker.disabled).toBe(false);
    expect(picker.options.length).toBeGreaterThan(0);
    console.log(`live: sheets spreadsheet picker → ${picker.options.length} spreadsheet(s)`);
  }, 30_000);
});
