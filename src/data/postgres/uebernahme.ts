import { SCHEMA, type TabName } from '../schema';
import { zuDb, type DbPool } from './postgresStore';

const KONFLIKT: Partial<Record<TabName, string>> = { listen: '(liste, wert)', einstellungen: '(schluessel)' };

/**
 * Writes rows read from the sheet, keeping their ids. Running it again updates instead of duplicating, so dry runs
 * can be repeated. The change log stays out of it: taking over the sheet is not a change.
 */
export async function uebernimm(db: DbPool, tab: TabName, zeilen: Record<string, unknown>[]): Promise<number> {
  if (zeilen.length === 0) return 0;
  const schema = SCHEMA[tab];
  const spalten = schema.columns as readonly string[];
  const werte: unknown[] = [];
  const tupel = zeilen.map((zeile) => `(${spalten.map((s) => (werte.push(zuDb(schema, s, zeile[s])), `$${werte.length}`)).join(', ')})`);
  const konflikt = KONFLIKT[tab] ?? '(id)';
  const schluessel = konflikt.replace(/[()\s]/g, '').split(',');
  const uebrige = spalten.filter((s) => !schluessel.includes(s));
  const aktualisieren = uebrige.length ? `DO UPDATE SET ${uebrige.map((s) => `${s} = EXCLUDED.${s}`).join(', ')}` : 'DO NOTHING';
  await db.transaktion(async (tx) => {
    await tx.query(`SELECT set_config('app.ohne_protokoll', '1', true)`);
    await tx.query(`INSERT INTO ${schema.name} (${spalten.join(', ')}) VALUES ${tupel.join(', ')} ON CONFLICT ${konflikt} ${aktualisieren}`, werte);
  });
  return zeilen.length;
}

/** Rows per table, for comparing with the sheet after the move. */
export async function zaehle(db: DbPool): Promise<Record<string, number>> {
  const tabs = Object.keys(SCHEMA);
  const { rows } = await db.query<{ tab: string; n: string | number }>(tabs.map((t) => `SELECT '${t}' AS tab, count(*) AS n FROM ${t}`).join(' UNION ALL '));
  return Object.fromEntries(rows.map((r) => [r.tab, Number(r.n)]));
}
