import { describe, expect, it } from 'vitest';
import { leereFirma, type Firma } from './impressum.js';
import { supportStatus, systemVon } from './lebenszyklus.js';
import { qualifiziere, type Pruefdaten } from './qualifizierung.js';

const HEUTE = new Date('2026-09-19T12:00:00Z');

const firma = (extra: Partial<Firma> = {}): Firma => ({
  ...leereFirma(), gefunden: true, name: 'Muster GmbH', rechtsform: 'GmbH', register: 'HRB 1', registergericht: 'Köln', plz: '50667', ort: 'Köln', land: 'DE', ...extra,
});

/** A qualified Shopware 5 shop; each test changes one thing. */
const daten = (extra: Partial<Pruefdaten> = {}): Pruefdaten => ({
  erreichbar: { ok: true, status: 200, fehler: '', weitergeleitet_nach: '' },
  system: { id: 'shopware', label: 'Shopware', version: '5', sicherheit: 75, deploy_ts: 0 },
  support: supportStatus('shopware', '5', HEUTE),
  shopify_dns: false,
  signale: { titel: 'Muster Shop', beschreibung: '', warenkorb: ['warenkorb'], preise: true, agentur: [], kein_haendler: [], geschlossen: '', geparkt: false, copyright_jahr: 2026, social: {} },
  firma: firma(),
  sitemap: { gefunden: true, urls: 1200, produkt_urls: 1000, neuestes_lastmod: '2026-09-01' },
  zahlarten: ['paypal', 'klarna', 'rechnung'],
  marketing: ['GA4'],
  pool: { rang_de: 50_000, lcp_ms: 1800, system_seit: '2023-01-01', system_vorher: null },
  pagespeed_mobil: null,
  heute: HEUTE,
  ...extra,
});

const ids = <T extends { id: string }>(liste: T[]) => liste.map((x) => x.id);

describe('qualifiziere', () => {
  it('nimmt einen echten Shopware-5-Shop', () => {
    const e = qualifiziere(daten());
    expect(e.qualifiziert).toBe(true);
    expect(ids(e.anlaesse)).toEqual(['system_ohne_support']);
    expect(e.anlaesse[0].text).toBe('Shopware 5, seit Juli 2024 ohne Support');
    expect(e.score).toBeGreaterThan(60);
  });

  it('braucht einen Anlass', () => {
    const e = qualifiziere(daten({ system: { id: 'shopware', label: 'Shopware', version: '6.6', sicherheit: 75, deploy_ts: 0 }, support: supportStatus('shopware', '6.6', HEUTE) }));
    expect(ids(e.ausschluss)).toEqual(['kein_anlass']);
  });

  it.each([
    ['langsam', { pool: { rang_de: 50_000, lcp_ms: 4600, system_seit: null, system_vorher: null } }],
    ['kein_update', { sitemap: { gefunden: true, urls: 900, produkt_urls: 800, neuestes_lastmod: '2025-03-01' } }],
  ] as const)('erkennt den Anlass %s', (anlass, extra) => {
    const e = qualifiziere(daten({ support: supportStatus('shopware', '6.6', HEUTE), ...extra }));
    expect(ids(e.anlaesse)).toContain(anlass);
    expect(e.qualifiziert).toBe(true);
  });

  it('zählt „lange unverändert“ nur als Verstärker', () => {
    const aktuell = { support: supportStatus('shopware', '6.6', HEUTE), pool: { rang_de: 50_000, lcp_ms: 1800, system_seit: '2019-01-01', system_vorher: null } };
    const e = qualifiziere(daten(aktuell));
    expect(ids(e.anlaesse)).toEqual(['lange_unveraendert']);
    expect(ids(e.ausschluss)).toEqual(['kein_anlass']);
    const mitSupportEnde = qualifiziere(daten({ pool: aktuell.pool }));
    expect(ids(mitSupportEnde.anlaesse)).toEqual(['system_ohne_support', 'lange_unveraendert']);
    expect(mitSupportEnde.score).toBeGreaterThan(qualifiziere(daten()).score);
  });

  it('traut winzigen Sortimentszahlen nicht', () => {
    const magento = { system: { id: 'magento', label: 'Magento', version: '2.4', sicherheit: 90, deploy_ts: 0 }, support: supportStatus('magento', '2.4', HEUTE) };
    expect(ids(qualifiziere(daten({ ...magento, sitemap: { gefunden: true, urls: 3, produkt_urls: 1, neuestes_lastmod: '2026-09-01' } })).anlaesse)).not.toContain('ueberdimensioniert');
  });

  it('zählt Magento 2 ohne öffentliche Version als schwachen Anlass', () => {
    const magento = { system: { id: 'magento', label: 'Magento', version: '2.4', sicherheit: 90, deploy_ts: 0 }, support: supportStatus('magento', '2.4', HEUTE) };
    const e = qualifiziere(daten({ ...magento, sitemap: { gefunden: true, urls: 22000, produkt_urls: 20000, neuestes_lastmod: '2026-09-01' } }));
    expect(ids(e.anlaesse)).toEqual(['magento_version_unbekannt']);
    expect(e.qualifiziert).toBe(true);
    // Weaker than a known end of support.
    expect(e.score).toBeLessThan(qualifiziere(daten()).score);
    const bekannt = { system: { ...magento.system, version: '2.4.8' }, support: supportStatus('magento', '2.4.8', HEUTE) };
    expect(qualifiziere(daten({ ...bekannt, sitemap: { gefunden: true, urls: 22000, produkt_urls: 20000, neuestes_lastmod: '2026-09-01' } })).anlaesse).toEqual([]);
  });

  it('nennt Magento 2 bei kleinem Sortiment überdimensioniert, bei großem nicht', () => {
    const magento = { system: { id: 'magento', label: 'Magento', version: '2.4', sicherheit: 90, deploy_ts: 0 }, support: supportStatus('magento', '2.4', HEUTE) };
    expect(ids(qualifiziere(daten({ ...magento, sitemap: { gefunden: true, urls: 900, produkt_urls: 800, neuestes_lastmod: '2026-09-01' } })).anlaesse)).toContain('ueberdimensioniert');
    expect(ids(qualifiziere(daten({ ...magento, sitemap: { gefunden: true, urls: 22000, produkt_urls: 20000, neuestes_lastmod: '2026-09-01' } })).anlaesse)).not.toContain('ueberdimensioniert');
  });

  it('nutzt PageSpeed nur, wenn CrUX keine Ladezeit hat', () => {
    const ohneCrux = daten({ support: supportStatus('shopware', '6.6', HEUTE), pool: { rang_de: null, lcp_ms: null, system_seit: null, system_vorher: null }, pagespeed_mobil: 31 });
    expect(ids(qualifiziere(ohneCrux).anlaesse)).toEqual(['langsam']);
  });

  it.each([
    ['shopify', { shopify_dns: true }],
    ['weitergeleitet', { erreichbar: { ok: true, status: 200, fehler: '', weitergeleitet_nach: 'andere-marke.de' } }],
    ['kein_impressum', { firma: leereFirma() }],
    ['nicht_deutsch', { firma: firma({ land: 'AT', plz: '' }) }],
    ['adresse_unklar', { firma: firma({ land: '', plz: '' }) }],
    ['offshore', { firma: firma({ offshore: true }) }],
    ['system_unbekannt', { system: { id: 'shopware', label: 'Shopware', version: '5', sicherheit: 35, deploy_ts: 0 } }],
    ['gerade_migriert', { pool: { rang_de: 50_000, lcp_ms: 1800, system_seit: '2026-03-01', system_vorher: 'magento' } }],
  ] as const)('schließt aus: %s', (grund, extra) => {
    expect(ids(qualifiziere(daten(extra as Partial<Pruefdaten>)).ausschluss)).toContain(grund);
  });

  it('schließt Shops ohne Warenkorb und Preise aus, geparkte und geschlossene auch', () => {
    const s = daten().signale!;
    expect(ids(qualifiziere(daten({ signale: { ...s, warenkorb: [], preise: false } })).ausschluss)).toContain('kein_shop');
    expect(ids(qualifiziere(daten({ signale: { ...s, geparkt: true } })).ausschluss)).toContain('geparkt');
    expect(ids(qualifiziere(daten({ signale: { ...s, geschlossen: 'Wartungsarbeiten' } })).ausschluss)).toContain('geschlossen');
  });

  it('meldet Bot-Sperren getrennt von nicht erreichbaren Shops', () => {
    expect(ids(qualifiziere(daten({ erreichbar: { ok: false, status: 403, fehler: '', weitergeleitet_nach: '' } })).ausschluss)).toEqual(['blockiert']);
    expect(ids(qualifiziere(daten({ erreichbar: { ok: false, status: 0, fehler: 'ENOTFOUND', weitergeleitet_nach: '' } })).ausschluss)).toEqual(['nicht_erreichbar']);
  });

  it('gewichtet Reichweite: Top 1.000 vor Top 50.000', () => {
    const gross = qualifiziere(daten({ pool: { rang_de: 1_000, lcp_ms: 1800, system_seit: null, system_vorher: null } }));
    const klein = qualifiziere(daten());
    expect(gross.score).toBeGreaterThan(klein.score);
  });
});

describe('supportStatus', () => {
  it.each([
    ['magento', '1', 'eol'],
    ['magento', '2.4.6', 'eol'],
    ['magento', '2.4.7', 'eol_soon'],
    ['magento', '2.4.8', 'supported'],
    ['magento', '2.4', 'unknown'],
    ['shopware', '5', 'eol'],
    ['shopware', '6.4.20', 'eol'],
    ['shopware', '6.5.8', 'eol_soon'],
    ['shopware', '6.6', 'supported'],
    ['shopware', '6', 'unknown'],
    ['oxid', '4.10', 'eol'],
    ['oxid', '6.2', 'eol'],
    ['oxid', '6.5', 'eol_soon'],
    ['oxid', '7.1', 'unknown'],
    ['xtcommerce', '', 'eol'],
    ['jtl', '5.2', 'unknown'],
  ])('%s %s → %s', (system, version, status) => {
    expect(supportStatus(system, version, HEUTE).status).toBe(status);
  });
});

describe('systemVon', () => {
  it.each([
    ['magento1', '', 'magento', '1'],
    ['magento2', '2.4', 'magento', '2.4'],
    ['magento2', '', 'magento', '2'],
    ['shopware5', '', 'shopware', '5'],
    ['JTL Shop', '5.3', 'jtl', '5.3'],
    ['OXID eShop Community Edition', '6', 'oxid', '6'],
    ['sap_commerce', '', 'sap', ''],
    ['unbekannt', '', '', ''],
  ])('%s %s → %s %s', (name, version, id, v) => {
    expect(systemVon(name, version)).toEqual({ id, version: v });
  });
});
