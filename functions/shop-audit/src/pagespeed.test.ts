import { describe, expect, it } from 'vitest';
import { pagespeed, werteAus } from './pagespeed.js';

const labor = {
  lighthouseResult: {
    categories: { performance: { score: 0.34 } },
    audits: {
      'largest-contentful-paint': { numericValue: 7123.4 },
      'cumulative-layout-shift': { numericValue: 0.123456 },
      'total-byte-weight': { numericValue: 4_200_000 },
      'network-requests': { details: { items: [1, 2, 3] } },
    },
  },
};

describe('werteAus', () => {
  it('uses lab values when there is no field data', () => {
    expect(werteAus(labor, 'mobile')).toEqual({ strategie: 'mobile', score: 34, lcp_ms: 7123, cls: 0.12, inp_ms: null, quelle: 'labor', bytes: 4_200_000, anfragen: 3 });
  });

  it('prefers field data from real users, also at origin level', () => {
    const feld = { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3900 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31 }, INTERACTION_TO_NEXT_PAINT: { percentile: 620 } } };
    expect(werteAus({ ...labor, loadingExperience: feld }, 'mobile')).toMatchObject({ quelle: 'feld', lcp_ms: 3900, cls: 0.31, inp_ms: 620, score: 34 });
    expect(werteAus({ ...labor, loadingExperience: { metrics: {} }, originLoadingExperience: feld }, 'mobile').quelle).toBe('feld');
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
