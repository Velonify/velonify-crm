import { describe, expect, it } from 'vitest';
import { messeShop } from './audit.js';
import type { Seite } from './laden.js';
import type { Messung } from './pagespeed.js';
import { fehlt, MAGENTO_HOME, PRODUKT_OHNE_MARKUP, seite } from './testhilfen.js';

const HEUTE = new Date('2026-09-18T12:00:00Z');
const schnell: Messung = { strategie: 'mobile', score: 90, lcp_ms: 1800, cls: 0.02, inp_ms: 120, quelle: 'feld', bytes: null, anfragen: null, fcp_ms: 900, tbt_ms: 50, ttfb_ms: 300, felddaten: 'seite', bremsen: [], drittanbieter: [] };
const psi = (messung: Messung) => ({ messung, skripte: [] });

function shop(seiten: Record<string, Seite>) {
  const geladen: string[] = [];
  const laden = async (url: string) => {
    geladen.push(url);
    return seiten[url] ?? fehlt(url);
  };
  return { laden, geladen };
}

describe('messeShop', () => {
  it('loads at most six pages and combines them into one result', async () => {
    const { laden, geladen } = shop({
      'https://muster-shop.example/': seite('https://muster-shop.example/', MAGENTO_HOME),
      'https://muster-shop.example/robots.txt': seite('r', 'User-agent: *\nDisallow: /checkout/\nSitemap: https://muster-shop.example/sitemap_index.xml'),
      'https://muster-shop.example/magento_version': seite('v', 'Magento/2.4.6 (Community)'),
      'https://muster-shop.example/sitemap_index.xml': seite('s', '<sitemapindex><sitemap><loc>https://muster-shop.example/sitemap-products-1.xml</loc></sitemap></sitemapindex>'),
      'https://muster-shop.example/sitemap-products-1.xml': seite('s1', '<urlset><url><loc>https://muster-shop.example/tisch-eiche.html</loc></url></urlset>'),
      'https://muster-shop.example/tisch-eiche.html': seite('https://muster-shop.example/tisch-eiche.html', PRODUKT_OHNE_MARKUP),
    });
    const ergebnis = await messeShop('muster-shop.example', { laden, pagespeed: async (_u, s) => psi({ ...schnell, strategie: s }), heute: HEUTE, katalog: null });

    expect(geladen.length).toBeLessThanOrEqual(6);
    expect(ergebnis.status).toBe('ok');
    expect(ergebnis.plattform).toMatchObject({ name: 'magento2', version: '2.4.6', eol: 'eol', eol_datum: '2026-08-11' });
    expect(ergebnis.produkt_url).toBe('https://muster-shop.example/tisch-eiche.html');
    expect(ergebnis.merkmale?.seo.sitemap).toBe(true);
    expect(ergebnis.befunde.map((b) => b.id)).toContain('seo_product_markup');
    expect(ergebnis.befunde.map((b) => b.id)).not.toContain('speed_lcp_mobil');
    expect(ergebnis.nicht_geprueft).toEqual([]);
  });

  it('follows a category page to a product tile and reports http-only shops', async () => {
    const { laden, geladen } = shop({
      'https://muster-shop.example/': seite('http://www.muster-shop.example/', '<a href="/gartenmoebel.html">Gartenmöbel</a>'),
      'http://www.muster-shop.example/gartenmoebel.html': seite('http://www.muster-shop.example/gartenmoebel.html', '<a class="product-item-link" href="/tisch-eiche.html">Tisch</a>'),
      'http://www.muster-shop.example/tisch-eiche.html': seite('http://www.muster-shop.example/tisch-eiche.html', PRODUKT_OHNE_MARKUP),
    });
    const ergebnis = await messeShop('muster-shop.example', { laden, pagespeed: async () => psi(schnell), heute: HEUTE, katalog: null });
    expect(ergebnis.produkt_url).toBe('http://www.muster-shop.example/tisch-eiche.html');
    expect(geladen.length).toBeLessThanOrEqual(8);
    expect(ergebnis.befunde.map((b) => b.id)).toContain('shop_kein_https');
  });

  it('marks blocked shops as not checked instead of reporting flaws', async () => {
    const { laden } = shop({ 'https://muster-shop.example/': fehlt('https://muster-shop.example/', 403) });
    const ergebnis = await messeShop('muster-shop.example', { laden, pagespeed: async () => psi(schnell), heute: HEUTE, katalog: null });
    expect(ergebnis.status).toBe('teilweise');
    expect(ergebnis.merkmale).toBeNull();
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.nicht_geprueft.find((n) => n.bereich === 'tracking')?.grund).toContain('HTTP 403');
  });

  it('tries www when the bare domain does not answer and reports a failed PageSpeed run', async () => {
    const { laden, geladen } = shop({
      'https://muster-shop.example/': fehlt('https://muster-shop.example/', 0),
      'https://www.muster-shop.example/': seite('https://www.muster-shop.example/', '<html><title>Shop</title></html>'),
    });
    const ergebnis = await messeShop('muster-shop.example', { laden, pagespeed: async () => { throw new Error('PageSpeed 500: timeout'); }, heute: HEUTE, katalog: null });
    expect(geladen[1]).toBe('https://www.muster-shop.example/');
    expect(ergebnis.url).toBe('https://www.muster-shop.example/');
    expect(ergebnis.status).toBe('teilweise');
    expect(ergebnis.nicht_geprueft.find((n) => n.bereich === 'geschwindigkeit')?.grund).toContain('timeout');
  });
});
