import type { Seite } from './laden.js';

/*
 * Marker lists. Platform, payment and part of the marketing markers come from the lead qualifier
 * (CRM/magento-lead-qualifier/src/detect.py in the vault); when a list changes there, change it here too.
 */

const SHOPIFY_HTML = ['cdn.shopify.com', 'cdn.shopifycloud.com', 'shopifycdn.net', 'window.shopify', 'shopifyanalytics', 'shopify.theme', 'myshopify.com', '/cdn/shop/', 'shopify-section', 'shopify_pay'];
const SHOPIFY_HEADERS = ['x-shopid', 'x-shardid', 'x-sorting-hat-shopid', 'x-storefront-renderer-rendered'];

// Magento 2 only. "mage/cookies" is not decisive: Magento 1 ships /js/mage/cookies.js as well.
const M2_DECISIVE = ['/static/version', '/static/frontend/', 'x-magento-init', 'magento_ui/js', 'mage-cache-storage', '/customer/section/load', 'data-mage-init', 'magento_theme'];
const M2_MEDIUM = ['/media/catalog/product/', '/media/wysiwyg/', 'magento', '/checkout/cart/', '/customer/account/'];
const M2_HEADERS = ['x-magento-cache-debug', 'x-magento-tags', 'x-magento-vary'];
const M1_STRONG = ['/skin/frontend/', '/js/mage/', '/js/varien/', 'mage.cookies', 'var/cache/', 'js/prototype/prototype.js'];

const ANDERE_PLATTFORMEN: Record<string, string[]> = {
  shopware6: ['/bundles/storefront/', 'window.router', 'csrf/generate', 'shopware'],
  shopware5: ['/themes/frontend/', '/engine/shopware'],
  woocommerce: ['wp-content/plugins/woocommerce', 'woocommerce-page', 'wc-ajax'],
  oxid: ['/out/azure/', 'oxid-esales', '/oxseo.php'],
  jtl: ['/templates/evo/', '/templates/nova/', 'jtl-shop'],
  prestashop: ['/modules/ps_', 'prestashop'],
  bigcommerce: ['cdn11.bigcommerce.com', 'bigcommerce.com/s-'],
  salesforce_cc: ['/on/demandware.store/', 'demandware.static'],
  wix: ['wix.com', 'wixstatic.com'],
  plentymarkets: ['plentymarkets', '/plenty/'],
  sap_commerce: ['/_ui/responsive/', 'yacceleratorstorefront', 'hybris', '/medias/sys_master/'],
  intershop: ['/intershop/', 'is-bin', 'intershop'],
  spryker: ['spryker', '/assets/current/'],
  epages: ['epages', '/webroot/'],
  xt_commerce: ['xt_commerce', '/xtcore/', 'veyton'],
  gambio: ['gambio', '/gxmodules/'],
};
/** Platforms where a single marker is specific enough. */
const EIN_TREFFER_REICHT = new Set(['woocommerce', 'salesforce_cc', 'jtl', 'oxid']);

export const ZAHLARTEN: Record<string, string[]> = {
  paypal: ['paypal'],
  klarna: ['klarna'],
  apple_pay: ['apple pay', 'applepay', 'apple-pay'],
  google_pay: ['google pay', 'googlepay', 'google-pay'],
  amazon_pay: ['amazon pay', 'amazonpay', 'amazon-pay'],
  rechnung: ['kauf auf rechnung', 'rechnungskauf'],
  sofort: ['sofortüberweisung', 'sofort.com'],
  mollie: ['mollie'],
  adyen: ['adyen'],
  stripe: ['js.stripe.com', 'stripe'],
  payone: ['payone'],
  unzer: ['unzer', 'heidelpay'],
  computop: ['computop'],
};

export const PIXEL: Record<string, string[]> = {
  meta: ['connect.facebook.net', 'fbevents.js', 'fbq('],
  tiktok: ['analytics.tiktok.com', 'ttq.load'],
  pinterest: ['s.pinimg.com/ct/', 'pintrk('],
};

export const CONSENT_TOOLS: Record<string, string[]> = {
  cookiebot: ['cookiebot'],
  usercentrics: ['usercentrics'],
  onetrust: ['onetrust', 'cookielaw.org'],
  borlabs: ['borlabs'],
  ccm19: ['ccm19'],
  consentmanager: ['consentmanager.net', 'consentmanager.mgr'],
  klaro: ['klaro.js', 'klaro.min.js', 'klaroconfig'],
  cookiefirst: ['cookiefirst'],
  iubenda: ['iubenda'],
  didomi: ['didomi'],
  trustarc: ['trustarc'],
  sourcepoint: ['sourcepoint', 'sp-prod.net'],
  shopify: ['customerprivacy', 'shopify-privacy-banner'],
  shopware: ['cookie-permission', 'js-cookie-configuration', 'data-cookie-permission'],
  magento: ['notice-cookie-block', 'cookierestriction'],
  cookieconsent: ['cookieconsent', 'cookie-consent'],
};

export const EMAIL_TOOLS: Record<string, string[]> = {
  klaviyo: ['klaviyo'],
  emarsys: ['emarsys', 'scarabresearch'],
  mailchimp: ['chimpstatic.com', 'list-manage.com', 'mailchimp'],
  cleverreach: ['cleverreach'],
  brevo: ['sibforms.com', 'sendinblue', 'brevo.com'],
  rapidmail: ['rapidmail'],
  newsletter2go: ['newsletter2go'],
  omnisend: ['omnisend'],
  mailerlite: ['mailerlite'],
  hubspot: ['hs-scripts.com', 'hsforms'],
  salesforce_mc: ['exacttarget', 'igodigital'],
  inxmail: ['inxmail'],
  episerver_campaign: ['optivo', 'broadmail'],
};

export const BEWERTUNGEN: Record<string, string[]> = {
  trustedshops: ['trustedshops', 'trusted shops'],
  trustpilot: ['trustpilot'],
  ekomi: ['ekomi'],
  provenexpert: ['provenexpert'],
  shopauskunft: ['shopauskunft'],
  yotpo: ['yotpo'],
  judgeme: ['judge.me', 'judgeme'],
  okendo: ['okendo'],
  stamped: ['stamped.io'],
  reviewsio: ['reviews.io', 'reviews.co.uk'],
  google_reviews: ['google-customer-reviews', 'merchantwidget'],
};

export interface Plattform {
  name: string;
  /** 0–100, how sure the detection is. */
  sicherheit: number;
  version: string;
  edition: string;
  /** Unix seconds of the last static deploy (Magento 2 /static/versionNNN/). */
  deploy_ts: number;
  belege: string[];
}

export interface Merkmale {
  plattform: Plattform;
  /** False when the shop ends up on an unencrypted http:// address after redirects. */
  https: boolean;
  analyse: { ga4: boolean; gtm: boolean; universal_analytics: boolean };
  pixel: string[];
  google_ads: boolean;
  consent: string[];
  email_tools: string[];
  newsletter_formular: boolean;
  zahlarten: string[];
  bewertungen: string[];
  sprachen: string[];
  seo: {
    title: string;
    meta_description: boolean;
    h1: boolean;
    canonical: boolean;
    organization_markup: boolean;
    /** null when no product page could be checked. */
    product_markup: boolean | null;
    product_bewertungen: boolean | null;
    sitemap: boolean | null;
    robots_sperrt_alles: boolean | null;
  };
}

const treffer = (text: string, listen: Record<string, string[]>) =>
  Object.entries(listen)
    .filter(([, nadeln]) => nadeln.some((n) => text.includes(n)))
    .map(([name]) => name);

const blob = (seite: Seite) => `${seite.text} ${Object.entries(seite.headers).map(([k, v]) => `${k}:${v}`).join(' ')}`.toLowerCase();

export function erkennePlattform(home: Seite, magentoVersion: Seite | null): Plattform {
  const p: Plattform = { name: 'unbekannt', sicherheit: 0, version: '', edition: '', deploy_ts: 0, belege: [] };
  const text = blob(home);

  const shopify = [
    ...SHOPIFY_HTML.filter((n) => text.includes(n)),
    ...SHOPIFY_HEADERS.filter((h) => h in home.headers),
  ];
  if (shopify.length > 0) return { ...p, name: 'shopify', sicherheit: 95, belege: shopify.slice(0, 4) };

  const version = magentoVersion?.ok ? /Magento\/(\d+(?:\.\d+)*)\s*\(([^)]+)\)/i.exec(magentoVersion.text.slice(0, 200)) : null;
  if (version) {
    p.version = version[1];
    p.edition = version[2];
    p.belege.push(`/magento_version: ${version[0]}`);
  }
  const ts = /\/static\/version(\d{9,13})\//.exec(text);
  if (ts) p.deploy_ts = Number(ts[1].slice(0, 10));

  const m2Dec = M2_DECISIVE.filter((n) => text.includes(n));
  const m2Head = M2_HEADERS.filter((h) => h in home.headers);
  const m2Soft = M2_MEDIUM.filter((n) => text.includes(n));
  const m1 = M1_STRONG.filter((n) => text.includes(n));

  if (m1.length > 0 && m2Dec.length === 0 && !p.version.startsWith('2')) {
    return { ...p, name: 'magento1', sicherheit: m1.length >= 2 ? 90 : 70, version: p.version || '1', belege: [...p.belege, ...m1.slice(0, 3)] };
  }
  const punkte = m2Dec.length * 30 + m2Head.length * 30 + m2Soft.length * 8;
  if (punkte >= 30 || p.version.startsWith('2')) {
    return { ...p, name: 'magento2', sicherheit: Math.min(98, Math.max(punkte, 60)), belege: [...p.belege, ...m2Dec, ...m2Head, ...m2Soft].slice(0, 5) };
  }
  for (const [name, nadeln] of Object.entries(ANDERE_PLATTFORMEN)) {
    const hits = nadeln.filter((n) => text.includes(n));
    if (hits.length >= 2 || (hits.length === 1 && EIN_TREFFER_REICHT.has(name))) {
      return { ...p, name, sicherheit: 75, belege: hits.slice(0, 3) };
    }
  }
  return p;
}

const jsonLdTypen = (html: string): string[] => {
  const typen: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
      typen.push(...t[1].replace(/[[\]"]/g, '').split(',').map((s) => s.trim().toLowerCase()));
    }
  }
  return typen;
};

const hatMikrodaten = (html: string, typ: string) => new RegExp(`itemtype=["']https?://schema\\.org/${typ}["']`, 'i').test(html);

/** Sitemap check: null = could not be loaded at all, false = loaded but no sitemap. */
export function hatSitemap(seite: Seite | null): boolean | null {
  if (!seite) return null;
  if (seite.status === 0) return null;
  return seite.ok && /<(urlset|sitemapindex)[\s>]/i.test(seite.text);
}

/** True when robots.txt blocks the whole shop for all crawlers ("User-agent: *" followed by "Disallow: /"). */
export function robotsSperrtAlles(seite: Seite | null): boolean | null {
  if (!seite || seite.status === 0) return null;
  if (!seite.ok) return false;
  let fuerAlle = false;
  for (const roh of seite.text.split(/\r?\n/)) {
    const zeile = roh.replace(/#.*/, '').trim().toLowerCase();
    if (zeile.startsWith('user-agent:')) fuerAlle = zeile.slice(11).trim() === '*';
    else if (fuerAlle && /^disallow:\s*\/$/.test(zeile)) return true;
  }
  return false;
}

export function erkenneMerkmale(home: Seite, extra: { magentoVersion: Seite | null; produkt: Seite | null; sitemap: Seite | null; robots: Seite | null }): Merkmale {
  const html = home.text;
  const text = html.toLowerCase();
  const produkt = extra.produkt?.ok ? extra.produkt.text : null;
  const alles = produkt ? `${text} ${produkt.toLowerCase()}` : text;

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1].replace(/\s+/g, ' ').trim().slice(0, 200) ?? '';
  const metaDescription = /<meta[^>]+name=["']description["'][^>]*content=["']\s*[^"'\s][^"']*["']/i.test(html)
    || /<meta[^>]+content=["']\s*[^"'\s][^"']*["'][^>]*name=["']description["']/i.test(html);
  const typenHome = jsonLdTypen(html);
  const typenProdukt = produkt ? jsonLdTypen(produkt) : [];

  return {
    plattform: erkennePlattform(home, extra.magentoVersion),
    https: !home.url.startsWith('http://'),
    analyse: {
      // Measurement IDs are upper case; matching case-sensitively keeps class names like "g-recaptcha" out.
      ga4: /gtag\/js\?id=G-|['"]G-[A-Z0-9]{8,12}['"]/.test(html),
      gtm: /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]{4,9}['"]/.test(html),
      universal_analytics: /['"]UA-\d{4,}-\d+['"]|google-analytics\.com\/analytics\.js/.test(html),
    },
    pixel: treffer(text, PIXEL),
    google_ads: /googleadservices|['"]AW-\d{6,}/.test(html),
    consent: treffer(text, CONSENT_TOOLS),
    email_tools: treffer(text, EMAIL_TOOLS),
    newsletter_formular: /<input[^>]+type=["']email["']/i.test(html) && /newsletter/i.test(html),
    zahlarten: treffer(alles, ZAHLARTEN),
    bewertungen: treffer(alles, BEWERTUNGEN),
    sprachen: [...new Set([...html.matchAll(/hreflang=["']([a-z]{2})(?:-[a-z]{2})?["']/gi)].map((m) => m[1].toLowerCase()))].sort(),
    seo: {
      title,
      meta_description: metaDescription,
      h1: /<h1[\s>]/i.test(html),
      canonical: /<link[^>]+rel=["']canonical["']/i.test(html),
      organization_markup: typenHome.some((t) => t === 'organization' || t === 'onlinestore' || t === 'store') || hatMikrodaten(html, 'Organization'),
      product_markup: produkt ? typenProdukt.includes('product') || typenProdukt.includes('productgroup') || hatMikrodaten(produkt, 'Product') : null,
      product_bewertungen: produkt ? /"aggregaterating"|itemprop=["']aggregaterating["']/i.test(produkt) : null,
      sitemap: hatSitemap(extra.sitemap),
      robots_sperrt_alles: robotsSperrtAlles(extra.robots),
    },
  };
}

const PRODUKT_PFAD = /\/(products?|produkte?|artikel|detail|p|item)\/[^/?#]+|-p\d{3,}|\/\d{5,}(?:\.html)?$|\.html$/i;
const AUSGESCHLOSSEN = /\/(cart|warenkorb|checkout|kasse|account|konto|login|customer|kontakt|contact|impressum|datenschutz|agb|blog|magazin|faq|hilfe|help|search|suche)(\/|\.html|$)/i;
/** Class names shop themes put on links to product pages (Magento, Shopware, Shopify and most custom themes). */
const PRODUKT_KLASSE = /class=["'][^"']*\bproduct[-_](?:item|link|name|title|photo|image|card|tile|list-item|box)/i;

function eigeneUrl(basis: string, host: string) {
  const ohneWww = host.replace(/^www\./, '');
  return (href: string): string | null => {
    try {
      const u = new URL(href.replace(/&amp;/g, '&'), basis);
      return u.hostname.replace(/^www\./, '') === ohneWww && /^https?:$/.test(u.protocol) && !AUSGESCHLOSSEN.test(u.pathname) ? u.toString() : null;
    } catch {
      return null;
    }
  };
}

/** Links whose <a> tag carries a product class, e.g. the product tiles on a homepage or category page. */
export function produktLinksNachKlasse(seite: Seite, host: string): string[] {
  const eigene = eigeneUrl(seite.url || `https://${host}/`, host);
  const links: string[] = [];
  for (const tag of seite.text.matchAll(/<a\b[^>]*>/gi)) {
    if (!PRODUKT_KLASSE.test(tag[0])) continue;
    const href = /href=["']([^"'#]+)["']/i.exec(tag[0]);
    const url = href ? eigene(href[1]) : null;
    if (url && !links.includes(url)) links.push(url);
  }
  return links;
}

/**
 * Picks one product URL on the shop's own host: a product tile on the homepage, else a product-looking URL from the
 * sitemap, else a product-looking link on the homepage. Returns null when nothing looks like a product.
 */
export function findeProduktUrl(home: Seite, sitemap: Seite | null, host: string): string | null {
  const nachKlasse = produktLinksNachKlasse(home, host)[0];
  if (nachKlasse) return nachKlasse;
  const eigene = eigeneUrl(home.url || `https://${host}/`, host);
  if (sitemap?.ok && /<urlset/i.test(sitemap.text)) {
    const locs = [...sitemap.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => eigene(m[1]));
    const kandidat = locs.find((u): u is string => Boolean(u) && PRODUKT_PFAD.test(new URL(u!).pathname));
    if (kandidat) return kandidat;
  }
  const links = [...home.text.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => eigene(m[1]));
  return links.find((u): u is string => Boolean(u) && PRODUKT_PFAD.test(new URL(u!).pathname)) ?? null;
}

/** For a sitemap index: the child sitemap that most likely lists products, else the first one. */
export function produktSitemapAusIndex(sitemap: Seite): string | null {
  if (!sitemap.ok || !/<sitemapindex/i.test(sitemap.text)) return null;
  const kinder = [...sitemap.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]);
  return kinder.find((k) => /product|produkt|artikel|catalog/i.test(k)) ?? kinder[0] ?? null;
}

/** A loaded page counts as a product page only if it has an add-to-cart control or product markup. */
export function istProduktseite(seite: Seite): boolean {
  if (!seite.ok) return false;
  const t = seite.text.toLowerCase();
  return /in den warenkorb|add to cart|add to bag|zum warenkorb hinzufügen|jetzt kaufen|name=["']add["']|product-addtocart|btn-buy/.test(t)
    || jsonLdTypen(seite.text).includes('product') || hatMikrodaten(seite.text, 'Product');
}
