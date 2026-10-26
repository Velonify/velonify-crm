import { describe, expect, it } from 'vitest';
import { helpdesks, marktEintrag, marktNaechsteSql } from './markt.js';
import type { Kandidat } from './pruefen.js';

const kandidat = (firma: Partial<Kandidat['firma']>, extra: Partial<Kandidat> = {}) =>
  ({
    domain: 'shop.example', geprueft_am: '2026-10-26T09:00:00Z', http_status: 200, technik: ['Gorgias'], email_tools: ['Klaviyo'],
    zahlarten: ['PayPal'], bewertungen: [], sprachen: ['de'], sitemap: { gefunden: true, urls: 900, produkt_urls: 420, neuestes_lastmod: '' },
    firma: { gefunden: true, url: '', name: 'Shop GmbH', rechtsform: 'GmbH', register: 'HRB 1', registergericht: 'AG Köln', ust_id: 'DE1', geschaeftsfuehrer: ['Erika Muster'],
      strasse: 'Weg 1', plz: '50667', ort: 'Köln', land: 'DE', offshore: false, email: 'info@shop.example', telefon: '0221', ...firma },
    ...extra,
  }) as unknown as Kandidat;

const zeile = { domain: 'shop.example', plus: true, technik: ['Zendesk', 'Shopify Plus'], rang_de: 10_000, lcp_ms: 1900 };

describe('Lead-Markt', () => {
  it('maps Wappalyzer names to helpdesks once', () => {
    expect(helpdesks(['Zendesk Chat', 'Zendesk', 'Gorgias', 'Google Analytics'])).toEqual(['Gorgias', 'Zendesk']);
  });

  it('keeps contact details out of the preview and in the unlocked data', () => {
    const e = marktEintrag(kandidat({}), zeile, 'mode')!;
    expect(e.vorschau).toMatchObject({ branche: 'mode', plz_bereich: '5', shopify_plus: true, helpdesk: ['Gorgias', 'Zendesk'], produkte: 420 });
    expect(JSON.stringify(e.vorschau)).not.toMatch(/Shop GmbH|info@|Muster|shop\.example/);
    expect(e.daten).toMatchObject({ firma: 'Shop GmbH', email: 'info@shop.example', ansprechpartner: 'Erika Muster', register: 'AG Köln HRB 1' });
  });

  it('drops shops without e-mail, abroad or offline', () => {
    expect(marktEintrag(kandidat({ email: '' }), zeile, null)).toBeNull();
    expect(marktEintrag(kandidat({ land: 'US' }), zeile, null)).toBeNull();
    expect(marktEintrag(kandidat({ offshore: true }), zeile, null)).toBeNull();
    expect(marktEintrag(kandidat({}, { http_status: 503 }), zeile, null)).toBeNull();
  });

  it('skips known domains and puts helpdesk shops first', () => {
    expect(marktNaechsteSql('p.leads')).toMatch(/NOT IN UNNEST\(@ohne\)[\s\S]*ORDER BY helpdesk DESC, rang_de/);
  });
});
