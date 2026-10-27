import * as functions from '@google-cloud/functions-framework';
import { Limit, pruefeGoogleKonto, ZugriffsFehler } from '../../gemeinsam/auth';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { istMitarbeiterIn, MitarbeiterStore, vergissMitarbeiter } from '../../../src/data/postgres/mitarbeiterStore';
import { GesperrtError } from '../../../src/data/errors';
import { verbinde, type Verbindung } from '../../../db/verbindung';
import { timingSafeEqual } from 'node:crypto';
import { behandle, behandleAdmin, behandleDaten } from './routen';
import { behandleMandant, behandlePlattformAdmin, pruefeKi, type MandantKontext } from './plattform';
import { PlattformStore } from '../../../src/data/postgres/plattformStore';
import { aktiveWerkzeuge } from '../../../src/data/plattform';
import { nimmAnfrage } from './extern/eingang';
import { gmailVersand } from './extern/gmail';
import { behandleMagnet, type MagnetKonfig } from './extern/magnete';
import { schreibeSpiegel } from './extern/spiegel';
import { dienstkontoToken } from '../../gemeinsam/google';
import { SheetsClient } from '../../../src/data/sheets/sheetsClient';
import { slackBenachrichtiger, slackDirekt } from '../../../src/data/slack';
import { leseTeamZuordnung } from '../../../src/data/selectors';
import { PraesenzRaum, pruefeMeldung } from '../../../src/data/praesenz';
import { behandleWhiteboard, cloudStorage, speicherAblage, type Ablage } from './whiteboard';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
/** OAuth client of the tenants' hub (app.velonify.de, own Google project with an external audience, only openid/email/profile). */
const MANDANTEN_CLIENT_ID = process.env.MANDANTEN_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://app.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// The hub reloads every two minutes and on focus, open tabs send a heartbeat every 20 s; 600 calls in ten minutes only stops runaway loops.
const limit = new Limit(600, 10 * 60 * 1000);
// Tenants get half of that: enough for the hub, too little to page through anything in bulk.
const mandantenLimit = new Limit(300, 10 * 60 * 1000);

/** Who may take the sheet over into Postgres (Einrichtung → Übernahme). */
const ADMINS = (process.env.ADMINS ?? 'lukas@velonify.de,julian@velonify.de').split(',').map((a) => a.trim().toLowerCase());
const HAUPT_DB = process.env.DB_NAME ?? 'crm';

const verbindungen = new Map<string, Promise<Verbindung>>();
/** The main database, or crm_test for dry runs of the takeover. */
function datenbank(name = HAUPT_DB): Promise<Verbindung> {
  let verbindung = verbindungen.get(name);
  if (!verbindung) {
    // crm 3, a tenant's hub_<id> 2, crm_test 1; the role crm-api may hold PLATTFORM_VERBINDUNGEN (see functions/crm-api/README.md).
    const max = name === HAUPT_DB ? 3 : name.startsWith('hub_') ? 2 : 1;
    verbindung = verbinde({ instanz: process.env.DB_INSTANZ ?? '', datenbank: name, nutzer: process.env.DB_NUTZER ?? '', max });
    verbindung.catch(() => verbindungen.delete(name));
    verbindungen.set(name, verbindung);
  }
  return verbindung;
}

/** Shared secrets of the website's Netlify functions and of Cloud Scheduler, only in the header (query strings end up in request logs). */
function mitgegebenesToken(req: functions.Request): unknown {
  return req.get('x-velonify-token');
}

function passt(gegeben: unknown, erwartet: string | undefined): boolean {
  if (!erwartet || typeof gegeben !== 'string') return false;
  const a = Buffer.from(gegeben);
  const b = Buffer.from(erwartet.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Addresses whose team name is not the start of the address, e.g. lukas@velonify.de=Lugge. */
const teamZuordnung = leseTeamZuordnung(process.env.TEAM_ZUORDNUNG ?? '');

/** @-mentions also go to Slack as direct messages when the Slack app's token is set (secret SLACK_BOT_TOKEN). */
const slack = process.env.SLACK_BOT_TOKEN?.trim()
  ? slackBenachrichtiger({
      token: process.env.SLACK_BOT_TOKEN.trim(),
      hub: process.env.HUB_URL || 'https://crm.velonify.de',
      teamZuordnung,
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

/** Images of the whiteboards: the bucket WHITEBOARD_BUCKET, without it (local runs) only in memory. */
const whiteboardAblage: Ablage = process.env.WHITEBOARD_BUCKET
  ? cloudStorage(process.env.WHITEBOARD_BUCKET, dienstkontoToken(fetch, ['https://www.googleapis.com/auth/devstorage.read_write']))
  : speicherAblage();

/** Who is in the hub right now: only in memory, which works because crm-api runs as a single instance. */
const praesenz = new PraesenzRaum();
/** Each tenant has its own room: nobody sees people of another hub. */
const mandantenPraesenz = new Map<string, PraesenzRaum>();

/** Team members who hear about tenants (feedback, bookings, decoys) by Slack DM. */
const PLATTFORM_MELDEN_AN = (process.env.PLATTFORM_MELDEN_AN ?? 'Lugge').split(',').map((p) => p.trim()).filter(Boolean);
const slackDm = process.env.SLACK_BOT_TOKEN?.trim() ? slackDirekt({ token: process.env.SLACK_BOT_TOKEN.trim(), teamZuordnung }) : undefined;
async function meldePlattform(text: string): Promise<void> {
  console.log(JSON.stringify({ plattform: text }));
  await slackDm?.(PLATTFORM_MELDEN_AN, text).catch((err) => console.error('Slack-Meldung fehlgeschlagen', err));
}

/** Where tenants' KI requests go, with the shared secret those functions accept instead of a Velonify login. */
const KI_URLS: Record<string, string> = {
  contact: (process.env.CONTACT_GENERATOR_URL ?? '').replace(/\/$/, ''),
  audit: (process.env.SHOP_AUDIT_URL ?? '').replace(/\/$/, ''),
};

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
    if (req.method !== 'POST' || !passt(mitgegebenesToken(req), process.env.SPIEGEL_TOKEN) || !process.env.SPIEGEL_SHEET_ID) return void fehler(403, 'Falsches Token.');
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
    if (req.method !== 'POST' || !passt(mitgegebenesToken(req), eingang ? process.env.EINGANG_TOKEN : process.env.MAGNETE_TOKEN)) {
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
  let client: string;
  try {
    ({ email, client } = await pruefeGoogleKonto(token, { clientId: [CLIENT_ID, MANDANTEN_CLIENT_ID].filter(Boolean).join(',') }));
  } catch (err) {
    if (err instanceof ZugriffsFehler) return void fehler(err.status, err.message);
    console.error('Token-Prüfung fehlgeschlagen', err);
    return void fehler(502, 'Die Anmeldung konnte gerade nicht geprüft werden.');
  }

  // Tenants: any verified address on the whitelist, signed in through the tenants' own client, into their own database.
  if (client === MANDANTEN_CLIENT_ID && !CLIENT_ID.split(',').map((c) => c.trim()).includes(client)) {
    if (email.endsWith(`@${DOMAIN}`)) return void fehler(403, 'Velonify meldet sich unter crm.velonify.de an.');
    if (!mandantenLimit.erlaubt(email)) return void fehler(429, 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten.');
    return void (await mandantenAnfrage(req, res, pfad, email, fehler));
  }
  if (!email.endsWith(`@${DOMAIN}`)) return void fehler(403, `Nur für Konten mit @${DOMAIN}.`);
  if (!limit.erlaubt(email)) return void fehler(429, 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten.');

  // Heartbeat of an open hub tab: stores where it is and answers with everyone else.
  if (pfad === '/praesenz') {
    if (req.method !== 'POST') return void fehler(405, 'Nur POST.');
    const meldung = pruefeMeldung(req.body);
    if (!meldung) return void fehler(400, 'Meldung ungültig.');
    if ('weg' in meldung) praesenz.weg(email, meldung.tab);
    else praesenz.melde(email, meldung);
    res.json({ anwesende: praesenz.anwesende(email).map((a) => ({ ...a, name: teamZuordnung.get(a.email) })) });
    return;
  }

  const start = Date.now();
  if (pfad.startsWith('/plattform/')) {
    if (!ADMINS.includes(email)) return void fehler(403, 'Nur für Lukas und Julian.');
    try {
      const { pool } = await datenbank();
      const antwort = await behandlePlattformAdmin(req.method, pfad, req.query as Record<string, unknown>, req.body, new PlattformStore(pool), email);
      if (req.method !== 'GET') console.log(JSON.stringify({ email, pfad, status: antwort.status, dauer_ms: Date.now() - start }));
      res.status(antwort.status).json(antwort.daten);
    } catch (err) {
      console.error(`${req.method} ${pfad} fehlgeschlagen`, err);
      fehler(500, err instanceof Error ? err.message : 'Die Datenbank hat mit einem Fehler geantwortet.');
    }
    return;
  }
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
    const wb = await behandleWhiteboard(req.method, pfad, req.body, { pool, ablage: whiteboardAblage, email, roh: req.rawBody, typ: req.get('content-type') });
    if (wb && 'inhalt' in wb) {
      // Images never change under their id, so the browser may keep them.
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      return void res.status(200).type(wb.typ).send(wb.inhalt);
    }
    if (wb) {
      if (req.method !== 'GET') console.log(JSON.stringify({ email, pfad, status: wb.status, dauer_ms: Date.now() - start }));
      return void res.status(wb.status).json(wb.daten);
    }
    // Employees get the same hub without money: see src/data/rollen.ts.
    const mitarbeiter = !ADMINS.includes(email) && (await istMitarbeiterIn(pool, email));
    const store = mitarbeiter ? new MitarbeiterStore(pool, () => email) : new PostgresStore(pool, () => email);
    const antwort =
      (await behandleDaten(req.method, pfad, req.body, store)) ??
      (await behandle(req.method, pfad, req.body, store, { erwaehnt: slack, darfRollen: ADMINS.includes(email) }));
    if (pfad === '/einstellungen' && antwort.status === 200) vergissMitarbeiter(pool);
    if (req.method !== 'GET') console.log(JSON.stringify({ email, pfad, tab: (req.body as { tab?: string })?.tab, mitarbeiter: mitarbeiter || undefined, status: antwort.status, dauer_ms: Date.now() - start }));
    res.status(antwort.status).json(antwort.daten);
  } catch (err) {
    if (err instanceof GesperrtError) return void fehler(403, err.message);
    console.error(`${req.method} ${pfad} fehlgeschlagen`, err);
    fehler(500, 'Die Datenbank hat mit einem Fehler geantwortet.');
  }
});

/** A request of a tenant: whitelist, own database, own presence room, KI through the quota, everything else via behandleMandant. */
async function mandantenAnfrage(
  req: functions.Request,
  res: functions.Response,
  pfad: string,
  email: string,
  fehler: (status: number, meldung: string) => unknown,
): Promise<void> {
  const start = Date.now();
  try {
    const { pool: crm } = await datenbank();
    const plattform = new PlattformStore(crm);
    const treffer = await plattform.zugang(email);
    if (!treffer) return void fehler(403, 'Für diese Adresse gibt es keinen Zugang. Meldet euch bei Velonify, wenn ihr eingeladen wurdet.');
    const { zugang, mandant } = treffer;
    const { pool } = await datenbank(`hub_${mandant.id}`);

    if (pfad === '/praesenz') {
      if (req.method !== 'POST') return void fehler(405, 'Nur POST.');
      const meldung = pruefeMeldung(req.body);
      if (!meldung) return void fehler(400, 'Meldung ungültig.');
      let raum = mandantenPraesenz.get(mandant.id);
      if (!raum) mandantenPraesenz.set(mandant.id, (raum = new PraesenzRaum()));
      if ('weg' in meldung) raum.weg(email, meldung.tab);
      else raum.melde(email, meldung);
      return void res.json({ anwesende: raum.anwesende(email) });
    }

    const ki = /^\/ki\/([a-z]+)(\/.*)?$/.exec(pfad);
    if (ki) {
      if (req.method !== 'POST') return void fehler(405, 'Nur POST.');
      const ziel = KI_URLS[ki[1]];
      const geprueft = await pruefeKi(ki[1], ki[2] ?? '/', { plattform, mandant, zugang }, aktiveWerkzeuge(mandant));
      if (!('pfad' in geprueft)) return void res.status(geprueft.status).json(geprueft.daten);
      if (!ziel || !process.env.PLATTFORM_TOKEN) return void fehler(503, 'Dieses Werkzeug ist für Mandanten noch nicht eingerichtet.');
      const antwort = await fetch(`${ziel}${geprueft.pfad === '/' ? '' : geprueft.pfad}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-velonify-plattform': process.env.PLATTFORM_TOKEN.trim(), 'x-velonify-person': email, 'x-velonify-mandant': mandant.id },
        body: JSON.stringify(req.body ?? {}),
      });
      console.log(JSON.stringify({ mandant: mandant.id, email, pfad, status: antwort.status, dauer_ms: Date.now() - start }));
      res.status(antwort.status).type('application/json').send(await antwort.text());
      return;
    }

    const ctx: MandantKontext = { plattform, zugang, mandant, pool, store: new PostgresStore(pool, () => email), melde: meldePlattform };
    const antwort = await behandleMandant(req.method, pfad, req.body, ctx);
    if (req.method !== 'GET') console.log(JSON.stringify({ mandant: mandant.id, email, pfad, tab: (req.body as { tab?: string })?.tab, status: antwort.status, dauer_ms: Date.now() - start }));
    res.status(antwort.status).json(antwort.daten);
  } catch (err) {
    console.error(`Mandant ${req.method} ${pfad} fehlgeschlagen`, err);
    fehler(500, 'Die Datenbank hat mit einem Fehler geantwortet.');
  }
}
