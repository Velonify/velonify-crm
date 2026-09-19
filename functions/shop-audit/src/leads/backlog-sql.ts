/**
 * SQL for checks, decisions and the backlog. Checks and decisions are only ever appended (streaming inserts),
 * never updated; the views pick the latest row per domain. That keeps every step traceable and avoids DML
 * limits on freshly streamed rows.
 */

export type Entscheidung = 'pipeline' | 'firma' | 'abgelehnt' | 'zurueckgestellt' | 'freigegeben';
export const ENTSCHEIDUNGEN: Entscheidung[] = ['pipeline', 'firma', 'abgelehnt', 'zurueckgestellt', 'freigegeben'];

/** Postponed shops come back after this many days. */
export const ZURUECKGESTELLT_TAGE = 90;
/** A shop is checked again at the earliest after this many days. */
export const ERNEUT_PRUEFEN_TAGE = 180;
/** Exclusions a person can resolve by looking at the shop. */
export const MANUELL = ['blockiert', 'adresse_unklar'];
/** Minimum pool priority for "manuell prüfen": only shops that had a reason before the live check. */
export const MANUELL_MIN_PRIORITAET = 25;

export function tabellenSql(dataset: string): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS \`${dataset}.pruefungen\` (
  domain STRING NOT NULL,
  geprueft_am TIMESTAMP NOT NULL,
  von STRING,
  qualifiziert BOOL,
  score INT64,
  ausschluss ARRAY<STRING>,
  anlaesse ARRAY<STRING>,
  anlass_texte ARRAY<STRING>,
  system STRING,
  version STRING,
  rang_de INT64,
  firma STRING,
  plz STRING,
  ort STRING,
  daten STRING
)`,
    `CREATE TABLE IF NOT EXISTS \`${dataset}.entscheidungen\` (
  domain STRING NOT NULL,
  entscheidung STRING NOT NULL,
  grund STRING,
  firma_id STRING,
  von STRING,
  am TIMESTAMP NOT NULL
)`,
    `CREATE OR REPLACE VIEW \`${dataset}.letzte_pruefung\` AS
SELECT * FROM \`${dataset}.pruefungen\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY domain ORDER BY geprueft_am DESC) = 1`,
    `CREATE OR REPLACE VIEW \`${dataset}.letzte_entscheidung\` AS
SELECT * FROM \`${dataset}.entscheidungen\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY domain ORDER BY am DESC) = 1`,
    `CREATE OR REPLACE VIEW \`${dataset}.backlog\` AS
SELECT p.* EXCEPT (daten), e.entscheidung, e.am AS entschieden_am
FROM \`${dataset}.letzte_pruefung\` p
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE (p.qualifiziert OR e.entscheidung = 'freigegeben')
  AND (e.entscheidung IS NULL OR e.entscheidung = 'freigegeben'
       OR (e.entscheidung = 'zurueckgestellt' AND e.am < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ZURUECKGESTELLT_TAGE} DAY)))`,
    `CREATE OR REPLACE VIEW \`${dataset}.manuell\` AS
SELECT p.* EXCEPT (daten), pool.prioritaet
FROM \`${dataset}.letzte_pruefung\` p
JOIN \`${dataset}.pool_prio\` pool USING (domain)
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE NOT p.qualifiziert
  AND EXISTS (SELECT 1 FROM UNNEST(p.ausschluss) a WHERE a IN (${MANUELL.map((m) => `'${m}'`).join(', ')}))
  AND pool.prioritaet >= ${MANUELL_MIN_PRIORITAET}
  AND e.entscheidung IS NULL`,
  ];
}

/** Next pool candidates in priority order: not checked recently, never decided. Parameter @n. */
export function naechsteSql(dataset: string): string {
  return `
SELECT pool.domain, pool.system, pool.version, pool.rang_de, pool.lcp_ms,
  CAST(pool.system_seit AS STRING) AS system_seit, pool.system_vorher, pool.prioritaet
FROM \`${dataset}.pool_prio\` pool
LEFT JOIN \`${dataset}.letzte_pruefung\` p USING (domain)
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE (p.domain IS NULL OR p.geprueft_am < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ERNEUT_PRUEFEN_TAGE} DAY))
  AND e.domain IS NULL
ORDER BY pool.prioritaet DESC, pool.rang_de, pool.domain
LIMIT @n`;
}

const LISTE_SPALTEN = 'domain, geprueft_am, score, ausschluss, anlaesse, anlass_texte, system, version, rang_de, firma, plz, ort';

export const backlogSql = (dataset: string) => `SELECT ${LISTE_SPALTEN}, entscheidung FROM \`${dataset}.backlog\` ORDER BY score DESC, domain LIMIT 5000`;
export const manuellSql = (dataset: string) => `SELECT ${LISTE_SPALTEN}, prioritaet FROM \`${dataset}.manuell\` ORDER BY prioritaet DESC, domain LIMIT 1000`;

/** Full data of the latest check of one domain. Parameter @domain. */
export const detailSql = (dataset: string) => `
SELECT p.daten, p.geprueft_am, p.von, e.entscheidung, e.grund, e.am AS entschieden_am, e.von AS entschieden_von, e.firma_id
FROM \`${dataset}.letzte_pruefung\` p
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE p.domain = @domain`;

/** Full data of the latest checks of several domains, for taking them over into the CRM. Parameter @domains. */
export const detailsSql = (dataset: string) => `
SELECT p.domain, p.daten FROM \`${dataset}.letzte_pruefung\` p WHERE p.domain IN UNNEST(@domains)`;

/** Counts for the "Suche" page. */
export const statistikSql = (dataset: string) => `
SELECT
  (SELECT COUNT(*) FROM \`${dataset}.pool\`) AS pool,
  (SELECT COUNTIF(prioritaet >= 50) FROM \`${dataset}.pool_prio\`) AS pool_hoch,
  (SELECT COUNTIF(prioritaet >= 25 AND prioritaet < 50) FROM \`${dataset}.pool_prio\`) AS pool_mittel,
  (SELECT MAX(crawl_datum) FROM \`${dataset}.pool\`) AS crawl_datum,
  (SELECT MAX(crux_monat) FROM \`${dataset}.pool\`) AS crux_monat,
  (SELECT COUNT(*) FROM \`${dataset}.letzte_pruefung\`) AS geprueft,
  (SELECT COUNTIF(qualifiziert) FROM \`${dataset}.letzte_pruefung\`) AS qualifiziert,
  (SELECT COUNT(*) FROM \`${dataset}.backlog\`) AS backlog,
  (SELECT COUNT(*) FROM \`${dataset}.manuell\`) AS manuell,
  (SELECT COUNTIF(entscheidung IN ('pipeline', 'firma')) FROM \`${dataset}.letzte_entscheidung\`) AS uebernommen,
  (SELECT COUNTIF(entscheidung = 'abgelehnt') FROM \`${dataset}.letzte_entscheidung\`) AS abgelehnt,
  (SELECT COUNTIF(prioritaet >= 25) FROM \`${dataset}.pool_prio\` pool
   WHERE NOT EXISTS (SELECT 1 FROM \`${dataset}.letzte_pruefung\` p WHERE p.domain = pool.domain)) AS offen_ab_25`;
