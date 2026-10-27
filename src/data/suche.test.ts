import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { befehle, normalisiere, suche, sucheBereiche, type Bereichsdaten } from './suche';
import type { Angebot, Aufgabe, Board, Firma, Magnet, SocialInhalt } from './types';

describe('suche', () => {
  it('treats umlaut spellings and accents as the same word', () => {
    expect(normalisiere('München')).toBe(normalisiere('Muenchen'));
    expect(normalisiere('Munchen')).toBe(normalisiere('MÜNCHEN'));
    expect(normalisiere('Kaffeerösterei')).toBe(normalisiere('kaffeeroesterei'));
  });

  it('finds firms, contacts and deals and ranks exact Kürzel and name starts first', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();

    expect(suche(db, 'AGK')[0]).toMatchObject({ art: 'firma', titel: 'Alpenglanz Kosmetik AG' });
    expect(suche(db, 'kaffeeroesterei').map((t) => t.titel)).toContain('Bergwerk Kaffeerösterei');

    const holm = suche(db, 'mara')[0];
    expect(holm).toMatchObject({ art: 'kontakt', titel: 'Mara Holm' });
    expect(holm.firmaId).toBe(db.firmen.find((f) => f.name.startsWith('Nordlicht'))!.id);

    // All words must match, in any field.
    expect(suche(db, 'shopify kleinod').map((t) => t.art)).toEqual(['deal']);
    expect(suche(db, 'hamburg nordlicht')[0]).toMatchObject({ art: 'firma', titel: 'Nordlicht Outdoor GmbH' });
    expect(suche(db, 'gibtesnicht')).toEqual([]);
    expect(suche(db, '   ')).toEqual([]);
  });

  it('lists archived records after active ones', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    let db = await service.load();
    const bergwerk = db.firmen.find((f) => f.name.startsWith('Bergwerk'))!;
    await service.setFirmaArchiviert(bergwerk.id, true, bergwerk.geaendert_am);
    db = await service.load();
    const firmen = suche(db, 'e').filter((t) => t.art === 'firma');
    expect(firmen.at(-1)).toMatchObject({ titel: 'Bergwerk Kaffeerösterei', archiviert: true });
  });

  it('finds actions and tools for the command palette', () => {
    const werkzeuge = [{ id: 'todo', name: 'To-Dos', beschreibung: 'Boards', pfad: '/todo' }, { id: 'plan', name: 'Geplant', beschreibung: '' }];
    expect(befehle('angebot', werkzeuge).map((t) => t.pfad)).toEqual([]);
    expect(befehle('angebot', [...werkzeuge, { id: 'angebote', name: 'Angebots-Rechner', beschreibung: '' }]).map((t) => t.pfad)).toEqual(['/angebote/neu']);
    expect(befehle('to-dos', werkzeuge).map((t) => t.titel)).toEqual(['To-Dos']);
    expect(befehle('', werkzeuge).some((t) => t.titel === 'Geplant')).toBe(false);
  });

  describe('sucheBereiche', () => {
    const firma = (felder: Partial<Firma>) => ({ id: 'F-1', name: '', kuerzel: '', domain: '', status: 'kunde', archiviert: false, ...felder }) as Firma;
    const firmen = [
      firma({ id: 'F-1', name: 'Gärtnerei Sonnenhof', kuerzel: 'GS', domain: 'sonnenhof.example' }),
      firma({ id: 'F-2', name: 'Möbelwerk Nord', kuerzel: 'MN', status: 'lead' }),
    ];
    const board = (felder: Partial<Board>) =>
      ({ id: 'B-1', firma_id: '', titel: 'Velonify intern', archiviert: false, spalten: JSON.stringify([{ id: 'offen', titel: 'Offen' }, { id: 'fertig', titel: 'Erledigt', erledigt: true }]), ...felder }) as Board;
    const karte = (felder: Partial<Aufgabe>) =>
      ({ id: 'T-1', board_id: 'B-1', spalte_id: 'offen', titel: '', labels: '', zustaendig: '', archiviert: false, ...felder }) as Aufgabe;
    const daten: Bereichsdaten = {
      todo: {
        boards: [board({}), board({ id: 'B-2', firma_id: 'F-1', titel: 'Gärtnerei Sonnenhof' })],
        aufgaben: [
          karte({ id: 'T-1', titel: 'Grüne Woche vorbereiten', zustaendig: 'Julian' }),
          karte({ id: 'T-2', board_id: 'B-2', titel: 'Grüne Banner tauschen', spalte_id: 'fertig' }),
          karte({ id: 'T-3', board_id: 'B-2', titel: 'Grünflächen-Kategorie anlegen' }),
          karte({ id: 'T-4', board_id: 'B-weg', titel: 'Grüner Karton' }),
        ],
      },
      angebote: [
        { id: 'A-1', nummer: '2026/12', version: 1, firma_id: 'F-2', titel: 'Shopify-Relaunch', status: 'entwurf', archiviert: false } as Angebot,
        { id: 'A-2', nummer: '2026/12', version: 2, firma_id: 'F-2', titel: 'Shopify-Relaunch', status: 'gesendet', archiviert: false } as Angebot,
      ],
      inhalte: [{ id: 'S-1', kennung: 'K7', art: 'karussell', serie: '', titel: 'Fünf Fehler beim Umzug', hook: 'Dein Shop verliert Kunden', archiviert: false } as SocialInhalt],
      magnete: [{ id: 'M-1', titel: 'Checkliste Umzug', stichwort: 'UMZUG', slug: 'umzug', beschreibung: '', aktiv: true, archiviert: false } as Magnet],
    };

    it('finds clients, cards, offers, content and magnets with their target pages', () => {
      expect(sucheBereiche({ firmen }, daten, 'GS')[0]).toMatchObject({ art: 'kunde', pfad: '/kunden/F-1' });
      // Only firms with status "kunde" are clients.
      expect(sucheBereiche({ firmen }, daten, 'möbelwerk').filter((t) => t.art === 'kunde')).toEqual([]);

      const karten = sucheBereiche({ firmen }, daten, 'GRUENE').filter((t) => t.art === 'karte');
      // Open cards before done ones; cards of a missing board are left out.
      expect(karten.map((t) => t.id)).toEqual(['T-1', 'T-2']);
      expect(karten[0]).toMatchObject({ pfad: '/todo/B-1?karte=T-1', details: 'Velonify intern · Offen · Julian' });
      // The board name is searched too.
      expect(sucheBereiche({ firmen }, daten, 'sonnenhof banner').map((t) => t.id)).toEqual(['T-2']);

      // Only the newest version of an offer, found by number or firm.
      expect(sucheBereiche({ firmen }, daten, '2026/12')).toMatchObject([{ art: 'angebot', id: 'A-2', pfad: '/angebote/A-2' }]);
      expect(sucheBereiche({ firmen }, daten, 'mobelwerk relaunch').map((t) => t.id)).toEqual(['A-2']);

      expect(sucheBereiche({ firmen }, daten, 'fuenf fehler')[0]).toMatchObject({ art: 'inhalt', pfad: '/social/inhalte/S-1' });
      expect(sucheBereiche({ firmen }, daten, 'verliert kunden')[0]).toMatchObject({ art: 'inhalt' });
      expect(sucheBereiche({ firmen }, daten, 'umzug').map((t) => t.art).sort()).toEqual(['inhalt', 'magnet']);
    });

    it('limits hits per area and skips areas that are not loaded', () => {
      const viele: Bereichsdaten = { todo: { boards: [board({})], aufgaben: Array.from({ length: 8 }, (_, i) => karte({ id: `T-${i}`, titel: `Aufgabe ${i}` })) } };
      expect(sucheBereiche({ firmen }, viele, 'aufgabe')).toHaveLength(5);
      expect(sucheBereiche({ firmen }, {}, 'umzug')).toEqual([]);
      expect(sucheBereiche({ firmen }, daten, '  ')).toEqual([]);
    });
  });
});
