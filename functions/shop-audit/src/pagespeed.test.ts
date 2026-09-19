import { describe, expect, it } from 'vitest';
import { pagespeed, skripteAus, werteAus, type PsiAntwort } from './pagespeed.js';

// Shaped like a Lighthouse 13 result from PageSpeed Insights with locale=de.
const labor: PsiAntwort = {
  lighthouseResult: {
    categories: { performance: { score: 0.34 } },
    audits: {
      'largest-contentful-paint': { numericValue: 7123.4 },
      'cumulative-layout-shift': { numericValue: 0.123456 },
      'first-contentful-paint': { numericValue: 1846.03 },
      'total-blocking-time': { numericValue: 812 },
      'server-response-time': { score: 1, numericValue: 66, details: { type: 'opportunity', overallSavingsMs: 0 } },
      'total-byte-weight': { numericValue: 4_200_000 },
      'network-requests': {
        details: {
          items: [
            { url: 'https://muster-shop.example/', resourceType: 'Document' },
            { url: 'https://static.klaviyo.com/onsite/js/klaviyo.js', resourceType: 'Script' },
            { url: 'https://muster-shop.example/app.js', resourceType: 'Script' },
          ],
        },
      },
      'render-blocking-insight': { score: 0, title: 'Anfragen zum Blockieren des Renderings', displayValue: 'Geschätzte Einsparung von 430 ms', metricSavings: { FCP: 450, LCP: 0 } },
      'unused-javascript': { score: 0.5, title: 'Reduziere nicht verwendetes JavaScript', displayValue: 'Geschätzte Einsparung von 513 KiB', metricSavings: { FCP: 0, LCP: 0 }, details: { type: 'opportunity', overallSavingsBytes: 524878 } },
      'image-delivery-insight': { score: 0.5, title: 'Bildübermittlung verbessern', displayValue: 'Geschätzte Einsparung von 1.536 KiB', metricSavings: { FCP: 0, LCP: 0 } },
      'legacy-javascript-insight': { score: 0.5, title: 'Veraltetes JavaScript', displayValue: 'Geschätzte Einsparung von 15 KiB', metricSavings: { FCP: 0, LCP: 0 } },
      'mainthread-work-breakdown': { score: 0, title: 'Aufwand für Hauptthread minimieren', metricSavings: { TBT: 250 } },
      'third-parties-insight': {
        score: 1,
        details: {
          items: [
            { entity: 'Google Tag Manager', mainThreadTime: 142.7, transferSize: 886993 },
            { entity: 'Facebook', mainThreadTime: 910.2, transferSize: 120000 },
          ],
        },
      },
    },
  },
};

describe('werteAus', () => {
  it('uses lab values when there is no field data', () => {
    const m = werteAus(labor, 'mobile');
    expect(m).toMatchObject({ strategie: 'mobile', score: 34, lcp_ms: 7123, cls: 0.12, inp_ms: null, quelle: 'labor', bytes: 4_200_000, anfragen: 3, fcp_ms: 1846, tbt_ms: 812, ttfb_ms: 66, felddaten: 'keine' });
  });

  it('ranks the biggest savings by time, then by size, and skips small ones', () => {
    expect(werteAus(labor, 'mobile').bremsen.map((b) => [b.id, b.ms, b.bytes])).toEqual([
      ['render-blocking-insight', 450, 0],
      ['image-delivery-insight', 0, 1_572_864],
      ['unused-javascript', 0, 524878],
    ]);
    expect(werteAus(labor, 'mobile').bremsen[0].titel).toBe('Anfragen zum Blockieren des Renderings');
  });

  it('lists third parties by main-thread time', () => {
    expect(werteAus(labor, 'mobile').drittanbieter).toEqual([
      { name: 'Facebook', kb: 117, ms: 910 },
      { name: 'Google Tag Manager', kb: 866, ms: 143 },
    ]);
  });

  it('prefers field data from real users and tells page from origin data', () => {
    const feld = { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3900 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31 }, INTERACTION_TO_NEXT_PAINT: { percentile: 620 }, EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 1400 } } };
    expect(werteAus({ ...labor, loadingExperience: feld }, 'mobile')).toMatchObject({ quelle: 'feld', lcp_ms: 3900, cls: 0.31, inp_ms: 620, ttfb_ms: 1400, score: 34, felddaten: 'seite' });
    expect(werteAus({ ...labor, loadingExperience: { ...feld, origin_fallback: true } }, 'mobile').felddaten).toBe('origin');
    expect(werteAus({ ...labor, loadingExperience: { metrics: {} }, originLoadingExperience: feld }, 'mobile')).toMatchObject({ quelle: 'feld', felddaten: 'origin' });
  });

  it('returns the script URLs of the lab run for technology detection', () => {
    expect(skripteAus(labor)).toEqual(['https://static.klaviyo.com/onsite/js/klaviyo.js', 'https://muster-shop.example/app.js']);
  });
});

describe('pagespeed', () => {
  it('passes the key and reports API errors readably', async () => {
    let aufgerufen = '';
    const fehler = (async (url: string) => {
      aufgerufen = url;
      return { ok: false, status: 400, json: async () => ({ error: { message: 'Lighthouse returned error: NO_FCP' } }) } as Response;
    }) as typeof fetch;
    await expect(pagespeed('https://muster-shop.example/', 'mobile', 'geheim', fehler)).rejects.toThrow('PageSpeed 400: Lighthouse returned error: NO_FCP');
    expect(aufgerufen).toContain('key=geheim');
    expect(aufgerufen).toContain('strategy=mobile');
  });
});
