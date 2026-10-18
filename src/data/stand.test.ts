import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { EINSTELLUNG } from './constants';
import { CrmService } from './crm';
import { MemoryCalendar, MemoryDrive } from './demo/memoryGoogle';
import { MemorySheets } from './demo/memorySheets';
import { ConflictError } from './errors';
import { runSetup } from './sheets/setup';
import { SheetStore } from './sheets/sheetStore';
import { ENTITY_TABS } from './schema';
import { DB_TABS, ersetze, fuegeEin } from './stand';
import { EMPTY_FIRMA_INPUT, type Database } from './types';

const leer: Database = { firmen: [], kontakte: [], deals: [], aktivitaeten: [], wiedervorlagen: [], listen: {}, einstellungen: {} };

describe('snapshot helpers', () => {
  it('knows the tabs of Database', () => {
    expect([...DB_TABS]).toEqual([...ENTITY_TABS]);
  });

  it('only touches tabs that are part of Database', () => {
    const firma = { ...EMPTY_FIRMA_INPUT, id: 'F-1', archiviert: false } as Database['firmen'][number];
    const mit = fuegeEin(leer, 'firmen', [firma]);
    expect(mit.firmen).toEqual([firma]);
    expect(leer.firmen).toEqual([]);
    expect(fuegeEin(leer, 'audits', [{ id: 'A-1' } as never])).toBe(leer);
    expect(ersetze(mit, 'firmen', [{ ...firma, name: 'Neu' }]).firmen[0].name).toBe('Neu');
  });
});

describe('CrmService snapshot', () => {
  let sheets: MemorySheets;
  let loads: number;
  let halt: Promise<void> | null;
  let crm: CrmService;

  beforeEach(async () => {
    sheets = new MemorySheets();
    await runSetup(sheets);
    const store = new SheetStore(sheets);
    loads = 0;
    halt = null;
    const load = store.load.bind(store);
    store.load = async () => {
      loads += 1;
      const db = await load();
      if (halt) await halt;
      return db;
    };
    crm = new CrmService({ store, drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'lugge@velonify.de' });
  });

  it('writes on the loaded snapshot and keeps it current without reading again', async () => {
    const vorher = await crm.load();
    expect(loads).toBe(1);

    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Testshop', domain: 'testshop.example' });
    const nachAnlegen = crm.aktuellerStand!;
    expect(nachAnlegen).not.toBe(vorher);
    expect(nachAnlegen.firmen.map((f) => f.id)).toEqual([firma.id]);
    expect(vorher.firmen).toEqual([]);

    const geaendert = await crm.updateFirma(firma.id, { ort: 'Hamburg' }, firma.geaendert_am);
    expect(crm.aktuellerStand!.firmen[0]).toEqual(geaendert);
    expect(loads).toBe(1);

    // The snapshot matches what a fresh read returns.
    const lokal = crm.aktuellerStand!;
    const frisch = await crm.load();
    expect(frisch.firmen).toEqual(lokal.firmen);
    expect(frisch.aktivitaeten.map((a) => a.id).sort()).toEqual(lokal.aktivitaeten.map((a) => a.id).sort());
  });

  it('reads once when nothing was loaded yet', async () => {
    expect(crm.aktuellerStand).toBeNull();
    await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Testshop', domain: 'testshop.example' });
    expect(loads).toBe(1);
    expect(crm.aktuellerStand!.firmen).toHaveLength(1);
  });

  it('forgets the snapshot when settings change, so the next load rebuilds the lists', async () => {
    await crm.load();
    await crm.saveEinstellungen({ [EINSTELLUNG.dealTitel]: 'Neu' });
    expect(crm.aktuellerStand).toBeNull();
  });

  it('still detects conflicts from colleagues on the server side', async () => {
    await crm.load();
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Testshop', domain: 'testshop.example' });
    // A colleague changes the firm through their own service; this snapshot does not know about it.
    const kollege = new CrmService({ store: new SheetStore(sheets), drive: new MemoryDrive(), calendar: new MemoryCalendar(), currentUser: () => 'julian@velonify.de', now: () => new Date(Date.now() + 60_000) });
    await kollege.updateFirma(firma.id, { ort: 'Berlin' }, firma.geaendert_am);
    await expect(crm.updateFirma(firma.id, { ort: 'Hamburg' }, firma.geaendert_am)).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps its own write when a read started before it finishes later', async () => {
    await crm.load();
    let weiter = () => {};
    halt = new Promise((resolve) => (weiter = resolve));
    const laufend = crm.load();
    const firma = await crm.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Testshop', domain: 'testshop.example' });
    weiter();
    const db = await laufend;
    expect(crm.aktuellerStand).toBe(db);
    expect(db.firmen.map((f) => f.id)).toContain(firma.id);
  });
});

describe('bundle', () => {
  const quelle = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), 'utf8');

  it('keeps demo and start data out of the static imports of the app', () => {
    const statisch = /^import [^;]*from '\.\/(demo\/seed|socialStart|startkatalog|outreachStart)';/m;
    expect(quelle('./crm.ts')).not.toMatch(statisch);
    expect(quelle('./CrmContext.tsx')).not.toMatch(statisch);
  });

  it('loads every page of the app lazily', () => {
    const app = quelle('../App.tsx');
    expect(app).not.toMatch(/^import \{ (?!LoginPage)\w+Page \} from/m);
    expect(app).toMatch(/seite\(\(\) => import\('\.\/pages\/StartPage'\), 'StartPage'\)/);
  });
});
