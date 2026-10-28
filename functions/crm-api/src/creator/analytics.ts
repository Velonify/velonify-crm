import type { Modul } from './modul';

/**
 * Modul Kanäle und Analytics (Bauplan Abschnitt 11, Punkte 12–20): OAuth und täglicher Abruf für YouTube, Instagram,
 * TikTok, Twitch; TikTok-Studio-Export; Beispielzahlen; Merkmale per Claude; Wochen-/Monatsbericht mit Ableitungen;
 * Benchmarking; Twitch-Repurposing. Paths: /c/analytics/…, public /oeffentlich/analytics/… (OAuth callbacks),
 * timed jobs "abruf" (daily), "berichte" (weekly/monthly).
 */
export const analyticsModul: Modul = { praefix: 'analytics' };
