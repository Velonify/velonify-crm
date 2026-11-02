import type { Db } from '../../../../../src/data/postgres/postgresStore';
import { neueId } from '../modul';
import { Eingabefehler, istTag, istWaehrung, optText, tag, text, zahl } from './daten';
import { leseBetrag } from './csv';
import { inBeiden, type Kurse } from './kurse';

/**
 * Budget (Noel's feedback, 11/2026): expenses such as taxes, travel costs and tickets against the income, per month.
 * Only with amounts visible; a basis for planning, no bookkeeping.
 */

export const AUSGABE_KATEGORIEN = ['Steuern', 'Spesen', 'Tickets', 'Equipment', 'Software', 'Reisen'];

export interface Ausgabe {
  id: string;
  kategorie: string;
  /** "YYYY-MM" */
  monat: string;
  datum: string;
  beschreibung: string;
  betrag: number;
  waehrung: string;
  eur: number | null;
  jpy: number | null;
}

const letzterTag = (monat: string) => {
  const [j, m] = monat.split('-').map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
};

export async function sammleAusgaben(db: Db, kurse: Kurse): Promise<Ausgabe[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, kategorie, monat::text, datum::text, beschreibung, betrag, waehrung FROM ausgaben WHERE NOT archiviert ORDER BY monat DESC, datum DESC NULLS LAST`,
  );
  return rows.map((r) => {
    const monat = tag(r.monat).slice(0, 7);
    const datum = tag(r.datum);
    const betrag = zahl(r.betrag) ?? 0;
    const waehrung = text(r.waehrung);
    const { eur, jpy } = inBeiden(betrag, waehrung, datum || letzterTag(monat), kurse);
    return { id: text(r.id), kategorie: text(r.kategorie), monat, datum, beschreibung: text(r.beschreibung), betrag, waehrung, eur, jpy };
  });
}

function felder(body: Record<string, unknown>) {
  const kategorie = optText(body.kategorie, 'Kategorie', 80)?.trim();
  if (!kategorie) throw new Eingabefehler('Bitte eine Kategorie angeben, z. B. Steuern oder Spesen.');
  if (typeof body.monat !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.monat)) throw new Eingabefehler('Monat im Format JJJJ-MM.');
  const datum = body.datum === undefined || body.datum === '' || body.datum === null ? null : body.datum;
  if (datum !== null && !istTag(datum)) throw new Eingabefehler('Datum im Format JJJJ-MM-TT.');
  const betrag = typeof body.betrag === 'number' ? body.betrag : leseBetrag(String(body.betrag ?? ''));
  if (betrag === null || !Number.isFinite(betrag) || betrag < 0 || betrag > 1e11) throw new Eingabefehler('Betrag als positive Zahl.');
  if (!istWaehrung(body.waehrung)) throw new Eingabefehler('Währung ist EUR oder JPY.');
  return { kategorie, monat: `${body.monat}-01`, datum, betrag: Math.round(betrag * 100) / 100, waehrung: body.waehrung, beschreibung: optText(body.beschreibung, 'Beschreibung', 300) ?? null };
}

export async function speichereAusgabe(db: Db, body: Record<string, unknown>, person: string): Promise<string | null> {
  const f = felder(body);
  const werte = [f.kategorie, f.monat, f.datum, f.betrag, f.waehrung, f.beschreibung, person];
  if (typeof body.id === 'string' && body.id) {
    const { rows } = await db.query(
      `UPDATE ausgaben SET kategorie = $2, monat = $3, datum = $4, betrag = $5, waehrung = $6, beschreibung = $7, geaendert_am = now(), geaendert_von = $8 WHERE id = $1 RETURNING id`,
      [body.id, ...werte],
    );
    return rows.length ? body.id : null;
  }
  const id = neueId('AU');
  await db.query(
    `INSERT INTO ausgaben (id, kategorie, monat, datum, betrag, waehrung, beschreibung, erstellt_von, geaendert_am, geaendert_von) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $8)`,
    [id, ...werte],
  );
  return id;
}

type Betrag = { eur?: number | null; jpy?: number | null };
type Summe = { eur: number; jpy: number };
const rund = (s: Summe): Summe => ({ eur: Math.round(s.eur * 100) / 100, jpy: Math.round(s.jpy) });
const plus = (s: Summe, b: Betrag) => ((s.eur += b.eur ?? 0), (s.jpy += b.jpy ?? 0));

/**
 * The monthly calculation: paid income minus expenses for the last twelve months, the year so far and the average month
 * of this year ("herunterrechnen auf einen Monat").
 */
export function monatsrechnung(einnahmen: (Betrag & { monat: string; status: string })[], ausgaben: Ausgabe[], heute: string) {
  const [j, m] = heute.slice(0, 7).split('-').map(Number);
  const monate = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(j, m - 12 + i, 1)).toISOString().slice(0, 7));
  const bezahlt = einnahmen.filter((e) => e.status === 'bezahlt');
  const rechne = (passt: (monat: string) => boolean) => {
    const ein = { eur: 0, jpy: 0 };
    const aus = { eur: 0, jpy: 0 };
    for (const e of bezahlt) if (passt(e.monat)) plus(ein, e);
    for (const a of ausgaben) if (passt(a.monat)) plus(aus, a);
    return { einnahmen: rund(ein), ausgaben: rund(aus), ergebnis: rund({ eur: ein.eur - aus.eur, jpy: ein.jpy - aus.jpy }) };
  };
  const jahr = heute.slice(0, 4);
  const imJahr = rechne((x) => x.startsWith(jahr));
  return {
    monate: monate.map((x) => ({ monat: x, ...rechne((y) => y === x) })),
    jahr: imJahr,
    // Average of the months of this year so far, the current one included.
    monat_schnitt: { eur: Math.round((imJahr.ergebnis.eur / m) * 100) / 100, jpy: Math.round(imJahr.ergebnis.jpy / m) },
    je_kategorie: Object.entries(
      ausgaben.filter((a) => a.monat.startsWith(jahr)).reduce<Record<string, Summe>>((s, a) => (plus((s[a.kategorie] ??= { eur: 0, jpy: 0 }), a), s), {}),
    ).map(([kategorie, s]) => ({ kategorie, ...rund(s) })),
  };
}
