import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import {
  checklisteVon, faelligkeit, kartenNachSpalte, meineAufgaben, neueSpaltenId, prepareKarte, prepareSpalten, sortierungFuerPosition, sortierungZwischen, spaltenVon, STANDARD_SPALTEN,
} from './todos';
import type { Aufgabe } from './types';

const leer = { titel: 'X', beschreibung: '', zustaendig: '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false };

describe('to-do logic', () => {
  it('falls back to the standard columns for broken JSON and validates edits', () => {
    expect(spaltenVon({ spalten: 'kaputt' })).toEqual(STANDARD_SPALTEN);
    expect(spaltenVon({ spalten: '[{"id":"a","titel":"A","erledigt":true}]' })).toEqual([{ id: 'a', titel: 'A', erledigt: true }]);
    expect(() => prepareSpalten([])).toThrow(ValidationError);
    expect(() => prepareSpalten([{ id: 'a', titel: 'A', erledigt: true }, { id: 'b', titel: 'B', erledigt: true }])).toThrow(/Nur eine/);
    expect(neueSpaltenId('Für Review', [{ id: 'fuer-review', titel: '' }])).toBe('fuer-review-2');
  });

  it('cleans cards: labels deduplicated, empty checklist points dropped', () => {
    const clean = prepareKarte({ ...leer, titel: ' Banner ', labels: 'Theme, , Theme,SEO', checkliste: JSON.stringify([{ text: ' a ', erledigt: true }, { text: ' ', erledigt: false }]) });
    expect(clean.titel).toBe('Banner');
    expect(clean.labels).toBe('Theme, SEO');
    expect(checklisteVon(clean)).toEqual([{ text: 'a', erledigt: true }]);
    expect(() => prepareKarte({ ...leer, titel: ' ' })).toThrow(ValidationError);
    expect(() => prepareKarte({ ...leer, faellig_am: 'morgen' })).toThrow(/Datum/);
  });

  it('places cards between neighbours', () => {
    expect(sortierungZwischen(null, null)).toBe(1000);
    expect(sortierungZwischen(1000, null)).toBe(2000);
    expect(sortierungZwischen(null, 1000)).toBe(0);
    expect(sortierungZwischen(1000, 2000)).toBe(1500);
    const spalte = [{ id: 'a', sortierung: 1000 }, { id: 'b', sortierung: 2000 }, { id: 'c', sortierung: 3000 }] as Aufgabe[];
    expect(sortierungFuerPosition(spalte, 'c', 0)).toBe(0);
    expect(sortierungFuerPosition(spalte, 'a', 1)).toBe(2500);
    expect(sortierungFuerPosition(spalte, 'x', Infinity)).toBe(4000);
  });

  it('knows what is due', () => {
    const heute = '2026-10-14';
    expect(faelligkeit({ faellig_am: '2026-10-13', erledigt_am: '' }, heute)).toBe('ueberfaellig');
    expect(faelligkeit({ faellig_am: '2026-10-16', erledigt_am: '' }, heute)).toBe('bald');
    expect(faelligkeit({ faellig_am: '2026-10-20', erledigt_am: '' }, heute)).toBe('spaeter');
    expect(faelligkeit({ faellig_am: '2026-10-13', erledigt_am: '2026-10-13T10:00:00Z' }, heute)).toBe('ohne');
  });

  it('moves cards, marks them done in the done column and keeps cards of removed columns', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const alpenglanz = db.firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    const board = await service.boardFuer(alpenglanz.id);
    expect((await service.boardFuer(alpenglanz.id)).id).toBe(board.id);

    let daten = await service.loadTodoDaten();
    const banner = daten.aufgaben.find((a) => a.titel === 'Black-Week-Banner einbauen')!;
    await service.verschiebeKarte(banner.id, 'erledigt', 0);
    daten = await service.loadTodoDaten();
    const fertig = daten.aufgaben.find((a) => a.id === banner.id)!;
    expect(fertig.erledigt_am).not.toBe('');
    expect(kartenNachSpalte(daten.aufgaben, board).get('erledigt')![0].id).toBe(banner.id);

    await service.setKarteErledigt(banner.id, false);
    daten = await service.loadTodoDaten();
    expect(daten.aufgaben.find((a) => a.id === banner.id)).toMatchObject({ spalte_id: 'backlog', erledigt_am: '' });

    const ohneWartet = STANDARD_SPALTEN.filter((s) => s.id !== 'wartet');
    await service.saveBoard(board.id, board.titel, ohneWartet, board.geaendert_am);
    daten = await service.loadTodoDaten();
    expect(daten.aufgaben.find((a) => a.titel === 'Produktfotos Winterkollektion')!.spalte_id).toBe('backlog');

    expect(meineAufgaben(daten.aufgaben, daten.boards, 'Johannes').map((a) => a.titel)).toEqual(['Black-Week-Banner einbauen']);
    await service.kommentiereKarte(banner.id, 'Freigabe vom Kunden da');
    expect((await service.loadTodoDaten()).kommentare.filter((k) => k.aufgabe_id === banner.id)).toHaveLength(1);
  });
});
