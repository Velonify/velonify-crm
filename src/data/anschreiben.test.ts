import { beforeEach, describe, expect, it } from 'vitest';
import { baueAnfrage, mailtoLink, mitSignatur, prepareAnschreiben, verlaufText, vornameAus, zeichen, type AnschreibenInput } from './anschreiben';
import { DemoGenerator } from './contactGenerator';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { createDemoBackend } from './demo/seed';
import { SchemaError, ValidationError } from './errors';
import { katalogBaum } from './katalog';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type AngebotsDaten, type Database } from './types';

describe('Anfrage an den Contact Generator', () => {
  let db: Database;
  let katalog: AngebotsDaten;

  beforeEach(async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    db = await service.load();
    katalog = await service.loadAngebotsDaten();
  });

  it('sends company, contact and catalogue service, but no addresses, phone numbers or register data', () => {
    const firma = db.firmen.find((f) => f.name.startsWith('Nordlicht'))!;
    const kontakt = db.kontakte.find((k) => k.firma_id === firma.id)!;
    const [migration] = katalogBaum(katalog).filter((k) => k.kategorie.titel_de === 'Datenmigration');
    const anfrage = baueAnfrage({
      kanal: 'email',
      sprache: 'de',
      anrede: 'sie',
      absender: ' Lukas ',
      firma,
      kontakt,
      leistung: { art: 'katalog', kategorie: { ...migration.kategorie, outreach_anlass: 'Support-Ende' }, leistungen: migration.leistungen },
      aufhaenger: '',
    });
    expect(anfrage.absender).toEqual({ vorname: 'Lukas' });
    expect(anfrage.firma).toMatchObject({ name: firma.name, version: '2.4.6', eol: 'eol' });
    expect(anfrage.kontakt).toEqual({ vorname: 'Mara', nachname: 'Holm', rolle: 'Head of E-Commerce' });
    expect(anfrage.leistung).toMatchObject({ titel: 'Datenmigration', anlass: 'Support-Ende' });
    expect(anfrage.leistung.unterpunkte.length).toBe(migration.leistungen.length);
    const text = JSON.stringify(anfrage);
    for (const privat of [firma.email_allgemein, firma.telefon_allgemein, firma.register, kontakt.email, kontakt.telefon]) {
      expect(text).not.toContain(privat);
    }
  });

  it('accepts a manual service and requires sender and title', () => {
    const firma = db.firmen[0];
    const basis = { kanal: 'instagram', sprache: 'de', anrede: 'du', absender: 'Lukas', firma, aufhaenger: '' } as const;
    const anfrage = baueAnfrage({ ...basis, leistung: { art: 'manuell', titel: 'Media Buying', beschreibung: 'Meta und TikTok' } });
    expect(anfrage.kontakt).toBeNull();
    expect(baueAnfrage({ ...basis, firma: { ...firma, notiz: 'ä'.repeat(2500) }, leistung: { art: 'manuell', titel: 'X', beschreibung: '' } }).firma.notiz).toHaveLength(2000);
    expect(anfrage.leistung).toMatchObject({ titel: 'Media Buying', beschreibung: 'Meta und TikTok', unterpunkte: [] });
    expect(() => baueAnfrage({ ...basis, absender: ' ', leistung: { art: 'manuell', titel: 'X', beschreibung: '' } })).toThrow(ValidationError);
    expect(() => baueAnfrage({ ...basis, leistung: { art: 'manuell', titel: ' ', beschreibung: '' } })).toThrow(ValidationError);
  });

  it('keeps demo texts for LinkedIn notes within 300 characters', async () => {
    const anfrage = baueAnfrage({
      kanal: 'linkedin_notiz', sprache: 'de', anrede: 'sie', absender: 'Lukas', firma: db.firmen[0], aufhaenger: 'x'.repeat(400),
      leistung: { art: 'manuell', titel: 'Datenmigration', beschreibung: '' },
    });
    const varianten = await new DemoGenerator().generiere(anfrage);
    expect(varianten).toHaveLength(3);
    expect(varianten.every((v) => zeichen(v.text) <= 300 && v.betreff === '')).toBe(true);
  });
});

describe('Hilfen', () => {
  it('builds mail links, signatures, first names and history entries', () => {
    expect(mailtoLink('mara@shop.example', 'Frage & Idee', 'Zeile 1\nZeile 2')).toBe('mailto:mara@shop.example?subject=Frage%20%26%20Idee&body=Zeile%201%0AZeile%202');
    expect(mitSignatur('Viele Grüße\n', ' Lukas\nVelonify ')).toBe('Viele Grüße\n\nLukas\nVelonify');
    expect(mitSignatur('Text', '  ')).toBe('Text');
    expect(vornameAus('Lukas Hanke', 'lukas@velonify.de')).toBe('Lukas');
    expect(vornameAus('', 'julian.muster@velonify.de')).toBe('Julian');
    expect(zeichen('Grüße 👋')).toBe(7);
    expect(verlaufText({ kanal: 'email', leistung: 'Datenmigration', betreff: 'Magento 2.4.6', text: 'Hallo' })).toBe(
      'E-Mail gesendet (Contact Generator, Datenmigration)\nBetreff: Magento 2.4.6\n\nHallo',
    );
  });

  it('validates messages before they are recorded', () => {
    const basis: AnschreibenInput = {
      firma_id: 'F-1', kontakt_id: '', deal_id: '', kanal: 'linkedin_notiz', kategorie_id: '', leistung: 'SEO',
      sprache: 'de', anrede: 'sie', aufhaenger: '', betreff: 'wird entfernt', text: ' Hallo ',
    };
    expect(prepareAnschreiben(basis)).toMatchObject({ text: 'Hallo', betreff: '' });
    expect(() => prepareAnschreiben({ ...basis, text: 'x'.repeat(301) })).toThrow(/301 Zeichen/);
    expect(() => prepareAnschreiben({ ...basis, kanal: 'email', betreff: '' })).toThrow(ValidationError);
    expect(() => prepareAnschreiben({ ...basis, kanal: 'fax' })).toThrow(ValidationError);
    expect(() => prepareAnschreiben({ ...basis, text: ' ' })).toThrow(ValidationError);
  });
});

describe('CrmService: Contact Generator', () => {
  let sheets: MemorySheets;
  let crm: CrmService;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
    crm = new CrmService({ store: new SheetStore(sheets), drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'lugge@velonify.de' });
  });

  const nachricht = (firmaId: string, extra: Partial<AnschreibenInput> = {}): AnschreibenInput => ({
    firma_id: firmaId, kontakt_id: '', deal_id: '', kanal: 'email', kategorie_id: '', leistung: 'Datenmigration',
    sprache: 'de', anrede: 'sie', aufhaenger: '', betreff: 'Magento 2.4.6', text: 'Hallo Mara', ...extra,
  });

  it('records a sent message, logs it and moves an early deal to "kontaktiert"', async () => {
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Shop GmbH', domain: 'shop.example' });
    const kontakt = await crm.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, vorname: 'Mara' });
    const deal = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'Shopify-Migration' });

    const gesendet = await crm.markiereGesendet(nachricht(firma.id, { kontakt_id: kontakt.id, deal_id: deal.id }));
    expect(gesendet).toMatchObject({ status: 'gesendet', von: 'lugge@velonify.de', deal_id: deal.id });
    expect(await crm.loadAnschreiben()).toHaveLength(1);

    const db = await crm.load();
    expect(db.deals.find((d) => d.id === deal.id)?.phase).toBe('kontaktiert');
    const eintraege = db.aktivitaeten.filter((a) => a.firma_id === firma.id);
    expect(eintraege.find((a) => a.typ === 'mail')?.text).toContain('Betreff: Magento 2.4.6');
    expect(eintraege.some((a) => a.typ === 'phasenwechsel' && a.text.includes('Kontaktiert'))).toBe(true);

    const [aktualisiert] = await crm.loadAnschreiben();
    await crm.setAnschreibenStatus(aktualisiert.id, 'antwort', aktualisiert.geaendert_am);
    expect((await crm.loadAnschreiben())[0].status).toBe('antwort');
    await expect(crm.setAnschreibenStatus(aktualisiert.id, 'vielleicht', aktualisiert.geaendert_am)).rejects.toThrow(ValidationError);
  });

  it('creates a deal on request and leaves later phases alone', async () => {
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Shop GmbH', domain: 'shop.example' });
    const gesendet = await crm.markiereGesendet(nachricht(firma.id, { kanal: 'linkedin_notiz', betreff: '' }), { neuerDeal: { titel: 'SEO', zustaendig: 'Lugge' } });
    let db = await crm.load();
    const deal = db.deals.find((d) => d.id === gesendet.deal_id)!;
    expect(deal).toMatchObject({ titel: 'SEO', zustaendig: 'Lugge', phase: 'kontaktiert' });
    expect(db.aktivitaeten.some((a) => a.typ === 'notiz' && a.text.startsWith('LinkedIn-Vernetzungsanfrage gesendet'))).toBe(true);

    await crm.changePhase(deal.id, 'gespraech', (await crm.load()).deals.find((d) => d.id === deal.id)!.geaendert_am);
    await crm.markiereGesendet(nachricht(firma.id, { deal_id: deal.id }));
    db = await crm.load();
    expect(db.deals.find((d) => d.id === deal.id)?.phase).toBe('gespraech');
  });

  it('rejects contacts and deals of other firms', async () => {
    const a = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'A', domain: 'a.example' });
    const b = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'B', domain: 'b.example' });
    const kontakt = await crm.saveKontakt(b.id, { ...EMPTY_KONTAKT_INPUT, vorname: 'Max' });
    const deal = await crm.saveDeal(b.id, { ...EMPTY_DEAL_INPUT, titel: 'X' });
    await expect(crm.markiereGesendet(nachricht(a.id, { kontakt_id: kontakt.id }))).rejects.toThrow(ValidationError);
    await expect(crm.markiereGesendet(nachricht(a.id, { deal_id: deal.id }))).rejects.toThrow(ValidationError);
    expect(await crm.loadAnschreiben()).toHaveLength(0);
  });

  it('asks for setup before writing anything when the tab is missing', async () => {
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Shop GmbH', domain: 'shop.example' });
    const alt = new MemorySheets();
    await runSetup(alt);
    const store = new SheetStore(alt);
    // Simulate a sheet set up before the Contact Generator existed.
    (alt as unknown as { tabs: Map<string, unknown> }).tabs.delete('anschreiben');
    const ohneTab = new CrmService({ store, drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'x@velonify.de' });
    const f = await ohneTab.createFirma({ ...EMPTY_FIRMA_INPUT, name: firma.name, domain: firma.domain });
    await expect(ohneTab.markiereGesendet(nachricht(f.id))).rejects.toThrow(SchemaError);
    expect((await ohneTab.load()).aktivitaeten).toHaveLength(0);
  });

  it('keeps the offer tool working before the outreach columns exist, but does not drop outreach texts', async () => {
    const [kategorie] = (await crm.uebernimmStartkatalog(), await crm.loadAngebotsDaten()).kategorien;
    // Simulate a sheet set up before the outreach columns existed: remove them from header and rows.
    const zeilen = sheets.rows('leistungskategorien');
    for (const spalte of ['outreach_anlass', 'outreach_nutzen', 'outreach_beleg']) {
      const index = (zeilen[0] as string[]).indexOf(spalte);
      for (const zeile of zeilen) zeile.splice(index, 1);
    }
    const store = new SheetStore(sheets);
    const alt = new CrmService({ store, drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'x@velonify.de' });

    const daten = await alt.loadAngebotsDaten();
    expect(daten.kategorien[0]).toMatchObject({ titel_de: kategorie.titel_de, outreach_anlass: '' });
    const input = { ...kategorie, titel_en: 'Analysis' };
    await expect(alt.saveKategorie(input, { id: kategorie.id, expectedGeaendertAm: kategorie.geaendert_am })).resolves.toMatchObject({ titel_en: 'Analysis' });

    const neu = (await alt.loadAngebotsDaten()).kategorien[0];
    await expect(alt.saveKategorie({ ...input, outreach_nutzen: 'Weniger Aufwand' }, { id: neu.id, expectedGeaendertAm: neu.geaendert_am })).rejects.toThrow(SchemaError);

    await runSetup(sheets);
    const nachSetup = (await crm.loadAngebotsDaten()).kategorien[0];
    await crm.saveKategorie({ ...input, outreach_nutzen: 'Weniger Aufwand' }, { id: nachSetup.id, expectedGeaendertAm: nachSetup.geaendert_am });
    expect((await crm.loadAngebotsDaten()).kategorien[0].outreach_nutzen).toBe('Weniger Aufwand');
  });
});
