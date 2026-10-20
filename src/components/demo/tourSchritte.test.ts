import { describe, expect, it } from 'vitest';
import { liesTourStand, TOUR } from './tourSchritte';

describe('Tour der Demo', () => {
  it('führt vom Lead bis ins Kundenportal', () => {
    expect(TOUR.map((s) => s.titel)).toEqual(['Lead finden', 'Shop-Audit', 'Anschreiben', 'Deal', 'Angebot', 'Kunde', 'Kundenportal']);
    expect(TOUR.at(-1)!.kundenansicht).toBe(true);
    expect(TOUR[5].pfad('F-1')).toBe('/kunden/F-1');
    expect(TOUR[5].pfad(null)).toBe('/kunden');
  });

  it('liest den gemerkten Stand und verwirft Unsinn', () => {
    expect(liesTourStand(JSON.stringify({ schritt: 3, sichtbar: false }))).toEqual({ schritt: 3, sichtbar: false });
    expect(liesTourStand(JSON.stringify({ schritt: 99, sichtbar: true }))).toEqual({ schritt: TOUR.length - 1, sichtbar: true });
    expect(liesTourStand('{kaputt')).toBeNull();
    expect(liesTourStand(JSON.stringify({ schritt: '2' }))).toBeNull();
    expect(liesTourStand(null)).toBeNull();
  });
});
