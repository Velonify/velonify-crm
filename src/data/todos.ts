import { ValidationError } from './errors';
import { addDays, isIsoDate } from './ids';
import type { Aufgabe, AufgabeInput, Board, ChecklistenPunkt, Firma, Spalte } from './types';

/** Columns every new board starts with; renamed, reordered or extended per board afterwards. */
export const STANDARD_SPALTEN: Spalte[] = [
  { id: 'backlog', titel: 'Backlog' },
  { id: 'woche', titel: 'Diese Woche' },
  { id: 'arbeit', titel: 'In Arbeit' },
  { id: 'wartet', titel: 'Wartet auf Kunde' },
  { id: 'erledigt', titel: 'Erledigt', erledigt: true },
];

export const INTERNES_BOARD_TITEL = 'Velonify intern';
/** Cards due within this many days count as "fällig" in filters and on Home. */
export const BALD_FAELLIG_TAGE = 2;

/** Columns of a board; broken or empty JSON falls back to the standard columns so a board never disappears. */
export function spaltenVon(board: Pick<Board, 'spalten'>): Spalte[] {
  try {
    const roh: unknown = JSON.parse(board.spalten || '[]');
    if (!Array.isArray(roh)) return STANDARD_SPALTEN;
    const spalten = roh
      .filter((s): s is Spalte => Boolean(s) && typeof s.id === 'string' && typeof s.titel === 'string' && s.id.trim() !== '')
      .map((s) => ({ id: s.id, titel: s.titel, ...(s.erledigt ? { erledigt: true } : {}) }));
    return spalten.length > 0 ? spalten : STANDARD_SPALTEN;
  } catch {
    return STANDARD_SPALTEN;
  }
}

export const erledigtSpalte = (spalten: readonly Spalte[]) => spalten.find((s) => s.erledigt);

/** Validates edited columns: unique ids, titles, exactly one done column at most. */
export function prepareSpalten(spalten: readonly Spalte[]): Spalte[] {
  const clean = spalten.map((s) => ({ id: s.id.trim(), titel: s.titel.trim(), ...(s.erledigt ? { erledigt: true } : {}) }));
  if (clean.length === 0) throw new ValidationError('spalten', 'Ein Board braucht mindestens eine Spalte.');
  if (clean.some((s) => !s.titel)) throw new ValidationError('spalten', 'Jede Spalte braucht einen Namen.');
  if (new Set(clean.map((s) => s.id)).size !== clean.length) throw new ValidationError('spalten', 'Zwei Spalten haben dieselbe Kennung.');
  if (clean.filter((s) => s.erledigt).length > 1) throw new ValidationError('spalten', 'Nur eine Spalte kann „Erledigt“ sein.');
  return clean;
}

/** Id for a new column from its title, unique within the board. */
export function neueSpaltenId(titel: string, vorhanden: readonly Spalte[]): string {
  const basis =
    titel
      .toLocaleLowerCase('de')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'spalte';
  let id = basis;
  for (let n = 2; vorhanden.some((s) => s.id === id); n++) id = `${basis}-${n}`;
  return id;
}

export function checklisteVon(aufgabe: Pick<Aufgabe, 'checkliste'>): ChecklistenPunkt[] {
  try {
    const roh: unknown = JSON.parse(aufgabe.checkliste || '[]');
    return Array.isArray(roh) ? roh.filter((p) => p && typeof p.text === 'string').map((p) => ({ text: p.text, erledigt: Boolean(p.erledigt) })) : [];
  } catch {
    return [];
  }
}

export const labelsVon = (aufgabe: Pick<Aufgabe, 'labels'>) =>
  aufgabe.labels
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);

export function prepareKarte(input: AufgabeInput): AufgabeInput {
  const titel = input.titel.trim();
  if (!titel) throw new ValidationError('titel', 'Bitte einen Titel eintragen.');
  if (titel.length > 200) throw new ValidationError('titel', 'Der Titel darf höchstens 200 Zeichen lang sein – Details gehören in die Beschreibung.');
  const faellig_am = input.faellig_am.trim();
  if (faellig_am && !isIsoDate(faellig_am)) throw new ValidationError('faellig_am', 'Bitte ein gültiges Datum wählen.');
  const labels = [...new Set(labelsVon(input))].join(', ');
  const punkte = checklisteVon(input).map((p) => ({ text: p.text.trim(), erledigt: p.erledigt })).filter((p) => p.text);
  const quelleLink = (input.quelle_link ?? '').trim();
  if (quelleLink && !/^https?:\/\//.test(quelleLink)) throw new ValidationError('quelle_link', 'Der Link muss mit https:// anfangen.');
  return {
    ...input,
    titel,
    beschreibung: input.beschreibung.trim(),
    zustaendig: input.zustaendig.trim(),
    faellig_am,
    labels,
    checkliste: punkte.length > 0 ? JSON.stringify(punkte) : '',
    quelle_link: quelleLink,
  };
}

/** Sort value between two neighbours; either may be missing at the start or end of a column. */
export function sortierungZwischen(vorher: number | null | undefined, nachher: number | null | undefined): number {
  const a = vorher ?? null;
  const b = nachher ?? null;
  if (a === null && b === null) return 1000;
  if (a === null) return b! - 1000;
  if (b === null) return a + 1000;
  return (a + b) / 2;
}

const nachSortierung = (a: Aufgabe, b: Aufgabe) => (a.sortierung ?? 0) - (b.sortierung ?? 0) || a.erstellt_am.localeCompare(b.erstellt_am);

/** Cards of one board grouped by column; cards in a column that no longer exists land in the first one. */
export function kartenNachSpalte(aufgaben: readonly Aufgabe[], board: Board): Map<string, Aufgabe[]> {
  const spalten = spaltenVon(board);
  const gruppen = new Map(spalten.map((s) => [s.id, [] as Aufgabe[]]));
  for (const a of aufgaben) {
    if (a.board_id !== board.id || a.archiviert) continue;
    (gruppen.get(a.spalte_id) ?? gruppen.get(spalten[0].id)!).push(a);
  }
  for (const liste of gruppen.values()) liste.sort(nachSortierung);
  return gruppen;
}

/** Sort value for a card dropped at `index` of a column (index counted without the card itself). */
export function sortierungFuerPosition(spalte: readonly Aufgabe[], aufgabeId: string, index: number): number {
  const andere = spalte.filter((a) => a.id !== aufgabeId);
  const i = Math.max(0, Math.min(index, andere.length));
  return sortierungZwischen(andere[i - 1]?.sortierung, andere[i]?.sortierung);
}

export const istErledigt = (aufgabe: Pick<Aufgabe, 'erledigt_am'>) => aufgabe.erledigt_am !== '';

export type Faelligkeit = 'ueberfaellig' | 'heute' | 'bald' | 'spaeter' | 'ohne';

export function faelligkeit(aufgabe: Pick<Aufgabe, 'faellig_am' | 'erledigt_am'>, heute: string): Faelligkeit {
  if (!aufgabe.faellig_am || istErledigt(aufgabe)) return 'ohne';
  if (aufgabe.faellig_am < heute) return 'ueberfaellig';
  if (aufgabe.faellig_am === heute) return 'heute';
  return aufgabe.faellig_am <= addDays(heute, BALD_FAELLIG_TAGE) ? 'bald' : 'spaeter';
}

export type KartenFilter = 'alle' | 'meine' | 'faellig';

export function passtFilter(aufgabe: Aufgabe, filter: KartenFilter, ich: string | null, heute: string): boolean {
  if (filter === 'meine') return Boolean(ich) && aufgabe.zustaendig === ich;
  if (filter === 'faellig') return ['ueberfaellig', 'heute', 'bald'].includes(faelligkeit(aufgabe, heute));
  return true;
}

/** Open cards of one person across all boards: overdue and due first, then by date, cards without date last. */
export function meineAufgaben(aufgaben: readonly Aufgabe[], boards: readonly Board[], ich: string): Aufgabe[] {
  const aktiv = new Set(boards.filter((b) => !b.archiviert).map((b) => b.id));
  return aufgaben
    .filter((a) => aktiv.has(a.board_id) && !a.archiviert && !istErledigt(a) && a.zustaendig === ich)
    .sort((a, b) => (a.faellig_am || '9999').localeCompare(b.faellig_am || '9999') || a.titel.localeCompare(b.titel, 'de'));
}

/** The board of a client, or the internal board for an empty firm id. */
export const boardVon = (boards: readonly Board[], firmaId: string) => boards.find((b) => !b.archiviert && b.firma_id === firmaId);

/** Boards in display order: the internal one first, then clients by Kürzel. */
export function sortiereBoards(boards: readonly Board[], firmen: readonly Firma[]): Board[] {
  const kuerzel = (b: Board) => firmen.find((f) => f.id === b.firma_id)?.kuerzel || b.titel;
  return boards.filter((b) => !b.archiviert).sort((a, b) => Number(Boolean(a.firma_id)) - Number(Boolean(b.firma_id)) || kuerzel(a).localeCompare(kuerzel(b), 'de'));
}

export const boardTitelFuer = (firma: Firma) => (firma.kuerzel ? `${firma.kuerzel} · ${firma.name}` : firma.name);

/** Cards of a client board that were finished recently, for the client hub ticker. */
export function kuerzlichErledigt(aufgaben: readonly Aufgabe[], boardId: string, seit: string): Aufgabe[] {
  return aufgaben.filter((a) => a.board_id === boardId && !a.archiviert && istErledigt(a) && a.erledigt_am.slice(0, 10) >= seit);
}
