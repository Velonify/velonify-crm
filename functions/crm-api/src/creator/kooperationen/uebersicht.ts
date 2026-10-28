import { darfEinrichten } from '../../../../../src/data/instanz';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../../routen';
import { freigabeVon } from '../freigaben';
import { baustein, betraege, fehler, istObjekt, neueId, ok, type CreatorKontext } from '../modul';
import {
  einstellungen,
  EINSTELLUNG,
  ENDE,
  Eingabefehler,
  istStand,
  istWaehrung,
  istZahlung,
  kanalListe,
  KANAL_NAME,
  optTag,
  optText,
  PHASEN,
  setzeEinstellung,
  tag,
  text,
  zahl,
  zeit,
  type Stand,
  type Zahlung,
} from './daten';

export interface Kooperation {
  id: string;
  partner: string;
  marke: string;
  titel: string;
  ansprechpartner: string;
  email: string;
  ueber_agentur: boolean;
  kanaele: string[];
  leistung: string;
  zeitraum_von: string;
  zeitraum_bis: string;
  /** Only with amounts visible. */
  betrag?: number | null;
  waehrung: string;
  stand: Stand;
  zahlung: Zahlung;
  rechnung_am: string;
  faellig_am: string;
  bezahlt_am: string;
  zustaendig: string;
  wiedervorlage: string;
  wiedervorlage_notiz: string;
  briefing: string;
  drive_ordner: string;
  werbung: boolean;
  notiz: string;
  anfrage_id: string;
  archiviert: boolean;
  erstellt_am: string;
  erstellt_von: string;
  geaendert_am: string;
  geaendert_von: string;
}

export const KOOP_SPALTEN = `id, partner, marke, titel, ansprechpartner, email, ueber_agentur, kanaele, leistung, zeitraum_von::text, zeitraum_bis::text,
  betrag, waehrung, stand, zahlung, rechnung_am::text, faellig_am::text, bezahlt_am::text, zustaendig, wiedervorlage::text, wiedervorlage_notiz,
  briefing, drive_ordner, werbung, notiz, anfrage_id, archiviert, erstellt_am, erstellt_von, geaendert_am, geaendert_von`;

export function zuKooperation(z: Record<string, unknown>, mitBetrag: boolean): Kooperation {
  const k: Kooperation = {
    id: text(z.id),
    partner: text(z.partner),
    marke: text(z.marke),
    titel: text(z.titel),
    ansprechpartner: text(z.ansprechpartner),
    email: text(z.email),
    ueber_agentur: z.ueber_agentur === true,
    kanaele: Array.isArray(z.kanaele) ? z.kanaele.map(String) : [],
    leistung: text(z.leistung),
    zeitraum_von: tag(z.zeitraum_von),
    zeitraum_bis: tag(z.zeitraum_bis),
    waehrung: text(z.waehrung) || 'EUR',
    stand: text(z.stand) as Stand,
    zahlung: text(z.zahlung) as Zahlung,
    rechnung_am: tag(z.rechnung_am),
    faellig_am: tag(z.faellig_am),
    bezahlt_am: tag(z.bezahlt_am),
    zustaendig: text(z.zustaendig),
    wiedervorlage: tag(z.wiedervorlage),
    wiedervorlage_notiz: text(z.wiedervorlage_notiz),
    briefing: text(z.briefing),
    drive_ordner: text(z.drive_ordner),
    werbung: z.werbung !== false,
    notiz: text(z.notiz),
    anfrage_id: text(z.anfrage_id),
    archiviert: z.archiviert === true,
    erstellt_am: zeit(z.erstellt_am),
    erstellt_von: text(z.erstellt_von),
    geaendert_am: zeit(z.geaendert_am),
    geaendert_von: text(z.geaendert_von),
  };
  if (mitBetrag) k.betrag = zahl(z.betrag);
  return k;
}

export const koopTitel = (k: Pick<Kooperation, 'titel' | 'marke' | 'partner'>) => k.titel || k.marke || k.partner;
export const koopLink = (id: string) => `/kooperationen?id=${id}`;

export async function ladeKooperation(db: Db, id: string, mitBetrag = true): Promise<Kooperation | null> {
  const { rows } = await db.query<Record<string, unknown>>(`SELECT ${KOOP_SPALTEN} FROM kooperationen WHERE id = $1`, [id]);
  return rows[0] ? zuKooperation(rows[0], mitBetrag) : null;
}

/**
 * Keeps the module's deadlines in the calendar (fristen, quelle "kooperation", one row per cooperation and kind):
 * follow-up (Wiedervorlage), campaign start and end, payment due date. Rows without a date are removed; done
 * cooperations mark them done; archived ones archive them.
 */
export async function pflegeFristen(db: Db, k: Kooperation, von: string): Promise<void> {
  const name = koopTitel(k);
  const beendet = (ENDE as readonly string[]).includes(k.stand);
  const eintraege: { art: string; bezug: string; datum: string; titel: string; erledigt: boolean; notiz: string }[] = [
    { art: 'kooperation', bezug: 'wiedervorlage', datum: k.wiedervorlage, titel: `Wiedervorlage: ${name}`, erledigt: beendet, notiz: k.wiedervorlage_notiz },
    { art: 'kampagne', bezug: 'start', datum: k.zeitraum_von, titel: `Kampagne startet: ${name}`, erledigt: k.stand === 'abgesagt', notiz: '' },
    { art: 'kampagne', bezug: 'ende', datum: k.zeitraum_bis, titel: `Kampagne endet: ${name}`, erledigt: k.stand === 'abgesagt', notiz: '' },
    {
      art: 'buchhaltung',
      bezug: 'zahlung',
      datum: k.zahlung === 'rechnung_gestellt' || k.zahlung === 'bezahlt' ? k.faellig_am : '',
      titel: `Zahlung fällig: ${name}`,
      erledigt: k.zahlung === 'bezahlt' || k.stand === 'abgesagt',
      notiz: 'Rechnung gestellt; bitte Zahlungseingang prüfen.',
    },
  ];
  for (const e of eintraege) {
    const bezugId = `${k.id}:${e.bezug}`;
    if (!e.datum) {
      await db.query(`DELETE FROM fristen WHERE quelle = 'kooperation' AND bezug_id = $1`, [bezugId]);
      continue;
    }
    await db.query(
      `INSERT INTO fristen (id, titel, datum, art, quelle, bezug_id, link, zustaendig, notiz, erledigt, archiviert, erstellt_von, geaendert_am, geaendert_von)
       VALUES ($1, $2, $3, $4, 'kooperation', $5, $6, $7, $8, $9, $10, $11, now(), $11)
       ON CONFLICT (quelle, bezug_id) WHERE bezug_id IS NOT NULL DO UPDATE SET titel = $2, datum = $3, art = $4, link = $6, zustaendig = $7, notiz = $8,
         erledigt = $9, archiviert = $10, geaendert_am = now(), geaendert_von = $11`,
      [neueId('FR'), e.titel.slice(0, 200), e.datum, e.art, bezugId, koopLink(k.id), k.zustaendig || null, e.notiz || null, e.erledigt, k.archiviert, von],
    );
  }
}

/** Reads and checks the editable fields; amounts only when allowed (otherwise ignored). */
function felder(body: Record<string, unknown>, mitBetrag: boolean): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const texte: [string, number][] = [
    ['partner', 200],
    ['marke', 200],
    ['titel', 200],
    ['ansprechpartner', 200],
    ['email', 200],
    ['leistung', 2000],
    ['zustaendig', 200],
    ['wiedervorlage_notiz', 500],
    ['briefing', 20000],
    ['drive_ordner', 500],
    ['notiz', 5000],
  ];
  for (const [name, max] of texte) {
    const w = optText(body[name], name, max);
    if (w !== undefined) f[name] = w;
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email))) throw new Eingabefehler('Die E-Mail-Adresse sieht nicht gültig aus.');
  if (f.drive_ordner && !/^https:\/\//.test(String(f.drive_ordner))) throw new Eingabefehler('Der Drive-Ordner ist ein Link (https://…).');
  for (const name of ['zeitraum_von', 'zeitraum_bis', 'rechnung_am', 'faellig_am', 'bezahlt_am', 'wiedervorlage']) {
    const w = optTag(body[name], name);
    if (w !== undefined) f[name] = w;
  }
  for (const name of ['ueber_agentur', 'werbung']) {
    if (body[name] === undefined) continue;
    if (typeof body[name] !== 'boolean') throw new Eingabefehler(`${name} ist ja oder nein.`);
    f[name] = body[name];
  }
  if (body.kanaele !== undefined) f.kanaele = kanalListe(body.kanaele);
  if (body.stand !== undefined) {
    if (!istStand(body.stand)) throw new Eingabefehler('Unbekannter Stand.');
    f.stand = body.stand;
  }
  if (body.zahlung !== undefined) {
    if (!istZahlung(body.zahlung)) throw new Eingabefehler('Unbekannter Zahlungsstand.');
    f.zahlung = body.zahlung;
  }
  if (mitBetrag) {
    if (body.betrag !== undefined) {
      if (body.betrag === null || body.betrag === '') f.betrag = null;
      else {
        const b = Number(body.betrag);
        if (!Number.isFinite(b) || b < 0 || b > 1e11) throw new Eingabefehler('Betrag als positive Zahl.');
        f.betrag = Math.round(b * 100) / 100;
      }
    }
    if (body.waehrung !== undefined) {
      if (!istWaehrung(body.waehrung)) throw new Eingabefehler('Währung ist EUR oder JPY.');
      f.waehrung = body.waehrung;
    }
  }
  return f;
}

/** Fills dates that follow from the payment state, so the overview and the income stay consistent. */
function zahlungsdaten(f: Record<string, unknown>, vorher: Kooperation | null, heute: string) {
  const zahlung = (f.zahlung ?? vorher?.zahlung ?? 'offen') as Zahlung;
  if (zahlung === 'rechnung_gestellt' && !(f.rechnung_am ?? vorher?.rechnung_am)) f.rechnung_am = heute;
  if (zahlung === 'bezahlt' && !(f.bezahlt_am ?? vorher?.bezahlt_am)) f.bezahlt_am = heute;
  if (zahlung !== 'bezahlt' && f.zahlung !== undefined) f.bezahlt_am = null;
}

export async function speichereKooperation(ctx: CreatorKontext, body: Record<string, unknown>, heute: string): Promise<Kooperation> {
  const mitBetrag = betraege(ctx);
  const f = felder(body, mitBetrag);
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  const vorher = id ? await ladeKooperation(ctx.pool, id) : null;
  if (id && !vorher) throw Object.assign(new Eingabefehler('Kooperation nicht gefunden.'), { status: 404 });
  if (!vorher && !f.partner) throw new Eingabefehler('Der Partner fehlt.');
  if (vorher && 'partner' in f && !f.partner) throw new Eingabefehler('Der Partner fehlt.');
  if (f.stand !== undefined && f.stand !== (vorher?.stand ?? 'anfrage')) {
    if (!ctx.sicht.bausteine.includes('pipeline')) throw Object.assign(new Eingabefehler('Die Pipeline ist nicht eingeschaltet.'), { status: 403 });
    if (ctx.sicht.bausteine.includes('freigaben') && ['reporting', 'rechnung', 'abgeschlossen'].includes(String(f.stand))) {
      const freigabe = vorher ? await freigabeVon(ctx.pool, 'kooperation', vorher.id) : null;
      if (!freigabe || freigabe.status !== 'freigegeben') throw Object.assign(new Eingabefehler('Die Kooperation braucht zuerst eine Freigabe.'), { status: 409 });
    }
  }
  zahlungsdaten(f, vorher, heute);
  const von = (f.zeitraum_von ?? vorher?.zeitraum_von) as string | null;
  const bis = (f.zeitraum_bis ?? vorher?.zeitraum_bis) as string | null;
  if (von && bis && bis < von) throw new Eingabefehler('Der Zeitraum endet vor seinem Beginn.');

  const spalten = Object.keys(f);
  let neuId = id;
  if (!vorher) {
    neuId = neueId('KO');
    const alle = ['id', ...spalten, 'erstellt_von', 'geaendert_am', 'geaendert_von'];
    const werte = [neuId, ...spalten.map((s) => f[s]), ctx.person, new Date(ctx.jetzt()).toISOString(), ctx.person];
    await ctx.pool.query(`INSERT INTO kooperationen (${alle.join(', ')}) VALUES (${alle.map((_, i) => `$${i + 1}`).join(', ')})`, werte);
  } else if (spalten.length > 0) {
    const set = spalten.map((s, i) => `${s} = $${i + 2}`).join(', ');
    await ctx.pool.query(`UPDATE kooperationen SET ${set}, geaendert_am = now(), geaendert_von = $${spalten.length + 2} WHERE id = $1`, [id, ...spalten.map((s) => f[s]), ctx.person]);
  }
  const k = (await ladeKooperation(ctx.pool, neuId!))!;
  await pflegeFristen(ctx.pool, k, ctx.person);
  return mitBetrag ? k : zuKooperationOhneBetrag(k);
}

const zuKooperationOhneBetrag = (k: Kooperation): Kooperation => {
  const { betrag: _weg, ...rest } = k;
  void _weg;
  return rest;
};

interface Inhalt {
  id: string;
  titel: string;
  kanal: string;
  status: string;
  geplant_am: string;
  zustaendig: string;
  video_url: string;
}

async function verknuepfteInhalte(db: Db, kooperationId: string): Promise<Inhalt[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT i.id, i.titel, i.kanal, i.status, i.geplant_am::text, i.zustaendig, v.url AS video_url
     FROM inhalte i LEFT JOIN videos v ON v.id = i.video_id
     WHERE i.kooperation_id = $1 AND NOT i.archiviert ORDER BY i.geplant_am NULLS LAST, i.titel`,
    [kooperationId],
  );
  return rows.map((r) => ({ id: text(r.id), titel: text(r.titel), kanal: text(r.kanal), status: text(r.status), geplant_am: tag(r.geplant_am), zustaendig: text(r.zustaendig), video_url: text(r.video_url) }));
}

/** Sums per currency: open (not paid, not cancelled) and paid. */
function summen(liste: Kooperation[]) {
  const leer = () => ({ EUR: 0, JPY: 0 });
  const s = { offen: leer(), rechnung_gestellt: leer(), bezahlt: leer() };
  for (const k of liste) {
    if (k.archiviert || k.stand === 'abgesagt' || !k.betrag) continue;
    const w = k.waehrung === 'JPY' ? 'JPY' : 'EUR';
    if (k.zahlung === 'bezahlt') s.bezahlt[w] += k.betrag;
    else {
      s.offen[w] += k.betrag;
      if (k.zahlung === 'rechnung_gestellt') s.rechnung_gestellt[w] += k.betrag;
    }
  }
  return s;
}

/** /c/kooperationen/… except requests, media kit and reports. */
export async function uebersichtRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null> {
  const db = ctx.pool;
  const mitBetrag = betraege(ctx);
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(ctx.jetzt());

  // Contract for the content module: active cooperations to link a content item with, and whether it is advertising.
  if (pfad === '/c/kooperationen/auswahl' && methode === 'GET') {
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT id, titel, marke, partner, werbung FROM kooperationen WHERE NOT archiviert AND stand NOT IN ('abgeschlossen', 'abgesagt') ORDER BY partner`,
    );
    return ok({ kooperationen: rows.map((r) => ({ id: text(r.id), titel: koopTitel({ titel: text(r.titel), marke: text(r.marke), partner: text(r.partner) }), marke: text(r.marke) || text(r.partner), werbung: r.werbung !== false })) });
  }

  if (pfad === '/c/kooperationen/liste' && methode === 'GET') {
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    const { rows } = await db.query<Record<string, unknown>>(`SELECT ${KOOP_SPALTEN} FROM kooperationen ORDER BY archiviert, COALESCE(zeitraum_von, erstellt_am::date) DESC`);
    const liste = rows.map((r) => zuKooperation(r, mitBetrag));
    const e = await einstellungen(db);
    const { rows: inhalte } = await db.query<{ kooperation_id: string; anzahl: string }>(
      `SELECT kooperation_id, count(*) AS anzahl FROM inhalte WHERE kooperation_id IS NOT NULL AND NOT archiviert GROUP BY kooperation_id`,
    );
    return ok({
      kooperationen: liste,
      inhalte_je_kooperation: Object.fromEntries(inhalte.map((r) => [r.kooperation_id, Number(r.anzahl)])),
      summen: mitBetrag ? summen(liste) : null,
      betraege: mitBetrag,
      agentur: e[EINSTELLUNG.agentur] ?? '',
      phasen: PHASEN,
    });
  }

  const detail = /^\/c\/kooperationen\/eintrag\/([A-Z0-9-]+)$/.exec(pfad);
  if (detail && methode === 'GET') {
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    const k = await ladeKooperation(db, detail[1], mitBetrag);
    if (!k) return fehler(404, 'Kooperation nicht gefunden.');
    const { rows: reportings } = await db.query<Record<string, unknown>>(
      `SELECT id, titel, link_aktiv, erstellt_am FROM kooperation_reportings WHERE kooperation_id = $1 AND NOT archiviert ORDER BY erstellt_am DESC`,
      [k.id],
    );
    return ok({
      kooperation: k,
      inhalte: await verknuepfteInhalte(db, k.id),
      reportings: reportings.map((r) => ({ id: text(r.id), titel: text(r.titel), link_aktiv: r.link_aktiv === true, erstellt_am: zeit(r.erstellt_am) })),
      freigabe: await freigabeVon(db, 'kooperation', k.id),
    });
  }

  if (methode !== 'POST') return null;

  if (pfad === '/c/kooperationen/speichern') {
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
    return ok({ kooperation: await speichereKooperation(ctx, body, heute) });
  }

  if (pfad === '/c/kooperationen/archivieren') {
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    if (!istObjekt(body) || typeof body.id !== 'string' || typeof body.archiviert !== 'boolean') return fehler(400, 'Kooperation und archiviert fehlen.');
    const { rows } = await db.query('UPDATE kooperationen SET archiviert = $2, geaendert_am = now(), geaendert_von = $3 WHERE id = $1 RETURNING id', [body.id, body.archiviert, ctx.person]);
    if (rows.length === 0) return fehler(404, 'Kooperation nicht gefunden.');
    const k = (await ladeKooperation(db, body.id))!;
    await pflegeFristen(db, k, ctx.person);
    return ok({ kooperation: mitBetrag ? k : zuKooperationOhneBetrag(k) });
  }

  // Board: move to another phase (building block "pipeline").
  if (pfad === '/c/kooperationen/verschieben') {
    const zu = baustein(ctx, 'pipeline');
    if (zu) return zu;
    if (!istObjekt(body) || typeof body.id !== 'string' || !istStand(body.stand)) return fehler(400, 'Kooperation und Stand fehlen.');
    return ok({ kooperation: await speichereKooperation(ctx, { id: body.id, stand: body.stand }, heute) });
  }

  if (pfad === '/c/kooperationen/einstellungen') {
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Einrichtung ist nur für Admins.');
    const zu = baustein(ctx, 'kooperationen');
    if (zu) return zu;
    if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
    if (body.agentur !== undefined) {
      const name = optText(body.agentur, 'Name der Deal-Agentur', 60);
      await setzeEinstellung(db, EINSTELLUNG.agentur, name ?? '', ctx.person);
    }
    return ok({ agentur: (await einstellungen(db))[EINSTELLUNG.agentur] ?? '' });
  }
  return null;
}

export const kanalName = (k: string) => KANAL_NAME[k] ?? k;
