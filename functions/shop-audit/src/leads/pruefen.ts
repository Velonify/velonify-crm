import { resolve4 } from 'node:dns/promises';
import type { Seite } from '../laden.js';
import { erkenneMerkmale, type Merkmale } from '../merkmale.js';
import type { PagespeedErgebnis, Strategie } from '../pagespeed.js';
import { erkenneTechnik, type Katalog } from '../technik.js';
import { shopSignale, sitemapStatistik, type ShopSignale, type SitemapStatistik } from './aktivitaet.js';
import { ladeImpressum, leereFirma, leseImpressum, type Firma } from './impressum.js';
import { label, supportStatus, systemVon, type Support } from './lebenszyklus.js';
import { qualifiziere, type Ergebnis, type Pruefdaten } from './qualifizierung.js';

export interface PoolDaten {
  rang_de: number | null;
  lcp_ms: number | null;
  system: string | null;
  version: string | null;
  system_seit: string | null;
  system_vorher: string | null;
}

export interface Abhaengigkeiten {
  laden: (url: string) => Promise<Seite>;
  heute: Date;
  katalog: Katalog | null;
  /** IPv4 addresses of a host; used for the Shopify check. */
  dns?: (host: string) => Promise<string[]>;
  /** Only called when a shop qualifies except for a reason and CrUX has no load time for it. */
  pagespeed?: (url: string, strategie: Strategie) => Promise<PagespeedErgebnis>;
}

/** One checked candidate, flat enough for BigQuery and the sheet. */
export interface Kandidat extends Ergebnis {
  domain: string;
  url: string;
  geprueft_am: string;
  dauer_ms: number;
  http_status: number;
  system: string;
  system_label: string;
  version: string;
  sicherheit: number;
  support: Support;
  letztes_deploy: string;
  firma: Firma;
  sitemap: SitemapStatistik;
  signale: Pick<ShopSignale, 'titel' | 'warenkorb' | 'preise' | 'copyright_jahr' | 'social'> | null;
  zahlarten: string[];
  marketing: string[];
  email_tools: string[];
  bewertungen: string[];
  sprachen: string[];
  technik: string[];
  rang_de: number | null;
  lcp_ms: number | null;
  pagespeed_mobil: number | null;
  belege: string[];
}

const SHOPIFY_NETZ = /^23\.227\.38\.\d{1,3}$/;
const ohneWww = (host: string) => host.replace(/^www\d?\./, '');

/** Same shop if one host is the other or a subdomain of it (www., shop., de. …). */
const gleicherShop = (a: string, b: string) => {
  const [x, y] = [ohneWww(a), ohneWww(b)];
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
};

async function ladeStartseite(domain: string, laden: Abhaengigkeiten['laden']): Promise<Seite> {
  let home = await laden(`https://${domain}/`);
  if (!home.ok && !domain.startsWith('www.')) {
    const www = await laden(`https://www.${domain}/`);
    if (www.ok || home.status === 0) home = www;
  }
  // Some older shops still only answer on plain http.
  if (home.status === 0) {
    const http = await laden(`http://${domain}/`);
    if (http.ok) home = http;
  }
  return home;
}

function marketingAus(m: Merkmale): string[] {
  return [
    ...(m.analyse.ga4 ? ['GA4'] : []),
    ...(m.analyse.gtm ? ['Tag Manager'] : []),
    ...(m.google_ads ? ['Google Ads'] : []),
    ...m.pixel,
    ...m.email_tools,
  ];
}

/**
 * Checks one pool candidate live: at most ~10 requests (homepage, robots.txt, sitemap and up to three children,
 * /magento_version, up to four Impressum candidates) plus a DNS lookup. PageSpeed only as a last resort.
 */
export async function pruefeKandidat(domain: string, pool: PoolDaten | null, deps: Abhaengigkeiten): Promise<Kandidat> {
  const start = Date.now();
  const home = await ladeStartseite(domain, deps.laden);
  const endHost = home.ok ? new URL(home.url).hostname : domain;

  let merkmale: Merkmale | null = null;
  let signale: ShopSignale | null = null;
  let firma = leereFirma();
  let sitemap: SitemapStatistik = { gefunden: false, urls: 0, produkt_urls: 0, neuestes_lastmod: '' };
  let shopifyDns = false;

  if (home.ok) {
    const origin = new URL(home.url).origin;
    signale = shopSignale(home);
    const vorabMagento = /\/static\/version|x-magento|mage\/|\/skin\/frontend\//i.test(home.text) || 'x-magento-vary' in home.headers || pool?.system === 'magento';
    const [robots, magentoVersion, impressum, ips] = await Promise.all([
      deps.laden(`${origin}/robots.txt`),
      vorabMagento ? deps.laden(`${origin}/magento_version`) : Promise.resolve(null),
      ladeImpressum(home, deps.laden),
      (deps.dns ?? resolve4)(endHost).catch(() => [] as string[]),
    ]);
    shopifyDns = ips.some((ip) => SHOPIFY_NETZ.test(ip));
    sitemap = await sitemapStatistik(robots, origin, deps.laden, deps.heute);
    firma = leseImpressum(impressum, domain);
    const technologien = deps.katalog ? erkenneTechnik({ url: home.url, html: home.text, headers: home.headers, cookies: home.cookies }, deps.katalog) : [];
    merkmale = erkenneMerkmale(home, { magentoVersion, produkt: null, sitemap: null, robots, technologien });
  }

  let p = merkmale?.plattform;
  // HTTP Archive detects with a real browser; when the raw HTML shows nothing, its finding is the fallback.
  if (home.ok && p && systemVon(p.name, p.version).id === '' && pool?.system) {
    p = { ...p, name: pool.system, version: pool.version ?? '', sicherheit: 60, belege: ['HTTP Archive'] };
  }
  const sys = systemVon(p?.name ?? '', p?.version ?? '');
  // HTTP Archive sometimes knows the version when the live page does not show it (and vice versa): take the more specific.
  const poolVersion = pool?.system === sys.id ? (pool.version ?? '') : '';
  const version = poolVersion.split('.').length > sys.version.split('.').length || !sys.version ? poolVersion : sys.version;
  const support = supportStatus(sys.id, version, deps.heute);

  const daten: Pruefdaten = {
    erreichbar: {
      ok: home.ok,
      status: home.status,
      fehler: home.fehler ?? '',
      weitergeleitet_nach: home.ok && !gleicherShop(endHost, domain) ? endHost : '',
    },
    system: { id: sys.id, label: label(sys.id), version, sicherheit: p?.sicherheit ?? 0, deploy_ts: p?.deploy_ts ?? 0 },
    support,
    shopify_dns: shopifyDns,
    signale,
    firma,
    sitemap,
    zahlarten: merkmale?.zahlarten ?? [],
    marketing: merkmale ? marketingAus(merkmale) : [],
    pool: pool ? { rang_de: pool.rang_de, lcp_ms: pool.lcp_ms, system_seit: pool.system === sys.id ? pool.system_seit : null, system_vorher: pool.system_vorher } : null,
    pagespeed_mobil: null,
    heute: deps.heute,
  };

  let ergebnis = qualifiziere(daten);
  // PageSpeed takes ~30 s, so only when it is the one thing missing.
  const nurAnlassFehlt = ergebnis.ausschluss.length === 1 && ergebnis.ausschluss[0].id === 'kein_anlass';
  if (nurAnlassFehlt && deps.pagespeed && (pool?.lcp_ms ?? null) === null) {
    try {
      const psi = await deps.pagespeed(home.url, 'mobile');
      daten.pagespeed_mobil = psi.messung.score;
      ergebnis = qualifiziere(daten);
    } catch {
      /* stays without a reason */
    }
  }

  return {
    ...ergebnis,
    domain,
    url: home.ok ? home.url : `https://${domain}/`,
    geprueft_am: deps.heute.toISOString(),
    dauer_ms: Date.now() - start,
    http_status: home.status,
    system: sys.id,
    system_label: label(sys.id),
    version,
    sicherheit: p?.sicherheit ?? 0,
    support,
    letztes_deploy: p?.deploy_ts ? new Date(p.deploy_ts * 1000).toISOString().slice(0, 10) : '',
    firma,
    sitemap,
    signale: signale ? { titel: signale.titel, warenkorb: signale.warenkorb, preise: signale.preise, copyright_jahr: signale.copyright_jahr, social: signale.social } : null,
    zahlarten: daten.zahlarten,
    marketing: daten.marketing,
    email_tools: merkmale?.email_tools ?? [],
    bewertungen: merkmale?.bewertungen ?? [],
    sprachen: merkmale?.sprachen ?? [],
    technik: merkmale?.technologien.map((t) => (t.version ? `${t.name} ${t.version}` : t.name)) ?? [],
    rang_de: pool?.rang_de ?? null,
    lcp_ms: pool?.lcp_ms ?? null,
    pagespeed_mobil: daten.pagespeed_mobil,
    belege: p?.belege ?? [],
  };
}
