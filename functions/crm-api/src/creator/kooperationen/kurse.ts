import type { Db } from '../../../../../src/data/postgres/postgresStore';
import { tag } from './daten';

/**
 * Euro foreign exchange reference rates of the European Central Bank (official XML, published on working days around
 * 16:00 CET). Only EUR→JPY is kept. No scraping: these files are the ECB's documented download.
 */
export const EZB_TAG = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const EZB_90_TAGE = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

export type Holen = (url: string, init?: RequestInit) => Promise<Response>;
/** Resolved at call time, so tests can stub the global fetch. */
const standardHolen: Holen = (url, init) => fetch(url, init);

/** All days with a JPY rate in an ECB XML file. */
export function leseEzbXml(xml: string): { datum: string; eur_jpy: number }[] {
  const tage: { datum: string; eur_jpy: number }[] = [];
  const block = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  for (const t of xml.matchAll(block)) {
    const jpy = /currency=['"]JPY['"]\s+rate=['"]([0-9.]+)['"]/.exec(t[2]);
    const kurs = jpy ? Number(jpy[1]) : NaN;
    if (Number.isFinite(kurs) && kurs > 0) tage.push({ datum: t[1], eur_jpy: kurs });
  }
  return tage;
}

/**
 * Fetches the newest rate; on the first run (or after a gap of more than a week) the last 90 days, so amounts from the
 * past have their day's rate too. Returns how many days were new and the newest day.
 */
export async function holeKurse(db: Db, holen: Holen = standardHolen, jetzt: Date = new Date()): Promise<{ neu: number; neuester: string; quelle: string }> {
  const { rows } = await db.query<{ neuester: string | null; anzahl: string }>(`SELECT max(datum)::text AS neuester, count(*) AS anzahl FROM wechselkurse`);
  const bisher = rows[0]?.neuester ?? '';
  const luecke = !bisher || jetzt.getTime() - new Date(`${bisher}T00:00:00Z`).getTime() > 7 * 86_400_000;
  const url = luecke ? EZB_90_TAGE : EZB_TAG;
  const antwort = await holen(url, { headers: { accept: 'application/xml' } });
  if (!antwort.ok) throw new Error(`EZB antwortet mit ${antwort.status}.`);
  const tage = leseEzbXml(await antwort.text());
  if (tage.length === 0) throw new Error('Die EZB-Datei enthält keinen JPY-Kurs.');
  let neu = 0;
  for (const t of tage) {
    const { rows: r } = await db.query<{ neu: boolean }>(
      `INSERT INTO wechselkurse (datum, eur_jpy, quelle, abgerufen_am) VALUES ($1, $2, 'ezb', now())
       ON CONFLICT (datum) DO UPDATE SET eur_jpy = $2, abgerufen_am = now() RETURNING (xmax = 0) AS neu`,
      [t.datum, t.eur_jpy],
    );
    if (r[0]?.neu) neu++;
  }
  return { neu, neuester: tage.map((t) => t.datum).sort().at(-1) ?? '', quelle: url };
}

/** Looks up the reference rate of a day: the newest published on or before it (weekends and holidays have none). */
export interface Kurse {
  /** EUR→JPY for the day and the day of the rate used; null before the first known rate. */
  fuer(datum: string): { eur_jpy: number; vom: string } | null;
  neuester: { datum: string; eur_jpy: number } | null;
}

export async function ladeKurse(db: Db): Promise<Kurse> {
  const { rows } = await db.query<{ datum: unknown; eur_jpy: string }>('SELECT datum::text AS datum, eur_jpy FROM wechselkurse ORDER BY datum');
  const liste = rows.map((r) => ({ datum: tag(r.datum), eur_jpy: Number(r.eur_jpy) }));
  return {
    fuer(datum) {
      let lo = 0;
      let hi = liste.length - 1;
      let treffer = -1;
      while (lo <= hi) {
        const mitte = (lo + hi) >> 1;
        if (liste[mitte].datum <= datum) {
          treffer = mitte;
          lo = mitte + 1;
        } else hi = mitte - 1;
      }
      return treffer < 0 ? null : { eur_jpy: liste[treffer].eur_jpy, vom: liste[treffer].datum };
    },
    neuester: liste.at(-1) ?? null,
  };
}

/** Amount in both currencies on a day; the other currency is null without a rate. */
export function inBeiden(betrag: number, waehrung: string, datum: string, kurse: Kurse): { eur: number | null; jpy: number | null; kurs: number | null; kurs_vom: string } {
  const k = kurse.fuer(datum);
  if (waehrung === 'JPY') return { jpy: betrag, eur: k ? Math.round((betrag / k.eur_jpy) * 100) / 100 : null, kurs: k?.eur_jpy ?? null, kurs_vom: k?.vom ?? '' };
  return { eur: betrag, jpy: k ? Math.round(betrag * k.eur_jpy) : null, kurs: k?.eur_jpy ?? null, kurs_vom: k?.vom ?? '' };
}
