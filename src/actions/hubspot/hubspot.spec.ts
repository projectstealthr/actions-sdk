import { HttpClient } from '../../core/http/client';
import type { NormalizedRequest, NormalizedResponse } from '../../core/http/types';
import { FakeTransport, stubAuth } from '../../testing/fakes';
import { createContact, listContacts, searchContacts } from './contacts';
import { listOwners } from './owners';

/**
 * Golden offline tests for the HubSpot actions. A {@link FakeTransport} replays
 * canned CRM v3 envelopes and records requests, so we assert the `{ properties }`
 * write shape, `paging.next.after` pagination, the search filterGroups, and the
 * live owner picker without a connection. Live verification is PENDING a HubSpot
 * connection — see docs/verification-queue.md.
 */
const CONTACTS = 'https://api.hubapi.com/crm/v3/objects/contacts';

function fake(handler: (req: NormalizedRequest, i: number) => NormalizedResponse) {
  const transport = new FakeTransport(handler);
  return { auth: stubAuth(transport, 'apiKey'), http: new HttpClient(), transport };
}

describe('hubspot.create_contact', () => {
  it('maps discrete props + owner into a properties body', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 201,
      headers: {},
      data: { id: '1', properties: { email: 'a@b.com' } },
    }));
    const out = await createContact.execute({
      auth,
      http,
      props: {
        email: 'a@b.com',
        firstname: 'Ada',
        ownerId: 'own1',
        additionalProperties: { lifecyclestage: 'lead' },
      },
    });
    expect(out.id).toBe('1');
    expect(transport.requests[0]!.url).toBe(CONTACTS);
    expect(transport.requests[0]!.body).toEqual({
      properties: { email: 'a@b.com', firstname: 'Ada', hubspot_owner_id: 'own1', lifecyclestage: 'lead' },
    });
  });
});

describe('hubspot.list_contacts', () => {
  it('follows the paging.next.after cursor', async () => {
    const { auth, http, transport } = fake((_req, i) =>
      i === 0
        ? {
            status: 200,
            headers: {},
            data: { results: [{ id: '1', properties: {} }], paging: { next: { after: '25' } } },
          }
        : { status: 200, headers: {}, data: { results: [{ id: '2', properties: {} }] } },
    );
    const out = await listContacts.execute({ auth, http, props: { limit: 100 } });
    expect(out.count).toBe(2);
    expect(transport.requests[1]!.url).toContain('after=25');
  });
});

describe('hubspot.search_contacts', () => {
  it('builds a filterGroups body from a property filter', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { results: [], total: 0 },
    }));
    await searchContacts.execute({
      auth,
      http,
      props: { propertyName: 'email', operator: 'EQ', value: 'a@b.com', limit: 10 },
    });
    const req = transport.requests[0]!;
    expect(req.url).toBe(`${CONTACTS}/search`);
    expect(req.body).toEqual({
      limit: 10,
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: 'a@b.com' }] }],
    });
  });
});

describe('hubspot.list_owners + owner picker', () => {
  it('lists owners and the picker maps a display name→id', async () => {
    const { auth, http } = fake(() => ({
      status: 200,
      headers: {},
      data: { results: [{ id: 'own1', email: 'ada@x.com', firstName: 'Ada', lastName: 'L' }] },
    }));
    const out = await listOwners.execute({ auth, http, props: {} });
    expect(out.count).toBe(1);
    const picker = await createContact.loadOptions('ownerId', { auth, http });
    expect(picker.options[0]).toEqual({ label: 'Ada L', value: 'own1' });
  });

  it('the owner picker is inert without a connection', async () => {
    const result = await createContact.loadOptions('ownerId', {});
    expect(result.disabled).toBe(true);
  });
});
