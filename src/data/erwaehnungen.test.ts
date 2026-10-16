import { describe, expect, it } from 'vitest';
import { CrmService } from './crm';
import { createDemoBackend } from './demo/seed';
import type { DriveApi } from './google/drive';
import type { CalendarApi } from './google/calendar';
import { SheetStore } from './sheets/sheetStore';
import { auszug, erwaehnteNamen, neuErwaehnt, offeneErwaehnung, textTeile, ungelesene, vorschlaege } from './erwaehnungen';
import type { Erwaehnung } from './types';

const TEAM = ['Lugge', 'Johannes', 'Julian', 'Anna Lena', 'Anna'];

describe('@-mentions in text', () => {
  it('finds team members as whole words, case-insensitively and the longest name first', () => {
    expect(erwaehnteNamen('@julian kannst du? cc @Lugge, @Jo und @Anna Lena', TEAM)).toEqual(['Julian', 'Lugge', 'Anna Lena']);
    expect(erwaehnteNamen('@Anna, bitte', TEAM)).toEqual(['Anna']);
    expect(erwaehnteNamen('mail an lugge@velonify.de, @Julians Idee, @Lugge @Lugge', TEAM)).toEqual(['Lugge']);
    expect(erwaehnteNamen('ohne Erwähnung', TEAM)).toEqual([]);
  });

  it('splits text into plain parts and mentions for highlighting', () => {
    expect(textTeile('Hi @Julian!', TEAM)).toEqual([{ text: 'Hi ' }, { text: '@Julian', person: 'Julian' }, { text: '!' }]);
    expect(textTeile('@@Lugge', TEAM)).toEqual([{ text: '@' }, { text: '@Lugge', person: 'Lugge' }]);
  });

  it('only counts mentions added by an edit', () => {
    expect(neuErwaehnt('@Lugge schau mal', '@Lugge und @Julian schaut mal', TEAM)).toEqual(['Julian']);
    expect(neuErwaehnt('@Lugge', 'nur noch Text', TEAM)).toEqual([]);
  });

  it('shortens long text around the mention', () => {
    const lang = `${'a'.repeat(300)} @Julian bitte prüfen ${'b'.repeat(300)}`;
    const kurz = auszug(lang, 'Julian', 100);
    expect(kurz).toContain('@Julian');
    expect(kurz.startsWith('…') && kurz.endsWith('…')).toBe(true);
    expect(auszug('kurz\n  @Lugge', 'Lugge')).toBe('kurz @Lugge');
  });

  it('knows the open "@…" before the cursor and suggests matching names', () => {
    expect(offeneErwaehnung('Hallo @Ju', 9)).toEqual({ start: 6, suche: 'Ju' });
    expect(offeneErwaehnung('@', 1)).toEqual({ start: 0, suche: '' });
    expect(offeneErwaehnung('mail@ju', 7)).toBeNull();
    expect(offeneErwaehnung('Hallo @Ju fertig', 16)).toBeNull();
    expect(vorschlaege(TEAM, 'j')).toEqual(['Johannes', 'Julian']);
    expect(vorschlaege(TEAM, 'an')).toEqual(['Anna Lena', 'Anna', 'Johannes', 'Julian']);
  });

  it('lists the unread mentions of a person, newest first', () => {
    const e = (id: string, person: string, datum: string, gelesen_am = '') => ({ id, person, datum, gelesen_am }) as Erwaehnung;
    const alle = [e('1', 'Lugge', '2026-10-01'), e('2', 'Lugge', '2026-10-03'), e('3', 'Julian', '2026-10-04'), e('4', 'Lugge', '2026-10-05', 'x')];
    expect(ungelesene(alle, 'Lugge').map((x) => x.id)).toEqual(['2', '1']);
    expect(ungelesene(alle, null)).toEqual([]);
  });
});

describe('mentions saved by the service', () => {
  it('creates one unread mention per tagged person for comments, cards, notes and the history, never for the writer', async () => {
    const { service } = await createDemoBackend(() => 'julian@velonify.de');
    const db = await service.load();
    const firma = db.firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    const board = await service.boardFuer(firma.id);
    const karte = (await service.loadTodoDaten()).aufgaben.find((a) => a.board_id === board.id)!;

    // Only what Julian writes here; the demo data brings a few mentions of its own.
    const vonJulian = async () => (await service.loadErwaehnungen()).filter((e) => e.von === 'julian@velonify.de');
    await service.kommentiereKarte(karte.id, '@Lugge @Johannes bitte schauen, @Julian ist der Absender');
    let alle = await vonJulian();
    expect(alle.map((e) => e.person).sort()).toEqual(['Johannes', 'Lugge']);
    expect(alle[0]).toMatchObject({ art: 'kommentar', aufgabe_id: karte.id, firma_id: firma.id, titel: karte.titel, link: `/todo/${board.id}?karte=${karte.id}&kommentar=${alle[0].quelle_id}`, von: 'julian@velonify.de', gelesen_am: '' });

    await service.addAktivitaet({ firma_id: firma.id, kontakt_id: '', deal_id: '', typ: 'notiz', datum: '', text: 'Call war gut, @lugge übernimmt' });
    await service.updateFirma(firma.id, { notiz: `${firma.notiz} @Johannes` }, firma.geaendert_am);
    alle = await vonJulian();
    expect(alle.filter((e) => e.art === 'verlauf')).toMatchObject([{ person: 'Lugge', firma_id: firma.id, titel: firma.name, link: `/crm/firmen/${firma.id}` }]);
    expect(alle.filter((e) => e.art === 'firma')).toMatchObject([{ person: 'Johannes' }]);

    // Saving the note again without a new mention notifies nobody.
    const neu = (await service.load()).firmen.find((f) => f.id === firma.id)!;
    await service.updateFirma(firma.id, { notiz: `${neu.notiz} – ergänzt` }, neu.geaendert_am);
    expect((await vonJulian()).length).toBe(alle.length);

    const ids = alle.filter((e) => e.person === 'Lugge').map((e) => e.id);
    await service.markiereGelesen(ids);
    expect(ungelesene(await vonJulian(), 'Lugge')).toEqual([]);
    expect(ungelesene(await vonJulian(), 'Johannes')).toHaveLength(2);
  });

  it('hands new mentions to the hook and skips the writer named by `ich`', async () => {
    const { sheets } = await createDemoBackend(() => 'lukas@velonify.de');
    const erwaehnt: Erwaehnung[][] = [];
    const service = new CrmService({
      store: new SheetStore(sheets), drive: {} as DriveApi, calendar: {} as CalendarApi,
      currentUser: () => 'lukas@velonify.de', ich: () => 'Lugge',
      erwaehnt: async (e) => void erwaehnt.push(e),
    });
    const karte = (await service.loadTodoDaten()).aufgaben[0];
    await service.kommentiereKarte(karte.id, '@Lugge notiert, @Julian bitte freigeben');
    expect(erwaehnt.map((e) => e.map((x) => x.person))).toEqual([['Julian']]);
  });
});
