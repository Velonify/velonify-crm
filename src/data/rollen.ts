import type { TabName } from './schema';
import type { Einstellungen } from './types';

/**
 * Employees see everything except money: no offer tool (offers, calculation, catalogue), no deal values,
 * no prices. Who is an employee lives in "einstellungen" under this key (comma-separated addresses);
 * only the admins may change it (crm-api checks).
 */
export const MITARBEITER_SCHLUESSEL = 'rolle_mitarbeiter';

/** Tools employees do not get. */
export const NUR_GRUENDER_WERKZEUGE = ['angebote'];

/** Tables employees can neither read nor write. */
export const GESPERRTE_TABS: readonly TabName[] = ['angebote', 'leistungen', 'leistungskategorien'];

/** Columns with amounts: empty for employees when reading, ignored when they write. */
export const GELD_SPALTEN: Partial<Record<TabName, readonly string[]>> = {
  deals: ['wert_eur'],
  social_werte: ['angebote_wert_eur'],
};

export function mitarbeiterListe(wert: string | null | undefined): string[] {
  return (wert ?? '')
    .split(/[,\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes('@'));
}

export function istMitarbeiter(einstellungen: Einstellungen | undefined, email: string): boolean {
  return !!email && mitarbeiterListe(einstellungen?.[MITARBEITER_SCHLUESSEL]).includes(email.trim().toLowerCase());
}

/** The record with its amount columns emptied (reading) – unknown tables come back unchanged. */
export function ohneGeld<T>(tab: TabName, record: T): T {
  const spalten = GELD_SPALTEN[tab];
  if (!spalten) return record;
  const kopie = { ...(record as Record<string, unknown>) };
  for (const spalte of spalten) if (spalte in kopie) kopie[spalte] = null;
  return kopie as T;
}

/** The changes without amount columns (writing), so an employee's save keeps the stored value. */
export function ohneGeldAenderung<T>(tab: TabName, aenderung: T): T {
  const spalten = GELD_SPALTEN[tab];
  if (!spalten) return aenderung;
  const kopie = { ...(aenderung as Record<string, unknown>) };
  for (const spalte of spalten) delete kopie[spalte];
  return kopie as T;
}
