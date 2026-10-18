import type { EntityTab } from './schema';
import type { Store } from './store';
import type { Database, EntityMap } from './types';

// Same as ENTITY_TABS in schema.ts (a test checks it); importing the schema would pull it into the start bundle.
export const DB_TABS = ['firmen', 'kontakte', 'deals', 'aktivitaeten', 'wiedervorlagen'] as const satisfies readonly EntityTab[];
type DbTab = (typeof DB_TABS)[number];
const istDbTab = (tab: EntityTab): tab is DbTab => (DB_TABS as readonly string[]).includes(tab);

/** Adds new rows to the snapshot; tabs outside `Database` leave it unchanged (same object). */
export function fuegeEin<K extends EntityTab>(db: Database, tab: K, records: readonly EntityMap[K][]): Database {
  if (!istDbTab(tab) || records.length === 0) return db;
  return { ...db, [tab]: [...db[tab], ...records] };
}

/** Replaces rows by id with what the store returned after an update. */
export function ersetze<K extends EntityTab>(db: Database, tab: K, records: readonly EntityMap[K][]): Database {
  if (!istDbTab(tab) || records.length === 0) return db;
  const neu = new Map(records.map((r) => [r.id, r]));
  return { ...db, [tab]: db[tab].map((r) => neu.get(r.id) ?? r) };
}

/**
 * Keeps the last loaded `Database` in step with the writes made through it, so a write needs neither a fresh read
 * before it nor a full reload after it. `load()` always reads from the store; if a write lands while that read is
 * running, the local snapshot (which contains the write) wins over the possibly older read.
 */
export class Stand {
  private db: Database | null = null;
  private schreibvorgaenge = 0;
  readonly store: Store;

  constructor(private readonly basis: Store) {
    const stand = this;
    this.store = new Proxy(basis, {
      get(ziel, name) {
        if (name === 'insert') {
          return async <K extends EntityTab>(tab: K, records: EntityMap[K][]) => {
            await ziel.insert(tab, records);
            stand.nachSchreiben((db) => fuegeEin(db, tab, records));
          };
        }
        if (name === 'update') {
          return async <K extends EntityTab>(tab: K, updates: Parameters<Store['update']>[1]) => {
            const records = (await ziel.update(tab, updates as never)) as EntityMap[K][];
            stand.nachSchreiben((db) => ersetze(db, tab, records));
            return records;
          };
        }
        if (name === 'saveEinstellungen') {
          return async (werte: Database['einstellungen']) => {
            await ziel.saveEinstellungen(werte);
            // Settings also shape `listen`; the next read rebuilds both instead of guessing here.
            stand.nachSchreiben(() => null);
          };
        }
        const wert = Reflect.get(ziel, name, ziel) as unknown;
        return typeof wert === 'function' ? (wert as (...args: unknown[]) => unknown).bind(ziel) : wert;
      },
    });
  }

  private nachSchreiben(aendern: (db: Database) => Database | null) {
    this.schreibvorgaenge += 1;
    if (this.db) this.db = aendern(this.db);
  }

  /** The current snapshot, or null when it has to be read again. */
  get aktuell(): Database | null {
    return this.db;
  }

  async load(): Promise<Database> {
    const vorher = this.schreibvorgaenge;
    const db = await this.basis.load();
    if (vorher === this.schreibvorgaenge || !this.db) this.db = db;
    return this.db;
  }

  /** The snapshot the user is looking at; reads only when there is none yet. */
  async daten(): Promise<Database> {
    return this.db ?? this.load();
  }

  vergiss(): void {
    this.db = null;
  }
}
