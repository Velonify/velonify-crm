import type { Modul } from './modul';

/**
 * Modul Kooperationen und Einnahmen (Bauplan Abschnitt 11, Punkte 21–28): interne Übersicht, Pipeline mit Wiedervorlage,
 * Anfrageformular, Live-Mediakit, Partner-Reporting, Einnahmen-Übersicht mit EUR/JPY und Dashboards.
 * Paths: /c/kooperationen/…, /c/einnahmen/…, public /oeffentlich/kooperationen/… (form, media kit, report links).
 */
export const kooperationenModul: Modul = { praefix: 'kooperationen' };
export const einnahmenModul: Modul = { praefix: 'einnahmen' };
