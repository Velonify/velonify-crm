import { type TabSchema, ANGEBOTS_TABS, AUDIT_TABS, CONTACT_TABS, EINGANG_TABS, ENTITY_TABS, KUNDEN_TABS, MAGNET_TABS, MONSTERA_TABS, PORTAL_TABS, SCHEMA, SOCIAL_TABS, TODO_TABS, ERWAEHNUNGEN_TABS, WORDLE_TABS, type TabName } from './schema';

/** Rules of the data view (Einrichtung → Daten): which tables, which fields may be edited, search, CSV, undo. */

export type Datensatz = Record<string, string | number | boolean | null>;

export const TABELLEN_GRUPPEN: { titel: string; tabs: readonly TabName[] }[] = [
  { titel: 'CRM', tabs: ENTITY_TABS },
  { titel: 'Einstellungen', tabs: ['listen', 'einstellungen'] },
  { titel: 'Angebote', tabs: ANGEBOTS_TABS },
  { titel: 'Contact Generator', tabs: CONTACT_TABS },
  { titel: 'Shop-Audit', tabs: AUDIT_TABS },
  { titel: 'Anfragen', tabs: EINGANG_TABS },
  { titel: 'Lead-Magnete', tabs: MAGNET_TABS },
  { titel: 'Social Media', tabs: SOCIAL_TABS },
  { titel: 'Kunden und To-dos', tabs: [...KUNDEN_TABS, ...TODO_TABS, ...ERWAEHNUNGEN_TABS, ...PORTAL_TABS] },
  { titel: 'Team-Spiele', tabs: [...WORDLE_TABS, ...MONSTERA_TABS] },
];

export const istTabelle = (name: string | undefined): name is TabName => !!name && name in SCHEMA;

/** Ids and the meta columns are set by the app; listen and einstellungen have their own editors. */
const FEST = new Set(['id', 'erstellt_am', 'erstellt_von', 'geaendert_am', 'geaendert_von']);
export const istEditierbar = (tab: TabName, spalte: string) => !FEST.has(spalte) && tab !== 'listen' && tab !== 'einstellungen';
export const hatArchiv = (tab: TabName) => (SCHEMA[tab].columns as readonly string[]).includes('archiviert');
export const hatKonfliktpruefung = (tab: TabName) => (SCHEMA[tab].columns as readonly string[]).includes('geaendert_am');

/** Whole-word search over every column, case-insensitive; archived rows only when asked for. */
export function filtere(tab: TabName, zeilen: Datensatz[], suche: string, archivierteZeigen: boolean): Datensatz[] {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  return zeilen.filter((z) => {
    if (hatArchiv(tab) && z.archiviert === true && !archivierteZeigen) return false;
    if (woerter.length === 0) return true;
    const text = Object.values(z).map((v) => String(v ?? '')).join(' ').toLowerCase();
    return woerter.every((w) => text.includes(w));
  });
}

export function sortiere(zeilen: Datensatz[], spalte: string | null, absteigend: boolean): Datensatz[] {
  if (!spalte) return zeilen;
  const richtung = absteigend ? -1 : 1;
  return [...zeilen].sort((a, b) => {
    const x = a[spalte];
    const y = b[spalte];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * richtung;
    return String(x ?? '').localeCompare(String(y ?? ''), 'de', { numeric: true }) * richtung;
  });
}

/** CSV for Excel in German: semicolon, quotes doubled, BOM so umlauts survive. */
export function alsCsv(spalten: readonly string[], zeilen: Datensatz[]): string {
  const zelle = (wert: unknown) => {
    const text = wert === null || wert === undefined ? '' : String(wert);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${[spalten.join(';'), ...zeilen.map((z) => spalten.map((s) => zelle(z[s])).join(';'))].join('\r\n')}`;
}

/** Changes of a form against the stored record, with the values typed like the table expects. */
export function aenderungenAus(tab: TabName, vorher: Datensatz, formular: Record<string, string | boolean>): Datensatz {
  const schema: TabSchema = SCHEMA[tab];
  const aenderungen: Datensatz = {};
  for (const spalte of schema.columns) {
    if (!istEditierbar(tab, spalte) || !(spalte in formular)) continue;
    const roh = formular[spalte];
    let wert: string | number | boolean | null;
    if (schema.boolean?.includes(spalte)) wert = roh === true;
    else if (schema.numeric?.includes(spalte)) wert = String(roh).trim() === '' ? null : Number(String(roh).replace(',', '.'));
    else wert = String(roh);
    if (typeof wert === 'number' && !Number.isFinite(wert)) throw new Error(`„${spalte}“ muss eine Zahl sein.`);
    if (wert !== vorher[spalte]) aenderungen[spalte] = wert;
  }
  return aenderungen;
}

/** Undoing one logged update: the columns it changed go back to their old values (meta columns excluded). */
export function rueckgaengig(tab: TabName, vorher: Record<string, unknown> | null, nachher: Record<string, unknown>): Datensatz {
  if (!vorher) return {};
  const aenderungen: Datensatz = {};
  for (const spalte of SCHEMA[tab].columns) {
    if (!istEditierbar(tab, spalte)) continue;
    if (JSON.stringify(vorher[spalte] ?? null) !== JSON.stringify(nachher[spalte] ?? null)) aenderungen[spalte] = (vorher[spalte] ?? null) as Datensatz[string];
  }
  return aenderungen;
}
