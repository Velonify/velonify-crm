import { createHash } from 'node:crypto';
import type { Person } from './google';
import type { Siegel } from './siegel';

/**
 * The OAuth authorization server Claude signs in with. It hands the actual sign-in to Google and keeps the
 * Google refresh token sealed inside its own codes and tokens, so nothing has to be stored.
 *
 * Clients identify themselves with a Client ID Metadata Document (claude.ai, Claude Code) or register
 * dynamically; registered clients are sealed into their client_id as well.
 */

const MINUTE = 60_000;
const ABLAUF_MS = 15 * MINUTE;
const CODE_MS = 5 * MINUTE;
const ZUGANG_S = 3600;
/** Sign in with Google again at least every 90 days. */
const ANMELDUNG_MS = 90 * 24 * 60 * MINUTE;
const CIMD_CACHE_MS = 10 * MINUTE;

export const SCOPE = 'crm';

export interface OAuthKonfig {
  /** Origin of the function, e.g. https://crm-mcp-….run.app – issuer and base of all endpoints */
  basis: string;
  /** Hosts whose Client ID Metadata Documents are fetched */
  cimdHosts: readonly string[];
}

export interface Client {
  id: string;
  name: string;
  redirect_uris: string[];
}

/** State of a sign-in while the person is at Google. */
export interface Ablauf {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  exp: number;
}

interface Code {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  g: string;
  email: string;
  name: string;
  /** When the person signed in with Google */
  start: number;
  exp: number;
}

export interface Zugang {
  aud: string;
  g: string;
  email: string;
  name: string;
  exp: number;
}

interface Erneuerung {
  client_id: string;
  g: string;
  email: string;
  name: string;
  start: number;
  exp: number;
}

export class OAuthFehler extends Error {
  constructor(
    readonly code: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unsupported_grant_type' | 'invalid_client_metadata' | 'invalid_redirect_uri',
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }

  get antwort() {
    return { error: this.code, error_description: this.message };
  }
}

export const ressourceUrl = (basis: string) => `${basis}/mcp`;

export function schutzMetadaten(konfig: OAuthKonfig) {
  return {
    resource: ressourceUrl(konfig.basis),
    authorization_servers: [konfig.basis],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Velonify CRM',
  };
}

export function serverMetadaten(konfig: OAuthKonfig) {
  return {
    issuer: konfig.basis,
    authorization_endpoint: `${konfig.basis}/authorize`,
    token_endpoint: `${konfig.basis}/token`,
    registration_endpoint: `${konfig.basis}/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function istLoopback(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK.has(url.hostname);
}

/** Only https, or http on the own machine (Claude Code's callback). */
function erlaubteRedirectUri(wert: string): boolean {
  try {
    const url = new URL(wert);
    return !url.hash && (url.protocol === 'https:' || istLoopback(url));
  } catch {
    return false;
  }
}

/**
 * Exact match, except that loopback redirects ignore the port: Claude Code picks a free port per sign-in
 * (RFC 8252 7.3), and its metadata declares localhost as well as 127.0.0.1.
 */
export function redirectPasst(registriert: readonly string[], angefragt: string): boolean {
  if (registriert.includes(angefragt)) return true;
  let ziel: URL;
  try {
    ziel = new URL(angefragt);
  } catch {
    return false;
  }
  if (!istLoopback(ziel)) return false;
  return registriert.some((r) => {
    try {
      const url = new URL(r);
      return istLoopback(url) && url.hostname === ziel.hostname && url.pathname === ziel.pathname && url.search === ziel.search;
    } catch {
      return false;
    }
  });
}

/** S256 PKCE: BASE64URL(SHA256(verifier)) must equal the challenge from the authorization request. */
export const pkcePasst = (verifier: string, challenge: string) =>
  /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) && createHash('sha256').update(verifier).digest('base64url') === challenge;

const text = (wert: unknown) => (typeof wert === 'string' ? wert : '');

export class AuthServer {
  private readonly cimdCache = new Map<string, { client: Client; bis: number }>();

  constructor(
    private readonly konfig: OAuthKonfig,
    private readonly siegel: Siegel,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly jetzt: () => number = Date.now,
  ) {}

  // ─── Registration ──────────────────────────────────────────────────────────

  registriere(body: unknown) {
    const daten = (body ?? {}) as Record<string, unknown>;
    const uris = daten.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === 'string' && erlaubteRedirectUri(u))) {
      throw new OAuthFehler('invalid_redirect_uri', 'redirect_uris: 1–10 Adressen, https oder http://localhost.');
    }
    const methode = text(daten.token_endpoint_auth_method) || 'none';
    if (methode !== 'none') throw new OAuthFehler('invalid_client_metadata', 'Nur öffentliche Clients (token_endpoint_auth_method "none").');
    const name = text(daten.client_name).slice(0, 80) || 'MCP-Client';
    const client_id = `dcr.${this.siegel.versiegle('client', { name, redirect_uris: uris })}`;
    return {
      client_id,
      client_id_issued_at: Math.floor(this.jetzt() / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  }

  async ladeClient(clientId: string): Promise<Client> {
    if (clientId.startsWith('dcr.')) {
      const daten = this.siegel.oeffne<{ name: string; redirect_uris: string[] }>('client', clientId.slice(4));
      if (!daten) throw new OAuthFehler('invalid_client', 'Unbekannter Client.', 401);
      return { id: clientId, ...daten };
    }
    if (clientId.startsWith('https://')) return this.ladeCimd(clientId);
    throw new OAuthFehler('invalid_client', 'Unbekannter Client.', 401);
  }

  private async ladeCimd(clientId: string): Promise<Client> {
    const bekannt = this.cimdCache.get(clientId);
    if (bekannt && bekannt.bis > this.jetzt()) return bekannt.client;

    const url = new URL(clientId);
    if (!this.konfig.cimdHosts.includes(url.hostname)) {
      throw new OAuthFehler('invalid_client', `Client-Metadaten von ${url.hostname} werden nicht angenommen.`, 401);
    }
    let dokument: Record<string, unknown>;
    try {
      const antwort = await this.fetchFn(clientId, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!antwort.ok) throw new Error(String(antwort.status));
      const roh = await antwort.text();
      if (roh.length > 20_000) throw new Error('zu groß');
      dokument = JSON.parse(roh) as Record<string, unknown>;
    } catch (err) {
      throw new OAuthFehler('invalid_client', `Client-Metadaten nicht lesbar: ${err instanceof Error ? err.message : String(err)}`, 401);
    }
    const uris = dokument.redirect_uris;
    if (dokument.client_id !== clientId || !Array.isArray(uris) || !uris.every((u) => typeof u === 'string' && erlaubteRedirectUri(u))) {
      throw new OAuthFehler('invalid_client', 'Client-Metadaten passen nicht zur client_id.', 401);
    }
    const client: Client = { id: clientId, name: text(dokument.client_name).slice(0, 80) || url.hostname, redirect_uris: uris };
    this.cimdCache.set(clientId, { client, bis: this.jetzt() + CIMD_CACHE_MS });
    return client;
  }

  // ─── Authorization ─────────────────────────────────────────────────────────

  /**
   * Checks an authorization request. Problems with client or redirect_uri throw (shown as a page, never
   * redirected, RFC 6749 4.1.2.1); everything else comes back as `fehler` to send to the client's redirect.
   */
  async pruefeAnfrage(query: Record<string, unknown>): Promise<
    { client: Client; ablauf: Ablauf; fehler?: undefined } | { fehler: string; beschreibung: string; redirect_uri: string; state: string }
  > {
    const client = await this.ladeClient(text(query.client_id));
    const redirect_uri = text(query.redirect_uri);
    if (!redirect_uri || !redirectPasst(client.redirect_uris, redirect_uri)) {
      throw new OAuthFehler('invalid_request', 'Diese redirect_uri ist für den Client nicht eingetragen.');
    }
    const state = text(query.state);
    const fehler = (code: string, beschreibung: string) => ({ fehler: code, beschreibung, redirect_uri, state });

    if (text(query.response_type) !== 'code') return fehler('unsupported_response_type', 'Nur response_type=code.');
    const challenge = text(query.code_challenge);
    if (text(query.code_challenge_method) !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return fehler('invalid_request', 'PKCE mit S256 ist Pflicht.');
    }
    if (!this.ressourcePasst(text(query.resource))) return fehler('invalid_target', 'Dieser Server vergibt nur Zugang zum Velonify-CRM.');

    return { client, ablauf: { client_id: client.id, redirect_uri, state, code_challenge: challenge, exp: this.jetzt() + ABLAUF_MS } };
  }

  /** The resource indicator is optional; when sent it must name this server. */
  private ressourcePasst(resource: string): boolean {
    if (!resource) return true;
    const ohne = resource.replace(/\/$/, '');
    return ohne === ressourceUrl(this.konfig.basis) || ohne === this.konfig.basis;
  }

  versiegleAblauf(ablauf: Ablauf): string {
    return this.siegel.versiegle('ablauf', ablauf);
  }

  oeffneAblauf(wert: string): Ablauf | null {
    const ablauf = this.siegel.oeffne<Ablauf>('ablauf', wert);
    return ablauf && ablauf.exp > this.jetzt() ? ablauf : null;
  }

  /** Where the browser goes after the Google sign-in: back to the client with a code (and the issuer, RFC 9207). */
  rueckleitung(ablauf: Ablauf, person: Person, googleRefresh: string): string {
    const code: Code = {
      client_id: ablauf.client_id,
      redirect_uri: ablauf.redirect_uri,
      code_challenge: ablauf.code_challenge,
      g: googleRefresh,
      email: person.email,
      name: person.name,
      start: this.jetzt(),
      exp: this.jetzt() + CODE_MS,
    };
    return this.zumClient(ablauf.redirect_uri, { code: this.siegel.versiegle('code', code), state: ablauf.state });
  }

  zumClient(redirectUri: string, params: Record<string, string>): string {
    const url = new URL(redirectUri);
    for (const [name, wert] of Object.entries(params)) if (wert) url.searchParams.set(name, wert);
    url.searchParams.set('iss', this.konfig.basis);
    return url.toString();
  }

  // ─── Token ─────────────────────────────────────────────────────────────────

  /**
   * Token endpoint. `pruefeGoogle` checks on refresh that the Google grant still exists, so a revoked access
   * ends at the next refresh instead of living on in our tokens.
   */
  async token(body: Record<string, unknown>, pruefeGoogle: (refreshToken: string) => Promise<void>) {
    const grant = text(body.grant_type);
    const clientId = text(body.client_id);
    if (!clientId) throw new OAuthFehler('invalid_client', 'client_id fehlt.', 401);
    if (body.resource !== undefined && !this.ressourcePasst(text(body.resource))) {
      throw new OAuthFehler('invalid_request', 'Unbekannte resource.');
    }

    if (grant === 'authorization_code') {
      const code = this.siegel.oeffne<Code>('code', text(body.code));
      if (!code || code.exp <= this.jetzt()) throw new OAuthFehler('invalid_grant', 'Code ungültig oder abgelaufen.');
      if (code.client_id !== clientId) throw new OAuthFehler('invalid_grant', 'Code gehört zu einem anderen Client.');
      if (text(body.redirect_uri) !== code.redirect_uri) throw new OAuthFehler('invalid_grant', 'redirect_uri passt nicht.');
      if (!pkcePasst(text(body.code_verifier), code.code_challenge)) throw new OAuthFehler('invalid_grant', 'PKCE-Prüfung fehlgeschlagen.');
      return this.tokenPaar(clientId, code);
    }

    if (grant === 'refresh_token') {
      const alt = this.siegel.oeffne<Erneuerung>('refresh', text(body.refresh_token));
      if (!alt || alt.exp <= this.jetzt()) throw new OAuthFehler('invalid_grant', 'Bitte neu anmelden.');
      if (alt.client_id !== clientId) throw new OAuthFehler('invalid_grant', 'Refresh-Token gehört zu einem anderen Client.');
      await pruefeGoogle(alt.g);
      return this.tokenPaar(clientId, alt);
    }

    throw new OAuthFehler('unsupported_grant_type', 'Nur authorization_code und refresh_token.');
  }

  private tokenPaar(clientId: string, quelle: { g: string; email: string; name: string; start: number }) {
    const jetzt = this.jetzt();
    const zugang: Zugang = { aud: ressourceUrl(this.konfig.basis), g: quelle.g, email: quelle.email, name: quelle.name, exp: jetzt + ZUGANG_S * 1000 };
    const erneuerung: Erneuerung = { client_id: clientId, g: quelle.g, email: quelle.email, name: quelle.name, start: quelle.start, exp: quelle.start + ANMELDUNG_MS };
    return {
      access_token: this.siegel.versiegle('access', zugang),
      token_type: 'Bearer',
      expires_in: ZUGANG_S,
      refresh_token: this.siegel.versiegle('refresh', erneuerung),
      scope: SCOPE,
    };
  }

  /** The person behind a bearer token, or null when it is not one of ours, for another resource or expired. */
  pruefeZugang(bearer: string): Zugang | null {
    const zugang = this.siegel.oeffne<Zugang>('access', bearer);
    if (!zugang || zugang.exp <= this.jetzt() || zugang.aud !== ressourceUrl(this.konfig.basis)) return null;
    return zugang;
  }
}
