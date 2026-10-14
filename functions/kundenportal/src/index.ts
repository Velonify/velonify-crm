import { http, type Request, type Response } from '@google-cloud/functions-framework';
import { GoogleDrive, isFolder } from '../../../src/data/google/drive';
import { CLIENT_SHARE_ORDNER, findeBerechtigung, kundensicht, loginMail, normalisiereEmail, pruefeBerechtigung, type Berechtigung, type PortalDatei } from '../../../src/data/portalApi';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { Begrenzer, erstelleLink, erstelleSitzung, linkNochGueltig, oeffneLink, oeffneSitzung } from './anmeldung';
import { dienstkontoToken, Mailer } from './google';
import { Siegel } from './siegel';

interface Laufzeit {
  siegel: Siegel;
  mailer: Mailer;
  token: () => Promise<string>;
  spreadsheetId: string;
  portalUrl: string;
  origins: Set<string>;
  teamDomain: string;
}

let laufzeit: Laufzeit | null = null;

/** Built on first use, so a missing setting answers with a clear message instead of crashing the instance. */
function holeLaufzeit(): Laufzeit {
  if (laufzeit) return laufzeit;
  const fehlend = ['PORTAL_SCHLUESSEL', 'SPREADSHEET_ID', 'PORTAL_URL', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter((name) => !process.env[name]);
  if (fehlend.length > 0) throw new Error(`Nicht eingerichtet, es fehlt: ${fehlend.join(', ')}`);
  const portalUrl = process.env.PORTAL_URL!.replace(/\/$/, '');
  laufzeit = {
    siegel: new Siegel(process.env.PORTAL_SCHLUESSEL!.trim()),
    mailer: new Mailer({
      clientId: process.env.GMAIL_CLIENT_ID!,
      clientSecret: process.env.GMAIL_CLIENT_SECRET!.trim(),
      refreshToken: process.env.GMAIL_REFRESH_TOKEN!.trim(),
      absender: process.env.MAIL_ABSENDER || 'Velonify <hallo@velonify.de>',
    }),
    token: dienstkontoToken(),
    spreadsheetId: process.env.SPREADSHEET_ID!,
    portalUrl,
    origins: new Set([new URL(portalUrl).origin, ...(process.env.WEITERE_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)]),
    teamDomain: (process.env.TEAM_DOMAIN || 'velonify.de').toLowerCase(),
  };
  return laufzeit;
}

const loginProMail = new Begrenzer(3, 15 * 60_000);
const loginProIp = new Begrenzer(20, 15 * 60_000);
const einloesenProIp = new Begrenzer(30, 15 * 60_000);
const abrufeProSitzung = new Begrenzer(300, 10 * 60_000);

const NICHT_ANGEMELDET = 'Bitte melde dich neu an.';
const LINK_UNGUELTIG = 'Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.';

function json(res: Response, status: number, daten: unknown): void {
  res.status(status).set('Cache-Control', 'no-store').json(daten);
}

function ip(req: Request): string {
  return (req.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.ip || 'unbekannt';
}

function store(lz: Laufzeit): SheetStore {
  return new SheetStore(new SheetsClient(lz.spreadsheetId, lz.token));
}

/** The login behind the Bearer session, re-checked against the sheet on every call. */
async function angemeldet(req: Request, lz: Laufzeit, s: SheetStore): Promise<{ berechtigung: Berechtigung; db: Awaited<ReturnType<SheetStore['load']>> } | null> {
  const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
  const sitzung = bearer ? oeffneSitzung(lz.siegel, bearer, Date.now()) : null;
  if (!sitzung) return null;
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = pruefeBerechtigung(db, portal, sitzung.k, sitzung.f);
  return berechtigung ? { berechtigung, db } : null;
}

/** Files directly in the client share of the firm's Drive folder; empty without folder or share. */
async function dateienVon(drive: GoogleDrive, ordnerId: string): Promise<{ shareId: string; dateien: PortalDatei[] }> {
  if (!ordnerId) return { shareId: '', dateien: [] };
  const share = (await drive.listChildren(ordnerId)).find((f) => isFolder(f) && f.name === CLIENT_SHARE_ORDNER);
  if (!share) return { shareId: '', dateien: [] };
  const dateien = (await drive.listChildren(share.id))
    .filter((f) => !isFolder(f))
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, geaendert: f.modifiedTime ?? '' }))
    .sort((a, b) => b.geaendert.localeCompare(a.geaendert));
  return { shareId: share.id, dateien };
}

async function anmelden(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const email = normalisiereEmail(String((req.body as { email?: unknown } | undefined)?.email ?? ''));
  // Same answer for every address, so nobody can find out who has a login.
  const antwort = () => json(res, 200, { ok: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { fehler: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  if (!loginProIp.erlaubt(ip(req))) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
  if (!loginProMail.erlaubt(email)) return antwort();
  const s = store(lz);
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = findeBerechtigung(db, portal, email);
  if (!berechtigung) return antwort();
  const link = `${lz.portalUrl}/#/anmelden/${erstelleLink(lz.siegel, berechtigung, Date.now())}`;
  const mail = loginMail(berechtigung.kontakt.vorname, link);
  try {
    await lz.mailer.sende(berechtigung.kontakt.email.trim(), mail.betreff, mail.text);
  } catch (err) {
    console.error('Login-Mail fehlgeschlagen', err);
  }
  antwort();
}

async function einloesen(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (!einloesenProIp.erlaubt(ip(req))) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
  const token = String((req.body as { token?: unknown } | undefined)?.token ?? '');
  const inhalt = oeffneLink(lz.siegel, token, Date.now());
  if (!inhalt) return json(res, 401, { fehler: LINK_UNGUELTIG });
  const s = store(lz);
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = pruefeBerechtigung(db, portal, inhalt.k, inhalt.f);
  if (!berechtigung || !linkNochGueltig(inhalt, berechtigung)) return json(res, 401, { fehler: LINK_UNGUELTIG });
  await s.update('portal_zugaenge', [{ id: berechtigung.zugang.id, changes: { zuletzt_am: new Date().toISOString() } }]);
  json(res, 200, erstelleSitzung(lz.siegel, berechtigung, Date.now()));
}

async function daten(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  if (!abrufeProSitzung.erlaubt(anmeldung.berechtigung.kontakt.id)) return json(res, 429, { fehler: 'Zu viele Abrufe. Bitte kurz warten.' });
  const drive = new GoogleDrive(lz.token);
  const [kunden, todos, portal, dateien] = await Promise.all([
    s.loadKundenDaten(),
    s.loadTodoDaten(),
    s.loadPortalDaten(),
    dateienVon(drive, anmeldung.berechtigung.firma.drive_ordner_id),
  ]);
  json(res, 200, kundensicht({ berechtigung: anmeldung.berechtigung, db: anmeldung.db, kunden, todos, portal, dateien: dateien.dateien, teamDomain: lz.teamDomain }));
}

/** Streams one file of the client share; Google Docs, Sheets and Slides come as PDF. */
async function datei(req: Request, res: Response, lz: Laufzeit, id: string): Promise<void> {
  const s = store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  const drive = new GoogleDrive(lz.token);
  const { shareId } = await dateienVon(drive, anmeldung.berechtigung.firma.drive_ordner_id);
  const meta = shareId ? await drive.getFile(id).catch(() => null) : null;
  if (!meta || isFolder(meta) || !meta.parents?.includes(shareId)) return json(res, 404, { fehler: 'Diese Datei gibt es nicht (mehr).' });
  const nativ = meta.mimeType.startsWith('application/vnd.google-apps.');
  const url = nativ
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const antwort = await fetch(url, { headers: { Authorization: `Bearer ${await lz.token()}` } });
  if (!antwort.ok || !antwort.body) return json(res, 502, { fehler: 'Die Datei konnte gerade nicht geladen werden.' });
  const name = nativ ? `${meta.name}.pdf` : meta.name;
  res
    .status(200)
    .set('Cache-Control', 'no-store')
    .set('Content-Type', nativ ? 'application/pdf' : antwort.headers.get('content-type') ?? 'application/octet-stream')
    .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(Buffer.from(await antwort.arrayBuffer()));
}

http('kundenportal', async (req: Request, res: Response) => {
  let lz: Laufzeit;
  try {
    lz = holeLaufzeit();
  } catch (err) {
    console.error(err);
    return json(res, 503, { fehler: 'Das Kundenportal ist gerade nicht erreichbar.' });
  }

  const origin = req.get('origin') ?? '';
  if (origin && lz.origins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type').set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') return void res.status(204).send('');

  const pfad = req.path.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'POST' && pfad === '/anmelden') return await anmelden(req, res, lz);
    if (req.method === 'POST' && pfad === '/einloesen') return await einloesen(req, res, lz);
    if (req.method === 'GET' && pfad === '/daten') return await daten(req, res, lz);
    const dateiPfad = /^\/datei\/([\w-]+)$/.exec(pfad);
    if (req.method === 'GET' && dateiPfad) return await datei(req, res, lz, dateiPfad[1]);
    if (req.method === 'GET' && pfad === '/') return json(res, 200, { dienst: 'velonify-kundenportal' });
    json(res, 404, { fehler: 'Nicht gefunden.' });
  } catch (err) {
    console.error(err);
    json(res, 500, { fehler: 'Da ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.' });
  }
});
