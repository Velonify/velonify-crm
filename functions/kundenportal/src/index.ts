import { timingSafeEqual } from 'node:crypto';
import { http, type Request, type Response } from '@google-cloud/functions-framework';
import { ConflictError, ValidationError } from '../../../src/data/errors';
import { GoogleDrive } from '../../../src/data/google/drive';
import { alleBerechtigungen, findeBerechtigung, kartenKontext, kundensicht, loginMail, normalisiereEmail, portalKarte, pruefeBerechtigung, vorschauBerechtigung, type Berechtigung } from '../../../src/data/portalApi';
import { pruefeGoogleToken, ZugriffsFehler } from '../../contact-generator/src/auth';
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
import { einstellungenVon, pruefeEinstellungen } from '../../../src/data/portalBenachrichtigung';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import type { Store } from '../../../src/data/store';
import { verbinde, type Verbindung } from '../../../db/verbindung';
import { Begrenzer, erstelleLink, erstelleSitzung, erstelleVorschau, linkNochGueltig, oeffneLink, oeffneSitzung, verlaengerteSitzung, type SitzungInhalt } from './anmeldung';
import { dienstkontoToken, Mailer, nutzerToken } from './google';
import { Siegel } from './siegel';
import { slackPoster, versende } from './versand';
import { aktualisiereKennzahlen } from './kennzahlen';
import { erstelleBerichte } from './bericht';
import { berichtsMonat, istMonat } from '../../../src/data/monatsbericht';
import { istKritik, kritikNachricht, pruefeFeedback } from '../../../src/data/feedback';
import { leseTeamZuordnung } from '../../../src/data/selectors';
import { slackDirekt } from '../../../src/data/slack';
import { personen } from '../../../src/data/zustaendig';

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
  /** OAuth client of the hub: its Google tokens may open a team preview. Empty = no previews. */
  hubClientId: string;
  /** Shared secret of the scheduler job that calls /versand. Empty = no sending. */
  versandSchluessel: string;
  /** Bot token of the Slack app "Velonify Hub" for posts into client channels. Empty = e-mail only. */
  slackToken: string;
  /** Access tokens of hallo@velonify.de for GA4 and Search Console; null without ANALYTICS_REFRESH_TOKEN. */
  analyticsToken: (() => Promise<string>) | null;
  pagespeedKey: string;
  /** Direct messages to team members (criticism in feedback); null without SLACK_BOT_TOKEN. */
  slackDm: ((personen: readonly string[], text: string) => Promise<string[]>) | null;
  hubUrl: string;
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
    origins: new Set([new URL(portalUrl).origin, new URL(process.env.HUB_URL || 'https://crm.velonify.de').origin, ...(process.env.WEITERE_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)]),
    teamDomain: (process.env.TEAM_DOMAIN || 'velonify.de').toLowerCase(),
    hubClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    versandSchluessel: (process.env.VERSAND_SCHLUESSEL ?? '').trim(),
    slackToken: (process.env.SLACK_BOT_TOKEN ?? '').trim(),
    analyticsToken: process.env.ANALYTICS_REFRESH_TOKEN
      ? nutzerToken({ clientId: process.env.GMAIL_CLIENT_ID!, clientSecret: process.env.GMAIL_CLIENT_SECRET!.trim(), refreshToken: process.env.ANALYTICS_REFRESH_TOKEN.trim(), wofuer: 'Analytics' })
      : null,
    pagespeedKey: (process.env.PAGESPEED_API_KEY ?? '').trim(),
    slackDm: process.env.SLACK_BOT_TOKEN?.trim() ? slackDirekt({ token: process.env.SLACK_BOT_TOKEN.trim(), teamZuordnung: leseTeamZuordnung(process.env.TEAM_ZUORDNUNG ?? '') }) : null,
    hubUrl: process.env.HUB_URL || 'https://crm.velonify.de',
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
  if (sitzung.v) {
    // Team access: no contact behind it, only the firm (which must still exist) and the team member.
    const db = await s.load();
    const berechtigung = vorschauBerechtigung(db, sitzung.f, sitzung.v);
    return berechtigung ? { berechtigung, db, sitzung } : null;
  }
  const [db, portal] = await Promise.all([s.load(), s.loadPortalDaten()]);
  const berechtigung = pruefeBerechtigung(db, portal, sitzung.k, sitzung.f);
  return berechtigung ? { berechtigung, db, sitzung } : null;
}

/**
 * Switches to another client of the same person (same e-mail, active login there): a new session for that firm.
 * The target's last login is updated, so the next login link opens the client looked at last.
 */
async function wechseln(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  if (anmeldung.sitzung.v) return json(res, 403, { fehler: 'In der Vorschau gibt es keinen Wechsel.' });
  const firmaId = String(eingabe(req).firma_id ?? '');
  const ziel = alleBerechtigungen(anmeldung.db, await s.loadPortalDaten(), anmeldung.berechtigung.kontakt.email).find((b) => b.firma.id === firmaId);
  if (!ziel) return json(res, 403, { fehler: 'Für diesen Kunden hast du keinen Zugang (mehr).' });
  await s.update('portal_zugaenge', [{ id: ziel.zugang.id, changes: { zuletzt_am: new Date().toISOString() } }]);
  json(res, 200, erstelleSitzung(lz.siegel, ziel, Date.now()));
}

/** The team member behind a hub Google token (Bearer); null after answering with an error. */
async function teamMitglied(req: Request, res: Response, lz: Laufzeit): Promise<string | null> {
  if (!lz.hubClientId) {
    json(res, 503, { fehler: 'Der Team-Zugang ist nicht eingerichtet (GOOGLE_CLIENT_ID fehlt).' });
    return null;
  }
  const token = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
  if (!token) {
    json(res, 401, { fehler: 'Bitte im Hub neu anmelden.' });
    return null;
  }
  try {
    return await pruefeGoogleToken(token, { clientId: lz.hubClientId, domain: lz.teamDomain });
  } catch (err) {
    if (!(err instanceof ZugriffsFehler)) throw err;
    json(res, err.status, { fehler: err.message });
    return null;
  }
}

/** Whether the request carries the scheduler's shared secret. */
function vomScheduler(req: Request, lz: Laufzeit): boolean {
  const gegeben = Buffer.from(req.get('x-versand-schluessel') ?? '');
  const erwartet = Buffer.from(lz.versandSchluessel);
  return erwartet.length > 0 && gegeben.length === erwartet.length && timingSafeEqual(gegeben, erwartet);
}

/**
 * `POST /kennzahlen`: the scheduler (shared secret, every client, once a day) or the hub ("Jetzt abrufen", Google token
 * of a team member, `{ firma_id }`) fetches GA4, Search Console and PageSpeed and stores the snapshot.
 */
async function kennzahlen(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  let firmaId: string | undefined;
  if (!vomScheduler(req, lz)) {
    if (!(await teamMitglied(req, res, lz))) return;
    firmaId = String(eingabe(req).firma_id ?? '');
    if (!firmaId) return json(res, 400, { fehler: 'firma_id fehlt.' });
  }
  const s = await store(lz);
  const d = { googleToken: lz.analyticsToken, pagespeedKey: lz.pagespeedKey, jetzt: new Date() };
  const bericht = await aktualisiereKennzahlen(s, d, firmaId);
  // The daily run also drafts the monthly reports in the first days of a month (after the fresh PageSpeed numbers).
  const berichte = firmaId ? null : await erstelleBerichte(s, d).catch((err) => {
    console.error('Monatsberichte fehlgeschlagen', err);
    return null;
  });
  console.log(JSON.stringify({ kennzahlen: bericht, berichte, firma: firmaId ?? 'alle' }));
  json(res, 200, bericht);
}

/**
 * `POST /bericht` from the hub (Google token of a team member, `{ firma_id, monat? }`): drafts the monthly report of a
 * finished month or recalculates its draft. Defaults to the last month.
 */
async function monatsbericht(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (!(await teamMitglied(req, res, lz))) return;
  const firmaId = String(eingabe(req).firma_id ?? '');
  const jetzt = new Date();
  const monat = String(eingabe(req).monat ?? '') || berichtsMonat(jetzt);
  if (!firmaId) return json(res, 400, { fehler: 'firma_id fehlt.' });
  if (!istMonat(monat) || monat > berichtsMonat(jetzt)) return json(res, 400, { fehler: 'Berichte gibt es nur für abgeschlossene Monate.' });
  const s = await store(lz);
  const t = (await s.loadPortalDaten()).tracking.find((x) => x.firma_id === firmaId);
  if (!t?.monatsbericht) return json(res, 409, { fehler: 'Der Monatsbericht ist für diesen Kunden nicht eingeschaltet (Karte „Tracking“).' });
  const ergebnis = await erstelleBerichte(s, { googleToken: lz.analyticsToken, pagespeedKey: lz.pagespeedKey, jetzt }, { firmaId, monat });
  console.log(JSON.stringify({ monatsbericht: ergebnis, firma: firmaId, monat }));
  json(res, 200, ergebnis);
}

/** "Portal öffnen" in the hub: a team member with their hub Google token gets a team session for the firm. */
async function vorschau(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const email = await teamMitglied(req, res, lz);
  if (!email) return;
  const firmaId = String(eingabe(req).firma_id ?? '');
  const s = await store(lz);
  if (!vorschauBerechtigung(await s.load(), firmaId, email)) return json(res, 404, { fehler: 'Diese Firma gibt es nicht (mehr).' });
  console.log(JSON.stringify({ vorschau: firmaId, von: email }));
  json(res, 200, erstelleVorschau(lz.siegel, firmaId, email, Date.now()));
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
  if (!abrufeProSitzung.erlaubt(anmeldung.sitzung.v ?? anmeldung.berechtigung.kontakt.id)) return json(res, 429, { fehler: 'Zu viele Abrufe. Bitte kurz warten.' });
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
  json(res, 200, kundensicht({ berechtigung: anmeldung.berechtigung, db: anmeldung.db, kunden, todos, portal, dateien: dateien.dateien, teamDomain: lz.teamDomain, vorschau: anmeldung.sitzung.v,
    einstellungen: anmeldung.sitzung.v ? null : einstellungenVon(anmeldung.berechtigung.zugang),
    andere: anmeldung.sitzung.v ? [] : alleBerechtigungen(anmeldung.db, portal, anmeldung.berechtigung.kontakt.email),
  }));
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
async function schreibend(req: Request, lz: Laufzeit, s: Store): Promise<{ berechtigung: Berechtigung; db: Awaited<ReturnType<Store['load']>>; sitzung: SitzungInhalt }> {
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) throw new PortalFehler(401, NICHT_ANGEMELDET);
  // Team access acts too, under the team member's own address (see vorschauBerechtigung).
  if (!schreibenProKontakt.erlaubt(anmeldung.sitzung.v ?? anmeldung.berechtigung.kontakt.id)) throw new PortalFehler(429, 'Das waren gerade sehr viele Änderungen. Bitte warte ein paar Minuten.');
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

/**
 * `POST /feedback`: stars and/or a comment of the client. Criticism (1–3 stars) goes straight to the people looking
 * after the client in Slack. Only clients give feedback; the team access shows the questions but cannot send.
 */
async function feedback(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const { berechtigung, sitzung } = await schreibend(req, lz, s);
  if (sitzung.v) throw new PortalFehler(403, 'Feedback gibt nur der Kunde – im Team-Zugang siehst du die Fragen nur.');
  const [todos, portal] = await Promise.all([s.loadTodoDaten(), s.loadPortalDaten()]);
  const neu = pruefeFeedback({ berechtigung, eingabe: eingabe(req), todos, portal, jetzt: new Date() });
  await s.insert('kunden_feedback', [neu]);
  if (istKritik(neu) && lz.slackDm) {
    try {
      const { firma, kontakt } = berechtigung;
      const erreicht = await lz.slackDm(personen(firma.zustaendig), kritikNachricht(neu, { firmaName: firma.name, kontaktName: `${kontakt.vorname} ${kontakt.nachname}`.trim() || kontakt.email, hub: lz.hubUrl }));
      if (erreicht.length) await s.update('kunden_feedback', [{ id: neu.id, changes: { gemeldet_am: new Date().toISOString() } }]);
      else console.warn('Kritisches Feedback: niemand in Slack erreicht', firma.id);
    } catch (err) {
      // The feedback is stored and visible in the hub; Slack is only the alarm.
      console.error('Kritisches Feedback: Slack fehlgeschlagen', err);
    }
  }
  console.log(JSON.stringify({ feedback: neu.id, firma: neu.firma_id, anlass: neu.anlass, sterne: neu.sterne }));
  json(res, 200, { ok: true, sterne: neu.sterne });
}

/** `POST /einstellungen`: the contact chooses how often and where they hear from us. */
async function einstellungen(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  const s = await store(lz);
  const anmeldung = await angemeldet(req, lz, s);
  if (!anmeldung) return json(res, 401, { fehler: NICHT_ANGEMELDET });
  if (anmeldung.sitzung.v) return json(res, 403, { fehler: 'Diese Einstellungen gehören zur jeweiligen Person. Im Hub kannst du sie unter „Portal“ für jeden Kontakt ändern.' });
  const { zugang, kontakt, firma } = anmeldung.berechtigung;
  if (!schreibenProKontakt.erlaubt(kontakt.id)) return json(res, 429, { fehler: 'Das waren gerade sehr viele Änderungen. Bitte warte ein paar Minuten.' });
  const neu = pruefeEinstellungen(eingabe(req), !!firma.slack_channel.trim());
  await s.update('portal_zugaenge', [{ id: zugang.id, changes: { ...neu, geaendert_am: new Date().toISOString(), geaendert_von: kontakt.email.trim() } }]);
  json(res, 200, neu);
}

/** `POST /versand`: called by Cloud Scheduler every 15 minutes with the shared secret in `X-Versand-Schluessel`. */
async function versand(req: Request, res: Response, lz: Laufzeit): Promise<void> {
  if (!lz.versandSchluessel) return json(res, 503, { fehler: 'Der Versand ist nicht eingerichtet (VERSAND_SCHLUESSEL fehlt).' });
  if (!vomScheduler(req, lz)) return json(res, 403, { fehler: 'Nicht erlaubt.' });
  const drive = new GoogleDrive(lz.token);
  const bericht = await versende({
    store: await store(lz),
    dateien: async (firma) => (await ladeKundenDateien(drive, firma.drive_ordner_id)).dateien,
    sendeMail: (an, betreff, text, html) => lz.mailer.sende(an, betreff, text, html),
    slack: lz.slackToken ? slackPoster(lz.slackToken) : null,
    portalUrl: lz.portalUrl,
    teamDomain: lz.teamDomain,
    jetzt: new Date(),
  });
  console.log(JSON.stringify({ versand: bericht }));
  json(res, 200, bericht);
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
    if (req.method === 'POST' && pfad === '/vorschau') return await vorschau(req, res, lz);
    if (req.method === 'POST' && pfad === '/wechseln') return await wechseln(req, res, lz);
    if (req.method === 'GET' && pfad === '/daten') return await daten(req, res, lz);
    if (req.method === 'POST' && pfad === '/freigabe') return await freigabe(req, res, lz);
    if (req.method === 'POST' && pfad === '/kommentar') return await kommentar(req, res, lz);
    if (req.method === 'POST' && pfad === '/anfrage') return await anfrage(req, res, lz);
    if (req.method === 'POST' && pfad === '/hochladen') return await hochladen(req, res, lz);
    if (req.method === 'POST' && pfad === '/einstellungen') return await einstellungen(req, res, lz);
    if (req.method === 'POST' && pfad === '/versand') return await versand(req, res, lz);
    if (req.method === 'POST' && pfad === '/kennzahlen') return await kennzahlen(req, res, lz);
    if (req.method === 'POST' && pfad === '/bericht') return await monatsbericht(req, res, lz);
    if (req.method === 'POST' && pfad === '/feedback') return await feedback(req, res, lz);
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
