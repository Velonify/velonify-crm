import { createHash } from 'node:crypto';

/** Sheets for the data, Drive for client folders – the same as the hub, without Calendar. */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleKonfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  domain: string;
}

export interface Person {
  email: string;
  name: string;
}

/** Google said the grant is gone (revoked, password changed, expired): the person has to sign in again. */
export class GoogleAbgelaufen extends Error {}

export function googleAnmeldeUrl(konfig: GoogleKonfig, state: string): string {
  const params = new URLSearchParams({
    client_id: konfig.clientId,
    redirect_uri: konfig.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    // A refresh token is only handed out with offline access, and only reliably together with a consent prompt.
    access_type: 'offline',
    prompt: 'consent',
    hd: konfig.domain,
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenAntwort {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenAnfrage(body: Record<string, string>, fetchFn: typeof fetch): Promise<TokenAntwort> {
  const antwort = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const daten = (await antwort.json().catch(() => ({}))) as TokenAntwort;
  if (!antwort.ok) {
    if (daten.error === 'invalid_grant') throw new GoogleAbgelaufen(daten.error_description ?? 'invalid_grant');
    throw new Error(`Google-Anmeldung fehlgeschlagen (${antwort.status}): ${daten.error_description ?? daten.error ?? 'unbekannt'}`);
  }
  return daten;
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so its payload can be read without
 * checking the signature (OpenID Connect Core 3.1.3.7).
 */
function leseIdToken(idToken: string): Record<string, unknown> {
  const teil = idToken.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(teil, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export async function tauscheGoogleCode(
  konfig: GoogleKonfig,
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ person: Person; refreshToken: string }> {
  const daten = await tokenAnfrage(
    { code, client_id: konfig.clientId, client_secret: konfig.clientSecret, redirect_uri: konfig.redirectUri, grant_type: 'authorization_code' },
    fetchFn,
  );
  if (!daten.id_token) throw new Error('Google hat keine Identität geschickt.');
  const claims = leseIdToken(daten.id_token);
  const email = String(claims.email ?? '').toLowerCase();
  const verifiziert = claims.email_verified === true || claims.email_verified === 'true';
  if (!verifiziert || !email.endsWith(`@${konfig.domain}`)) {
    throw new ZugriffVerweigert(`Nur für Konten mit @${konfig.domain}.`);
  }
  const fehlend = GOOGLE_SCOPES.filter((s) => s.startsWith('https://') && !(daten.scope ?? '').split(' ').includes(s));
  if (fehlend.length > 0) throw new ZugriffVerweigert('Bitte bei Google alle Häkchen setzen: Das CRM braucht Sheets und Drive.');
  if (!daten.refresh_token) throw new Error('Google hat kein Refresh-Token geschickt. Bitte die Verbindung neu herstellen.');
  return { person: { email, name: String(claims.name ?? '') }, refreshToken: daten.refresh_token };
}

export class ZugriffVerweigert extends Error {}

const SICHERHEIT_MS = 60_000;

/** Google access tokens per refresh token, so a burst of tool calls asks Google once. */
export class GoogleTokens {
  private readonly cache = new Map<string, { token: string; bis: number }>();

  constructor(
    private readonly konfig: GoogleKonfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly jetzt: () => number = Date.now,
  ) {}

  async zugangstoken(refreshToken: string): Promise<string> {
    const schluessel = createHash('sha256').update(refreshToken).digest('hex');
    const bekannt = this.cache.get(schluessel);
    if (bekannt && bekannt.bis > this.jetzt()) return bekannt.token;

    const daten = await tokenAnfrage(
      { refresh_token: refreshToken, client_id: this.konfig.clientId, client_secret: this.konfig.clientSecret, grant_type: 'refresh_token' },
      this.fetchFn,
    );
    if (!daten.access_token) throw new Error('Google hat kein Zugangstoken geschickt.');
    const bis = this.jetzt() + (daten.expires_in ?? 3600) * 1000 - SICHERHEIT_MS;
    this.cache.set(schluessel, { token: daten.access_token, bis });
    return daten.access_token;
  }

  vergiss(refreshToken: string): void {
    this.cache.delete(createHash('sha256').update(refreshToken).digest('hex'));
  }
}
