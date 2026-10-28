import { randomBytes } from 'node:crypto';
import { darfEinrichten, INSTANZ_EINSTELLUNG, instanzWerkzeuge, listeAus, teamName } from '../../../../src/data/instanz';
import type { Db } from '../../../../src/data/postgres/postgresStore';
import { personen, zustaendigWert } from '../../../../src/data/zustaendig';
import {
  driveOrdnerUrl,
  elternVon,
  HAUPTORDNER,
  istDriveId,
  istPasswortmanager,
  istSchluessel,
  istVorlage,
  PASSWORT_SCHRITTE,
  type AblageOrdner,
  type PasswortmanagerStand,
} from '../../../../src/creator/ablage/typen';
import {
  artLabel,
  istDatum,
  istEigeneQuelle,
  istFristArt,
  istRhythmus,
  istUhrzeit,
  serienDaten,
  type Frist,
  type FristSerie,
  type KalenderAbo,
  type Rhythmus,
} from '../../../../src/creator/kalender/typen';
import { baustein, fehler, istObjekt, neueId, ok, type CreatorKontext, type Modul, type OeffentlichKontext, type TaktKontext } from './modul';

/**
 * Modul Organisation (Bauplan Abschnitt 11, Punkte 2, 3, 6, 27, 29): Kalender mit Fristen (Tabelle fristen, Serien,
 * ICS-Abo je Person), feste Ablagestruktur in Google Drive (drive.file im Browser, hier nur die Ordner-Ids) und die
 * Einrichtungshilfe für den Team-Passwortmanager. Paths: /c/kalender/…, /c/ablage/…, public /oeffentlich/kalender/<token>.ics,
 * timed job kalender-serien.
 */

const text = (w: unknown) => (w === null || w === undefined ? '' : String(w));
const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : '');
const datum = (w: unknown) => (w instanceof Date ? w.toISOString().slice(0, 10) : text(w).slice(0, 10));
const feld = (w: unknown, max: number) => (typeof w === 'string' ? w.trim().slice(0, max) : '');

/** Today in Berlin as YYYY-MM-DD. */
export const heuteIn = (jetzt: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Series stand in fristen this far ahead (and in every calendar subscription). */
const HORIZONT_TAGE = 400;

// ---------------------------------------------------------------- Fristen

function zuFrist(z: Record<string, unknown>, abweichend: Set<string>): Frist {
  const quelle = text(z.quelle);
  const bezug = text(z.bezug_id);
  return {
    id: text(z.id),
    titel: text(z.titel),
    datum: datum(z.datum),
    uhrzeit: text(z.uhrzeit),
    art: text(z.art),
    quelle,
    bezug_id: bezug,
    link: text(z.link),
    zustaendig: text(z.zustaendig),
    notiz: text(z.notiz),
    erledigt: Boolean(z.erledigt),
    archiviert: Boolean(z.archiviert),
    serie_id: quelle === 'serie' ? bezug.split(':')[0] : '',
    abweichend: abweichend.has(text(z.id)),
    geaendert_am: zeit(z.geaendert_am),
    geaendert_von: text(z.geaendert_von),
  };
}

async function abweichungen(db: Db): Promise<Set<string>> {
  const { rows } = await db.query<{ frist_id: string }>('SELECT frist_id FROM fristen_abweichungen');
  return new Set(rows.map((r) => r.frist_id));
}

async function eineFrist(db: Db, id: string): Promise<Frist | null> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM fristen WHERE id = $1', [id]);
  return rows[0] ? zuFrist(rows[0], await abweichungen(db)) : null;
}

const nichtHier = (f: Frist) => fehler(409, `Diese Frist pflegt das Modul „${f.quelle}“; bitte dort bearbeiten.`);

type FristFelder = { titel: string; datum: string; uhrzeit: string | null; art: string; zustaendig: string | null; notiz: string | null; link: string | null };

/** Validated input of a deadline form. */
function fristEingabe(body: Record<string, unknown>): { fehler: string } | FristFelder {
  const titel = feld(body.titel, 200);
  if (!titel) return { fehler: 'Titel fehlt.' };
  if (!istDatum(body.datum)) return { fehler: 'Datum fehlt oder ist ungültig.' };
  const uhrzeit = feld(body.uhrzeit, 5);
  if (uhrzeit && !istUhrzeit(uhrzeit)) return { fehler: 'Uhrzeit bitte als HH:MM.' };
  const art = body.art === undefined || body.art === '' ? 'sonstiges' : body.art;
  if (!istFristArt(art)) return { fehler: 'Unbekannte Art.' };
  const link = feld(body.link, 500);
  if (link && (!/^(https?:\/\/|\/(?!\/))/.test(link) || /[\r\n]/.test(link))) return { fehler: 'Link bitte als Adresse (https://…) oder Hub-Pfad (/…).' };
  return {
    titel,
    datum: body.datum,
    uhrzeit: uhrzeit || null,
    art,
    zustaendig: zustaendigWert(personen(feld(body.zustaendig, 300))) || null,
    notiz: feld(body.notiz, 4000) || null,
    link: link || null,
  };
}

// ---------------------------------------------------------------- Serien

function zuSerie(z: Record<string, unknown>, naechster: string): FristSerie {
  return {
    id: text(z.id),
    titel: text(z.titel),
    art: text(z.art),
    rhythmus: text(z.rhythmus) as Rhythmus,
    start: datum(z.start),
    ende: z.ende ? datum(z.ende) : '',
    uhrzeit: text(z.uhrzeit),
    zustaendig: text(z.zustaendig),
    notiz: text(z.notiz),
    link: text(z.link),
    archiviert: Boolean(z.archiviert),
    naechster,
  };
}

/**
 * Writes the dates of a series from today up to the horizon into fristen. Open dates nobody changed on their own follow
 * the series; dates that no longer belong to it (rhythm or start changed, series archived) are archived. Past and done
 * dates stay as they are.
 */
async function generiereSerie(db: Db, serie: Record<string, unknown>, heute: string, von: string): Promise<void> {
  const id = text(serie.id);
  const bis = plusTage(heute, HORIZONT_TAGE);
  const daten = serie.archiviert ? [] : serienDaten({ start: datum(serie.start), rhythmus: text(serie.rhythmus) as Rhythmus, ende: serie.ende ? datum(serie.ende) : null }, heute, bis);
  for (const d of daten) {
    await db.query(
      `INSERT INTO fristen (id, titel, datum, uhrzeit, art, quelle, bezug_id, link, zustaendig, notiz, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, 'serie', $6, $7, $8, $9, $10)
       ON CONFLICT (quelle, bezug_id) WHERE bezug_id IS NOT NULL DO UPDATE
         SET titel = EXCLUDED.titel, datum = EXCLUDED.datum, uhrzeit = EXCLUDED.uhrzeit, art = EXCLUDED.art, link = EXCLUDED.link,
             zustaendig = EXCLUDED.zustaendig, notiz = EXCLUDED.notiz, archiviert = false
         WHERE NOT fristen.erledigt AND NOT EXISTS (SELECT 1 FROM fristen_abweichungen a WHERE a.frist_id = fristen.id)`,
      [neueId('FR'), serie.titel, d, serie.uhrzeit ?? null, serie.art, `${id}:${d}`, serie.link ?? null, serie.zustaendig ?? null, serie.notiz ?? null, von],
    );
  }
  await db.query(
    `UPDATE fristen SET archiviert = true, geaendert_am = now(), geaendert_von = $4
     WHERE quelle = 'serie' AND bezug_id LIKE $1 AND NOT erledigt AND NOT archiviert AND datum >= $2
       AND NOT (bezug_id = ANY($3::text[]))
       AND ($5 OR NOT EXISTS (SELECT 1 FROM fristen_abweichungen a WHERE a.frist_id = fristen.id))`,
    [`${id}:%`, heute, daten.map((d) => `${id}:${d}`), von, Boolean(serie.archiviert)],
  );
  await db.query('UPDATE fristen_serien SET generiert_bis = $2 WHERE id = $1', [id, bis]);
}

/** Moves every active series up to the horizon; only series that are behind cost anything. */
export async function verlaengereSerien(db: Db, heute: string, von = 'Kalender'): Promise<number> {
  const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM fristen_serien WHERE NOT archiviert AND (generiert_bis IS NULL OR generiert_bis < $1)`, [
    plusTage(heute, HORIZONT_TAGE),
  ]);
  for (const s of rows) await generiereSerie(db, s, heute, von);
  return rows.length;
}

async function serienListe(db: Db, heute: string): Promise<FristSerie[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM fristen_serien ORDER BY archiviert, titel');
  const { rows: naechste } = await db.query<{ serie: string; datum: unknown }>(
    `SELECT split_part(bezug_id, ':', 1) AS serie, min(datum) AS datum FROM fristen
     WHERE quelle = 'serie' AND NOT erledigt AND NOT archiviert AND datum >= $1 GROUP BY 1`,
    [heute],
  );
  const naechster = new Map(naechste.map((n) => [n.serie, datum(n.datum)]));
  return rows.map((s) => zuSerie(s, naechster.get(text(s.id)) ?? ''));
}

function serienEingabe(body: Record<string, unknown>): { fehler: string } | (FristFelder & { rhythmus: Rhythmus; ende: string | null }) {
  const basis = fristEingabe({ ...body, datum: body.start });
  if ('fehler' in basis) return basis.fehler.startsWith('Datum') ? { fehler: 'Erster Termin fehlt oder ist ungültig.' } : basis;
  if (!istRhythmus(body.rhythmus)) return { fehler: 'Rhythmus fehlt: monatlich, quartalsweise oder jährlich.' };
  const ende = feld(body.ende, 10);
  if (ende && (!istDatum(ende) || ende < basis.datum)) return { fehler: 'Das Ende liegt vor dem ersten Termin.' };
  return { ...basis, rhythmus: body.rhythmus, ende: ende || null };
}

// ---------------------------------------------------------------- Kalender-Abo (ICS)

const neuesToken = () => randomBytes(24).toString('base64url');

async function abo(db: Db, email: string): Promise<KalenderAbo | null> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM kalender_abos WHERE email = $1', [email]);
  const z = rows[0];
  return z ? { token: text(z.token), umfang: z.umfang === 'meine' ? 'meine' : 'alle', erstellt_am: zeit(z.erstellt_am), abgerufen_am: zeit(z.abgerufen_am) } : null;
}

/** Escapes a text value (RFC 5545, 3.3.11). */
const icsText = (w: string) => w.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** Folds lines longer than 75 octets (RFC 5545, 3.1), never inside a character. */
export function falte(zeile: string): string {
  if (Buffer.byteLength(zeile, 'utf8') <= 75) return zeile;
  const teile: string[] = [];
  let teil = '';
  let grenze = 75;
  for (const zeichen of zeile) {
    if (Buffer.byteLength(teil + zeichen, 'utf8') > grenze) {
      teile.push(teil);
      teil = '';
      // Continuation lines start with a space, which counts.
      grenze = 74;
    }
    teil += zeichen;
  }
  teile.push(teil);
  return teile.join('\r\n ');
}

const kompakt = (tag: string) => tag.replace(/-/g, '');
const stempel = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const ZEITZONE_BERLIN = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** The calendar file of a subscription: all-day deadlines as dates, timed ones as 30 minutes in Berlin time. */
export function kalenderDatei(fristen: Frist[], optionen: { name: string; hubUrl: string; host: string; jetzt: Date }): string {
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Velonify//Hub Kalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(optionen.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...ZEITZONE_BERLIN,
  ];
  const dtstamp = stempel(optionen.jetzt);
  for (const f of fristen) {
    const link = f.link && !f.link.startsWith('/') ? f.link : `${optionen.hubUrl}/#${f.link || `/fristen?frist=${encodeURIComponent(f.id)}`}`;
    const beschreibung = [artLabel(f.art), f.zustaendig ? `Zuständig: ${f.zustaendig}` : '', f.notiz, link].filter(Boolean).join('\n');
    zeilen.push('BEGIN:VEVENT', `UID:${f.id}@${optionen.host}`, `DTSTAMP:${dtstamp}`);
    if (f.uhrzeit) zeilen.push(`DTSTART;TZID=Europe/Berlin:${kompakt(f.datum)}T${f.uhrzeit.replace(':', '')}00`, 'DURATION:PT30M');
    else zeilen.push(`DTSTART;VALUE=DATE:${kompakt(f.datum)}`, `DTEND;VALUE=DATE:${kompakt(plusTage(f.datum, 1))}`, 'TRANSP:TRANSPARENT');
    zeilen.push(`SUMMARY:${icsText(`${f.erledigt ? 'Erledigt: ' : ''}${f.titel}`)}`, `DESCRIPTION:${icsText(beschreibung)}`, `CATEGORIES:${icsText(artLabel(f.art))}`, `URL:${link}`);
    zeilen.push('END:VEVENT');
  }
  zeilen.push('END:VCALENDAR');
  return `${zeilen.map(falte).join('\r\n')}\r\n`;
}

/** Scope is reloaded on every subscription request, so revoked roles apply immediately. */
async function aboSicht(ctx: OeffentlichKontext, email: string) {
  const { rows } = await ctx.pool.query<{ aktiv: boolean; rolle: string; werkzeuge: string | null; boards: string | null; name: string }>('SELECT aktiv, rolle, werkzeuge, boards, name FROM instanz_zugaenge WHERE email = $1', [email]);
  const { rows: einstellungen } = await ctx.pool.query<{ schluessel: string; wert: string }>("SELECT schluessel, wert FROM einstellungen WHERE schluessel LIKE 'instanz_%'");
  const e = Object.fromEntries(einstellungen.map(r => [r.schluessel, r.wert]));
  const z = rows[0];
  const tools = instanzWerkzeuge('creator', e);
  if (z) {
    if (!z.aktiv || (z.rolle === 'partner' && !listeAus(z.werkzeuge).includes('kalender'))) return null;
    return { rolle: z.rolle, person: teamName({ name: z.name, email }), werkzeuge: z.rolle === 'partner' ? tools.filter(t => listeAus(z.werkzeuge).includes(t)) : tools, boards: listeAus(z.boards) };
  }
  const admins = (ctx.umgebung.wert('ADMINS') ?? '').split(',').map(a => a.trim().toLowerCase());
  if (!admins.includes(email) || e[INSTANZ_EINSTELLUNG.velonifyZugang] === 'aus') return null;
  return { rolle: 'velonify', person: '', werkzeuge: tools, boards: [] as string[] };
}

type KalenderSicht = { rolle: string; werkzeuge: string[]; boards: string[] };

async function zugriff(ctx: CreatorKontext): Promise<KalenderSicht> {
  const { rows } = await ctx.pool.query<{ boards: string }>('SELECT boards FROM instanz_zugaenge WHERE email = $1', [ctx.email]);
  return { rolle: ctx.rolle, werkzeuge: ctx.sicht.werkzeuge, boards: listeAus(rows[0]?.boards) };
}

/** A calendar never broadens the source module's access, especially a partner's board grant. */
async function sichtbareFristen(db: Db, fristen: Frist[], sicht: KalenderSicht): Promise<Frist[]> {
  const { rows: aufgaben } = await db.query<{ id: string; board_id: string }>('SELECT id, board_id FROM aufgaben WHERE NOT archiviert');
  const erlaubt = new Set(aufgaben.filter(a => sicht.rolle !== 'partner' || sicht.boards.includes(a.board_id)).map(a => a.id));
  const werkzeug: Record<string, string> = { inhalt: 'content', kooperation: 'kooperationen', pipeline: 'kooperationen', bericht: 'analytics', einnahme: 'einnahmen' };
  return fristen.filter(f => {
    if (['aufgabe', 'karte'].includes(f.quelle)) return sicht.werkzeuge.includes('todo') && erlaubt.has(f.bezug_id);
    if (sicht.rolle === 'partner') return false;
    return istEigeneQuelle(f.quelle) || Boolean(werkzeug[f.quelle] && sicht.werkzeuge.includes(werkzeug[f.quelle]));
  });
}

/** Task due dates appear in the calendar but remain editable at their source. */
async function synchronisiereAufgaben(db: Db) {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM aufgaben');
  for (const a of rows) {
    const tag = text(a.faellig_am).slice(0, 10);
    if (!istDatum(tag) || a.archiviert) {
      await db.query("UPDATE fristen SET archiviert = true WHERE quelle = 'aufgabe' AND bezug_id = $1", [a.id]);
      continue;
    }
    await db.query(`INSERT INTO fristen (id, titel, datum, art, quelle, bezug_id, link, zustaendig, erledigt)
      VALUES ($1,$2,$3,'abgabe','aufgabe',$4,$5,$6,$7)
      ON CONFLICT (quelle, bezug_id) WHERE bezug_id IS NOT NULL DO UPDATE SET titel = EXCLUDED.titel, datum = EXCLUDED.datum,
      link = EXCLUDED.link, zustaendig = EXCLUDED.zustaendig, erledigt = EXCLUDED.erledigt, archiviert = false`,
      [neueId('FR'), a.titel || 'Aufgabe', tag, a.id, `/todo/${encodeURIComponent(text(a.board_id))}?karte=${encodeURIComponent(text(a.id))}`, a.zustaendig || null, Boolean(a.erledigt_am)]);
  }
}

async function oeffentlich(methode: string, pfad: string, _body: unknown, ctx: OeffentlichKontext) {
  const treffer = /^\/oeffentlich\/kalender\/([A-Za-z0-9_-]{20,64})\.ics$/.exec(pfad);
  if (!treffer || methode !== 'GET') return null;
  const nichtDa = fehler(404, 'Dieses Kalender-Abo gibt es nicht (mehr).');
  if (!ctx.bausteine.includes('kalender')) return nichtDa;
  const db = ctx.pool;
  const { rows } = await db.query<{ email: string; umfang: string; person: string }>('SELECT email, umfang, person FROM kalender_abos WHERE token = $1', [treffer[1]]);
  const a = rows[0];
  const sicht = a ? await aboSicht(ctx, a.email) : null;
  if (!a || !sicht) return nichtDa;
  await synchronisiereAufgaben(db);
  const heute = heuteIn(ctx.jetzt());
  await verlaengereSerien(db, heute, 'Kalender-Abo');
  const meine = a.umfang === 'meine';
  const { rows: zeilen } = await db.query<Record<string, unknown>>(`SELECT * FROM fristen WHERE NOT archiviert AND datum >= $1 ORDER BY datum, uhrzeit NULLS FIRST, titel`, [
    plusTage(heute, -90),
  ]);
  const ohne = new Set<string>();
  const fristen = (await sichtbareFristen(db, zeilen.map((z) => zuFrist(z, ohne)), sicht)).filter((f) => !meine || personen(f.zustaendig).includes(sicht.person || a.person));
  const { rows: e } = await db.query<{ wert: string | null }>('SELECT wert FROM einstellungen WHERE schluessel = $1', [INSTANZ_EINSTELLUNG.name]);
  const instanz = e[0]?.wert?.trim();
  const hubUrl = ctx.umgebung.hubUrl.replace(/\/$/, '');
  let host = 'hub.velonify.de';
  try {
    host = new URL(hubUrl).host || host;
  } catch {
    // keep the fallback
  }
  await db.query('UPDATE kalender_abos SET abgerufen_am = now() WHERE token = $1', [treffer[1]]);
  const name = `${instanz ? `${instanz} HUB` : 'HUB'} · ${meine ? `Fristen ${a.person}` : 'Fristen'}`;
  return ok({ inhalt: kalenderDatei(fristen, { name, hubUrl, host, jetzt: ctx.jetzt() }), typ: 'text/calendar; charset=utf-8' });
}

// ---------------------------------------------------------------- Passwortmanager

async function passwortmanagerStand(db: Db): Promise<PasswortmanagerStand> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM passwortmanager WHERE id = 1');
  const z = rows[0];
  const haken = (istObjekt(z?.haken) ? z.haken : {}) as PasswortmanagerStand['haken'];
  return { wahl: istPasswortmanager(z?.wahl) ? z.wahl : null, haken, geaendert_am: zeit(z?.geaendert_am), geaendert_von: text(z?.geaendert_von) };
}

/**
 * The password manager card of the Einrichtung. Served below both organisation prefixes (/c/kalender and /c/ablage),
 * so it works as long as one of the two start blocks is on.
 */
async function passwortmanager(methode: string, body: unknown, ctx: CreatorKontext) {
  const db = ctx.pool;
  if (ctx.rolle === 'partner') return fehler(403, 'Die Einrichtungshilfe ist für das interne Team.');
  if (methode === 'GET') return ok({ stand: await passwortmanagerStand(db) });
  if (methode !== 'POST') return null;
  if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Einrichtung des Passwortmanagers pflegen Admins.');
  if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
  const stand = await passwortmanagerStand(db);
  if ('wahl' in body) {
    if (body.wahl !== null && !istPasswortmanager(body.wahl)) return fehler(400, 'Unbekannter Passwortmanager.');
    stand.wahl = body.wahl as PasswortmanagerStand['wahl'];
  }
  if ('schritt' in body) {
    if (!PASSWORT_SCHRITTE.some((s) => s.id === body.schritt) || typeof body.erledigt !== 'boolean') return fehler(400, 'Unbekannter Schritt.');
    const schritt = body.schritt as string;
    if (body.erledigt) stand.haken[schritt] = { von: ctx.person, am: ctx.jetzt().toISOString() };
    else delete stand.haken[schritt];
  }
  await db.query(
    `INSERT INTO passwortmanager (id, wahl, haken, geaendert_am, geaendert_von) VALUES (1, $1, $2::jsonb, now(), $3)
     ON CONFLICT (id) DO UPDATE SET wahl = $1, haken = $2::jsonb, geaendert_am = now(), geaendert_von = $3`,
    [stand.wahl, JSON.stringify(stand.haken), ctx.person],
  );
  return ok({ stand: await passwortmanagerStand(db) });
}

// ---------------------------------------------------------------- Routen Kalender

async function merkeAbweichung(db: Db, frist: Frist, von: string) {
  await db.query(
    `INSERT INTO fristen_abweichungen (frist_id, serie_id, geaendert_von) VALUES ($1, $2, $3) ON CONFLICT (frist_id) DO UPDATE SET geaendert_am = now(), geaendert_von = $3`,
    [frist.id, frist.serie_id, von],
  );
}

async function kalenderRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext) {
  if (pfad === '/c/kalender/passwortmanager') return baustein(ctx, 'kalender') ?? passwortmanager(methode, body, ctx);
  const zu = baustein(ctx, 'kalender');
  if (zu) return zu;
  const db = ctx.pool;
  const heute = heuteIn(ctx.jetzt());
  const b = istObjekt(body) ? body : {};
  const sicht = await zugriff(ctx);
  if (ctx.rolle === 'partner' && !['/c/kalender/liste', '/c/kalender/frist', '/c/kalender/abo', '/c/kalender/abo/beenden'].includes(pfad)) return fehler(403, 'Partner sehen die Fristen ihrer freigegebenen Boards. Bearbeitet sie bitte dort.');

  if (pfad === '/c/kalender/liste' && methode === 'POST') {
    const von = istDatum(b.von) ? b.von : plusTage(heute, -40);
    const bis = istDatum(b.bis) ? b.bis : plusTage(heute, 60);
    if (bis < von) return fehler(400, 'Der Zeitraum endet vor seinem Anfang.');
    await verlaengereSerien(db, heute, ctx.person);
    await synchronisiereAufgaben(db);
    const archiv = b.archiv === true;
    // Overdue open deadlines always come along, so every view can point at them.
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM fristen WHERE archiviert = $3 AND ((datum BETWEEN $1 AND $2) OR (NOT $3 AND NOT erledigt AND datum < $4))
       ORDER BY datum, uhrzeit NULLS FIRST, titel LIMIT 3000`,
      [von, bis, archiv, heute],
    );
    const abw = await abweichungen(db);
    return ok({ fristen: await sichtbareFristen(db, rows.map((z) => zuFrist(z, abw)), sicht), heute });
  }

  if (pfad === '/c/kalender/frist' && methode === 'POST') {
    if (typeof b.id !== 'string') return fehler(400, 'Frist fehlt.');
    const f = await eineFrist(db, b.id);
    return f && (await sichtbareFristen(db, [f], sicht)).length ? ok({ frist: f }) : fehler(404, 'Frist nicht gefunden.');
  }

  if (pfad === '/c/kalender/speichern' && methode === 'POST') {
    const e = fristEingabe(b);
    if ('fehler' in e) return fehler(400, e.fehler);
    if (typeof b.id === 'string' && b.id) {
      const alt = await eineFrist(db, b.id);
      if (!alt) return fehler(404, 'Frist nicht gefunden.');
      if (!istEigeneQuelle(alt.quelle)) return nichtHier(alt);
      await db.query(`UPDATE fristen SET titel = $2, datum = $3, uhrzeit = $4, art = $5, zustaendig = $6, notiz = $7, link = $8, geaendert_am = now(), geaendert_von = $9 WHERE id = $1`, [
        alt.id,
        e.titel,
        e.datum,
        e.uhrzeit,
        e.art,
        e.zustaendig,
        e.notiz,
        e.link,
        ctx.person,
      ]);
      if (alt.quelle === 'serie') await merkeAbweichung(db, alt, ctx.person);
      return ok({ frist: await eineFrist(db, alt.id) });
    }
    const id = neueId('FR');
    await db.query(`INSERT INTO fristen (id, titel, datum, uhrzeit, art, quelle, link, zustaendig, notiz, erstellt_von) VALUES ($1, $2, $3, $4, $5, 'manuell', $6, $7, $8, $9)`, [
      id,
      e.titel,
      e.datum,
      e.uhrzeit,
      e.art,
      e.link,
      e.zustaendig,
      e.notiz,
      ctx.person,
    ]);
    return ok({ frist: await eineFrist(db, id) });
  }

  if ((pfad === '/c/kalender/erledigt' || pfad === '/c/kalender/archivieren') && methode === 'POST') {
    const erledigt = pfad.endsWith('erledigt');
    const wert = erledigt ? b.erledigt : b.archiviert;
    if (typeof b.id !== 'string' || typeof wert !== 'boolean') return fehler(400, 'Frist oder Wert fehlt.');
    const alt = await eineFrist(db, b.id);
    if (!alt) return fehler(404, 'Frist nicht gefunden.');
    if (!istEigeneQuelle(alt.quelle)) return nichtHier(alt);
    await db.query(`UPDATE fristen SET ${erledigt ? 'erledigt' : 'archiviert'} = $2, geaendert_am = now(), geaendert_von = $3 WHERE id = $1`, [alt.id, wert, ctx.person]);
    // A skipped date of a series stays skipped when the series changes.
    if (!erledigt && alt.quelle === 'serie') await merkeAbweichung(db, alt, ctx.person);
    return ok({ frist: await eineFrist(db, alt.id) });
  }

  if (pfad === '/c/kalender/serien' && methode === 'GET') {
    await verlaengereSerien(db, heute, ctx.person);
    return ok({ serien: await serienListe(db, heute) });
  }

  if (pfad === '/c/kalender/serie' && methode === 'POST') {
    const e = serienEingabe(b);
    if ('fehler' in e) return fehler(400, e.fehler);
    let id = typeof b.id === 'string' ? b.id : '';
    if (id) {
      const { rows: geaendert } = await db.query(
        `UPDATE fristen_serien SET titel = $2, art = $3, rhythmus = $4, start = $5, ende = $6, uhrzeit = $7, zustaendig = $8, notiz = $9, link = $10,
           generiert_bis = NULL, geaendert_am = now(), geaendert_von = $11 WHERE id = $1 RETURNING id`,
        [id, e.titel, e.art, e.rhythmus, e.datum, e.ende, e.uhrzeit, e.zustaendig, e.notiz, e.link, ctx.person],
      );
      if (!geaendert.length) return fehler(404, 'Serie nicht gefunden.');
    } else {
      id = neueId('SE');
      await db.query(`INSERT INTO fristen_serien (id, titel, art, rhythmus, start, ende, uhrzeit, zustaendig, notiz, link, erstellt_von) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
        id,
        e.titel,
        e.art,
        e.rhythmus,
        e.datum,
        e.ende,
        e.uhrzeit,
        e.zustaendig,
        e.notiz,
        e.link,
        ctx.person,
      ]);
    }
    const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM fristen_serien WHERE id = $1', [id]);
    await generiereSerie(db, rows[0], heute, ctx.person);
    return ok({ serie: (await serienListe(db, heute)).find((s) => s.id === id) });
  }

  if (pfad === '/c/kalender/serie/archivieren' && methode === 'POST') {
    if (typeof b.id !== 'string' || typeof b.archiviert !== 'boolean') return fehler(400, 'Serie oder Wert fehlt.');
    const { rows } = await db.query<Record<string, unknown>>('UPDATE fristen_serien SET archiviert = $2, generiert_bis = NULL, geaendert_am = now(), geaendert_von = $3 WHERE id = $1 RETURNING *', [
      b.id,
      b.archiviert,
      ctx.person,
    ]);
    if (!rows[0]) return fehler(404, 'Serie nicht gefunden.');
    await generiereSerie(db, rows[0], heute, ctx.person);
    return ok({ serie: (await serienListe(db, heute)).find((s) => s.id === b.id) });
  }

  if (pfad === '/c/kalender/abo') {
    if (methode === 'GET') {
      // Keeps the name for "nur meine" current.
      await db.query('UPDATE kalender_abos SET person = $2 WHERE email = $1', [ctx.email, ctx.person]);
      return ok({ abo: await abo(db, ctx.email), api_url: ctx.umgebung.apiUrl });
    }
    if (methode !== 'POST') return null;
    if (b.umfang !== undefined && b.umfang !== 'alle' && b.umfang !== 'meine') return fehler(400, 'Umfang ist „alle“ oder „meine“.');
    const umfang = b.umfang as 'alle' | 'meine' | undefined;
    const bisher = await abo(db, ctx.email);
    if (!bisher || b.neu === true) {
      // A new link makes the old one invalid at once.
      await db.query(
        `INSERT INTO kalender_abos (email, token, umfang, person) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET token = $2, umfang = $3, person = $4, erstellt_am = now(), abgerufen_am = NULL`,
        [ctx.email, neuesToken(), umfang ?? bisher?.umfang ?? 'alle', ctx.person],
      );
    } else if (umfang) {
      await db.query('UPDATE kalender_abos SET umfang = $2, person = $3 WHERE email = $1', [ctx.email, umfang, ctx.person]);
    }
    return ok({ abo: await abo(db, ctx.email), api_url: ctx.umgebung.apiUrl });
  }

  if (pfad === '/c/kalender/abo/beenden' && methode === 'POST') {
    await db.query('DELETE FROM kalender_abos WHERE email = $1', [ctx.email]);
    return ok({ abo: null, api_url: ctx.umgebung.apiUrl });
  }
  return null;
}

// ---------------------------------------------------------------- Routen Ablage

function zuOrdner(z: Record<string, unknown>): AblageOrdner {
  const id = text(z.drive_id);
  return {
    schluessel: text(z.schluessel),
    name: text(z.name),
    drive_id: id,
    bereit: z.bereit !== false,
    url: driveOrdnerUrl(id),
    art: z.art === 'verknuepft' ? 'verknuepft' : 'angelegt',
    erstellt_am: zeit(z.erstellt_am),
    erstellt_von: text(z.erstellt_von),
  };
}

async function ablageListe(db: Db): Promise<AblageOrdner[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM ablage_ordner ORDER BY schluessel');
  return rows.map(zuOrdner);
}

async function ablageRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext) {
  if (pfad === '/c/ablage/passwortmanager') return baustein(ctx, 'ablage') ?? passwortmanager(methode, body, ctx);
  const zu = baustein(ctx, 'ablage');
  if (zu) return zu;
  const db = ctx.pool;
  const b = istObjekt(body) ? body : {};

  if (pfad === '/c/ablage' && methode === 'GET') {
    const ordner = await ablageListe(db);
    return ok({ ordner: ordner.filter(o => ctx.rolle === 'partner' ? istVorlage(o.schluessel) && /^(content|branding)(\/|$)/.test(o.schluessel) : ctx.sicht.betraege || !/^(buchhaltung|vertraege|gesellschaft)(\/|$)/.test(o.schluessel)) });
  }
  if (ctx.rolle === 'partner' && methode !== 'GET') return fehler(403, 'Die Ablage verwaltet das interne Team.');

  if (['/c/ablage/ordner', '/c/ablage/reservieren'].includes(pfad) && methode === 'POST') {
    if (!istSchluessel(b.schluessel)) return fehler(400, 'Unbekannter Platz in der Ablage.');
    if (!istDriveId(b.drive_id)) return fehler(400, 'Drive-Ordner fehlt.');
    const name = feld(b.name, 200);
    if (!name) return fehler(400, 'Name des Ordners fehlt.');
    const art = b.art === 'verknuepft' ? 'verknuepft' : 'angelegt';
    const schluessel = b.schluessel;
    if (!ctx.sicht.betraege && /^(buchhaltung|vertraege|gesellschaft)(\/|$)/.test(schluessel)) return fehler(403, 'Dieser Ablagebereich ist für dich nicht freigegeben.');
    const vorlage = istVorlage(schluessel);
    // The structure itself is set up by admins; subfolders (cooperation, video, year) by everyone with the tool.
    if (vorlage && !darfEinrichten(ctx.rolle)) return fehler(403, 'Die Ablagestruktur richten Admins in der Einrichtung ein.');
    if (vorlage && !pfad.endsWith('/reservieren')) {
      const { rows: bisher } = await db.query<{ drive_id: string }>('SELECT drive_id FROM ablage_ordner WHERE schluessel = $1', [schluessel]);
      if (bisher[0] && bisher[0].drive_id !== b.drive_id) {
        const { rows: kinder } = await db.query("SELECT 1 FROM ablage_ordner WHERE schluessel <> $1 AND ($1 = 'haupt' OR schluessel LIKE $1 || '/%') LIMIT 1", [schluessel]);
        if (kinder.length) return fehler(409, 'Zu diesem Ordner bestehen Unterordner-Verknüpfungen. Bitte diese zuerst lösen, bevor du den Hauptordner wechselst.');
      }
    }
    if (schluessel !== HAUPTORDNER) {
      const { rows } = await db.query('SELECT 1 FROM ablage_ordner WHERE schluessel = $1', [elternVon(schluessel)]);
      if (!rows.length) return fehler(409, 'Der übergeordnete Ordner ist in der Ablage noch nicht eingerichtet.');
    }
    if (pfad.endsWith('/reservieren')) {
      const { rows } = await db.query<Record<string, unknown>>(`INSERT INTO ablage_ordner (schluessel, name, drive_id, art, erstellt_von, bereit) VALUES ($1,$2,$3,'angelegt',$4,false) ON CONFLICT (schluessel) DO UPDATE SET schluessel = EXCLUDED.schluessel RETURNING *`, [schluessel, name, b.drive_id, ctx.person]);
      return ok({ ordner: zuOrdner(rows[0]) });
    }
    if (!vorlage) {
      // Subfolders are made once: whoever comes second gets the existing one.
      const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM ablage_ordner WHERE schluessel = $1', [schluessel]);
      if (rows[0]) {
        if (rows[0].drive_id === b.drive_id && rows[0].bereit === false) { await db.query('UPDATE ablage_ordner SET bereit = true WHERE schluessel = $1', [schluessel]); rows[0].bereit = true; }
        return ok({ ordner: zuOrdner(rows[0]), neu: false });
      }
    }
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO ablage_ordner (schluessel, name, drive_id, art, erstellt_von) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (schluessel) DO UPDATE SET name = CASE WHEN $6 THEN $2 ELSE ablage_ordner.name END, drive_id = CASE WHEN $6 THEN $3 ELSE ablage_ordner.drive_id END, art = CASE WHEN $6 THEN $4 ELSE ablage_ordner.art END, bereit = true RETURNING *`,
      [schluessel, name, b.drive_id, art, ctx.person, vorlage],
    );
    return ok({ ordner: zuOrdner(rows[0]), neu: true });
  }

  if (pfad === '/c/ablage/loesen' && methode === 'POST') {
    if (!istSchluessel(b.schluessel)) return fehler(400, 'Unbekannter Platz in der Ablage.');
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Ablagestruktur richten Admins in der Einrichtung ein.');
    // Only the link in the hub goes; the folder stays in Drive.
    const { rows } = await db.query('DELETE FROM ablage_ordner WHERE schluessel = $1 RETURNING schluessel', [b.schluessel]);
    return rows.length ? ok({ ordner: await ablageListe(db) }) : fehler(404, 'Dieser Platz ist nicht verknüpft.');
  }
  return null;
}

async function serienTakt(ctx: TaktKontext) {
  if (!ctx.bausteine.includes('kalender')) return { serien: 0 };
  return { serien: await verlaengereSerien(ctx.pool, heuteIn(ctx.jetzt()), 'Takt') };
}

export const kalenderModul: Modul = { praefix: 'kalender', routen: kalenderRouten, oeffentlich, takte: { 'kalender-serien': serienTakt } };
export const ablageModul: Modul = { praefix: 'ablage', routen: ablageRouten };
