import { AuthExpiredError } from './errors';
import { IMPORT_SPALTEN } from './importCsv';

/*
 * Lead finder: the pool of German shops lives in BigQuery, checked shops wait in a backlog there, and only what a
 * person takes over lands in the CRM sheet. The Cloud Function "shop-audit" serves it under /leads/<route>.
 */

export type Entscheidung = 'pipeline' | 'firma' | 'abgelehnt' | 'zurueckgestellt' | 'freigegeben';

/** The three lenses on the backlog, each with its own reasons, score and deal title. */
export type Bereich = 'migration' | 'ads' | 'klaviyo';
export const BEREICHE: { id: Bereich; label: string; deal: string }[] = [
  { id: 'migration', label: 'Migration', deal: 'Shopify-Migration' },
  { id: 'ads', label: 'Media Buying & Ads', deal: 'Media Buying & Ad Management' },
  { id: 'klaviyo', label: 'Klaviyo', deal: 'Klaviyo Migration & Management' },
];
export const bereichVon = (id: string): Bereich => (BEREICHE.some((b) => b.id === id) ? (id as Bereich) : 'migration');

/** Pool data of one candidate, as /leads/naechste returns it and /leads/pruefen takes it. */
export interface PoolKandidat {
  domain: string;
  system: string | null;
  version: string | null;
  rang_de: number | null;
  lcp_ms: number | null;
  system_seit: string | null;
  system_vorher: string | null;
  technik?: string[] | null;
  prioritaet: number;
}

/** One row of the backlog or the "manuell prüfen" list. */
export interface ListenZeile {
  domain: string;
  geprueft_am: string;
  score: number;
  ausschluss: string[];
  anlaesse: string[];
  anlass_texte: string[];
  system: string;
  version: string;
  rang_de: number | null;
  firma: string;
  plz: string;
  ort: string;
  entscheidung?: string | null;
  prioritaet?: number;
  bereiche: Bereich[];
  score_migration: number;
  score_ads: number;
  score_klaviyo: number;
  werbung: string[] | null;
  gtm: boolean;
  email_tools: string[] | null;
}

/** Score of a list row in one view. */
export const scoreIn = (z: ListenZeile, b: Bereich) => (b === 'migration' ? z.score_migration : b === 'ads' ? z.score_ads : z.score_klaviyo);

export interface Grund {
  id: string;
  text: string;
}

export interface LeadFirma {
  gefunden: boolean;
  url: string;
  name: string;
  rechtsform: string;
  register: string;
  registergericht: string;
  ust_id: string;
  geschaeftsfuehrer: string[];
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  offshore: boolean;
  email: string;
  telefon: string;
}

/** Everything one live check found (Kandidat in functions/shop-audit/src/leads/pruefen.ts). */
export interface LeadKandidat {
  domain: string;
  url: string;
  geprueft_am: string;
  qualifiziert: boolean;
  ausschluss: Grund[];
  anlaesse: (Grund & { gewicht: number; bereich?: Bereich })[];
  bereiche?: Bereich[];
  scores?: Record<Bereich, number>;
  score: number;
  score_gruende: string[];
  http_status: number;
  system: string;
  system_label: string;
  version: string;
  sicherheit: number;
  support: { status: string; text: string; datum: string };
  letztes_deploy: string;
  firma: LeadFirma;
  sitemap: { gefunden: boolean; urls: number; produkt_urls: number; neuestes_lastmod: string };
  signale: { titel: string; warenkorb: string[]; preise: boolean; copyright_jahr: number; social: Record<string, string> } | null;
  zahlarten: string[];
  marketing: string[];
  werbung?: string[];
  gtm?: boolean;
  email_tools: string[];
  newsletter_formular?: boolean;
  bewertungen: string[];
  sprachen: string[];
  technik: string[];
  rang_de: number | null;
  lcp_ms: number | null;
  pagespeed_mobil: number | null;
  belege: string[];
}

export interface LeadDetail {
  kandidat: LeadKandidat;
  geprueft_am: string;
  von: string;
  entscheidung: string | null;
  grund: string | null;
  entschieden_am: string | null;
  entschieden_von: string | null;
  firma_id: string | null;
}

export interface LeadStatistik {
  pool: number;
  pool_hoch: number;
  pool_mittel: number;
  crawl_datum: string;
  crux_monat: number;
  geprueft: number;
  qualifiziert: number;
  backlog: number;
  manuell: number;
  uebernommen: number;
  abgelehnt: number;
  offen_ab_25: number;
}

export interface EntscheidungEintrag {
  domain: string;
  entscheidung: Entscheidung;
  grund?: string;
  firma_id?: string;
}

export interface LeadFinderApi {
  naechste(n: number, bereich: Bereich): Promise<PoolKandidat[]>;
  pruefe(kandidat: PoolKandidat): Promise<LeadKandidat>;
  backlog(): Promise<ListenZeile[]>;
  manuell(): Promise<ListenZeile[]>;
  detail(domain: string): Promise<LeadDetail>;
  details(domains: string[]): Promise<LeadKandidat[]>;
  entscheide(eintraege: EntscheidungEintrag[]): Promise<void>;
  statistik(): Promise<LeadStatistik>;
  importiere(): Promise<{ crawl_datum: string; crux_monat: number }>;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const ANLASS_LABEL: Record<string, string> = {
  system_ohne_support: 'Ohne Support',
  support_endet: 'Support endet',
  kein_update: 'Kein Update',
  lange_unveraendert: 'Lange unverändert',
  langsam: 'Langsam',
  ueberdimensioniert: 'Überdimensioniert',
  magento_version_unbekannt: 'Magento-Version unklar',
  ads_aktiv: 'Werbung aktiv',
  ads_ein_kanal: 'Nur ein Kanal',
  ads_ungenutzt: 'Reichweite ohne Werbung',
  klaviyo_wechsel: 'Anderes E-Mail-Tool',
  klaviyo_ausbau: 'Nutzt Klaviyo',
  kein_email_tool: 'Kein E-Mail-Tool',
};

/** Which view a reason belongs to (the same table as ANLASS_BEREICH in the function). */
export const ANLASS_BEREICH: Record<string, Bereich> = {
  system_ohne_support: 'migration', support_endet: 'migration', kein_update: 'migration', lange_unveraendert: 'migration',
  langsam: 'migration', ueberdimensioniert: 'migration', magento_version_unbekannt: 'migration',
  ads_aktiv: 'ads', ads_ein_kanal: 'ads', ads_ungenutzt: 'ads',
  klaviyo_wechsel: 'klaviyo', klaviyo_ausbau: 'klaviyo', kein_email_tool: 'klaviyo',
};

/** Reasons of one view, with their texts, from the parallel id/text arrays of a list row. */
export const anlaesseIn = (z: Pick<ListenZeile, 'anlaesse' | 'anlass_texte'>, b: Bereich) =>
  z.anlaesse.map((id, i) => ({ id, text: z.anlass_texte[i] ?? '' })).filter((a) => (ANLASS_BEREICH[a.id] ?? 'migration') === b);

export const AUSSCHLUSS_LABEL: Record<string, string> = {
  nicht_erreichbar: 'Nicht erreichbar',
  blockiert: 'Blockiert Abrufe',
  weitergeleitet: 'Leitet weiter',
  geparkt: 'Geparkt',
  geschlossen: 'Geschlossen',
  shopify: 'Shopify',
  kein_shop: 'Kein Shop',
  system_unbekannt: 'System unklar',
  gerade_migriert: 'Gerade migriert',
  kein_impressum: 'Kein Impressum',
  adresse_unklar: 'Adresse unklar',
  nicht_deutsch: 'Nicht deutsch',
  offshore: 'Offshore',
  agentur: 'Agentur',
  kein_haendler: 'Kein Händler',
  kein_anlass: 'Kein Anlass',
};

const SYSTEM_LABEL: Record<string, string> = {
  magento: 'Magento', shopware: 'Shopware', oxid: 'OXID', jtl: 'JTL-Shop', gambio: 'Gambio', plentymarkets: 'plentymarkets',
  xtcommerce: 'xt:Commerce', modified: 'modified', oscommerce: 'osCommerce', smartstore: 'Smartstore', sfcc: 'Salesforce CC',
  sap: 'SAP Commerce', intershop: 'Intershop', hcl: 'HCL Commerce', spryker: 'Spryker', novomind: 'novomind', websale: 'Websale',
  xanario: 'Xanario', afterbuy: 'Afterbuy', prestashop: 'PrestaShop', opencart: 'OpenCart', nopcommerce: 'nopCommerce',
  bigcommerce: 'BigCommerce', lightspeed: 'Lightspeed', epages: 'ePages', ccvshop: 'CCV Shop', craft: 'Craft Commerce',
  woocommerce: 'WooCommerce', wix: 'Wix', squarespace: 'Squarespace', webflow: 'Webflow', ecwid: 'Ecwid', shopify: 'Shopify',
};
export const systemLabel = (system: string, version = '') => `${SYSTEM_LABEL[system] ?? (system || 'Unbekannt')}${version ? ` ${version}` : ''}`;

/** CrUX rank bucket in Germany as a short label. */
export function reichweiteLabel(rang: number | null | undefined): string {
  if (!rang) return '–';
  return `Top ${rang >= 1_000_000 ? `${rang / 1_000_000} Mio.` : rang.toLocaleString('de-DE')}`;
}

// ─── Taking leads over into the CRM ──────────────────────────────────────────

/** Tier for the CRM, on the same thresholds as the Magento qualifier (A ≥ 68, B ≥ 48, C ≥ 30). */
export const tierVon = (score: number) => (score >= 68 ? 'A' : score >= 48 ? 'B' : score >= 30 ? 'C' : 'D');

/** Our system ids → the platform keys the CRM and the shop audit use. */
export function plattformVon(k: Pick<LeadKandidat, 'system' | 'version'>): string {
  const major = k.version.split('.')[0];
  if (k.system === 'magento') return major === '1' ? 'magento1' : 'magento2';
  if (k.system === 'shopware' && (major === '5' || major === '6')) return `shopware${major}`;
  return { sfcc: 'salesforce_cc', sap: 'sap_commerce', xtcommerce: 'xt_commerce' }[k.system] ?? k.system;
}

export const IMPORT_KOPF = [...IMPORT_SPALTEN, 'ansprechpartner_rolle', 'letztes_deploy', 'score_gruende', 'quelle'] as const;

/**
 * Checked candidates as rows in the import format, so taking them over goes through the same planning as a CSV
 * import: duplicate check by domain and VAT ID, existing firms are never overwritten.
 */
export function importZeilen(kandidaten: LeadKandidat[], bereich: Bereich = 'migration'): string[][] {
  const zeilen = kandidaten.map((k) => {
    const f = k.firma;
    const score = k.scores?.[bereich] || k.score;
    // Reasons of the chosen view first, the others after them.
    const anlaesse = [...k.anlaesse].sort((a, b) => Number((b.bereich ?? 'migration') === bereich) - Number((a.bereich ?? 'migration') === bereich));
    const werte: Record<(typeof IMPORT_KOPF)[number], string> = {
      tier: tierVon(score),
      score: String(score),
      domain: k.domain,
      firma: f.name,
      plattform: plattformVon(k),
      // The platform key already carries the major version (shopware5), so only a more precise one is worth adding.
      version: k.version.includes('.') ? k.version : '',
      eol: k.support.status,
      register: f.register ? `${f.register}${f.registergericht ? ` (${f.registergericht})` : ''}` : '',
      ust_id: f.ust_id,
      ansprechpartner: f.geschaeftsfuehrer[0] ?? '',
      email: f.email,
      telefon: f.telefon,
      ort: f.ort,
      katalog_urls: String(k.sitemap.produkt_urls || k.sitemap.urls || ''),
      payments: k.zahlarten.join(', '),
      marketing: [...new Set([...(k.werbung ?? []), ...(k.gtm ? ['GTM'] : []), ...k.email_tools, ...k.marketing])].join(', '),
      lauf: '',
      ansprechpartner_rolle: f.geschaeftsfuehrer.length ? 'Geschäftsführung' : '',
      letztes_deploy: k.letztes_deploy,
      score_gruende: [...anlaesse.map((a) => a.text), ...(f.geschaeftsfuehrer.length > 1 ? [`weitere Geschäftsführung: ${f.geschaeftsfuehrer.slice(1).join(', ')}`] : [])].join(' | '),
      quelle: 'Lead-Finder',
    };
    return IMPORT_KOPF.map((spalte) => werte[spalte]);
  });
  return [[...IMPORT_KOPF], ...zeilen];
}

// ─── Cloud Function ──────────────────────────────────────────────────────────

export class CloudLeadFinder implements LeadFinderApi {
  constructor(
    private readonly basisUrl: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async post<T>(route: string, body: unknown = {}): Promise<T> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(`${this.basisUrl.replace(/\/$/, '')}/leads/${route}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Der Lead-Finder ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.');
    }
    const json = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
    if (antwort.status === 401 && /abgelaufen|nicht angemeldet/i.test(json?.fehler ?? '')) throw new AuthExpiredError();
    if (!antwort.ok || !json) throw new Error(json?.fehler ?? `Der Lead-Finder hat mit Fehler ${antwort.status} geantwortet.`);
    return json;
  }

  async naechste(n: number, bereich: Bereich) {
    return (await this.post<{ kandidaten: PoolKandidat[] }>('naechste', { n, bereich })).kandidaten.map(zahlen);
  }
  pruefe(k: PoolKandidat) {
    const { domain, prioritaet: _, ...pool } = k;
    return this.post<LeadKandidat>('pruefen', { domain, pool });
  }
  async backlog() {
    return (await this.post<{ zeilen: ListenZeile[] }>('backlog')).zeilen.map(zahlen);
  }
  async manuell() {
    return (await this.post<{ zeilen: ListenZeile[] }>('manuell')).zeilen.map(zahlen);
  }
  detail(domain: string) {
    return this.post<LeadDetail>('detail', { domain });
  }
  async details(domains: string[]) {
    return (await this.post<{ kandidaten: LeadKandidat[] }>('details', { domains })).kandidaten;
  }
  async entscheide(eintraege: EntscheidungEintrag[]) {
    await this.post('entscheiden', { eintraege });
  }
  async statistik() {
    return zahlen(await this.post<LeadStatistik>('statistik'));
  }
  importiere() {
    return this.post<{ crawl_datum: string; crux_monat: number }>('import');
  }
}

const ZAHL_FELDER = new Set(['rang_de', 'lcp_ms', 'prioritaet', 'score', 'score_migration', 'score_ads', 'score_klaviyo', 'pool', 'pool_hoch', 'pool_mittel', 'crux_monat', 'geprueft', 'qualifiziert', 'backlog', 'manuell', 'uebernommen', 'abgelehnt', 'offen_ab_25']);

/** BigQuery sends INT64 as strings in some setups; the app works with numbers. */
function zahlen<T extends object>(zeile: T): T {
  return Object.fromEntries(Object.entries(zeile).map(([k, v]) => [k, ZAHL_FELDER.has(k) && typeof v === 'string' ? Number(v) : v])) as T;
}
