import { describe, expect, it } from 'vitest';
import { boardsDerFirma, frameReihenfolge, fuehreZusammen, gewinnt, pruefeElemente, type WbElement } from './whiteboard';

const el = (id: string, version: number, extra: Partial<WbElement> = {}): WbElement => ({ id, type: 'rectangle', version, versionNonce: 1, ...extra });

describe('Whiteboard', () => {
  it('lets the higher version win, on a tie the lower nonce', () => {
    expect(gewinnt(el('a', 2), el('a', 1))).toBe(true);
    expect(gewinnt(el('a', 2, { versionNonce: 5 }), el('a', 2, { versionNonce: 9 }))).toBe(true);
    expect(gewinnt(el('a', 2, { versionNonce: 9 }), el('a', 2, { versionNonce: 5 }))).toBe(false);
  });

  it('merges by element, keeps both sides and stacks by fractional index', () => {
    const zusammen = fuehreZusammen([el('a', 3, { index: 'a1' }), el('b', 1, { index: 'a0' })], [el('a', 2, { index: 'a1', x: 9 }), el('c', 1, { index: 'a2' })]);
    expect(zusammen.map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(zusammen.find((e) => e.id === 'a')?.x).toBeUndefined();
  });

  it('drops elements deleted more than two weeks ago', () => {
    const jetzt = Date.UTC(2026, 9, 27);
    const zusammen = fuehreZusammen([el('alt', 2, { isDeleted: true, updated: jetzt - 20 * 86_400_000 }), el('neu', 2, { isDeleted: true, updated: jetzt - 1000 })], [], jetzt);
    expect(zusammen.map((e) => e.id)).toEqual(['neu']);
  });

  it('checks what a client sends', () => {
    expect(pruefeElemente([el('a', 1)])).toHaveLength(1);
    expect(pruefeElemente([{ id: 'a', type: 'x', version: '1', versionNonce: 1 }])).toBeNull();
    expect(pruefeElemente({})).toBeNull();
  });

  it('presents numbered frames first, then left to right and top to bottom', () => {
    const f = (name: string, x: number, y: number) => ({ type: 'frame', name, x, y });
    const reihe = frameReihenfolge([f('Ziel', 800, 0), f('Start', 0, 10), f('2 Lösung', 0, 900), f('1 Problem', 500, 900), { type: 'rectangle', name: null, x: 0, y: 0 }]);
    expect(reihe.map((r) => r.name)).toEqual(['1 Problem', '2 Lösung', 'Start', 'Ziel']);
  });

  it('lists the boards of a firm without archived ones, newest first', () => {
    const b = (id: string, firma_id: string, geaendert_am: string, archiviert = false) => ({ id, firma_id, geaendert_am, archiviert });
    expect(boardsDerFirma([b('1', 'F-1', '2026-10-01'), b('2', 'F-1', '2026-10-05'), b('3', 'F-1', '2026-10-09', true), b('4', 'F-2', '2026-10-09')], 'F-1').map((x) => x.id)).toEqual(['2', '1']);
  });
});
