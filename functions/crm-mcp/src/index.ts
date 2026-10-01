import { http, type Request, type Response } from '@google-cloud/functions-framework';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CrmService } from '../../../src/data/crm';
import { GoogleCalendar } from '../../../src/data/google/calendar';
import { GoogleDrive } from '../../../src/data/google/drive';
import { isoDate } from '../../../src/data/ids';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { GoogleAbgelaufen, googleAnmeldeUrl, GoogleTokens, tauscheGoogleCode, ZugriffVerweigert, type GoogleKonfig } from './google';
import { AuthServer, OAuthFehler, ressourceUrl, schutzMetadaten, SCOPE, serverMetadaten, type OAuthKonfig } from './oauth';
import { fehlerSeite, freigabeSeite } from './seiten';
import { Siegel } from './siegel';
import { ANLEITUNG, registriereWerkzeuge } from './werkzeuge';

const VERSION = '0.1.0';

interface Laufzeit {
  konfig: OAuthKonfig;
  google: GoogleKonfig;
  auth: AuthServer;
  tokens: GoogleTokens;
  spreadsheetId: string;
}

function basisUrl(req: Request): string {
  return (process.env.BASIS_URL || `https://${req.headers.host}`).replace(/\/$/, '');
}

let laufzeit: Laufzeit | null = null;

/** Built on first use, so metadata still answers while secrets are missing (first deploy). */
function holeLaufzeit(req: Request): Laufzeit {
  if (laufzeit) return laufzeit;
  const fehlend = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CRM_MCP_SCHLUESSEL', 'SPREADSHEET_ID'].filter((name) => !process.env[name]);
  if (fehlend.length > 0) throw new Error(`Nicht eingerichtet, es fehlt: ${fehlend.join(', ')}`);
  const basis = basisUrl(req);
  const konfig: OAuthKonfig = { basis, cimdHosts: (process.env.CIMD_HOSTS || 'claude.ai,claude.com').split(',').map((h) => h.trim()) };
  const google: GoogleKonfig = {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: `${basis}/google-callback`,
    domain: (process.env.ALLOWED_DOMAIN || 'velonify.de').toLowerCase(),
  };
  laufzeit = {
    konfig,
    google,
    auth: new AuthServer(konfig, new Siegel(process.env.CRM_MCP_SCHLUESSEL!.trim())),
    tokens: new GoogleTokens(google),
    spreadsheetId: process.env.SPREADSHEET_ID!,
  };
  return laufzeit;
}

/** Simple per-person limit against runaway loops; counts per instance. */
const aufrufe = new Map<string, number[]>();
function erlaubt(email: string, max = 300, fensterMs = 10 * 60_000): boolean {
  const jetzt = Date.now();
  const juengste = (aufrufe.get(email) ?? []).filter((t) => t > jetzt - fensterMs);
  juengste.push(jetzt);
  aufrufe.set(email, juengste);
  return juengste.length <= max;
}

function json(res: Response, status: number, daten: unknown): void {
  res.status(status).set('Cache-Control', 'no-store').json(daten);
}

function oauthFehler(res: Response, err: unknown): void {
  if (err instanceof OAuthFehler) return json(res, err.status, err.antwort);
  console.error(err);
  json(res, 500, { error: 'server_error', error_description: err instanceof Error ? err.message : String(err) });
}

function nichtAngemeldet(res: Response, basis: string, grund?: string): void {
  const teile = [`resource_metadata="${basis}/.well-known/oauth-protected-resource/mcp"`, `scope="${SCOPE}"`];
  if (grund) teile.unshift('error="invalid_token"', `error_description="${grund}"`);
  res.status(401).set('WWW-Authenticate', `Bearer ${teile.join(', ')}`).json({ error: 'invalid_token', error_description: grund ?? 'Anmeldung nötig.' });
}

async function mcp(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Nur POST (zustandsloser Server).' }, id: null });
    return;
  }
  const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
  const zugang = bearer ? lz.auth.pruefeZugang(bearer) : null;
  if (!zugang) return nichtAngemeldet(res, lz.konfig.basis, bearer ? 'Token ungültig oder abgelaufen.' : undefined);
  if (!erlaubt(zugang.email)) {
    res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Zu viele Aufrufe. Bitte kurz warten.' }, id: null });
    return;
  }

  try {
    await lz.tokens.zugangstoken(zugang.g);
  } catch (err) {
    if (err instanceof GoogleAbgelaufen) return nichtAngemeldet(res, lz.konfig.basis, 'Google-Zugang abgelaufen. Bitte neu verbinden.');
    throw err;
  }
  const getToken = () => lz.tokens.zugangstoken(zugang.g);
  const service = new CrmService({
    store: new SheetStore(new SheetsClient(lz.spreadsheetId, getToken)),
    drive: new GoogleDrive(getToken),
    calendar: new GoogleCalendar(getToken),
    currentUser: () => zugang.email,
    tabelle: (spreadsheetId) => new SheetsClient(spreadsheetId, getToken),
  });

  const server = new McpServer({ name: 'velonify-crm', title: 'Velonify CRM', version: VERSION }, { instructions: ANLEITUNG });
  registriereWerkzeuge(server, { service, person: { email: zugang.email, name: zugang.name }, heute: () => isoDate(new Date()) });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

async function authorize(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const pruefung = await lz.auth.pruefeAnfrage(req.query as Record<string, unknown>).catch((err: unknown) => {
    res.status(400).type('html').send(fehlerSeite(err instanceof Error ? err.message : String(err)));
    return null;
  });
  if (!pruefung) return;
  if (pruefung.fehler !== undefined) {
    res.redirect(302, lz.auth.zumClient(pruefung.redirect_uri, { error: pruefung.fehler, error_description: pruefung.beschreibung, state: pruefung.state }));
    return;
  }
  const weiter = googleAnmeldeUrl(lz.google, lz.auth.versiegleAblauf(pruefung.ablauf));
  res.status(200).type('html').set('Cache-Control', 'no-store').send(freigabeSeite(pruefung.client, pruefung.ablauf.redirect_uri, weiter, lz.google.domain));
}

async function googleCallback(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const ablauf = lz.auth.oeffneAblauf(String(req.query.state ?? ''));
  if (!ablauf) {
    res.status(400).type('html').send(fehlerSeite('Die Anmeldung hat zu lange gedauert. Bitte in Claude noch einmal verbinden.'));
    return;
  }
  if (req.query.error) {
    res.redirect(302, lz.auth.zumClient(ablauf.redirect_uri, { error: 'access_denied', error_description: 'Bei Google abgebrochen.', state: ablauf.state }));
    return;
  }
  try {
    const { person, refreshToken } = await tauscheGoogleCode(lz.google, String(req.query.code ?? ''));
    res.redirect(302, lz.auth.rueckleitung(ablauf, person, refreshToken));
  } catch (err) {
    if (err instanceof ZugriffVerweigert) {
      res.status(403).type('html').send(fehlerSeite(err.message));
      return;
    }
    console.error(err);
    res.status(502).type('html').send(fehlerSeite(err instanceof Error ? err.message : String(err)));
  }
}

async function token(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request', error_description: 'Nur POST.' });
  try {
    const antwort = await lz.auth.token((req.body ?? {}) as Record<string, unknown>, async (g) => {
      lz.tokens.vergiss(g);
      try {
        await lz.tokens.zugangstoken(g);
      } catch (err) {
        if (err instanceof GoogleAbgelaufen) throw new OAuthFehler('invalid_grant', 'Google-Zugang widerrufen oder abgelaufen. Bitte neu anmelden.');
        throw err;
      }
    });
    json(res, 200, antwort);
  } catch (err) {
    oauthFehler(res, err);
  }
}

export async function handler(req: Request, res: Response): Promise<void> {
  // Claude calls from its servers, but browser-based MCP clients (e.g. the inspector) need CORS. No cookies are used.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version');
  res.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').status(204).end();
    return;
  }

  const pfad = req.path.replace(/\/$/, '') || '/';
  const basis = basisUrl(req);
  const metaKonfig: OAuthKonfig = { basis, cimdHosts: [] };

  try {
    switch (pfad) {
      case '/.well-known/oauth-protected-resource':
      case '/.well-known/oauth-protected-resource/mcp':
        return json(res, 200, schutzMetadaten(metaKonfig));
      case '/.well-known/oauth-authorization-server':
      case '/.well-known/oauth-authorization-server/mcp':
        return json(res, 200, serverMetadaten(metaKonfig));
      case '/':
        res.type('text').send(`Velonify CRM – MCP-Server ${VERSION}. In Claude als Connector eintragen: ${ressourceUrl(basis)}`);
        return;
    }

    const lz = holeLaufzeit(req);
    switch (pfad) {
      case '/mcp':
        return await mcp(req, res, lz);
      case '/register':
        if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request' });
        try {
          return json(res, 201, lz.auth.registriere(req.body));
        } catch (err) {
          return oauthFehler(res, err);
        }
      case '/authorize':
        return await authorize(req, res, lz);
      case '/google-callback':
        return await googleCallback(req, res, lz);
      case '/token':
        return await token(req, res, lz);
      default:
        res.status(404).json({ error: 'not_found' });
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'server_error', error_description: err instanceof Error ? err.message : String(err) });
  }
}

http('crmMcp', handler);
