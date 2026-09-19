import { describe, expect, it } from 'vitest';
import { planeImport } from './importCsv';
import { anlaesseIn, importZeilen, plattformVon, reichweiteLabel, scoreIn, tierVon, type LeadKandidat, type ListenZeile } from './leadFinder';
import type { Database } from './types';

const kandidat = (extra: Partial<LeadKandidat> = {}): LeadKandidat => ({
  domain: 'muster-shop.example', url: 'https://www.muster-shop.example/', geprueft_am: '2026-09-19T12:00:00Z', qualifiziert: true, ausschluss: [],
  anlaesse: [{ id: 'system_ohne_support', text: 'Shopware 5, seit Juli 2024 ohne Support', gewicht: 40 }], score: 82, score_gruende: [], http_status: 200,
  system: 'shopware', system_label: 'Shopware', version: '5', sicherheit: 75, support: { status: 'eol', text: 'Shopware 5, seit Juli 2024 ohne Support', datum: '2024-07-31' },
  letztes_deploy: '', firma: {
    gefunden: true, url: '', name: 'Muster Handel GmbH', rechtsform: 'GmbH', register: 'HRB 1234', registergericht: 'Köln', ust_id: 'DE123456789',
    geschaeftsfuehrer: ['Anna Beispiel', 'Bernd Probe'], strasse: 'Hauptstraße 1', plz: '50667', ort: 'Köln', land: 'DE', offshore: false, email: 'info@muster-shop.example', telefon: '+49 221 1',
  },
  sitemap: { gefunden: true, urls: 1300, produkt_urls: 1200, neuestes_lastmod: '2026-09-01' }, signale: null, zahlarten: ['paypal', 'klarna'], marketing: ['GA4'],
  email_tools: [], bewertungen: [], sprachen: ['de'], technik: [], rang_de: 50_000, lcp_ms: 1800, pagespeed_mobil: null, belege: [], ...extra,
});

const leereDb = { firmen: [], kontakte: [], deals: [] } as unknown as Database;

describe('importZeilen', () => {
  it('ergibt einen Import-Plan mit Firma, Ansprechpartner und Quelle „Lead-Finder“', () => {
    const plan = planeImport(importZeilen([kandidat()]), leereDb, { tiers: ['A', 'B', 'C', 'D', 'sonstige'], zustaendig: 'Lugge', dealAnlegen: true, dealTitel: '' });
    expect(plan.fehlendeSpalten).toEqual([]);
    const [z] = plan.zeilen;
    expect(z.aktion).toBe('neu');
    expect(z.firma).toMatchObject({
      name: 'Muster Handel GmbH', domain: 'muster-shop.example', tier: 'A', score: 82, plattform: 'shopware5', eol: 'eol', register: 'HRB 1234 (Köln)',
      ust_id: 'DE123456789', email_allgemein: 'info@muster-shop.example', ort: 'Köln', quelle: 'Lead-Finder', zustaendig: 'Lugge',
    });
    expect(z.firma?.notiz).toContain('Shopware 5, seit Juli 2024 ohne Support');
    expect(z.firma?.notiz).toContain('weitere Geschäftsführung: Bernd Probe');
    expect(z.kontakt).toMatchObject({ vorname: 'Anna', nachname: 'Beispiel', rolle: 'Geschäftsführung', hauptkontakt: true });
  });

  it('nimmt die Domain als Namen, wenn das Impressum keinen hergibt', () => {
    const k = kandidat({ firma: { ...kandidat().firma, name: '', geschaeftsfuehrer: [] } });
    const [z] = planeImport(importZeilen([k]), leereDb, { tiers: ['A', 'B', 'C', 'D', 'sonstige'], zustaendig: '', dealAnlegen: false, dealTitel: '' }).zeilen;
    expect(z.firma?.name).toBe('muster-shop.example');
    expect(z.kontakt).toBeUndefined();
  });
});

describe('Ansichten', () => {
  it('nimmt Score und Anlässe der gewählten Ansicht in den Import', () => {
    const k = kandidat({
      anlaesse: [
        { id: 'system_ohne_support', text: 'Shopware 5, seit Juli 2024 ohne Support', gewicht: 40, bereich: 'migration' },
        { id: 'klaviyo_wechsel', text: 'nutzt Mailchimp, Wechsel zu Klaviyo möglich', gewicht: 35, bereich: 'klaviyo' },
      ],
      scores: { migration: 82, ads: 0, klaviyo: 40 }, werbung: ['Meta'], gtm: true, email_tools: ['Mailchimp'],
    });
    const [z] = planeImport(importZeilen([k], 'klaviyo'), leereDb, { tiers: ['A', 'B', 'C', 'D', 'sonstige'], zustaendig: '', dealAnlegen: true, dealTitel: 'Klaviyo Migration & Management' }).zeilen;
    expect(z.firma).toMatchObject({ score: 40, tier: 'C' });
    expect(z.firma?.notiz).toMatch(/^Lead-Scoring: nutzt Mailchimp/);
    expect(z.firma?.tech_info).toContain('Meta, GTM, Mailchimp');
  });

  it('liest Anlässe und Score einer Ansicht aus der Listenzeile', () => {
    const z = { anlaesse: ['system_ohne_support', 'ads_aktiv'], anlass_texte: ['Shopware 5 …', 'schaltet Werbung (Meta)'], score_migration: 80, score_ads: 55, score_klaviyo: 0 } as ListenZeile;
    expect(anlaesseIn(z, 'ads')).toEqual([{ id: 'ads_aktiv', text: 'schaltet Werbung (Meta)' }]);
    expect(anlaesseIn(z, 'klaviyo')).toEqual([]);
    expect(scoreIn(z, 'ads')).toBe(55);
  });
});

describe('Hilfen', () => {
  it.each([
    [{ system: 'magento', version: '1' }, 'magento1'],
    [{ system: 'magento', version: '2.4' }, 'magento2'],
    [{ system: 'magento', version: '' }, 'magento2'],
    [{ system: 'shopware', version: '6.5' }, 'shopware6'],
    [{ system: 'shopware', version: '' }, 'shopware'],
    [{ system: 'xtcommerce', version: '' }, 'xt_commerce'],
    [{ system: 'jtl', version: '5.2' }, 'jtl'],
  ])('plattformVon %o → %s', (k, erwartet) => expect(plattformVon(k)).toBe(erwartet));

  it('vergibt Tiers wie der Qualifier', () => {
    expect([90, 68, 67, 48, 30, 29].map(tierVon)).toEqual(['A', 'A', 'B', 'B', 'C', 'D']);
  });

  it('beschriftet die Reichweite', () => {
    expect([null, 5_000, 1_000_000].map(reichweiteLabel)).toEqual(['–', 'Top 5.000', 'Top 1 Mio.']);
  });
});
