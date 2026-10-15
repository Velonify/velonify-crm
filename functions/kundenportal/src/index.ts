import { http, type Request, type Response } from '@google-cloud/functions-framework';
import { ConflictError, ValidationError } from '../../../src/data/errors';
import { GoogleDrive } from '../../../src/data/google/drive';
import { findeBerechtigung, kartenKontext, kundensicht, loginMail, normalisiereEmail, portalKarte, pruefeBerechtigung, type Berechtigung } from '../../../src/data/portalApi';
import {
  anfrageHatAnhaenge,
  dateiErlaubt,
  ladeKundenDateien,
  portalAnfrage,
  portalFreigabe,
  PortalFehler,
  portalKommentar,
  pruefeUpload,
  sauberDateiname,
  sauberDateityp,
  UPLOAD_MAX_BYTES,
  VOM_KUNDEN_ORDNER,
  ZU_GROSS,
} from '../../../src/data/portalAktionen';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import type { Store } from '../../../src/data/store';
import { verbinde, type Verbindung } from '../../../db/verbindung';
import { Begrenzer, erstelleLink, erstelleSitzung, linkNochGueltig, oeffneLink, oeffneSitzung, verlaengerteSitzung, type SitzungInhalt } from './anmeldung';
import { dienstkontoToken, Mailer } from './google';
import { Siegel } from './siegel';

interface Laufzeit {
  siegel: Siegel;
  mailer: Mailer;
  token: () => Promise<string>;
  spreadsheetId: string;
  /** Set when the CRM data lives in Postgres (DB_INSTANZ); otherwise the sheet is used. */
  db: Promise<Verbindung> | null;
  portalUrl: string;
  origins: Set<string>;
  teamDomain: string;
}

let laufzeit: Laufzeit | null = null;

/** Built on first use, so a missing setting answers with a clear message instead of crashing the instance. */
function holeLaufzeit(): Laufzeit {
  if (laufzeit) return laufzeit;
  const datenquelle = process.env.DB_INSTANZ ? 'DB_NUTZER' : 'SPREADSHEET_ID';
  const fehlend = ['PORTAL_SCHLUESSEL', datenquelle, 'PORTAL_URL', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter((name) => !process.env[name]);
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
    spreadsheetId: process.env.SPREADSHEET_ID ?? '',
    db: process.env.DB_INSTANZ
      ? verbinde({ instanz: process.env.DB_INSTANZ, datenbank: process.env.DB_NAME ?? 'crm', nutzer: process.env.DB_NUTZER!, max: 2 })
      : null,
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
/** Approvals, comments, requests and uploads together, per contact. */
const schreibenProKontakt = new Begrenzer(60, 10 * 60_000);

const NICHT_ANGEMELDET = 'Bitte melde dich neu an.';
const LINK_ABGELAUFEN = 'Der Link ist abgelaufen, er gilt nur 15 Minuten. Fordere einfach einen neuen an.';
const LINK_BENUTZT = 'Dieser Link wurde schon benutzt. Nimm den Link aus der neuesten Mail oder fordere einen neuen an.';
const LINK_UNGUELTIG = 'Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.';

function json(res: Response, status: number, daten: unknown): void {
  res.status(status).set('Cache-Control', 'no-store').json(daten);
}

function ip(req: Request): string {
  return (req.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.ip || 'unbekannt';
}

async function store(lz: Laufzeit): Promise<Store> {
  return lz.db ? new PostgresStore((await lz.db).pool, () => 'kundenportal') : new SheetStore(new SheetsClient(lz.spreadsheetId, lz.token));
}

/** The login behind the Bearer session, re-checked against the sheet on every call. */
async function angemeldet(req: Request, lz: Laufzeit, s: Store): Promise<{ berechtigung: Berechtigung; db: Awaited<ReturnType<Store['load']>>; sitzung: SitzungInhalt } | null> {
  const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
  const sitzung = bearer ? oeffneSitzung(lz.siegel, bearer, Date.now()) : null;
  if (!sitzung) return null;
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = pruefeBerechtigung(db, portal, sitzung.k, sitzung.f);
  return berechtigung ? { berechtigung, db, sitzung } : null;
}

async function anmelden(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const email = normalisiereEmail(String((req.body as { email?: unknown } | undefined)?.email ?? ''));
  // Same answer for every address, so nobody can find out who has a login.
  const antwort = () => json(res, 200, { ok: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { fehler: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  if (!loginProIp.erlaubt(ip(req))) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
  if (!loginProMail.erlaubt(email)) return antwort();
  const s = await store(lz);
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = findeBerechtigung(db, portal, email);
  if (!berechtigung) return antwort();
  const link = `${lz.portalUrl}/#/anmelden/${erstelleLink(lz.siegel, berechtigung, Date.now())}`;
  const mail = loginMail(berechtigung.kontakt.vorname, link);
  try {
    await lz.mailer.sende(berechtigung.kontakt.email.trim(), mail.betreff, mail.text, mail.html);
  } catch (err) {
    console.error('Login-Mail fehlgeschlagen', err);
  }
  antwort();
}

async function einloesen(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (!einloesenProIp.erlaubt(ip(req))) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
  const token = String((req.body as { token?: unknown } | undefined)?.token ?? '');
  const inhalt = oeffneLink(lz.siegel, token, Date.now());
  if (!inhalt) {
    const lesbar = lz.siegel.oeffne<{ exp: number }>('link', token);
    console.warn('Anmeldelink abgelehnt:', lesbar ? 'abgelaufen' : `nicht lesbar (Länge ${token.length})`);
    return json(res, 401, { fehler: lesbar ? LINK_ABGELAUFEN : LINK_UNGUELTIG });
  }
  const s = await store(lz);
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = pruefeBerechtigung(db, portal, inhalt.k, inhalt.f);
  if (!berechtigung) {
    console.warn('Anmeldelink abgelehnt: kein aktiver Zugang', inhalt.k);
    return json(res, 401, { fehler: LINK_UNGUELTIG });
  }
  if (!linkNochGueltig(inhalt, berechtigung)) {
    console.warn('Anmeldelink abgelehnt: schon benutzt oder durch neueren Login ersetzt', inhalt.k);
    return json(res, 401, { fehler: LINK_BENUTZT });
  }
  await s.update('portal_zugaenge', [{ id: berechtigung.zugang.id, changes: { zuletzt_am: new Date().toISOString() } }]);
  json(res, 200, erstelleSitzung(lz.siegel, berechtigung, Date.now()));
}

async function daten(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  if (!abrufeProSitzung.erlaubt(anmeldung.berechtigung.kontakt.id)) return json(res, 429, { fehler: 'Zu viele Abrufe. Bitte kurz warten.' });
  // Opening the portal keeps the login alive; the portal stores the new session from these headers.
  const neu = verlaengerteSitzung(lz.siegel, anmeldung.sitzung, Date.now());
  if (neu) res.set('X-Sitzung', neu.sitzung).set('X-Sitzung-Bis', neu.gueltig_bis);
  const drive = new GoogleDrive(lz.token);
  const [kunden, todos, portal, dateien] = await Promise.all([
    s.loadKundenDaten(),
    s.loadTodoDaten(),
    s.loadPortalDaten(),
    ladeKundenDateien(drive, anmeldung.berechtigung.firma.drive_ordner_id),
  ]);
  json(res, 200, kundensicht({ berechtigung: anmeldung.berechtigung, db: anmeldung.db, kunden, todos, portal, dateien: dateien.dateien, teamDomain: lz.teamDomain }));
}

/** Streams one file of the client share or its „Vom Kunden“ folder; Google Docs, Sheets and Slides come as PDF. */
async function datei(req: Request, res: Response, lz: Laufzeit, id: string): Promise<void> {
  const s = await store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  const drive = new GoogleDrive(lz.token);
  const ordner = await ladeKundenDateien(drive, anmeldung.berechtigung.firma.drive_ordner_id);
  const meta = ordner.shareId ? await drive.getFile(id).catch(() => null) : null;
  if (!meta || !dateiErlaubt(meta, ordner)) return json(res, 404, { fehler: 'Diese Datei gibt es nicht (mehr).' });
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

/** The JSON body as an object; anything else counts as empty. */
function eingabe(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  return body && typeof body === 'object' && !Array.isArray(body) && !Buffer.isBuffer(body) ? (body as Record<string, unknown>) : {};
}

/** Login and write limit for the endpoints where the client changes something. */
async function schreibend(req: Request, lz: Laufzeit, s: Store): Promise<{ berechtigung: Berechtigung; db: Awaited<ReturnType<Store['load']>> }> {
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) throw new PortalFehler(401, NICHT_ANGEMELDET);
  if (!schreibenProKontakt.erlaubt(anmeldung.berechtigung.kontakt.id)) throw new PortalFehler(429, 'Das waren gerade sehr viele Änderungen. Bitte warte ein paar Minuten.');
  return anmeldung;
}

async function freigabe(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const { berechtigung, db } = await schreibend(req, lz, s);
  const todos = await s.loadTodoDaten();
  const ergebnis = portalFreigabe({ berechtigung, todos, eingabe: eingabe(req), jetzt: new Date() });
  // Fails with a conflict when the team changed the card since it was loaded.
  const [karte] = await s.update('aufgaben', [{ id: ergebnis.karte.id, changes: ergebnis.changes, expectedGeaendertAm: ergebnis.karte.geaendert_am }]);
  if (ergebnis.kommentar) await s.insert('aufgaben_kommentare', [ergebnis.kommentar]);
  const kommentare = ergebnis.kommentar ? [...todos.kommentare, ergebnis.kommentar] : todos.kommentare;
  json(res, 200, portalKarte(karte, kartenKontext({ berechtigung, db, todos: { ...todos, kommentare }, teamDomain: lz.teamDomain })));
}

async function kommentar(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const { berechtigung, db } = await schreibend(req, lz, s);
  const todos = await s.loadTodoDaten();
  const neu = portalKommentar({ berechtigung, todos, eingabe: eingabe(req), jetzt: new Date() });
  await s.insert('aufgaben_kommentare', [neu]);
  const karte = todos.aufgaben.find((a) => a.id === neu.aufgabe_id)!;
  json(res, 200, portalKarte(karte, kartenKontext({ berechtigung, db, todos: { ...todos, kommentare: [...todos.kommentare, neu] }, teamDomain: lz.teamDomain })));
}

async function anfrage(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const { berechtigung, db } = await schreibend(req, lz, s);
  const daten = eingabe(req);
  const [todos, ordner] = await Promise.all([
    s.loadTodoDaten(),
    anfrageHatAnhaenge(daten) ? ladeKundenDateien(new GoogleDrive(lz.token), berechtigung.firma.drive_ordner_id) : Promise.resolve({ dateien: [] }),
  ]);
  const { karte, news } = portalAnfrage({ berechtigung, todos, eingabe: daten, kundenDateien: ordner.dateien, jetzt: new Date() });
  await s.insert('aufgaben', [karte]);
  try {
    await s.insert('kunden_news', [news]);
  } catch (err) {
    // The card is what counts; a missing news entry must not make the client send the request twice.
    console.error('Interne News zur Anfrage fehlgeschlagen', err);
  }
  json(res, 200, portalKarte(karte, kartenKontext({ berechtigung, db, todos, teamDomain: lz.teamDomain })));
}

/** Raw upload into 07_Client-Share/Vom Kunden; the name comes URI-encoded in `X-Dateiname`. */
async function hochladen(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (Number(req.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) throw new PortalFehler(413, ZU_GROSS);
  const s = await store(lz);
  const { berechtigung } = await schreibend(req, lz, s);
  // functions-framework keeps the unparsed body of every content type in rawBody.
  const inhalt = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : null);
  pruefeUpload(inhalt?.length ?? 0);
  const drive = new GoogleDrive(lz.token);
  const ordner = await ladeKundenDateien(drive, berechtigung.firma.drive_ordner_id);
  if (!ordner.shareId) throw new PortalFehler(409, 'Für dich ist noch kein Dateiordner eingerichtet. Schick uns die Datei bitte per Mail an hallo@velonify.de.');
  const zielId = ordner.vomKundenId || (await drive.createFolder(VOM_KUNDEN_ORDNER, ordner.shareId)).id;
  const datei = await drive.upload(sauberDateiname(req.get('x-dateiname')), sauberDateityp(req.get('x-dateityp') || req.get('content-type')), zielId, new Uint8Array(inhalt!));
  json(res, 200, { id: datei.id, name: datei.name, mimeType: datei.mimeType, geaendert: datei.modifiedTime ?? new Date().toISOString(), von: 'kunde' });
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
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dateiname, X-Dateityp').set('Access-Control-Expose-Headers', 'X-Sitzung, X-Sitzung-Bis, Content-Disposition').set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') return void res.status(204).send('');

  const pfad = req.path.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'POST' && pfad === '/anmelden') return await anmelden(req, res, lz);
    if (req.method === 'POST' && pfad === '/einloesen') return await einloesen(req, res, lz);
    if (req.method === 'GET' && pfad === '/daten') return await daten(req, res, lz);
    if (req.method === 'POST' && pfad === '/freigabe') return await freigabe(req, res, lz);
    if (req.method === 'POST' && pfad === '/kommentar') return await kommentar(req, res, lz);
    if (req.method === 'POST' && pfad === '/anfrage') return await anfrage(req, res, lz);
    if (req.method === 'POST' && pfad === '/hochladen') return await hochladen(req, res, lz);
    const dateiPfad = /^\/datei\/([\w-]+)$/.exec(pfad);
    if (req.method === 'GET' && dateiPfad) return await datei(req, res, lz, dateiPfad[1]);
    if (req.method === 'GET' && pfad === '/') return json(res, 200, { dienst: 'velonify-kundenportal' });
    json(res, 404, { fehler: 'Nicht gefunden.' });
  } catch (err) {
    if (err instanceof PortalFehler) return json(res, err.status, { fehler: err.message });
    if (err instanceof ValidationError) return json(res, 400, { fehler: err.message });
    if (err instanceof ConflictError) return json(res, 409, { fehler: 'Die Karte wurde gerade geändert. Lade die Seite bitte neu und versuch es noch einmal.' });
    console.error(err);
    json(res, 500, { fehler: 'Da ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.' });
  }
});
