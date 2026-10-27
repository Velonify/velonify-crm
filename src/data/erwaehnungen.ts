import type { Erwaehnung } from './types';

/**
 * @-mentions: "@Julian" in a comment, card or note tags a member of the team list. Names are matched case-insensitively
 * and only as a whole word, the longest name first, so "@Jo" never tags "Johannes" and "@Anna Lena" wins over "@Anna".
 */

const BUCHSTABE = /[\p{L}\p{N}_]/u;

export interface Textteil {
  text: string;
  /** Set when the part is a mention: the team name it tags. */
  person?: string;
}

/** Splits a text into plain parts and mentions, for highlighting. */
export function textTeile(text: string, team: readonly string[]): Textteil[] {
  const namen = [...team].filter(Boolean).sort((a, b) => b.length - a.length);
  const teile: Textteil[] = [];
  let rest = 0;
  let i = text.indexOf('@');
  while (i !== -1) {
    const davor = i > 0 ? text[i - 1] : '';
    const person = davor && BUCHSTABE.test(davor) ? undefined : namen.find((n) => passtAn(text, i + 1, n));
    if (person) {
      if (i > rest) teile.push({ text: text.slice(rest, i) });
      teile.push({ text: text.slice(i, i + 1 + person.length), person });
      rest = i + 1 + person.length;
    }
    i = text.indexOf('@', person ? rest : i + 1);
  }
  if (rest < text.length) teile.push({ text: text.slice(rest) });
  return teile;
}

function passtAn(text: string, start: number, name: string): boolean {
  if (text.slice(start, start + name.length).toLowerCase() !== name.toLowerCase()) return false;
  const danach = text[start + name.length];
  return !danach || !BUCHSTABE.test(danach);
}

/** The team members tagged in a text, each once, in order of appearance. */
export function erwaehnteNamen(text: string, team: readonly string[]): string[] {
  return [...new Set(textTeile(text, team).flatMap((t) => (t.person ? [t.person] : [])))];
}

/** Members tagged in the new text but not yet in the old one: editing a note only notifies about added mentions. */
export function neuErwaehnt(alt: string, neu: string, team: readonly string[]): string[] {
  const vorher = new Set(erwaehnteNamen(alt, team));
  return erwaehnteNamen(neu, team).filter((n) => !vorher.has(n));
}

/** The text around the first mention of the person, at most `laenge` characters, on one line. */
export function auszug(text: string, person: string, laenge = 180): string {
  const flach = text.replace(/\s+/g, ' ').trim();
  if (flach.length <= laenge) return flach;
  const stelle = Math.max(0, flach.toLowerCase().indexOf(`@${person.toLowerCase()}`));
  const start = Math.max(0, Math.min(stelle - 40, flach.length - laenge));
  return `${start > 0 ? '…' : ''}${flach.slice(start, start + laenge).trim()}${start + laenge < flach.length ? '…' : ''}`;
}

/** The open "@…" being typed right before the cursor, e.g. "@Ju" → { start, suche: "Ju" }; null when there is none. */
export function offeneErwaehnung(text: string, cursor: number): { start: number; suche: string } | null {
  const vorher = text.slice(0, cursor);
  const treffer = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_-]{0,30})$/u.exec(vorher);
  return treffer ? { start: cursor - treffer[2].length - 1, suche: treffer[2] } : null;
}

/** Team members matching what is typed after "@": names starting with it first, then names containing it. */
export function vorschlaege(team: readonly string[], suche: string): string[] {
  const s = suche.toLowerCase();
  const anfang = team.filter((n) => n.toLowerCase().startsWith(s));
  return [...anfang, ...team.filter((n) => !anfang.includes(n) && n.toLowerCase().includes(s))];
}

/** Unread mentions of a person, newest first. */
export function ungelesene(erwaehnungen: readonly Erwaehnung[], person: string | null): Erwaehnung[] {
  return person ? meine(erwaehnungen, person).filter((e) => !e.gelesen_am) : [];
}

/** All mentions of a person, newest first. */
export function meine(erwaehnungen: readonly Erwaehnung[], person: string | null): Erwaehnung[] {
  return person ? erwaehnungen.filter((e) => e.person === person).sort((a, b) => b.datum.localeCompare(a.datum)) : [];
}

export const ART_LABEL: Record<Erwaehnung['art'], string> = {
  kommentar: 'Kommentar',
  karte: 'Karte',
  verlauf: 'Verlauf',
  firma: 'Firmen-Notiz',
  kontakt: 'Kontakt-Notiz',
  news: 'Kunden-News',
  whiteboard: 'Whiteboard',
};

export const kartenLink = (boardId: string, aufgabeId: string, kommentarId?: string) => `/todo/${boardId}?karte=${aufgabeId}${kommentarId ? `&kommentar=${kommentarId}` : ''}`;
export const whiteboardLink = (boardId: string, kommentarId?: string) => `/whiteboard/${boardId}${kommentarId ? `?kommentar=${kommentarId}` : ''}`;
export const firmenLink = (firmaId: string) => `/crm/firmen/${firmaId}`;
export const kundenLink = (firmaId: string) => (firmaId ? `/kunden/${firmaId}` : '/kunden');
