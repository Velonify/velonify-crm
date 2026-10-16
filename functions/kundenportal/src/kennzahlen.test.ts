import { describe, expect, it } from 'vitest';
import { createDemoBackend } from '../../../src/data/demo/seed';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { liesDaten } from '../../../src/data/tracking';
import type { KundenTracking } from '../../../src/data/types';
import { aktualisiereKennzahlen, holeKennzahlen } from './kennzahlen';

const JETZT = new Date('2026-10-17T05:00:00Z');

/** Answers like Google's APIs, chosen by URL and request body. */
function googleFetch(optionen: { gscStatus?: number } = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const json = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('analyticsdata')) {
      const dims = (body.dimensions as { name: string }[] | undefined)?.[0]?.name;
      if (!dims)
        return json({
          metadata: { currencyCode: 'EUR' },
          rows: [
            { dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '1200' }, { value: '1500' }, { value: '4500.5' }, { value: '30' }] },
            { dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '1000' }, { value: '1250' }, { value: '3000' }, { value: '20' }] },
          ],
        });
      if (dims === 'sessionDefaultChannelGroup') return json({ rows: [{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '700' }, { value: '2000' }] }, { dimensionValues: [{ value: 'Paid Social' }], metricValues: [{ value: '800' }, { value: '2500.5' }] }] });
      return json({ rows: [{ dimensionValues: [{ value: '20261016' }], metricValues: [{ value: '60' }, { value: '150' }] }, { dimensionValues: [{ value: '20261015' }], metricValues: [{ value: '50' }, { value: '100' }] }] });
    }
    if (url.includes('searchAnalytics')) {
      if (optionen.gscStatus) return json({ error: { message: 'User does not have sufficient permission' } }, optionen.gscStatus);
      const dim = (body.dimensions as string[] | undefined)?.[0];
      if (!dim) return json({ rows: [{ clicks: body.startDate === '2026-09-17' ? 400 : 300, impressions: 9000, ctr: 0.044, position: 12.345 }] });
      if (dim === 'query') return json({ rows: [{ keys: ['naturkosmetik'], clicks: 80, impressions: 2000, position: 4.2 }] });
      if (dim === 'page') return json({ rows: [{ keys: ['https://shop.example/'], clicks: 150, impressions: 4000 }] });
      return json({ rows: [{ keys: ['2026-10-14'], clicks: 15, impressions: 300 }] });
    }
    if (url.includes('pagespeedonline')) {
      return json({ lighthouseResult: { categories: { performance: { score: url.includes('strategy=mobile') ? 0.62 : 0.91 } }, audits: { 'largest-contentful-paint': { numericValue: 3100 }, 'cumulative-layout-shift': { numericValue: 0.05 } } } });
    }
    return json({}, 404);
  }) as typeof fetch;
}

const QUELLEN = { ga4_property: '123456789', gsc_site: 'sc-domain:shop.example', pagespeed_url: 'https://shop.example/' };

describe('holeKennzahlen', () => {
  it('reads GA4, Search Console and PageSpeed into one snapshot', async () => {
    const { daten, fehler } = await holeKennzahlen(QUELLEN, { googleToken: async () => 'T', pagespeedKey: 'K', fetch: googleFetch(), jetzt: JETZT });
    expect(fehler).toEqual([]);
    expect(daten.ga4).toMatchObject({ nutzer: 1200, sitzungen: 1500, umsatz: 4500.5, transaktionen: 30, conversion_rate: 0.02, vorher: { sitzungen: 1250 } });
    expect(daten.ga4!.kanaele[0].name).toBe('Paid Social');
    expect(daten.ga4!.verlauf.map((v) => v.tag)).toEqual(['2026-10-15', '2026-10-16']);
    expect(daten.ga4!.zeitraum).toEqual({ von: '2026-09-19', bis: '2026-10-16', vorher_von: '2026-08-22', vorher_bis: '2026-09-18' });
    expect(daten.gsc).toMatchObject({ klicks: 400, position: 12.35, suchanfragen: [{ suchanfrage: 'naturkosmetik' }] });
    expect(daten.pagespeed).toMatchObject({ url: 'https://shop.example/', mobil: { score: 62 }, desktop: { score: 91 } });
  });

  it('names a missing viewer right and keeps the other sources', async () => {
    const { daten, fehler } = await holeKennzahlen(QUELLEN, { googleToken: async () => 'T', pagespeedKey: '', fetch: googleFetch({ gscStatus: 403 }), jetzt: JETZT });
    expect(fehler).toEqual(['Search Console: kein Zugriff – analytics@velonify.de als Betrachter hinzufügen.']);
    expect(daten.gsc).toBeUndefined();
    expect(daten.ga4).toBeDefined();
  });
});

describe('aktualisiereKennzahlen', () => {
  it('stores the snapshot and keeps yesterday’s numbers of a source that failed today', async () => {
    const { sheets, service } = await createDemoBackend(() => 'lukas@velonify.de');
    const store = new SheetStore(sheets);
    const firma = (await service.load()).firmen.find((f) => f.status === 'kunde')!;
    const zeile: KundenTracking = { id: 'TR-1', firma_id: firma.id, ...QUELLEN, sichtbar_kunde: true, stand_am: '', fehler: '', daten: '', erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' };
    await store.insert('kunden_tracking', [zeile]);

    const d = { googleToken: async () => 'T', pagespeedKey: '', jetzt: JETZT };
    expect(await aktualisiereKennzahlen(store, { ...d, fetch: googleFetch() })).toEqual({ kunden: 1, fehler: 0 });
    const erster = (await store.loadPortalDaten()).tracking[0];
    expect(liesDaten(erster)?.gsc?.klicks).toBe(400);

    await aktualisiereKennzahlen(store, { ...d, fetch: googleFetch({ gscStatus: 403 }) });
    const zweiter = (await store.loadPortalDaten()).tracking[0];
    expect(liesDaten(zweiter)?.gsc?.klicks).toBe(400);
    expect(zweiter.fehler).toContain('Search Console: kein Zugriff');
    expect(zweiter.stand_am).toBe(JETZT.toISOString());
  });
});
