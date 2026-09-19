import type { ShopSignale, SitemapStatistik } from './aktivitaet.js';
import type { Firma } from './impressum.js';
import type { Support } from './lebenszyklus.js';

/*
 * Which shops are worth contacting: a real German company with an active shop that is not on Shopify, and at least
 * one concrete reason to talk now. All thresholds and weights live here.
 */

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
} as const;

export type AusschlussId =
  | 'nicht_erreichbar' | 'blockiert' | 'weitergeleitet' | 'geparkt' | 'geschlossen' | 'shopify' | 'kein_shop'
  | 'system_unbekannt' | 'gerade_migriert' | 'kein_impressum' | 'adresse_unklar' | 'nicht_deutsch' | 'offshore' | 'agentur' | 'kein_haendler' | 'kein_anlass';

export type AnlassId =
  | 'system_ohne_support' | 'support_endet' | 'kein_update' | 'lange_unveraendert' | 'langsam' | 'ueberdimensioniert' | 'magento_version_unbekannt';

/** Reasons that only add to the score: years on a current system are no reason to call on their own. */
const NUR_VERSTAERKER: AnlassId[] = ['lange_unveraendert'];

export interface Grund<T extends string> {
  id: T;
  text: string;
}

export interface Anlass extends Grund<AnlassId> {
  gewicht: number;
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
  pool: { rang_de: number | null; lcp_ms: number | null; system_seit: string | null; system_vorher: string | null } | null;
  pagespeed_mobil: number | null;
  heute: Date;
}

export interface Ergebnis {
  qualifiziert: boolean;
  ausschluss: Grund<AusschlussId>[];
  anlaesse: Anlass[];
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
  const neu = (id: AnlassId, text: string) => a.push({ id, text, gewicht: ANLASS_GEWICHT[id] });

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
  if (!anlassListe.some((a) => !NUR_VERSTAERKER.includes(a.id))) aus('kein_anlass', 'kein konkreter Anlass gefunden');
  return g;
}

/** Order among qualified shops: how pressing the reason is, how much reach, how solid the company. */
export function score(d: Pruefdaten, anlassListe: Anlass[]): { score: number; gruende: string[] } {
  const gruende: string[] = [];
  let punkte = 0;
  const plus = (n: number, grund: string) => {
    punkte += n;
    gruende.push(`+${n} ${grund}`);
  };
  // The strongest reason counts fully, every further one half.
  anlassListe.forEach((a, i) => plus(i === 0 ? a.gewicht : Math.round(a.gewicht / 2), a.text));

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
  return { score: punkte, gruende };
}

export function qualifiziere(d: Pruefdaten): Ergebnis {
  const anlassListe = anlaesse(d);
  const ausschluss = ausschluesse(d, anlassListe);
  const s = score(d, anlassListe);
  return { qualifiziert: ausschluss.length === 0, ausschluss, anlaesse: anlassListe, score: s.score, score_gruende: s.gruende };
}
