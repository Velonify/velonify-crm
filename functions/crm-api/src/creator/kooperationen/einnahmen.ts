import { createHash } from 'node:crypto';
import { darfEinrichten } from '../../../../../src/data/instanz';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../../routen';
import { baustein, betraege, fehler, istObjekt, neueId, ok, type CreatorKontext } from '../modul';
import { einstellungen, EINSTELLUNG, Eingabefehler, ENDE, heuteIn, istTag, istWaehrung, optText, PHASEN, setzeEinstellung, tag, text, zahl, zeit } from './daten';
import { leseBetrag, leseCsv, leseDatum } from './csv';
import { holeKurse, inBeiden, ladeKurse, type Holen, type Kurse } from './kurse';
import { koopTitel, speichereKooperation, KOOP_SPALTEN, zuKooperation, type Kooperation } from './uebersicht';

/**
 * Income overview (Konzept: "Kooperationen, AdSense, Twitch und Affiliate in einer Übersicht; die Rechnung selbst stellt eure
 * Buchhaltung"). Paid cooperations come in automatically, the other sources by hand or CSV. A basis for accounting,
 * liquidity and reserves; no invoices, no tax advice.
 */
export const QUELLEN = ['kooperation', 'adsense', 'twitch', 'affiliate'] as const;
export const MANUELLE_QUELLEN = ['adsense', 'twitch', 'affiliate'] as const;
export const QUELLE_NAME: Record<string, string> = { kooperation: 'Kooperationen', adsense: 'AdSense', twitch: 'Twitch', affiliate: 'Affiliate' };
const istManuelleQuelle = (w: unknown): w is (typeof MANUELLE_QUELLEN)[number] => typeof w === 'string' && (MANUELLE_QUELLEN as readonly string[]).includes(w);

export type EinnahmeStatus = 'erwartet' | 'rechnung_gestellt' | 'bezahlt';

export interface Einnahme {
  id: string;
  /** eintrag = row in einnahmen; kooperation = from a cooperation (paid or invoiced). */
  art: 'eintrag' | 'kooperation';
  quelle: string;
  /** "YYYY-MM" */
  monat: string;
  datum: string;
  beschreibung: string;
  status: EinnahmeStatus;
  herkunft: string;
  kooperation_id: string;
  faellig_am: string;
  archiviert: boolean;
  /** Only with amounts visible: */
  betrag?: number;
  waehrung?: string;
  eur?: number | null;
  jpy?: number | null;
  kurs?: number | null;
  kurs_vom?: string;
}

const letzterTag = (monat: string) => {
  const [j, m] = monat.split('-').map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
};

/** Rows of einnahmen plus cooperations with an invoice or payment, converted with the ECB rate of their day. */
async function sammle(db: Db, kurse: Kurse, mitArchiv = false): Promise<Einnahme[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, quelle, monat::text, datum::text, beschreibung, betrag, waehrung, status, herkunft, archiviert FROM einnahmen ${mitArchiv ? '' : 'WHERE NOT archiviert'} ORDER BY monat DESC, datum DESC NULLS LAST`,
  );
  const eintraege: Einnahme[] = rows.map((r) => {
    const monat = tag(r.monat).slice(0, 7);
    const datum = tag(r.datum);
    const betrag = zahl(r.betrag) ?? 0;
    const waehrung = text(r.waehrung);
    return {
      id: text(r.id),
      art: 'eintrag',
      quelle: text(r.quelle),
      monat,
      datum,
      beschreibung: text(r.beschreibung),
      status: text(r.status) as EinnahmeStatus,
      herkunft: text(r.herkunft),
      kooperation_id: '',
      faellig_am: '',
      archiviert: r.archiviert === true,
      betrag,
      waehrung,
      ...inBeiden(betrag, waehrung, datum || letzterTag(monat), kurse),
    };
  });
  const { rows: koops } = await db.query<Record<string, unknown>>(
    `SELECT ${KOOP_SPALTEN} FROM kooperationen WHERE NOT archiviert AND stand <> 'abgesagt' AND zahlung IN ('rechnung_gestellt', 'bezahlt') AND betrag IS NOT NULL`,
  );
  for (const z of koops) {
    const k = zuKooperation(z, true);
    const datum = (k.zahlung === 'bezahlt' ? k.bezahlt_am : k.rechnung_am) || k.zeitraum_bis || tag(k.erstellt_am);
    eintraege.push({
      id: k.id,
      art: 'kooperation',
      quelle: 'kooperation',
      monat: datum.slice(0, 7),
      datum,
      beschreibung: `${koopTitel(k)}${k.marke && k.marke !== koopTitel(k) ? ` (${k.marke})` : ''}`,
      status: k.zahlung === 'bezahlt' ? 'bezahlt' : 'rechnung_gestellt',
      herkunft: 'kooperation',
      kooperation_id: k.id,
      faellig_am: k.faellig_am,
      archiviert: false,
      betrag: k.betrag ?? 0,
      waehrung: k.waehrung,
      ...inBeiden(k.betrag ?? 0, k.waehrung, datum, kurse),
    });
  }
  return eintraege.sort((a, b) => b.datum.localeCompare(a.datum) || b.monat.localeCompare(a.monat));
}

interface Summe {
  eur: number;
  jpy: number;
  /** Entries whose other currency is missing for want of a rate. */
  ohne_kurs: number;
}
const leer = (): Summe => ({ eur: 0, jpy: 0, ohne_kurs: 0 });
function addiere(s: Summe, e: { eur?: number | null; jpy?: number | null }) {
  if (e.eur === null || e.jpy === null || e.eur === undefined || e.jpy === undefined) s.ohne_kurs++;
  s.eur += e.eur ?? 0;
  s.jpy += e.jpy ?? 0;
}
const rund = (s: Summe): Summe => ({ eur: Math.round(s.eur * 100) / 100, jpy: Math.round(s.jpy), ohne_kurs: s.ohne_kurs });

function monateBis(monat: string, anzahl: number): string[] {
  const [j, m] = monat.split('-').map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const d = new Date(Date.UTC(j, m - 1 - (anzahl - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Dashboards: paid this year and month, open receivables, expected from the pipeline, liquidity outlook, reserve. */
async function dashboard(db: Db, eintraege: Einnahme[], kurse: Kurse, heute: string) {
  const jahr = heute.slice(0, 4);
  const monat = heute.slice(0, 7);
  const bezahlt = eintraege.filter((e) => e.status === 'bezahlt');

  const jahrSumme = leer();
  const monatSumme = leer();
  const jeQuelle: Record<string, Summe> = Object.fromEntries(QUELLEN.map((q) => [q, leer()]));
  for (const e of bezahlt) {
    if (e.monat.startsWith(jahr)) {
      addiere(jahrSumme, e);
      addiere(jeQuelle[e.quelle] ?? (jeQuelle[e.quelle] = leer()), e);
    }
    if (e.monat === monat) addiere(monatSumme, e);
  }

  const monate = monateBis(monat, 12).map((m) => {
    const q = Object.fromEntries(QUELLEN.map((x) => [x, leer()]));
    for (const e of bezahlt) if (e.monat === m) addiere(q[e.quelle] ?? (q[e.quelle] = leer()), e);
    return { monat: m, quellen: Object.fromEntries(Object.entries(q).map(([k, s]) => [k, rund(s)])) };
  });

  // Open receivables: invoiced cooperations and expected entries of the other sources.
  const offen = eintraege.filter((e) => e.status !== 'bezahlt');
  const forderungen = leer();
  for (const e of offen) addiere(forderungen, e);

  // Expected from the pipeline: agreed amounts of running cooperations without an invoice, at today's rate.
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ${KOOP_SPALTEN} FROM kooperationen WHERE NOT archiviert AND zahlung = 'offen' AND betrag IS NOT NULL AND stand <> ALL($1)`,
    [ENDE as readonly string[]],
  );
  const pipeline: Kooperation[] = rows.map((r) => zuKooperation(r, true));
  const jePhase = PHASEN.map((p) => {
    const s = leer();
    const liste = pipeline.filter((k) => k.stand === p);
    for (const k of liste) addiere(s, inBeiden(k.betrag ?? 0, k.waehrung, heute, kurse));
    return { phase: p, anzahl: liste.length, ...rund(s) };
  });
  // From the contract on, the amount is agreed; before that it is still being negotiated (by the deal agency).
  const ab = PHASEN.indexOf('vertrag');
  const sicher = leer();
  const unsicher = leer();
  for (const k of pipeline) addiere(PHASEN.indexOf(k.stand as (typeof PHASEN)[number]) >= ab ? sicher : unsicher, inBeiden(k.betrag ?? 0, k.waehrung, heute, kurse));

  // Liquidity outlook: when money is expected, by month (receivables by due date, pipeline by campaign end).
  const ausblick = monateBis(monateBis(monat, 1)[0], 1).concat();
  void ausblick;
  const naechste = Array.from({ length: 4 }, (_, i) => {
    const [j, m] = monat.split('-').map(Number);
    return new Date(Date.UTC(j, m - 1 + i, 1)).toISOString().slice(0, 7);
  });
  const liquiditaet = naechste.map((m) => ({ monat: m, forderungen: leer(), pipeline: leer() }));
  const spaeter = { forderungen: leer(), pipeline: leer() };
  const ohneDatum = { forderungen: leer(), pipeline: leer() };
  const einordnen = (wann: string, art: 'forderungen' | 'pipeline', betrag: { eur?: number | null; jpy?: number | null }) => {
    if (!wann) return addiere(ohneDatum[art], betrag);
    const m = wann.slice(0, 7) < monat ? monat : wann.slice(0, 7);
    const zeile = liquiditaet.find((l) => l.monat === m);
    addiere(zeile ? zeile[art] : spaeter[art], betrag);
  };
  for (const e of offen) einordnen(e.faellig_am || e.datum, 'forderungen', e);
  for (const k of pipeline.filter((x) => PHASEN.indexOf(x.stand as (typeof PHASEN)[number]) >= ab)) einordnen(k.faellig_am || k.zeitraum_bis, 'pipeline', inBeiden(k.betrag ?? 0, k.waehrung, heute, kurse));

  const quote = Number((await einstellungen(db))[EINSTELLUNG.ruecklagenquote] ?? '');
  const hatQuote = Number.isFinite(quote) && quote > 0;
  return {
    jahr,
    monat,
    bezahlt_jahr: rund(jahrSumme),
    bezahlt_monat: rund(monatSumme),
    je_quelle: Object.fromEntries(Object.entries(jeQuelle).map(([k, s]) => [k, rund(s)])),
    monate,
    forderungen: rund(forderungen),
    forderungen_anzahl: offen.length,
    ueberfaellig: offen.filter((e) => e.faellig_am && e.faellig_am < heute).length,
    pipeline: { je_phase: jePhase, vereinbart: rund(sicher), in_verhandlung: rund(unsicher) },
    liquiditaet: liquiditaet.map((l) => ({ monat: l.monat, forderungen: rund(l.forderungen), pipeline: rund(l.pipeline) })),
    liquiditaet_spaeter: { forderungen: rund(spaeter.forderungen), pipeline: rund(spaeter.pipeline) },
    liquiditaet_ohne_datum: { forderungen: rund(ohneDatum.forderungen), pipeline: rund(ohneDatum.pipeline) },
    ruecklage: hatQuote
      ? { quote, eur: Math.round(jahrSumme.eur * quote) / 100, jpy: Math.round((jahrSumme.jpy * quote) / 100) }
      : { quote: null, eur: null, jpy: null },
    kurs: kurse.neuester,
  };
}

function ohneBetrag(e: Einnahme): Einnahme {
  const { betrag: _1, waehrung: _2, eur: _3, jpy: _4, kurs: _5, kurs_vom: _6, ...rest } = e;
  void [_1, _2, _3, _4, _5, _6];
  return rest;
}

const csvFeld = (w: string | number | null | undefined) => {
  const s = w === null || w === undefined ? '' : String(w);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const deZahl = (n: number | null | undefined, stellen = 2) => (n === null || n === undefined ? '' : n.toFixed(stellen).replace('.', ','));

/** Export for the accounting (semicolon CSV, German numbers): one line per income with both currencies and the rate used. */
function exportCsv(eintraege: Einnahme[], jahr: string): string {
  const kopf = ['Monat', 'Datum', 'Quelle', 'Beschreibung', 'Status', 'Betrag', 'Währung', 'EUR', 'JPY', 'EZB-Kurs EUR/JPY', 'Kurs vom'];
  const zeilen = eintraege
    .filter((e) => e.monat.startsWith(jahr))
    .sort((a, b) => a.monat.localeCompare(b.monat) || a.datum.localeCompare(b.datum))
    .map((e) =>
      [
        e.monat,
        e.datum,
        QUELLE_NAME[e.quelle] ?? e.quelle,
        e.beschreibung,
        e.status === 'bezahlt' ? 'bezahlt' : e.status === 'rechnung_gestellt' ? 'Rechnung gestellt' : 'erwartet',
        deZahl(e.betrag),
        e.waehrung,
        deZahl(e.eur),
        deZahl(e.jpy, 0),
        deZahl(e.kurs, 4),
        e.kurs_vom,
      ]
        .map(csvFeld)
        .join(';'),
    );
  return `﻿${[kopf.join(';'), ...zeilen].join('\r\n')}\r\n`;
}

function eintragFelder(body: Record<string, unknown>) {
  if (!istManuelleQuelle(body.quelle)) throw new Eingabefehler('Quelle ist AdSense, Twitch oder Affiliate. Kooperationen kommen automatisch aus der Übersicht.');
  if (typeof body.monat !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.monat)) throw new Eingabefehler('Monat im Format JJJJ-MM.');
  const datum = body.datum === undefined || body.datum === '' || body.datum === null ? null : body.datum;
  if (datum !== null && !istTag(datum)) throw new Eingabefehler('Datum im Format JJJJ-MM-TT.');
  const betrag = typeof body.betrag === 'number' ? body.betrag : leseBetrag(String(body.betrag ?? ''));
  if (betrag === null || !Number.isFinite(betrag) || Math.abs(betrag) > 1e11) throw new Eingabefehler('Betrag als Zahl.');
  if (!istWaehrung(body.waehrung)) throw new Eingabefehler('Währung ist EUR oder JPY.');
  const status = body.status ?? 'bezahlt';
  if (status !== 'bezahlt' && status !== 'erwartet') throw new Eingabefehler('Status ist erwartet oder bezahlt.');
  return { quelle: body.quelle, monat: `${body.monat}-01`, datum, betrag: Math.round(betrag * 100) / 100, waehrung: body.waehrung, status, beschreibung: optText(body.beschreibung, 'Beschreibung', 300) ?? null };
}

export async function einnahmenRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext, holen?: Holen): Promise<Antwort | null> {
  const zu = baustein(ctx, 'einnahmen');
  if (zu) return zu;
  const db = ctx.pool;
  const mitBetrag = betraege(ctx);
  const heute = heuteIn(ctx.jetzt());

  if (pfad === '/c/einnahmen' && methode === 'GET') {
    const kurse = await ladeKurse(db);
    const eintraege = await sammle(db, kurse);
    if (!mitBetrag) return ok({ betraege: false, eintraege: eintraege.map(ohneBetrag), quellen: QUELLE_NAME });
    return ok({ betraege: true, eintraege, dashboard: await dashboard(db, eintraege, kurse, heute), quellen: QUELLE_NAME, darf_einstellen: darfEinrichten(ctx.rolle) });
  }

  const exp = /^\/c\/einnahmen\/export\/(\d{4})$/.exec(pfad);
  if (exp && methode === 'GET') {
    if (!mitBetrag) return fehler(403, 'Den Export gibt es nur mit Beträgen.');
    const eintraege = await sammle(db, await ladeKurse(db));
    return ok({ dateiname: `einnahmen-${exp[1]}.csv`, inhalt: exportCsv(eintraege, exp[1]) });
  }

  if (methode !== 'POST') return null;
  if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');

  if (pfad === '/c/einnahmen/speichern') {
    // Every income line is an amount: without amounts nothing to write.
    if (!mitBetrag) return fehler(403, 'Einnahmen erfassen geht nur mit Beträgen.');
    const f = eintragFelder(body);
    const werte = [f.quelle, f.monat, f.datum, f.betrag, f.waehrung, f.status, f.beschreibung, ctx.person];
    if (typeof body.id === 'string' && body.id) {
      const { rows } = await db.query(
        `UPDATE einnahmen SET quelle = $2, monat = $3, datum = $4, betrag = $5, waehrung = $6, status = $7, beschreibung = $8, geaendert_am = now(), geaendert_von = $9 WHERE id = $1 RETURNING id`,
        [body.id, ...werte],
      );
      if (rows.length === 0) return fehler(404, 'Eintrag nicht gefunden.');
      return ok({ id: body.id });
    }
    const id = neueId('EN');
    await db.query(
      `INSERT INTO einnahmen (id, quelle, monat, datum, betrag, waehrung, status, beschreibung, erstellt_von, geaendert_am, geaendert_von) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $9)`,
      [id, ...werte],
    );
    return ok({ id });
  }

  if (pfad === '/c/einnahmen/status') {
    // Only "erwartet" ↔ "bezahlt" (amounts untouched); allowed without amounts too.
    if (typeof body.id !== 'string' || (body.status !== 'bezahlt' && body.status !== 'erwartet')) return fehler(400, 'Eintrag und Status fehlen.');
    const { rows } = await db.query(`UPDATE einnahmen SET status = $2, geaendert_am = now(), geaendert_von = $3 WHERE id = $1 RETURNING id`, [body.id, body.status, ctx.person]);
    return rows.length ? ok() : fehler(404, 'Eintrag nicht gefunden.');
  }

  if (pfad === '/c/einnahmen/archivieren') {
    if (typeof body.id !== 'string' || typeof body.archiviert !== 'boolean') return fehler(400, 'Eintrag und archiviert fehlen.');
    const { rows } = await db.query(`UPDATE einnahmen SET archiviert = $2, geaendert_am = now(), geaendert_von = $3 WHERE id = $1 RETURNING id`, [body.id, body.archiviert, ctx.person]);
    return rows.length ? ok() : fehler(404, 'Eintrag nicht gefunden.');
  }

  // Invoice and payment state of a cooperation, straight from the income overview (the invoice itself comes from accounting).
  if (pfad === '/c/einnahmen/kooperation-zahlung') {
    if (typeof body.id !== 'string' || !['offen', 'rechnung_gestellt', 'bezahlt'].includes(String(body.zahlung))) return fehler(400, 'Kooperation und Zahlungsstand fehlen.');
    const k = await speichereKooperation(
      ctx,
      {
        id: body.id,
        zahlung: body.zahlung,
        ...(typeof body.datum === 'string' && body.datum ? (body.zahlung === 'bezahlt' ? { bezahlt_am: body.datum } : { rechnung_am: body.datum }) : {}),
        ...(typeof body.faellig_am === 'string' ? { faellig_am: body.faellig_am || null } : {}),
      },
      heute,
    );
    return ok({ kooperation: k });
  }

  if (pfad === '/c/einnahmen/import/vorschau') {
    if (typeof body.csv !== 'string' || !body.csv.trim()) return fehler(400, 'Die CSV-Datei ist leer.');
    if (body.csv.length > 2_000_000) return fehler(413, 'Die Datei ist zu groß (höchstens 2 MB).');
    const { kopf, zeilen } = leseCsv(body.csv);
    if (kopf.length < 2) return fehler(400, 'Die Datei hat keine Kopfzeile mit Spalten.');
    return ok({ kopf, beispiele: zeilen.slice(0, 5), anzahl: zeilen.length });
  }

  if (pfad === '/c/einnahmen/import') {
    if (!mitBetrag) return fehler(403, 'Einnahmen importieren geht nur mit Beträgen.');
    if (!istManuelleQuelle(body.quelle)) return fehler(400, 'Quelle ist AdSense, Twitch oder Affiliate.');
    if (typeof body.csv !== 'string' || body.csv.length > 2_000_000) return fehler(400, 'CSV fehlt oder ist zu groß.');
    if (!istWaehrung(body.waehrung)) return fehler(400, 'Standard-Währung ist EUR oder JPY.');
    const spalten = istObjekt(body.spalten) ? body.spalten : {};
    const { kopf, zeilen } = leseCsv(body.csv);
    const index = (name: unknown) => (typeof name === 'string' && name ? kopf.indexOf(name) : -1);
    const iDatum = index(spalten.datum);
    const iBetrag = index(spalten.betrag);
    const iWaehrung = index(spalten.waehrung);
    const iText = index(spalten.beschreibung);
    if (iDatum < 0 || iBetrag < 0) return fehler(400, 'Bitte die Spalten für Datum und Betrag wählen.');
    const status = body.status === 'erwartet' ? 'erwartet' : 'bezahlt';
    let importiert = 0;
    let doppelt = 0;
    const fehlerListe: { zeile: number; grund: string }[] = [];
    for (const [i, z] of zeilen.entries()) {
      const nr = i + 2;
      const datum = leseDatum(z[iDatum] ?? '');
      const betrag = leseBetrag(z[iBetrag] ?? '');
      const w = iWaehrung >= 0 ? (z[iWaehrung] ?? '').toUpperCase().replace('¥', 'JPY').replace('€', 'EUR').trim() : body.waehrung;
      if (!datum) fehlerListe.push({ zeile: nr, grund: `Datum „${z[iDatum] ?? ''}“ nicht erkannt` });
      else if (betrag === null) fehlerListe.push({ zeile: nr, grund: `Betrag „${z[iBetrag] ?? ''}“ nicht erkannt` });
      else if (!istWaehrung(w)) fehlerListe.push({ zeile: nr, grund: `Währung „${w}“ ist nicht EUR oder JPY` });
      else if (betrag === 0) continue;
      else {
        const beschreibung = iText >= 0 ? (z[iText] ?? '').slice(0, 300) : '';
        const schluessel = createHash('sha256').update([body.quelle, datum, betrag, w, beschreibung].join('|')).digest('hex');
        const { rows } = await db.query(
          `INSERT INTO einnahmen (id, quelle, monat, datum, betrag, waehrung, status, beschreibung, herkunft, import_schluessel, erstellt_von, geaendert_am, geaendert_von)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'csv', $9, $10, now(), $10) ON CONFLICT (import_schluessel) DO NOTHING RETURNING id`,
          [neueId('EN'), body.quelle, `${datum.slice(0, 7)}-01`, datum, betrag, w, status, beschreibung || null, schluessel, ctx.person],
        );
        if (rows.length) importiert++;
        else doppelt++;
      }
    }
    return ok({ importiert, doppelt, fehler: fehlerListe.slice(0, 50), fehler_anzahl: fehlerListe.length });
  }

  if (pfad === '/c/einnahmen/einstellungen') {
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Rücklagenquote legen Admins fest.');
    if (body.ruecklagenquote !== undefined) {
      if (body.ruecklagenquote === null || body.ruecklagenquote === '') await setzeEinstellung(db, EINSTELLUNG.ruecklagenquote, '', ctx.person);
      else {
        const q = Number(body.ruecklagenquote);
        if (!Number.isFinite(q) || q < 0 || q > 100) return fehler(400, 'Die Quote liegt zwischen 0 und 100 Prozent.');
        await setzeEinstellung(db, EINSTELLUNG.ruecklagenquote, String(Math.round(q * 10) / 10), ctx.person);
      }
    }
    return ok({ ruecklagenquote: (await einstellungen(db))[EINSTELLUNG.ruecklagenquote] ?? '' });
  }

  if (pfad === '/c/einnahmen/kurse/abrufen') {
    if (!mitBetrag) return fehler(403, 'Nur mit Beträgen.');
    try {
      return ok(await holeKurse(db, holen, ctx.jetzt()));
    } catch (err) {
      return fehler(502, `Die Kurse der EZB sind gerade nicht abrufbar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

export { zeit };
