/**
 * Shop systems for the lead pool: how HTTP Archive (Wappalyzer) names them, and how the
 * pool ranks candidates before any live check. Everything here is only a first sort —
 * the live check decides whether a shop really qualifies.
 */

export interface System {
  /** Our key, stored in the pool. */
  id: string;
  label: string;
  /** Wappalyzer technology names that mean this system. */
  technik: string[];
  /**
   * When a page shows several systems (e.g. WooCommerce on a site that also links a
   * Shopware shop), the lowest value wins. Specific platforms beat generic ones.
   */
  vorrang: number;
}

export const SYSTEME: System[] = [
  { id: 'magento', label: 'Magento', technik: ['Magento', 'Hyva Themes'], vorrang: 10 },
  { id: 'shopware', label: 'Shopware', technik: ['Shopware'], vorrang: 10 },
  { id: 'oxid', label: 'OXID eShop', technik: ['OXID eShop', 'OXID eShop Community Edition', 'OXID eShop Professional Edition', 'OXID eShop Enterprise Edition'], vorrang: 10 },
  { id: 'jtl', label: 'JTL-Shop', technik: ['JTL Shop'], vorrang: 10 },
  { id: 'gambio', label: 'Gambio', technik: ['Gambio'], vorrang: 10 },
  { id: 'plentymarkets', label: 'plentymarkets', technik: ['plentymarkets', 'plentyShop LTS'], vorrang: 10 },
  { id: 'xtcommerce', label: 'xt:Commerce', technik: ['xtCommerce'], vorrang: 10 },
  { id: 'modified', label: 'modified eCommerce', technik: ['Modified'], vorrang: 10 },
  { id: 'oscommerce', label: 'osCommerce', technik: ['osCommerce'], vorrang: 10 },
  { id: 'smartstore', label: 'Smartstore', technik: ['Smartstore', 'Smartstore biz'], vorrang: 10 },
  { id: 'sfcc', label: 'Salesforce Commerce Cloud', technik: ['Salesforce Commerce Cloud'], vorrang: 10 },
  { id: 'sap', label: 'SAP Commerce Cloud', technik: ['SAP Commerce Cloud'], vorrang: 10 },
  { id: 'intershop', label: 'Intershop', technik: ['Intershop'], vorrang: 10 },
  { id: 'hcl', label: 'HCL Commerce', technik: ['HCL Commerce'], vorrang: 10 },
  { id: 'spryker', label: 'Spryker', technik: ['Spryker'], vorrang: 10 },
  { id: 'novomind', label: 'novomind iSHOP', technik: ['novomind iSHOP'], vorrang: 10 },
  { id: 'websale', label: 'Websale', technik: ['Websale'], vorrang: 10 },
  { id: 'xanario', label: 'Xanario', technik: ['Xanario'], vorrang: 10 },
  { id: 'afterbuy', label: 'Afterbuy', technik: ['AfterBuy'], vorrang: 10 },
  { id: 'prestashop', label: 'PrestaShop', technik: ['PrestaShop'], vorrang: 20 },
  { id: 'opencart', label: 'OpenCart', technik: ['OpenCart'], vorrang: 20 },
  { id: 'nopcommerce', label: 'nopCommerce', technik: ['nopCommerce'], vorrang: 20 },
  { id: 'bigcommerce', label: 'BigCommerce', technik: ['BigCommerce'], vorrang: 20 },
  { id: 'lightspeed', label: 'Lightspeed eCom', technik: ['Lightspeed eCom'], vorrang: 20 },
  { id: 'epages', label: 'ePages', technik: ['ePages'], vorrang: 20 },
  { id: 'ccvshop', label: 'CCV Shop', technik: ['CCV Shop'], vorrang: 20 },
  { id: 'craft', label: 'Craft Commerce', technik: ['Craft Commerce'], vorrang: 20 },
  { id: 'woocommerce', label: 'WooCommerce', technik: ['WooCommerce'], vorrang: 30 },
  { id: 'wix', label: 'Wix eCommerce', technik: ['Wix eCommerce'], vorrang: 40 },
  { id: 'squarespace', label: 'Squarespace Commerce', technik: ['Squarespace Commerce'], vorrang: 40 },
  { id: 'webflow', label: 'Webflow Ecommerce', technik: ['Webflow Ecommerce'], vorrang: 40 },
  { id: 'ecwid', label: 'Ecwid', technik: ['Ecwid'], vorrang: 40 },
];

/** Technologies that rule a site out of the pool entirely. */
export const AUSSCHLUSS_TECHNIK = ['Shopify', 'Shopify Plus'];

/**
 * Reasons to get in touch that can already be read from HTTP Archive / CrUX. `gewicht`
 * only orders the pool; the live check re-derives every reason from fresh data.
 */
export const VORAB_ANLAESSE = {
  system_ohne_support: { label: 'System ohne Support', gewicht: 50 },
  magento2: { label: 'Magento 2 (Version prüfen)', gewicht: 30 },
  langsam: { label: 'LCP echter Nutzer > 4 s', gewicht: 25 },
  lange_unveraendert: { label: 'seit ≥ 5 Jahren auf demselben System', gewicht: 15 },
  eher_langsam: { label: 'LCP echter Nutzer > 2,5 s', gewicht: 10 },
} as const;

export type VorabAnlass = keyof typeof VORAB_ANLAESSE;

/**
 * Systems (and major versions) that no longer get security updates, as far as the
 * HTTP Archive version string shows. Matched against `<system id> <version>`.
 */
export const OHNE_SUPPORT_MUSTER = [
  '^magento 1',
  '^shopware [345]\\b',
  '^oxid [45]\\b',
  '^xtcommerce',
  '^oscommerce',
];

/** Reach in Germany (CrUX rank bucket) → points. Buckets are 1k, 5k, 10k, 50k, 100k, 500k, 1M, 5M … */
export const REICHWEITE_PUNKTE: [maxRang: number, punkte: number][] = [
  [10_000, 40],
  [50_000, 32],
  [100_000, 25],
  [500_000, 15],
  [1_000_000, 5],
];

/** LCP thresholds in ms (p75 of real phone users, CrUX). */
export const LCP_LANGSAM_MS = 4000;
export const LCP_EHER_LANGSAM_MS = 2500;
export const LANGE_UNVERAENDERT_JAHRE = 5;
