import { istZustaendig, normalisiereZustaendig, personen } from './zustaendig';
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
/** Name of the internal board: "Velonify intern", in a tenant's hub "<tenant> intern". */
export const internesBoardTitel = (firma?: string | null) => (firma ? `${firma} intern` : INTERNES_BOARD_TITEL);
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
    zustaendig: normalisiereZustaendig(input.zustaendig),
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
  if (filter === 'meine') return istZustaendig(aufgabe.zustaendig, ich);
  if (filter === 'faellig') return ['ueberfaellig', 'heute', 'bald'].includes(faelligkeit(aufgabe, heute));
  return true;
}

/** Open cards of one person across all boards: overdue and due first, then by date, cards without date last. */
export function meineAufgaben(aufgaben: readonly Aufgabe[], boards: readonly Board[], ich: string): Aufgabe[] {
  const aktiv = new Set(boards.filter((b) => !b.archiviert).map((b) => b.id));
  return aufgaben
    .filter((a) => aktiv.has(a.board_id) && !a.archiviert && !istErledigt(a) && istZustaendig(a.zustaendig, ich))
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

// ---------------------------------------------------------------------------------------------------------------
// Overview across all boards

/** The column a card shows in; cards in a column that no longer exists count to the first one, as on the board. */
export function spalteDerKarte(aufgabe: Pick<Aufgabe, 'spalte_id'>, board: Pick<Board, 'spalten'>): Spalte {
  const spalten = spaltenVon(board);
  return spalten.find((s) => s.id === aufgabe.spalte_id) ?? spalten[0];
}

/** Open, not archived cards on active boards. */
export function offeneKarten(aufgaben: readonly Aufgabe[], boards: readonly Board[]): Aufgabe[] {
  const aktiv = new Set(boards.filter((b) => !b.archiviert).map((b) => b.id));
  return aufgaben.filter((a) => aktiv.has(a.board_id) && !a.archiviert && !istErledigt(a));
}

/** Person filter of the overview: a name, everyone, or cards nobody is responsible for. */
export const ALLE = '';
export const NIEMAND = '-';

export interface UebersichtFilter {
  person: string;
  boardId: string;
  suche: string;
}

export function passtUebersicht(aufgabe: Aufgabe, filter: UebersichtFilter): boolean {
  if (filter.boardId && aufgabe.board_id !== filter.boardId) return false;
  if (filter.person === NIEMAND ? personen(aufgabe.zustaendig).length > 0 : filter.person && !istZustaendig(aufgabe.zustaendig, filter.person)) return false;
  const suche = filter.suche.trim().toLocaleLowerCase('de');
  if (suche && ![aufgabe.titel, aufgabe.beschreibung, aufgabe.labels].some((t) => t.toLocaleLowerCase('de').includes(suche))) return false;
  return true;
}

/** Most urgent first: by due date (cards without one last), then by their place on the board. */
export const nachDringlichkeit = (a: Aufgabe, b: Aufgabe) =>
  (a.faellig_am || '9999').localeCompare(b.faellig_am || '9999') || nachSortierung(a, b);

/** Overdue, due today or sent back by the client: what should be looked at before anything else. */
export function brauchtAufmerksamkeit(aufgabe: Aufgabe, heute: string): boolean {
  return ['ueberfaellig', 'heute'].includes(faelligkeit(aufgabe, heute)) || aufgabe.freigabe === 'aenderung';
}

export type Gruppierung = 'status' | 'faelligkeit' | 'board' | 'person';

export interface KartenGruppe {
  id: string;
  titel: string;
  karten: Aufgabe[];
  /** Set when the group stands for one board. */
  board?: Board;
}

export const FAELLIGKEIT_TITEL: Record<Faelligkeit, string> = {
  ueberfaellig: 'Überfällig',
  heute: 'Heute',
  bald: 'Nächste Tage',
  spaeter: 'Später',
  ohne: 'Ohne Datum',
};

/**
 * Groups open cards for the overview. Status merges the columns of all boards by their title (every board starts with
 * the same columns); boards come in display order, people in team order with "Niemand" last. A card with two people
 * shows up under both. Empty groups are left out.
 */
export function gruppiereKarten(
  karten: readonly Aufgabe[],
  gruppierung: Gruppierung,
  { boards, firmen, team, heute }: { boards: readonly Board[]; firmen: readonly Firma[]; team: readonly string[]; heute: string },
): KartenGruppe[] {
  const boardVonKarte = new Map(boards.map((b) => [b.id, b]));
  const gruppen = new Map<string, KartenGruppe>();
  const rein = (id: string, titel: string, a: Aufgabe, board?: Board) => {
    const g = gruppen.get(id) ?? { id, titel, karten: [], ...(board ? { board } : {}) };
    g.karten.push(a);
    gruppen.set(id, g);
  };

  let reihenfolge: string[] = [];
  if (gruppierung === 'status') {
    reihenfolge = STANDARD_SPALTEN.map((s) => s.titel.toLocaleLowerCase('de'));
    for (const a of karten) {
      const board = boardVonKarte.get(a.board_id);
      if (!board) continue;
      const spalte = spalteDerKarte(a, board);
      rein(spalte.titel.toLocaleLowerCase('de'), spalte.titel, a);
    }
  } else if (gruppierung === 'faelligkeit') {
    reihenfolge = Object.keys(FAELLIGKEIT_TITEL);
    for (const a of karten) {
      const f = faelligkeit(a, heute);
      rein(f, FAELLIGKEIT_TITEL[f], a);
    }
  } else if (gruppierung === 'board') {
    reihenfolge = sortiereBoards(boards, firmen).map((b) => b.id);
    for (const a of karten) {
      const board = boardVonKarte.get(a.board_id);
      if (board) rein(board.id, board.titel, a, board);
    }
  } else {
    reihenfolge = [...team, NIEMAND];
    for (const a of karten) {
      const namen = personen(a.zustaendig);
      if (namen.length === 0) rein(NIEMAND, 'Niemand zuständig', a);
      for (const n of namen) rein(n, n, a);
    }
  }

  const rang = (id: string) => {
    const i = reihenfolge.indexOf(id);
    return i < 0 ? reihenfolge.length : i;
  };
  return [...gruppen.values()]
    .sort((a, b) => rang(a.id) - rang(b.id) || a.titel.localeCompare(b.titel, 'de'))
    .map((g) => ({ ...g, karten: [...g.karten].sort(nachDringlichkeit) }));
}

/** Short name of a board for tight spots: the client's Kürzel, "Intern" for the internal board, the name of a free board. */
export function boardKurz(board: Pick<Board, 'firma_id' | 'titel'>, firmen: readonly Firma[]): string {
  if (!board.firma_id) return board.titel && !/(^|\s)intern$/i.test(board.titel.trim()) ? board.titel : 'Intern';
  return firmen.find((f) => f.id === board.firma_id)?.kuerzel || board.titel;
}

// ---------------------------------------------------------------------------------------------------------------
// Overview as a kanban board

export interface KanbanSpalte {
  /** Column id on a single board; the lower-cased title when the columns of several boards are merged. */
  key: string;
  titel: string;
  erledigt: boolean;
  karten: Aufgabe[];
  /** Merged view only: the boards that have this column, when not all of them do. */
  nurBei?: Board[];
}

const titelKey = (titel: string) => titel.trim().toLocaleLowerCase('de');
export const ERLEDIGT_KEY = '#erledigt';

/**
 * Columns for the overview board. With one board they are that board's columns in its own order, cards sorted as on
 * the board. With several boards, columns are merged by title like the status grouping: standard columns first, then
 * the others, the done column last; cards sorted by urgency, and done ones newest first.
 */
export function kanbanSpalten(karten: readonly Aufgabe[], boards: readonly Board[], einzeln?: Board): KanbanSpalte[] {
  const ids = new Set(karten.map((a) => a.id));
  if (einzeln) {
    const gruppen = kartenNachSpalte(karten, einzeln);
    return spaltenVon(einzeln).map((s) => ({ key: s.id, titel: s.titel, erledigt: Boolean(s.erledigt), karten: (gruppen.get(s.id) ?? []).filter((a) => ids.has(a.id)) }));
  }
  const aktiv = boards.filter((b) => !b.archiviert);
  const boardVonKarte = new Map(aktiv.map((b) => [b.id, b]));
  const spalten = new Map<string, KanbanSpalte & { bei: Set<string> }>();
  for (const b of aktiv) {
    for (const s of spaltenVon(b)) {
      const key = s.erledigt ? ERLEDIGT_KEY : titelKey(s.titel);
      const spalte = spalten.get(key) ?? { key, titel: s.erledigt ? 'Erledigt' : s.titel, erledigt: Boolean(s.erledigt), karten: [], bei: new Set<string>() };
      spalte.bei.add(b.id);
      spalten.set(key, spalte);
    }
  }
  for (const a of karten) {
    const board = boardVonKarte.get(a.board_id);
    if (!board) continue;
    const s = spalteDerKarte(a, board);
    spalten.get(s.erledigt || istErledigt(a) ? ERLEDIGT_KEY : titelKey(s.titel))?.karten.push(a);
  }
  const reihenfolge = STANDARD_SPALTEN.filter((s) => !s.erledigt).map((s) => titelKey(s.titel));
  const rang = (s: KanbanSpalte) => (s.erledigt ? Infinity : reihenfolge.includes(s.key) ? reihenfolge.indexOf(s.key) : reihenfolge.length);
  return [...spalten.values()]
    .sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, 'de'))
    .map(({ bei, ...s }) => ({
      ...s,
      karten: s.erledigt ? [...s.karten].sort((a, b) => b.erledigt_am.localeCompare(a.erledigt_am)) : [...s.karten].sort(nachDringlichkeit),
      ...(bei.size < aktiv.length ? { nurBei: aktiv.filter((b) => bei.has(b.id)) } : {}),
    }));
}

/** The column of `board` a card lands in when dropped on the overview column `key`; undefined if the board has none. */
export function spalteFuerKey(board: Board, key: string, einzeln: boolean): Spalte | undefined {
  const spalten = spaltenVon(board);
  if (einzeln) return spalten.find((s) => s.id === key);
  if (key === ERLEDIGT_KEY) return erledigtSpalte(spalten);
  return spalten.find((s) => !s.erledigt && titelKey(s.titel) === key);
}
