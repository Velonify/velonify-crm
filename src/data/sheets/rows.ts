import type { TabSchema } from '../schema';

export type Cell = string | number | boolean;
export type RecordValue = string | number | boolean | null;

/** 1 → A, 27 → AA */
export function columnLetter(index1: number): string {
  let n = index1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function parseCell(schema: TabSchema, column: string, raw: unknown): RecordValue {
  if (schema.boolean?.includes(column)) {
    return raw === true || String(raw ?? '').trim().toUpperCase() === 'TRUE';
  }
  if (schema.numeric?.includes(column)) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return raw === undefined || raw === null ? '' : String(raw);
}

/** Maps a sheet row to a record by header name. Columns missing from the sheet become empty values. */
export function rowToRecord(schema: TabSchema, header: readonly string[], row: readonly unknown[]): Record<string, RecordValue> {
  const record: Record<string, RecordValue> = {};
  for (const column of schema.columns) {
    const index = header.indexOf(column);
    record[column] = parseCell(schema, column, index >= 0 ? row[index] : undefined);
  }
  return record;
}

/**
 * Builds a row in the sheet's column order. Columns the app does not know keep their existing value,
 * so notes or formulas someone added in extra columns survive an update.
 */
export function recordToRow(
  schema: TabSchema,
  header: readonly string[],
  record: Readonly<Record<string, unknown>>,
  existingRow: readonly unknown[] = [],
): Cell[] {
  return header.map((column, index) => {
    if (!(schema.columns as readonly string[]).includes(column)) {
      const existing = existingRow[index];
      return typeof existing === 'number' || typeof existing === 'boolean' ? existing : String(existing ?? '');
    }
    const value = record[column];
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value);
  });
}
