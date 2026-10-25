import { describe, expect, it } from 'vitest';
import { ANSICHT_STANDARD, leseAnsicht, schreibeAnsicht, zeigeStart } from './ansicht';

describe('leseAnsicht', () => {
  it('startet ruhig, wenn nichts gespeichert ist', () => {
    const a = leseAnsicht(undefined);
    expect(a).toEqual(ANSICHT_STANDARD);
    expect(zeigeStart(a, 'heute')).toBe(true);
    expect(zeigeStart(a, 'monstera')).toBe(false);
    expect(a.kennzahlen).toBe(false);
  });

  it('liest Gespeichertes und verwirft Unbekanntes', () => {
    const a = leseAnsicht(JSON.stringify({ start: { monstera: true, gibtsnicht: true, heute: 'ja' }, ausgeblendet: ['social', 'home', 3], kennzahlen: true }));
    expect(a.start).toEqual({ monstera: true });
    expect(a.ausgeblendet).toEqual(['social']);
    expect(a.kennzahlen).toBe(true);
    expect(a.aufmerksamkeit).toBe(true);
  });

  it('fällt bei kaputtem Wert auf den Standard zurück', () => {
    expect(leseAnsicht('{kaputt')).toEqual(ANSICHT_STANDARD);
  });

  it('übersteht den Weg über den Speicher', () => {
    const a = { ...ANSICHT_STANDARD, start: { pipeline: true }, ausgeblendet: ['leads'] };
    expect(leseAnsicht(schreibeAnsicht(a))).toEqual(a);
  });
});
