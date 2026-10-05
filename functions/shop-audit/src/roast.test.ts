import { describe, expect, it } from 'vitest';
import { pruefeRoast, RoastAnfrageSchema, roastNachricht } from './roast.js';

const anfrage = RoastAnfrageSchema.parse({
  domain: 'muster-shop.example',
  vorname: 'Uwe',
  befunde: [
    { id: 'plattform_magento_eol', bereich: 'plattform', schwere: 'hoch', text: 'Magento 2.4.6 ist seit dem 11.08.2026 ohne Standard-Support.', wert: '2.4.6' },
    { id: 'speed_lcp_mobil', bereich: 'geschwindigkeit', schwere: 'mittel', text: 'Mobil dauert es 4,2 s, bis der Hauptinhalt steht.', wert: '4200 ms' },
  ],
  nicht_geprueft: [{ bereich: 'produktseite', grund: 'Keine Produktseite gefunden.' }],
});

describe('Shop-Roast-Texte', () => {
  it('keeps points that only use numbers from their own finding', () => {
    const geprueft = pruefeRoast(
      {
        einleitung: 'Wir haben deinen Shop in vier Bereichen angesehen.',
        punkte: [
          { befund_id: 'plattform_magento_eol', titel: 'Magento ohne Updates', text: 'Seit dem 11.08.2026 gibt es für 2.4.6 keine Updates mehr.' },
          { befund_id: 'speed_lcp_mobil', titel: 'Mobil zu langsam', text: 'Es dauert 4,2 s – das kostet 20 % Umsatz.' },
          { befund_id: 'erfunden', titel: 'Gibt es nicht', text: 'Text' },
          { befund_id: 'plattform_magento_eol', titel: 'Doppelt', text: 'Noch einmal.' },
        ],
        fazit: 'Fang mit dem Update auf eine Version nach 2.4.6 an.',
      },
      anfrage,
    );
    expect(geprueft.punkte.map((p) => p.befund_id)).toEqual(['plattform_magento_eol']);
    expect(geprueft.einleitung).toBe('Wir haben deinen Shop in vier Bereichen angesehen.');
    expect(geprueft.fazit).toContain('2.4.6');
  });

  it('empties opening and conclusion with invented numbers', () => {
    const geprueft = pruefeRoast({ einleitung: 'Ihr verliert 30 % Umsatz.', punkte: [], fazit: 'Rund 5000 Euro im Monat.' }, anfrage);
    expect(geprueft).toEqual({ einleitung: '', punkte: [], fazit: '' });
  });

  it('wraps the findings as data and escapes angle brackets', () => {
    const nachricht = roastNachricht({ ...anfrage, domain: '<b>x</b>' });
    expect(nachricht).toContain('[speed_lcp_mobil] (geschwindigkeit, mittel)');
    expect(nachricht).toContain('<vorname>Uwe</vorname>');
    expect(nachricht).toContain('produktseite: Keine Produktseite gefunden.');
    expect(nachricht).not.toContain('<b>');
  });

  it('refuses requests without findings', () => {
    expect(RoastAnfrageSchema.safeParse({ domain: 'x.example', befunde: [] }).success).toBe(false);
  });
});
