import type { Modul } from './modul';

/**
 * Modul Content (Bauplan Abschnitt 11, Punkte 7–11, 30): Content-Plan je Kanal (Tabelle inhalte), Recherche-Assistent,
 * Skripte/Titel/Hooks, Thumbnail-Briefings, Upload-Hygiene mit Werbekennzeichnung und Impressum-Link.
 * Paths: /c/content/…, timed job "recherche" (weekly).
 */
export const contentModul: Modul = { praefix: 'content' };
