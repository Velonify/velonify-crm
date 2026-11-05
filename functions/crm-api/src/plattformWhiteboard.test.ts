import { describe, expect, it } from 'vitest';
import type { PlattformStore } from '../../../src/data/postgres/plattformStore';
import type { Mandant } from '../../../src/data/plattform';
import { speicherAblage } from './whiteboard';
import { mandantenAblage, pruefeWhiteboard } from './plattform';

const plattform = { heute: () => '2026-11-05' } as unknown as PlattformStore;
const mandant = (teil: Partial<Mandant>) => ({ id: 'vennie', status: 'test', paket: 'test', funktionen: {}, test_start: '2026-11-01', test_ende: '2026-11-30', ...teil }) as Mandant;

describe('Whiteboard für Mandanten', () => {
  it('ist im Test an und lässt lesen und schreiben', () => {
    expect(pruefeWhiteboard('GET', { plattform, mandant: mandant({}) })).toBeNull();
    expect(pruefeWhiteboard('POST', { plattform, mandant: mandant({}) })).toBeNull();
  });

  it('bleibt zu, wenn der Schalter aus ist', () => {
    expect(pruefeWhiteboard('GET', { plattform, mandant: mandant({ funktionen: { whiteboard: false } }) })?.status).toBe(403);
  });

  it('lässt nach dem Test nur lesen und sperrt danach', () => {
    const nurLesen = mandant({ test_ende: '2026-11-02' });
    expect(pruefeWhiteboard('GET', { plattform, mandant: nurLesen })).toBeNull();
    expect(pruefeWhiteboard('POST', { plattform, mandant: nurLesen })?.status).toBe(403);
    expect(pruefeWhiteboard('GET', { plattform, mandant: mandant({ test_ende: '2026-10-01' }) })?.status).toBe(403);
  });

  it('legt Bilder je Mandant getrennt ab', async () => {
    const ablage = speicherAblage();
    await mandantenAblage(ablage, 'vennie').schreibe('whiteboards/WB-1/a.png', 'image/png', Buffer.from('x'));
    expect([...ablage.objekte.keys()]).toEqual(['mandanten/vennie/whiteboards/WB-1/a.png']);
    expect(await mandantenAblage(ablage, 'vennie').lies('whiteboards/WB-1/a.png')).not.toBeNull();
    expect(await mandantenAblage(ablage, 'andere').lies('whiteboards/WB-1/a.png')).toBeNull();
    expect(await ablage.lies('whiteboards/WB-1/a.png')).toBeNull();
  });
});
