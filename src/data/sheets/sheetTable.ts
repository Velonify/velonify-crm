import { ConflictError, NotFoundError, SchemaError } from '../errors';
import type { TabSchema } from '../schema';
import { columnLetter, recordToRow, rowToRecord } from './rows';
import { quoteTab, type SheetsApi } from './sheetsClient';

interface Snapshot {
  loadedAt: number;
  header: string[];
  rows: unknown[][];
}

interface Row {
  id: string;
  geaendert_am?: string;
}

/**
 * One tab of the CRM sheet. Rows are always located by their `id` column, never by a remembered row number,
 * so sorting or inserting rows by hand in the sheet cannot make the app write into the wrong row.
 */
export class SheetTable<T extends Row> {
  private readonly api: SheetsApi;
  private readonly schema: TabSchema;
  private readonly cacheMs: number;
  private snapshot: Snapshot | null = null;

  constructor(api: SheetsApi, schema: TabSchema, cacheMs = 30_000) {
    this.api = api;
    this.schema = schema;
    this.cacheMs = cacheMs;
  }

  private async load(fresh = false): Promise<Snapshot> {
    if (!fresh && this.snapshot && Date.now() - this.snapshot.loadedAt < this.cacheMs) return this.snapshot;
    const [headerRow = [], ...rows] = await this.api.getValues(`${quoteTab(this.schema.name)}!A1:ZZ`);
    const header = headerRow.map((cell) => String(cell ?? '').trim());
    if (!header.includes('id')) {
      throw new SchemaError(
        `Im CRM-Sheet fehlt das Tabellenblatt „${this.schema.name}“ oder dessen Spalte „id“. Bitte unter „Einrichtung“ anlegen.`,
      );
    }
    this.snapshot = { loadedAt: Date.now(), header, rows };
    return this.snapshot;
  }

  invalidate(): void {
    this.snapshot = null;
  }

  async list(options: { fresh?: boolean } = {}): Promise<T[]> {
    const { header, rows } = await this.load(options.fresh);
    const idIndex = header.indexOf('id');
    return rows
      .filter((row) => String(row[idIndex] ?? '').trim() !== '')
      .map((row) => rowToRecord(this.schema, header, row) as unknown as T);
  }

  async get(id: string): Promise<T> {
    const found = (await this.list()).find((record) => record.id === id);
    if (!found) throw new NotFoundError();
    return found;
  }

  async insert(record: T): Promise<T> {
    const { header } = await this.load();
    await this.api.appendValues(`${quoteTab(this.schema.name)}!A1`, [
      recordToRow(this.schema, header, record as unknown as Record<string, unknown>),
    ]);
    this.invalidate();
    return record;
  }

  /**
   * Re-reads the tab, checks `geaendert_am` against the value the caller loaded, then writes the merged row.
   */
  async update(id: string, changes: Partial<T>, expectedGeaendertAm: string): Promise<T> {
    const { header, rows } = await this.load(true);
    const idIndex = header.indexOf('id');
    const index = rows.findIndex((row) => String(row[idIndex] ?? '') === id);
    if (index < 0) throw new NotFoundError();

    const existingRow = rows[index];
    const current = rowToRecord(this.schema, header, existingRow) as unknown as T;
    if ((current.geaendert_am ?? '') !== expectedGeaendertAm) {
      const record = current as unknown as Record<string, unknown>;
      throw new ConflictError(String(record.geaendert_von ?? ''), String(record.geaendert_am ?? ''));
    }

    const next = { ...current, ...changes, id } as T;
    const rowNumber = index + 2; // +1 for the header, +1 because sheet rows start at 1
    const range = `${quoteTab(this.schema.name)}!A${rowNumber}:${columnLetter(header.length)}${rowNumber}`;
    await this.api.updateValues(range, [
      recordToRow(this.schema, header, next as unknown as Record<string, unknown>, existingRow),
    ]);
    this.invalidate();
    return next;
  }
}
