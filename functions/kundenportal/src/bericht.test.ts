import { describe, expect, it } from 'vitest';
import { createDemoBackend } from '../../../src/data/demo/seed';
import { liesBericht } from '../../../src/data/monatsbericht';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import { erstelleBerichte } from './bericht';

/** GA4 and Search Console answers with the requested date range in the numbers, to see which month was asked for. */
const googleFetch = (status = 200): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as { dateRanges?: { startDate: string }[]; startDate?: string; dimensions?: unknown[] };
    const json = (daten: unknown, s = status) => new Response(JSON.stringify(daten), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('analyticsdata')) {
      if (body.dimensions) return json({ rows: [] });
      return json({ rows: [{ dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '100' }, { value: body.dateRanges![0].startDate === '2026-10-01' ? '1000' : '1' }, { value: '500' }, { value: '10' }] }] });
    }
    if (url.includes('searchAnalytics')) return json({ rows: body.dimensions ? [] : [{ clicks: body.startDate === '2026-10-01' ? 300 : 200, impressions: 9000, ctr: 0.03, position: 9 }] });
    return json({}, 404);
  }) as typeof fetch;

async function aufbau() {
  const { sheets, service } = await createDemoBackend(() => 'lukas@velonify.de');
  const store = new SheetStore(sheets);
  const portal = await store.loadPortalDaten();
  const t = portal.tracking[0];
  // The demo comes with a draft of last month; these tests work on October 2026.
  await store.update('kunden_tracking', [{ id: t.id, changes: { ga4_property: '123456789', gsc_site: 'sc-domain:shop.example' } }]);
  return { store, service, firmaId: t.firma_id };
}

describe('erstelleBerichte', () => {
  it('drafts the report with the numbers of the calendar month and keeps them when a source fails later', async () => {
    const { store, firmaId } = await aufbau();
    const d = { googleToken: async () => 'T', pagespeedKey: '', jetzt: new Date('2026-11-01T05:00:00Z') };

    expect(await erstelleBerichte(store, { ...d, fetch: googleFetch() })).toEqual({ neu: 1, aktualisiert: 0, fehler: 0 });
    const bericht = () => store.loadPortalDaten().then((p) => p.berichte.find((b) => b.monat === '2026-10')!);
    const erster = await bericht();
    expect(erster).toMatchObject({ firma_id: firmaId, status: 'entwurf' });
    expect(liesBericht(erster)?.zahlen.ga4).toMatchObject({ sitzungen: 1000, zeitraum: { von: '2026-10-01', bis: '2026-10-31' } });
    expect(liesBericht(erster)?.zahlen.gsc?.klicks).toBe(300);

    // A day later GA4 refuses: the draft is recalculated, the October numbers stay, the team sees why.
    expect(await erstelleBerichte(store, { ...d, jetzt: new Date('2026-11-02T05:00:00Z'), fetch: googleFetch(403) })).toMatchObject({ neu: 0, aktualisiert: 1 });
    const zweiter = liesBericht(await bericht());
    expect(zweiter?.zahlen.ga4?.sitzungen).toBe(1000);
    expect(zweiter?.fehler?.[0]).toContain('kein Zugriff');
  });

  it('leaves released reports alone and does nothing outside the first week', async () => {
    const { store, service } = await aufbau();
    const d = { googleToken: async () => 'T', pagespeedKey: '', fetch: googleFetch() };
    expect(await erstelleBerichte(store, { ...d, jetzt: new Date('2026-11-15T05:00:00Z') })).toEqual({ neu: 0, aktualisiert: 0, fehler: 0 });

    await erstelleBerichte(store, { ...d, jetzt: new Date('2026-11-01T05:00:00Z') });
    const oktober = (await store.loadPortalDaten()).berichte.find((b) => b.monat === '2026-10')!;
    await service.freigebenBericht(oktober.id, true);
    expect(await erstelleBerichte(store, { ...d, jetzt: new Date('2026-11-03T05:00:00Z') })).toEqual({ neu: 0, aktualisiert: 0, fehler: 0 });
    // The hub may draft any finished month for one client at any time.
    expect(await erstelleBerichte(store, { ...d, jetzt: new Date('2026-11-15T05:00:00Z') }, { firmaId: oktober.firma_id, monat: '2026-08' })).toMatchObject({ neu: 1 });
  });
});
