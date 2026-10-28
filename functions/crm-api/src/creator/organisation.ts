import type { Modul } from './modul';

/**
 * Modul Organisation (Bauplan Abschnitt 11, Punkte 2, 3, 5, 6, 27, 29): Kalender mit Fristen (Tabelle fristen, ICS-Abo),
 * feste Ablagestruktur in Google Drive (drive.file), Partnerzugänge (Einrichtung), Passwortmanager-Empfehlung.
 * Paths: /c/kalender/…, /c/ablage/…, public /oeffentlich/kalender/… (ICS feed with secret token).
 */
export const kalenderModul: Modul = { praefix: 'kalender' };
export const ablageModul: Modul = { praefix: 'ablage' };
