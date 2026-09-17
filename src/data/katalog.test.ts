import { beforeEach, describe, expect, it } from 'vitest';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { SchemaError, ValidationError } from './errors';
import { inSprache, katalogBaum, verschiebe } from './katalog';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { STARTKATALOG } from './startkatalog';
import { EMPTY_KATEGORIE_INPUT, EMPTY_LEISTUNG_INPUT } from './types';

const service = (sheets: MemorySheets) =>
  new CrmService({ store: new SheetStore(sheets), drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'lugge@velonify.de' });

describe('Startkatalog', () => {
  it('has German and English texts for every category and sub-item', () => {
    expect(STARTKATALOG.length).toBeGreaterThan(0);
    for (const k of STARTKATALOG) {
      expect(k.titel.every(Boolean) && k.umfang.every(Boolean)).toBe(true);
      expect(k.leistungen.length).toBeGreaterThan(0);
      for (const l of k.leistungen) expect(l.titel.every(Boolean) && l.text.every(Boolean)).toBe(true);
    }
    expect(STARTKATALOG.some((k) => k.abrechnung === 'monatlich')).toBe(true);
  });
});

describe('katalog rules', () => {
  it('falls back to German when the English text is missing', () => {
    const item = { titel_de: 'Datenmigration', titel_en: '' };
    expect(inSprache(item, 'titel', 'en')).toBe('Datenmigration');
    expect(inSprache({ ...item, titel_en: 'Data Migration' }, 'titel', 'en')).toBe('Data Migration');
  });

  it('moves an entry and renumbers the list', () => {
    const items = [
      { id: 'a', sortierung: 10, titel_de: 'A' },
      { id: 'b', sortierung: 10, titel_de: 'B' },
      { id: 'c', sortierung: null, titel_de: 'C' },
    ];
    expect(verschiebe(items, 'c', -1)).toEqual([
      { id: 'c', sortierung: 20 },
      { id: 'b', sortierung: 30 },
    ]);
    expect(verschiebe(items, 'a', -1)).toEqual([]);
  });
});

describe('Leistungskatalog', () => {
  let sheets: MemorySheets;
  let crm: CrmService;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
    crm = service(sheets);
  });

  it('keeps the CRM working while the catalogue tabs are missing', async () => {
    const alt = new MemorySheets();
    await runSetup(alt);
    // Simulate a sheet set up before the offer tool existed.
    const ohne = new MemorySheets('Alt', []);
    for (const tab of ['firmen', 'kontakte', 'deals', 'aktivitaeten', 'wiedervorlagen', 'listen', 'einstellungen']) {
      await ohne.batchUpdate([{ addSheet: { properties: { title: tab, gridProperties: { columnCount: 40 } } } }]);
      await ohne.updateValues(`'${tab}'!A1`, [(await alt.getValues(`'${tab}'!1:1`))[0]]);
    }
    const crmAlt = service(ohne);
    await expect(crmAlt.load()).resolves.toMatchObject({ firmen: [] });
    await expect(crmAlt.loadAngebotsDaten()).rejects.toBeInstanceOf(SchemaError);
  });

  it('takes over the start catalogue once, in order', async () => {
    const ergebnis = await crm.uebernimmStartkatalog();
    expect(ergebnis.kategorien).toBe(STARTKATALOG.length);
    const baum = katalogBaum(await crm.loadAngebotsDaten());
    expect(baum.map((k) => k.kategorie.titel_de)).toEqual(STARTKATALOG.map((k) => k.titel[0]));
    expect(baum[0].leistungen.map((l) => l.titel_en)).toEqual(STARTKATALOG[0].leistungen.map((l) => l.titel[1]));
    await expect(crm.uebernimmStartkatalog()).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates, moves, re-assigns and archives entries', async () => {
    await expect(crm.saveKategorie({ ...EMPTY_KATEGORIE_INPUT, titel_de: ' ' })).rejects.toBeInstanceOf(ValidationError);
    const web = await crm.saveKategorie({ ...EMPTY_KATEGORIE_INPUT, titel_de: 'Website', titel_en: 'Website' });
    const ads = await crm.saveKategorie({ ...EMPTY_KATEGORIE_INPUT, titel_de: 'Ads', abrechnung: 'monatlich' });
    const setup = await crm.saveLeistung({ ...EMPTY_LEISTUNG_INPUT, kategorie_id: web.id, titel_de: 'Setup' });
    await crm.saveLeistung({ ...EMPTY_LEISTUNG_INPUT, kategorie_id: web.id, titel_de: 'Formular' });

    await crm.verschiebeKategorie(ads.id, -1);
    let baum = katalogBaum(await crm.loadAngebotsDaten());
    expect(baum.map((k) => k.kategorie.titel_de)).toEqual(['Ads', 'Website']);

    await crm.verschiebeLeistung(setup.id, 1);
    baum = katalogBaum(await crm.loadAngebotsDaten());
    expect(baum[1].leistungen.map((l) => l.titel_de)).toEqual(['Formular', 'Setup']);

    const verschoben = await crm.saveLeistung({ ...EMPTY_LEISTUNG_INPUT, kategorie_id: ads.id, titel_de: 'Setup' }, { id: setup.id, expectedGeaendertAm: setup.geaendert_am });
    baum = katalogBaum(await crm.loadAngebotsDaten());
    expect(baum[0].leistungen.map((l) => l.id)).toEqual([verschoben.id]);

    await crm.setKategorieArchiviert(web.id, true, web.geaendert_am);
    const katalog = await crm.loadAngebotsDaten();
    expect(katalogBaum(katalog).map((k) => k.kategorie.titel_de)).toEqual(['Ads']);
    expect(katalogBaum(katalog, true)).toHaveLength(2);
  });
});
