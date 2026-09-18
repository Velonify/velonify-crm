import { describe, expect, it } from 'vitest';
import { erkenneMerkmale, erkennePlattform, findeProduktUrl, hatSitemap, istProduktseite, produktLinksNachKlasse, produktSitemapAusIndex, robotsSperrtAlles } from './merkmale.js';
import { fehlt, MAGENTO_HOME, PRODUKT_MIT_MARKUP, PRODUKT_OHNE_MARKUP, seite } from './testhilfen.js';

const home = seite('https://muster-shop.example/', MAGENTO_HOME);

describe('erkennePlattform', () => {
  it('detects Magento 2 with version and deploy date', () => {
    const p = erkennePlattform(home, seite('https://muster-shop.example/magento_version', 'Magento/2.4.6 (Community)'));
    expect(p).toMatchObject({ name: 'magento2', version: '2.4.6', edition: 'Community', deploy_ts: 1690000000 });
  });

  it('detects Shopify and stops there', () => {
    expect(erkennePlattform(seite('https://x.example/', '<script src="https://cdn.shopify.com/s/files/app.js"></script>'), null).name).toBe('shopify');
  });

  it('detects Magento 1 by its skin paths', () => {
    const p = erkennePlattform(seite('https://x.example/', '<link href="/skin/frontend/default/a.css"><script src="/js/varien/form.js"></script>'), null);
    expect(p).toMatchObject({ name: 'magento1', sicherheit: 90 });
  });

  it('detects Shopware 6 and leaves unknown shops unknown', () => {
    expect(erkennePlattform(seite('https://x.example/', '<link href="/bundles/storefront/x.css"><script>window.router = {}</script>'), null).name).toBe('shopware6');
    expect(erkennePlattform(seite('https://x.example/', '<html>Hallo</html>'), null).name).toBe('unbekannt');
  });
});

describe('erkenneMerkmale', () => {
  it('reads tracking, payments and SEO basics from the homepage', () => {
    const m = erkenneMerkmale(home, { magentoVersion: null, produkt: seite('https://muster-shop.example/tisch.html', PRODUKT_OHNE_MARKUP), sitemap: fehlt('s', 404), robots: seite('r', 'User-agent: *\nDisallow: /checkout/') });
    expect(m.analyse).toEqual({ ga4: true, gtm: false, universal_analytics: false });
    expect(m.https).toBe(true);
    expect(m.pixel).toEqual(['meta']);
    expect(m.consent).toEqual([]);
    expect(m.email_tools).toEqual([]);
    expect(m.zahlarten).toEqual(['paypal', 'rechnung']);
    expect(m.sprachen).toEqual(['de', 'en']);
    expect(m.seo).toMatchObject({ title: 'Muster Shop – Gartenmöbel', meta_description: false, h1: true, canonical: true, product_markup: false, sitemap: false, robots_sperrt_alles: false });
  });

  it('does not mistake reCAPTCHA classes for a GA4 ID', () => {
    const m = erkenneMerkmale(seite('https://x.example/', '<div class="g-recaptcha"></div>'), { magentoVersion: null, produkt: null, sitemap: null, robots: null });
    expect(m.analyse.ga4).toBe(false);
    expect(m.seo.product_markup).toBeNull();
  });

  it('finds product markup and ratings on the product page', () => {
    const m = erkenneMerkmale(home, { magentoVersion: null, produkt: seite('p', PRODUKT_MIT_MARKUP), sitemap: null, robots: null });
    expect(m.seo.product_markup).toBe(true);
    expect(m.seo.product_bewertungen).toBe(true);
  });
});

describe('robots and sitemap', () => {
  it('only reports a full block for all crawlers', () => {
    expect(robotsSperrtAlles(seite('r', 'User-agent: *\nDisallow: /'))).toBe(true);
    expect(robotsSperrtAlles(seite('r', 'User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin'))).toBe(false);
    expect(robotsSperrtAlles(fehlt('r', 0))).toBeNull();
  });

  it('tells a missing sitemap from an unreachable one', () => {
    expect(hatSitemap(seite('s', '<?xml version="1.0"?><urlset></urlset>'))).toBe(true);
    expect(hatSitemap(fehlt('s', 404))).toBe(false);
    expect(hatSitemap(fehlt('s', 0))).toBeNull();
  });
});

describe('product page', () => {
  it('prefers the product sitemap of an index', () => {
    const index = seite('s', '<sitemapindex><sitemap><loc>https://muster-shop.example/sitemap-cms.xml</loc></sitemap><sitemap><loc>https://muster-shop.example/sitemap-products.xml</loc></sitemap></sitemapindex>');
    expect(produktSitemapAusIndex(index)).toBe('https://muster-shop.example/sitemap-products.xml');
  });

  it('takes a product URL from the sitemap, else from homepage links, and ignores other hosts', () => {
    const sitemap = seite('s', '<urlset><url><loc>https://muster-shop.example/</loc></url><url><loc>https://muster-shop.example/products/tisch</loc></url></urlset>');
    expect(findeProduktUrl(home, sitemap, 'muster-shop.example')).toBe('https://muster-shop.example/products/tisch');
    expect(findeProduktUrl(home, null, 'muster-shop.example')).toBe('https://muster-shop.example/tisch-eiche-120.html');
    const fremd = seite('https://muster-shop.example/', '<a href="https://anderer-shop.example/p/123">x</a>');
    expect(findeProduktUrl(fremd, null, 'muster-shop.example')).toBeNull();
  });

  it('prefers product tiles by class and skips cart or account links', () => {
    const kacheln = seite('https://www.muster-shop.example/', '<a href="/kategorie.html">Kategorie</a><a class="product-item-link" href="/checkout/cart/">x</a><a href="https://www.muster-shop.example/tisch-2000743/" class="product relative product-item-photo">Tisch</a>');
    expect(produktLinksNachKlasse(kacheln, 'www.muster-shop.example')).toEqual(['https://www.muster-shop.example/tisch-2000743/']);
    expect(findeProduktUrl(kacheln, null, 'www.muster-shop.example')).toBe('https://www.muster-shop.example/tisch-2000743/');
  });

  it('accepts only pages with a cart button or product markup', () => {
    expect(istProduktseite(seite('p', PRODUKT_OHNE_MARKUP))).toBe(true);
    expect(istProduktseite(seite('p', '<html>Über uns</html>'))).toBe(false);
  });
});
