import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { isoDate } from './ids';
import { MAX_BLAETTER, monsteraStand, verpassteWerktage, zustandBei } from './monstera';
import type { Deal, Firma, MonsteraEintrag } from './types';

const giessen = (datum: string, von = 'Lugge') => ({ id: `MO-${datum}-${von}`, datum, typ: 'giessen', von }) as MonsteraEintrag;
const firma = (erstellt: string) => ({ id: `F-${erstellt}`, erstellt_am: `${erstellt}T10:00:00.000Z` }) as Firma;
const deal = (phase: string, abgeschlossen: string) => ({ id: `D-${abgeschlossen}`, phase, abgeschlossen_am: abgeschlossen }) as Deal;

describe('Durst', () => {
  // 2026-10-02 is a Friday.
  it('counts only missed workdays, today not included', () => {
    expect(verpassteWerktage('2026-10-01', '2026-10-02')).toBe(0);
    expect(verpassteWerktage('2026-10-02', '2026-10-05')).toBe(0);
    expect(verpassteWerktage('2026-10-01', '2026-10-06')).toBe(2);
  });

  it('gets thirsty, then wilts, but never dies', () => {
    expect([0, 1, 2, 3, 4, 40].map(zustandBei)).toEqual(['praechtig', 'durstig', 'welk', 'welk', 'sehr_welk', 'sehr_welk']);
  });

  it('starts freshly watered on move-in day', () => {
    expect(monsteraStand([], [], [], '2026-09-21').zustand).toBe('praechtig');
    expect(monsteraStand([], [], [], '2026-09-23').durst).toBe(2);
  });
});

describe('Wachstum', () => {
  const heute = '2026-10-05';

  it('grows from leads, won deals and watering days since move-in', () => {
    const stand = monsteraStand(
      [giessen('2026-10-01'), giessen('2026-10-01', 'Julian'), giessen('2026-10-02')],
      [firma('2026-09-01'), firma('2026-10-01'), firma('2026-10-02')],
      [deal('gewonnen', '2026-10-02'), deal('verloren', '2026-10-02'), deal('gewonnen', '2026-09-01')],
      heute,
    );
    // 2 leads + 1 deal × 10 + 2 watering days
    expect(stand.punkte).toBe(14);
    expect(stand.quellen).toEqual({ leads: 2, deals: 1, giesstage: 2 });
    expect(stand.blaetter).toBe(4);
    expect(stand.bisBlatt).toBe(2);
    expect(stand.letzterGiesstag).toBe('2026-10-02');
  });

  it('stops adding leaves when the pot is full', () => {
    const viele = Array.from({ length: 200 }, () => firma('2026-10-01'));
    expect(monsteraStand([], viele, [], heute).blaetter).toBe(MAX_BLAETTER);
  });

  it('lists who watered today', () => {
    expect(monsteraStand([giessen(heute, 'Julian'), giessen(heute, 'Lugge'), giessen('2026-10-02', 'Johannes')], [], [], heute).heuteGegossen).toEqual(['Julian', 'Lugge']);
  });
});

describe('giesseMonstera', () => {
  it('waters once per person and day', async () => {
    const { service } = await createDemoBackend(() => 'lugge@velonify.de');
    const vorher = (await service.loadMonstera()).length;
    const erstes = await service.giesseMonstera('Lugge');
    const zweites = await service.giesseMonstera('Lugge');
    expect(zweites.id).toBe(erstes.id);
    expect(erstes.datum).toBe(isoDate(new Date()));
    expect((await service.loadMonstera()).length).toBe(vorher + 1);
    await expect(service.giesseMonstera(' ')).rejects.toThrow('wer gießt');
  });
});
