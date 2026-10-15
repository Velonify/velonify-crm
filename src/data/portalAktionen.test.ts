import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { MemoryDrive } from './demo/memoryGoogle';
import type { DriveFile } from './google/drive';
import { findeBerechtigung, kartenKontext, kundensicht, portalKarte, type PortalDatei } from './portalApi';
import {
  dateiErlaubt,
  heuteInBerlin,
  ladeKundenDateien,
  portalAnfrage,
  portalDateien,
  portalFreigabe,
  PortalFehler,
  portalKommentar,
  pruefeUpload,
  sauberDateiname,
  sauberDateityp,
  UPLOAD_MAX_BYTES,
  VOM_KUNDEN_ORDNER,
} from './portalAktionen';
import type { TodoDaten } from './types';

const JETZT = new Date('2026-10-15T22:30:00Z');

async function demo() {
  const { service } = await createDemoBackend(() => 'lukas@velonify.de');
  const db = await service.load();
  const portal = await service.loadPortalDaten();
  const berechtigung = findeBerechtigung(db, portal, 'sophie@alpenglanz.example')!;
  const todos = await service.loadTodoDaten();
  const karte = (titel: string) => todos.aufgaben.find((a) => a.titel === titel)!;
  return { service, db, portal, berechtigung, todos, karte };
}

function fehler(aktion: () => unknown): PortalFehler {
  try {
    aktion();
  } catch (err) {
    if (err instanceof PortalFehler) return err;
    throw err;
  }
  throw new Error('kein Fehler');
}

describe('portal actions: which cards', () => {
  it('rejects cards of other boards, hidden cards and archived cards', async () => {
    const { service, db, berechtigung, karte } = await demo();
    const intern = karte('Angebot Nordlicht nachfassen');
    const versteckt = karte('Core Web Vitals der Kategorieseiten prüfen');
    const sichtbar = karte('Black-Week-Banner einbauen');
    await service.setKarteArchiviert(sichtbar.id, true, sichtbar.geaendert_am);
    // A card on the board of another client, visible there.
    const andere = db.firmen.find((f) => f.name === 'Kleinod Schmuckmanufaktur')!;
    const fremdesBoard = await service.boardFuer(andere.id);
    const fremd = await service.saveKarte(fremdesBoard.id, { titel: 'Fremde Karte', beschreibung: '', zustaendig: '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: true });
    const todos = await service.loadTodoDaten();

    for (const id of [intern.id, versteckt.id, sichtbar.id, fremd.id, '', undefined, 42]) {
      expect(fehler(() => portalKommentar({ berechtigung, todos, eingabe: { karte_id: id, text: 'Hallo' }, jetzt: JETZT })).status).toBe(404);
    }
  });

  it('rejects cards of an archived board', async () => {
    const { berechtigung, todos, karte } = await demo();
    const hero = karte('Startseiten-Hero Winterkollektion');
    const ohneBoard: TodoDaten = { ...todos, boards: todos.boards.map((b) => (b.id === hero.board_id ? { ...b, archiviert: true } : b)) };
    expect(fehler(() => portalFreigabe({ berechtigung, todos: ohneBoard, eingabe: { karte_id: hero.id, entscheidung: 'freigegeben' }, jetzt: JETZT })).status).toBe(404);
  });
});

describe('portal actions: approval', () => {
  it('approves an open approval and stores who and when', async () => {
    const { berechtigung, todos, karte } = await demo();
    const hero = karte('Startseiten-Hero Winterkollektion');
    const ergebnis = portalFreigabe({ berechtigung, todos, eingabe: { karte_id: hero.id, entscheidung: 'freigegeben' }, jetzt: JETZT });
    expect(ergebnis.changes).toEqual({
      freigabe: 'freigegeben',
      freigabe_am: JETZT.toISOString(),
      freigabe_von: 'sophie@alpenglanz.example',
      geaendert_am: JETZT.toISOString(),
      geaendert_von: 'sophie@alpenglanz.example',
    });
    expect(ergebnis.kommentar).toBeNull();
  });

  it('needs a note for changes and adds it as a comment', async () => {
    const { db, berechtigung, todos, karte } = await demo();
    const hero = karte('Startseiten-Hero Winterkollektion');
    const ohneNotiz = fehler(() => portalFreigabe({ berechtigung, todos, eingabe: { karte_id: hero.id, entscheidung: 'aenderung', notiz: '   ' }, jetzt: JETZT }));
    expect(ohneNotiz.status).toBe(400);
    expect(ohneNotiz.message).toBe('Bitte schreib kurz, was anders sein soll.');

    const ergebnis = portalFreigabe({ berechtigung, todos, eingabe: { karte_id: hero.id, entscheidung: 'aenderung', notiz: ' Bitte das Logo größer. ' }, jetzt: JETZT });
    expect(ergebnis.changes.freigabe).toBe('aenderung');
    expect(ergebnis.kommentar).toMatchObject({ aufgabe_id: hero.id, text: 'Bitte das Logo größer.', von: 'sophie@alpenglanz.example' });

    // The answer as the portal returns it: own comment marked, approval time included.
    const neu = { ...hero, ...ergebnis.changes };
    const sicht = portalKarte(neu, kartenKontext({ berechtigung, db, todos: { ...todos, kommentare: [...todos.kommentare, ergebnis.kommentar!] }, teamDomain: 'velonify.de' }));
    expect(sicht.freigabe).toBe('aenderung');
    expect(sicht.freigabe_am).toBe(JETZT.toISOString());
    expect(sicht.phase).not.toBe('wartet');
    expect(sicht.kommentare).toEqual([{ von: 'Sophie Lindner', team: false, ich: true, text: 'Bitte das Logo größer.', datum: JETZT.toISOString() }]);
  });

  it('answers only while the approval is open', async () => {
    const { berechtigung, todos, karte } = await demo();
    const banner = karte('Black-Week-Banner einbauen');
    expect(fehler(() => portalFreigabe({ berechtigung, todos, eingabe: { karte_id: banner.id, entscheidung: 'freigegeben' }, jetzt: JETZT })).status).toBe(409);
    const hero = karte('Startseiten-Hero Winterkollektion');
    const beantwortet = { ...todos, aufgaben: todos.aufgaben.map((a) => (a.id === hero.id ? { ...a, freigabe: 'freigegeben' } : a)) };
    expect(fehler(() => portalFreigabe({ berechtigung, todos: beantwortet, eingabe: { karte_id: hero.id, entscheidung: 'aenderung', notiz: 'x' }, jetzt: JETZT })).status).toBe(409);
    expect(fehler(() => portalFreigabe({ berechtigung, todos, eingabe: { karte_id: hero.id, entscheidung: 'vielleicht' }, jetzt: JETZT })).status).toBe(400);
  });
});

describe('portal actions: comments', () => {
  it('comments as the contact, with length limits', async () => {
    const { berechtigung, todos, karte } = await demo();
    const banner = karte('Black-Week-Banner einbauen');
    const neu = portalKommentar({ berechtigung, todos, eingabe: { karte_id: banner.id, text: ' Passt so! ' }, jetzt: JETZT });
    expect(neu).toMatchObject({ aufgabe_id: banner.id, text: 'Passt so!', von: 'sophie@alpenglanz.example', datum: JETZT.toISOString() });
    expect(fehler(() => portalKommentar({ berechtigung, todos, eingabe: { karte_id: banner.id, text: '' }, jetzt: JETZT })).status).toBe(400);
    expect(fehler(() => portalKommentar({ berechtigung, todos, eingabe: { karte_id: banner.id, text: 'x'.repeat(5001) }, jetzt: JETZT })).status).toBe(400);
  });
});

describe('portal actions: requests', () => {
  const hochgeladen: PortalDatei[] = [
    { id: 'D-KUNDE', name: 'Logo neu.svg', mimeType: 'image/svg+xml', geaendert: '2026-10-15T10:00:00Z', von: 'kunde' },
    { id: 'D-VELONIFY', name: 'Reporting.pdf', mimeType: 'application/pdf', geaendert: '2026-10-14T10:00:00Z', von: 'velonify' },
  ];

  it('puts the request into the first column, marked as the client’s, with an internal news entry', async () => {
    const { db, berechtigung, todos } = await demo();
    const board = todos.boards.find((b) => b.firma_id === berechtigung.firma.id)!;
    const { karte, news } = portalAnfrage({
      berechtigung,
      todos,
      eingabe: { titel: ' Neues Banner für den Sale ', details: 'Ab Montag bitte.', dringend: true, datei_ids: ['D-KUNDE'] },
      kundenDateien: hochgeladen,
      jetzt: JETZT,
    });
    expect(karte).toMatchObject({
      board_id: board.id,
      spalte_id: 'backlog',
      titel: 'Neues Banner für den Sale',
      quelle: 'kunde',
      sichtbar_kunde: true,
      labels: 'Dringend',
      zustaendig: 'Johannes',
      archiviert: false,
      freigabe: '',
      erstellt_von: 'sophie@alpenglanz.example',
    });
    expect(karte.beschreibung).toBe(`Ab Montag bitte.\n\nAnhänge (07_Client-Share/${VOM_KUNDEN_ORDNER}):\n- Logo neu.svg`);
    const letzte = Math.max(...todos.aufgaben.filter((a) => a.board_id === board.id && a.spalte_id === 'backlog').map((a) => a.sortierung ?? 0));
    expect(karte.sortierung).toBeGreaterThan(letzte);

    // 22:30 UTC is already the next day in Berlin.
    expect(news).toMatchObject({ firma_id: berechtigung.firma.id, art: 'hinweis', titel: 'Neue Anfrage: Neues Banner für den Sale', datum: '2026-10-16', sichtbar_kunde: false });

    const sicht = portalKarte(karte, kartenKontext({ berechtigung, db, todos, teamDomain: 'velonify.de' }));
    expect(sicht).toMatchObject({ anfrage: true, phase: 'geplant', freigabe: '', freigabe_am: '' });
  });

  it('accepts only files the client uploaded as attachments', async () => {
    const { berechtigung, todos } = await demo();
    const anfrage = (datei_ids: unknown) => () => portalAnfrage({ berechtigung, todos, eingabe: { titel: 'Test', datei_ids }, kundenDateien: hochgeladen, jetzt: JETZT });
    expect(fehler(anfrage(['D-VELONIFY'])).status).toBe(400);
    expect(fehler(anfrage(['D-FREMD'])).status).toBe(400);
    expect(fehler(anfrage('D-KUNDE')).status).toBe(400);
    expect(fehler(anfrage([1])).status).toBe(400);
    expect(portalAnfrage({ berechtigung, todos, eingabe: { titel: 'Ohne' }, kundenDateien: [], jetzt: JETZT }).karte.beschreibung).toBe('');
  });

  it('checks title and text and needs a board', async () => {
    const { berechtigung, todos } = await demo();
    const anfrage = (eingabe: Record<string, unknown>, t: Pick<TodoDaten, 'boards' | 'aufgaben'> = todos) => () => portalAnfrage({ berechtigung, todos: t, eingabe, kundenDateien: [], jetzt: JETZT });
    expect(fehler(anfrage({ titel: '  ' })).status).toBe(400);
    expect(fehler(anfrage({ titel: 'x'.repeat(201) })).status).toBe(400);
    expect(fehler(anfrage({ titel: 'ok', details: 'x'.repeat(5001) })).status).toBe(400);
    const lang = portalAnfrage({ berechtigung, todos, eingabe: { titel: 'x'.repeat(200) }, kundenDateien: [], jetzt: JETZT });
    expect(lang.news.titel.length).toBeLessThanOrEqual(140);
    const ohneBoard = fehler(anfrage({ titel: 'ok' }, { ...todos, boards: todos.boards.filter((b) => b.firma_id !== berechtigung.firma.id) }));
    expect(ohneBoard.status).toBe(409);
    expect(ohneBoard.message).toBe('Anfragen gehen gerade nicht. Schreib uns bitte eine Mail an hallo@velonify.de.');
  });
});

describe('portal files', () => {
  it('lists the share and „Vom Kunden“, newest first, and allows downloads only from these two folders', async () => {
    const drive = new MemoryDrive();
    const firma = drive.add('AGK', null);
    const share = drive.add('07_Client-Share', firma.id);
    const intern = drive.add('04_Delivery', firma.id);
    const vomKunden = drive.add(VOM_KUNDEN_ORDNER, share.id);
    const tief = drive.add('Unterordner', vomKunden.id);
    const datei = (name: string, parent: string, zeit: string): DriveFile => Object.assign(drive.add(name, parent, 'application/pdf'), { modifiedTime: zeit });
    const report = datei('Report.pdf', share.id, '2026-10-10T08:00:00Z');
    const upload = datei('Briefing.pdf', vomKunden.id, '2026-10-12T08:00:00Z');
    const geheim = datei('Kalkulation.pdf', intern.id, '2026-10-13T08:00:00Z');
    const versteckt = datei('Tief.pdf', tief.id, '2026-10-14T08:00:00Z');

    const ordner = await ladeKundenDateien(drive, firma.id);
    expect(ordner.dateien.map((d) => [d.name, d.von])).toEqual([
      ['Briefing.pdf', 'kunde'],
      ['Report.pdf', 'velonify'],
    ]);
    expect(dateiErlaubt(await drive.getFile(report.id), ordner)).toBe(true);
    expect(dateiErlaubt(await drive.getFile(upload.id), ordner)).toBe(true);
    expect(dateiErlaubt(await drive.getFile(geheim.id), ordner)).toBe(false);
    expect(dateiErlaubt(await drive.getFile(versteckt.id), ordner)).toBe(false);
    expect(dateiErlaubt(await drive.getFile(vomKunden.id), ordner)).toBe(false);
    expect(dateiErlaubt(null, ordner)).toBe(false);

    // Without the upload folder only the share counts; without a firm folder nothing.
    expect(portalDateien([report], []).map((d) => d.von)).toEqual(['velonify']);
    expect(await ladeKundenDateien(drive, '')).toEqual({ shareId: '', vomKundenId: '', dateien: [] });
    expect(dateiErlaubt(await drive.getFile(upload.id), { shareId: share.id, vomKundenId: '' })).toBe(false);
  });

  it('cleans file names and types and checks the size', () => {
    expect(sauberDateiname(encodeURIComponent('../../Angebot "final".pdf'))).toBe('Angebot final.pdf');
    expect(sauberDateiname(encodeURIComponent('Größe März.png'))).toBe('Größe März.png');
    expect(sauberDateiname('%E0%A4%A')).toBe('%E0%A4%A');
    expect(sauberDateiname('...')).toBe('Datei');
    expect(sauberDateiname(undefined)).toBe('Datei');
    const lang = sauberDateiname(`${'a'.repeat(300)}.pdf`);
    expect(lang.length).toBe(150);
    expect(lang.endsWith('.pdf')).toBe(true);
    expect(sauberDateityp('image/png; charset=binary')).toBe('image/png');
    expect(sauberDateityp('application/vnd.google-apps.document')).toBe('application/octet-stream');
    expect(sauberDateityp('')).toBe('application/octet-stream');
    expect(() => pruefeUpload(0)).toThrow('leer');
    expect(() => pruefeUpload(UPLOAD_MAX_BYTES + 1)).toThrow('WeTransfer');
    expect(() => pruefeUpload(UPLOAD_MAX_BYTES)).not.toThrow();
  });

  it('marks files and own comments in the client view', async () => {
    const { service, db, portal, berechtigung } = await demo();
    const banner = (await service.loadTodoDaten()).aufgaben.find((a) => a.titel === 'Black-Week-Banner einbauen')!;
    await service.kommentiereKarte(banner.id, 'Ist eingebaut.');
    const todos = await service.loadTodoDaten();
    const kommentar = portalKommentar({ berechtigung, todos, eingabe: { karte_id: banner.id, text: 'Danke!' }, jetzt: new Date('2099-01-01T00:00:00Z') });
    const dateien = portalDateien([], [{ id: 'X', name: 'a.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-15T00:00:00Z' }]);
    const sicht = kundensicht({ berechtigung, db, kunden: await service.loadKundenDaten(), todos: { ...todos, kommentare: [...todos.kommentare, kommentar] }, portal, dateien, teamDomain: 'velonify.de' });
    expect(sicht.dateien).toEqual([{ id: 'X', name: 'a.pdf', mimeType: 'application/pdf', geaendert: '2026-10-15T00:00:00Z', von: 'kunde' }]);
    expect(sicht.karten.find((k) => k.id === banner.id)!.kommentare.map((k) => [k.von, k.team, k.ich])).toEqual([
      ['Lukas', true, false],
      ['Sophie Lindner', false, true],
    ]);
    expect(heuteInBerlin(new Date('2026-06-30T22:00:00Z'))).toBe('2026-07-01');
  });
});
