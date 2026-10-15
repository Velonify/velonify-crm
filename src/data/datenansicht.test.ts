import { describe, expect, it } from 'vitest';
import { aenderungenAus, alsCsv, filtere, istEditierbar, rueckgaengig, sortiere, TABELLEN_GRUPPEN } from './datenansicht';
import { SCHEMA } from './schema';

describe('Datenansicht', () => {
  it('lists every table exactly once', () => {
    const alle = TABELLEN_GRUPPEN.flatMap((g) => g.tabs);
    expect([...alle].sort()).toEqual(Object.keys(SCHEMA).sort());
  });

  it('searches all columns and hides archived rows unless asked', () => {
    const zeilen = [
      { id: 'F-1', name: 'Gartenversand', ort: 'Hamburg', archiviert: false },
      { id: 'F-2', name: 'Lampen', ort: 'Hamburg', archiviert: true },
    ];
    expect(filtere('firmen', zeilen, 'hamburg', false).map((z) => z.id)).toEqual(['F-1']);
    expect(filtere('firmen', zeilen, 'hamburg lampen', true).map((z) => z.id)).toEqual(['F-2']);
    expect(sortiere(zeilen, 'name', true).map((z) => z.id)).toEqual(['F-2', 'F-1']);
  });

  it('keeps ids and meta columns read-only and types form values', () => {
    expect(istEditierbar('firmen', 'id')).toBe(false);
    expect(istEditierbar('firmen', 'geaendert_am')).toBe(false);
    expect(istEditierbar('firmen', 'name')).toBe(true);
    const vorher = { id: 'F-1', name: 'Alt', score: 80, archiviert: false };
    expect(aenderungenAus('firmen', vorher, { id: 'X', name: 'Neu', score: '90,5', archiviert: false })).toEqual({ name: 'Neu', score: 90.5 });
    expect(aenderungenAus('firmen', vorher, { score: '' })).toEqual({ score: null });
    expect(() => aenderungenAus('firmen', vorher, { score: 'viel' })).toThrow('Zahl');
  });

  it('undoes exactly the columns a logged change touched', () => {
    expect(rueckgaengig('deals', { phase: 'neu', titel: 'A', geaendert_am: '1' }, { phase: 'angebot', titel: 'A', geaendert_am: '2' })).toEqual({ phase: 'neu' });
    expect(rueckgaengig('deals', null, { phase: 'neu' })).toEqual({});
  });

  it('writes CSV for German Excel', () => {
    expect(alsCsv(['a', 'b'], [{ a: 'x;y', b: 'sagt "hi"' }, { a: null, b: 3 }])).toBe('﻿a;b\r\n"x;y";"sagt ""hi"""\r\n;3');
  });
});
