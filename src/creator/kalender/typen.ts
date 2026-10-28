/**
 * Calendar with deadlines (Punkte 2, 27, 29): shared by the hub and crm-api (functions/crm-api/src/creator/organisation.ts).
 * Rows live in the shared table fristen (migration 015); other modules write theirs with their own `quelle`.
 */

export const FRIST_ARTEN = [
  { id: 'upload', label: 'Upload' },
  { id: 'dreh', label: 'Drehtag' },
  { id: 'kampagne', label: 'Kampagne' },
  { id: 'abgabe', label: 'Abgabe' },
  { id: 'kooperation', label: 'Kooperation' },
  { id: 'buchhaltung', label: 'Buchhaltung' },
  { id: 'gk', label: 'GK-Formalien' },
  { id: 'sonstiges', label: 'Sonstiges' },
] as const;

export type FristArt = (typeof FRIST_ARTEN)[number]['id'];

export const istFristArt = (wert: unknown): wert is FristArt => typeof wert === 'string' && FRIST_ARTEN.some((a) => a.id === wert);
export const artLabel = (id: string) => FRIST_ARTEN.find((a) => a.id === id)?.label ?? id;

export const RHYTHMEN = [
  { id: 'monatlich', label: 'Monatlich', monate: 1 },
  { id: 'quartalsweise', label: 'Quartalsweise', monate: 3 },
  { id: 'jaehrlich', label: 'Jährlich', monate: 12 },
] as const;

export type Rhythmus = (typeof RHYTHMEN)[number]['id'];

export const istRhythmus = (wert: unknown): wert is Rhythmus => typeof wert === 'string' && RHYTHMEN.some((r) => r.id === wert);
export const rhythmusLabel = (id: string) => RHYTHMEN.find((r) => r.id === id)?.label ?? id;

/** Deadlines the calendar maintains itself; all others belong to a module and are edited there. */
export const EIGENE_QUELLEN = ['manuell', 'serie'] as const;
export const istEigeneQuelle = (quelle: string) => (EIGENE_QUELLEN as readonly string[]).includes(quelle);

/** Name of the module behind a deadline, for "edit in …". */
export const QUELLEN: Record<string, string> = {
  manuell: 'Kalender',
  serie: 'Serie',
  inhalt: 'Content-Plan',
  kooperation: 'Kooperationen',
  pipeline: 'Kooperations-Pipeline',
  bericht: 'Analytics',
  einnahme: 'Einnahmen',
};
export const quelleLabel = (quelle: string) => QUELLEN[quelle] ?? quelle;

export interface Frist {
  id: string;
  titel: string;
  datum: string;
  /** "HH:MM" or empty (all day). */
  uhrzeit: string;
  art: string;
  quelle: string;
  bezug_id: string;
  /** Hub path to the origin (e.g. /content/…) or an external address. */
  link: string;
  zustaendig: string;
  notiz: string;
  erledigt: boolean;
  archiviert: boolean;
  /** Only for quelle = serie. */
  serie_id: string;
  /** Changed or skipped on its own, so edits of the series leave it alone. */
  abweichend: boolean;
  geaendert_am: string;
  geaendert_von: string;
}

export interface FristSerie {
  id: string;
  titel: string;
  art: string;
  rhythmus: Rhythmus;
  start: string;
  ende: string;
  uhrzeit: string;
  zustaendig: string;
  notiz: string;
  link: string;
  archiviert: boolean;
  /** Next open date of the series, empty when none is left. */
  naechster: string;
}

export type AboUmfang = 'alle' | 'meine';

export interface KalenderAbo {
  token: string;
  umfang: AboUmfang;
  erstellt_am: string;
  abgerufen_am: string;
}

export const istUhrzeit = (wert: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(wert);
export const istDatum = (wert: unknown): wert is string => typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert) && !Number.isNaN(Date.parse(`${wert}T00:00:00Z`)) && new Date(`${wert}T00:00:00Z`).toISOString().startsWith(wert);

const tageImMonat = (jahr: number, monat0: number) => new Date(Date.UTC(jahr, monat0 + 1, 0)).getUTCDate();

/** The n-th date of a series: n·step months after the start, on the start's day or the month's last day. */
export function serienDatum(start: string, rhythmus: Rhythmus, n: number): string {
  const [j, m, t] = start.split('-').map(Number);
  const schritt = RHYTHMEN.find((r) => r.id === rhythmus)!.monate;
  const gesamt = m - 1 + n * schritt;
  const jahr = j + Math.floor(gesamt / 12);
  const monat0 = ((gesamt % 12) + 12) % 12;
  const tag = Math.min(t, tageImMonat(jahr, monat0));
  return `${jahr}-${String(monat0 + 1).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/** All dates of a series from `ab` to `bis` (inclusive), respecting its end. */
export function serienDaten(serie: { start: string; rhythmus: Rhythmus; ende?: string | null }, ab: string, bis: string): string[] {
  const grenze = serie.ende && serie.ende < bis ? serie.ende : bis;
  const daten: string[] = [];
  for (let n = 0; n < 1200; n++) {
    const d = serienDatum(serie.start, serie.rhythmus, n);
    if (d > grenze) break;
    if (d >= ab) daten.push(d);
  }
  return daten;
}

/**
 * Templates for recurring deadlines of bookkeeping and the GK. They only fill the form: the actual dates are set by the
 * accountants and the tax advisor (Konzept, Abgrenzung: structure, no advice).
 */
export const SERIEN_VORLAGEN: { titel: string; art: FristArt; rhythmus: Rhythmus; notiz: string }[] = [
  { titel: 'Belege an die Buchhaltung', art: 'buchhaltung', rhythmus: 'monatlich', notiz: 'Belege des Vormonats in Ablage › Buchhaltung › Belege legen und Bescheid geben.' },
  { titel: 'Einnahmen und Rechnungen abgleichen', art: 'buchhaltung', rhythmus: 'monatlich', notiz: 'Offene Zahlungen der Kooperationen mit den Rechnungen der Buchhaltung abgleichen.' },
  { titel: 'Abstimmung mit dem Steuerberater', art: 'buchhaltung', rhythmus: 'quartalsweise', notiz: 'Termin und Unterlagen legt der Steuerberater fest.' },
  { titel: 'Unterlagen für den Jahresabschluss', art: 'buchhaltung', rhythmus: 'jaehrlich', notiz: 'Was gebraucht wird, sagt der Steuerberater; Datum mit ihm abstimmen.' },
  { titel: 'GK: Jahresformalien', art: 'gk', rhythmus: 'jaehrlich', notiz: 'Fristen der Gesellschaft laut Steuerberater, z. B. Abschluss, Erklärungen, Beschlüsse.' },
  { titel: 'GK: Unterlagen prüfen und ablegen', art: 'gk', rhythmus: 'quartalsweise', notiz: 'Neue Unterlagen der Gesellschaft in Ablage › Gesellschaft (Formalien) ablegen.' },
];
