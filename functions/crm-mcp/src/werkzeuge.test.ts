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
    expect(mit.daten.erledigt).toEqual(expect.arrayContaining(['zugeteilt an Lugge', 'Verlauf: Kontaktiert über LinkedIn: über das Magento-Ende']));

    const db = await service.load();
    expect(db.deals.find((d) => d.id === deal.id)?.zustaendig).toBe('Lugge');
    expect(db.firmen.find((f) => f.id === id)?.zustaendig).toBe('Lugge');
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
    expect(daten.erledigt).toContain('zugeteilt an Lugge');
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

  it('verlangt genau eine ID', async () => {
    const { fehler } = await rufe('archivieren', {});
    expect(fehler).toBe(true);
  });
});
