import { PHASEN, STATUS } from './constants';
import { SCHEMA, type TabName } from './schema';
import { rowToRecord } from './sheets/rows';
import { quoteTab, type SheetsApi } from './sheets/sheetsClient';

/**
 * One-time move from the sheet to Postgres: read every tab raw (as the app understands it), check what would get lost
 * or looks broken, and hand clean rows to crm-api. Runs in the browser with the signed-in person's Google token.
 */

export type Zeile = Record<string, string | number | boolean | null>;

export interface TabAbzug {
  tab: TabName;
  vorhanden: boolean;
  zeilen: Zeile[];
  /** Rows without id are invisible in the app as well; they are counted, not moved. */
  ohneId: number;
  /** Columns someone added by hand; Postgres has no place for them. */
  zusatzSpalten: string[];
  /** Ids that appear more than once; the first row wins, like SheetStore.update. */
  doppelteIds: string[];
}

export type SheetAbzug = TabAbzug[];

const TABS = Object.keys(SCHEMA) as TabName[];
const SCHLUESSEL: Partial<Record<TabName, (z: Zeile) => string>> = {
  listen: (z) => `${String(z.liste ?? '').trim()}\u0000${String(z.wert ?? '').trim()}`,
  einstellungen: (z) => String(z.schluessel ?? '').trim(),
};
const schluessel = (tab: TabName, zeile: Zeile) => (SCHLUESSEL[tab] ?? ((z: Zeile) => String(z.id ?? '').trim()))(zeile);

export async function liesSheet(api: SheetsApi): Promise<SheetAbzug> {
  const info = await api.getSpreadsheet();
  const vorhanden = new Set(info.sheets?.map((s) => s.properties.title));
  const zuLesen = TABS.filter((tab) => vorhanden.has(tab));
  const werte = zuLesen.length ? await api.batchGetValues(zuLesen.map((tab) => `${quoteTab(tab)}!A1:ZZ`)) : [];
  return TABS.map((tab) => {
    const i = zuLesen.indexOf(tab);
    if (i < 0) return { tab, vorhanden: false, zeilen: [], ohneId: 0, zusatzSpalten: [], doppelteIds: [] };
    const schema = SCHEMA[tab];
    const [kopfzeile = [], ...rows] = werte[i];
    const kopf = kopfzeile.map((zelle) => String(zelle ?? '').trim());
    const alle = rows.map((row) => rowToRecord(schema, kopf, row) as Zeile);
    const gesehen = new Set<string>();
    const doppelt = new Set<string>();
    const zeilen: Zeile[] = [];
    let ohneId = 0;
    for (const zeile of alle) {
      const key = schluessel(tab, zeile);
      if (!key || key === '\u0000') {
        // Empty rows at the end of a tab are normal; only rows with content count.
        if (Object.values(zeile).some((v) => v !== '' && v !== null && v !== false)) ohneId++;
        continue;
      }
      if (gesehen.has(key)) {
        doppelt.add(key);
        continue;
      }
      gesehen.add(key);
      zeilen.push(zeile);
    }
    return {
      tab,
      vorhanden: true,
      zeilen,
      ohneId,
      zusatzSpalten: kopf.filter((spalte) => spalte && !(schema.columns as readonly string[]).includes(spalte)),
      doppelteIds: [...doppelt],
    };
  });
}

export interface Befund {
  tab: TabName;
  art: 'fehlt' | 'ohne_id' | 'doppelt' | 'zusatzspalte' | 'verweis' | 'domain' | 'wert';
  text: string;
}

/** Verweise, die auf eine andere Tabelle zeigen. Leere Werte sind erlaubt. */
const VERWEISE: [TabName, string, TabName][] = [
  ['kontakte', 'firma_id', 'firmen'],
  ['deals', 'firma_id', 'firmen'],
  ['deals', 'kontakt_id', 'kontakte'],
  ['aktivitaeten', 'firma_id', 'firmen'],
  ['aktivitaeten', 'deal_id', 'deals'],
  ['wiedervorlagen', 'firma_id', 'firmen'],
  ['wiedervorlagen', 'deal_id', 'deals'],
  ['angebote', 'firma_id', 'firmen'],
  ['angebote', 'deal_id', 'deals'],
  ['anschreiben', 'firma_id', 'firmen'],
  ['audits', 'firma_id', 'firmen'],
  ['aufgaben', 'board_id', 'boards'],
  ['aufgaben_kommentare', 'aufgabe_id', 'aufgaben'],
  ['boards', 'firma_id', 'firmen'],
  ['portal_zugaenge', 'kontakt_id', 'kontakte'],
];

/** What the move cannot keep or what is broken already. Nothing here blocks the move; it is the list to look at. */
export function pruefbericht(abzug: SheetAbzug): Befund[] {
  const befunde: Befund[] = [];
  const nach = new Map(abzug.map((t) => [t.tab, t]));
  for (const t of abzug) {
    if (!t.vorhanden) {
      befunde.push({ tab: t.tab, art: 'fehlt', text: 'Tabellenblatt gibt es nicht, die Tabelle bleibt leer.' });
      continue;
    }
    if (t.ohneId) befunde.push({ tab: t.tab, art: 'ohne_id', text: `${t.ohneId} Zeilen ohne ID werden nicht übernommen.` });
    if (t.doppelteIds.length) befunde.push({ tab: t.tab, art: 'doppelt', text: `Doppelte IDs, nur die erste Zeile wird übernommen: ${t.doppelteIds.join(', ')}` });
    if (t.zusatzSpalten.length) befunde.push({ tab: t.tab, art: 'zusatzspalte', text: `Eigene Spalten fallen weg: ${t.zusatzSpalten.join(', ')}` });
  }
  for (const [tab, spalte, ziel] of VERWEISE) {
    const ids = new Set(nach.get(ziel)?.zeilen.map((z) => String(z.id)));
    const offen = nach.get(tab)?.zeilen.filter((z) => z[spalte] && !ids.has(String(z[spalte]))) ?? [];
    if (offen.length) befunde.push({ tab, art: 'verweis', text: `${offen.length}× ${spalte} zeigt ins Leere (${offen.slice(0, 5).map((z) => z.id).join(', ')}${offen.length > 5 ? ', …' : ''})` });
  }
  const domains = new Map<string, string[]>();
  for (const f of nach.get('firmen')?.zeilen ?? []) {
    const domain = String(f.domain ?? '').trim().toLowerCase();
    if (domain && !f.archiviert) domains.set(domain, [...(domains.get(domain) ?? []), String(f.id)]);
  }
  for (const [domain, ids] of domains) if (ids.length > 1) befunde.push({ tab: 'firmen', art: 'domain', text: `Domain ${domain} mehrfach: ${ids.join(', ')}` });
  const phasen = new Set<string>(PHASEN);
  const unbekannt = nach.get('deals')?.zeilen.filter((d) => !phasen.has(String(d.phase))) ?? [];
  if (unbekannt.length) befunde.push({ tab: 'deals', art: 'wert', text: `${unbekannt.length} Deals mit unbekannter Phase (${unbekannt.slice(0, 5).map((d) => `${d.id}: „${d.phase}“`).join(', ')})` });
  const status = new Set<string>(STATUS);
  const ohneStatus = nach.get('firmen')?.zeilen.filter((f) => f.status && !status.has(String(f.status))) ?? [];
  if (ohneStatus.length) befunde.push({ tab: 'firmen', art: 'wert', text: `${ohneStatus.length} Firmen mit unbekanntem Status (${ohneStatus.slice(0, 5).map((f) => `${f.id}: „${f.status}“`).join(', ')})` });
  return befunde;
}

/** Splits rows into requests of a size the function and Postgres' parameter limit handle comfortably. */
export function inPaketen<T>(zeilen: T[], groesse = 400): T[][] {
  const pakete: T[][] = [];
  for (let i = 0; i < zeilen.length; i += groesse) pakete.push(zeilen.slice(i, i + groesse));
  return pakete;
}
