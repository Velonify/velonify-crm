import type { Antwort } from '../routen';
import type { InstanzDienste } from '../instanz';
import type { Modul } from './modul';

/**
 * Modul Steuerung (Bauplan Abschnitt 3, Punkte 31–32). Two parts:
 * - /steuerung/* for Velonify's hub, with STEUER_TOKEN (checked in index.ts): status, building blocks and news of the
 *   instance, only metadata, never content.
 * - /c/start/… for the instance's own Home page (this week, approvals, numbers, news).
 */
export async function behandleSteuerung(methode: string, pfad: string, body: unknown, dienste: InstanzDienste): Promise<Antwort> {
  void methode;
  void body;
  void dienste;
  return { status: 404, daten: { fehler: `Unbekannte Route ${pfad}.` } };
}

export const startModul: Modul = { praefix: 'start' };
