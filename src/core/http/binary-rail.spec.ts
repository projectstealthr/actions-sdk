import { ActionError } from '../errors';
import { fakeFetch, fakeResponse, stubAuth } from '../../testing/fakes';
import { HttpClient } from './client';
import { buildMultipart } from './multipart';
import { ComposioProxyTransport } from './transport-composio';
import { DirectTransport } from './transport-direct';
import type { NormalizedRequest } from './types';

/**
 * The file/binary rail across the two transports (docs/FRAMEWORK-NOTES.md §B):
 * the direct rail carries multipart uploads and binary downloads natively; the
 * managed proxy carries JSON only and must reject both loudly.
 */

describe('DirectTransport — multipart upload', () => {
  it('encodes a multipart body to raw bytes over the wire with a boundary content-type', async () => {
    const fetchImpl = fakeFetch(() => fakeResponse(200, 'OK', { 'content-type': 'text/plain' }));
    const t = new DirectTransport({ scheme: { type: 'none' }, credential: { type: 'none' }, fetchImpl });
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const req: NormalizedRequest = {
      method: 'POST',
      url: 'https://up.test/x',
      headers: {},
      body: buildMultipart({ fields: { title: 'r' }, files: { file: { filename: 'r.bin', data: bytes } } }),
    };
    await t.send(req);

    const init = fetchImpl.calls[0]?.init;
    expect(String(init?.headers?.['content-type'])).toMatch(/^multipart\/form-data; boundary=----orchestr-/);
    expect(Buffer.isBuffer(init?.body)).toBe(true);
    const wire = init?.body as Buffer;
    // The raw upload bytes survive verbatim inside the encoded body.
    expect(wire.includes(bytes)).toBe(true);
    expect(wire.toString('latin1')).toContain('filename="r.bin"');
  });
});

describe('DirectTransport — binary download', () => {
  it('returns the raw response bytes as a Buffer, never text-decoded', async () => {
    // Bytes that are NOT valid UTF-8 — a text decode would corrupt them.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);
    const fetchImpl = fakeFetch(() => fakeResponse(200, png, { 'content-type': 'image/png' }));
    const t = new DirectTransport({ scheme: { type: 'none' }, credential: { type: 'none' }, fetchImpl });

    const res = await t.send({
      method: 'GET',
      url: 'https://dl.test/x.png',
      headers: {},
      responseType: 'binary',
    });
    expect(Buffer.isBuffer(res.data)).toBe(true);
    expect(res.data).toEqual(png);
  });

  it('still parses JSON when responseType is not binary', async () => {
    const fetchImpl = fakeFetch(() =>
      fakeResponse(200, '{"ok":true}', { 'content-type': 'application/json' }),
    );
    const t = new DirectTransport({ scheme: { type: 'none' }, credential: { type: 'none' }, fetchImpl });
    const res = await t.send({ method: 'GET', url: 'https://dl.test/x', headers: {} });
    expect(res.data).toEqual({ ok: true });
  });
});

describe('ComposioProxyTransport — files rejected loudly (JSON-only rail)', () => {
  const proxy = (): ComposioProxyTransport =>
    new ComposioProxyTransport({
      apiKey: 'k',
      connectedAccountId: 'ca__x',
      fetchImpl: fakeFetch(() => fakeResponse(200, '{"data":{}}', { 'content-type': 'application/json' })),
    });

  it('rejects a multipart upload with an actionable, non-retryable error', async () => {
    await expect(
      proxy().send({
        method: 'POST',
        url: 'https://api.test/x',
        headers: {},
        body: buildMultipart({ files: { file: { filename: 'a', data: Buffer.from('x') } } }),
      }),
    ).rejects.toMatchObject({ code: 'unsupported_body', retryable: false });
  });

  it('rejects a binary download request', async () => {
    await expect(
      proxy().send({ method: 'GET', url: 'https://api.test/x', headers: {}, responseType: 'binary' }),
    ).rejects.toBeInstanceOf(ActionError);
  });
});

describe('managed-vs-direct routing (same action code, opposite outcomes)', () => {
  const multipartReq = (): Parameters<HttpClient['post']>[1] => ({
    auth: stubAuth(new DirectTransport({ scheme: { type: 'none' }, credential: { type: 'none' } })),
    multipart: { files: { file: { filename: 'a.bin', data: Buffer.from('bytes') } } },
  });

  it('the SAME multipart upload succeeds on the direct rail and fails on the managed rail', async () => {
    const client = new HttpClient();

    // Direct rail: succeeds.
    const directFetch = fakeFetch(() => fakeResponse(200, 'OK', { 'content-type': 'text/plain' }));
    const directAuth = stubAuth(
      new DirectTransport({ scheme: { type: 'none' }, credential: { type: 'none' }, fetchImpl: directFetch }),
    );
    const ok = await client.post('https://up.test/x', {
      ...multipartReq(),
      auth: directAuth,
    });
    expect(ok.status).toBe(200);

    // Managed rail: same call, rejected before it ever reaches the proxy.
    const managedAuth = stubAuth(
      new ComposioProxyTransport({
        apiKey: 'k',
        connectedAccountId: 'ca__x',
        fetchImpl: fakeFetch(() => fakeResponse(200, '{"data":{}}', { 'content-type': 'application/json' })),
      }),
    );
    await expect(
      client.post('https://up.test/x', { ...multipartReq(), auth: managedAuth }),
    ).rejects.toMatchObject({ code: 'unsupported_body' });
  });
});
