import * as functions from '@google-cloud/functions-framework';
import { Limit, pruefeGoogleToken, ZugriffsFehler } from '../../contact-generator/src/auth';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { verbinde, type Verbindung } from '../../../db/verbindung';
import { timingSafeEqual } from 'node:crypto';
import { behandle, behandleAdmin, behandleDaten } from './routen';
import { nimmAnfrage } from './extern/eingang';
import { gmailVersand } from './extern/gmail';
import { behandleMagnet, type MagnetKonfig } from './extern/magnete';
import { schreibeSpiegel } from './extern/spiegel';
import { dienstkontoToken } from '../../kundenportal/src/google';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { slackBenachrichtiger } from '../../../src/data/slack';
import { leseTeamZuordnung } from '../../../src/data/selectors';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// The hub reloads every two minutes and on focus; 600 calls in ten minutes only stops runaway loops.
const limit = new Limit(600, 10 * 60 * 1000);

/** Who may take the sheet over into Postgres (Einrichtung → Übernahme). */
const ADMINS = (process.env.ADMINS ?? 'lukas@velonify.de,julian@velonify.de').split(',').map((a) => a.trim().toLowerCase());
const HAUPT_DB = process.env.DB_NAME ?? 'crm';

const verbindungen = new Map<string, Promise<Verbindung>>();
/** The main database, or crm_test for dry runs of the takeover. */
function datenbank(name = HAUPT_DB): Promise<Verbindung> {
  let verbindung = verbindungen.get(name);
  if (!verbindung) {
    verbindung = verbinde({ instanz: process.env.DB_INSTANZ ?? '', datenbank: name, nutzer: process.env.DB_NUTZER ?? '', max: name === HAUPT_DB ? 3 : 1 });
    verbindung.catch(() => verbindungen.delete(name));
    verbindungen.set(name, verbindung);
  }
  return verbindung;
}

/** Shared secrets of the website's Netlify functions, in the query string like the Apps Scripts had them. */
function passt(gegeben: unknown, erwartet: string | undefined): boolean {
  if (!erwartet || typeof gegeben !== 'string') return false;
  const a = Buffer.from(gegeben);
  const b = Buffer.from(erwartet.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @-mentions also go to Slack as direct messages when the Slack app's token is set (secret SLACK_BOT_TOKEN). */
const slack = process.env.SLACK_BOT_TOKEN?.trim()
  ? slackBenachrichtiger({
      token: process.env.SLACK_BOT_TOKEN.trim(),
      hub: process.env.HUB_URL || 'https://crm.velonify.de',
      teamZuordnung: leseTeamZuordnung(process.env.TEAM_ZUORDNUNG ?? ''),
    })
  : undefined;

/** Sheets access of the function's own service account (metadata server), only for the read-only copy. */
const spiegelToken = dienstkontoToken();

let magnetKonfig: MagnetKonfig | null = null;
function magnete(): MagnetKonfig {
  magnetKonfig ??= {
    basis: (process.env.BASIS_URL || 'https://velonify.de').replace(/\/$/, ''),
    signatur: process.env.SIGNATUR_NAME || 'Lukas Hanke',
    sende: gmailVersand({
      clientId: process.env.GMAIL_CLIENT_ID ?? '',
      clientSecret: (process.env.GMAIL_CLIENT_SECRET ?? '').trim(),
      refreshToken: (process.env.GMAIL_REFRESH_TOKEN ?? '').trim(),
      absender: process.env.MAIL_ABSENDER || 'Lukas von Velonify <lukas@velonify.de>',
      antwortAn: process.env.MAIL_ANTWORT_AN || undefined,
    }),
  };
  return magnetKonfig;
}

const erlaubteHerkunft = (origin: string) => ERLAUBTE_HERKUNFT.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);

functions.http('crmApi', async (req, res) => {
  const origin = req.get('origin') ?? '';
  res.set('Vary', 'Origin');
  res.set('Cache-Control', 'no-store');
  if (erlaubteHerkunft(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const fehler = (status: number, meldung: string) => res.status(status).json({ fehler: meldung });
  const pfad = req.path.replace(/\/+$/, '') || '/';

  if (pfad === '/gesundheit') {
    try {
      const { pool } = await datenbank();
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch (err) {
      console.error('Datenbank nicht erreichbar', err);
      fehler(503, 'Datenbank nicht erreichbar.');
    }
    return;
  }

  // Nightly copy into the read-only sheet, started by Cloud Scheduler with its own token.
  if (pfad === '/extern/spiegel') {
    if (req.method !== 'POST' || !passt(req.query.token, process.env.SPIEGEL_TOKEN) || !process.env.SPIEGEL_SHEET_ID) return void fehler(403, 'Falsches Token.');
    try {
      const { pool } = await datenbank();
      const anzahl = await schreibeSpiegel(new PostgresStore(pool), new SheetsClient(process.env.SPIEGEL_SHEET_ID, spiegelToken));
      console.log(JSON.stringify({ pfad, zeilen: Object.values(anzahl).reduce((a, b) => a + b, 0) }));
      res.json({ ok: true, anzahl });
    } catch (err) {
      console.error('Spiegel fehlgeschlagen', err);
      fehler(500, err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // Website (Netlify functions): same answer format as the Apps Scripts, HTTP 200 with the outcome in `status`.
  if (pfad === '/extern/eingang' || pfad === '/extern/magnete') {
    const eingang = pfad === '/extern/eingang';
    if (req.method !== 'POST' || !passt(req.query.token, eingang ? process.env.EINGANG_TOKEN : process.env.MAGNETE_TOKEN)) {
      return void res.status(200).json({ status: 403, text: 'Falsches Token.' });
    }
    try {
      const { pool } = await datenbank();
      const antwort = eingang ? await nimmAnfrage(pool, req.body) : await behandleMagnet(pool, magnete(), req.body);
      console.log(JSON.stringify({ pfad, aktion: (req.body as { aktion?: string })?.aktion, status: antwort.status, text: antwort.text }));
      res.status(200).json(antwort);
    } catch (err) {
      console.error(`${pfad} fehlgeschlagen`, err);
      res.status(200).json({ status: 500, text: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const token = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
  if (!token) return void fehler(401, 'Nicht angemeldet.');
  let email: string;
  try {
    email = await pruefeGoogleToken(token, { clientId: CLIENT_ID, domain: DOMAIN });
  } catch (err) {
    if (err instanceof ZugriffsFehler) return void fehler(err.status, err.message);
    console.error('Token-Prüfung fehlgeschlagen', err);
    return void fehler(502, 'Die Anmeldung konnte gerade nicht geprüft werden.');
  }
  if (!limit.erlaubt(email)) return void fehler(429, 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten.');

  const start = Date.now();
  if (pfad.startsWith('/admin/')) {
    if (!ADMINS.includes(email)) return void fehler(403, 'Nur für Lukas und Julian.');
    const ziel = req.method === 'GET' ? String(req.query.ziel ?? HAUPT_DB) : String((req.body as { ziel?: unknown })?.ziel ?? HAUPT_DB);
    if (ziel !== HAUPT_DB && ziel !== 'crm_test') return void fehler(400, 'Unbekannte Zieldatenbank.');
    try {
      const { pool } = await datenbank(ziel);
      const antwort = await behandleAdmin(req.method, pfad, req.body, pool);
      console.log(JSON.stringify({ email, pfad, ziel, tab: (req.body as { tab?: string })?.tab, status: antwort.status, dauer_ms: Date.now() - start }));
      res.status(antwort.status).json(antwort.daten);
    } catch (err) {
      console.error(`${req.method} ${pfad} fehlgeschlagen`, err);
      fehler(500, err instanceof Error ? err.message : 'Die Datenbank hat mit einem Fehler geantwortet.');
    }
    return;
  }
  try {
    const { pool } = await datenbank();
    const store = new PostgresStore(pool, () => email);
    const antwort = (await behandleDaten(req.method, pfad, req.body, store)) ?? (await behandle(req.method, pfad, req.body, store, { erwaehnt: slack }));
    if (req.method !== 'GET') console.log(JSON.stringify({ email, pfad, tab: (req.body as { tab?: string })?.tab, status: antwort.status, dauer_ms: Date.now() - start }));
    res.status(antwort.status).json(antwort.daten);
  } catch (err) {
    console.error(`${req.method} ${pfad} fehlgeschlagen`, err);
    fehler(500, 'Die Datenbank hat mit einem Fehler geantwortet.');
  }
});
