import { beforeEach, describe, expect, it } from 'vitest';
import { aktiveLeistungen, baueAnfrage, mailtoLink, mitSignatur, prepareAnschreiben, verlaufText, vornameAus, zeichen, type AnschreibenInput } from './anschreiben';
import { DemoGenerator } from './contactGenerator';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { createDemoBackend } from './demo/seed';
import { SchemaError, ValidationError } from './errors';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, EMPTY_OUTREACH_LEISTUNG_INPUT, type ContactDaten, type Database } from './types';

describe('Anfrage an den Contact Generator', () => {
  let db: Database;
  let contact: ContactDaten;

  beforeEach(async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    db = await service.load();
    contact = await service.loadContactDaten();
  });

  it('sends company, contact and service, but no addresses, phone numbers or register data', () => {
    const firma = db.firmen.find((f) => f.name.startsWith('Nordlicht'))!;
    const kontakt = db.kontakte.find((k) => k.firma_id === firma.id)!;
    const migration = contact.leistungen.find((l) => l.titel === 'Shopify Migration')!;
    const anfrage = baueAnfrage({
      kanal: 'email',
      sprache: 'de',
      anrede: 'sie',
      absender: ' Lukas ',
      firma,
      kontakt,
      leistung: { art: 'liste', leistung: { ...migration, beleg: 'Referenz' } },
      aufhaenger: '',
    });
    expect(anfrage.absender).toEqual({ vorname: 'Lukas' });
    expect(anfrage.firma).toMatchObject({ name: firma.name, version: '2.4.6', eol: 'eol' });
    expect(anfrage.kontakt).toEqual({ vorname: 'Mara', nachname: 'Holm', rolle: 'Head of E-Commerce' });
    expect(anfrage.leistung).toMatchObject({ titel: 'Shopify Migration', anlass: migration.anlass, nutzen: migration.nutzen, beleg: 'Referenz', beschreibung: migration.beschreibung });
    expect(anfrage.leistung.anlass).toContain('Magento');
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
      firma_id: 'F-1', kontakt_id: '', deal_id: '', kanal: 'linkedin_notiz', leistung_id: '', leistung: 'SEO',
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
    firma_id: firmaId, kontakt_id: '', deal_id: '', kanal: 'email', leistung_id: '', leistung: 'Datenmigration',
    sprache: 'de', anrede: 'sie', aufhaenger: '', betreff: 'Magento 2.4.6', text: 'Hallo Mara', ...extra,
  });

  it('records a sent message, logs it and moves an early deal to "kontaktiert"', async () => {
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Shop GmbH', domain: 'shop.example' });
    const kontakt = await crm.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, vorname: 'Mara' });
    const deal = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'Shopify-Migration' });

    const gesendet = await crm.markiereGesendet(nachricht(firma.id, { kontakt_id: kontakt.id, deal_id: deal.id }));
    expect(gesendet).toMatchObject({ status: 'gesendet', von: 'lugge@velonify.de', deal_id: deal.id });
    expect((await crm.loadContactDaten()).anschreiben).toHaveLength(1);

    const db = await crm.load();
    expect(db.deals.find((d) => d.id === deal.id)?.phase).toBe('kontaktiert');
    const eintraege = db.aktivitaeten.filter((a) => a.firma_id === firma.id);
    expect(eintraege.find((a) => a.typ === 'mail')?.text).toContain('Betreff: Magento 2.4.6');
    expect(eintraege.some((a) => a.typ === 'phasenwechsel' && a.text.includes('Kontaktiert'))).toBe(true);

    const [aktualisiert] = (await crm.loadContactDaten()).anschreiben;
    await crm.setAnschreibenStatus(aktualisiert.id, 'antwort', aktualisiert.geaendert_am);
    expect(((await crm.loadContactDaten()).anschreiben)[0].status).toBe('antwort');
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
    expect((await crm.loadContactDaten()).anschreiben).toHaveLength(0);
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

  it('has its own service list: start list once, then edit, add and archive', async () => {
    expect(await crm.uebernimmOutreachStartliste()).toBe(6);
    await expect(crm.uebernimmOutreachStartliste()).rejects.toThrow(ValidationError);
    let { leistungen } = await crm.loadContactDaten();
    expect(aktiveLeistungen(leistungen).map((l) => l.titel)).toEqual([
      'Shopify Migration',
      'Klaviyo Setup & Email Marketing',
      'Media Buying',
      'Shopify Store Management',
      'Google Ads Setup / Tracking Setup / UTMs / Consent Management',
      'Full E-Commerce Service',
    ]);
    // The offer catalogue is not touched.
    expect((await crm.loadAngebotsDaten()).kategorien).toHaveLength(0);

    const media = leistungen.find((l) => l.titel === 'Media Buying')!;
    await crm.saveOutreachLeistung({ ...media, beleg: ' ROAS verdoppelt ' }, { id: media.id, expectedGeaendertAm: media.geaendert_am });
    const neu = await crm.saveOutreachLeistung({ ...EMPTY_OUTREACH_LEISTUNG_INPUT, titel: 'SEO' });
    await expect(crm.saveOutreachLeistung({ ...EMPTY_OUTREACH_LEISTUNG_INPUT, titel: ' ' })).rejects.toThrow(ValidationError);
    await crm.setOutreachLeistungArchiviert(media.id, true, (await crm.loadContactDaten()).leistungen.find((l) => l.id === media.id)!.geaendert_am);

    ({ leistungen } = await crm.loadContactDaten());
    expect(leistungen.find((l) => l.id === media.id)).toMatchObject({ beleg: 'ROAS verdoppelt', archiviert: true });
    const aktiv = aktiveLeistungen(leistungen);
    expect(aktiv.at(-1)?.id).toBe(neu.id);
    expect(aktiv.some((l) => l.id === media.id)).toBe(false);
  });
});
