import { HttpClient } from '../../core/http/client';
import type { NormalizedRequest, NormalizedResponse } from '../../core/http/types';
import { FakeTransport, stubAuth } from '../../testing/fakes';
import { addComment, listComments } from './comments';
import { createIssue, getIssue, searchIssues, updateIssue } from './issues';

/**
 * Golden offline tests for the Jira actions. A {@link FakeTransport} replays a
 * canned Jira REST v3 response and records the request our action built, so we
 * assert both the request shaping (ADF, project/issue-type refs, JQL body) and
 * the response shaping without a live connection. Live verification is PENDING a
 * Jira connection — see docs/verification-queue.md.
 */
const INSTANCE = 'https://acme.atlassian.net';

function fake(handler: (req: NormalizedRequest) => NormalizedResponse) {
  const transport = new FakeTransport(handler);
  return { auth: stubAuth(transport, 'basic'), http: new HttpClient(), transport };
}

function assertNoVendorStrings(value: unknown): void {
  const serialised = JSON.stringify(value).toLowerCase();
  expect(serialised).not.toContain('composio');
  expect(serialised).not.toContain('activepieces');
}

describe('jira.create_issue', () => {
  it('shapes project/issue-type refs and an ADF description, and returns the ref', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 201,
      headers: {},
      data: { id: '10042', key: 'ENG-42', self: `${INSTANCE}/rest/api/3/issue/10042` },
    }));

    const out = await createIssue.execute({
      auth,
      http,
      props: {
        instanceUrl: INSTANCE,
        project: 'ENG',
        issueType: 'Task',
        summary: 'Ship the SDK',
        description: 'Do the thing',
      },
    });

    expect(out).toEqual({ id: '10042', key: 'ENG-42', self: `${INSTANCE}/rest/api/3/issue/10042` });

    const req = transport.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe(`${INSTANCE}/rest/api/3/issue`);
    const fields = (req.body as { fields: Record<string, unknown> }).fields;
    expect(fields.project).toEqual({ key: 'ENG' });
    expect(fields.issuetype).toEqual({ name: 'Task' });
    expect(fields.summary).toBe('Ship the SDK');
    expect(fields.description).toEqual({
      version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do the thing' }] }],
    });
    assertNoVendorStrings(out);
  });

  it('treats a numeric project as an id and merges additionalFields', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 201,
      headers: {},
      data: { id: '1', key: 'X-1', self: 'x' },
    }));
    await createIssue.execute({
      auth,
      http,
      props: {
        instanceUrl: INSTANCE,
        project: '10001',
        issueType: 'Bug',
        summary: 'x',
        additionalFields: { labels: ['urgent'] },
      },
    });
    const fields = (transport.requests[0]!.body as { fields: Record<string, unknown> }).fields;
    expect(fields.project).toEqual({ id: '10001' });
    expect(fields.labels).toEqual(['urgent']);
  });
});

describe('jira.get_issue', () => {
  it('requests the issue with the expand query and returns it', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { id: '10042', key: 'ENG-42', self: 'x', fields: { summary: 'hi' } },
    }));
    const out = await getIssue.execute({
      auth,
      http,
      props: { instanceUrl: INSTANCE, issueIdOrKey: 'ENG-42', expand: 'changelog' },
    });
    expect(out.key).toBe('ENG-42');
    expect(transport.requests[0]!.url).toBe(`${INSTANCE}/rest/api/3/issue/ENG-42?expand=changelog`);
  });
});

describe('jira.update_issue', () => {
  it('sends only the supplied fields with returnIssue=true', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { id: '1', key: 'ENG-1', self: 'x' },
    }));
    await updateIssue.execute({
      auth,
      http,
      props: { instanceUrl: INSTANCE, issueIdOrKey: 'ENG-1', summary: 'new title' },
    });
    const req = transport.requests[0]!;
    expect(req.method).toBe('PUT');
    expect(req.url).toBe(`${INSTANCE}/rest/api/3/issue/ENG-1?returnIssue=true`);
    expect((req.body as { fields: Record<string, unknown> }).fields).toEqual({ summary: 'new title' });
  });
});

describe('jira.search_issues', () => {
  it('POSTs JQL with a navigable-fields default', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { issues: [{ id: '1', key: 'ENG-1', self: 'x' }], isLast: true },
    }));
    const out = await searchIssues.execute({
      auth,
      http,
      props: { instanceUrl: INSTANCE, jql: 'project = ENG' },
    });
    expect(out.issues).toHaveLength(1);
    expect(transport.requests[0]!.url).toBe(`${INSTANCE}/rest/api/3/search/jql`);
    expect(transport.requests[0]!.body).toEqual({
      jql: 'project = ENG',
      maxResults: 50,
      fields: ['*navigable'],
    });
  });
});

describe('jira.add_comment', () => {
  it('wraps plain text as ADF', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 201,
      headers: {},
      data: { id: '9', self: 'x' },
    }));
    await addComment.execute({
      auth,
      http,
      props: { instanceUrl: INSTANCE, issueIdOrKey: 'ENG-1', comment: 'looks good' },
    });
    expect(transport.requests[0]!.url).toBe(`${INSTANCE}/rest/api/3/issue/ENG-1/comment`);
    expect(transport.requests[0]!.body).toEqual({
      body: {
        version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'looks good' }] }],
      },
    });
  });
});

describe('jira.list_comments', () => {
  it('reads a page and returns comments + total', async () => {
    const { auth, http, transport } = fake(() => ({
      status: 200,
      headers: {},
      data: { comments: [{ id: '9', self: 'x' }], total: 1, startAt: 0, maxResults: 50 },
    }));
    const out = await listComments.execute({
      auth,
      http,
      props: { instanceUrl: INSTANCE, issueIdOrKey: 'ENG-1' },
    });
    expect(out.total).toBe(1);
    expect(out.comments).toHaveLength(1);
    expect(transport.requests[0]!.url).toContain('orderBy=-created');
    expect(transport.requests[0]!.url).toContain('expand=renderedBody');
  });
});
