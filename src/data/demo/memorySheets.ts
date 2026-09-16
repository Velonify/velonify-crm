import { SchemaError } from '../errors';
import type { SheetsApi, SpreadsheetInfo, ValueWrite } from '../sheets/sheetsClient';

interface Tab {
  sheetId: number;
  columnCount: number;
  rows: unknown[][];
  protectedRanges: number;
}

function columnIndex(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function parseRange(range: string) {
  const match = range.match(/^'((?:[^']|'')+)'!([A-Z]*\d*)(?::([A-Z]*\d*))?$/);
  if (!match) throw new Error(`Unsupported range: ${range}`);
  const cell = (ref: string) => {
    const [, col, row] = ref.match(/^([A-Z]*)(\d*)$/)!;
    return { col: col ? columnIndex(col) : undefined, row: row ? Number(row) : undefined };
  };
  const start = cell(match[2]);
  const end = match[3] === undefined ? start : cell(match[3]);
  return {
    tab: match[1].replace(/''/g, "'"),
    startRow: start.row ?? 1,
    startCol: start.col ?? 1,
    endRow: end.row,
    endCol: end.col,
  };
}

const isEmpty = (cell: unknown) => cell === undefined || cell === null || cell === '';

/**
 * In-memory stand-in for the Google Sheets API. Mirrors the behaviour the app relies on (A1 ranges,
 * trailing empty cells omitted, grid column limits), so demo mode and tests run the real storage code.
 */
export class MemorySheets implements SheetsApi {
  private readonly tabs = new Map<string, Tab>();
  private nextSheetId = 1;
  readonly title: string;

  constructor(title = 'CRM-Datenbank (Demo)', initialTabs: string[] = ['Tabelle1']) {
    this.title = title;
    for (const name of initialTabs) this.addTab(name, 26);
  }

  private addTab(name: string, columnCount: number) {
    this.tabs.set(name, { sheetId: this.nextSheetId++, columnCount, rows: [], protectedRanges: 0 });
  }

  private tab(name: string, range: string): Tab {
    const tab = this.tabs.get(name);
    if (!tab) throw new SchemaError(`Tabellenblatt fehlt (${range}). Bitte unter „Einrichtung“ auf „Einrichten“ klicken.`);
    return tab;
  }

  /** Raw access for tests. */
  rows(tab: string): unknown[][] {
    return this.tabs.get(tab)?.rows ?? [];
  }

  async getValues(range: string): Promise<unknown[][]> {
    const { tab: name, startRow, startCol, endRow, endCol } = parseRange(range);
    const tab = this.tab(name, range);
    const rows = tab.rows.slice(startRow - 1, endRow ?? undefined).map((row) => {
      const cells = row.slice(startCol - 1, endCol ?? undefined);
      while (cells.length > 0 && isEmpty(cells[cells.length - 1])) cells.pop();
      return cells;
    });
    while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
    return structuredClone(rows);
  }

  async batchGetValues(ranges: string[]): Promise<unknown[][][]> {
    return Promise.all(ranges.map((range) => this.getValues(range)));
  }

  async updateValues(range: string, values: unknown[][]): Promise<void> {
    const { tab: name, startRow, startCol } = parseRange(range);
    const tab = this.tab(name, range);
    values.forEach((row, i) => {
      if (startCol - 1 + row.length > tab.columnCount) {
        throw new Error(`Range ${range} exceeds grid limits of ${tab.columnCount} columns`);
      }
      const target = (tab.rows[startRow - 1 + i] ??= []);
      row.forEach((cell, j) => (target[startCol - 1 + j] = structuredClone(cell)));
    });
    for (let i = 0; i < tab.rows.length; i++) tab.rows[i] ??= [];
  }

  async batchUpdateValues(data: ValueWrite[]): Promise<void> {
    for (const write of data) await this.updateValues(write.range, write.values);
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
    const { tab: name } = parseRange(range);
    const tab = this.tab(name, range);
    let last = tab.rows.length;
    while (last > 0 && tab.rows[last - 1].every(isEmpty)) last--;
    tab.rows.splice(last, 0, ...structuredClone(values));
  }

  async getSpreadsheet(): Promise<SpreadsheetInfo> {
    return {
      properties: { title: this.title },
      sheets: [...this.tabs.entries()].map(([title, tab]) => ({
        properties: { sheetId: tab.sheetId, title, gridProperties: { columnCount: tab.columnCount } },
        protectedRanges: Array.from({ length: tab.protectedRanges }, (_, i) => ({ protectedRangeId: i + 1 })),
      })),
    };
  }

  async batchUpdate(requests: unknown[]): Promise<void> {
    const byId = (sheetId: number) => [...this.tabs.values()].find((tab) => tab.sheetId === sheetId);
    for (const request of requests as Record<string, any>[]) {
      if (request.addSheet) {
        const { title, gridProperties } = request.addSheet.properties;
        this.addTab(title, gridProperties?.columnCount ?? 26);
      } else if (request.appendDimension) {
        const tab = byId(request.appendDimension.sheetId);
        if (tab && request.appendDimension.dimension === 'COLUMNS') tab.columnCount += request.appendDimension.length;
      } else if (request.addProtectedRange) {
        const tab = byId(request.addProtectedRange.protectedRange.range.sheetId);
        if (tab) tab.protectedRanges++;
      }
      // Formatting requests have no effect on stored values.
    }
  }
}
