import { addDays } from './ids';
import type { WordleErgebnis } from './types';

/*
 * Daily word game on the start page: everyone gets the same five-letter word per day, six attempts.
 * Only the colour pattern of each attempt is stored in the sheet, never the letters, so results do not spoil the word.
 */

export const WORT_LAENGE = 5;
export const MAX_VERSUCHE = 6;
/** Day #1 of the game. */
export const START_TAG = '2026-09-19';

/** Solutions: words from agency and shop life, without umlauts so every letter has its own key. */
const WOERTER = [
  'KUNDE', 'PREIS', 'LAGER', 'PAKET', 'KASSE', 'MARKE', 'PIXEL', 'LOGIN', 'THEME', 'CACHE',
  'DEBUG', 'ADMIN', 'EMAIL', 'MERGE', 'PATCH', 'ASSET', 'BADGE', 'BRAND', 'CLICK', 'LEADS',
  'DEALS', 'BONUS', 'KONTO', 'SUMME', 'WAREN', 'FIRMA', 'SLACK', 'SHOPS', 'MODUL', 'DATEN',
  'LISTE', 'MAILS', 'BRIEF', 'NOTIZ', 'IDEEN', 'ZIELE', 'FOKUS', 'TEMPO', 'PAUSE', 'WOCHE',
  'MONAT', 'FRIST', 'DATUM', 'TASTE', 'ROUTE', 'LINKS', 'SEITE', 'FOTOS', 'VIDEO', 'AUDIO',
  'FARBE', 'SKALA', 'TREND', 'KURVE', 'WERTE', 'QUOTE', 'SCORE', 'LEVEL', 'PUNKT', 'MEDIA',
  'STORY', 'POSTS', 'REELS', 'LIKES', 'SHARE', 'TEXTE', 'WORTE', 'HALLO', 'DANKE', 'BITTE',
  'GRUSS', 'KARTE', 'REISE', 'STADT', 'PORTO', 'RESET', 'BUILD', 'STACK', 'QUERY', 'TOKEN',
  'SCOPE', 'SHEET', 'ZELLE', 'ZEILE', 'LABEL', 'MODAL', 'INPUT', 'HOVER', 'CHART', 'LOGOS',
  'PITCH', 'FLYER', 'MESSE', 'PROBE', 'TESTS', 'BLATT', 'SONNE', 'LICHT', 'BLUME', 'SAMEN',
  'STAND', 'SIEGE', 'ORDER', 'FONTS', 'RASEN', 'KRAFT', 'BLICK', 'PLANE', 'RADAR', 'ANKER',
];

/** Seeded shuffle, so the order of the list above does not give away tomorrow's word. */
function mische<T>(liste: readonly T[], seed: number): T[] {
  const ergebnis = [...liste];
  let s = seed >>> 0;
  const zufall = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = ergebnis.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [ergebnis[i], ergebnis[j]] = [ergebnis[j], ergebnis[i]];
  }
  return ergebnis;
}

const REIHENFOLGE = mische(WOERTER, 20260919);

/** Days between two ISO dates, independent of daylight saving. */
function tageZwischen(von: string, bis: string): number {
  const utc = (tag: string) => {
    const [y, m, d] = tag.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(bis) - utc(von)) / 86_400_000);
}

/** Puzzle number shown to players: 1 on the start day. */
export const raetselNummer = (tag: string) => tageZwischen(START_TAG, tag) + 1;

export function wortDesTages(tag: string): string {
  const n = REIHENFOLGE.length;
  return REIHENFOLGE[(((raetselNummer(tag) - 1) % n) + n) % n];
}

/** g = right letter in the right place, y = in the word elsewhere, x = not in the word. */
export type Feld = 'g' | 'y' | 'x';

/**
 * Colours of one attempt. Double letters count like in the original: a letter is marked yellow only as often
 * as it is still left over in the solution after the green ones.
 */
export function bewerte(versuch: string, loesung: string): Feld[] {
  const felder: Feld[] = Array(loesung.length).fill('x');
  const uebrig = new Map<string, number>();
  for (let i = 0; i < loesung.length; i++) {
    if (versuch[i] === loesung[i]) felder[i] = 'g';
    else uebrig.set(loesung[i], (uebrig.get(loesung[i]) ?? 0) + 1);
  }
  for (let i = 0; i < loesung.length; i++) {
    if (felder[i] === 'g') continue;
    const rest = uebrig.get(versuch[i]) ?? 0;
    if (rest > 0) {
      felder[i] = 'y';
      uebrig.set(versuch[i], rest - 1);
    }
  }
  return felder;
}

/** Best known colour per letter, for the on-screen keyboard. */
export function tastenFarben(versuche: readonly string[], loesung: string): Map<string, Feld> {
  const rang: Record<Feld, number> = { x: 0, y: 1, g: 2 };
  const farben = new Map<string, Feld>();
  for (const versuch of versuche) {
    bewerte(versuch, loesung).forEach((feld, i) => {
      const bisher = farben.get(versuch[i]);
      if (!bisher || rang[feld] > rang[bisher]) farben.set(versuch[i], feld);
    });
  }
  return farben;
}

/** Letters the keyboard accepts; the rest (umlauts, digits) is ignored. */
export const normalisiere = (eingabe: string) => eingabe.toUpperCase().replace(/[^A-Z]/g, '');

/** Stored pattern: one group per attempt, e.g. "xyxgx/ggggg". */
export const muster = (versuche: readonly string[], loesung: string) => versuche.map((v) => bewerte(v, loesung).join('')).join('/');
export const musterZeilen = (wert: string): Feld[][] => (wert ? wert.split('/').map((zeile) => [...zeile].filter((c): c is Feld => c === 'g' || c === 'y' || c === 'x')) : []);

/** Text for Slack: the colour pattern as squares, without letters. */
export function teilenText(tag: string, ergebnis: Pick<WordleErgebnis, 'geloest' | 'versuche' | 'muster'>): string {
  const quadrat: Record<Feld, string> = { g: '🟩', y: '🟨', x: '⬜' };
  const zeilen = musterZeilen(ergebnis.muster).map((zeile) => zeile.map((f) => quadrat[f]).join(''));
  return [`Velonify-Wort #${raetselNummer(tag)} ${ergebnis.geloest ? ergebnis.versuche : 'X'}/${MAX_VERSUCHE}`, '', ...zeilen].join('\n');
}

const istWerktag = (tag: string) => {
  const [y, m, d] = tag.split('-').map(Number);
  const wochentag = new Date(y, m - 1, d).getDay();
  return wochentag !== 0 && wochentag !== 6;
};

export interface Spielerstand {
  spieler: string;
  /** Solved workdays in a row; weekends neither count nor break the series. */
  serie: number;
  gespielt: number;
  geloest: number;
  /** Average attempts over solved games, null before the first one. */
  schnitt: number | null;
  heute: WordleErgebnis | undefined;
}

/**
 * Standings of the team. The series runs back from today; an unsolved or missing workday ends it, but today
 * still being open does not.
 */
export function rangliste(ergebnisse: readonly WordleErgebnis[], team: readonly string[], heute: string): Spielerstand[] {
  const spieler = [...new Set([...team, ...ergebnisse.map((e) => e.spieler)])];
  return spieler
    .map((name) => {
      const eigene = ergebnisse.filter((e) => e.spieler === name && e.datum <= heute);
      const jeTag = new Map(eigene.map((e) => [e.datum, e]));
      let serie = 0;
      let tag = jeTag.has(heute) ? heute : addDays(heute, -1);
      // Nothing before the first game can extend the series.
      const erster = eigene.reduce((min, e) => (e.datum < min ? e.datum : min), heute);
      while (tag >= erster) {
        const e = jeTag.get(tag);
        if (e?.geloest) serie++;
        else if (e || istWerktag(tag)) break;
        tag = addDays(tag, -1);
      }
      const geloeste = eigene.filter((e) => e.geloest);
      return {
        spieler: name,
        serie,
        gespielt: eigene.length,
        geloest: geloeste.length,
        schnitt: geloeste.length > 0 ? geloeste.reduce((s, e) => s + e.versuche, 0) / geloeste.length : null,
        heute: jeTag.get(heute),
      };
    })
    .sort((a, b) => {
      // Today's result first (solved, then fewer attempts), then series.
      const wert = (s: Spielerstand) => (s.heute ? (s.heute.geloest ? s.heute.versuche : MAX_VERSUCHE + 1) : MAX_VERSUCHE + 2);
      return wert(a) - wert(b) || b.serie - a.serie || a.spieler.localeCompare(b.spieler, 'de');
    });
}
