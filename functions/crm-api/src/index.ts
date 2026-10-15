import * as functions from '@google-cloud/functions-framework';
import { Limit, pruefeGoogleToken, ZugriffsFehler } from '../../contact-generator/src/auth';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { verbinde, type Verbindung } from '../../../db/verbindung';
import { behandle } from './routen';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// The hub reloads every two minutes and on focus; 600 calls in ten minutes only stops runaway loops.
const limit = new Limit(600, 10 * 60 * 1000);

let verbindung: Promise<Verbindung> | null = null;
function datenbank(): Promise<Verbindung> {
  verbindung ??= verbinde({
    instanz: process.env.DB_INSTANZ ?? '',
    datenbank: process.env.DB_NAME ?? 'crm',
    nutzer: process.env.DB_NUTZER ?? '',
    max: 3,
  }).catch((err: unknown) => {
    verbindung = null;
    throw err;
  });
  return verbindung;
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
  try {
    const { pool } = await datenbank();
    const antwort = await behandle(req.method, pfad, req.body, new PostgresStore(pool, () => email));
    if (req.method !== 'GET') console.log(JSON.stringify({ email, pfad, tab: (req.body as { tab?: string })?.tab, status: antwort.status, dauer_ms: Date.now() - start }));
    res.status(antwort.status).json(antwort.daten);
  } catch (err) {
    console.error(`${req.method} ${pfad} fehlgeschlagen`, err);
    fehler(500, 'Die Datenbank hat mit einem Fehler geantwortet.');
  }
});
