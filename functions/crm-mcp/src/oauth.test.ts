import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuthServer, OAuthFehler, redirectPasst, type Ablauf } from './oauth';
import { Siegel } from './siegel';

const BASIS = 'https://crm-mcp.example.run.app';
const schluessel = randomBytes(32).toString('base64');
const person = { email: 'lugge@velonify.de', name: 'Lugge Muster' };

function server(jetzt = () => 1_000_000, fetchFn?: typeof fetch) {
  return new AuthServer({ basis: BASIS, cimdHosts: ['claude.ai'] }, new Siegel(schluessel), fetchFn, jetzt);
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const googleOk = async () => {};

/** Runs registration, authorization and the Google round trip; returns the client's code and the PKCE verifier. */
async function anmelden(auth: AuthServer, redirect = 'https://claude.ai/api/mcp/auth_callback') {
  const client = auth.registriere({ redirect_uris: [redirect], client_name: 'Claude' });
  const { verifier, challenge } = pkce();
  const pruefung = await auth.pruefeAnfrage({
    client_id: client.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    state: 'xyz', resource: `${BASIS}/mcp`,
  });
  if (pruefung.fehler !== undefined) throw new Error(pruefung.fehler);
  const ablauf = auth.oeffneAblauf(auth.versiegleAblauf(pruefung.ablauf)) as Ablauf;
  const ziel = new URL(auth.rueckleitung(ablauf, person, 'google-refresh'));
  return { clientId: client.client_id, verifier, ziel, redirect };
}

describe('OAuth-Ablauf', () => {
  it('führt von der Registrierung bis zum Zugangstoken', async () => {
    const auth = server();
    const { clientId, verifier, ziel, redirect } = await anmelden(auth);
    expect(ziel.origin + ziel.pathname).toBe(redirect);
    expect(ziel.searchParams.get('state')).toBe('xyz');
    expect(ziel.searchParams.get('iss')).toBe(BASIS);

    const tokens = await auth.token(
      { grant_type: 'authorization_code', code: ziel.searchParams.get('code'), client_id: clientId, redirect_uri: redirect, code_verifier: verifier, resource: `${BASIS}/mcp` },
      googleOk,
    );
    expect(tokens.token_type).toBe('Bearer');
    const zugang = auth.pruefeZugang(tokens.access_token);
    expect(zugang).toMatchObject({ email: 'lugge@velonify.de', name: 'Lugge Muster', g: 'google-refresh', aud: `${BASIS}/mcp` });

    const neu = await auth.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }, googleOk);
    expect(auth.pruefeZugang(neu.access_token)?.email).toBe('lugge@velonify.de');
  });

  it('lehnt falschen PKCE-Verifier, fremden Client und falsche redirect_uri ab', async () => {
    const auth = server();
    const { clientId, verifier, ziel, redirect } = await anmelden(auth);
    const code = ziel.searchParams.get('code');
    const basis = { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirect, code_verifier: verifier };

    await expect(auth.token({ ...basis, code_verifier: pkce().verifier }, googleOk)).rejects.toMatchObject({ code: 'invalid_grant' });
    await expect(auth.token({ ...basis, client_id: auth.registriere({ redirect_uris: [redirect] }).client_id }, googleOk)).rejects.toMatchObject({ code: 'invalid_grant' });
    await expect(auth.token({ ...basis, redirect_uri: 'https://claude.ai/anders' }, googleOk)).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('lässt Codes und Zugangstokens ablaufen', async () => {
    let jetzt = 1_000_000;
    const auth = server(() => jetzt);
    const { clientId, verifier, ziel, redirect } = await anmelden(auth);
    const tokens = await auth.token(
      { grant_type: 'authorization_code', code: ziel.searchParams.get('code'), client_id: clientId, redirect_uri: redirect, code_verifier: verifier },
      googleOk,
    );
    jetzt += 3601_000;
    expect(auth.pruefeZugang(tokens.access_token)).toBeNull();
    await expect(
      auth.token({ grant_type: 'authorization_code', code: ziel.searchParams.get('code'), client_id: clientId, redirect_uri: redirect, code_verifier: verifier }, googleOk),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    jetzt += 91 * 24 * 3600_000;
    await expect(auth.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }, googleOk)).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('beendet den Zugang, wenn Google ihn widerrufen hat', async () => {
    const auth = server();
    const { clientId, verifier, ziel, redirect } = await anmelden(auth);
    const tokens = await auth.token(
      { grant_type: 'authorization_code', code: ziel.searchParams.get('code'), client_id: clientId, redirect_uri: redirect, code_verifier: verifier },
      googleOk,
    );
    const widerrufen = async () => {
      throw new OAuthFehler('invalid_grant', 'widerrufen');
    };
    await expect(auth.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }, widerrufen)).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('nimmt kein Token einer anderen Art oder eines anderen Schlüssels an', async () => {
    const auth = server();
    const { ziel } = await anmelden(auth);
    expect(auth.pruefeZugang(ziel.searchParams.get('code')!)).toBeNull();
    const fremd = new AuthServer({ basis: BASIS, cimdHosts: [] }, new Siegel(randomBytes(32).toString('base64')));
    expect(fremd.pruefeZugang('abc')).toBeNull();
  });

  it('weist Anfragen ohne PKCE oder für eine fremde Ressource an den Client zurück', async () => {
    const auth = server();
    const redirect = 'https://claude.ai/api/mcp/auth_callback';
    const { client_id } = auth.registriere({ redirect_uris: [redirect] });
    const ohnePkce = await auth.pruefeAnfrage({ client_id, redirect_uri: redirect, response_type: 'code' });
    expect(ohnePkce.fehler).toBe('invalid_request');
    const fremd = await auth.pruefeAnfrage({
      client_id, redirect_uri: redirect, response_type: 'code', code_challenge: pkce().challenge, code_challenge_method: 'S256', resource: 'https://andere.example/mcp',
    });
    expect(fremd.fehler).toBe('invalid_target');
  });

  it('leitet nie an eine nicht eingetragene redirect_uri', async () => {
    const auth = server();
    const { client_id } = auth.registriere({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    await expect(auth.pruefeAnfrage({ client_id, redirect_uri: 'https://boese.example/cb', response_type: 'code' })).rejects.toBeInstanceOf(OAuthFehler);
    expect(() => auth.registriere({ redirect_uris: ['http://boese.example/cb'] })).toThrow(OAuthFehler);
  });
});

describe('redirectPasst', () => {
  it('ignoriert bei localhost und 127.0.0.1 den Port, sonst nicht', () => {
    const eingetragen = ['http://localhost/callback', 'http://127.0.0.1/callback', 'https://claude.ai/api/mcp/auth_callback'];
    expect(redirectPasst(eingetragen, 'http://localhost:3118/callback')).toBe(true);
    expect(redirectPasst(eingetragen, 'http://127.0.0.1:50211/callback')).toBe(true);
    expect(redirectPasst(eingetragen, 'http://localhost:3118/anders')).toBe(false);
    expect(redirectPasst(eingetragen, 'https://claude.ai:8443/api/mcp/auth_callback')).toBe(false);
    expect(redirectPasst(eingetragen, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });
});

describe('Client ID Metadata Documents', () => {
  const url = 'https://claude.ai/oauth/claude-code-client-metadata';
  const dokument = { client_id: url, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'] };

  it('lädt das Dokument und nimmt die Loopback-Adresse mit beliebigem Port', async () => {
    let abrufe = 0;
    const fetchFn = (async () => {
      abrufe++;
      return new Response(JSON.stringify(dokument), { status: 200 });
    }) as typeof fetch;
    const auth = server(undefined, fetchFn);
    const pruefung = await auth.pruefeAnfrage({
      client_id: url, redirect_uri: 'http://localhost:49152/callback', response_type: 'code', code_challenge: pkce().challenge, code_challenge_method: 'S256',
    });
    expect(pruefung.fehler).toBeUndefined();
    await auth.ladeClient(url);
    expect(abrufe).toBe(1);
  });

  it('holt nichts von fremden Hosts und prüft die client_id im Dokument', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ...dokument, client_id: 'https://claude.ai/anders' }))) as typeof fetch;
    const auth = server(undefined, fetchFn);
    await expect(auth.ladeClient('https://boese.example/client.json')).rejects.toMatchObject({ code: 'invalid_client' });
    await expect(auth.ladeClient(url)).rejects.toMatchObject({ code: 'invalid_client' });
  });
});
