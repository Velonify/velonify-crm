import type { ShopSignale, SitemapStatistik } from './aktivitaet.js';
import type { Firma } from './impressum.js';
import { KLAVIYO } from './kanaele.js';
import type { Support } from './lebenszyklus.js';

/*
 * Which shops are worth contacting: a real German company with an active shop that is not on Shopify, and at least
 * one concrete reason to talk now – for a migration, for media buying, or for Klaviyo. Each of these three areas
 * has its own reasons and its own score, so the backlog can be viewed through each lens. All thresholds and
 * weights live here.
 */

export type Bereich = 'migration' | 'ads' | 'klaviyo';
export const BEREICHE: Bereich[] = ['migration', 'ads', 'klaviyo'];

export const REGELN = {
  /** Minimum confidence of the platform detection. Below this, a single word match could be the only evidence. */
  minSicherheit: 60,
  /** A system switch this recent means the shop was just migrated. */
  gewechseltMonate: 12,
  /** Magento deploy / newest sitemap entry older than this = no update for a long time. */
  keinUpdateMonate: 12,
  /** Same system for at least this long (HTTP Archive history) = long unchanged. */
  unveraendertJahre: 5,
  lcpLangsamMs: 4000,
  pagespeedLangsam: 50,
  /** Enterprise systems are oversized below this many product URLs; below the minimum the count is not trustworthy. */
  ueberdimensioniertProdukte: 5000,
  ueberdimensioniertMindestens: 50,
  grosseSysteme: ['sfcc', 'sap', 'intershop', 'hcl', 'spryker', 'novomind'],
  /** Reach from which a shop without any ad pixel is a missed opportunity. */
  adsUngenutztRang: 100_000,
  /** Reach from which a shop without any e-mail tool is worth an e-mail marketing pitch. */
  keinEmailToolRang: 100_000,
} as const;

export type AusschlussId =
  | 'nicht_erreichbar' | 'blockiert' | 'weitergeleitet' | 'geparkt' | 'geschlossen' | 'shopify' | 'kein_shop'
  | 'system_unbekannt' | 'gerade_migriert' | 'kein_impressum' | 'adresse_unklar' | 'nicht_deutsch' | 'offshore' | 'agentur' | 'kein_haendler' | 'kein_anlass';

export type AnlassId =
  | 'system_ohne_support' | 'support_endet' | 'kein_update' | 'lange_unveraendert' | 'langsam' | 'ueberdimensioniert' | 'magento_version_unbekannt'
  | 'ads_aktiv' | 'ads_ein_kanal' | 'ads_ungenutzt'
  | 'klaviyo_wechsel' | 'klaviyo_ausbau' | 'kein_email_tool';

/** Reasons that only add to the score: years on a current system, or a single ad channel, are no reason to call on their own. */
const NUR_VERSTAERKER: AnlassId[] = ['lange_unveraendert', 'ads_ein_kanal'];

const ANLASS_BEREICH: Record<AnlassId, Bereich> = {
  system_ohne_support: 'migration', support_endet: 'migration', kein_update: 'migration', lange_unveraendert: 'migration',
  langsam: 'migration', ueberdimensioniert: 'migration', magento_version_unbekannt: 'migration',
  ads_aktiv: 'ads', ads_ein_kanal: 'ads', ads_ungenutzt: 'ads',
  klaviyo_wechsel: 'klaviyo', klaviyo_ausbau: 'klaviyo', kein_email_tool: 'klaviyo',
};

export interface Grund<T extends string> {
  id: T;
  text: string;
}

export interface Anlass extends Grund<AnlassId> {
  gewicht: number;
  bereich: Bereich;
}

/** What the live check found, plus the pool data from BigQuery. */
export interface Pruefdaten {
  erreichbar: { ok: boolean; status: number; fehler: string; weitergeleitet_nach: string };
  system: { id: string; label: string; version: string; sicherheit: number; deploy_ts: number };
  support: Support;
  shopify_dns: boolean;
  signale: ShopSignale | null;
  firma: Firma;
  sitemap: SitemapStatistik;
  zahlarten: string[];
  marketing: string[];
  /** Ad channels (display names), live and from HTTP Archive. */
  werbung: string[];
  /** E-mail marketing tools (display names), live and from HTTP Archive. */
  email_tools: string[];
  newsletter_formular: boolean;
  /** rang_de etc. from the pool; `technik_bekannt`: HTTP Archive saw the site, so "no pixel" is reliable. */
  pool: { rang_de: number | null; lcp_ms: number | null; system_seit: string | null; system_vorher: string | null; technik_bekannt?: boolean } | null;
  pagespeed_mobil: number | null;
  heute: Date;
}

export interface Ergebnis {
  qualifiziert: boolean;
  ausschluss: Grund<AusschlussId>[];
  anlaesse: Anlass[];
  /** Areas with at least one real reason (not only a booster). */
  bereiche: Bereich[];
  /** Score per area; 0 for areas without a reason. */
  scores: Record<Bereich, number>;
  /** Highest of the area scores. */
  score: number;
  score_gruende: string[];
}

const ANLASS_GEWICHT: Record<AnlassId, number> = {
  system_ohne_support: 40,
  support_endet: 25,
  ueberdimensioniert: 20,
  langsam: 20,
  kein_update: 15,
  lange_unveraendert: 10,
  magento_version_unbekannt: 8,
  klaviyo_wechsel: 35,
  ads_aktiv: 30,
  kein_email_tool: 25,
  ads_ungenutzt: 20,
  klaviyo_ausbau: 20,
  ads_ein_kanal: 10,
};

/** CrUX rank bucket in Germany → points. Reach is the best free signal for budget. */
const REICHWEITE: [number, number][] = [[1_000, 40], [5_000, 36], [10_000, 32], [50_000, 26], [100_000, 20], [500_000, 12], [1_000_000, 5]];

const MONAT_MS = 30.44 * 24 * 3600 * 1000;
const monateSeit = (iso: string, heute: Date) => (heute.getTime() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / MONAT_MS;
const zahl = (n: number) => n.toLocaleString('de-DE');
const sekunden = (ms: number) => `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;

/** Reasons to get in touch now. Each one carries the measured value in its text. */
export function anlaesse(d: Pruefdaten): Anlass[] {
  const a: Anlass[] = [];
  const neu = (id: AnlassId, text: string) => a.push({ id, text, gewicht: ANLASS_GEWICHT[id], bereich: ANLASS_BEREICH[id] });

  if (d.support.status === 'eol') neu('system_ohne_support', d.support.text);
  else if (d.support.status === 'eol_soon') neu('support_endet', d.support.text);
  // Weak on purpose: most Magento 2 shops hide their patch level, and 2.4.4–2.4.6 are already out of support.
  else if (d.support.status === 'unknown' && d.system.id === 'magento') neu('magento_version_unbekannt', 'Magento 2, Patch-Stand nicht öffentlich (2.4.4–2.4.6 sind ohne Support)');

  const deployMonate = d.system.deploy_ts ? (d.heute.getTime() / 1000 - d.system.deploy_ts) / (MONAT_MS / 1000) : null;
  const sitemapMonate = d.sitemap.neuestes_lastmod ? monateSeit(d.sitemap.neuestes_lastmod, d.heute) : null;
  if (deployMonate !== null && deployMonate > REGELN.keinUpdateMonate) {
    neu('kein_update', `letztes Deployment vor ${Math.floor(deployMonate)} Monaten`);
  } else if (deployMonate === null && sitemapMonate !== null && sitemapMonate > REGELN.keinUpdateMonate) {
    neu('kein_update', `Sitemap zuletzt vor ${Math.floor(sitemapMonate)} Monaten geändert`);
  }

  const seit = d.pool?.system_seit;
  if (seit && monateSeit(seit, d.heute) >= REGELN.unveraendertJahre * 12) {
    neu('lange_unveraendert', `seit mindestens ${seit.slice(0, 4)} auf ${d.system.label}`);
  }

  const lcp = d.pool?.lcp_ms ?? null;
  if (lcp !== null && lcp > REGELN.lcpLangsamMs) neu('langsam', `mobil ${sekunden(lcp)} bis zum größten Element (echte Nutzer)`);
  else if (lcp === null && d.pagespeed_mobil !== null && d.pagespeed_mobil < REGELN.pagespeedLangsam) neu('langsam', `PageSpeed mobil ${d.pagespeed_mobil} von 100`);

  const produkte = d.sitemap.produkt_urls;
  const gross = d.system.id === 'magento' || (REGELN.grosseSysteme as readonly string[]).includes(d.system.id);
  if (gross && produkte >= REGELN.ueberdimensioniertMindestens && produkte < REGELN.ueberdimensioniertProdukte) {
    neu('ueberdimensioniert', `${d.system.label} für rund ${zahl(produkte)} Produkte`);
  }

  // Media buying: whoever already advertises needs someone to run it; big shops without any pixel leave money lying.
  const rang = d.pool?.rang_de ?? null;
  if (d.werbung.length > 0) {
    neu('ads_aktiv', `schaltet Werbung (${d.werbung.join(', ')})`);
    if (d.werbung.length === 1) neu('ads_ein_kanal', `nur ${d.werbung[0]}, weitere Kanäle ungenutzt`);
  } else if (d.pool?.technik_bekannt && rang !== null && rang <= REGELN.adsUngenutztRang) {
    neu('ads_ungenutzt', `Top ${zahl(rang)} in Deutschland, aber kein Werbe-Pixel`);
  }

  // Klaviyo: switch from another tool, look after an existing account, or start e-mail marketing at all.
  const andere = d.email_tools.filter((t) => t !== KLAVIYO);
  if (d.email_tools.includes(KLAVIYO)) neu('klaviyo_ausbau', `nutzt Klaviyo${andere.length ? ` (daneben ${andere.join(', ')})` : ''}`);
  else if (andere.length > 0) neu('klaviyo_wechsel', `nutzt ${andere.join(', ')}, Wechsel zu Klaviyo möglich`);
  else if (d.pool?.technik_bekannt && rang !== null && rang <= REGELN.keinEmailToolRang) {
    neu('kein_email_tool', `kein E-Mail-Marketing-Tool erkennbar${d.newsletter_formular ? ' trotz Newsletter-Anmeldung' : ''}`);
  }
  return a.sort((x, y) => y.gewicht - x.gewicht);
}

/** Hard exclusions, in the order a person would check them. */
export function ausschluesse(d: Pruefdaten, anlassListe: Anlass[]): Grund<AusschlussId>[] {
  const g: Grund<AusschlussId>[] = [];
  const aus = (id: AusschlussId, text: string) => g.push({ id, text });
  const { erreichbar: e, signale: s, firma: f } = d;

  if (!e.ok) {
    if (e.status === 403 || e.status === 429 || e.status === 503) aus('blockiert', `Shop blockiert automatische Abrufe (HTTP ${e.status})`);
    else aus('nicht_erreichbar', e.status ? `HTTP ${e.status}` : `nicht erreichbar${e.fehler ? ` (${e.fehler})` : ''}`);
    return g;
  }
  if (e.weitergeleitet_nach) aus('weitergeleitet', `leitet weiter auf ${e.weitergeleitet_nach}`);
  if (s?.geparkt) aus('geparkt', 'Domain geparkt oder zu verkaufen');
  if (s?.geschlossen) aus('geschlossen', `Hinweis auf der Startseite: „${s.geschlossen}“`);
  if (d.system.id === 'shopify' || d.shopify_dns) aus('shopify', 'läuft auf Shopify');
  if (s && s.warenkorb.length === 0 && !s.preise) aus('kein_shop', 'kein Warenkorb und keine Preise auf der Startseite');
  if (!d.system.id || d.system.sicherheit < REGELN.minSicherheit) aus('system_unbekannt', 'Shopsystem nicht sicher erkannt');

  const vorher = d.pool?.system_vorher;
  if (vorher && d.pool?.system_seit && monateSeit(d.pool.system_seit, d.heute) < REGELN.gewechseltMonate) {
    aus('gerade_migriert', `hat ${d.pool.system_seit.slice(0, 7)} von ${vorher} gewechselt`);
  }

  if (!f.gefunden) aus('kein_impressum', 'kein Impressum gefunden');
  else if (!f.land) aus('adresse_unklar', 'keine Adresse im Impressum lesbar');
  else if (f.land !== 'DE') aus('nicht_deutsch', `Firmensitz ${f.land}`);
  if (f.offshore) aus('offshore', 'Offshore-Adresse im Impressum');
  if (s?.agentur.length) aus('agentur', `Agentur (${s.agentur.join(', ')})`);
  if (s?.kein_haendler.length) aus('kein_haendler', `kein Händler (${s.kein_haendler.join(', ')})`);
  if (bereicheVon(anlassListe).length === 0) aus('kein_anlass', 'kein konkreter Anlass gefunden');
  return g;
}

/** Areas with at least one reason that is more than a booster. */
export const bereicheVon = (anlassListe: Anlass[]): Bereich[] => BEREICHE.filter((b) => anlassListe.some((a) => a.bereich === b && !NUR_VERSTAERKER.includes(a.id)));

/**
 * Order among qualified shops, per area: how pressing that area's reason is, plus what counts for every area –
 * reach, how solid the company is, size and marketing activity.
 */
export function score(d: Pruefdaten, anlassListe: Anlass[]): { scores: Record<Bereich, number>; gruende: string[] } {
  const gruende: string[] = [];
  let punkte = 0;
  const plus = (n: number, grund: string) => {
    punkte += n;
    gruende.push(`+${n} ${grund}`);
  };

  const rang = d.pool?.rang_de;
  const stufe = rang ? REICHWEITE.find(([max]) => rang <= max) : undefined;
  if (stufe) plus(stufe[1], `Reichweite: Top ${zahl(stufe[0])} in Deutschland`);

  const f = d.firma;
  if (f.register.startsWith('HRB')) plus(8, `${f.register}${f.registergericht ? ` (${f.registergericht})` : ''}`);
  if (['GmbH', 'AG', 'SE', 'GmbH & Co. KG', 'AG & Co. KG'].includes(f.rechtsform)) plus(5, f.rechtsform);
  if (f.geschaeftsfuehrer.length > 0) plus(3, 'Geschäftsführung namentlich bekannt');
  if (f.email || f.telefon) plus(2, 'Kontaktdaten im Impressum');

  const produkte = d.sitemap.produkt_urls || d.sitemap.urls;
  if (produkte >= 150 && produkte <= 50_000) plus(8, `Sortiment rund ${zahl(produkte)} URLs`);
  if (d.zahlarten.length >= 3) plus(4, `${d.zahlarten.length} Zahlarten`);
  if (d.marketing.length > 0) plus(4, `Marketing aktiv (${d.marketing.slice(0, 3).join(', ')})`);

  const aktiv = bereicheVon(anlassListe);
  const scores = { migration: 0, ads: 0, klaviyo: 0 } as Record<Bereich, number>;
  for (const b of BEREICHE) {
    if (!aktiv.includes(b)) continue;
    // The strongest reason of the area counts fully, every further one half.
    const eigene = anlassListe.filter((a) => a.bereich === b);
    const anlassPunkte = eigene.reduce((summe, a, i) => summe + (i === 0 ? a.gewicht : Math.round(a.gewicht / 2)), 0);
    scores[b] = anlassPunkte + punkte;
    gruende.push(`${BEREICH_LABEL[b]}: +${anlassPunkte} (${eigene.map((a) => a.text).join('; ')})`);
  }
  return { scores, gruende };
}

export const BEREICH_LABEL: Record<Bereich, string> = { migration: 'Migration', ads: 'Media Buying & Ads', klaviyo: 'Klaviyo' };

export function qualifiziere(d: Pruefdaten): Ergebnis {
  const anlassListe = anlaesse(d);
  const ausschluss = ausschluesse(d, anlassListe);
  const s = score(d, anlassListe);
  return {
    qualifiziert: ausschluss.length === 0,
    ausschluss,
    anlaesse: anlassListe,
    bereiche: bereicheVon(anlassListe),
    scores: s.scores,
    score: Math.max(...Object.values(s.scores)),
    score_gruende: s.gruende,
  };
}
