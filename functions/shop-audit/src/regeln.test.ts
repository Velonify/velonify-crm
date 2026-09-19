import { describe, expect, it } from 'vitest';
import { erkenneMerkmale } from './merkmale.js';
import type { Messung } from './pagespeed.js';
import { befundeAus, kurzfassung, magentoEol } from './regeln.js';
import { MAGENTO_HOME, PRODUKT_OHNE_MARKUP, seite } from './testhilfen.js';

const HEUTE = new Date('2026-09-18T12:00:00Z');
const messung = (teil: Partial<Messung>): Messung => ({ strategie: 'mobile', score: 80, lcp_ms: 2000, cls: 0.05, inp_ms: 150, quelle: 'feld', bytes: null, anfragen: null, fcp_ms: 900, tbt_ms: 100, ttfb_ms: 400, felddaten: 'seite', bremsen: [], drittanbieter: [], ...teil });
const merkmale = erkenneMerkmale(seite('https://muster-shop.example/', MAGENTO_HOME), {
  magentoVersion: seite('v', 'Magento/2.4.6 (Community)'),
  produkt: seite('p', PRODUKT_OHNE_MARKUP),
  sitemap: seite('s', '<urlset></urlset>'),
  robots: seite('r', ''),
});

describe('magentoEol', () => {
  it('uses the Adobe lifecycle table', () => {
    expect(magentoEol('2.4.6', HEUTE)).toEqual({ status: 'eol', datum: '2026-08-11' });
    expect(magentoEol('2.4.6-p9', HEUTE).status).toBe('eol');
    expect(magentoEol('2.4.7', HEUTE)).toEqual({ status: 'eol_soon', datum: '2027-05-31' });
    expect(magentoEol('2.4.8', HEUTE).status).toBe('supported');
    expect(magentoEol('2.3.7', HEUTE).status).toBe('eol');
    expect(magentoEol('2.4', HEUTE).status).toBe('unknown');
  });
});

describe('befundeAus', () => {
  const befunde = befundeAus({ merkmale, mobil: messung({ lcp_ms: 5800, score: 34 }), desktop: messung({ strategie: 'desktop', score: 70 }), heute: HEUTE });
  const ids = befunde.map((b) => b.id);

  it('derives the expected findings for the sample shop', () => {
    expect(ids).toEqual(expect.arrayContaining([
      'plattform_magento_eol', 'plattform_alter_deploy', 'speed_lcp_mobil', 'speed_score_mobil',
      'tracking_ohne_consent', 'email_kein_tool', 'shop_zahlarten', 'shop_keine_bewertungen', 'seo_meta_description', 'seo_product_markup',
    ]));
    expect(ids).not.toContain('tracking_keine_analyse');
    expect(ids).not.toContain('seo_sitemap');
  });

  it('writes measured values into the text, German style', () => {
    const lcp = befunde.find((b) => b.id === 'speed_lcp_mobil')!;
    expect(lcp).toMatchObject({ schwere: 'hoch', wert: '5800 ms' });
    expect(lcp.text).toContain('5,8 s');
    expect(lcp.text).toContain('echten Nutzern');
    expect(befunde.find((b) => b.id === 'plattform_magento_eol')!.text).toContain('11.08.2026');
    expect(befunde.find((b) => b.id === 'tracking_ohne_consent')!.text).toBe('Meta-Pixel und Google Analytics sind direkt eingebunden, aber kein bekanntes Consent-Tool ist erkennbar.');
  });

  it('sorts by severity', () => {
    const rang = { hoch: 0, mittel: 1, hinweis: 2 };
    expect(befunde.map((b) => rang[b.schwere])).toEqual([...befunde.map((b) => rang[b.schwere])].sort());
  });

  it('does not report missing pixels when a tag manager could load them', () => {
    const mitGtm = { ...merkmale, pixel: [], analyse: { ga4: false, gtm: true, universal_analytics: false, andere: [] } };
    const ids2 = befundeAus({ merkmale: mitGtm, mobil: null, desktop: null, heute: HEUTE }).map((b) => b.id);
    expect(ids2).not.toContain('tracking_keine_pixel');
    expect(ids2).not.toContain('tracking_kein_ads');
    expect(ids2).not.toContain('tracking_keine_analyse');
  });

  it('does not report a missing signup for tools that use pop-ups', () => {
    const mitKlaviyo = { ...merkmale, email_tools: ['klaviyo'], newsletter_formular: false };
    expect(befundeAus({ merkmale: mitKlaviyo, mobil: null, desktop: null, heute: HEUTE }).map((b) => b.id)).not.toContain('email_keine_anmeldung');
    const mitCleverReach = { ...merkmale, email_tools: ['cleverreach'], newsletter_formular: false };
    const befund = befundeAus({ merkmale: mitCleverReach, mobil: null, desktop: null, heute: HEUTE }).find((b) => b.id === 'email_keine_anmeldung');
    expect(befund?.schwere).toBe('hinweis');
  });

  it('reports slow servers, blocking time, the biggest savings and heavy third parties', () => {
    const langsam = messung({
      ttfb_ms: 1900,
      tbt_ms: 900,
      bremsen: [
        { id: 'image-delivery-insight', titel: 'Bildübermittlung verbessern', anzeige: 'Geschätzte Einsparung von 1.536 KiB', ms: 0, bytes: 1_572_864 },
        { id: 'unused-javascript', titel: 'Reduziere nicht verwendetes JavaScript', anzeige: 'Geschätzte Einsparung von 513 KiB', ms: 0, bytes: 524_878 },
        { id: 'legacy-javascript-insight', titel: 'Veraltetes JavaScript', anzeige: '', ms: 0, bytes: 400_000 },
      ],
      drittanbieter: [
        { name: 'Facebook', kb: 117, ms: 910 },
        { name: 'Hotjar', kb: 80, ms: 300 },
        { name: 'Kleinkram', kb: 1, ms: 10 },
      ],
    });
    const b = befundeAus({ merkmale: null, mobil: langsam, desktop: null, heute: HEUTE });
    const nach = (id: string) => b.find((x) => x.id === id);
    expect(nach('speed_ttfb')).toMatchObject({ schwere: 'hoch', text: 'Der Server braucht 1,9 s, bis er überhaupt antwortet (gemessen bei echten Nutzern; gut ist unter 0,8 s).' });
    expect(nach('speed_tbt')?.text).toContain('0,9 s');
    expect(nach('speed_bremse_image-delivery-insight')).toMatchObject({ schwere: 'mittel', text: 'Bremse laut Google: „Bildübermittlung verbessern“ (1.536 KiB weniger).' });
    expect(nach('speed_bremse_unused-javascript')?.schwere).toBe('hinweis');
    expect(nach('speed_bremse_legacy-javascript-insight')).toBeUndefined();
    expect(nach('speed_drittanbieter')?.text).toBe('Fremd-Scripte beanspruchen mobil 1,2 s Rechenzeit, vor allem Facebook und Hotjar.');
  });

  it('counts other analytics tools like etracker as analytics', () => {
    const mitEtracker = { ...merkmale, analyse: { ga4: false, gtm: false, universal_analytics: false, andere: ['Etracker'] } };
    expect(befundeAus({ merkmale: mitEtracker, mobil: null, desktop: null, heute: HEUTE }).map((x) => x.id)).not.toContain('tracking_keine_analyse');
  });

  it('turns nothing into findings when nothing was measured', () => {
    expect(befundeAus({ merkmale: null, mobil: null, desktop: null, heute: HEUTE })).toEqual([]);
    expect(kurzfassung([])).toBe('Keine auffälligen Befunde.');
  });
});
