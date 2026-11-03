import { createHash, randomBytes } from 'node:crypto';
import { darfEinrichten, teamName } from '../../../../src/data/instanz';
import type { Db } from '../../../../src/data/postgres/postgresStore';
import { personen } from '../../../../src/data/zustaendig';
import { artLabel, type GoogleKalenderStand, type GoogleTermin } from '../../../../src/creator/kalender/typen';
import type { Antwort } from '../routen';
import type { Geheimnisse } from './geheimnisse';
import { fehler, istObjekt, ok, type CreatorKontext, type OeffentlichKontext, type Umgebung } from './modul';

/**
 * Google-Kalender-Anbindung (Noels Feedback 11/2026): Eine Person (bei Matsu Noel) verbindet einmal ihren Google-Kalender.
 * Die Fristen des Hubs stehen dann als Termine darin, die Zuständigen als Gäste, damit sie auch in deren Kalendern landen;
 * die übrigen Termine des Google-Kalenders zeigt der Hub-Kalender an. OAuth-Client der Instanz (GOOGLE_KALENDER_CLIENT_ID,
 * sonst der Login-Client GOOGLE_CLIENT_ID; Secret GOOGLE_KALENDER_CLIENT_SECRET), Tokens im Secret Manager der Instanz, Scope calendar.events.
 */

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const KALENDER = 'https://www.googleapis.com/calendar/v3/calendars';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const SECRET = 'kanal-google-kalender';
/** Fristen from a week ago up to half a year ahead go into Google. */
const ZURUECK_TAGE = 7;
const VORAUS_TAGE = 183;
/** Writes per run; the rest follows with the next run. */
const MAX_SCHREIBEN = 150;

type Holen = typeof fetch;
let holenStandard: Holen = (...a) => fetch(...a);
/** Tests replace Google. */
export function setzeKalenderNetz(h: Holen | null) {
  holenStandard = h ?? ((...a) => fetch(...a));
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  laeuft_ab: string;
}

interface Dienste {
  pool: Db;
  geheimnisse: Geheimnisse;
  umgebung: Umgebung;
  jetzt(): Date;
}

class KalenderProblem extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function konfig(u: Umgebung) {
  // Without an own client the login client of the instance (GOOGLE_CLIENT_ID) is used; its secret comes as GOOGLE_KALENDER_CLIENT_SECRET.
  const eigener = u.wert('GOOGLE_KALENDER_CLIENT_ID');
  const clientId = eigener ?? u.wert('GOOGLE_CLIENT_ID');
  const clientSecret = u.wert('GOOGLE_KALENDER_CLIENT_SECRET');
  return clientId && clientSecret && u.apiUrl && u.hubUrl ? { clientId, clientSecret } : null;
}
const rueckruf = (u: Umgebung) => `${u.apiUrl.replace(/\/$/, '')}/oeffentlich/kalender/google`;

const heuteIn = (jetzt: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
function plusTage(tag: string, tage: number) {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
const text = (w: unknown) => (w === null || w === undefined ? '' : String(w));
const datum = (w: unknown) => (w instanceof Date ? w.toISOString().slice(0, 10) : text(w).slice(0, 10));

async function formular<T>(holen: Holen, felder: Record<string, string>): Promise<T> {
  const r = await holen(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder) });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new KalenderProblem(r.status === 400 ? 401 : 502, d.error === 'invalid_grant' ? 'Die Verbindung zu Google Kalender ist abgelaufen oder wurde entzogen. Bitte neu verbinden.' : `Google antwortet mit Fehler ${r.status}.`);
  return d;
}

async function verbindung(db: Db) {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM google_kalender WHERE id = 1');
  return rows[0] ?? null;
}

async function zugang(d: Dienste, holen: Holen): Promise<{ token: string; kalender: string; email: string } | null> {
  const v = await verbindung(d.pool);
  const k = konfig(d.umgebung);
  if (!v || !k) return null;
  const roh = await d.geheimnisse.lesen(SECRET);
  if (!roh) throw new KalenderProblem(401, 'Kein Zugang zu Google Kalender gespeichert. Bitte neu verbinden.');
  let t = JSON.parse(roh) as Tokens;
  if (!t.access_token || Date.parse(t.laeuft_ab) - d.jetzt().getTime() < 5 * 60_000) {
    const neu = await formular<{ access_token: string; expires_in?: number; refresh_token?: string }>(holen, { client_id: k.clientId, client_secret: k.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' });
    t = { access_token: neu.access_token, refresh_token: neu.refresh_token ?? t.refresh_token, laeuft_ab: new Date(d.jetzt().getTime() + (neu.expires_in ?? 3600) * 1000).toISOString() };
    await d.geheimnisse.schreiben(SECRET, JSON.stringify(t));
  }
  return { token: t.access_token, kalender: text(v.kalender_id) || 'primary', email: text(v.email) };
}

async function google<T>(holen: Holen, token: string, url: string, init: RequestInit = {}): Promise<{ status: number; daten: T | null }> {
  const r = await holen(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } });
  if (r.status === 404 || r.status === 410) return { status: r.status, daten: null };
  if (r.status === 204) return { status: 204, daten: null };
  const daten = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok) throw new KalenderProblem(r.status === 401 ? 401 : 502, `Google Kalender antwortet mit Fehler ${r.status}: ${daten?.error?.message ?? 'ohne Meldung'}`);
  return { status: r.status, daten };
}

/** Team names to addresses: everyone in the instance's access list. */
async function adressen(db: Db): Promise<Map<string, string>> {
  const { rows } = await db.query<{ email: string; name: string }>('SELECT email, name FROM instanz_zugaenge WHERE aktiv');
  return new Map(rows.map((z) => [teamName({ name: z.name, email: z.email }), z.email.toLowerCase()]));
}

/** The Google event of a deadline: all-day as a date, with a time as 30 minutes in Berlin time. */
export function terminVon(f: Record<string, unknown>, gaeste: string[], hubUrl: string) {
  const id = text(f.id);
  const tag = datum(f.datum);
  const roh = text(f.link);
  const link = roh && !roh.startsWith('/') ? roh : `${hubUrl.replace(/\/$/, '')}/#${roh || `/kalender?frist=${encodeURIComponent(id)}`}`;
  const uhrzeit = text(f.uhrzeit).slice(0, 5);
  const ende = (() => {
    if (!uhrzeit) return null;
    const [h, m] = uhrzeit.split(':').map(Number);
    const minuten = h * 60 + m + 30;
    // Past midnight the event simply ends at 23:59, as a deadline should not move to the next day.
    return minuten >= 24 * 60 ? '23:59' : `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
  })();
  return {
    summary: `${f.erledigt ? 'Erledigt: ' : ''}${text(f.titel)}`,
    description: [artLabel(text(f.art)), f.zustaendig ? `Zuständig: ${text(f.zustaendig)}` : '', text(f.notiz), `Im Hub: ${link}`].filter(Boolean).join('\n'),
    start: uhrzeit ? { dateTime: `${tag}T${uhrzeit}:00`, timeZone: 'Europe/Berlin' } : { date: tag },
    end: uhrzeit ? { dateTime: `${tag}T${ende}:00`, timeZone: 'Europe/Berlin' } : { date: plusTage(tag, 1) },
    transparency: uhrzeit ? 'opaque' : 'transparent',
    attendees: gaeste.map((email) => ({ email })),
    extendedProperties: { private: { hubFrist: id } },
  };
}

/**
 * Brings the deadlines of the coming half year into the connected Google calendar: new ones are created, changed ones
 * updated, archived ones deleted. Only changes cost requests (a hash per deadline). Guests get no mails from the hub.
 */
export async function gleicheKalenderAb(d: Dienste, optionen: { wennAelterAlsMinuten?: number } = {}, holen: Holen = holenStandard): Promise<{ geschrieben: number; geloescht: number } | null> {
  const v = await verbindung(d.pool);
  if (!v || !konfig(d.umgebung)) return null;
  if (optionen.wennAelterAlsMinuten && v.abgeglichen_am && d.jetzt().getTime() - new Date(v.abgeglichen_am as string).getTime() < optionen.wennAelterAlsMinuten * 60_000) return null;
  try {
    const z = await zugang(d, holen);
    if (!z) return null;
    const heute = heuteIn(d.jetzt());
    const von = plusTage(heute, -ZURUECK_TAGE);
    const { rows: fristen } = await d.pool.query<Record<string, unknown>>('SELECT * FROM fristen WHERE NOT archiviert AND datum BETWEEN $1 AND $2 ORDER BY datum', [von, plusTage(heute, VORAUS_TAGE)]);
    const { rows: termine } = await d.pool.query<{ frist_id: string; event_id: string; stand: string }>('SELECT frist_id, event_id, stand FROM google_kalender_termine');
    const bekannt = new Map(termine.map((t) => [t.frist_id, t]));
    const namen = await adressen(d.pool);
    const basis = `${KALENDER}/${encodeURIComponent(z.kalender)}/events`;
    let geschrieben = 0;
    let geloescht = 0;
    for (const f of fristen) {
      if (geschrieben >= MAX_SCHREIBEN) break;
      const gaeste = [...new Set(personen(text(f.zustaendig)).map((p) => namen.get(p)).filter((e): e is string => Boolean(e) && e !== z.email.toLowerCase()))];
      const termin = terminVon(f, gaeste, d.umgebung.hubUrl);
      const stand = createHash('sha256').update(JSON.stringify(termin)).digest('hex').slice(0, 32);
      const alt = bekannt.get(text(f.id));
      if (alt?.stand === stand) continue;
      let eventId = '';
      if (alt) {
        const r = await google<{ id: string }>(holen, z.token, `${basis}/${encodeURIComponent(alt.event_id)}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(termin) });
        eventId = r.daten?.id ?? '';
      }
      // Deleted in Google, or new: create it (again).
      if (!eventId) eventId = (await google<{ id: string }>(holen, z.token, `${basis}?sendUpdates=none`, { method: 'POST', body: JSON.stringify(termin) })).daten?.id ?? '';
      if (!eventId) continue;
      await d.pool.query(
        `INSERT INTO google_kalender_termine (frist_id, event_id, stand, abgeglichen_am) VALUES ($1, $2, $3, now())
         ON CONFLICT (frist_id) DO UPDATE SET event_id = $2, stand = $3, abgeglichen_am = now()`,
        [text(f.id), eventId, stand],
      );
      geschrieben++;
    }
    const aktuell = new Set(fristen.map((f) => text(f.id)));
    for (const t of termine) {
      if (aktuell.has(t.frist_id) || geloescht >= MAX_SCHREIBEN) continue;
      const { rows } = await d.pool.query<{ archiviert: boolean; datum: unknown }>('SELECT archiviert, datum FROM fristen WHERE id = $1', [t.frist_id]);
      // Past deadlines stay in Google as history; archived and deleted ones go.
      if (rows[0] && !rows[0].archiviert && datum(rows[0].datum) < von) {
        await d.pool.query('DELETE FROM google_kalender_termine WHERE frist_id = $1', [t.frist_id]);
        continue;
      }
      if (rows[0] && !rows[0].archiviert) continue;
      await google(holen, z.token, `${basis}/${encodeURIComponent(t.event_id)}?sendUpdates=none`, { method: 'DELETE' });
      await d.pool.query('DELETE FROM google_kalender_termine WHERE frist_id = $1', [t.frist_id]);
      geloescht++;
    }
    await d.pool.query('UPDATE google_kalender SET abgeglichen_am = now(), fehler = NULL WHERE id = 1');
    return { geschrieben, geloescht };
  } catch (e) {
    await d.pool.query('UPDATE google_kalender SET abgeglichen_am = now(), fehler = $1 WHERE id = 1', [(e as Error).message.slice(0, 500)]);
    throw e;
  }
}

const berlin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function inBerlin(iso: string) {
  const t = Object.fromEntries(berlin.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { tag: `${t.year}-${t.month}-${t.day}`, zeit: `${t.hour}:${t.minute}` };
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/** The other events of the connected calendar in a range, for the hub calendar (the hub's own deadlines left out). */
export async function googleTermine(d: Dienste, von: string, bis: string, holen: Holen = holenStandard): Promise<GoogleTermin[]> {
  const z = await zugang(d, holen);
  if (!z) return [];
  const q = new URLSearchParams({ timeMin: `${plusTage(von, -1)}T00:00:00Z`, timeMax: `${plusTage(bis, 1)}T23:59:59Z`, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
  const r = await google<{ items?: GoogleEvent[] }>(holen, z.token, `${KALENDER}/${encodeURIComponent(z.kalender)}/events?${q}`);
  const termine: GoogleTermin[] = [];
  for (const e of r.daten?.items ?? []) {
    if (e.status === 'cancelled' || e.extendedProperties?.private?.hubFrist) continue;
    const ganztaegig = Boolean(e.start?.date);
    const start = ganztaegig ? { tag: e.start!.date!, zeit: '' } : e.start?.dateTime ? inBerlin(e.start.dateTime) : null;
    if (!start || start.tag < von || start.tag > bis) continue;
    const ende = ganztaegig ? { tag: plusTage(e.end?.date ?? start.tag, -1), zeit: '' } : e.end?.dateTime ? inBerlin(e.end.dateTime) : start;
    termine.push({ id: e.id, titel: e.summary || '(ohne Titel)', datum: start.tag, uhrzeit: start.zeit, bis_datum: ende.tag, bis_uhrzeit: ende.zeit, ganztaegig, ort: e.location ?? '', link: e.htmlLink ?? '' });
  }
  return termine;
}

async function stand(d: Dienste): Promise<GoogleKalenderStand> {
  const v = await verbindung(d.pool);
  return {
    einrichtbar: Boolean(konfig(d.umgebung)),
    verbunden: v ? { email: text(v.email), verbunden_von: text(v.verbunden_von), verbunden_am: v.verbunden_am ? new Date(v.verbunden_am as string).toISOString() : '', abgeglichen_am: v.abgeglichen_am ? new Date(v.abgeglichen_am as string).toISOString() : '', fehler: text(v.fehler) } : null,
  };
}

export async function googleKalenderRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext, holen: Holen = holenStandard): Promise<Antwort | null> {
  if (!pfad.startsWith('/c/kalender/google')) return null;
  if (ctx.rolle === 'partner') return fehler(403, 'Die Google-Kalender-Anbindung verwaltet das interne Team.');
  const d: Dienste = ctx;
  if (pfad === '/c/kalender/google' && methode === 'GET') return ok({ google: await stand(d) });
  if (methode !== 'POST') return null;
  try {
    if (pfad === '/c/kalender/google/abgleichen') return ok({ ergebnis: await gleicheKalenderAb(d, {}, holen), google: await stand(d) });
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Google-Kalender-Anbindung richten Admins ein.');
    if (pfad === '/c/kalender/google/verbinden') {
      const k = konfig(ctx.umgebung);
      if (!k) return fehler(503, 'Die Google-Anmeldung ist für diesen Hub noch nicht eingerichtet (OAuth-Client fehlt).');
      const state = randomBytes(32).toString('base64url');
      await ctx.pool.query("DELETE FROM google_kalender_oauth WHERE erstellt_am < now() - interval '1 day'");
      await ctx.pool.query('INSERT INTO google_kalender_oauth (state, email, person) VALUES ($1, $2, $3)', [state, ctx.email, ctx.person]);
      const p = new URLSearchParams({ client_id: k.clientId, redirect_uri: rueckruf(ctx.umgebung), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
      if (istObjekt(body) && typeof body.email === 'string' && body.email.includes('@')) p.set('login_hint', body.email.trim());
      return ok({ url: `${AUTH}?${p}` });
    }
    if (pfad === '/c/kalender/google/trennen') {
      // The events stay in Google; only the connection and the mapping go.
      await ctx.pool.query('DELETE FROM google_kalender WHERE id = 1');
      await ctx.pool.query('DELETE FROM google_kalender_termine');
      if (ctx.geheimnisse.loeschen) await ctx.geheimnisse.loeschen(SECRET);
      else await ctx.geheimnisse.schreiben(SECRET, '{}');
      return ok({ google: await stand(d) });
    }
  } catch (e) {
    if (e instanceof KalenderProblem) return fehler(e.status, e.message);
    throw e;
  }
  return null;
}

/** OAuth callback: GET /oeffentlich/kalender/google?code&state. */
export async function googleKalenderOeffentlich(methode: string, pfad: string, query: Record<string, string>, ctx: OeffentlichKontext, holen: Holen = holenStandard): Promise<Antwort | null> {
  if (pfad !== '/oeffentlich/kalender/google' || methode !== 'GET') return null;
  const zurueck = (ergebnis: string) => ok({ umleiten: `${ctx.umgebung.hubUrl.replace(/\/$/, '')}/#/kalender?google=${ergebnis}` });
  if (!ctx.bausteine.includes('kalender')) return fehler(404, 'Der Kalender ist ausgeschaltet.');
  const { rows } = await ctx.pool.query<{ email: string; person: string }>(
    "UPDATE google_kalender_oauth SET verbraucht_am = now() WHERE state = $1 AND verbraucht_am IS NULL AND erstellt_am > now() - interval '10 minutes' RETURNING email, person",
    [query.state ?? ''],
  );
  const versuch = rows[0];
  if (!versuch) return fehler(400, 'Dieser Verbindungsversuch ist abgelaufen oder wurde bereits verwendet. Bitte im Hub neu starten.');
  if (query.error || !query.code) return zurueck('abgebrochen');
  const k = konfig(ctx.umgebung);
  if (!k) return fehler(503, 'Die Google-Anmeldung ist für diesen Hub noch nicht eingerichtet.');
  try {
    const t = await formular<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(holen, { code: query.code, client_id: k.clientId, client_secret: k.clientSecret, redirect_uri: rueckruf(ctx.umgebung), grant_type: 'authorization_code' });
    if (!t.scope?.split(' ').includes(SCOPE)) return zurueck('ohne-zugriff');
    if (!t.refresh_token) return zurueck('ohne-refresh');
    const kal = await google<{ id: string }>(holen, t.access_token, `${KALENDER}/primary`);
    const email = kal.daten?.id ?? '';
    await ctx.geheimnisse.schreiben(SECRET, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token, laeuft_ab: new Date(ctx.jetzt().getTime() + (t.expires_in ?? 3600) * 1000).toISOString() } satisfies Tokens));
    const { rows: alt } = await ctx.pool.query<{ email: string }>('SELECT email FROM google_kalender WHERE id = 1');
    // Another calendar: the old mapping points at events there.
    if (alt[0] && alt[0].email !== email) await ctx.pool.query('DELETE FROM google_kalender_termine');
    await ctx.pool.query(
      `INSERT INTO google_kalender (id, email, kalender_id, verbunden_von, verbunden_am, abgeglichen_am, fehler) VALUES (1, $1, 'primary', $2, now(), NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET email = $1, kalender_id = 'primary', verbunden_von = $2, verbunden_am = now(), abgeglichen_am = NULL, fehler = NULL`,
      [email, versuch.person || versuch.email],
    );
    await gleicheKalenderAb(ctx, {}, holen).catch(() => null);
    return zurueck('verbunden');
  } catch (e) {
    if (e instanceof KalenderProblem) return zurueck('fehler');
    throw e;
  }
}
