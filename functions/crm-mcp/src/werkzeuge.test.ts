import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../../../src/data/demo/seed';
import { isoDate } from '../../../src/data/ids';
import type { CrmService } from '../../../src/data/crm';
import { ANLEITUNG, leseTeamZuordnung, registriereWerkzeuge } from './werkzeuge';

let service: CrmService;
let client: Client;

async function verbinde(email: string, name: string, teamName?: string) {
  ({ service } = await createDemoBackend(() => email));
  const server = new McpServer({ name: 'velonify-crm', version: 'test' }, { instructions: ANLEITUNG });
  registriereWerkzeuge(server, { service, person: { email, name }, teamName, heute: () => isoDate(new Date()) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
}

async function rufe(name: string, args: Record<string, unknown> = {}) {
  const ergebnis = await client.callTool({ name, arguments: args });
  const text = (ergebnis.content as { type: string; text: string }[])[0].text;
  return { fehler: Boolean(ergebnis.isError), text, daten: ergebnis.isError ? null : JSON.parse(text) };
}

const firmaId = async (name: string) => (await service.load()).firmen.find((f) => f.name.startsWith(name))!.id;

describe('CRM-Werkzeuge', () => {
  beforeEach(() => verbinde('lugge@velonify.de', 'Lugge Muster'));

  it('bietet alle Werkzeuge an, lesende als readOnly markiert', async () => {
    const { tools } = await client.listTools();
    const namen = tools.map((t) => t.name);
    expect(namen).toEqual(expect.arrayContaining(['ueberblick', 'suchen', 'firma_anzeigen', 'pipeline', 'mein_tag', 'lead_anlegen', 'phase_aendern', 'notiz_hinzufuegen']));
    expect(tools.find((t) => t.name === 'suchen')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'phase_aendern')?.annotations?.readOnlyHint).toBe(false);
  });

  it('erkennt die angemeldete Person als Teammitglied', async () => {
    const { daten } = await rufe('ueberblick');
    expect(daten.angemeldet).toEqual({ email: 'lugge@velonify.de', team_name: 'Lugge' });
    expect(daten.team).toContain('Johannes');
  });

  it('findet Firmen ohne Umlaute und zeigt die Akte mit Hub-Link', async () => {
    const { daten } = await rufe('suchen', { suchbegriff: 'kaffeeroesterei' });
    const treffer = daten.treffer.find((t: { art: string }) => t.art === 'firma');
    expect(treffer.titel).toBe('Bergwerk Kaffeerösterei');

    const akte = await rufe('firma_anzeigen', { firma_id: treffer.id });
    expect(akte.daten.hub).toBe(`https://crm.velonify.de/#/crm/firmen/${treffer.id}`);
    expect(akte.daten.deals[0].phase).toBe('qualifiziert');
    expect(akte.daten.verlauf.length).toBeGreaterThan(0);
  });

  it('verlangt beim Erstkontakt den Kontaktweg und teilt den Lead dann zu', async () => {
    const id = await firmaId('Bergwerk');
    const deal = (await service.load()).deals.find((d) => d.firma_id === id)!;
    expect(deal.zustaendig).toBe('Johannes');

    const ohne = await rufe('phase_aendern', { deal_id: deal.id, phase: 'kontaktiert' });
    expect(ohne.fehler).toBe(true);
    expect(ohne.text).toContain('kontaktweg');

    const mit = await rufe('phase_aendern', { deal_id: deal.id, phase: 'kontaktiert', kontaktweg: 'LinkedIn', vermerk: 'über das Magento-Ende' });
    expect(mit.fehler).toBe(false);
    expect(mit.daten.erledigt).toEqual(expect.arrayContaining(['zugeteilt an Johannes, Lugge', 'Verlauf: Kontaktiert über LinkedIn: über das Magento-Ende']));

    const db = await service.load();
    expect(db.deals.find((d) => d.id === deal.id)?.zustaendig).toBe('Johannes, Lugge');
    expect(db.firmen.find((f) => f.id === id)?.zustaendig).toBe('Johannes, Lugge');
    expect(db.aktivitaeten.some((a) => a.deal_id === deal.id && a.von === 'lugge@velonify.de' && a.text.startsWith('Kontaktiert über LinkedIn'))).toBe(true);
  });

  it('legt bei „angebot“ den Kundenordner an', async () => {
    const id = await firmaId('Kleinod');
    const deal = (await service.load()).deals.find((d) => d.firma_id === id && d.phase !== 'gewonnen' && d.phase !== 'verloren')!;
    const { daten, text } = await rufe('phase_aendern', { deal_id: deal.id, phase: 'angebot' });
    expect(text).toContain('Kundenordner angelegt');
    expect(daten.deal.phase).toBe('angebot');
    expect((await service.load()).firmen.find((f) => f.id === id)?.drive_ordner_id).not.toBe('');
  });

  it('verlangt für „verloren“ einen Grund aus der Liste', async () => {
    const id = await firmaId('Bergwerk');
    const deal = (await service.load()).deals.find((d) => d.firma_id === id)!;
    expect((await rufe('phase_aendern', { deal_id: deal.id, phase: 'verloren', verlustgrund: 'Keine Lust' })).fehler).toBe(true);
    expect((await rufe('phase_aendern', { deal_id: deal.id, phase: 'verloren', verlustgrund: 'Timing' })).fehler).toBe(false);
  });

  it('warnt vor Dubletten und legt erst auf Wunsch an', async () => {
    const doppelt = await rufe('lead_anlegen', { firma: { name: 'Bergwerk Kaffeerösterei GmbH' } });
    expect(doppelt.daten.angelegt).toBe(false);
    expect(doppelt.daten.aehnlich[0].name).toBe('Bergwerk Kaffeerösterei');

    const neu = await rufe('lead_anlegen', {
      firma: { name: 'Seegrün Teehandel', domain: 'https://www.seegruen-tee.example/', ort: 'Konstanz' },
      kontakt: { vorname: 'Ida', nachname: 'Brenner', rolle: 'Inhaberin' },
      deal: { titel: 'Shopify-Migration', phase: 'qualifiziert' },
      vermerk: 'Stellenanzeige E-Commerce-Manager',
    });
    expect(neu.daten.angelegt).toBe(true);
    const db = await service.load();
    const firma = db.firmen.find((f) => f.id === neu.daten.firma_id)!;
    expect(firma).toMatchObject({ domain: 'seegruen-tee.example', zustaendig: 'Lugge', quelle: 'Claude' });
    expect(db.deals.find((d) => d.id === neu.daten.deal_id)).toMatchObject({ phase: 'qualifiziert', zustaendig: 'Lugge', kontakt_id: neu.daten.kontakt_id });
  });

  it('ändert nur die angegebenen Felder eines Kontakts', async () => {
    const id = await firmaId('Kleinod');
    const kontakt = (await service.load()).kontakte.find((k) => k.firma_id === id)!;
    const { daten } = await rufe('kontakt_speichern', { firma_id: id, kontakt_id: kontakt.id, felder: { telefon: '0341 000000' } });
    expect(daten.kontakt).toMatchObject({ vorname: kontakt.vorname, email: kontakt.email, telefon: '0341 000000' });
  });

  it('schreibt Notizen und Wiedervorlagen, die in „Mein Tag“ auftauchen', async () => {
    const id = await firmaId('Bergwerk');
    expect((await rufe('notiz_hinzufuegen', { firma_id: id, text: 'Rückruf vereinbart', typ: 'anruf' })).fehler).toBe(false);
    const heute = isoDate(new Date());
    const { daten } = await rufe('wiedervorlage_setzen', { firma_id: id, titel: 'Zahlen schicken', faellig_am: heute });
    expect(daten.wiedervorlage.zustaendig).toBe('Lugge');

    const tag = await rufe('mein_tag');
    expect(tag.daten.fuer).toBe('Lugge');
    expect(tag.daten.heute_faellig.map((a: { titel: string }) => a.titel)).toContain('Zahlen schicken');

    await rufe('wiedervorlage_erledigt', { wiedervorlage_id: daten.wiedervorlage_id });
    const danach = await rufe('mein_tag');
    expect(danach.daten.heute_faellig.map((a: { titel: string }) => a.titel)).not.toContain('Zahlen schicken');
  });

  it('nimmt nur Namen aus dem Team als Zuständige', async () => {
    const id = await firmaId('Bergwerk');
    const { fehler, text } = await rufe('wiedervorlage_setzen', { firma_id: id, titel: 'x', faellig_am: '2026-10-02', zustaendig: 'lugge@velonify.de' });
    expect(fehler).toBe(true);
    expect(text).toContain('nicht im Team');
  });
});

describe('Teamname über TEAM_ZUORDNUNG', () => {
  it('liest die Zuordnung, mit ; oder , getrennt', () => {
    expect(leseTeamZuordnung('Lukas@velonify.de=Lugge; julian@velonify.de = Julian,kaputt')).toEqual(
      new Map([['lukas@velonify.de', 'Lugge'], ['julian@velonify.de', 'Julian']]),
    );
  });

  it('erkennt ohne Zuordnung niemanden, wenn Name und Adresse nicht passen', async () => {
    await verbinde('lukas@velonify.de', 'Lukas Muster');
    expect((await rufe('ueberblick')).daten.angemeldet.team_name).toBeNull();
  });

  it('nutzt den festen Teamnamen für Mein Tag und die Zuteilung', async () => {
    await verbinde('lukas@velonify.de', 'Lukas Muster', 'Lugge');
    expect((await rufe('ueberblick')).daten.angemeldet.team_name).toBe('Lugge');
    expect((await rufe('mein_tag')).daten.fuer).toBe('Lugge');

    const id = await firmaId('Bergwerk');
    const deal = (await service.load()).deals.find((d) => d.firma_id === id)!;
    const { daten } = await rufe('phase_aendern', { deal_id: deal.id, phase: 'kontaktiert', kontaktweg: 'E-Mail' });
    expect(daten.erledigt).toContain('zugeteilt an Johannes, Lugge');
  });

  it('übergeht einen Namen, der nicht im Team ist', async () => {
    await verbinde('lugge@velonify.de', 'Lugge', 'Lukas');
    expect((await rufe('ueberblick')).daten.angemeldet.team_name).toBe('Lugge');
  });
});

describe('archivieren', () => {
  beforeEach(() => verbinde('lugge@velonify.de', 'Lugge'));

  it('blendet eine Firma samt Deals aus und stellt sie wieder her', async () => {
    const id = await firmaId('Bergwerk');
    expect((await rufe('archivieren', { firma_id: id })).daten.archiviert).toBe(true);
    const pipeline = await rufe('pipeline', { abgeschlossene_zeigen: true });
    const firmen = pipeline.daten.phasen.flatMap((p: { deals: { firma_id: string }[] }) => p.deals.map((d) => d.firma_id));
    expect(firmen).not.toContain(id);
    expect((await rufe('suchen', { suchbegriff: 'bergwerk' })).daten.treffer).toEqual([]);

    expect((await rufe('archivieren', { firma_id: id, archiviert: false })).daten.archiviert).toBe(false);
    expect((await rufe('suchen', { suchbegriff: 'bergwerk' })).daten.treffer.length).toBeGreaterThan(0);
  });

  it('zählt im Überblick keine Deals archivierter Firmen mit', async () => {
    const vorher = (await rufe('ueberblick')).daten;
    expect((await rufe('archivieren', { firma_id: await firmaId('Bergwerk') })).daten.archiviert).toBe(true);
    const nachher = (await rufe('ueberblick')).daten;
    expect(nachher.kennzahlen.offen).toBe(vorher.kennzahlen.offen - 1);
    const qualifiziert = (d: { phasen: { phase: string; offene_deals: number }[] }) => d.phasen.find((p) => p.phase === 'qualifiziert')!.offene_deals;
    expect(qualifiziert(nachher)).toBe(qualifiziert(vorher) - 1);
    expect(nachher.kennzahlen.offen).toBe((await rufe('pipeline')).daten.anzahl);
  });

  it('verlangt genau eine ID', async () => {
    const { fehler } = await rufe('archivieren', {});
    expect(fehler).toBe(true);
  });
});

describe('Lead-Magnete', () => {
  beforeEach(() => verbinde('lugge@velonify.de', 'Lugge Muster'));

  it('listet Magnete mit Landingpage, DM-Link und Zahlen', async () => {
    const { daten } = await rufe('magnete');
    const skills = daten.magnete.find((m: { adresse: string }) => m.adresse === 'shopify-skills');
    expect(skills).toMatchObject({ aktiv: true, landingpage: 'https://velonify.de/ressourcen/shopify-skills/', eintraege: 4, offen: 4 });
    expect(skills.dm_link).toContain('utm_source=linkedin');
    const einzeln = await rufe('magnete', { adresse: 'shopify-skills' });
    expect(einzeln.daten.untertitel).toContain('Claude-Skills');
    expect(einzeln.daten.dm_text).toContain(skills.dm_link);
    expect((await rufe('magnete', { adresse: 'gibts-nicht' })).fehler).toBe(true);
  });

  it('legt einen Magneten an, ändert nur die angegebenen Felder und prüft die Regeln', async () => {
    const ohneTitel = await rufe('magnet_speichern', { adresse: 'neu-test' });
    expect(ohneTitel.fehler).toBe(true);

    const angelegt = await rufe('magnet_speichern', { adresse: 'neu-test', titel: 'Testmagnet', stichwort: 'test' });
    expect(angelegt.daten).toMatchObject({ erledigt: 'angelegt', adresse: 'neu-test', stichwort: 'TEST' });
    expect(angelegt.daten.aktiv).toBe(false);

    const ohneDatei = await rufe('magnet_speichern', { adresse: 'neu-test', aktiv: true, untertitel: 'Ein Satz.' });
    expect(ohneDatei.fehler).toBe(true);
    expect(ohneDatei.text).toContain('Datei-Link');

    const aktiv = await rufe('magnet_speichern', { adresse: 'neu-test', aktiv: true, untertitel: 'Ein Satz.', datei_url: 'https://drive.google.com/file/d/x/view' });
    expect(aktiv.daten).toMatchObject({ erledigt: 'geändert', aktiv: true, titel: 'Testmagnet', stichwort: 'TEST', untertitel: 'Ein Satz.' });
    expect(aktiv.daten.dm_text).toContain('velonify.de/ressourcen/neu-test/');

    expect((await rufe('magnet_speichern', { adresse: 'danke', titel: 'x' })).fehler).toBe(true);
  });

  it('legt einen Audit-Magneten ohne Datei an und behält Typ und Plätze bei späteren Änderungen', async () => {
    const roast = await rufe('magnet_speichern', { adresse: 'roast-test', titel: 'Roast', typ: 'audit', plaetze: 10, aktiv: true, untertitel: 'Ein Satz.' });
    expect(roast.daten).toMatchObject({ erledigt: 'angelegt', aktiv: true, typ: 'audit (Shop-Roast)', plaetze: '10 von 10 frei' });
    expect(roast.daten.dm_text).toContain('Shop');

    const geaendert = await rufe('magnet_speichern', { adresse: 'roast-test', knopf: 'Shop prüfen lassen' });
    expect(geaendert.daten).toMatchObject({ typ: 'audit (Shop-Roast)', plaetze: '10 von 10 frei', knopf: 'Shop prüfen lassen' });
  });

  it('zeigt offene Einträge und übernimmt einen ins CRM', async () => {
    const { daten } = await rufe('magnet_leads', { magnet: 'shopify-skills' });
    expect(daten.zahlen.eintraege).toBe(4);
    const svenja = daten.eintraege.find((e: { vorname: string }) => e.vorname === 'Svenja');
    expect(svenja).toMatchObject({ shopsystem: 'Magento', herkunft: 'LinkedIn' });

    const ergebnis = await rufe('magnet_lead_uebernehmen', { lead_id: svenja.lead_id, firmenname: 'Hafenkontor GmbH' });
    expect(ergebnis.daten).toMatchObject({ erledigt: 'übernommen', firma: 'Hafenkontor GmbH' });
    const db = await service.load();
    expect(db.firmen.find((f) => f.id === ergebnis.daten.firma_id)).toMatchObject({ quelle: 'LinkedIn · Magnet shopify-skills', plattform: 'magento', zustaendig: 'Lugge' });
    expect(db.deals.some((d) => d.firma_id === ergebnis.daten.firma_id)).toBe(true);

    expect((await rufe('magnet_lead_uebernehmen', { lead_id: svenja.lead_id })).fehler).toBe(true);
    const offen = await rufe('magnet_leads', { magnet: 'shopify-skills' });
    expect(offen.daten.eintraege.some((e: { lead_id: string }) => e.lead_id === svenja.lead_id)).toBe(false);
  });

  it('warnt vor einer Firma, die es schon gibt, und verwirft Einträge', async () => {
    const { daten } = await rufe('magnet_leads');
    const tarek = daten.eintraege.find((e: { vorname: string }) => e.vorname === 'Tarek');
    await service.createFirma({ ...(await import('../../../src/data/types')).EMPTY_FIRMA_INPUT, name: 'Kräuterwerk', domain: 'kraeuterwerk.example' });
    const doppelt = await rufe('magnet_lead_uebernehmen', { lead_id: tarek.lead_id });
    expect(doppelt.fehler).toBe(true);
    expect(doppelt.text).toContain('Kräuterwerk');

    const verworfen = await rufe('magnet_lead_verwerfen', { lead_id: tarek.lead_id });
    expect(verworfen.daten).toMatchObject({ erledigt: 'verworfen', magnet: 'shopify-skills' });
  });

  it('archiviert einen Magneten und schaltet ihn damit ab', async () => {
    const { daten } = await rufe('archivieren', { magnet: 'shopify-skills' });
    expect(daten).toMatchObject({ adresse: 'shopify-skills', archiviert: true, aktiv: false });
    const liste = await rufe('magnete');
    expect(liste.daten.magnete.some((m: { adresse: string }) => m.adresse === 'shopify-skills')).toBe(false);
  });
});

describe('To-dos', () => {
  beforeEach(() => verbinde('lugge@velonify.de', 'Lugge Muster'));

  const karteVon = async (titel: string) => (await service.loadTodoDaten()).aufgaben.find((a) => a.titel === titel)!;

  it('bietet die To-do-Werkzeuge an, lesende als readOnly markiert', async () => {
    const { tools } = await client.listTools();
    const namen = tools.map((t) => t.name);
    expect(namen).toEqual(expect.arrayContaining(['boards', 'karten', 'karte_anlegen', 'karte_verschieben', 'karte_erledigt', 'karte_kommentieren']));
    expect(tools.find((t) => t.name === 'karten')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'karte_anlegen')?.annotations?.readOnlyHint).toBe(false);
  });

  it('listet die Boards, das interne zuerst, mit Spalten und offenen Karten', async () => {
    const { daten } = await rufe('boards');
    expect(daten.boards[0]).toMatchObject({ titel: 'Velonify intern', kunde: 'intern', offene_karten: 2 });
    expect(daten.boards[0].spalten.map((s: { spalte_id: string }) => s.spalte_id)).toEqual(['backlog', 'woche', 'arbeit', 'wartet', 'erledigt']);
    const kunde = daten.boards.find((b: { kuerzel?: string }) => b.kuerzel === 'AGK');
    expect(kunde).toMatchObject({ kunde: 'Alpenglanz Kosmetik AG', offene_karten: 5 });
    expect(kunde.hub).toBe(`https://crm.velonify.de/#/todo/${kunde.board_id}`);
  });

  it('zeigt die Karten eines Boards in Spaltenreihenfolge und ohne board die eigenen', async () => {
    const board = await rufe('karten', { board: 'agk' });
    expect(board.daten.karten.map((k: { spalte: string }) => k.spalte)).toEqual(['Backlog', 'Diese Woche', 'In Arbeit', 'Wartet auf Kunde', 'Wartet auf Kunde']);
    const flow = board.daten.karten.find((k: { titel: string }) => k.titel.startsWith('Klaviyo'));
    expect(flow.checkliste).toEqual(['[x] Segment anlegen', '[ ] Mails texten', '[ ] Testversand']);
    expect(board.daten.karten.find((k: { titel: string }) => k.titel === 'Produktfotos Winterkollektion').ueberfaellig).toBe(true);

    const alle = await rufe('karten', { board: 'Alpenglanz', erledigte_zeigen: true });
    expect(alle.daten.anzahl).toBe(6);
    expect((await rufe('karten', { board: 'agk', zustaendig: 'Julian' })).daten.anzahl).toBe(2);

    const meine = await rufe('karten');
    expect(meine.daten.fuer).toBe('Lugge');
    expect(meine.daten.karten.map((k: { board: string }) => k.board)).toEqual(['Velonify intern', 'Velonify intern']);
    expect((await rufe('karten', { zustaendig: 'Johannes' })).daten.karten.map((k: { titel: string }) => k.titel)).toEqual(['Black-Week-Banner einbauen']);
  });

  it('legt eine Karte auf „Velonify intern“ an, mit mehreren Zuständigen', async () => {
    const { daten } = await rufe('karte_anlegen', {
      board: 'intern',
      titel: 'Rechnungsvorlage überarbeiten',
      beschreibung: 'Neue Bankverbindung eintragen.',
      zustaendig: ['Lugge', 'Julian'],
      faellig_am: '2026-11-02',
      labels: ['Intern', 'Finanzen'],
      checkliste: ['Vorlage öffnen', 'IBAN tauschen'],
      spalte: 'Diese Woche',
    });
    expect(daten.angelegt).toBe(true);
    expect(daten.board_neu).toBeUndefined();
    expect(daten.karte).toMatchObject({ board: 'Velonify intern', spalte: 'Diese Woche', zustaendig: 'Lugge, Julian', faellig: '2026-11-02', labels: 'Intern, Finanzen' });
    expect(daten.karte.checkliste).toEqual(['[ ] Vorlage öffnen', '[ ] IBAN tauschen']);

    const gespeichert = await karteVon('Rechnungsvorlage überarbeiten');
    expect(gespeichert).toMatchObject({ spalte_id: 'woche', quelle: 'manuell', erstellt_von: 'lugge@velonify.de', sichtbar_kunde: false });
    expect((await rufe('karten', { zustaendig: 'Julian' })).daten.karten.map((k: { titel: string }) => k.titel)).toContain('Rechnungsvorlage überarbeiten');
  });

  it('nimmt standardmäßig die angemeldete Person und die erste Spalte', async () => {
    const { daten } = await rufe('karte_anlegen', { board: 'Velonify intern', titel: 'Kurze Notiz' });
    expect(daten.karte).toMatchObject({ spalte: 'Backlog', zustaendig: 'Lugge' });
    expect((await rufe('karte_anlegen', { board: 'intern', titel: 'Ohne Person', zustaendig: [] })).daten.karte.zustaendig).toBeUndefined();
  });

  it('legt das Board eines Kunden beim ersten Mal an', async () => {
    const id = await firmaId('Kleinod');
    expect((await rufe('karten', { board: id })).daten.hinweis).toContain('kein Board');
    const { daten } = await rufe('karte_anlegen', { board: id, titel: 'Kick-off vorbereiten', spalte: 'woche', sichtbar_kunde: true });
    expect(daten.board_neu).toBe(true);
    expect(daten.karte).toMatchObject({ spalte: 'Diese Woche', sichtbar_kunde: true });
    const boards = (await rufe('boards')).daten.boards;
    expect(boards.filter((b: { firma_id?: string }) => b.firma_id === id)).toHaveLength(1);
  });

  it('prüft Board, Spalte und Zuständige, bevor etwas angelegt wird', async () => {
    const vorher = (await service.loadTodoDaten()).aufgaben.length;
    const ohneBoard = await rufe('karte_anlegen', { board: 'Gibt es nicht', titel: 'x' });
    expect(ohneBoard.fehler).toBe(true);
    expect(ohneBoard.text).toContain('Kein Board');
    const ohneSpalte = await rufe('karte_anlegen', { board: 'intern', titel: 'x', spalte: 'Irgendwann' });
    expect(ohneSpalte.text).toContain('Möglich: Backlog');
    const fremd = await rufe('karte_anlegen', { board: 'intern', titel: 'x', zustaendig: ['Lugge', 'Fremd'] });
    expect(fremd.text).toContain('nicht im Team');
    expect((await rufe('karte_anlegen', { board: 'intern', titel: 'x', sichtbar_kunde: true })).fehler).toBe(true);
    expect((await service.loadTodoDaten()).aufgaben.length).toBe(vorher);
  });

  it('verschiebt, erledigt und öffnet Karten wieder', async () => {
    const karte = await karteVon('Slack-App für den To-Do-Agenten anlegen');
    const verschoben = await rufe('karte_verschieben', { karte_id: karte.id, spalte: 'In Arbeit' });
    expect(verschoben.daten.karte.spalte).toBe('In Arbeit');

    const erledigt = await rufe('karte_erledigt', { karte_id: karte.id });
    expect(erledigt.daten.karte).toMatchObject({ spalte: 'Erledigt' });
    expect(erledigt.daten.karte.erledigt_am).toBe(isoDate(new Date()));
    expect((await karteVon(karte.titel)).erledigt_von).toBe('lugge@velonify.de');
    expect((await rufe('karten')).daten.karten.map((k: { titel: string }) => k.titel)).not.toContain(karte.titel);

    const offen = await rufe('karte_erledigt', { karte_id: karte.id, erledigt: false });
    expect(offen.daten.karte.spalte).toBe('Backlog');
    expect(offen.daten.karte.erledigt_am).toBeUndefined();

    expect((await rufe('karte_verschieben', { karte_id: karte.id, spalte: 'erledigt', oben: true })).daten.karte.erledigt_am).toBe(isoDate(new Date()));
    expect((await rufe('karte_verschieben', { karte_id: 'T-gibts-nicht', spalte: 'woche' })).text).toContain('`karten`');
  });

  it('kommentiert Karten mit der angemeldeten Person als Absender', async () => {
    const karte = await karteVon('Black-Week-Banner einbauen');
    const { daten } = await rufe('karte_kommentieren', { karte_id: karte.id, text: 'Banner-Entwurf liegt im Drive.' });
    expect(daten).toMatchObject({ kommentiert: true, karte: karte.titel, kommentar: { text: 'Banner-Entwurf liegt im Drive.', von: 'lugge@velonify.de' } });
    const board = await rufe('karten', { board: 'AGK' });
    expect(board.daten.karten.find((k: { karte_id: string }) => k.karte_id === karte.id).kommentare).toBe(1);
  });
});
