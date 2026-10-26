import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestToken } from './google';

/** A stand-in for Google's token client that answers at once and grants `erteilt`. */
function googleMit(erteilt: string[]) {
  const revoke = vi.fn();
  vi.stubGlobal('window', {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback(r: unknown): void }) => ({
            requestAccessToken: () => config.callback({ access_token: 'token', expires_in: '3600', scope: erteilt.join(' ') }),
          }),
          // Like Google: asked about no scopes at all, it says no.
          hasGrantedAllScopes: (_r: unknown, ...scopes: string[]) => scopes.length > 0 && scopes.every((s) => erteilt.includes(s)),
          revoke,
        },
      },
    },
  });
  return revoke;
}

describe('requestToken', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets tenants in with only openid, email and profile', async () => {
    googleMit(['openid', 'email', 'profile']);
    await expect(requestToken({ clientId: 'c', scopes: ['openid', 'email', 'profile'] })).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('still insists on every API scope in Velonify’s own hub', async () => {
    const drive = 'https://www.googleapis.com/auth/drive';
    const revoke = googleMit(['openid', 'email']);
    await expect(requestToken({ clientId: 'c', scopes: ['openid', 'email', drive] })).rejects.toThrow(/alle Berechtigungen/);
    expect(revoke).toHaveBeenCalledWith('token');
  });
});
