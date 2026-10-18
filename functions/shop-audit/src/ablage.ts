import type { Bq } from './leads/api.js';

/**
 * Finished audits are also kept for a few days in `leads.audit_ergebnisse` (partitioned by day, partitions expire
 * after 7 days). If the browser loses the long audit request, the app asks for the result by its order id instead
 * of running the audit again.
 */
export const TABELLE = 'audit_ergebnisse';

/** Order ids come from crypto.randomUUID() in the app. */
export const AuftragSchema = /^[0-9a-f-]{36}$/i;

export async function speichereErgebnis(bq: Bq, auftrag: string, email: string, daten: unknown): Promise<void> {
  await bq.insert(TABELLE, [{ auftrag, email, ergebnis: JSON.stringify(daten), erstellt: new Date().toISOString() }]);
}

/** The stored result for this order, only for the person who started it; null while the audit is still running. */
export async function ladeErgebnis(bq: Bq, dataset: string, auftrag: string, email: string): Promise<unknown | null> {
  const zeilen = await bq.query<{ ergebnis: string }>(
    `SELECT ergebnis FROM \`${dataset}.${TABELLE}\` WHERE auftrag = @auftrag AND email = @email AND erstellt > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY) ORDER BY erstellt DESC LIMIT 1`,
    { auftrag, email },
  );
  return zeilen[0] ? (JSON.parse(zeilen[0].ergebnis) as unknown) : null;
}
