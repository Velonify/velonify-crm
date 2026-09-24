import { beforeEach, describe, expect, it } from 'vitest';
import { EINSTELLUNG } from './constants';
import { CrmService, type TerminEingabe } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { createDemoBackend } from './demo/seed';
import { ConflictError, DuplicateError, NotConfiguredError, SchemaError, ValidationError } from './errors';
import { addDays, isoDate } from './ids';
import { parseCsv, planeImport } from './importCsv';
import { driveFolderName, extractDriveFolderId, nameAusLinkedin, normalizeDomain, prepareFirma, splitName, suggestKuerzel } from './rules';
import { findeTeamMitglied, fortschritt, kennzahlen, meinTag } from './selectors';
import { columnLetter, recordToRow, rowToRecord } from './sheets/rows';
import { SCHEMA } from './schema';
import { checkSetup, runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Database, type Firma } from './types';

const firmaInput = (overrides: Partial<typeof EMPTY_FIRMA_INPUT>) => ({ ...EMPTY_FIRMA_INPUT, ...overrides });

describe('rows', () => {
  it('converts column numbers to letters', () => {
    expect([1, 26, 27, 52, 703].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
  });

  it('reads by header name regardless of column order', () => {
    const record = rowToRecord(SCHEMA.firmen, ['name', 'score', 'id', 'archiviert'], ['Shop GmbH', '87', 'F-9', true]);
    expect(record).toMatchObject({ id: 'F-9', name: 'Shop GmbH', score: 87, archiviert: true, domain: '' });
  });

  it('keeps values of columns the app does not know', () => {
    const row = recordToRow(SCHEMA.firmen, ['id', 'eigene_spalte', 'name'], { id: 'F-1', name: 'Neu' }, ['F-1', 'Notiz von Hand', 'Alt']);
    expect(row).toEqual(['F-1', 'Notiz von Hand', 'Neu']);
  });
});

describe('rules', () => {
  const alle = [{ ...EMPTY_FIRMA_INPUT, id: 'F-1', name: 'Shop GmbH', domain: 'shop.de', kuerzel: 'SB' } as Firma];

  it('normalizes domain, Kürzel and Drive links', () => {
    expect(normalizeDomain(' https://www.Shop.de/impressum ')).toBe('shop.de');
    expect(extractDriveFolderId('https://drive.google.com/drive/folders/abc_123-X?usp=sharing')).toBe('abc_123-X');
    expect(prepareFirma({ kuerzel: ' abc ', slack_channel: '#client-abc-general' }, alle)).toEqual({ kuerzel: 'ABC', slack_channel: 'client-abc-general' });
  });

  it('reads the name from a LinkedIn profile link', () => {
    expect(nameAusLinkedin('https://www.linkedin.com/in/max-beispiel-7a1b2c3/')).toEqual({ vorname: 'Max', nachname: 'Beispiel' });
    expect(nameAusLinkedin('linkedin.com/in/anna-maria-m%C3%BCller?utm_source=share')).toEqual({ vorname: 'Anna Maria', nachname: 'Müller' });
    expect(nameAusLinkedin('https://de.linkedin.com/in/beispiel')).toEqual({ vorname: '', nachname: 'Beispiel' });
    expect(nameAusLinkedin('https://www.linkedin.com/in/ACoAAB12cd')).toBeNull();
    expect(nameAusLinkedin('https://www.linkedin.com/company/beispiel-gmbh')).toBeNull();
  });

  it('rejects duplicate domains and Kürzel, but not on the firm itself', () => {
    expect(() => prepareFirma({ domain: 'www.shop.de' }, alle)).toThrow(DuplicateError);
    expect(() => prepareFirma({ kuerzel: 'sb' }, alle)).toThrow(DuplicateError);
    expect(() => prepareFirma({ domain: 'shop.de', kuerzel: 'SB' }, alle, 'F-1')).not.toThrow();
    expect(() => prepareFirma({ kuerzel: 'ABCD' }, alle)).toThrow(ValidationError);
  });

  it('suggests free three-letter Kürzel and Drive folder names', () => {
    expect(suggestKuerzel('Nordlicht Outdoor Ausrüstung GmbH', [])).toBe('NOA');
    expect(suggestKuerzel('Sturm & Berger GmbH', [])).toBe('SBE');
    expect(suggestKuerzel('Sturm & Berger GmbH', ['SBE'])).toBe('STB');
    expect(suggestKuerzel('Zobel', ['ZOB'])).toMatch(/^Z[A-Z]{2}$/);
    expect(driveFolderName('sb', 'Sturm & Berger GmbH')).toBe('SB_Sturm-Berger');
    expect(driveFolderName('HFB', 'Helle Freude Brautmode')).toBe('HFB_Helle-Freude-Brautmode');
    expect(driveFolderName('FIM', 'Fischerhütte Möllmann GmbH')).toBe('FIM_Fischerhuette-Moellmann');
  });

  it('splits contact names', () => {
    expect(splitName('Uwe Möllmann')).toEqual({ vorname: 'Uwe', nachname: 'Möllmann' });
    expect(splitName('Anna Maria Schulz')).toEqual({ vorname: 'Anna Maria', nachname: 'Schulz' });
    expect(splitName('Müller')).toEqual({ vorname: '', nachname: 'Müller' });
  });
});

describe('setup and SheetStore', () => {
  let sheets: MemorySheets;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
  });

  it('creates every tab with columns, protection and default lists', async () => {
    const status = await checkSetup(sheets);
    expect(status.ready).toBe(true);
    expect(status.tabs.every((t) => t.isProtected)).toBe(true);
    for (const tab of Object.values(SCHEMA)) expect(sheets.rows(tab.name)[0]).toEqual(tab.columns);
    expect((await new SheetStore(sheets).load()).listen.team).toContain('Julian');
  });

  it('is repeatable and only appends missing columns, keeping own columns', async () => {
    sheets.rows('firmen')[0] = ['id', 'name', 'eigene_spalte'];
    const listenVorher = sheets.rows('listen').length;
    await runSetup(sheets);
    const header = sheets.rows('firmen')[0];
    expect(header.slice(0, 3)).toEqual(['id', 'name', 'eigene_spalte']);
    expect(header).toHaveLength(SCHEMA.firmen.columns.length + 1);
    expect(sheets.rows('listen')).toHaveLength(listenVorher);
  });

  it('asks for setup when tabs or columns are missing', async () => {
    await expect(new SheetStore(new MemorySheets()).load()).rejects.toThrow(SchemaError);
    sheets.rows('deals')[0] = ['id', 'titel'];
    await expect(new SheetStore(sheets).load()).rejects.toThrow(/deals.*fehlen Spalten/);
  });
});

describe('CrmService', () => {
  let sheets: MemorySheets;
  let drive: MemoryDrive;
  let calendar: MemoryCalendar;
  let crm: CrmService;
  let user = 'lugge@velonify.de';
  const heute = isoDate(new Date());
  let leadsId: string;
  let clientsId: string;
  let vorlageId: string;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
    drive = new MemoryDrive();
    calendar = new MemoryCalendar();
    user = 'lugge@velonify.de';
    crm = new CrmService({ store: new SheetStore(sheets), drive, calendar, currentUser: () => user });
    const root = drive.add('Velonify', null);
    leadsId = drive.add('01_Leads', root.id).id;
    clientsId = drive.add('01_Clients', root.id).id;
    vorlageId = drive.add('01_Client-Folder-Template', root.id).id;
    drive.add('00_Account', vorlageId);
    const creative = drive.add('03_Creative', vorlageId);
    drive.add('01_Briefings', creative.id);
    drive.add('Briefing-Vorlage', creative.id, 'application/vnd.google-apps.document');
  });

  const konfiguriereDrive = () =>
    crm.saveEinstellungen({ [EINSTELLUNG.leadsOrdner]: leadsId, [EINSTELLUNG.clientsOrdner]: clientsId, [EINSTELLUNG.vorlageOrdner]: vorlageId });

  it('updates the right row after rows were re-sorted by hand', async () => {
    const a = await crm.createFirma(firmaInput({ name: 'A' }));
    const b = await crm.createFirma(firmaInput({ name: 'B' }));
    const rows = sheets.rows('firmen');
    [rows[1], rows[2]] = [rows[2], rows[1]];
    await crm.updateFirma(a.id, { ort: 'Berlin' }, a.geaendert_am);
    const db = await crm.load();
    expect(db.firmen.find((f) => f.id === a.id)?.ort).toBe('Berlin');
    expect(db.firmen.find((f) => f.id === b.id)?.ort).toBe('');
  });

  it('refuses to overwrite a newer change', async () => {
    const a = await crm.createFirma(firmaInput({ name: 'A' }));
    await new Promise((r) => setTimeout(r, 2));
    await crm.updateFirma(a.id, { ort: 'Köln' }, a.geaendert_am);
    await expect(crm.updateFirma(a.id, { ort: 'Bonn' }, a.geaendert_am)).rejects.toThrow(ConflictError);
  });

  it('keeps exactly one main contact per firm', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Shop' }));
    const erster = await crm.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, nachname: 'Eins' });
    expect(erster.hauptkontakt).toBe(true);
    await crm.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, nachname: 'Zwei', hauptkontakt: true });
    const kontakte = (await crm.load()).kontakte;
    expect(kontakte.filter((k) => k.hauptkontakt).map((k) => k.nachname)).toEqual(['Zwei']);
  });

  it('assigns a lead to whoever moves it from qualified to contacted, and it stays editable', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Shop', zustaendig: 'Julian' }));
    const deal = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'Migration', zustaendig: 'Julian' });
    const qualifiziert = await crm.changePhase(deal.id, 'qualifiziert', deal.geaendert_am, '', 'Lugge');
    expect(qualifiziert.zustaendig).toBe('Julian');

    const kontaktiert = await crm.changePhase(deal.id, 'kontaktiert', qualifiziert.geaendert_am, '', 'Lugge');
    let db = await crm.load();
    expect(kontaktiert.zustaendig).toBe('Lugge');
    expect(db.firmen[0].zustaendig).toBe('Lugge');
    expect(db.aktivitaeten.at(-1)?.text).toBe('„Migration“: Qualifiziert → Kontaktiert, zugeteilt an Lugge');

    // Changing it by hand afterwards sticks; later phase changes leave it alone.
    const { titel, kontakt_id, wert_eur, wahrscheinlichkeit, naechster_schritt, naechster_schritt_am } = kontaktiert;
    const umgestellt = await crm.saveDeal(firma.id, { titel, kontakt_id, wert_eur, wahrscheinlichkeit, naechster_schritt, naechster_schritt_am, zustaendig: 'Johannes' }, { id: kontaktiert.id, expectedGeaendertAm: kontaktiert.geaendert_am });
    const gespraech = await crm.changePhase(deal.id, 'gespraech', umgestellt.geaendert_am, '', 'Lugge');
    expect(gespraech.zustaendig).toBe('Johannes');
    db = await crm.load();
    expect(db.firmen[0].zustaendig).toBe('Lugge');
  });

  it('does not reassign when a deal skips "qualifiziert" or the mover is unknown', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Shop' }));
    const deal = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'Migration', zustaendig: 'Julian' });
    const direkt = await crm.changePhase(deal.id, 'kontaktiert', deal.geaendert_am, '', 'Lugge');
    expect(direkt.zustaendig).toBe('Julian');

    const zweiter = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'SEO', zustaendig: 'Julian' });
    const q = await crm.changePhase(zweiter.id, 'qualifiziert', zweiter.geaendert_am);
    expect((await crm.changePhase(zweiter.id, 'kontaktiert', q.geaendert_am)).zustaendig).toBe('Julian');
  });

  it('logs phase changes, requires a reason for lost deals and turns won leads into customers', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Shop' }));
    const deal = await crm.saveDeal(firma.id, { ...EMPTY_DEAL_INPUT, titel: 'Migration', wert_eur: 10000 });
    await expect(crm.changePhase(deal.id, 'verloren', deal.geaendert_am)).rejects.toThrow(ValidationError);

    user = 'julian@velonify.de';
    const gewonnen = await crm.changePhase(deal.id, 'gewonnen', deal.geaendert_am);
    expect(gewonnen.abgeschlossen_am).toBe(heute);

    const db = await crm.load();
    expect(db.firmen[0].status).toBe('kunde');
    expect(db.aktivitaeten.map((a) => a.text)).toEqual(['Deal „Migration“ angelegt', '„Migration“: Neu → Gewonnen']);
    expect(db.aktivitaeten[1].von).toBe('julian@velonify.de');
    expect(kennzahlen(db.deals, heute)).toMatchObject({ offen: 0, gewonnenMonat: 1, gewonnenMonatWert: 10000 });
  });

  it('creates a lead folder, moves it to clients and fills in the template', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Sturm & Berger GmbH' }));
    await expect(crm.legeLeadOrdnerAn(firma.id, 'SBI')).rejects.toThrow(NotConfiguredError);
    await konfiguriereDrive();

    const mitOrdner = await crm.legeLeadOrdnerAn(firma.id, 'sbi');
    expect(mitOrdner.kuerzel).toBe('SBI');
    const ordner = await drive.getFile(mitOrdner.drive_ordner_id);
    expect(ordner).toMatchObject({ name: 'SBI_Sturm-Berger', parents: [leadsId] });
    let db = await crm.load();
    expect(await crm.ordnerOrt(db, db.firmen[0])).toBe('leads');

    await crm.verschiebeNachClients(firma.id);
    db = await crm.load();
    expect(await crm.ordnerOrt(db, db.firmen[0])).toBe('clients');
    const inhalt = await crm.ordnerInhalt(db.firmen[0]);
    expect(inhalt.map((f) => f.name)).toEqual(['00_Account', '03_Creative']);
    const creative = inhalt.find((f) => f.name === '03_Creative')!;
    expect((await drive.listChildren(creative.id)).map((f) => f.name).sort()).toEqual(['01_Briefings', 'Briefing-Vorlage']);

    // Running it again adds nothing twice.
    await crm.verschiebeNachClients(firma.id);
    expect((await crm.ordnerInhalt(db.firmen[0])).length).toBe(2);
  });

  it('creates a client folder straight in 01_Clients with the template', async () => {
    await konfiguriereDrive();
    const firma = await crm.createFirma(firmaInput({ name: 'Sturm & Berger GmbH' }));
    const mitOrdner = await crm.legeLeadOrdnerAn(firma.id, 'SBI', undefined, 'clients');
    const db = await crm.load();
    expect(await crm.ordnerOrt(db, db.firmen[0])).toBe('clients');
    expect((await crm.ordnerInhalt(db.firmen[0])).map((f) => f.name)).toEqual(['00_Account', '03_Creative']);
    expect(db.aktivitaeten.some((a) => a.text === 'Kundenordner „SBI_Sturm-Berger“ in 01_Clients angelegt')).toBe(true);
    expect(mitOrdner.kuerzel).toBe('SBI');
  });

  it('reuses an existing lead folder with the same name instead of creating a duplicate', async () => {
    await konfiguriereDrive();
    const vorhanden = drive.add('ABC_Alpha-Beta', leadsId);
    const firma = await crm.createFirma(firmaInput({ name: 'Alpha Beta' }));
    expect((await crm.legeLeadOrdnerAn(firma.id, 'ABC')).drive_ordner_id).toBe(vorhanden.id);
  });

  const terminEingabe = (extra: Partial<TerminEingabe> = {}): TerminEingabe => ({
    firma_id: '', kontakt_ids: [], weitere_emails: [], titel: 'Kickoff', ganztaegig: false,
    von_datum: addDays(heute, 2), von_zeit: '10:00', bis_datum: addDays(heute, 2), bis_zeit: '10:45',
    ort: '', beschreibung: '', meet: true, einladungSenden: true, ...extra,
  });

  it('schedules a meeting with contacts and finds it again', async () => {
    const firma = await crm.createFirma(firmaInput({ name: 'Shop' }));
    const kontakt = await crm.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, vorname: 'Mara', nachname: 'Holm', email: 'Mara@Shop.example' });
    await expect(crm.planeTermin(terminEingabe({ titel: ' ' }))).rejects.toThrow(ValidationError);
    await expect(crm.planeTermin(terminEingabe({ bis_zeit: '09:00' }))).rejects.toThrow('Das Ende muss nach dem Beginn liegen.');
    await expect(crm.planeTermin(terminEingabe({ weitere_emails: ['kein-mail'] }))).rejects.toThrow(ValidationError);

    const termin = await crm.planeTermin(terminEingabe({ firma_id: firma.id, kontakt_ids: [kontakt.id], weitere_emails: ['julian@velonify.de'] }));
    expect(termin.teilnehmer).toEqual(['mara@shop.example', 'julian@velonify.de']);
    expect(termin.meetLink).toBeTruthy();
    expect(new Date(termin.ende).getTime() - new Date(termin.start).getTime()).toBe(45 * 60_000);

    const db = await crm.load();
    expect(db.aktivitaeten[0]).toMatchObject({ typ: 'meeting', kalender_termin_id: termin.id, kontakt_id: kontakt.id });
    expect((await crm.termineMitFirma(db, firma.id)).map((t) => t.id)).toEqual([termin.id]);
  });

  it('adds own appointments without firm, guests or Meet, and all-day ones with an exclusive end', async () => {
    const blocker = await crm.planeTermin(terminEingabe({ titel: 'Fokuszeit', meet: false, ort: 'Büro' }));
    expect(blocker).toMatchObject({ titel: 'Fokuszeit', ort: 'Büro', teilnehmer: [], meetLink: undefined, bearbeitbar: true });
    const urlaub = await crm.planeTermin(terminEingabe({ titel: 'Urlaub', ganztaegig: true, von_datum: '2030-07-01', bis_datum: '2030-07-03', meet: false }));
    expect(urlaub).toMatchObject({ ganztaegig: true, start: '2030-07-01', ende: '2030-07-04' });
    await expect(crm.planeTermin(terminEingabe({ ganztaegig: true, von_datum: '2030-07-03', bis_datum: '2030-07-01' }))).rejects.toThrow(ValidationError);
    expect((await crm.load()).aktivitaeten).toEqual([]);
  });

  it('changes and deletes own appointments but not those of others', async () => {
    const termin = await crm.planeTermin(terminEingabe({ meet: false }));
    const geaendert = await crm.aendereTermin(termin, terminEingabe({ titel: 'Kickoff (verschoben)', von_zeit: '14:00', bis_zeit: '15:00', meet: true, weitere_emails: ['julian@velonify.de'] }));
    expect(geaendert).toMatchObject({ id: termin.id, titel: 'Kickoff (verschoben)', teilnehmer: ['julian@velonify.de'] });
    expect(geaendert.meetLink).toBeTruthy();
    expect(new Date(geaendert.start).getHours()).toBe(14);
    expect((await crm.aendereTermin(geaendert, terminEingabe({ meet: false }))).meetLink).toBeUndefined();

    const fremd = { ...geaendert, bearbeitbar: false };
    await expect(crm.aendereTermin(fremd, terminEingabe())).rejects.toThrow(ValidationError);
    await expect(crm.loescheTermin(fremd, true)).rejects.toThrow(ValidationError);

    await crm.loescheTermin(geaendert, true);
    expect(calendar.events).toEqual([]);
  });

  it('imports a lead CSV: new firms with contact and deal, fills empty fields of existing ones, skips tiers', async () => {
    const vorhanden = await crm.createFirma(firmaInput({ name: 'Bekannt GmbH', domain: 'bekannt.example', ort: 'Berlin' }));
    const csv = [
      'tier,score,domain,firma,plattform,version,eol,register,ust_id,ansprechpartner,email,telefon,ort,katalog_urls,payments,marketing,lauf',
      'A,100,neu.example,Neu GmbH,magento2,,eol,HRB 1,DE1,Uwe Beispiel,info@neu.example,040 1,Hamburg,456,,"ga4, meta_pixel",Lauf 1',
      'B,61,https://www.bekannt.example/,,magento1,,eol,,DE2,,info@bekannt.example,,München,0,,ga4,Lauf 4',
      'C,20,klein.example,Klein,magento2,,unknown,,,,,,,,,,Lauf 2',
      'A,90,neu.example,Neu GmbH,magento2,,eol,,,,,,,,,,Lauf 1',
      'A,90,,Ohne Domain,magento2,,eol,,,,,,,,,,Lauf 1',
    ].join('\n');
    const db = await crm.load();
    const plan = planeImport(parseCsv(csv), db, { tiers: ['A', 'B'], zustaendig: 'Lugge', dealAnlegen: true, dealTitel: '' });

    expect(plan.zeilen.map((z) => z.aktion)).toEqual(['neu', 'ergaenzen', 'uebersprungen', 'uebersprungen', 'fehler']);
    expect(plan.zeilen[0].firma).toMatchObject({ name: 'Neu GmbH', tech_info: 'ga4, meta_pixel · 456 Katalog-URLs', quelle: 'Magento Lauf 1', zustaendig: 'Lugge' });
    // Ort "Berlin" exists and is kept; only empty fields are filled.
    expect(plan.zeilen[1].aenderungen).toMatchObject({ tier: 'B', email_allgemein: 'info@bekannt.example', plattform: 'magento1' });
    expect(plan.zeilen[1].aenderungen).not.toHaveProperty('ort');

    const ergebnis = await crm.importiere(plan);
    expect(ergebnis).toMatchObject({ neu: 1, ergaenzt: 1, kontakte: 1, deals: 1 });
    const nachher = await crm.load();
    const neu = nachher.firmen.find((f) => f.domain === 'neu.example')!;
    expect(ergebnis.firmen).toEqual({ 'neu.example': neu.id, 'bekannt.example': vorhanden.id });
    expect(nachher.kontakte.find((k) => k.firma_id === neu.id)).toMatchObject({ vorname: 'Uwe', nachname: 'Beispiel', hauptkontakt: true });
    expect(nachher.deals.find((d) => d.firma_id === neu.id)).toMatchObject({ titel: 'Shopify-Migration', phase: 'neu', zustaendig: 'Lugge' });
    expect(nachher.firmen.find((f) => f.id === vorhanden.id)).toMatchObject({ ort: 'Berlin', tier: 'B' });

    // Importing the same file again creates nothing new.
    const nochmal = planeImport(parseCsv(csv), nachher, { tiers: ['A', 'B'], zustaendig: '', dealAnlegen: true, dealTitel: '' });
    expect(nochmal.zeilen.filter((z) => z.aktion === 'neu')).toHaveLength(0);
  });

  it('starts imported deals in the chosen phase', async () => {
    const csv = ['tier,domain,firma', 'A,phase.example,Phase GmbH'].join('\n');
    const plan = planeImport(parseCsv(csv), await crm.load(), { tiers: ['A'], zustaendig: '', dealAnlegen: true, dealTitel: '', dealPhase: 'qualifiziert' });
    await crm.importiere(plan);
    const nachher = await crm.load();
    const firma = nachher.firmen.find((f) => f.domain === 'phase.example')!;
    expect(nachher.deals.find((d) => d.firma_id === firma.id)).toMatchObject({ phase: 'qualifiziert' });
  });

  it('imports the qualifier output format directly, including extra columns and old English headers', async () => {
    const neu = [
      'tier,score,domain,firma,plattform,version,eol,register,ust_id,ansprechpartner,email,telefon,ort,katalog_urls,payments,marketing,lauf,konfidenz,rechtsform,ansprechpartner_rolle,letztes_deploy,score_gruende,url',
      'A,82,alpha-shop.example,Alpha Shop GmbH,magento2,2.4.6,eol,HRB 1 (AG Essen),DE000000009,Max Beispiel,info@alpha-shop.example,0201 0,Essen,800,"klarna, paypal",ga4,Lauf 5,94,GmbH,Geschäftsführung,2024-01-15,Magento 2 ohne Support (+26) | HRB (+14),https://alpha-shop.example/',
      'D,22,delta-shop.example,,magento2,,unknown,,,,,,,0,,,Lauf 5,70,,,,,https://delta-shop.example/',
    ].join('\n');
    const db = await crm.load();
    const plan = planeImport(parseCsv(neu), db, { tiers: ['A', 'B'], zustaendig: '', dealAnlegen: false, dealTitel: '' });
    expect(plan.zeilen.map((z) => [z.aktion, z.hinweis])).toEqual([['neu', 'mit Ansprechpartner'], ['uebersprungen', 'Tier D nicht ausgewählt']]);
    expect(plan.zeilen[0].firma).toMatchObject({
      name: 'Alpha Shop GmbH', plattform: 'magento2', version: '2.4.6', eol: 'eol', ust_id: 'DE000000009', telefon_allgemein: '0201 0', ort: 'Essen',
      tech_info: 'ga4, klarna, paypal · 800 Katalog-URLs · letztes Deploy 2024-01-15', quelle: 'Magento Lauf 5',
      notiz: 'Lead-Scoring: Magento 2 ohne Support (+26) | HRB (+14)',
    });
    expect(plan.zeilen[0].kontakt).toMatchObject({ vorname: 'Max', nachname: 'Beispiel', rolle: 'Geschäftsführung' });

    const alt = 'tier,score,domain,company,platform,magento_version,eol_state,vat_id,contact_person,phone,city\nB,55,beta-shop.example,Beta GmbH,magento1,,eol,DE1,Eva Muster,030 1,Berlin';
    const altPlan = planeImport(parseCsv(alt), db, { tiers: ['B'], zustaendig: '', dealAnlegen: false, dealTitel: '' });
    expect(altPlan.zeilen[0].firma).toMatchObject({ name: 'Beta GmbH', plattform: 'magento1', eol: 'eol', ust_id: 'DE1', telefon_allgemein: '030 1', ort: 'Berlin' });
  });

  it('parses semicolon CSV with quotes and line breaks', () => {
    expect(parseCsv('﻿a;b\r\n"x; y";"mit ""Zitat""\nund Umbruch"\r\n')).toEqual([['a', 'b'], ['x; y', 'mit "Zitat"\nund Umbruch']]);
  });
});

describe('selectors', () => {
  it('groups my follow-ups and deal steps by due date', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db: Database = await service.load();
    const heute = isoDate(new Date());

    const julian = meinTag(db, 'Julian', heute);
    expect(julian.naechsteTage.map((a) => a.titel)).toEqual(['Budgetfreigabe erfragen', 'Workshop-Termin abstimmen']);
    expect(julian.ueberfaellig).toHaveLength(0);

    const alle = meinTag(db, null, heute);
    expect(alle.ueberfaellig.map((a) => a.titel)).toEqual(['Quartalsreport schicken', 'Angebot nachfassen']);
    expect(alle.heute.map((a) => a.titel)).toEqual(['Erstkontakt per Mail']);

    const nordlicht = db.firmen.find((f) => f.name.startsWith('Nordlicht'))!;
    expect(fortschritt(db.deals.filter((d) => d.firma_id === nordlicht.id))).toBe('angebot');
  });

  it('matches the signed-in person to a team member', () => {
    const team = ['Lugge', 'Johannes', 'Julian'];
    expect(findeTeamMitglied(team, 'Julian Beispiel', 'julian@velonify.de')).toBe('Julian');
    expect(findeTeamMitglied(team, 'Max Beispiel', 'lugge.beispiel@velonify.de')).toBe('Lugge');
    expect(findeTeamMitglied(team, 'Max Beispiel', 'max@velonify.de')).toBeNull();
  });
});
