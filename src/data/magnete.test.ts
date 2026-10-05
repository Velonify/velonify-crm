import { beforeEach, describe, expect, it } from 'vitest';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { ValidationError } from './errors';
import { dmLink, dmText, firmaAusLead, leadText, magnetZahlen, newsletterCsv, prepareMagnet, sortiereLeads } from './magnete';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { auditZeile } from './audit';
import { ampelVon, bereinigeReport, mitTexten, pruefeFreigabe, reportEntwurf, reportMail, reportVon, roastPlaetze, roastSchritt, type Report } from './roast';
import { DemoShopAudit } from './shopAudit';
import type { Audit, Magnet, MagnetInput, MagnetLead } from './types';

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
  typ: 'datei',
  plaetze: null,
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
  warteliste: false,
  audit_id: '',
  report: '',
  report_von: '',
  report_freigegeben_am: '',
  report_gesendet_am: '',
  report_geoeffnet_am: '',
  report_aufrufe: null,
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

describe('Shop-Roast', () => {
  const roastEingabe = (overrides: Partial<MagnetInput> = {}) =>
    eingabe({ slug: 'shop-roast', titel: 'Shop-Roast', stichwort: 'roast', datei_url: '', typ: 'audit', plaetze: 30, ...overrides });

  it('lets an audit magnet go live without a file and keeps places only for audits', () => {
    expect(prepareMagnet(roastEingabe(), [])).toMatchObject({ typ: 'audit', plaetze: 30, aktiv: true });
    expect(prepareMagnet(eingabe({ plaetze: 30 }), []).plaetze).toBeNull();
    expect(() => prepareMagnet(roastEingabe({ typ: 'datei' }), [])).toThrow(/Datei-Link/);
    expect(() => prepareMagnet(roastEingabe({ plaetze: 0 }), [])).toThrow(ValidationError);
  });

  it('counts places without the waiting list and discarded entries', () => {
    const leads = [lead(), lead({ id: 'b', status: 'verworfen' }), lead({ id: 'c', warteliste: true }), lead({ id: 'd', status: 'uebernommen' })];
    expect(roastPlaetze({ plaetze: 30 }, leads)).toEqual({ vergeben: 2, frei: 28 });
    expect(roastPlaetze({ plaetze: 1 }, leads).frei).toBe(0);
    expect(roastPlaetze({ plaetze: null }, leads).frei).toBeNull();
  });

  it('drafts a report from the findings, worst first, with a traffic light per area', async () => {
    const audit = { ...auditZeile(await new DemoShopAudit(0).pruefe({ domain: 'bergzeit-tee.example', leistungen: [] }), ''), id: 'SA-1' } as Audit;
    const report = reportEntwurf(audit);
    expect(report.punkte[0].schwere).toBe('hoch');
    expect(report.punkte.every((p) => p.titel === '' && p.text)).toBe(true);
    expect(report.bereiche.map((b) => b.bereich)).toEqual(['plattform', 'geschwindigkeit', 'marketing', 'basics']);
    expect(report.bereiche.find((b) => b.bereich === 'plattform')?.ampel).toBe('rot');
    expect(report.kennzahlen.map((k) => k.label)).toContain('PageSpeed mobil');

    // Claude's texts replace the plain findings; points it left out stay as they were.
    const [erster, zweiter] = report.punkte;
    const mitClaude = mitTexten(report, { einleitung: 'Hallo!', fazit: 'Zuerst das Update.', punkte: [{ befund_id: erster.befund_id, titel: 'Kein Support', text: 'Erklärt.' }] });
    expect(mitClaude.punkte[0]).toMatchObject({ titel: 'Kein Support', text: 'Erklärt.' });
    expect(mitClaude.punkte[1]).toEqual(zweiter);

    // Removing every severe point turns the light yellow or green.
    const ohne = bereinigeReport({ ...mitClaude, punkte: mitClaude.punkte.map((p) => (p.bereich === 'plattform' ? { ...p, text: ' ' } : p)) }, audit);
    expect(ohne.bereiche.find((b) => b.bereich === 'plattform')?.ampel).toBe('gruen');
    expect(ampelVon([], true)).toBe('offen');
  });

  it('only releases complete reports', () => {
    const fertig: Report = {
      version: 1, domain: 'x.example', geprueft_am: '', kennzahlen: [], einleitung: 'Hallo', fazit: 'Tschüss', bereiche: [],
      punkte: [{ befund_id: 'a', bereich: 'plattform', schwere: 'hoch', titel: 'T', text: 'X' }],
      beobachtungen: [1, 2, 3].map((n) => ({ titel: `B${n}`, text: 'Text' })),
    };
    expect(() => pruefeFreigabe(fertig, 'Lukas')).not.toThrow();
    expect(() => pruefeFreigabe(fertig, ' ')).toThrow(/geprüft/);
    expect(() => pruefeFreigabe({ ...fertig, beobachtungen: fertig.beobachtungen.slice(0, 2) }, 'Lukas')).toThrow(/Beobachtungen/);
    expect(() => pruefeFreigabe({ ...fertig, punkte: [{ ...fertig.punkte[0], titel: '' }] }, 'Lukas')).toThrow(/Überschrift/);
    expect(() => pruefeFreigabe(null, 'Lukas')).toThrow(/prüfen/);
  });

  it('writes the mail with the report link and the personal signature', () => {
    const mail = reportMail(lead({ token: 'abc', report_von: 'Lukas', report: JSON.stringify({ version: 1, domain: 'muster-shop.example', beobachtungen: [] }) }), '');
    expect(mail).toMatchObject({ an: 'uwe@muster-shop.example', betreff: 'Euer Shop-Roast: muster-shop.example' });
    expect(mail.text).toContain('https://velonify.de/roast/abc/');
    expect(mail.text.startsWith('Hi Uwe,')).toBe(true);
    expect(mail.text.endsWith('Viele Grüße\nLukas')).toBe(true);
    expect(reportMail(lead({ token: 'abc' }), 'Beste Grüße\nLukas Hanke').text.endsWith('Beste Grüße\nLukas Hanke')).toBe(true);
  });

  it('runs from check to release to takeover, and the audit moves to the firm', async () => {
    const sheets = new MemorySheets();
    await runSetup(sheets);
    const crm = new CrmService({ store: new SheetStore(sheets), drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'lukas@velonify.de' });
    await crm.saveMagnet(roastEingabe());
    await new SheetStore(sheets).insert('magnet_leads', [lead({ magnet: 'shop-roast' })]);

    const audit = await crm.speichereAudit(await new DemoShopAudit(0).pruefe({ domain: 'muster-shop.example', leistungen: [] }));
    let eintrag = await crm.verknuepfeRoastAudit('ML-1', audit);
    expect(eintrag.audit_id).toBe(audit.id);
    expect(roastSchritt(eintrag)).toBe('schreiben');
    await expect(crm.gibReportFrei('ML-1', true)).rejects.toThrow(ValidationError);

    const entwurf = reportVon(eintrag)!;
    const fertig = {
      ...entwurf,
      einleitung: 'Hallo Uwe',
      fazit: 'Fang beim Update an.',
      punkte: entwurf.punkte.map((p) => ({ ...p, titel: 'Überschrift' })),
      beobachtungen: [1, 2, 3].map((n) => ({ titel: `Beobachtung ${n}`, text: 'Text' })),
    };
    eintrag = await crm.speichereReport('ML-1', fertig, 'Lukas Hanke');
    expect(roastSchritt(eintrag)).toBe('freigeben');
    await expect(crm.markiereReportGesendet('ML-1')).rejects.toThrow(ValidationError);
    eintrag = await crm.gibReportFrei('ML-1', true);
    expect(eintrag.report_freigegeben_am).not.toBe('');
    await expect(crm.speichereReport('ML-1', fertig, 'Lukas Hanke')).rejects.toThrow(/freigegeben/);
    expect(roastSchritt(await crm.markiereReportGesendet('ML-1'))).toBe('gesendet');

    const { firma } = await crm.uebernimmMagnetLead('ML-1', { zustaendig: 'Lugge', dealAnlegen: false });
    expect((await crm.loadAudits()).find((a) => a.id === audit.id)?.firma_id).toBe(firma.id);
    expect((await crm.load()).aktivitaeten.some((a) => a.firma_id === firma.id && a.text.includes('Report gesendet am'))).toBe(true);
  });
});
