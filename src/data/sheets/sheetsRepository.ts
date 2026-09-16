import { prepareFirma } from '../firmen';
import { ID_PREFIX, newId, nowIso } from '../ids';
import type { Repository } from '../repository';
import { LISTEN_DEFAULTS, SCHEMA } from '../schema';
import type { Firma, FirmaInput, Listen } from '../types';
import { SheetTable } from './sheetTable';
import { quoteTab, type SheetsApi } from './sheetsClient';

export class SheetsRepository implements Repository {
  private readonly api: SheetsApi;
  private readonly currentUser: () => string;
  private readonly firmen: SheetTable<Firma>;

  constructor(api: SheetsApi, currentUser: () => string) {
    this.api = api;
    this.currentUser = currentUser;
    this.firmen = new SheetTable<Firma>(api, SCHEMA.firmen);
  }

  listFirmen(options?: { fresh?: boolean }): Promise<Firma[]> {
    return this.firmen.list(options);
  }

  getFirma(id: string): Promise<Firma> {
    return this.firmen.get(id);
  }

  async createFirma(input: FirmaInput): Promise<Firma> {
    const clean = prepareFirma(input, await this.firmen.list({ fresh: true }));
    const now = nowIso();
    const user = this.currentUser();
    return this.firmen.insert({
      ...clean,
      id: newId(ID_PREFIX.firmen),
      archiviert: false,
      erstellt_am: now,
      erstellt_von: user,
      geaendert_am: now,
      geaendert_von: user,
    });
  }

  async updateFirma(id: string, changes: Partial<FirmaInput>, expectedGeaendertAm: string): Promise<Firma> {
    const clean = prepareFirma(changes, await this.firmen.list({ fresh: true }), id);
    return this.firmen.update(id, { ...clean, geaendert_am: nowIso(), geaendert_von: this.currentUser() }, expectedGeaendertAm);
  }

  setFirmaArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Firma> {
    return this.firmen.update(id, { archiviert, geaendert_am: nowIso(), geaendert_von: this.currentUser() }, expectedGeaendertAm);
  }

  async getListen(): Promise<Listen> {
    let rows: unknown[][];
    try {
      rows = await this.api.getValues(`${quoteTab(SCHEMA.listen.name)}!A2:B`);
    } catch {
      return LISTEN_DEFAULTS;
    }
    const listen: Listen = {};
    for (const [liste, wert] of rows) {
      const name = String(liste ?? '').trim();
      const value = String(wert ?? '').trim();
      if (!name || !value) continue;
      (listen[name] ??= []).push(value);
    }
    // Lists missing from the sheet fall back to the defaults.
    return { ...LISTEN_DEFAULTS, ...listen };
  }
}
