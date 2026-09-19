/**
 * SQL for the lead pool in BigQuery. The pool table only stores facts (system, version,
 * reach, load times, since when on this system); the view `pool_prio` derives reasons and
 * priority from them, so changing a rule means recreating the view, not re-importing.
 *
 * Public sources (both in the US multi-region, so the `leads` dataset must be in US too):
 * - httparchive.crawl.pages: monthly crawl of ~15 M sites with Wappalyzer technologies
 * - chrome-ux-report.materialized.country_summary: sites real Chrome users visit per country,
 *   with a coarse rank and p75 load times
 */
import {
  AUSSCHLUSS_TECHNIK,
  LANGE_UNVERAENDERT_JAHRE,
  LCP_EHER_LANGSAM_MS,
  LCP_LANGSAM_MS,
  OHNE_SUPPORT_MUSTER,
  REICHWEITE_PUNKTE,
  SYSTEME,
  VORAB_ANLAESSE,
  type VorabAnlass,
} from './systeme.js';
import { technikSql } from './kanaele.js';

export const HTTP_ARCHIVE = '`httparchive.crawl.pages`';
export const CRUX = '`chrome-ux-report.materialized.country_summary`';

/** SQL string literal. The values come from our own constants, quoting is just hygiene. */
const text = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const textListe = (werte: string[]) => werte.map(text).join(', ');

/** Wappalyzer name → our system, as an inline table. */
function systemTabelle(): string {
  const zeilen = SYSTEME.flatMap((s) =>
    s.technik.map((t) => `STRUCT(${text(t)} AS technik, ${text(s.id)} AS id, ${s.vorrang} AS vorrang)`),
  );
  return `UNNEST([${zeilen.join(',\n    ')}])`;
}

/** Registrable-ish domain of an origin: host without a leading `www.`. */
const domainAus = (origin: string) => `REGEXP_REPLACE(NET.HOST(${origin}), r'^www\\d?\\.', '')`;

/** The system on one crawled page, or NULL. Expects `p` = a row of httparchive.crawl.pages. */
function systemJeSeite(): string {
  return `(
      SELECT AS STRUCT sy.id, IF(t.technology = 'Hyva Themes', '2', t.info[SAFE_OFFSET(0)]) AS version
      FROM UNNEST(p.technologies) t JOIN ${systemTabelle()} sy ON sy.technik = t.technology
      ORDER BY sy.vorrang, t.info[SAFE_OFFSET(0)] IS NULL, t.technology = 'Hyva Themes'
      LIMIT 1
    )`;
}

/**
 * Latest complete HTTP Archive crawl and latest CrUX month. A crawl counts as complete
 * once it has at least 95 % of the root pages of the month before (~1 GB scan).
 */
export function neuesteQuellenSql(): string {
  return `
WITH crawls AS (
  SELECT date, COUNT(*) AS seiten
  FROM ${HTTP_ARCHIVE}
  WHERE date >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 3 MONTH)
    AND client = 'mobile' AND is_root_page
  GROUP BY date
)
SELECT
  (SELECT MAX(c.date) FROM crawls c
   WHERE c.seiten >= 0.95 * IFNULL((SELECT v.seiten FROM crawls v WHERE v.date = DATE_SUB(c.date, INTERVAL 1 MONTH)), 0)
  ) AS crawl_datum,
  (SELECT MAX(yyyymm) FROM ${CRUX} WHERE country_code = 'de') AS crux_monat`;
}

export interface ImportOptionen {
  /** Only `.de` domains (stage 1). Otherwise every shop real users in Germany visit. */
  nurDe: boolean;
}

/**
 * One row per German non-Shopify shop: system, version, reach and load times.
 * Parameters: @crawl (DATE), @crux (INT64). Scans ~9 GB.
 */
export function importSql({ nurDe }: ImportOptionen): string {
  return `
WITH crux AS (
  SELECT
    origin,
    MIN(rank) AS rang_de,
    MAX(IF(device = 'phone', p75_lcp, NULL)) AS lcp_ms,
    MAX(IF(device = 'phone', p75_inp, NULL)) AS inp_ms,
    MAX(IF(device = 'phone', p75_cls, NULL)) AS cls,
    MAX(IF(device = 'phone', p75_ttfb, NULL)) AS ttfb_ms
  FROM ${CRUX}
  WHERE yyyymm = @crux AND country_code = 'de'
  GROUP BY origin
),
seiten AS (
  SELECT
    c.*,
    ${systemJeSeite()} AS sys,
    EXISTS(SELECT 1 FROM UNNEST(p.technologies) t WHERE t.technology IN (${textListe(AUSSCHLUSS_TECHNIK)})) AS ausgeschlossen,
    (SELECT t.info[SAFE_OFFSET(0)] FROM UNNEST(p.technologies) t WHERE t.technology = 'WordPress' LIMIT 1) AS wordpress_version,
    ARRAY(SELECT DISTINCT t.technology FROM UNNEST(p.technologies) t ORDER BY 1) AS technik
  FROM ${HTTP_ARCHIVE} p
  JOIN crux c ON c.origin = RTRIM(p.root_page, '/')
  WHERE p.date = @crawl AND p.client = 'mobile' AND p.is_root_page
)
SELECT
  ${domainAus('origin')} AS domain,
  origin,
  sys.id AS system,
  NULLIF(sys.version, '') AS version,
  NULLIF(wordpress_version, '') AS wordpress_version,
  technik,
  rang_de,
  lcp_ms, inp_ms, cls, ttfb_ms,
  @crawl AS crawl_datum,
  @crux AS crux_monat
FROM seiten
WHERE sys IS NOT NULL AND NOT ausgeschlossen
  ${nurDe ? `AND ENDS_WITH(NET.HOST(origin), '.de')` : ''}
-- www and non-www (or http and https) of the same shop: keep the one with more reach.
QUALIFY ROW_NUMBER() OVER (PARTITION BY ${domainAus('origin')} ORDER BY rang_de, STARTS_WITH(origin, 'https://') DESC, origin) = 1`;
}

/** Pool table. Facts only; reasons and priority come from the view. */
export function poolTabelleSql(dataset: string): string {
  return `
CREATE TABLE IF NOT EXISTS \`${dataset}.pool\` (
  domain STRING NOT NULL,
  origin STRING,
  quelle STRING,
  system STRING,
  version STRING,
  wordpress_version STRING,
  technik ARRAY<STRING>,
  rang_de INT64,
  lcp_ms INT64, inp_ms INT64, cls FLOAT64, ttfb_ms INT64,
  crawl_datum DATE,
  crux_monat INT64,
  system_seit DATE,
  system_vorher STRING,
  erstmals_im_pool TIMESTAMP,
  aktualisiert TIMESTAMP
)`;
}

/**
 * Upsert an import into the pool. A shop that switched systems since the last import gets
 * `system_seit` = this crawl and remembers the old system.
 */
export function mergeSql(dataset: string, optionen: ImportOptionen): string {
  return `
MERGE \`${dataset}.pool\` T
USING (${importSql(optionen)}) S
ON T.domain = S.domain
WHEN MATCHED THEN UPDATE SET
  origin = S.origin, system = S.system, version = S.version, wordpress_version = S.wordpress_version,
  technik = S.technik, rang_de = S.rang_de,
  lcp_ms = S.lcp_ms, inp_ms = S.inp_ms, cls = S.cls, ttfb_ms = S.ttfb_ms,
  crawl_datum = S.crawl_datum, crux_monat = S.crux_monat,
  system_vorher = IF(T.system != S.system, T.system, T.system_vorher),
  system_seit = IF(T.system != S.system, S.crawl_datum, T.system_seit),
  aktualisiert = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  domain, origin, quelle, system, version, wordpress_version, technik, rang_de,
  lcp_ms, inp_ms, cls, ttfb_ms, crawl_datum, crux_monat, erstmals_im_pool, aktualisiert
) VALUES (
  S.domain, S.origin, 'httparchive', S.system, S.version, S.wordpress_version, S.technik, S.rang_de,
  S.lcp_ms, S.inp_ms, S.cls, S.ttfb_ms, S.crawl_datum, S.crux_monat, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
)`;
}

/**
 * Since when each pool shop runs its current system, from yearly crawl snapshots.
 * Snapshots where no system was detected are ignored (the shop may just have been
 * unreachable); a different system resets the date. One-off, ~60 GB for all years.
 */
export function historieSql(dataset: string, stichtage: string[]): string {
  return `
UPDATE \`${dataset}.pool\` T
SET system_seit = H.system_seit, system_vorher = H.system_vorher
FROM (
  WITH pool AS (SELECT domain, system FROM \`${dataset}.pool\`),
  schnappschuesse AS (
    SELECT ${domainAus('p.root_page')} AS domain, p.date AS datum, ${systemJeSeite()}.id AS system
    FROM ${HTTP_ARCHIVE} p
    WHERE p.date IN (${stichtage.map((d) => `DATE '${d}'`).join(', ')}) AND p.client = 'mobile' AND p.is_root_page
  ),
  je_shop AS (
    SELECT s.domain, s.datum, s.system, pool.system AS aktuell
    FROM schnappschuesse s JOIN pool USING (domain)
    WHERE s.system IS NOT NULL
  ),
  letzter_wechsel AS (
    SELECT domain, MAX(IF(system != aktuell, datum, NULL)) AS bis
    FROM je_shop GROUP BY domain
  )
  SELECT
    j.domain,
    MIN(IF(j.system = j.aktuell AND j.datum > IFNULL(w.bis, DATE '1900-01-01'), j.datum, NULL)) AS system_seit,
    ANY_VALUE(IF(j.datum = w.bis, j.system, NULL)) AS system_vorher
  FROM je_shop j JOIN letzter_wechsel w USING (domain)
  GROUP BY j.domain
) H
WHERE T.domain = H.domain AND H.system_seit IS NOT NULL`;
}

/** Condition per reason, over pool columns. */
function anlassBedingung(anlass: VorabAnlass): string {
  const systemVersion = `LOWER(CONCAT(system, ' ', IFNULL(version, '')))`;
  const ohneSupport = `REGEXP_CONTAINS(${systemVersion}, r'${OHNE_SUPPORT_MUSTER.join('|')}')`;
  switch (anlass) {
    case 'system_ohne_support':
      return ohneSupport;
    case 'magento2':
      return `system = 'magento' AND NOT ${ohneSupport}`;
    case 'langsam':
      return `lcp_ms > ${LCP_LANGSAM_MS}`;
    case 'eher_langsam':
      return `lcp_ms > ${LCP_EHER_LANGSAM_MS} AND lcp_ms <= ${LCP_LANGSAM_MS}`;
    case 'lange_unveraendert':
      return `system_seit <= DATE_SUB(crawl_datum, INTERVAL ${LANGE_UNVERAENDERT_JAHRE} YEAR)`;
  }
}

/** View with reasons and priority, the order in which the live check works through the pool. */
export function prioViewSql(dataset: string): string {
  const anlaesse = (Object.keys(VORAB_ANLAESSE) as VorabAnlass[]).map((a) => ({ a, bedingung: anlassBedingung(a), gewicht: VORAB_ANLAESSE[a].gewicht }));
  const reichweite = REICHWEITE_PUNKTE.map(([rang, punkte]) => `WHEN rang_de <= ${rang} THEN ${punkte}`).join(' ');
  const reichweitePunkte = `CASE ${reichweite} ELSE 0 END`;
  return `
CREATE OR REPLACE VIEW \`${dataset}.pool_prio\` AS
SELECT
  *,
  ARRAY(SELECT a FROM UNNEST([
    ${anlaesse.map(({ a, bedingung }) => `IF(${bedingung}, ${text(a)}, NULL)`).join(',\n    ')}
  ]) a WHERE a IS NOT NULL) AS vorab_anlaesse,
  (${anlaesse.map(({ bedingung, gewicht }) => `IF(IFNULL(${bedingung}, FALSE), ${gewicht}, 0)`).join(' + ')})
    + ${reichweitePunkte} AS prioritaet,
  -- Media buying: shops that already advertise first, then big ones without any pixel.
  IF(${technikSql('werbung')}, 30, IF(rang_de <= 100000, 20, 0)) + ${reichweitePunkte} AS prioritaet_ads,
  -- Klaviyo: other e-mail tools first (switch), then Klaviyo users (management), then big shops without any tool.
  IF(${technikSql('anderes_email')}, 35, IF(${technikSql('klaviyo')}, 20, IF(rang_de <= 500000, 10, 0))) + ${reichweitePunkte} AS prioritaet_klaviyo
FROM \`${dataset}.pool\``;
}
