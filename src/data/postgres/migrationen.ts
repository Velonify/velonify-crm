import type { Db } from './postgresStore';

export interface Migration {
  /** File name, e.g. "001_schema.sql"; applied in name order. */
  name: string;
  sql: string;
}

export interface MigrationsDb extends Db {
  /** Runs a script with several statements (node-postgres: query without parameters, PGlite: exec). */
  exec(sql: string): Promise<unknown>;
}

/**
 * Applies the migrations that are not recorded in `schema_migrationen` yet, each in its own transaction. With `rolle`,
 * everything runs as that role (crm_owner), so the tables belong to it and the default privileges for the service
 * accounts apply.
 */
export async function migriere(db: MigrationsDb, migrationen: Migration[], rolle?: string): Promise<string[]> {
  if (rolle) await db.exec(`SET ROLE ${rolle}`);
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrationen (name text PRIMARY KEY, am timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrationen');
  const erledigt = new Set(rows.map((r) => r.name));
  const neu = [...migrationen].sort((a, b) => a.name.localeCompare(b.name)).filter((m) => !erledigt.has(m.name));
  for (const migration of neu) {
    await db.exec(`BEGIN;\n${migration.sql}\nINSERT INTO schema_migrationen (name) VALUES ('${migration.name.replace(/'/g, "''")}');\nCOMMIT;`).catch(async (err: unknown) => {
      await db.exec('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${migration.name} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return neu.map((m) => m.name);
}
