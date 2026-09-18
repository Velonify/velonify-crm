import { ConflictError, NotFoundError, SchemaError } from '../errors';
import { ENTITY_TABS, ANGEBOTS_TABS, AUDIT_TABS, CONTACT_TABS, LISTEN_DEFAULTS, SCHEMA, type EntityTab, type TabSchema } from '../schema';
import type { RecordUpdate, Store } from '../store';
import type { AngebotsDaten, Audit, ContactDaten, Database, Einstellungen, EntityMap, Listen } from '../types';
import { columnLetter, recordToRow, rowToRecord } from './rows';
import { quoteTab, type SheetsApi, type ValueWrite } from './sheetsClient';

const ALL_TABS: TabSchema[] = [...ENTITY_TABS.map((tab) => SCHEMA[tab]), SCHEMA.listen, SCHEMA.einstellungen];
const fullRange = (tab: string) => `${quoteTab(tab)}!A1:ZZ`;

function splitHeader(values: unknown[][]): { header: string[]; rows: unknown[][] } {
  const [headerRow = [], ...rows] = values;
  return { header: headerRow.map((cell) => String(cell ?? '').trim()), rows };
}

function entityRows<K extends EntityTab>(tab: K, table: { header: string[]; rows: unknown[][] }): EntityMap[K][] {
  const idIndex = table.header.indexOf('id');
  return table.rows
    .filter((row) => String(row[idIndex] ?? '').trim() !== '')
    .map((row) => rowToRecord(SCHEMA[tab], table.header, row) as unknown as EntityMap[K]);
}

function assertColumns(schema: TabSchema, header: string[]): void {
  const missing = schema.columns.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new SchemaError(
      `Im Tabellenblatt „${schema.name}“ fehlen Spalten (${missing.join(', ')}). Bitte unter „Einrichtung“ auf „Einrichten“ klicken.`,
    );
  }
}

/** Google Sheets as database: one request loads every tab; writes re-read only the affected tab. */
export class SheetStore implements Store {
  private readonly api: SheetsApi;
  private readonly headers = new Map<string, string[]>();

  constructor(api: SheetsApi) {
    this.api = api;
  }

  async load(): Promise<Database> {
    const values = await this.api.batchGetValues(ALL_TABS.map((tab) => fullRange(tab.name)));
    const parsed = new Map<string, { header: string[]; rows: unknown[][] }>();
    ALL_TABS.forEach((schema, i) => {
      const table = splitHeader(values[i]);
      assertColumns(schema, table.header);
      this.headers.set(schema.name, table.header);
      parsed.set(schema.name, table);
    });

    const entities = <K extends EntityTab>(tab: K): EntityMap[K][] => entityRows(tab, parsed.get(tab)!);

    const listen: Listen = {};
    for (const row of plainRows(parsed.get('listen')!, SCHEMA.listen)) {
      const name = String(row.liste ?? '').trim();
      const wert = String(row.wert ?? '').trim();
      if (name && wert) (listen[name] ??= []).push(wert);
    }

    const einstellungen: Einstellungen = {};
    for (const row of plainRows(parsed.get('einstellungen')!, SCHEMA.einstellungen)) {
      const key = String(row.schluessel ?? '').trim();
      if (key) einstellungen[key] = String(row.wert ?? '').trim();
    }

    return {
      firmen: entities('firmen'),
      kontakte: entities('kontakte'),
      deals: entities('deals'),
      aktivitaeten: entities('aktivitaeten'),
      wiedervorlagen: entities('wiedervorlagen'),
      // Lists missing from the sheet fall back to the defaults.
      listen: { ...LISTEN_DEFAULTS, ...listen },
      einstellungen,
    };
  }

  async loadAngebotsDaten(): Promise<AngebotsDaten> {
    const info = await this.api.getSpreadsheet();
    const vorhanden = new Set(info.sheets?.map((sheet) => sheet.properties.title));
    if (ANGEBOTS_TABS.some((tab) => !vorhanden.has(tab))) {
      throw new SchemaError('Der Angebots-Rechner ist noch nicht eingerichtet. Bitte unter „Einrichtung“ auf „Einrichten“ klicken.');
    }
    const values = await this.api.batchGetValues(ANGEBOTS_TABS.map((tab) => fullRange(tab)));
    const tables = ANGEBOTS_TABS.map((tab, i) => {
      const table = splitHeader(values[i]);
      assertColumns(SCHEMA[tab], table.header);
      this.headers.set(tab, table.header);
      return table;
    });
    return {
      kategorien: entityRows('leistungskategorien', tables[0]),
      leistungen: entityRows('leistungen', tables[1]),
      angebote: entityRows('angebote', tables[2]),
    };
  }

  async loadContactDaten(): Promise<ContactDaten> {
    const info = await this.api.getSpreadsheet();
    const vorhanden = new Set(info.sheets?.map((sheet) => sheet.properties.title));
    if (CONTACT_TABS.some((tab) => !vorhanden.has(tab))) {
      throw new SchemaError('Der Contact Generator ist noch nicht eingerichtet. Bitte unter „Einrichtung“ auf „Einrichten“ klicken.');
    }
    const values = await this.api.batchGetValues(CONTACT_TABS.map((tab) => fullRange(tab)));
    const tables = CONTACT_TABS.map((tab, i) => {
      const table = splitHeader(values[i]);
      assertColumns(SCHEMA[tab], table.header);
      this.headers.set(tab, table.header);
      return table;
    });
    return { leistungen: entityRows('outreach_leistungen', tables[0]), anschreiben: entityRows('anschreiben', tables[1]) };
  }

  async loadAudits(): Promise<Audit[]> {
    const info = await this.api.getSpreadsheet();
    if (!info.sheets?.some((sheet) => sheet.properties.title === AUDIT_TABS[0])) {
      throw new SchemaError('Das Shop-Audit ist noch nicht eingerichtet. Bitte unter „Einrichtung“ auf „Einrichten“ klicken.');
    }
    const table = splitHeader(await this.api.getValues(fullRange('audits')));
    assertColumns(SCHEMA.audits, table.header);
    this.headers.set('audits', table.header);
    return entityRows('audits', table);
  }

  private async header(tab: string): Promise<string[]> {
    const cached = this.headers.get(tab);
    if (cached) return cached;
    const { header } = splitHeader(await this.api.getValues(`${quoteTab(tab)}!1:1`));
    this.headers.set(tab, header);
    return header;
  }

  async insert<K extends EntityTab>(tab: K, records: EntityMap[K][]): Promise<void> {
    if (records.length === 0) return;
    const schema = SCHEMA[tab];
    const header = await this.header(tab);
    assertColumns(schema, header);
    await this.api.appendValues(
      `${quoteTab(tab)}!A1`,
      records.map((record) => recordToRow(schema, header, record as unknown as Record<string, unknown>)),
    );
  }

  async update<K extends EntityTab>(tab: K, updates: RecordUpdate<EntityMap[K]>[]): Promise<EntityMap[K][]> {
    if (updates.length === 0) return [];
    const schema = SCHEMA[tab];
    // Fresh read, so rows are located by id in the sheet as it is right now – not where they were at load time.
    const { header, rows } = splitHeader(await this.api.getValues(fullRange(tab)));
    assertColumns(schema, header);
    this.headers.set(tab, header);

    const idIndex = header.indexOf('id');
    const rowIndexById = new Map<string, number>();
    rows.forEach((row, index) => {
      const id = String(row[idIndex] ?? '');
      if (id && !rowIndexById.has(id)) rowIndexById.set(id, index);
    });

    const writes = new Map<number, ValueWrite>();
    const results: EntityMap[K][] = [];
    for (const update of updates) {
      const index = rowIndexById.get(update.id);
      if (index === undefined) throw new NotFoundError();
      const current = rowToRecord(schema, header, rows[index]);
      if (update.expectedGeaendertAm !== undefined && String(current.geaendert_am ?? '') !== update.expectedGeaendertAm) {
        throw new ConflictError(String(current.geaendert_von ?? ''), String(current.geaendert_am ?? ''));
      }
      const next = { ...current, ...update.changes, id: update.id };
      // Keep the merged row, so several updates to the same record in one call build on each other.
      rows[index] = recordToRow(schema, header, next, rows[index]);
      const rowNumber = index + 2;
      writes.set(index, { range: `${quoteTab(tab)}!A${rowNumber}:${columnLetter(header.length)}${rowNumber}`, values: [rows[index]] });
      results.push(next as unknown as EntityMap[K]);
    }
    await this.api.batchUpdateValues([...writes.values()]);
    return results;
  }

  async saveEinstellungen(values: Einstellungen): Promise<void> {
    const tab = SCHEMA.einstellungen.name;
    const { header, rows } = splitHeader(await this.api.getValues(fullRange(tab)));
    assertColumns(SCHEMA.einstellungen, header);
    const keyIndex = header.indexOf('schluessel');
    const writes: ValueWrite[] = [];
    const appends: unknown[][] = [];
    for (const [key, wert] of Object.entries(values)) {
      const index = rows.findIndex((row) => String(row[keyIndex] ?? '').trim() === key);
      const row = recordToRow(SCHEMA.einstellungen, header, { schluessel: key, wert }, index >= 0 ? rows[index] : []);
      if (index >= 0) {
        writes.push({ range: `${quoteTab(tab)}!A${index + 2}:${columnLetter(header.length)}${index + 2}`, values: [row] });
      } else {
        appends.push(row);
      }
    }
    await this.api.batchUpdateValues(writes);
    await this.api.appendValues(`${quoteTab(tab)}!A1`, appends);
  }
}

function plainRows(table: { header: string[]; rows: unknown[][] }, schema: TabSchema) {
  return table.rows.map((row) => rowToRecord(schema, table.header, row));
}
