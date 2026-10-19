import { describe, expect, it } from 'vitest';
import { ABGELAUFEN_MS, PraesenzRaum, andereBei, ortLink, ortText, pruefeMeldung, type PraesenzMeldung } from './praesenz';

const meldung = (tab: string, extra: Partial<PraesenzMeldung> = {}): PraesenzMeldung => ({ tab, pfad: '/todo/B-1', bereich: 'To-Dos', objekt: null, ...extra });
const karte = { art: 'karte' as const, id: 'A-1', titel: 'Startseite' };

describe('pruefeMeldung', () => {
  it('nimmt Herzschlag und Abmeldung an', () => {
    expect(pruefeMeldung({ tab: 't1', pfad: '/crm', bereich: 'CRM', objekt: karte })).toEqual({ tab: 't1', pfad: '/crm', bereich: 'CRM', objekt: karte });
    expect(pruefeMeldung({ tab: 't1', weg: true })).toEqual({ tab: 't1', weg: true });
  });

  it('lehnt Unsinn ab', () => {
    expect(pruefeMeldung(null)).toBeNull();
    expect(pruefeMeldung({ pfad: '/crm', bereich: 'CRM' })).toBeNull();
    expect(pruefeMeldung({ tab: 't1', pfad: 'https://boese.example', bereich: 'CRM' })).toBeNull();
    expect(pruefeMeldung({ tab: 't1', pfad: '/crm', bereich: 'CRM', objekt: { art: 'deal', id: 'x', titel: '' } })).toBeNull();
    expect(pruefeMeldung({ tab: 't1', pfad: '/crm', bereich: 'x'.repeat(500) })).toBeNull();
  });
});

describe('PraesenzRaum', () => {
  it('zeigt alle anderen, nicht einen selbst', () => {
    const raum = new PraesenzRaum();
    raum.melde('a@velonify.de', meldung('1'), 1000);
    raum.melde('b@velonify.de', meldung('2', { objekt: karte }), 1000);
    const andere = raum.anwesende('a@velonify.de', 2000);
    expect(andere.map((a) => a.email)).toEqual(['b@velonify.de']);
    expect(andere[0].objekt).toEqual(karte);
  });

  it('vergisst Tabs ohne Herzschlag und nach Abmeldung', () => {
    const raum = new PraesenzRaum();
    raum.melde('b@velonify.de', meldung('2'), 1000);
    raum.melde('c@velonify.de', meldung('3'), 1000);
    raum.weg('c@velonify.de', '3');
    expect(raum.anwesende('a@velonify.de', 1000 + ABGELAUFEN_MS - 1)).toHaveLength(1);
    expect(raum.anwesende('a@velonify.de', 1000 + ABGELAUFEN_MS + 1)).toHaveLength(0);
  });

  it('darf nur eigene Tabs abmelden', () => {
    const raum = new PraesenzRaum();
    raum.melde('b@velonify.de', meldung('2'), 1000);
    raum.weg('a@velonify.de', '2');
    expect(raum.anwesende('x', 1000)).toHaveLength(1);
  });

  it('zeigt pro Person einen Tab, der mit offener Karte gewinnt', () => {
    const raum = new PraesenzRaum();
    raum.melde('b@velonify.de', meldung('2', { objekt: karte }), 1000);
    raum.melde('b@velonify.de', meldung('3', { pfad: '/crm' }), 2000);
    const andere = raum.anwesende('a@velonify.de', 2000);
    expect(andere).toHaveLength(1);
    expect(andere[0].objekt?.id).toBe('A-1');
  });
});

describe('Anzeige', () => {
  it('findet, wer dieselbe Karte offen hat, und verlinkt dorthin', () => {
    const raum = new PraesenzRaum();
    raum.melde('b@velonify.de', meldung('2', { objekt: karte }), 1000);
    const andere = raum.anwesende('a@velonify.de', 1000);
    expect(andereBei(andere, 'karte', 'A-1')).toHaveLength(1);
    expect(andereBei(andere, 'karte', 'A-2')).toHaveLength(0);
    expect(andereBei(andere, 'karte', undefined)).toHaveLength(0);
    expect(ortText(andere[0])).toBe('Karte „Startseite“');
    expect(ortLink(andere[0])).toBe('/todo/B-1?karte=A-1');
    expect(ortText({ bereich: 'CRM · Pipeline', objekt: null })).toBe('CRM · Pipeline');
  });
});
