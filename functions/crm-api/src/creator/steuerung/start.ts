import { darfEinrichten } from '../../../../../src/data/instanz';
import { heuteBerlin, plusTage } from '../../../../../src/data/plattform';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import {
  RECHT_FELDER,
  rechtSchluessel,
  type RechtDaten,
  type RechtFeld,
  type StartBericht,
  type StartDaten,
  type StartFreigabe,
  type StartFrist,
  type StartInhalt,
  type StartKachel,
  type StartKanal,
  type StartKooperation,
  type StartNeuigkeit,
} from '../../../../../src/creator/start/typen';
import type { Antwort } from '../../routen';
import { fehler, istObjekt, ok, type CreatorKontext, type OeffentlichKontext } from '../modul';

const text = (w: unknown) => (w === null || w === undefined ? '' : w instanceof Date ? w.toISOString() : String(w));
const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : '');
const zahlOderNull = (w: unknown) => (w === null || w === undefined ? null : Number(w));

/** Monday to Sunday of the week of `heute` (JJJJ-MM-TT). */
export function wocheVon(heute: string): { von: string; bis: string } {
  const wochentag = (new Date(`${heute}T12:00:00Z`).getUTCDay() + 6) % 7;
  const von = plusTage(heute, -wochentag);
  return { von, bis: plusTage(von, 6) };
}

/** Home routes (tool "home", always on): GET /c/start, the tour state, "Neu im Hub" seen, and the legal details. */
export async function startRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null> {
  const email = ctx.email.trim().toLowerCase();
  switch (pfad) {
    case '/c/start':
      if (methode !== 'GET') return fehler(405, 'Nur GET.');
      return ok(await startDaten(ctx));
    case '/c/start/rundgang': {
      if (methode !== 'POST') return fehler(405, 'Nur POST.');
      if (!istObjekt(body) || (body.gesehen !== true && body.neu_starten !== true)) return fehler(400, 'gesehen oder neu_starten angeben.');
      // Seen: the tour does not start again; restart (from the settings): it starts on the next visit of Home.
      await ctx.pool.query(
        `INSERT INTO instanz_rundgang (email, rundgang_am) VALUES ($1, $2::timestamptz)
         ON CONFLICT (email) DO UPDATE SET rundgang_am = EXCLUDED.rundgang_am`,
        [email, body.gesehen === true ? ctx.jetzt().toISOString() : null],
      );
      return ok({ rundgang: body.gesehen !== true });
    }
    case '/c/start/neuigkeiten/gesehen':
      if (methode !== 'POST') return fehler(405, 'Nur POST.');
      await ctx.pool.query(
        `INSERT INTO instanz_rundgang (email, neuigkeiten_gesehen_am) VALUES ($1, $2::timestamptz)
         ON CONFLICT (email) DO UPDATE SET neuigkeiten_gesehen_am = EXCLUDED.neuigkeiten_gesehen_am`,
        [email, ctx.jetzt().toISOString()],
      );
      return ok();
    case '/c/start/recht': {
      if (methode === 'GET') return ok(await rechtDaten(ctx.pool, ctx.umgebung.hubUrl));
      if (methode !== 'POST') return fehler(405, 'Nur GET und POST.');
      if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Angaben für Impressum und Datenschutz pflegen Admins.');
      if (!istObjekt(body) || !istObjekt(body.angaben)) return fehler(400, 'Angaben fehlen.');
      const werte: [string, string | null][] = [];
      for (const [feld, wert] of Object.entries(body.angaben)) {
        const def = RECHT_FELDER.find((f) => f.id === feld);
        if (!def) return fehler(400, `Unbekanntes Feld ${feld}.`);
        if (typeof wert !== 'string') return fehler(400, `${def.label}: bitte Text eintragen.`);
        const sauber = wert.trim();
        if (sauber.length > def.max) return fehler(400, `${def.label}: höchstens ${def.max} Zeichen.`);
        if (feld === 'email' && sauber && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(sauber)) return fehler(400, 'Die E-Mail-Adresse sieht nicht richtig aus.');
        werte.push([rechtSchluessel(feld as RechtFeld), sauber || null]);
      }
      if (werte.length === 0) return fehler(400, 'Nichts zu speichern.');
      werte.push([rechtSchluessel('stand'), heuteBerlin(ctx.jetzt())]);
      await ctx.pool.transaktion(async (db) => {
        for (const [schluessel, wert] of werte) {
          await db.query('INSERT INTO einstellungen (schluessel, wert) VALUES ($1, $2) ON CONFLICT (schluessel) DO UPDATE SET wert = EXCLUDED.wert', [schluessel, wert]);
        }
      });
      return ok(await rechtDaten(ctx.pool, ctx.umgebung.hubUrl));
    }
  }
  return null;
}

/** Public: GET /oeffentlich/start/recht for the legal pages (needed for the app reviews of Google, Meta and TikTok). */
export async function startOeffentlich(methode: string, pfad: string, _body: unknown, ctx: OeffentlichKontext): Promise<Antwort | null> {
  if (pfad !== '/oeffentlich/start/recht') return null;
  if (methode !== 'GET') return fehler(405, 'Nur GET.');
  return ok(await rechtDaten(ctx.pool, ctx.umgebung.hubUrl));
}

async function rechtDaten(db: Db, hubUrl: string): Promise<RechtDaten> {
  const { rows } = await db.query<{ schluessel: string; wert: string | null }>(`SELECT schluessel, wert FROM einstellungen WHERE schluessel = 'instanz_name' OR schluessel LIKE 'instanz\\_recht\\_%'`);
  const wert = (schluessel: string) => rows.find((r) => r.schluessel === schluessel)?.wert ?? '';
  return {
    name: wert('instanz_name'),
    hub_url: hubUrl,
    angaben: Object.fromEntries(RECHT_FELDER.map((f) => [f.id, wert(rechtSchluessel(f.id))])) as Record<RechtFeld, string>,
    stand: wert(rechtSchluessel('stand')),
  };
}

/** Everything on the Home of one person; tiles only for the tools and building blocks this person has. */
async function startDaten(ctx: CreatorKontext): Promise<StartDaten> {
  const { pool: db, sicht } = ctx;
  const heute = heuteBerlin(ctx.jetzt());
  const woche = wocheVon(heute);
  const werkzeug = (w: string) => sicht.werkzeuge.includes(w);
  const baustein = (b: (typeof sicht.bausteine)[number]) => sicht.bausteine.includes(b);
  const koopSpalten = werkzeug('kooperationen') && baustein('kooperationen') ? await spalten(db, 'kooperationen') : null;

  const kacheln: StartKachel[] = [];
  if (werkzeug('content') && baustein('contentplan')) kacheln.push('uploads');
  if (werkzeug('kalender') && baustein('kalender')) kacheln.push('fristen');
  // The table comes with the module Kooperationen (migration 019); until it exists the tile stays away.
  if (koopSpalten?.has('faellig_am')) kacheln.push('kooperationen');
  if (baustein('freigaben')) kacheln.push('freigaben');
  if (werkzeug('analytics') && baustein('kanaele')) kacheln.push('zahlen');
  if (werkzeug('analytics') && baustein('berichte')) kacheln.push('bericht');
  const an = (k: StartKachel) => kacheln.includes(k);

  const [uploads, fristen, kooperationen, freigaben, zahlen, bericht, neuigkeiten, stand] = await Promise.all([
    an('uploads') ? ladeUploads(db, woche) : [],
    an('fristen') ? ladeFristen(db, woche, heute, { ohneInhalte: an('uploads'), ohneKooperationen: an('kooperationen') }) : [],
    an('kooperationen') && koopSpalten ? ladeKooperationen(db, koopSpalten, woche, heute, sicht.betraege) : [],
    an('freigaben') ? ladeFreigaben(db, ctx.person) : [],
    an('zahlen') ? ladeZahlen(db) : [],
    an('bericht') ? ladeBericht(db) : null,
    ladeNeuigkeiten(db, sicht.werkzeuge, ctx.email.trim().toLowerCase()),
    db.query<{ rundgang_am: unknown }>('SELECT rundgang_am FROM instanz_rundgang WHERE email = $1', [ctx.email.trim().toLowerCase()]),
  ]);
  return { heute, woche, person: ctx.person, kacheln, uploads, fristen, kooperationen, freigaben, zahlen, bericht, neuigkeiten, rundgang: !stand.rows[0]?.rundgang_am };
}

async function spalten(db: Db, tabelle: string): Promise<Set<string> | null> {
  const { rows } = await db.query<{ da: string | null }>('SELECT to_regclass($1)::text AS da', [tabelle]);
  if (!rows[0]?.da) return null;
  const { rows: namen } = await db.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [tabelle]);
  return new Set(namen.map((n) => n.column_name));
}

async function ladeUploads(db: Db, woche: { von: string; bis: string }): Promise<StartInhalt[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, titel, kanal, format, status, to_char(geplant_am, 'YYYY-MM-DD') AS geplant_am, zustaendig
     FROM inhalte WHERE NOT archiviert AND geplant_am BETWEEN $1::date AND $2::date ORDER BY geplant_am, titel LIMIT 50`,
    [woche.von, woche.bis],
  );
  return rows.map((r) => ({ id: text(r.id), titel: text(r.titel), kanal: text(r.kanal), format: text(r.format), status: text(r.status), geplant_am: text(r.geplant_am), zustaendig: text(r.zustaendig) }));
}

/** This week's open deadlines and older ones still open. Uploads and cooperations have their own tiles, so their deadlines stay out there. */
async function ladeFristen(db: Db, woche: { von: string; bis: string }, heute: string, ohne: { ohneInhalte: boolean; ohneKooperationen: boolean }): Promise<StartFrist[]> {
  const quellen = [...(ohne.ohneInhalte ? ['inhalt'] : []), ...(ohne.ohneKooperationen ? ['kooperation'] : [])];
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, titel, to_char(datum, 'YYYY-MM-DD') AS datum, uhrzeit, art, link, zustaendig
     FROM fristen
     WHERE NOT archiviert AND NOT erledigt AND datum <= $2::date AND (datum >= $1::date OR datum < $3::date) AND NOT (quelle = ANY($4::text[]))
     ORDER BY datum, uhrzeit NULLS FIRST, titel LIMIT 50`,
    [woche.von, woche.bis, heute, quellen],
  );
  return rows.map((r) => ({ id: text(r.id), titel: text(r.titel), datum: text(r.datum), uhrzeit: text(r.uhrzeit), art: text(r.art), link: text(r.link), zustaendig: text(r.zustaendig) }));
}

/** Words in the payment column that mean "done", so paid cooperations leave the tile. */
const BEZAHLT = ['bezahlt', 'erhalten', 'eingegangen', 'erledigt'];

/**
 * Cooperations due up to the end of this week (overdue ones of the last 60 days included). The table belongs to the module
 * Kooperationen, so only the columns it really has are read.
 */
async function ladeKooperationen(db: Db, sp: Set<string>, woche: { bis: string }, heute: string, betraege: boolean): Promise<StartKooperation[]> {
  const partner = ['partner', 'titel', 'name'].find((s) => sp.has(s));
  const feld = (s: string, als = s) => (sp.has(s) ? `${s}::text AS ${als}` : `NULL::text AS ${als}`);
  const bedingungen = ['faellig_am IS NOT NULL', 'faellig_am <= $1::date', 'faellig_am >= $2::date'];
  if (sp.has('archiviert')) bedingungen.push('NOT archiviert');
  if (sp.has('erledigt')) bedingungen.push('NOT erledigt');
  if (sp.has('zahlung')) bedingungen.push(`(zahlung IS NULL OR lower(zahlung) <> ALL($3::text[]))`);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text AS id, ${partner ? `${partner}::text` : 'NULL::text'} AS partner, to_char(faellig_am, 'YYYY-MM-DD') AS faellig_am,
       ${feld('stand')}, ${feld('zahlung')}, ${betraege && sp.has('betrag') ? 'betrag::numeric AS betrag' : 'NULL::numeric AS betrag'}, ${betraege ? feld('waehrung') : 'NULL::text AS waehrung'}
     FROM kooperationen WHERE ${bedingungen.join(' AND ')} ORDER BY faellig_am LIMIT 30`,
    sp.has('zahlung') ? [woche.bis, plusTage(heute, -60), BEZAHLT] : [woche.bis, plusTage(heute, -60)],
  );
  return rows.map((r) => ({
    id: text(r.id),
    partner: text(r.partner),
    faellig_am: text(r.faellig_am),
    stand: text(r.stand),
    zahlung: text(r.zahlung),
    betrag: betraege ? zahlOderNull(r.betrag) : null,
    waehrung: betraege ? text(r.waehrung) : '',
  }));
}

async function ladeFreigaben(db: Db, person: string): Promise<StartFreigabe[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, titel, link, objekt_typ, angefragt_von, angefragt_am FROM freigaben WHERE status = 'offen' AND freigeber = $1 ORDER BY angefragt_am LIMIT 30`,
    [person],
  );
  return rows.map((r) => ({ id: text(r.id), titel: text(r.titel), link: text(r.link), objekt_typ: text(r.objekt_typ), angefragt_von: text(r.angefragt_von), angefragt_am: zeit(r.angefragt_am) }));
}

/** Latest values per channel, the follower change against a week earlier and the views of the last seven days of values. */
async function ladeZahlen(db: Db): Promise<StartKanal[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT k.id, k.plattform, k.handle, k.status, k.beispiel AS konto_beispiel,
       to_char(w.datum, 'YYYY-MM-DD') AS datum, w.follower, w.beispiel AS werte_beispiel, v.follower AS follower_vorher,
       (SELECT sum(x.aufrufe) FROM kanal_werte x WHERE x.konto_id = k.id AND x.datum > w.datum - 7 AND x.datum <= w.datum) AS aufrufe_7
     FROM kanal_konten k
     LEFT JOIN LATERAL (SELECT * FROM kanal_werte WHERE konto_id = k.id ORDER BY datum DESC LIMIT 1) w ON true
     LEFT JOIN LATERAL (SELECT follower FROM kanal_werte WHERE konto_id = k.id AND datum <= w.datum - 7 ORDER BY datum DESC LIMIT 1) v ON true
     WHERE k.status <> 'getrennt'
     ORDER BY k.plattform, k.id`,
  );
  return rows.map((r) => {
    const follower = zahlOderNull(r.follower);
    const vorher = zahlOderNull(r.follower_vorher);
    return {
      id: text(r.id),
      plattform: text(r.plattform),
      handle: text(r.handle),
      status: text(r.status),
      datum: text(r.datum),
      follower,
      follower_plus: follower !== null && vorher !== null ? follower - vorher : null,
      aufrufe_7: zahlOderNull(r.aufrufe_7),
      beispiel: r.konto_beispiel === true || r.werte_beispiel === true || r.status === 'beispiel',
    };
  });
}

async function ladeBericht(db: Db): Promise<StartBericht | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, typ, to_char(von, 'YYYY-MM-DD') AS von, to_char(bis, 'YYYY-MM-DD') AS bis, status, beispiel FROM berichte ORDER BY bis DESC, erstellt_am DESC LIMIT 1`,
  );
  const r = rows[0];
  return r ? { id: text(r.id), typ: text(r.typ), von: text(r.von), bis: text(r.bis), status: text(r.status), beispiel: r.beispiel === true } : null;
}

/** The latest news for the person's tools; "neu" when published after the person last looked. */
async function ladeNeuigkeiten(db: Db, werkzeuge: string[], email: string): Promise<StartNeuigkeit[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT n.id, n.titel, n.text, n.link, n.werkzeug, n.am, (r.neuigkeiten_gesehen_am IS NULL OR n.am > r.neuigkeiten_gesehen_am) AS neu
     FROM instanz_neuigkeiten n LEFT JOIN instanz_rundgang r ON r.email = $2
     WHERE NOT n.archiviert AND (n.werkzeug IS NULL OR n.werkzeug = ANY($1::text[]))
     ORDER BY n.am DESC LIMIT 6`,
    [werkzeuge, email],
  );
  return rows.map((r) => ({ id: text(r.id), titel: text(r.titel), text: text(r.text), link: text(r.link), werkzeug: text(r.werkzeug), am: zeit(r.am), neu: r.neu === true }));
}
