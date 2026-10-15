// Test shim only: replaces SheetStore with PostgresStore on a fresh in-memory Postgres (see vitest.postgres.config.ts),
// so the existing service tests run unchanged against the new store.
import { PGlite } from '@electric-sql/pglite';
import { migriere } from '../../src/data/postgres/migrationen';
import { PostgresStore, type Db, type DbPool } from '../../src/data/postgres/postgresStore';
import { leseMigrationen } from './testDb';

const MIGRATIONEN = leseMigrationen();

function lazyPool(): DbPool {
  const pg = new PGlite();
  const bereit = migriere({ query: (sql, werte) => pg.query(sql, werte as unknown[]), exec: (sql) => pg.exec(sql) }, MIGRATIONEN);
  return {
    query: async <R>(sql: string, werte?: unknown[]) => (await bereit, pg.query<R>(sql, werte as unknown[])),
    transaktion: async <T>(arbeit: (db: Db) => Promise<T>) => {
      await bereit;
      return pg.transaction((tx) => arbeit({ query: <R>(sql: string, werte?: unknown[]) => tx.query<R>(sql, werte as unknown[]) })) as Promise<T>;
    },
  };
}

// One database per in-memory sheet, so several SheetStores on the same sheet (as in the demo seed) share their data.
const pools = new WeakMap<object, DbPool>();

export class SheetStore extends PostgresStore {
  constructor(sheets?: object) {
    let pool = sheets ? pools.get(sheets) : undefined;
    if (!pool) {
      pool = lazyPool();
      if (sheets) pools.set(sheets, pool);
    }
    super(pool);
  }
}
