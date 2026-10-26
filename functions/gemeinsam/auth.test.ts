import { describe, expect, it } from 'vitest';
import { Limit, plattformPerson, pruefeGoogleKonto, pruefeGoogleToken, ZugriffsFehler } from './auth';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';

function fakeFetch(body: object, ok = true) {
  let aufrufe = 0;
  const f = (async () => {
    aufrufe++;
    return { ok, json: async () => body } as Response;
  }) as typeof fetch;
  return { f, aufrufe: () => aufrufe };
}

const pruefe = (token: string, body: object, ok = true) =>
  pruefeGoogleToken(token, { clientId: CLIENT_ID, domain: 'velonify.de', fetch: fakeFetch(body, ok).f });

describe('pruefeGoogleToken', () => {
  it('accepts a verified velonify.de token of our client', async () => {
    await expect(
      pruefe('t1', { aud: CLIENT_ID, email: 'Lukas@velonify.de', email_verified: 'true', expires_in: '3000' }),
    ).resolves.toBe('lukas@velonify.de');
  });

  it('rejects tokens of other clients, other domains and unverified addresses', async () => {
    await expect(pruefe('t2', { aud: 'other', email: 'a@velonify.de', email_verified: 'true' })).rejects.toMatchObject({ status: 401 });
    await expect(pruefe('t3', { aud: CLIENT_ID, email: 'a@gmail.com', email_verified: 'true' })).rejects.toMatchObject({ status: 403 });
    await expect(pruefe('t4', { aud: CLIENT_ID, email: 'a@velonify.de', email_verified: 'false' })).rejects.toMatchObject({ status: 403 });
    await expect(pruefe('t5', { aud: CLIENT_ID, email: 'a@notvelonify.de', email_verified: 'true' })).rejects.toMatchObject({ status: 403 });
  });

  it('accepts the tokens of every listed client, e.g. the hub and the CRM MCP server', async () => {
    const zwei = (token: string, aud: string) =>
      pruefeGoogleToken(token, { clientId: `${CLIENT_ID}, mcp-456.apps.googleusercontent.com`, domain: 'velonify.de', fetch: fakeFetch({ aud, email: 'a@velonify.de', email_verified: 'true' }).f });
    await expect(zwei('t7', 'mcp-456.apps.googleusercontent.com')).resolves.toBe('a@velonify.de');
    await expect(zwei('t8', CLIENT_ID)).resolves.toBe('a@velonify.de');
    await expect(zwei('t9', 'other')).rejects.toMatchObject({ status: 401 });
  });

  it('treats a token Google does not know as expired', async () => {
    await expect(pruefe('t6', { error: 'invalid_token' }, false)).rejects.toBeInstanceOf(ZugriffsFehler);
  });

  it('asks Google only once while the result is cached', async () => {
    const { f, aufrufe } = fakeFetch({ aud: CLIENT_ID, email: 'b@velonify.de', email_verified: true, expires_in: 3000 });
    const optionen = { clientId: CLIENT_ID, domain: 'velonify.de', fetch: f };
    await pruefeGoogleToken('t7', optionen);
    await pruefeGoogleToken('t7', optionen);
    expect(aufrufe()).toBe(1);
  });
});

describe('Limit', () => {
  it('allows up to the maximum within the window, then again after it', () => {
    const limit = new Limit(2, 1000);
    expect(limit.erlaubt('a', 0)).toBe(true);
    expect(limit.erlaubt('a', 10)).toBe(true);
    expect(limit.erlaubt('a', 20)).toBe(false);
    expect(limit.erlaubt('b', 20)).toBe(true);
    expect(limit.erlaubt('a', 1011)).toBe(true);
  });
});

describe('pruefeGoogleKonto', () => {
  it('returns any verified address with the client it belongs to, for the tenants of the hub', async () => {
    const f = fakeFetch({ azp: 'mandanten-9', email: 'Leon@Vennie.tech', email_verified: true, expires_in: 3000 }).f;
    await expect(pruefeGoogleKonto('k1', { clientId: `${CLIENT_ID},mandanten-9`, fetch: f })).resolves.toEqual({ email: 'leon@vennie.tech', client: 'mandanten-9' });
    const unbestaetigt = fakeFetch({ aud: CLIENT_ID, email: 'a@gmail.com', email_verified: 'false' }).f;
    await expect(pruefeGoogleKonto('k2', { clientId: CLIENT_ID, fetch: unbestaetigt })).rejects.toMatchObject({ status: 403 });
  });
});

describe('plattformPerson', () => {
  const kopf = (werte: Record<string, string>) => (name: string) => werte[name];
  it('trusts the forwarded person only with the right secret', () => {
    expect(plattformPerson(kopf({ 'x-velonify-plattform': 'geheim', 'x-velonify-person': 'Leon@vennie.tech' }), 'geheim')).toBe('leon@vennie.tech');
    expect(plattformPerson(kopf({ 'x-velonify-plattform': 'falsch', 'x-velonify-person': 'leon@vennie.tech' }), 'geheim')).toBeNull();
    expect(plattformPerson(kopf({ 'x-velonify-plattform': 'geheim', 'x-velonify-person': 'leon@vennie.tech' }), '')).toBeNull();
    expect(plattformPerson(kopf({}), 'geheim')).toBeNull();
  });
});
