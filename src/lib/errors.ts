import { ConflictError } from '../data/errors';
import { formatDateTime, shortUser } from './format';

export function errorMessage(error: unknown): string {
  if (error instanceof ConflictError) {
    const wer = error.geaendertVon ? shortUser(error.geaendertVon) : 'Jemand anderes';
    return `${wer} hat diesen Eintrag am ${formatDateTime(error.geaendertAm)} geändert, nachdem du ihn geöffnet hast. Die Daten sind jetzt neu geladen – bitte die Änderung noch einmal machen.`;
  }
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}

export const fieldOf = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'field' in error ? String((error as { field: unknown }).field) : undefined;
