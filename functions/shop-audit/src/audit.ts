import type { Seite } from './laden.js';
import { erkenneMerkmale, erkennePlattform, findeProduktUrl, istProduktseite, produktLinksNachKlasse, produktSitemapAusIndex, type Merkmale } from './merkmale.js';
import type { Messung, PagespeedErgebnis, Strategie } from './pagespeed.js';
import { erkenneTechnik, type Katalog } from './technik.js';
import { befundeAus, magentoEol, type Befund, type EolStatus, type NichtGeprueft } from './regeln.js';

export interface Abhaengigkeiten {
  laden: (url: string) => Promise<Seite>;
  pagespeed: (url: string, strategie: Strategie) => Promise<PagespeedErgebnis>;
  heute: Date;
  /** webappanalyzer fingerprints; null skips the technology detection. */
  katalog: Katalog | null;
}

export interface Messergebnis {
  domain: string;
  /** Final URL of the homepage after redirects. */
  url: string;
  status: 'ok' | 'teilweise' | 'fehler';
  plattform: { name: string; version: string; edition: string; sicherheit: number; eol: EolStatus; eol_datum: string };
  mobil: Messung | null;
  desktop: Messung | null;
  merkmale: Merkmale | null;
  produkt_url: string;
  befunde: Befund[];
  nicht_geprueft: NichtGeprueft[];
}

const grundVon = (seite: Seite) =>
  seite.status === 0 ? `nicht erreichbar (${seite.fehler ?? 'keine Antwort'})` : seite.status === 403 || seite.status === 429 ? `Shop blockiert automatische Abrufe (HTTP ${seite.status})` : `HTTP ${seite.status}`;

/** Sitemap location from robots.txt, else the default path. */
function sitemapUrl(robots: Seite, origin: string): string {
  const zeile = robots.ok ? /^\s*sitemap:\s*(\S+)/im.exec(robots.text) : null;
  if (zeile) {
    try {
      const url = new URL(zeile[1]);
      if (/^https?:$/.test(url.protocol)) return url.toString();
    } catch {
      /* fall through to the default */
    }
  }
  return `${origin}/sitemap.xml`;
}

/**
 * Loads at most eight pages of the shop and runs PageSpeed for mobile and desktop in parallel, then applies the
 * fixed rules. Never throws for problems with the shop; they end up in nicht_geprueft.
 */
export async function messeShop(domain: string, deps: Abhaengigkeiten): Promise<Messergebnis> {
  const startUrl = `https://${domain}/`;
  const speed = Promise.allSettled([deps.pagespeed(startUrl, 'mobile'), deps.pagespeed(startUrl, 'desktop')]);

  let home = await deps.laden(startUrl);
  if (home.status === 0 && !domain.startsWith('www.')) {
    const mitWww = await deps.laden(`https://www.${domain}/`);
    if (mitWww.status !== 0) home = mitWww;
  }

  const nichtGeprueft: NichtGeprueft[] = [];
  let merkmale: Merkmale | null = null;
  let produktUrl = '';
  let seiten: { magentoVersion: Seite | null; produkt: Seite | null; sitemap: Seite | null; robots: Seite | null } | null = null;

  if (home.ok) {
    const origin = new URL(home.url).origin;
    const vorab = erkennePlattform(home, null);
    const [robots, magentoVersion] = await Promise.all([
      deps.laden(`${origin}/robots.txt`),
      vorab.name.startsWith('magento') ? deps.laden(`${origin}/magento_version`) : Promise.resolve(null),
    ]);
    let sitemap: Seite | null = await deps.laden(sitemapUrl(robots, origin));
    const kind = produktSitemapAusIndex(sitemap);
    const produktQuelle = kind ? await deps.laden(kind) : sitemap;
    // A sitemap index counts as a sitemap even if the child cannot be loaded.
    if (!sitemap.ok && sitemap.status === 0) sitemap = null;

    const host = new URL(home.url).hostname;
    const kandidat = findeProduktUrl(home, produktQuelle, host);
    let produkt: Seite | null = null;
    if (kandidat) {
      let seite = await deps.laden(kandidat);
      // Often the first candidate is a category page; its product tiles lead one step further.
      const weiter = istProduktseite(seite) ? null : produktLinksNachKlasse(seite, host)[0];
      if (weiter) seite = await deps.laden(weiter);
      if (istProduktseite(seite)) {
        produkt = seite;
        produktUrl = seite.url;
      }
    }
    if (!produkt) nichtGeprueft.push({ bereich: 'produktseite', grund: kandidat ? 'Die gefundene Seite war keine Produktseite.' : 'Keine Produktseite gefunden.' });

    seiten = { magentoVersion, produkt, sitemap, robots };
  } else {
    const grund = grundVon(home);
    for (const bereich of ['plattform', 'tracking', 'email', 'shop', 'seo'] as const) nichtGeprueft.push({ bereich, grund });
  }

  const [mobilErgebnis, desktopErgebnis] = await speed;
  const mobil = mobilErgebnis.status === 'fulfilled' ? mobilErgebnis.value.messung : null;
  const desktop = desktopErgebnis.status === 'fulfilled' ? desktopErgebnis.value.messung : null;

  if (home.ok && seiten) {
    // Scripts from the PageSpeed run also reveal tools the Tag Manager loads, which the raw HTML does not show.
    const skripte = mobilErgebnis.status === 'fulfilled' ? mobilErgebnis.value.skripte : [];
    const technologien = deps.katalog ? erkenneTechnik({ url: home.url, html: home.text, headers: home.headers, cookies: home.cookies, skripte }, deps.katalog) : [];
    merkmale = erkenneMerkmale(home, { ...seiten, technologien });
  }
  if (!mobil) {
    const grund = mobilErgebnis.status === 'rejected' ? String(mobilErgebnis.reason instanceof Error ? mobilErgebnis.reason.message : mobilErgebnis.reason) : '';
    nichtGeprueft.push({ bereich: 'geschwindigkeit', grund: `PageSpeed mobil fehlgeschlagen${grund ? `: ${grund.slice(0, 160)}` : ''}` });
  }

  const p = merkmale?.plattform;
  const eol = p?.name === 'magento2' || p?.name === 'magento1' ? magentoEol(p.version, deps.heute) : { status: 'unknown' as const, datum: '' };
  const befunde = befundeAus({ merkmale, mobil, desktop, heute: deps.heute });
  const status = home.ok && mobil ? 'ok' : home.ok || mobil ? 'teilweise' : 'fehler';

  return {
    domain,
    url: home.ok ? home.url : startUrl,
    status,
    plattform: {
      name: p?.name ?? 'unbekannt',
      version: p?.version ?? '',
      edition: p?.edition ?? '',
      sicherheit: p?.sicherheit ?? 0,
      eol: p?.name === 'shopware5' ? 'eol' : eol.status,
      eol_datum: eol.datum,
    },
    mobil,
    desktop,
    merkmale,
    produkt_url: produktUrl,
    befunde,
    nicht_geprueft: nichtGeprueft,
  };
}
