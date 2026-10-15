// Node only: connection to the Cloud SQL instance velonify-db (project velonify-apps) through the Cloud SQL Connector,
// signed in with IAM – no passwords. Used by crm-api, crm-mcp, kundenportal and the scripts in /scripts.
import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pg from 'pg';
import type { MigrationsDb } from '../src/data/postgres/migrationen';
import type { Db, DbPool } from '../src/data/postgres/postgresStore';

export interface Verbindungsdaten {
  /** e.g. velonify-apps:europe-west3:velonify-db */
  instanz: string;
  /** crm or crm_test */
  datenbank: string;
  /** IAM user: a service account without ".gserviceaccount.com" (crm-api@velonify-crm.iam) or a person's address. */
  nutzer: string;
  /** Connections of this process; the smallest instance has about 25 for everyone together. */
  max?: number;
}

export interface Verbindung {
  pool: DbPool & MigrationsDb;
  schliessen(): Promise<void>;
}

export function aufPool(roh: pg.Pool): DbPool & MigrationsDb {
  return {
    query: async <R>(sql: string, werte?: unknown[]) => ({ rows: (await roh.query(sql, werte)).rows as R[] }),
    exec: (sql: string) => roh.query(sql),
    transaktion: async <T>(arbeit: (db: Db) => Promise<T>) => {
      const client = await roh.connect();
      try {
        await client.query('BEGIN');
        const ergebnis = await arbeit({ query: async <R>(sql: string, werte?: unknown[]) => ({ rows: (await client.query(sql, werte)).rows as R[] }) });
        await client.query('COMMIT');
        return ergebnis;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function verbinde(daten: Verbindungsdaten): Promise<Verbindung> {
  const connector = new Connector();
  const optionen = await connector.getOptions({
    instanceConnectionName: daten.instanz,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  const roh = new pg.Pool({ ...optionen, user: daten.nutzer, database: daten.datenbank, max: daten.max ?? 3, idleTimeoutMillis: 60_000 });
  return {
    pool: aufPool(roh),
    schliessen: async () => {
      await roh.end();
      connector.close();
    },
  };
}
