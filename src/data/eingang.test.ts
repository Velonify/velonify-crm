import { beforeEach, describe, expect, it } from 'vitest';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { anfrageDomain, anfrageDubletten, anfrageText, firmaAusAnfrage, kontaktAusAnfrage, sortiereAnfragen } from './eingang';
import { ValidationError } from './errors';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { EMPTY_FIRMA_INPUT, type Anfrage, type Firma } from './types';

const anfrage = (overrides: Partial<Anfrage> = {}): Anfrage => ({
  id: 'EA-1',
  eingegangen_am: '2026-09-20T09:00:00.000Z',
  quelle: 'velonify.de',
  sprache: 'de',
  name: 'Uwe Möllmann',
  email: 'uwe@muster-shop.example',
  shop: 'https://www.muster-shop.example/',
  themen: 'Tracking, Ads',
  nachricht: 'Unser Tracking meldet seit dem Umzug zu wenig Umsatz.',
  status: 'neu',
  firma_id: '',
  kontakt_id: '',
  erledigt_am: '',
  erledigt_von: '',
  erstellt_am: '2026-09-20T09:00:00.000Z',
  erstellt_von: 'Website',
  geaendert_am: '2026-09-20T09:00:00.000Z',
  geaendert_von: 'Website',
  ...overrides,
});

describe('Anfragen aus dem Formular', () => {
  it('takes the domain from the shop address, otherwise from the email', () => {
    expect(anfrageDomain(anfrage())).toBe('muster-shop.example');
    expect(anfrageDomain(anfrage({ shop: '' }))).toBe('muster-shop.example');
    expect(anfrageDomain(anfrage({ shop: '', email: 'uwe@gmail.com' }))).toBe('');
  });

  it('splits the name and falls back to the email when it is missing', () => {
    expect(kontaktAusAnfrage(anfrage())).toMatchObject({ vorname: 'Uwe', nachname: 'Möllmann', email: 'uwe@muster-shop.example', hauptkontakt: true });
    expect(kontaktAusAnfrage(anfrage({ name: '' }))).toMatchObject({ vorname: '', nachname: 'uwe' });
  });

  it('keeps shop, topics and message in the activity text', () => {
    expect(anfrageText(anfrage())).toContain('Themen: Tracking, Ads');
    expect(anfrageText(anfrage())).toContain('Unser Tracking meldet');
  });

  it('proposes a firm that is already in the CRM', () => {
    const firmen = [{ ...EMPTY_FIRMA_INPUT, id: 'F-1', name: 'Muster Shop GmbH', domain: 'muster-shop.example' } as Firma];
    expect(anfrageDubletten(anfrage(), firmen)).toHaveLength(1);
    // The email domain counts too, so a matching address finds the firm even without a shop address.
    expect(anfrageDubletten(anfrage({ shop: '' }), firmen)).toHaveLength(1);
    expect(anfrageDubletten(anfrage({ shop: 'https://anderer-shop.example', email: 'uwe@anderer-shop.example' }), firmen)).toHaveLength(0);
  });

  it('shows open inquiries first, newest first', () => {
    const liste = [
      anfrage({ id: 'EA-alt', eingegangen_am: '2026-09-18T09:00:00.000Z' }),
      anfrage({ id: 'EA-fertig', status: 'uebernommen', eingegangen_am: '2026-09-20T10:00:00.000Z' }),
      anfrage({ id: 'EA-neu', eingegangen_am: '2026-09-19T09:00:00.000Z' }),
    ];
    expect(sortiereAnfragen(liste).map((a) => a.id)).toEqual(['EA-neu', 'EA-alt', 'EA-fertig']);
  });

  it('starts a new firm from the inquiry', () => {
    expect(firmaAusAnfrage(anfrage(), 'Lugge')).toMatchObject({
      name: 'muster-shop.example', domain: 'muster-shop.example', status: 'lead', quelle: 'velonify.de', zustaendig: 'Lugge',
    });
  });
});

describe('CrmService: Eingang', () => {
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
    await new SheetStore(sheets).insert('eingang', [anfrage()]);
  });

  it('turns an inquiry into a firm, a contact, a deal and an entry in the timeline', async () => {
    const { firma, kontakt, deal } = await crm.uebernimmAnfrage('EA-1', { zustaendig: 'Lugge', dealAnlegen: true });
    expect(firma).toMatchObject({ domain: 'muster-shop.example', quelle: 'velonify.de', zustaendig: 'Lugge' });
    expect(kontakt).toMatchObject({ email: 'uwe@muster-shop.example', hauptkontakt: true });
    expect(deal).toMatchObject({ firma_id: firma.id, phase: 'neu', zustaendig: 'Lugge' });

    const db = await crm.load();
    expect(db.aktivitaeten.find((a) => a.firma_id === firma.id && a.typ === 'mail')?.text).toContain('Tracking, Ads');

    const [gespeichert] = await crm.loadEingang();
    expect(gespeichert).toMatchObject({ status: 'uebernommen', firma_id: firma.id, kontakt_id: kontakt.id, erledigt_von: 'lugge@velonify.de' });
  });

  it('hangs the inquiry on a firm that is already there and reuses a known contact', async () => {
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Muster Shop GmbH', domain: 'muster-shop.example' });
    const bekannt = await crm.saveKontakt(firma.id, { vorname: 'Uwe', nachname: 'Möllmann', rolle: '', email: 'uwe@muster-shop.example', telefon: '', linkedin: '', hauptkontakt: true, notiz: '' });

    const ergebnis = await crm.uebernimmAnfrage('EA-1', { firmaId: firma.id, zustaendig: 'Lugge', dealAnlegen: false });
    expect(ergebnis.firma.id).toBe(firma.id);
    expect(ergebnis.kontakt.id).toBe(bekannt.id);
    expect(ergebnis.deal).toBeNull();
    expect((await crm.load()).kontakte).toHaveLength(1);
  });

  it('takes the corrected company name over the domain', async () => {
    const { firma } = await crm.uebernimmAnfrage('EA-1', { zustaendig: 'Lugge', dealAnlegen: false, firma: { name: 'Muster Shop GmbH' } });
    expect(firma.name).toBe('Muster Shop GmbH');
  });

  it('refuses a second takeover and keeps discarded inquiries out of the inbox', async () => {
    await crm.uebernimmAnfrage('EA-1', { zustaendig: 'Lugge', dealAnlegen: false });
    await expect(crm.uebernimmAnfrage('EA-1', { zustaendig: 'Lugge', dealAnlegen: false })).rejects.toThrow(ValidationError);

    await new SheetStore(sheets).insert('eingang', [anfrage({ id: 'EA-2', email: 'spam@spam.example' })]);
    const [zweite] = (await crm.loadEingang()).filter((a) => a.id === 'EA-2');
    expect(await crm.verwirfAnfrage('EA-2', zweite.geaendert_am)).toMatchObject({ status: 'verworfen', erledigt_von: 'lugge@velonify.de' });
  });
});
