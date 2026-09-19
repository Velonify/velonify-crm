import { describe, expect, it } from 'vitest';
import { addDays } from './ids';
import type { WordleErgebnis } from './types';
import { bewerte, muster, musterZeilen, raetselNummer, rangliste, START_TAG, tastenFarben, teilenText, wortDesTages, WORT_LAENGE } from './wordle';

const ergebnis = (spieler: string, datum: string, versuche: number, geloest = true): WordleErgebnis => ({
  id: `WD-${spieler}-${datum}`,
  datum,
  spieler,
  versuche,
  geloest,
  muster: '',
  erstellt_am: '',
  erstellt_von: '',
  geaendert_am: '',
  geaendert_von: '',
});

describe('wortDesTages', () => {
  it('gives everyone the same five-letter word per day', () => {
    expect(wortDesTages('2026-10-01')).toBe(wortDesTages('2026-10-01'));
    for (let i = 0; i < 200; i++) expect(wortDesTages(addDays(START_TAG, i))).toMatch(new RegExp(`^[A-Z]{${WORT_LAENGE}}$`));
  });

  it('does not repeat a word within the first hundred days', () => {
    const woerter = Array.from({ length: 100 }, (_, i) => wortDesTages(addDays(START_TAG, i)));
    expect(new Set(woerter).size).toBe(100);
  });

  it('numbers puzzles from the start day, across daylight saving', () => {
    expect(raetselNummer(START_TAG)).toBe(1);
    expect(raetselNummer('2026-10-26')).toBe(38);
  });
});

describe('bewerte', () => {
  it('marks right place, wrong place and missing letters', () => {
    expect(bewerte('KASSE', 'KUNDE')).toEqual(['g', 'x', 'x', 'x', 'g']);
    expect(bewerte('DEKAN', 'KUNDE')).toEqual(['y', 'y', 'y', 'x', 'y']);
  });

  it('marks a double letter yellow only as often as it is left in the solution', () => {
    // One E in PREIS: the green E at position 3 uses it up.
    expect(bewerte('EEEEE', 'PREIS')).toEqual(['x', 'x', 'g', 'x', 'x']);
    // One S in SEITE: only the first of the two S turns yellow.
    expect(bewerte('KASSE', 'SEITE')).toEqual(['x', 'x', 'y', 'x', 'g']);
  });

  it('keeps the best colour per key', () => {
    const farben = tastenFarben(['DEKAN', 'KUNDE'], 'KUNDE');
    expect(farben.get('K')).toBe('g');
    expect(farben.get('A')).toBe('x');
  });
});

describe('muster', () => {
  it('stores colours without letters and reads them back', () => {
    const wert = muster(['KASSE', 'KUNDE'], 'KUNDE');
    expect(wert).toBe('gxxxg/ggggg');
    expect(musterZeilen(wert)).toEqual([['g', 'x', 'x', 'x', 'g'], ['g', 'g', 'g', 'g', 'g']]);
    expect(teilenText(START_TAG, { geloest: true, versuche: 2, muster: wert })).toBe('Velonify-Wort #1 2/6\n\n🟩⬜⬜⬜🟩\n🟩🟩🟩🟩🟩');
  });
});

describe('rangliste', () => {
  // 2026-10-02 is a Friday, 2026-10-05 the Monday after.
  it('counts the series over workdays and skips the weekend', () => {
    const [stand] = rangliste([ergebnis('Lugge', '2026-10-01', 3), ergebnis('Lugge', '2026-10-02', 4), ergebnis('Lugge', '2026-10-05', 2)], ['Lugge'], '2026-10-05');
    expect(stand.serie).toBe(3);
    expect(stand.schnitt).toBe(3);
  });

  it('keeps the series while today is still open, and breaks it on a missed workday or a lost game', () => {
    const daten = [ergebnis('Lugge', '2026-10-01', 3), ergebnis('Lugge', '2026-10-02', 4)];
    expect(rangliste(daten, ['Lugge'], '2026-10-05')[0].serie).toBe(2);
    expect(rangliste(daten, ['Lugge'], '2026-10-06')[0].serie).toBe(0);
    expect(rangliste([...daten, ergebnis('Lugge', '2026-10-05', 6, false)], ['Lugge'], '2026-10-05')[0].serie).toBe(0);
  });

  it('sorts by today: solved in fewer attempts first, then lost, then not played', () => {
    const heute = '2026-10-05';
    const namen = rangliste([ergebnis('Julian', heute, 6, false), ergebnis('Johannes', heute, 2), ergebnis('Lugge', heute, 4)], ['Lugge', 'Johannes', 'Julian', 'Neu'], heute).map((s) => s.spieler);
    expect(namen).toEqual(['Johannes', 'Lugge', 'Julian', 'Neu']);
  });
});
