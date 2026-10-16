import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import { findeBerechtigung, kundensicht, vorschauBerechtigung } from './portalApi';
import { prepareTracking, veraenderung, zeitraum, type TrackingDaten } from './tracking';

const leer = { ga4_property: '', gsc_site: '', pagespeed_url: '', sichtbar_kunde: false };

describe('prepareTracking', () => {
  it('cleans GA4, Search Console and PageSpeed input', () => {
    expect(prepareTracking({ ga4_property: ' properties/123456789 ', gsc_site: 'Shop.Example.de', pagespeed_url: 'shop.example.de', sichtbar_kunde: true })).toEqual({
      ga4_property: '123456789',
      gsc_site: 'sc-domain:shop.example.de',
      pagespeed_url: 'https://shop.example.de',
      sichtbar_kunde: true,
    });
    expect(prepareTracking({ ...leer, gsc_site: 'https://www.shop.example' }).gsc_site).toBe('https://www.shop.example/');
    expect(() => prepareTracking({ ...leer, ga4_property: 'G-ABC123' })).toThrow(ValidationError);
    expect(() => prepareTracking({ ...leer, gsc_site: 'kein domain' })).toThrow(ValidationError);
  });

  it('compares 28 days with the 28 before', () => {
    expect(zeitraum(new Date('2026-10-17T05:00:00Z'))).toEqual({ von: '2026-09-19', bis: '2026-10-16', vorher_von: '2026-08-22', vorher_bis: '2026-09-18' });
    expect(veraenderung(110, 100)).toBe(10);
    expect(veraenderung(5, 0)).toBeNull();
  });
});

describe('Tracking im Hub und im Portal', () => {
  it('saves one row per client and shows the numbers only when released (always in the team access)', async () => {
    const { service } = await createDemoBackend(() => 'lukas@velonify.de');
    const db = await service.load();
    const berechtigung = findeBerechtigung(db, await service.loadPortalDaten(), 'sophie@alpenglanz.example')!;
    const firma = berechtigung.firma;

    const erst = await service.saveTracking(firma.id, { ...leer, ga4_property: '123456789' });
    const zweit = await service.saveTracking(firma.id, { ...leer, ga4_property: '123456789', gsc_site: 'alpenglanz.example' });
    expect(zweit.id).toBe(erst.id);
    expect((await service.loadPortalDaten()).tracking).toHaveLength(1);

    const daten: TrackingDaten = { pagespeed: { url: 'https://alpenglanz.example/', mobil: { score: 60, lcp_ms: 3000, cls: 0.1, inp_ms: null, quelle: 'labor' }, desktop: null } };
    const portal = await service.loadPortalDaten();
    portal.tracking[0] = { ...portal.tracking[0], daten: JSON.stringify(daten), stand_am: '2026-10-17T05:00:00Z' };
    const basis = { db, kunden: await service.loadKundenDaten(), todos: await service.loadTodoDaten(), portal, dateien: [], teamDomain: 'velonify.de' };

    expect(kundensicht({ ...basis, berechtigung }).zahlen).toBeNull();
    expect(kundensicht({ ...basis, berechtigung: vorschauBerechtigung(db, firma.id, 'lukas@velonify.de')!, vorschau: 'lukas@velonify.de' }).zahlen).toMatchObject({ sichtbar_kunde: false, daten });

    portal.tracking[0] = { ...portal.tracking[0], sichtbar_kunde: true };
    expect(kundensicht({ ...basis, berechtigung }).zahlen?.daten.pagespeed?.mobil?.score).toBe(60);
  });
});
