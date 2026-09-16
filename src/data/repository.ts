import type { Firma, FirmaInput, Listen } from './types';

/**
 * The only way the UI touches data. Today backed by Google Sheets (or demo data);
 * moving to another database means writing a new implementation of this interface.
 */
export interface Repository {
  listFirmen(options?: { fresh?: boolean }): Promise<Firma[]>;
  /** Throws NotFoundError. */
  getFirma(id: string): Promise<Firma>;
  createFirma(input: FirmaInput): Promise<Firma>;
  /** Throws ConflictError if the row changed since `expectedGeaendertAm` was loaded. */
  updateFirma(id: string, changes: Partial<FirmaInput>, expectedGeaendertAm: string): Promise<Firma>;
  setFirmaArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Firma>;
  getListen(): Promise<Listen>;
}
