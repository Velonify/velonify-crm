/**
 * Lead-Markt for hub tenants (testers and customers of the hub as SaaS): German Shopify shops, the ones the lead
 * pool drops on purpose because they have no reason to migrate. A tenant sees them as anonymous previews and
 * unlocks one at a time; crm-api keeps the market and the unlocks, this module only finds and checks shops.
 *
 * The market pool is its own table (`markt_pool`), rebuilt from the same public sources as the lead pool.
 */
import { z } from 'zod';
import { CRUX, HTTP_ARCHIVE } from './pool-sql.js';
import { emailTools } from './kanaele.js';
import { pruefeKandidat, type Abhaengigkeiten, type Kandidat } from './pruefen.js';
import type { Bq } from './api.js';
import type { BrancheId } from './branche.js';

/** Helpdesk and chat tools as Wappalyzer (HTTP Archive) names them → display name. The tenant's own customers. */
export const HELPDESKS: Record<string, string> = {
  zendesk: 'Zendesk',
  'zendesk chat': 'Zendesk',
  'zendesk sunshine conversations': 'Zendesk',
  gorgias: 'Gorgias',
  freshdesk: 'Freshdesk',
  freshchat: 'Freshchat',
  tidio: 'Tidio',
  richpanel: 'Richpanel',
  intercom: 'Intercom',
  livechat: 'LiveChat',
  userlike: 'Userlike',
  'crisp live chat': 'Crisp',
  're:amaze': 'Re:amaze',
  'help scout': 'Help Scout',
  kustomer: 'Kustomer',
  'zoho desk': 'Zoho Desk',
  'zoho salesiq': 'Zoho SalesIQ',
  'hubspot chat': 'HubSpot',
  trengo: 'Trengo',
  edesk: 'eDesk',
};

export function helpdesks(technik: readonly string[] | null | undefined): string[] {
  return [...new Set((technik ?? []).map((t) => HELPDESKS[t.trim().toLowerCase()]).filter((h): h is string => Boolean(h)))].sort();
}

const text = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * German Shopify shops with reach and the tools HTTP Archive saw, one row per domain. Parameters: @crawl (DATE),
 * @crux (INT64). Scans about as much as the pool import (~9 GB).
 */
export function marktPoolSql(dataset: string): string {
  const helpdeskNamen = Object.keys(HELPDESKS).map(text).join(', ');
  return `
CREATE OR REPLACE TABLE \`${dataset}.markt_pool\` AS
WITH crux AS (
  SELECT origin, MIN(rank) AS rang_de, MAX(IF(device = 'phone', p75_lcp, NULL)) AS lcp_ms
  FROM ${CRUX}
  WHERE yyyymm = @crux AND country_code = 'de'
  GROUP BY origin
),
seiten AS (
  SELECT
    c.*,
    EXISTS(SELECT 1 FROM UNNEST(p.technologies) t WHERE t.technology = 'Shopify Plus') AS plus,
    ARRAY(SELECT DISTINCT t.technology FROM UNNEST(p.technologies) t ORDER BY 1) AS technik
  FROM ${HTTP_ARCHIVE} p
  JOIN crux c ON c.origin = RTRIM(p.root_page, '/')
  WHERE p.date = @crawl AND p.client = 'mobile' AND p.is_root_page
    AND EXISTS(SELECT 1 FROM UNNEST(p.technologies) t WHERE t.technology IN ('Shopify', 'Shopify Plus'))
    AND ENDS_WITH(NET.HOST(c.origin), '.de')
)
SELECT
  REGEXP_REPLACE(NET.HOST(origin), r'^www\\d?\\.', '') AS domain,
  origin, plus, technik, rang_de, lcp_ms,
  EXISTS(SELECT 1 FROM UNNEST(technik) t WHERE LOWER(t) IN (${helpdeskNamen})) AS helpdesk,
  @crawl AS crawl_datum, @crux AS crux_monat, CURRENT_TIMESTAMP() AS aktualisiert
FROM seiten
QUALIFY ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(NET.HOST(origin), r'^www\\d?\\.', '') ORDER BY rang_de, STARTS_WITH(origin, 'https://') DESC, origin) = 1`;
}

/** Next unchecked shops of the market pool: shops with a helpdesk first, then by reach. Params: @n, @ohne, @nur_helpdesk. */
export function marktNaechsteSql(dataset: string): string {
  return `
SELECT domain, plus, technik, rang_de, lcp_ms, helpdesk
FROM \`${dataset}.markt_pool\`
WHERE domain NOT IN UNNEST(@ohne) AND (NOT @nur_helpdesk OR helpdesk)
ORDER BY helpdesk DESC, rang_de, domain
LIMIT @n`;
}

export const MarktFuellenSchema = z.object({
  /** How many usable shops (with a contact e-mail) to return. */
  n: z.number().int().min(1).max(40).default(20),
  /** Domains to skip: already in the market, in Velonify's hub, unlocked by a tenant. */
  ohne: z.array(z.string().trim().min(3).max(300)).max(50_000).default([]),
  nur_helpdesk: z.boolean().default(false),
});

/** What a tenant sees before unlocking: no name, no domain, no contact. */
export interface MarktVorschau {
  branche: string | null;
  /** First digit of the postcode as a region, e.g. "5" = NRW-Süd/Köln. */
  plz_bereich: string;
  land: string;
  rang_de: number | null;
  lcp_ms: number | null;
  shopify_plus: boolean;
  helpdesk: string[];
  email_tools: string[];
  zahlarten: string[];
  bewertungen: string[];
  sprachen: string[];
  apps: number;
  produkte: number | null;
}

/** What a tenant gets after unlocking. */
export interface MarktDaten {
  domain: string;
  firma: string;
  rechtsform: string;
  email: string;
  telefon: string;
  ansprechpartner: string;
  strasse: string;
  plz: string;
  ort: string;
  register: string;
  ust_id: string;
}

export interface MarktEintrag {
  domain: string;
  vorschau: MarktVorschau;
  daten: MarktDaten;
  geprueft_am: string;
}

interface MarktZeile {
  domain: string;
  plus: boolean;
  technik: string[] | null;
  rang_de: number | null;
  lcp_ms: number | null;
}

/** Turns a checked shop into a market entry; null when it is no use to a tenant (no e-mail, not German, offshore). */
export function marktEintrag(k: Kandidat, zeile: MarktZeile, branche: string | null): MarktEintrag | null {
  const f = k.firma;
  if (!f?.email || f.offshore || (f.land && f.land !== 'DE' && f.land !== 'AT' && f.land !== 'CH')) return null;
  if (k.http_status >= 400 || k.http_status === 0) return null;
  const technik = [...new Set([...(zeile.technik ?? []), ...(k.technik ?? [])])];
  return {
    domain: k.domain,
    geprueft_am: k.geprueft_am,
    vorschau: {
      branche,
      plz_bereich: /^\d/.test(f.plz) ? f.plz[0] : '',
      land: f.land || 'DE',
      rang_de: zeile.rang_de,
      lcp_ms: zeile.lcp_ms,
      shopify_plus: zeile.plus,
      helpdesk: helpdesks(technik),
      email_tools: emailTools(k.email_tools ?? [], zeile.technik),
      zahlarten: k.zahlarten ?? [],
      bewertungen: k.bewertungen ?? [],
      sprachen: k.sprachen ?? [],
      apps: technik.length,
      produkte: k.sitemap?.produkt_urls || null,
    },
    daten: {
      domain: k.domain,
      firma: f.name,
      rechtsform: f.rechtsform,
      email: f.email,
      telefon: f.telefon,
      ansprechpartner: f.geschaeftsfuehrer[0] ?? '',
      strasse: f.strasse,
      plz: f.plz,
      ort: f.ort,
      register: [f.registergericht, f.register].filter(Boolean).join(' '),
      ust_id: f.ust_id,
    },
  };
}

/** Shops checked at the same time; each check loads several pages. */
const GLEICHZEITIG = 4;

export interface MarktKontext {
  bq: Bq;
  dataset: string;
  pruefDeps: Abhaengigkeiten;
  /** Industry of a checked shop; unset without an API key, then previews have no industry. */
  branche?: (domain: string, firma: string) => Promise<BrancheId | null>;
}

/**
 * Finds up to `n` usable shops: takes the next candidates of the market pool, checks them live (Impressum, tools) and
 * keeps those with a contact e-mail. Looks at three times as many candidates as asked for, since many Impressums have none.
 */
export async function fuelleMarkt(eingabe: z.infer<typeof MarktFuellenSchema>, ctx: MarktKontext): Promise<{ eintraege: MarktEintrag[]; geprueft: number; verworfen: number }> {
  const ohne = [...new Set(eingabe.ohne.map((d) => d.toLowerCase().replace(/^www\./, '')))];
  const kandidaten = await ctx.bq.query<MarktZeile>(marktNaechsteSql(ctx.dataset), { n: eingabe.n * 3, ohne, nur_helpdesk: eingabe.nur_helpdesk });
  const eintraege: MarktEintrag[] = [];
  let geprueft = 0;
  const warteschlange = [...kandidaten];
  const arbeiter = async () => {
    for (let zeile = warteschlange.shift(); zeile && eintraege.length < eingabe.n; zeile = warteschlange.shift()) {
      geprueft += 1;
      try {
        const k = await pruefeKandidat(zeile.domain, null, { ...ctx.pruefDeps, heute: new Date() });
        if (!k.firma?.email) continue;
        const branche = ctx.branche ? await ctx.branche(zeile.domain, k.firma.name).catch(() => null) : null;
        const eintrag = marktEintrag(k, zeile, branche);
        if (eintrag && eintraege.length < eingabe.n) eintraege.push(eintrag);
      } catch (error) {
        console.error(`Lead-Markt: ${zeile.domain} nicht geprüft`, error instanceof Error ? error.message : error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(GLEICHZEITIG, kandidaten.length) }, arbeiter));
  return { eintraege, geprueft, verworfen: geprueft - eintraege.length };
}
