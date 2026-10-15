import { randomBytes, randomInt } from 'node:crypto';
import { SCHEMA, type TabName } from '../../../../src/data/schema';
import { zuDb, zuRecord, type Db } from '../../../../src/data/postgres/postgresStore';

export type Zeile = Record<string, string | number | boolean | null>;

/** Small SQL helpers for the website routes; names only from SCHEMA. */
export async function alle(db: Db, tab: TabName, wo = '', werte: unknown[] = []): Promise<Zeile[]> {
  const schema = SCHEMA[tab];
  const { rows } = await db.query(`SELECT ${schema.columns.join(', ')} FROM ${schema.name} ${wo} ORDER BY nr`, werte);
  return rows.map((zeile) => zuRecord(schema, zeile));
}

export async function einfuegen(db: Db, tab: TabName, record: Zeile): Promise<void> {
  const schema = SCHEMA[tab];
  await db.query(
    `INSERT INTO ${schema.name} (${schema.columns.join(', ')}) VALUES (${schema.columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    schema.columns.map((s) => zuDb(schema, s, record[s])),
  );
}

/** Changes a row and marks it as changed by the website, like the Apps Scripts did. */
export async function aendern(db: Db, tab: TabName, zeile: Zeile, aenderungen: Zeile): Promise<void> {
  const schema = SCHEMA[tab];
  const alles: Zeile = { ...aenderungen, geaendert_am: new Date().toISOString(), geaendert_von: 'Website' };
  const spalten = Object.keys(alles).filter((s) => s !== 'id' && (schema.columns as readonly string[]).includes(s));
  await db.query(`UPDATE ${schema.name} SET ${spalten.map((s, i) => `${s} = $${i + 2}`).join(', ')} WHERE id = $1`, [zeile.id, ...spalten.map((s) => zuDb(schema, s, alles[s]))]);
  Object.assign(zeile, alles);
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Same shape as the app's ids (src/data/ids.ts). */
export function neueId(praefix: string): string {
  let zeichen = '';
  for (let i = 0; i < 8; i++) zeichen += ALPHABET[randomInt(ALPHABET.length)];
  return `${praefix}-${zeichen}`;
}

/** 32 hex characters, the key in the links of the magnet mails. */
export const neuesToken = () => randomBytes(16).toString('hex');

export function feld(felder: Record<string, unknown>, name: string, max = 500): string {
  const wert = felder[name];
  return wert === undefined || wert === null ? '' : String(wert).trim().slice(0, max);
}

export const wahr = (wert: unknown) => wert === true || String(wert).toUpperCase() === 'TRUE';

/** The answer format of the Apps Scripts the website still expects: HTTP 200, the outcome in `status`. */
export interface Ergebnis {
  status: number;
  text: string;
  [extra: string]: unknown;
}
export const ergebnis = (status: number, text: string, extra: Record<string, unknown> = {}): Ergebnis => ({ status, text, ...extra });
