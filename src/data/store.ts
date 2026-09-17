import type { EntityTab } from './schema';
import type { AngebotsDaten, Anschreiben, Database, Einstellungen, EntityMap } from './types';

export interface RecordUpdate<T> {
  id: string;
  changes: Partial<T>;
  /** When set, the update fails with ConflictError if the stored row has a different `geaendert_am`. */
  expectedGeaendertAm?: string;
}

/**
 * The storage boundary. Everything above it (CrmService, UI) is storage-agnostic;
 * moving from Google Sheets to e.g. Supabase means writing another implementation of this interface.
 */
export interface Store {
  load(): Promise<Database>;
  /** Catalogue and offers of the offer tool. Throws SchemaError while its tabs are not set up. */
  loadAngebotsDaten(): Promise<AngebotsDaten>;
  /** Messages of the Contact Generator. Throws SchemaError while its tab is not set up. */
  loadAnschreiben(): Promise<Anschreiben[]>;
  insert<K extends EntityTab>(tab: K, records: EntityMap[K][]): Promise<void>;
  /** All updates of one call are checked first and then written together. */
  update<K extends EntityTab>(tab: K, updates: RecordUpdate<EntityMap[K]>[]): Promise<EntityMap[K][]>;
  saveEinstellungen(values: Einstellungen): Promise<void>;
}
