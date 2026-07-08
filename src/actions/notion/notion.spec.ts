import { HttpClient } from '../../core/http/client';
import type { NormalizedRequest, NormalizedResponse } from '../../core/http/types';
import { FakeTransport, stubAuth } from '../../testing/fakes';
import { plainTitle } from './common';
import { queryDatabase, search } from './databases';
import { createPage } from './pages';

/**
 * Golden offline tests for the Notion actions. A {@link FakeTransport} replays
 * canned responses and records requests, so we assert the Notion-Version header,
 * the search/create bodies, and the live database picker without a connection.
 * Live verification is PENDING a Notion connection — see docs/verification-queue.md.
 */
function fake(handler: (req: NormalizedRequest) => NormalizedResponse) {
  const transport = new FakeTransport(handler);
  return { auth: stubAuth(transport, 'apiKey'), http: new HttpClient(), transport };
}

describe('plainTitle', () => {
  it('joins the rich-text runs, falling back to Untitled', () => {
    expect(
      plainTitle({ id: 'd', object: 'database', title: [{ plain_text: 'My ' }, { plain_text: 'DB' }] }),
    ).toBe('My DB');
    expect(plainTitle({ id: 'd', object: 'database' })).toBe('Untitled');
  });
});

describe('notion.search', () => {
  it('sends the Notion-Version header and an object filter', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { results: [], has_more: false },
    }));
    await search.execute({ auth, http, props: { query: 'roadmap', filter: 'database' } });
    const req = transport.requests[0]!;
    expect(req.url).toBe('https://api.notion.com/v1/search');
    expect(req.headers['notion-version']).toBe('2022-06-28');
    expect(req.body).toEqual({
      page_size: 50,
      query: 'roadmap',
      filter: { property: 'object', value: 'database' },
    });
  });
});

describe('notion.query_database + database picker', () => {
  it('queries the chosen database and the picker maps title→id (with search)', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: {
        results: [{ id: 'db1', object: 'database', title: [{ plain_text: 'Tasks' }] }],
        has_more: false,
      },
    }));
    // Picker resolves databases via /search with the search term.
    const picker = await queryDatabase.loadOptions('databaseId', { auth, http, search: 'Ta' });
    expect(picker.options[0]).toEqual({ label: 'Tasks', value: 'db1' });
    expect((transport.requests[0]!.body as { query?: string }).query).toBe('Ta');

    const out = await queryDatabase.execute({ auth, http, props: { databaseId: 'db1' } });
    expect(out.has_more).toBe(false);
    expect(transport.requests[1]!.url).toBe('https://api.notion.com/v1/databases/db1/query');
  });
});

describe('notion.create_page', () => {
  it('parents the page to the database and passes properties', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { id: 'p1', object: 'page' },
    }));
    await createPage.execute({
      auth,
      http,
      props: { databaseId: 'db1', properties: { Name: { title: [{ text: { content: 'Hi' } }] } } },
    });
    const req = transport.requests[0]!;
    expect(req.url).toBe('https://api.notion.com/v1/pages');
    expect(req.body).toEqual({
      parent: { database_id: 'db1' },
      properties: { Name: { title: [{ text: { content: 'Hi' } }] } },
    });
  });
});
