import { beforeEach, describe, expect, it } from 'vitest';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { ValidationError } from './errors';
import { dmLink, dmText, firmaAusLead, leadText, magnetZahlen, newsletterCsv, prepareMagnet, sortiereLeads } from './magnete';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import type { Magnet, MagnetInput, MagnetLead } from './types';

const eingabe = (overrides: Partial<MagnetInput> = {}): MagnetInput => ({
  slug: 'shopify-skills',
  titel: 'Shopify-Ops-Skillset',
  beschreibung: '',
  stichwort: 'skills',
  datei_url: 'https://drive.google.com/file/d/abc/view',
  mail_betreff: '',
  mail_text: '',
  aktiv: true,
  untertitel: 'Acht Skills für den Shopify-Alltag.',
  inhalt: '',
  knopf: '',
  ...overrides,
});

const lead = (overrides: Partial<MagnetLead> = {}): MagnetLead => ({
  id: 'ML-1',
  magnet: 'shopify-skills',
  eingegangen_am: '2026-10-02T09:00:00.000Z',
  vorname: 'Uwe',
  email: 'uwe@muster-shop.example',
  shop: 'https://www.muster-shop.example/',
  shopsystem: 'magento',
  utm_source: 'linkedin',
  utm_medium: 'social',
  utm_campaign: 'shopify-skills',
  utm_content: 'dm',
  token: 'geheim',
  mail_gesendet_am: '2026-10-02T09:00:02.000Z',
  download_am: '',
  downloads: 0,
  newsletter_einwilligung: false,
  newsletter_text: '',
  newsletter_bestaetigt_am: '',
  newsletter_abgemeldet_am: '',
  status: 'neu',
  firma_id: '',
  kontakt_id: '',
  erledigt_am: '',
  erledigt_von: '',
  erstellt_am: '2026-10-02T09:00:00.000Z',
  erstellt_von: 'Website',
  geaendert_am: '2026-10-02T09:00:00.000Z',
  geaendert_von: 'Website',
  ...overrides,
});

describe('Lead-Magnete', () => {
  it('cleans the input and insists on a usable address', () => {
    expect(prepareMagnet(eingabe({ slug: ' Shopify-Skills ' }), [])).toMatchObject({ slug: 'shopify-skills', stichwort: 'SKILLS' });
    expect(() => prepareMagnet(eingabe({ slug: 'shopify skills' }), [])).toThrow(ValidationError);
    expect(() => prepareMagnet(eingabe({ datei_url: 'drive.google.com/x' }), [])).toThrow(ValidationError);
    expect(() => prepareMagnet(eingabe({ datei_url: '' }), [])).toThrow(ValidationError);
    expect(prepareMagnet(eingabe({ datei_url: '', aktiv: false }), []).aktiv).toBe(false);
    expect(() => prepareMagnet(eingabe({ slug: 'danke' }), [])).toThrow(ValidationError);
    expect(() => prepareMagnet(eingabe({ untertitel: ' ' }), [])).toThrow(ValidationError);
    expect(prepareMagnet(eingabe({ untertitel: '', aktiv: false }), []).untertitel).toBe('');
    expect(() => prepareMagnet(eingabe({ knopf: 'x'.repeat(41) }), [])).toThrow(ValidationError);
  });

  it('keeps the address unique, except for the magnet itself', () => {
    const vorhanden = [{ id: 'MG-1', slug: 'shopify-skills' }] as Magnet[];
    expect(() => prepareMagnet(eingabe(), vorhanden)).toThrow(ValidationError);
    expect(prepareMagnet(eingabe(), vorhanden, 'MG-1').slug).toBe('shopify-skills');
  });

  it('builds the DM link with UTM parameters and puts it into the text', () => {
    expect(dmLink('shopify-skills')).toBe(
      'https://velonify.de/ressourcen/shopify-skills/?utm_source=linkedin&utm_medium=social&utm_campaign=shopify-skills&utm_content=dm',
    );
    expect(dmText({ slug: 'shopify-skills', titel: 'Shopify-Ops-Skillset' })).toContain(dmLink('shopify-skills'));
  });

  it('counts sign-ups, downloads and confirmed subscribers who stayed', () => {
    const zahlen = magnetZahlen([
      lead(),
      lead({ id: 'ML-2', download_am: '2026-10-02T10:00:00.000Z', newsletter_bestaetigt_am: '2026-10-02T10:01:00.000Z' }),
      lead({ id: 'ML-3', newsletter_bestaetigt_am: '2026-10-02T10:01:00.000Z', newsletter_abgemeldet_am: '2026-10-03T08:00:00.000Z', status: 'uebernommen' }),
    ]);
    expect(zahlen).toEqual({ eintraege: 3, geladen: 1, newsletter: 1, uebernommen: 1, offen: 2 });
  });

  it('turns a sign-up into a firm with platform and source', () => {
    expect(firmaAusLead(lead(), 'Lugge')).toMatchObject({
      name: 'muster-shop.example', domain: 'muster-shop.example', plattform: 'magento', quelle: 'LinkedIn · Magnet shopify-skills', zustaendig: 'Lugge',
    });
    expect(firmaAusLead(lead({ shop: '', email: 'uwe@gmail.com', utm_source: '' }))).toMatchObject({ name: 'Uwe', domain: '', quelle: 'direkt · Magnet shopify-skills' });
    expect(leadText(lead(), { titel: 'Shopify-Ops-Skillset' })).toContain('Shopsystem: Magento');
  });

  it('lists open sign-ups first', () => {
    const sortiert = sortiereLeads([lead({ id: 'alt', status: 'uebernommen' }), lead({ id: 'neu', eingegangen_am: '2026-10-01T00:00:00.000Z' })]);
    expect(sortiert.map((l) => l.id)).toEqual(['neu', 'alt']);
  });

  it('takes an address back in when it confirmed again after unsubscribing', () => {
    const csv = newsletterCsv([
      lead({ newsletter_einwilligung: true, newsletter_bestaetigt_am: '2026-10-01T10:00:00.000Z', newsletter_abgemeldet_am: '2026-10-02T10:00:00.000Z' }),
      lead({ id: 'ML-2', magnet: 'redirects', newsletter_einwilligung: true, newsletter_bestaetigt_am: '2026-10-05T10:00:00.000Z' }),
    ]).split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[1]).toContain(';redirects;');
  });

  it('exports each confirmed address once and leaves out everyone who unsubscribed', () => {
    const bestaetigt = { newsletter_einwilligung: true, newsletter_text: 'Ja, Newsletter; Abmeldung jederzeit', newsletter_bestaetigt_am: '2026-10-02T10:00:00.000Z' };
    const csv = newsletterCsv([
      lead({ ...bestaetigt }),
      lead({ ...bestaetigt, id: 'ML-2', email: 'UWE@muster-shop.example', newsletter_bestaetigt_am: '2026-10-01T10:00:00.000Z', magnet: 'redirects' }),
      lead({ ...bestaetigt, id: 'ML-3', email: 'weg@shop.example' }),
      lead({ id: 'ML-4', email: 'weg@shop.example', newsletter_abgemeldet_am: '2026-10-03T00:00:00.000Z' }),
      lead({ id: 'ML-5', email: 'nie@shop.example', newsletter_einwilligung: true }),
    ]).split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[1]).toMatch(/^uwe@muster-shop\.example;Uwe;.*;shopify-skills;/);
    expect(csv[1]).toContain('"Ja, Newsletter; Abmeldung jederzeit"');
  });
});

describe('CrmService: Lead-Magnete', () => {
  let sheets: MemorySheets;
  let crm: CrmService;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
    crm = new CrmService({
      store: new SheetStore(sheets),
      drive: new MemoryDrive(),
      calendar: new MemoryCalendar(),
      currentUser: () => 'lugge@velonify.de',
    });
    await new SheetStore(sheets).insert('magnet_leads', [lead()]);
  });

  it('saves magnets and switches them off when archived', async () => {
    const magnet = await crm.saveMagnet(eingabe());
    expect(magnet).toMatchObject({ slug: 'shopify-skills', aktiv: true });
    await expect(crm.saveMagnet(eingabe())).rejects.toThrow(ValidationError);

    const geaendert = await crm.saveMagnet(eingabe({ titel: 'Skillset für E-Com-Manager' }), { id: magnet.id, expectedGeaendertAm: magnet.geaendert_am });
    expect(geaendert.titel).toBe('Skillset für E-Com-Manager');
    expect(await crm.setMagnetArchiviert(magnet.id, true, geaendert.geaendert_am)).toMatchObject({ archiviert: true, aktiv: false });
  });

  it('turns a sign-up into a firm, contact, deal and timeline entry, once', async () => {
    await crm.saveMagnet(eingabe());
    const { firma, kontakt, deal } = await crm.uebernimmMagnetLead('ML-1', { zustaendig: 'Lugge', dealAnlegen: true });
    expect(firma).toMatchObject({ domain: 'muster-shop.example', plattform: 'magento', quelle: 'LinkedIn · Magnet shopify-skills' });
    expect(kontakt).toMatchObject({ vorname: 'Uwe', email: 'uwe@muster-shop.example' });
    expect(deal).toMatchObject({ firma_id: firma.id, phase: 'neu' });

    const db = await crm.load();
    expect(db.aktivitaeten.some((a) => a.firma_id === firma.id && a.text.includes('„Shopify-Ops-Skillset“'))).toBe(true);
    const { leads } = await crm.loadMagnetDaten();
    expect(leads[0]).toMatchObject({ status: 'uebernommen', firma_id: firma.id, erledigt_von: 'lugge@velonify.de' });
    await expect(crm.uebernimmMagnetLead('ML-1', { zustaendig: 'Lugge', dealAnlegen: false })).rejects.toThrow(ValidationError);
  });

  it('discards a sign-up without losing it', async () => {
    const [eintrag] = (await crm.loadMagnetDaten()).leads;
    // The Apps Script counted a click in between – discarding must still work.
    await new SheetStore(sheets).update('magnet_leads', [{ id: eintrag.id, changes: { downloads: 1, geaendert_am: '2026-10-02T10:00:00.000Z' } }]);
    expect(await crm.verwirfMagnetLead(eintrag.id)).toMatchObject({ status: 'verworfen' });
    await expect(crm.verwirfMagnetLead(eintrag.id)).rejects.toThrow(ValidationError);
    expect((await crm.loadMagnetDaten()).leads).toHaveLength(1);
  });
});
