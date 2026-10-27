import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';

describe('Whiteboards im CrmService', () => {
  it('creates, renames, hangs on a firm, shows in the portal only with a firm and archives', async () => {
    const { service } = await createDemoBackend(() => 'julian@velonify.de');
    const firma = (await service.load()).firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    await expect(service.whiteboardAnlegen({ titel: '  ' })).rejects.toThrow('Namen');
    let board = await service.whiteboardAnlegen({ titel: 'Sitemap Relaunch', vorlage: 'sitemap' });
    expect(board).toMatchObject({ id: expect.stringMatching(/^WB-/), firma_id: '', vorlage: 'sitemap', sichtbar_kunde: false, erstellt_von: 'julian@velonify.de' });
    // Without a firm there is no client to show it to.
    board = await service.whiteboardAendern(board, { titel: 'Sitemap 2027', sichtbar_kunde: true });
    expect(board).toMatchObject({ titel: 'Sitemap 2027', sichtbar_kunde: false });
    board = await service.whiteboardAendern(board, { firma_id: firma.id, sichtbar_kunde: true });
    expect(board).toMatchObject({ firma_id: firma.id, sichtbar_kunde: true });
    board = await service.whiteboardAendern(board, { firma_id: '' });
    expect(board.sichtbar_kunde).toBe(false);
    board = await service.whiteboardAendern(board, { archiviert: true });
    expect((await service.loadWhiteboardDaten()).boards.find((b) => b.id === board.id)?.archiviert).toBe(true);
  });

  it('comments with @-mentions that link to the pin, replies without a position', async () => {
    const { service } = await createDemoBackend(() => 'julian@velonify.de');
    const firma = (await service.load()).firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
    const board = await service.whiteboardAnlegen({ titel: 'User Flow Checkout', firma_id: firma.id });
    const pin = await service.whiteboardKommentieren(board, { text: '@Lugge passt der Schritt?', element_id: 'el-1', x: 10, y: 20 });
    const antwort = await service.whiteboardKommentieren(board, { text: 'Ja, @Johannes baut es', antwort_auf: pin.id, x: 5 });
    expect(antwort).toMatchObject({ antwort_auf: pin.id, element_id: '', x: null, y: null });
    const neu = (await service.loadErwaehnungen()).filter((e) => e.art === 'whiteboard');
    expect(neu.map((e) => e.person).sort()).toEqual(['Johannes', 'Lugge']);
    expect(neu.every((e) => e.link === `/whiteboard/${board.id}?kommentar=${pin.id}` && e.firma_id === firma.id && e.titel === board.titel)).toBe(true);
    const erledigt = await service.whiteboardKommentarErledigt(pin, true);
    expect(erledigt.erledigt).toBe(true);
    expect((await service.loadWhiteboardDaten()).kommentare).toHaveLength(2);
  });
});
