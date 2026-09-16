import { ConflictError } from '../data/errors';
import { formatDateTime, shortUser } from './format';

export function errorMessage(error: unknown): string {
  if (error instanceof ConflictError) {
    const wer = error.geaendertVon ? shortUser(error.geaendertVon) : 'jemand anderes';
    return `${wer} hat diesen Eintrag am ${formatDateTime(error.geaendertAm)} geändert, nachdem du ihn geöffnet hast. Lade neu, um den aktuellen Stand zu sehen – deine Eingaben bleiben so lange im Formular.`;
  }
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}
