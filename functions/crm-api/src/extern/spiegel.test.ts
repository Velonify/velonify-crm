import { describe, expect, it } from 'vitest';
import { testDb } from '../../../../db/test/testDb';
import { PostgresStore } from '../../../../src/data/postgres/postgresStore';
import type { SheetsApi, ValueWrite } from '../../../../src/data/sheets/sheetsClient';
import { schreibeSpiegel, STAND_TAB } from './spiegel';

function fakeSheets() {
  const titel: string[] = ['firmen'];
  const requests: Record<string, unknown>[] = [];
  const werte: ValueWrite[] = [];
  const api: SheetsApi = {
    getValues: async () => [],
    batchGetValues: async () => [],
    updateValues: async () => undefined,
    appendValues: async () => undefined,
    batchUpdateValues: async (d) => void werte.push(...d),
    getSpreadsheet: async () => ({ sheets: titel.map((title, sheetId) => ({ properties: { title, sheetId } })) }),
    batchUpdate: async (r) => {
      for (const x of r as Record<string, { properties: { title: string } }>[]) if (x.addSheet) titel.push(x.addSheet.properties.title);
      requests.push(...(r as Record<string, unknown>[]));
    },
  };
  return { api, titel, requests, werte };
}

describe('Lese-Spiegel', () => {
  it('writes every table with header, adds missing tabs once and empties old values first', async () => {
    const { pool } = await testDb();
    const store = new PostgresStore(pool);
    await store.insert('firmen', [{ id: 'F-1', name: 'Eins', score: 80, archiviert: false } as never]);
    const sheets = fakeSheets();
    const anzahl = await schreibeSpiegel(store, sheets.api, new Date('2026-10-15T22:00:00Z'));
    expect(anzahl).toMatchObject({ firmen: 1, deals: 0 });
    expect(sheets.titel.filter((t) => t === 'firmen')).toHaveLength(1);
    expect(sheets.titel).toContain(STAND_TAB);
    expect(sheets.requests.filter((r) => 'updateCells' in r)).toHaveLength(Object.keys(anzahl).length);
    // Empty tables keep one row below the frozen header, otherwise Google rejects the request.
    const groessen = sheets.requests.flatMap((r) => ('updateSheetProperties' in r ? [(r as { updateSheetProperties: { properties: { gridProperties: { rowCount: number } } } }).updateSheetProperties.properties.gridProperties.rowCount] : []));
    expect(Math.min(...groessen)).toBe(2);
    const firmen = sheets.werte.find((w) => w.range === "'firmen'!A1")!;
    expect(firmen.values[0][0]).toBe('id');
    expect(firmen.values[1].slice(0, 2)).toEqual(['F-1', 'Eins']);
    expect(firmen.values[1]).toContain(80);
    expect(sheets.werte.at(-1)!.values[1]).toEqual(['Stand', '2026-10-15T22:00:00.000Z']);
  });
});
