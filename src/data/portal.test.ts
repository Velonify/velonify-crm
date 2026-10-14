import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import { fahrplanStand, freigabeVon, kannPortalZugang, meilensteineVon, prepareMeilenstein, tauscheMeilenstein, werkzeugAktiv } from './portal';
import type { Meilenstein } from './types';

const meta = { erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' };
const ms = (id: string, sortierung: number, felder: Partial<Meilenstein> = {}): Meilenstein => ({
  id, firma_id: 'F-1', titel: id, datum: '', status: 'offen', sortierung, archiviert: false, ...meta, ...felder,
});

describe('client portal logic', () => {
  it('needs a usable e-mail address for a login', () => {
    expect(kannPortalZugang({ email: ' sophie@alpenglanz.example ', archiviert: false })).toBe(true);
    expect(kannPortalZugang({ email: '', archiviert: false })).toBe(false);
    expect(kannPortalZugang({ email: 'kein-at', archiviert: false })).toBe(false);
    expect(kannPortalZugang({ email: 'a@b.example', archiviert: true })).toBe(false);
  });

  it('validates milestones', () => {
    expect(prepareMeilenstein({ titel: ' Go-live ', datum: '2026-11-28', status: 'offen' })).toEqual({ titel: 'Go-live', datum: '2026-11-28', status: 'offen' });
    expect(() => prepareMeilenstein({ titel: ' ', datum: '', status: 'offen' })).toThrow(ValidationError);
    expect(() => prepareMeilenstein({ titel: 'X', datum: '28.11.2026', status: 'offen' })).toThrow(/Datum/);
    expect(() => prepareMeilenstein({ titel: 'X', datum: '', status: 'fertig' as never })).toThrow(/Status/);
  });

  it('sorts, swaps and reads the roadmap', () => {
    const liste = [ms('c', 30, { status: 'offen', datum: '2026-11-28' }), ms('a', 10, { status: 'erledigt' }), ms('b', 20, { status: 'aktiv', datum: '2026-10-31' }), ms('x', 5, { archiviert: true })];
    const sortiert = meilensteineVon(liste, 'F-1');
    expect(sortiert.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(tauscheMeilenstein(sortiert, 'c', -1)).toEqual([{ id: 'c', sortierung: 20 }, { id: 'b', sortierung: 30 }]);
    expect(tauscheMeilenstein(sortiert, 'a', -1)).toEqual([]);
    const stand = fahrplanStand(sortiert);
    expect(stand.aktuell?.id).toBe('b');
    expect(stand.ziel?.id).toBe('c');
    expect(stand.erledigt).toBe(1);
    expect(fahrplanStand([]).aktuell).toBeUndefined();
  });

  it('reads the approval state of a card', () => {
    expect(freigabeVon({ freigabe: 'offen' })).toBe('offen');
    expect(freigabeVon({ freigabe: '' })).toBeNull();
    expect(freigabeVon({ freigabe: 'quatsch' })).toBeNull();
  });
});

describe('client portal in the service', () => {
  it('switches logins and tools and keeps one row each', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const firma = db.firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    const tobias = db.kontakte.find((k) => k.vorname === 'Tobias')!;
    const petra = db.kontakte.find((k) => k.vorname === 'Petra')!;
    const fremd = db.kontakte.find((k) => k.firma_id !== firma.id)!;

    await service.setPortalZugang(firma.id, tobias.id, true);
    await service.setPortalZugang(firma.id, tobias.id, false);
    await expect(service.setPortalZugang(firma.id, petra.id, true)).rejects.toThrow(/E-Mail/);
    await expect(service.setPortalZugang(firma.id, fremd.id, true)).rejects.toThrow(/anderen Firma/);
    let portal = await service.loadPortalDaten();
    expect(portal.zugaenge.filter((z) => z.kontakt_id === tobias.id)).toHaveLength(1);
    expect(portal.zugaenge.find((z) => z.kontakt_id === tobias.id)!.aktiv).toBe(false);

    expect(werkzeugAktiv(portal.werkzeuge, firma.id, 'utm')).toBe(true);
    await service.setPortalWerkzeug(firma.id, 'utm', false);
    await expect(service.setPortalWerkzeug(firma.id, 'social-planer', true)).rejects.toThrow(/noch nicht fertig/);
    await expect(service.setPortalWerkzeug(firma.id, 'gibtsnicht', true)).rejects.toThrow(ValidationError);
    portal = await service.loadPortalDaten();
    expect(werkzeugAktiv(portal.werkzeuge, firma.id, 'utm')).toBe(false);
    expect(portal.werkzeuge.filter((w) => w.firma_id === firma.id && w.werkzeug === 'utm')).toHaveLength(1);
  });

  it('orders milestones and asks for approval only on client boards', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const firma = db.firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    let liste = meilensteineVon((await service.loadPortalDaten()).meilensteine, firma.id);
    expect(liste.map((m) => m.titel)).toEqual(['Migration', 'Tracking', 'Design & Inhalte', 'Black Week', 'Go-live Phase 2']);
    await service.verschiebeMeilenstein(liste[3].id, 1);
    liste = meilensteineVon((await service.loadPortalDaten()).meilensteine, firma.id);
    expect(liste.map((m) => m.titel).slice(3)).toEqual(['Go-live Phase 2', 'Black Week']);

    let todos = await service.loadTodoDaten();
    const intern = todos.boards.find((b) => !b.firma_id)!;
    const interneKarte = todos.aufgaben.find((a) => a.board_id === intern.id)!;
    await expect(service.freigabeAnfragen(interneKarte.id, interneKarte.geaendert_am)).rejects.toThrow(/Kunden-Boards/);

    const karte = todos.aufgaben.find((a) => a.titel === 'Core Web Vitals der Kategorieseiten prüfen')!;
    expect(karte.sichtbar_kunde).toBe(false);
    const angefragt = await service.freigabeAnfragen(karte.id, karte.geaendert_am);
    expect(angefragt).toMatchObject({ freigabe: 'offen', sichtbar_kunde: true, freigabe_von: 'test@velonify.de' });

    // Hiding the card from the client drops the open request.
    const { titel, beschreibung, zustaendig, faellig_am, labels, checkliste } = angefragt;
    const versteckt = await service.saveKarte(angefragt.board_id, { titel, beschreibung, zustaendig, faellig_am, labels, checkliste, sichtbar_kunde: false }, { id: angefragt.id, expectedGeaendertAm: angefragt.geaendert_am });
    expect(versteckt.freigabe).toBe('');

    todos = await service.loadTodoDaten();
    const hero = todos.aufgaben.find((a) => a.titel === 'Startseiten-Hero Winterkollektion')!;
    expect(hero.freigabe).toBe('offen');
    expect((await service.freigabeZuruecksetzen(hero.id, hero.geaendert_am)).freigabe).toBe('');
  });
});
