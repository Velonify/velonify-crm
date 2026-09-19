import { describe, expect, it } from 'vitest';
import { betreiberText, impressumLinks, leseImpressum, textAus } from './impressum.js';
import { seite } from '../testhilfen.js';

const impressum = (html: string, domain = 'shop.de') => leseImpressum(seite(`https://www.${domain}/impressum`, html), domain);

describe('leseImpressum', () => {
  it('liest eine typische GmbH', () => {
    const f = impressum(`
      <nav><a href="/">Home</a></nav>
      <h1>Impressum</h1>
      <p>Angaben gemäß § 5 DDG</p>
      <p>Muster Handel GmbH<br>Hauptstraße 12<br>50667 Köln</p>
      <p>Geschäftsführer: Anna Beispiel, Bernd Probe</p>
      <p>Registergericht: Amtsgericht Köln<br>HRB 12345</p>
      <p>USt-IdNr.: DE 123 456 789</p>
      <p>Telefon: +49 221 123456<br>E-Mail: <a href="mailto:info@shop.de">info@shop.de</a></p>`);
    expect(f).toMatchObject({
      name: 'Muster Handel GmbH', rechtsform: 'GmbH', register: 'HRB 12345', registergericht: 'Köln', ust_id: 'DE123456789',
      geschaeftsfuehrer: ['Anna Beispiel', 'Bernd Probe'], strasse: 'Hauptstraße 12', plz: '50667', ort: 'Köln', land: 'DE',
      offshore: false, email: 'info@shop.de', telefon: '+49 221 123456',
    });
  });

  it('nimmt Namen nicht über das Zeilenende hinaus', () => {
    const f = impressum('<p>Impressum der aquaMuster2000 GmbH</p><p>Geschäftsführer: Paul Probe</p><p>Registergericht: Amtsgericht Musterhausen</p><p>HRB 111111</p><p>12345 Musterhausen</p>');
    expect(f.geschaeftsfuehrer).toEqual(['Paul Probe']);
    expect(f.name).toBe('aquaMuster2000 GmbH');
  });

  it('liest „AG Musterstadt“ als Amtsgericht, nicht als Rechtsform', () => {
    const f = impressum('<p>Angaben gemäß § 5 DDG</p><p>moebel-muster.example GmbH</p><p>Am Musterberg 5</p><p>12345 Musterstadt</p><p>HRB Musterstadt 3116 AG Musterstadt</p>');
    expect(f.rechtsform).toBe('GmbH');
    expect(f.register).toBe('HRB 3116');
    expect(f.registergericht).toBe('Musterstadt');
  });

  it('ignoriert „Betreiber“ in Haftungstexten und findet die Adresse', () => {
    const f = impressum(`
      <p>Impressum</p><p>Verantwortlich für den Shopbetrieb:</p><p>Muster-Laden Internetshop GmbH &amp; Co. KG</p><p>Lange Str. 1</p><p>12345 Musterstadt</p>
      <p>Registergericht: Amtsgericht Musterstadt</p><p>Registernummer: HRA 222222</p>
      <p>Geschäftsführer der Laden Internetshop GmbH:</p><p>Kauffrau Clara Beispiel</p>
      <p>Haftungshinweis: Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.</p>`);
    expect(f).toMatchObject({ name: 'Muster-Laden Internetshop GmbH & Co. KG', plz: '12345', ort: 'Musterstadt', land: 'DE', register: 'HRA 222222' });
    expect(f.geschaeftsfuehrer).toEqual(['Clara Beispiel']);
  });

  it('wertet „China“ (Becken im Menü eines Musikshops) nicht als Offshore-Adresse', () => {
    const f = impressum('<ul><li>Crash</li><li>Ride</li><li>China</li></ul><p>Impressum</p><p>Musik Muster KG</p><p>Notenstraße 29</p><p>12345 Musterstadt</p>');
    expect(f.offshore).toBe(false);
    expect(f.land).toBe('DE');
  });

  it('erkennt eine Offshore-Adresse im Adressblock', () => {
    const f = impressum('<p>Impressum</p><p>Best Deals Ltd.</p><p>88 Queen\'s Road</p><p>Sheung Wan, Hong Kong</p>');
    expect(f.offshore).toBe(true);
    expect(f.land).toBe('');
  });

  it('nimmt keine Copyright-Zeile als Firmennamen', () => {
    const f = impressum('<footer>© 2013-2026 KatzenMuster - Unit X.Y.Z. GmbH</footer><p>Impressum</p><p>Unit X.Y.Z. GmbH</p><p>Musterstraße 71</p><p>12345 Musterstadt</p>');
    expect(f.name).toBe('Unit X.Y.Z. GmbH');
    expect(f.land).toBe('DE');
  });

  it('überspringt Agentur und Hosting', () => {
    const f = impressum('<p>Impressum</p><p>Kleiner Laden e.K.</p><p>Dorfweg 3</p><p>12345 Musterdorf</p><p>Umsetzung und Webdesign:</p><p>Pixel Agentur GmbH</p><p>Agenturweg 1</p><p>10115 Berlin</p><p>Tel. 030 999999</p>');
    expect(f.name).toBe('Kleiner Laden e.K.');
    expect(f.rechtsform).toBe('e.K.');
    expect(f.ort).toBe('Musterdorf');
    expect(f.telefon).toBe('');
  });

  it('liest Adresse mit Trennzeichen in einer Zeile', () => {
    const f = impressum('<p>Impressum</p><p>Beispiel GmbH u. Co. KG · Industriestraße 5 · 12345 Musterstadt</p>');
    expect(f).toMatchObject({ rechtsform: 'GmbH & Co. KG', strasse: 'Industriestraße 5', plz: '12345', ort: 'Musterstadt' });
  });

  it('behält Firmen mit „gestaltung“ im Namen und liest „DE-12345“', () => {
    const f = impressum('<p>Impressum</p><p>Maria Muster Fachmarkt für Raumgestaltung KG</p><p>Musterhof 7</p><p>DE-12345 Musterstadt</p>');
    expect(f).toMatchObject({ name: 'Maria Muster Fachmarkt für Raumgestaltung KG', plz: '12345', ort: 'Musterstadt', land: 'DE' });
  });

  it('entschlüsselt verschleierte E-Mail-Adressen und bevorzugt die eigene Domain', () => {
    const f = impressum('<p>Impressum</p><p>Test GmbH</p><p>10115 Berlin</p><p>E-Mail: info [at] shop.de</p><p>Datenschutz: dsb@extern.de</p>');
    expect(f.email).toBe('info@shop.de');
  });

  it('nimmt keine beliebigen Zahlenfolgen als Telefonnummer', () => {
    const f = impressum('<p>Impressum</p><p>Test GmbH</p><p>10115 Berlin</p><p>Steuernummer 0123 456 789 01</p>');
    expect(f.telefon).toBe('');
  });

  it('meldet fehlendes Impressum', () => {
    expect(leseImpressum(null, 'shop.de').gefunden).toBe(false);
  });
});

describe('impressumLinks', () => {
  it('findet den Link über den Linktext, auch ohne „impressum“ in der URL', () => {
    const home = seite('https://www.shop.de/', '<a href="/info/rechtliches">Impressum</a><a href="/agb">AGB</a>');
    expect(impressumLinks(home)).toEqual(['https://www.shop.de/info/rechtliches']);
  });
});

describe('betreiberText', () => {
  it('beginnt bei der Betreiber-Überschrift', () => {
    expect(betreiberText(textAus('<p>Menü</p><p>Angaben gemäß § 5 DDG</p><p>Firma GmbH</p>'))).toBe('Angaben gemäß § 5 DDG\nFirma GmbH');
  });
});
