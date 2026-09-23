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
export const MANUELL = ['blockiert', 'adresse_unklar', 'keine_email'];

/** Contact e-mail of a check: from the Impressum, else the one a person entered when releasing it by hand. */
const EMAIL = `COALESCE(NULLIF(JSON_VALUE(p.daten, '$.firma.email'), ''), NULLIF(e.email, ''))`;
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
  bereiche ARRAY<STRING>,
  score_migration INT64,
  score_ads INT64,
  score_klaviyo INT64,
  werbung ARRAY<STRING>,
  gtm BOOL,
  email_tools ARRAY<STRING>,
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
    // Columns added with the views per area (Migration, Media Buying, Klaviyo); no-ops on new tables.
    `ALTER TABLE \`${dataset}.pruefungen\`
  ADD COLUMN IF NOT EXISTS bereiche ARRAY<STRING>,
  ADD COLUMN IF NOT EXISTS score_migration INT64,
  ADD COLUMN IF NOT EXISTS score_ads INT64,
  ADD COLUMN IF NOT EXISTS score_klaviyo INT64,
  ADD COLUMN IF NOT EXISTS werbung ARRAY<STRING>,
  ADD COLUMN IF NOT EXISTS gtm BOOL,
  ADD COLUMN IF NOT EXISTS email_tools ARRAY<STRING>`,
    `CREATE TABLE IF NOT EXISTS \`${dataset}.entscheidungen\` (
  domain STRING NOT NULL,
  entscheidung STRING NOT NULL,
  grund STRING,
  firma_id STRING,
  email STRING,
  von STRING,
  am TIMESTAMP NOT NULL
)`,
    `ALTER TABLE \`${dataset}.entscheidungen\` ADD COLUMN IF NOT EXISTS email STRING`,
    `CREATE OR REPLACE VIEW \`${dataset}.letzte_pruefung\` AS
SELECT * FROM \`${dataset}.pruefungen\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY domain ORDER BY geprueft_am DESC) = 1`,
    `CREATE OR REPLACE VIEW \`${dataset}.letzte_entscheidung\` AS
SELECT * FROM \`${dataset}.entscheidungen\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY domain ORDER BY am DESC) = 1`,
    `CREATE OR REPLACE VIEW \`${dataset}.backlog\` AS
SELECT p.* EXCEPT (daten), e.entscheidung, e.am AS entschieden_am, ${EMAIL} AS email
FROM \`${dataset}.letzte_pruefung\` p
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE (p.qualifiziert OR e.entscheidung = 'freigegeben')
  AND ${EMAIL} IS NOT NULL
  AND (e.entscheidung IS NULL OR e.entscheidung = 'freigegeben'
       OR (e.entscheidung = 'zurueckgestellt' AND e.am < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ZURUECKGESTELLT_TAGE} DAY)))`,
    `CREATE OR REPLACE VIEW \`${dataset}.manuell\` AS
SELECT p.* EXCEPT (daten), pool.prioritaet, ${EMAIL} AS email
FROM \`${dataset}.letzte_pruefung\` p
JOIN \`${dataset}.pool_prio\` pool USING (domain)
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE e.entscheidung IS NULL
  AND ((NOT p.qualifiziert
        AND EXISTS (SELECT 1 FROM UNNEST(p.ausschluss) a WHERE a IN (${MANUELL.map((m) => `'${m}'`).join(', ')}))
        AND pool.prioritaet >= ${MANUELL_MIN_PRIORITAET})
    -- Qualified by checks from before the e-mail rule, but without one: a person adds it.
    OR (p.qualifiziert AND ${EMAIL} IS NULL))`,
  ];
}

/** Next pool candidates in the priority order of one area: not checked recently, never decided. Parameter @n. */
export function naechsteSql(dataset: string, bereich: 'migration' | 'ads' | 'klaviyo' = 'migration'): string {
  const prio = bereich === 'migration' ? 'prioritaet' : `prioritaet_${bereich}`;
  return `
SELECT pool.domain, pool.system, pool.version, pool.rang_de, pool.lcp_ms,
  CAST(pool.system_seit AS STRING) AS system_seit, pool.system_vorher, pool.technik, pool.${prio} AS prioritaet
FROM \`${dataset}.pool_prio\` pool
LEFT JOIN \`${dataset}.letzte_pruefung\` p USING (domain)
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE (p.domain IS NULL OR p.geprueft_am < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ERNEUT_PRUEFEN_TAGE} DAY))
  AND e.domain IS NULL
ORDER BY pool.${prio} DESC, pool.rang_de, pool.domain
LIMIT @n`;
}

// Checks from before the views per area only know migration; they count as such.
const LISTE_SPALTEN = `domain, geprueft_am, score, ausschluss, anlaesse, anlass_texte, system, version, rang_de, firma, plz, ort,
  IF(ARRAY_LENGTH(bereiche) > 0, bereiche, ['migration']) AS bereiche,
  IFNULL(score_migration, score) AS score_migration, IFNULL(score_ads, 0) AS score_ads, IFNULL(score_klaviyo, 0) AS score_klaviyo,
  werbung, IFNULL(gtm, FALSE) AS gtm, email_tools, email`;

export const backlogSql = (dataset: string) => `SELECT ${LISTE_SPALTEN}, entscheidung FROM \`${dataset}.backlog\` ORDER BY score DESC, domain LIMIT 5000`;
export const manuellSql = (dataset: string) => `SELECT ${LISTE_SPALTEN}, prioritaet FROM \`${dataset}.manuell\` ORDER BY prioritaet DESC, domain LIMIT 1000`;

/** Full data of the latest check of one domain. Parameter @domain. */
export const detailSql = (dataset: string) => `
SELECT p.daten, p.geprueft_am, p.von, e.entscheidung, e.grund, e.am AS entschieden_am, e.von AS entschieden_von, e.firma_id,
  NULLIF(e.email, '') AS email
FROM \`${dataset}.letzte_pruefung\` p
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE p.domain = @domain`;

/** Full data of the latest checks of several domains, for taking them over into the CRM. Parameter @domains. */
export const detailsSql = (dataset: string) => `
SELECT p.domain, p.daten, NULLIF(e.email, '') AS email
FROM \`${dataset}.letzte_pruefung\` p
LEFT JOIN \`${dataset}.letzte_entscheidung\` e USING (domain)
WHERE p.domain IN UNNEST(@domains)`;

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
