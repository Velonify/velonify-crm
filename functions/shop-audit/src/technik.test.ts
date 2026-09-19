import { describe, expect, it } from 'vitest';
import { baueKatalog, erkenneTechnik, katalog, muster } from './technik.js';

// webappanalyzer separates regex and options with a literal backslash-semicolon.
const T = '\\;';

// A tiny catalogue in webappanalyzer's format.
const kat = baueKatalog(
  {
    Magento: { cats: [6], website: 'https://magento.example', cookies: { 'mage-cache-storage': '' }, html: ['<script[^>]+data-requiremodule="mage/'], implies: 'PHP' },
    PHP: { cats: [27], website: '', headers: { 'X-Powered-By': `^php/?([\\d.]+)?${T}version:\\1` } },
    Klaviyo: { cats: [32], website: '', scriptSrc: ['klaviyo\\.com'] },
    Etracker: { cats: [10], website: '', scripts: ['_etracker\\.'] },
    Cookiebot: { cats: [67], website: '', scriptSrc: ['consent\\.cookiebot\\.com'] },
    'Hyva Themes': { cats: [108], website: '', dom: { 'link[href*="/Hyva/"]': { exists: '' } }, requires: 'Magento' },
    Preact: { cats: [59], website: '', dom: { body: { properties: { __k: '' } } } },
    'Leise Sache': { cats: [59], website: '', html: [`leise-sache${T}confidence:25`] },
    Kaputt: { cats: [59], website: '', html: ['(unclosed'] },
  },
  {
    '6': { name: 'Ecommerce' },
    '10': { name: 'Analytics' },
    '27': { name: 'Programming languages' },
    '32': { name: 'Marketing automation' },
    '59': { name: 'JavaScript libraries' },
    '67': { name: 'Cookie compliance' },
    '108': { name: 'Ecommerce frontends' },
  },
);

const seite = (html: string, extra: Partial<Parameters<typeof erkenneTechnik>[0]> = {}) => ({ url: 'https://muster-shop.example/', html, headers: {}, cookies: {}, ...extra });
const namen = (html: string, extra: Partial<Parameters<typeof erkenneTechnik>[0]> = {}) => erkenneTechnik(seite(html, extra), kat).map((t) => t.name);

describe('muster', () => {
  it('reads version and confidence and drops invalid regexes', () => {
    expect(muster(`^php/?([\\d.]+)?${T}version:\\1`)).toMatchObject({ version: '\\1', confidence: 100 });
    expect(muster(`abc${T}confidence:50`)?.confidence).toBe(50);
    expect(muster('(unclosed')).toBeNull();
  });
});

describe('erkenneTechnik', () => {
  it('matches script URLs, inline scripts, headers with versions and cookies, and adds implied technologies', () => {
    const t = erkenneTechnik(
      seite('<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script><script>var _etracker.x = 1</script>', {
        headers: { 'x-powered-by': 'PHP/8.2.1' },
        cookies: { 'mage-cache-storage': '{}' },
      }),
      kat,
    );
    expect(t.map((x) => x.name)).toEqual(['Etracker', 'Klaviyo', 'Magento', 'PHP']);
    expect(t.find((x) => x.name === 'PHP')).toMatchObject({ version: '8.2.1', kategorien: ['Programming languages'] });
  });

  it('uses script URLs from PageSpeed that are not in the HTML', () => {
    expect(namen('<html></html>', { skripte: ['https://consent.cookiebot.com/uc.js'] })).toEqual(['Cookiebot']);
  });

  it('checks CSS selectors and requirements', () => {
    expect(namen('<link href="/static/Hyva/default/styles.css">')).toEqual([]);
    expect(namen('<link href="/static/Hyva/default/styles.css"><script data-requiremodule="mage/cookies"></script>')).toEqual(['Hyva Themes', 'Magento', 'PHP']);
  });

  it('ignores runtime-only rules, weak matches and broken patterns', () => {
    expect(namen('<body>leise-sache (unclosed</body>')).toEqual([]);
  });
});

describe('katalog', () => {
  it('loads the downloaded webappanalyzer data', () => {
    const k = katalog();
    expect(k?.technik.length).toBeGreaterThan(5000);
    expect(k?.kategorien.get(67)).toBe('Cookie compliance');
  });
});
