import { transportOf } from './auth';
import { createComposioAuth, createDirectAuth } from './auth-factories';

describe('auth handle opacity', () => {
  const handle = createDirectAuth({ type: 'oauth2' }, { type: 'bearer', token: 'SUPER_SECRET_TOKEN' });

  it('exposes only the scheme type on its public surface', () => {
    expect(Object.keys(handle)).toEqual(['scheme']);
    expect(handle.scheme).toBe('oauth2');
  });

  it('never serialises the credential or transport', () => {
    const serialised = JSON.stringify(handle);
    expect(serialised).toBe('{"scheme":"oauth2"}');
    expect(serialised).not.toContain('SUPER_SECRET_TOKEN');
  });

  it('yields its transport only via transportOf', () => {
    expect(transportOf(handle).kind).toBe('direct');
  });

  it('throws when a bare object masquerades as a handle', () => {
    expect(() => transportOf({ scheme: 'none' })).toThrow(/no transport/);
  });
});

describe('createComposioAuth', () => {
  it('builds a managed handle labelled with the declared scheme type', () => {
    const handle = createComposioAuth({ apiKey: 'K', connectedAccountId: 'ca__1', schemeType: 'oauth2' });
    expect(handle.scheme).toBe('oauth2');
    expect(transportOf(handle).kind).toBe('composio-proxy');
  });

  it('rejects a missing connected account at construction', () => {
    expect(() => createComposioAuth({ apiKey: 'K', connectedAccountId: '' })).toThrow(/connectedAccountId/);
  });
});
