import { SCHEMA, type TabName } from '../../../../src/data/schema';
import { quoteTab, type SheetsApi } from '../../../../src/data/sheets/sheetsClient';
import type { PostgresStore } from '../../../../src/data/postgres/postgresStore';

/**
 * Nightly copy of every table into a Google Sheet the team may only read (decision of 15.10.2026): for quick looks,
 * pivots and as an extra backup. Same tabs and columns as the old CRM sheet, so the copy could also serve as the way
 * back. Written by crm-api's service account, which needs edit access to that one sheet.
 */
export const STAND_TAB = '_stand';

const zelle = (wert: unknown) => (wert === null || wert === undefined ? '' : typeof wert === 'number' || typeof wert === 'boolean' ? wert : String(wert));

export async function schreibeSpiegel(store: PostgresStore, sheets: SheetsApi, jetzt = new Date()): Promise<Record<string, number>> {
  const tabs = Object.keys(SCHEMA) as TabName[];
  const daten = await Promise.all(tabs.map((tab) => store.ladeTabelle(tab)));

  // Missing tabs first, then one request that sizes every tab and empties it. At least two rows: Google refuses a tab
  // that would consist of the frozen header row alone (empty tables).
  const vorhanden = new Map((await sheets.getSpreadsheet()).sheets?.map((s) => [s.properties.title, s.properties.sheetId]));
  const fehlend = [...tabs, STAND_TAB].filter((tab) => !vorhanden.has(tab));
  if (fehlend.length) {
    await sheets.batchUpdate(fehlend.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })));
    for (const s of (await sheets.getSpreadsheet()).sheets ?? []) vorhanden.set(s.properties.title, s.properties.sheetId);
  }
  await sheets.batchUpdate(
    tabs.flatMap((tab, i) => {
      const sheetId = vorhanden.get(tab)!;
      return [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: Math.max(daten[i].length + 1, 2), columnCount: SCHEMA[tab].columns.length } }, fields: 'gridProperties(rowCount,columnCount)' } },
        { updateCells: { range: { sheetId }, fields: 'userEnteredValue' } },
      ];
    }),
  );

  const anzahl: Record<string, number> = {};
  await sheets.batchUpdateValues([
    ...tabs.map((tab, i) => {
      const spalten = SCHEMA[tab].columns as readonly string[];
      anzahl[tab] = daten[i].length;
      return { range: `${quoteTab(tab)}!A1`, values: [[...spalten], ...daten[i].map((z) => spalten.map((s) => zelle(z[s])))] };
    }),
    {
      range: `${quoteTab(STAND_TAB)}!A1`,
      values: [
        ['Kopie der CRM-Datenbank (Postgres), nur zum Lesen. Änderungen im Hub unter Einrichtung → Daten.'],
        ['Stand', jetzt.toISOString()],
      ],
    },
  ]);
  return anzahl;
}
