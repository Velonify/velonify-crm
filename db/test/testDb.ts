// Test helper only (Node): a real Postgres in memory via PGlite, with all migrations applied.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Migration } from '../../src/data/postgres/migrationen';
import type { Db, DbPool } from '../../src/data/postgres/postgresStore';

const ORDNER = new URL('../migrationen/', import.meta.url);

export function leseMigrationen(): Migration[] {
  return readdirSync(ORDNER, 'utf8')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(new URL(name, ORDNER), 'utf8') }));
}

export async function testDb(): Promise<{ pool: DbPool; pg: PGlite }> {
  const pg = new PGlite();
  const roh = { query: <R>(sql: string, werte?: unknown[]) => pg.query<R>(sql, werte as unknown[]), exec: (sql: string) => pg.exec(sql) };
  await migriere(roh, leseMigrationen());
  const pool: DbPool = {
    query: roh.query,
    transaktion: <T>(arbeit: (db: Db) => Promise<T>) =>
      pg.transaction((tx) => arbeit({ query: <R>(sql: string, werte?: unknown[]) => tx.query<R>(sql, werte as unknown[]) })) as Promise<T>,
  };
  return { pool, pg };
}
