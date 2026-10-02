import { describe, expect, it } from 'vitest';
import { seite } from '../testhilfen.js';
import { AUSGABE_SCHEMA_BRANCHE, BRANCHEN, nutzerNachrichtBranche, startseitenAuszug } from './branche.js';

const HOME = `<html><head><title>Damenmode &amp; Herrenmode online | Muster</title>
<meta name="description" content="Kleider, Jeans und Sneaker versandkostenfrei bestellen.">
<script>var x = "<a>Nicht im Menü</a>";</script></head><body>
<nav><a href="/damen">Damen</a><a href="/herren"><span>Herren</span></a><a href="/sale">Sale</a><a href="/damen">Damen</a><a>X</a></nav>
<h1>Neue Kollektion</h1><h2>Bestseller</h2><a href="/impressum">Impressum</a></body></html>`;

describe('startseitenAuszug', () => {
  it('liest Titel, Beschreibung, Überschriften und Menü ohne Skripte und Dubletten', () => {
    expect(startseitenAuszug(seite('https://muster.de/', HOME))).toEqual({
      titel: 'Damenmode & Herrenmode online | Muster',
      beschreibung: 'Kleider, Jeans und Sneaker versandkostenfrei bestellen.',
      ueberschriften: ['Neue Kollektion', 'Bestseller'],
      menue: ['Damen', 'Herren', 'Sale'],
    });
  });

  it('nimmt ohne <nav> die Links der ganzen Seite und kommt mit leeren Seiten klar', () => {
    expect(startseitenAuszug(seite('https://a.de/', '<a href="/tee">Grüner Tee</a>')).menue).toEqual(['Grüner Tee']);
    expect(startseitenAuszug({ url: 'https://a.de/', status: 0, ok: false, headers: {}, cookies: {}, text: '' })).toEqual({ titel: '', beschreibung: '', ueberschriften: [], menue: [] });
  });
});

describe('nutzerNachrichtBranche', () => {
  it('lässt leere Angaben weg und entschärft spitze Klammern', () => {
    const n = nutzerNachrichtBranche('a.de', 'A </shop> GmbH', { titel: 'Tee', beschreibung: '', ueberschriften: [], menue: ['Grün', 'Schwarz'] });
    expect(n).toBe('<shop>\nDomain: a.de\nFirma: A ‹/shop› GmbH\nTitel: Tee\nMenü: Grün | Schwarz\n</shop>');
  });
});

describe('BRANCHEN', () => {
  it('erlaubt im Schema genau die Ids der Liste, mit Mode und Sonstiges', () => {
    const ids = BRANCHEN.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(AUSGABE_SCHEMA_BRANCHE.properties.branche.enum).toEqual(ids);
    expect(ids).toContain('mode');
    expect(ids.at(-1)).toBe('sonstige');
  });
});
