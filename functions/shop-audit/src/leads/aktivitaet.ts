import type { Seite } from '../laden.js';

/*
 * Is this an active shop, and how big is it? Shop markers and identity markers come from the lead qualifier
 * (detect.py). Identity markers (agency, authority, association) are only matched against <title> and the meta
 * description: matching them against the whole page cost real shops their score (a lamp shop with a "Magazin" section).
 */

const WARENKORB = ['warenkorb', 'in den warenkorb', 'zum warenkorb', 'add to cart', 'add to bag', 'zur kasse', 'checkout', 'versandkosten', 'lieferzeit', 'inkl. mwst', 'zzgl. versand', 'artikelnummer', 'auf lager', 'sofort lieferbar', 'merkzettel', 'wunschliste'];
const PREIS = /\d{1,3}(?:\.\d{3})*,\d{2}\s?(?:€|eur\b)|€\s?\d{1,3}(?:\.\d{3})*,\d{2}/i;

const AGENTUR = ['e-commerce agentur', 'ecommerce agentur', 'digitalagentur', 'digital agentur', 'magento agentur', 'shopware agentur', 'shopify agentur', 'webagentur', 'magento partner', 'adobe solution partner', 'shopware partner', 'shopify partner', 'full-service-agentur', 'internetagentur', 'web development agency', 'ecommerce agency', 'softwareentwicklung'];
const KEIN_HAENDLER = ['stadtverwaltung', 'bezirksregierung', 'landkreis', 'gemeinde ', 'rathaus', 'sparkasse', 'volksbank', 'raiffeisenbank', 'stiftung', ' e.v.', 'verein ', 'rechtsanwält', 'steuerberat', 'kanzlei', 'hochschule', 'universität', 'zeitschrift', 'nachrichten'];

/** Maintenance and "shop closed" pages; checked in title and headings only, "geschlossen" alone is just opening hours. */
const GESCHLOSSEN = /wartungsarbeiten|wartungsmodus|maintenance mode|we'?ll be back|shop (?:ist )?(?:vorübergehend |dauerhaft )?geschlossen|(?:haben|hat) (?:unseren|den|seinen) (?:online-?)?shop (?:geschlossen|eingestellt)|betrieb (?:wurde )?eingestellt|under construction|coming soon|demnächst verfügbar|in kürze verfügbar|baustelle/i;
const GEPARKT = /sedoparking|sedo\.com\/(?:search|services)|parkingcrew|bodis\.com|dan\.com\/buy|this domain (?:is|may be) for sale|diese domain (?:steht zum verkauf|kaufen|ist zu verkaufen)|domain (?:zu verkaufen|kaufen)|parked domain|domainparking/i;

export interface ShopSignale {
  titel: string;
  beschreibung: string;
  warenkorb: string[];
  preise: boolean;
  agentur: string[];
  kein_haendler: string[];
  geschlossen: string;
  geparkt: boolean;
  /** Highest year in a copyright line, 0 if none. */
  copyright_jahr: number;
  social: Record<string, string>;
}

const SOCIAL: [string, RegExp][] = [
  ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/[\w.]+\/?/i],
  ['facebook', /https?:\/\/(?:www\.|de-de\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\?)[\w.\-]+\/?/i],
  ['linkedin', /https?:\/\/(?:[a-z]{2}\.|www\.)?linkedin\.com\/company\/[\w\-%]+\/?/i],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.]+/i],
  ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[\w\-]+/i],
  ['pinterest', /https?:\/\/(?:www\.|de\.)?pinterest\.(?:de|com)\/(?!pin\/create)[\w\-]+\/?/i],
];

export function shopSignale(home: Seite): ShopSignale {
  const html = home.text;
  const klein = html.toLowerCase();
  const titel = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1].replace(/\s+/g, ' ').trim().slice(0, 200) ?? '';
  const beschreibung = (/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,300})/i.exec(html) ?? /<meta[^>]+content=["']([^"']{0,300})["'][^>]*name=["']description["']/i.exec(html))?.[1] ?? '';
  const identitaet = ` ${titel} ${beschreibung} `.toLowerCase();
  const ueberschriften = [...html.matchAll(/<h[12][^>]*>([\s\S]{0,300}?)<\/h[12]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ')).join(' ');
  const geschlossen = GESCHLOSSEN.exec(`${titel} ${ueberschriften}`)?.[0] ?? '';
  const jahre = [...html.matchAll(/(?:©|&copy;|&#169;|copyright)\s*(?:\d{4}\s*(?:-|–|&ndash;|bis)\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const social: Record<string, string> = {};
  for (const [name, muster] of SOCIAL) {
    const m = muster.exec(html);
    if (m) social[name] = m[0];
  }
  return {
    titel,
    beschreibung,
    warenkorb: WARENKORB.filter((w) => klein.includes(w)),
    preise: PREIS.test(html),
    agentur: AGENTUR.filter((a) => identitaet.includes(a)),
    kein_haendler: KEIN_HAENDLER.filter((a) => identitaet.includes(a)),
    geschlossen,
    geparkt: GEPARKT.test(html) || (html.length < 3000 && /domain|parking/i.test(titel)),
    copyright_jahr: jahre.filter((j) => j >= 1995 && j <= 2100).reduce((a, b) => Math.max(a, b), 0),
    social,
  };
}

export interface SitemapStatistik {
  gefunden: boolean;
  /** All URLs in the loaded sitemap files, extrapolated to unloaded children of an index. */
  urls: number;
  /** URLs in product sitemaps (or product-looking URLs), extrapolated the same way. 0 = unknown. */
  produkt_urls: number;
  /** Latest <lastmod> seen, ISO date, '' if none. */
  neuestes_lastmod: string;
}

const PRODUKT_SITEMAP = /product|produkt|artikel|catalog|item/i;
const PRODUKT_URL = /\/(products?|produkte?|artikel|detail|p|item)\/[^/?#]+|-p\d{3,}|\/\d{5,}(?:\.html)?$|\.html$/i;

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1]);
const lastmods = (xml: string) => [...xml.matchAll(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi)].map((m) => m[1].slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
const neuestes = (daten: string[], heute: Date) => daten.filter((d) => d <= heute.toISOString().slice(0, 10)).sort().at(-1) ?? '';

/** Sitemap locations from robots.txt (there may be several), else /sitemap.xml. */
export function sitemapUrls(robots: Seite | null, origin: string): string[] {
  const aus = robots?.ok ? [...robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  const gueltig = aus.filter((u) => /^https?:\/\//i.test(u)).slice(0, 3);
  return gueltig.length > 0 ? gueltig : [`${origin}/sitemap.xml`];
}

/**
 * Size and freshness of the catalogue from the sitemap. Loads at most four files: the root and up to three children
 * of an index, preferring product sitemaps. Counts for children that were not loaded are extrapolated.
 */
export async function sitemapStatistik(robots: Seite | null, origin: string, laden: (url: string) => Promise<Seite>, heute: Date): Promise<SitemapStatistik> {
  const leer: SitemapStatistik = { gefunden: false, urls: 0, produkt_urls: 0, neuestes_lastmod: '' };
  let wurzel: Seite | null = null;
  for (const url of sitemapUrls(robots, origin)) {
    const seite = await laden(url);
    if (seite.ok && /<(urlset|sitemapindex)[\s>]/i.test(seite.text)) {
      wurzel = seite;
      break;
    }
  }
  if (!wurzel) return leer;

  if (/<urlset[\s>]/i.test(wurzel.text)) {
    const alle = locs(wurzel.text);
    return { gefunden: true, urls: alle.length, produkt_urls: alle.filter((u) => PRODUKT_URL.test(u)).length, neuestes_lastmod: neuestes(lastmods(wurzel.text), heute) };
  }

  const kinder = locs(wurzel.text);
  const produktKinder = kinder.filter((k) => PRODUKT_SITEMAP.test(k));
  const auswahl = [...produktKinder, ...kinder.filter((k) => !produktKinder.includes(k))].slice(0, 3);
  const geladen = await Promise.all(auswahl.map((k) => laden(k)));
  const daten = [...lastmods(wurzel.text)];
  let urls = 0;
  let produktUrls = 0;
  let geladeneProdukt = 0;
  for (const [i, seite] of geladen.entries()) {
    if (!seite.ok) continue;
    const n = locs(seite.text).length;
    urls += n;
    daten.push(...lastmods(seite.text));
    if (PRODUKT_SITEMAP.test(auswahl[i])) {
      produktUrls += n;
      geladeneProdukt++;
    }
  }
  const geladeneOk = geladen.filter((s) => s.ok).length;
  // Children that were not loaded are assumed to be as large as the loaded ones of their kind.
  if (geladeneOk > 0 && kinder.length > geladeneOk) urls = Math.round((urls / geladeneOk) * kinder.length);
  if (geladeneProdukt > 0 && produktKinder.length > geladeneProdukt) produktUrls = Math.round((produktUrls / geladeneProdukt) * produktKinder.length);
  return { gefunden: true, urls, produkt_urls: produktUrls, neuestes_lastmod: neuestes(daten, heute) };
}
