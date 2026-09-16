import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, DuplicateError, SchemaError, ValidationError } from '../errors';
import { extractDriveFolderId, normalizeDomain, prepareFirma } from '../firmen';
import { SCHEMA } from '../schema';
import type { Firma } from '../types';
import { columnLetter, recordToRow, rowToRecord } from './rows';
import { runSetup } from './setup';
import type { SheetsApi, SpreadsheetInfo } from './sheetsClient';
import { SheetsRepository } from './sheetsRepository';

/** In-memory stand-in for the Google Sheets API, enough for tables and setup. */
class FakeSheets implements SheetsApi {
  tabs = new Map<string, unknown[][]>();
  protectedTabs = new Set<string>();
  writes: string[] = [];

  private parse(range: string) {
    const match = range.match(/^'(.+)'!([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/)!;
    return { tab: match[1], startRow: match[3] ? Number(match[3]) : 1 };
  }

  async getValues(range: string) {
    const { tab, startRow } = this.parse(range);
    const rows = this.tabs.get(tab);
    if (!rows) throw new Error(`Unable to parse range: ${range}`);
    if (range.endsWith('!1:1')) return rows.slice(0, 1).map((r) => [...r]);
    if (/!A2:[AB]$/.test(range)) return rows.slice(1).map((r) => [...r]);
    return rows.slice(startRow - 1).map((r) => [...r]);
  }

  async updateValues(range: string, values: unknown[][]) {
    this.writes.push(range);
    const { tab, startRow } = this.parse(range);
    const rows = this.tabs.get(tab)!;
    const startCol = range.match(/!([A-Z]+)/)![1].charCodeAt(0) - 65;
    values.forEach((row, i) => {
      const target = (rows[startRow - 1 + i] ??= []);
      row.forEach((cell, j) => (target[startCol + j] = cell));
    });
  }

  async appendValues(range: string, values: unknown[][]) {
    this.tabs.get(this.parse(range).tab)!.push(...values.map((r) => [...r]));
  }

  async getSpreadsheet(): Promise<SpreadsheetInfo> {
    return {
      properties: { title: 'CRM-Datenbank' },
      sheets: [...this.tabs.keys()].map((title, sheetId) => ({
        properties: { sheetId, title, gridProperties: { columnCount: 26 } },
        protectedRanges: this.protectedTabs.has(title) ? [{ protectedRangeId: 1 }] : [],
      })),
    };
  }

  async batchUpdate(requests: unknown[]) {
    const titles = [...this.tabs.keys()];
    for (const request of requests as Record<string, any>[]) {
      if (request.addSheet) this.tabs.set(request.addSheet.properties.title, []);
      if (request.addProtectedRange) this.protectedTabs.add(titles[request.addProtectedRange.protectedRange.range.sheetId]);
    }
  }
}

const firma = (overrides: Partial<Firma>): Firma => ({
  id: 'F-1', name: 'Test', domain: '', kuerzel: '', status: 'lead', tier: '', score: null, plattform: '', version: '',
  eol: '', ort: '', register: '', ust_id: '', email_allgemein: '', telefon_allgemein: '', tech_info: '', quelle: '',
  zustaendig: '', drive_ordner_id: '', slack_channel: '', trello_url: '', notiz: '', archiviert: false,
  erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '', ...overrides,
});

describe('rows', () => {
  it('converts column numbers to letters', () => {
    expect([1, 26, 27, 52, 703].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
  });

  it('reads by header name regardless of column order', () => {
    const header = ['name', 'score', 'id', 'archiviert'];
    const record = rowToRecord(SCHEMA.firmen, header, ['Shop GmbH', '87', 'F-9', true]);
    expect(record).toMatchObject({ id: 'F-9', name: 'Shop GmbH', score: 87, archiviert: true, domain: '' });
  });

  it('keeps values of columns the app does not know', () => {
    const header = ['id', 'eigene_spalte', 'name'];
    const row = recordToRow(SCHEMA.firmen, header, { id: 'F-1', name: 'Neu' }, ['F-1', 'Notiz von Hand', 'Alt']);
    expect(row).toEqual(['F-1', 'Notiz von Hand', 'Neu']);
  });
});

describe('prepareFirma', () => {
  const alle = [firma({ id: 'F-1', name: 'Shop GmbH', domain: 'shop.de', kuerzel: 'SB' })];

  it('normalizes domain, Kürzel and Drive links', () => {
    expect(normalizeDomain(' https://www.Shop.de/impressum ')).toBe('shop.de');
    expect(extractDriveFolderId('https://drive.google.com/drive/folders/abc_123-X?usp=sharing')).toBe('abc_123-X');
    expect(prepareFirma({ kuerzel: ' abc ', slack_channel: '#client-abc-general' }, alle)).toEqual({
      kuerzel: 'ABC',
      slack_channel: 'client-abc-general',
    });
  });

  it('rejects duplicate domains and Kürzel, but not on the firm itself', () => {
    expect(() => prepareFirma({ domain: 'www.shop.de' }, alle)).toThrow(DuplicateError);
    expect(() => prepareFirma({ kuerzel: 'sb' }, alle)).toThrow(DuplicateError);
    expect(() => prepareFirma({ domain: 'shop.de', kuerzel: 'SB' }, alle, 'F-1')).not.toThrow();
  });

  it('validates Kürzel format and required name', () => {
    expect(() => prepareFirma({ kuerzel: 'ABCD' }, alle)).toThrow(ValidationError);
    expect(() => prepareFirma({ name: '  ' }, alle)).toThrow(ValidationError);
  });
});

describe('SheetsRepository', () => {
  let sheets: FakeSheets;
  let repo: SheetsRepository;

  beforeEach(async () => {
    sheets = new FakeSheets();
    sheets.tabs.set('Tabelle1', []);
    await runSetup(sheets);
    repo = new SheetsRepository(sheets, () => 'lugge@velonify.de');
  });

  it('setup creates every tab with its columns, protection and default lists', async () => {
    for (const tab of Object.values(SCHEMA)) {
      expect(sheets.tabs.get(tab.name)![0]).toEqual(tab.columns);
      expect(sheets.protectedTabs.has(tab.name)).toBe(true);
    }
    expect((await repo.getListen()).phase).toContain('angebot');
  });

  it('setup is repeatable and only appends missing columns', async () => {
    sheets.tabs.get('firmen')![0] = ['id', 'name', 'eigene_spalte'];
    await runSetup(sheets);
    const header = sheets.tabs.get('firmen')![0];
    expect(header.slice(0, 3)).toEqual(['id', 'name', 'eigene_spalte']);
    expect(header).toHaveLength(SCHEMA.firmen.columns.length + 1);
    expect(sheets.tabs.get('listen')!.length).toBe(1 + Object.values((await repo.getListen())).flat().length);
  });

  it('creates and reads a firm', async () => {
    const created = await repo.createFirma({ ...firma({}), name: 'Neu GmbH', domain: 'https://neu.de/' });
    expect(created.id).toMatch(/^F-[2-9A-Z]{8}$/);
    expect(created.erstellt_von).toBe('lugge@velonify.de');
    expect(await repo.getFirma(created.id)).toMatchObject({ name: 'Neu GmbH', domain: 'neu.de' });
  });

  it('updates the right row after rows were re-sorted by hand', async () => {
    const a = await repo.createFirma({ ...firma({}), name: 'A' });
    const b = await repo.createFirma({ ...firma({}), name: 'B' });
    const rows = sheets.tabs.get('firmen')!;
    [rows[1], rows[2]] = [rows[2], rows[1]];

    await repo.updateFirma(a.id, { ort: 'Berlin' }, a.geaendert_am);

    expect((await repo.getFirma(a.id)).ort).toBe('Berlin');
    expect((await repo.getFirma(b.id)).ort).toBe('');
  });

  it('refuses to overwrite a newer change', async () => {
    const a = await repo.createFirma({ ...firma({}), name: 'A' });
    await new Promise((r) => setTimeout(r, 2));
    await repo.updateFirma(a.id, { ort: 'Köln' }, a.geaendert_am);
    await expect(repo.updateFirma(a.id, { ort: 'Bonn' }, a.geaendert_am)).rejects.toThrow(ConflictError);
  });

  it('explains a missing tab', async () => {
    sheets.tabs.set('firmen', []);
    await expect(repo.listFirmen({ fresh: true })).rejects.toThrow(SchemaError);
  });
});
