import { ValidationError } from './errors';
import type { Katalog, Leistung, LeistungInput, Leistungskategorie, LeistungskategorieInput } from './types';

export type Sprache = 'de' | 'en';
export const SPRACHEN: { wert: Sprache; label: string }[] = [
  { wert: 'de', label: 'Deutsch' },
  { wert: 'en', label: 'English' },
];

export const ABRECHNUNGEN = [
  { wert: 'einmalig', label: 'Einmalig' },
  { wert: 'monatlich', label: 'Monatlich' },
] as const;

type Zweisprachig<F extends string> = Record<`${F}_de` | `${F}_en`, string>;

/** Text in the requested language; English falls back to German so nothing is ever blank. */
export function inSprache<F extends string>(item: Zweisprachig<F>, feld: F, sprache: Sprache): string {
  const de = item[`${feld}_de`];
  return sprache === 'en' ? item[`${feld}_en`] || de : de;
}

export const fehltEnglisch = (item: { titel_en: string }) => !item.titel_en.trim();

const nachSortierung = <T extends { sortierung: number | null; titel_de: string }>(a: T, b: T) =>
  (a.sortierung ?? Number.MAX_SAFE_INTEGER) - (b.sortierung ?? Number.MAX_SAFE_INTEGER) || a.titel_de.localeCompare(b.titel_de, 'de');

export interface KategorieMitLeistungen {
  kategorie: Leistungskategorie;
  leistungen: Leistung[];
}

/** Categories in catalogue order, each with its sub-items. Archived entries only on request. */
export function katalogBaum(katalog: Katalog, mitArchivierten = false): KategorieMitLeistungen[] {
  const sichtbar = <T extends { archiviert: boolean }>(item: T) => mitArchivierten || !item.archiviert;
  return katalog.kategorien
    .filter(sichtbar)
    .sort(nachSortierung)
    .map((kategorie) => ({
      kategorie,
      leistungen: katalog.leistungen.filter((l) => l.kategorie_id === kategorie.id && sichtbar(l)).sort(nachSortierung),
    }));
}

/** Next free position at the end of a list, in steps of 10 so entries can later go in between. */
export const naechsteSortierung = (items: readonly { sortierung: number | null }[]) =>
  items.reduce((max, item) => Math.max(max, item.sortierung ?? 0), 0) + 10;

/**
 * Moves one entry up (-1) or down (+1) within its list and returns the sort values that change.
 * Renumbers the whole list in steps of 10, which also repairs gaps or duplicates left by hand edits in the sheet.
 */
export function verschiebe<T extends { id: string; sortierung: number | null; titel_de: string }>(
  items: readonly T[],
  id: string,
  richtung: -1 | 1,
): { id: string; sortierung: number }[] {
  const liste = [...items].sort(nachSortierung);
  const index = liste.findIndex((item) => item.id === id);
  const ziel = index + richtung;
  if (index < 0 || ziel < 0 || ziel >= liste.length) return [];
  [liste[index], liste[ziel]] = [liste[ziel], liste[index]];
  return liste.map((item, i) => ({ id: item.id, sortierung: (i + 1) * 10 })).filter((neu, i) => liste[i].sortierung !== neu.sortierung);
}

function trim<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as T;
}

export function prepareKategorie(input: LeistungskategorieInput): LeistungskategorieInput {
  const clean = trim(input);
  if (!clean.titel_de) throw new ValidationError('titel_de', 'Bitte einen deutschen Titel angeben.');
  if (!ABRECHNUNGEN.some((a) => a.wert === clean.abrechnung)) throw new ValidationError('abrechnung', 'Abrechnung: einmalig oder monatlich.');
  return clean;
}

export function prepareLeistung(input: LeistungInput): LeistungInput {
  const clean = trim(input);
  if (!clean.kategorie_id) throw new ValidationError('kategorie_id', 'Bitte eine Hauptkategorie wählen.');
  if (!clean.titel_de) throw new ValidationError('titel_de', 'Bitte einen deutschen Titel angeben.');
  return clean;
}
