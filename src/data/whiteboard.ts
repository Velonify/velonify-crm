/**
 * Whiteboard rules shared by the hub, crm-api and the client portal: merging drawings without losing anything,
 * checking what clients send, and the order of frames when presenting. No Excalidraw import here – crm-api and the
 * portal function must not pull the editor in; the element type below is the part of Excalidraw's they rely on.
 */

/** The fields of an Excalidraw element that merging needs; everything else is carried along untouched. */
export interface WbElement {
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  /** Fractional index (Excalidraw ≥ 0.18): elements are stacked in plain string order of it. */
  index?: string | null;
  /** Last change, ms since 1970. */
  updated?: number;
  [feld: string]: unknown;
}

/** An image of a board: where it lives in the bucket. */
export interface WbDatei {
  mimeType: string;
  pfad: string;
  groesse: number;
  erstellt: number;
}

export interface WbInhalt {
  elemente: WbElement[];
  dateien: Record<string, WbDatei>;
  /** Counts every save, so a client can tell whether it has seen the latest one. */
  stand: number;
}

/** Larger drawings are refused; a board with hundreds of stickies stays far below. */
export const MAX_INHALT_BYTES = 10 * 1024 * 1024;
export const MAX_DATEI_BYTES = 8 * 1024 * 1024;
export const MAX_VORSCHAU_ZEICHEN = 80_000;
export const BILD_TYPEN = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] as const;
/** Deleted elements are kept this long so late changes of others cannot bring them back, then they are dropped. */
const GELOESCHT_BEHALTEN_MS = 14 * 86_400_000;

/** Whether `a` wins over `b` for the same element: higher version, on a tie the lower nonce (Excalidraw's own rule). */
export function gewinnt(a: WbElement, b: WbElement): boolean {
  return a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);
}

/** Plain string order, which is what fractional indices are made for (not localeCompare). */
const nachIndex = (a: WbElement, b: WbElement) => {
  const x = a.index ?? '';
  const y = b.index ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Merges what a client sends into what is stored, element by element: the newer version of each element wins, elements
 * only one side has are kept. Two tabs saving at the same time therefore lose nothing. Long-deleted elements are dropped.
 */
export function fuehreZusammen(gespeichert: readonly WbElement[], neu: readonly WbElement[], jetzt = Date.now()): WbElement[] {
  const nachId = new Map<string, WbElement>();
  for (const e of gespeichert) nachId.set(e.id, e);
  for (const e of neu) {
    const alt = nachId.get(e.id);
    if (!alt || gewinnt(e, alt)) nachId.set(e.id, e);
  }
  const alle = [...nachId.values()].filter((e) => !(e.isDeleted && typeof e.updated === 'number' && jetzt - e.updated > GELOESCHT_BEHALTEN_MS));
  return alle.every((e) => typeof e.index === 'string') ? alle.sort(nachIndex) : alle;
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);

/** The elements of a request, or null when anything does not look like an Excalidraw element. */
export function pruefeElemente(wert: unknown): WbElement[] | null {
  if (!Array.isArray(wert)) return null;
  for (const e of wert) {
    if (!istObjekt(e) || typeof e.id !== 'string' || !e.id || e.id.length > 100 || typeof e.type !== 'string') return null;
    if (typeof e.version !== 'number' || typeof e.versionNonce !== 'number') return null;
  }
  return wert as WbElement[];
}

/** File ids come from Excalidraw (40 hex characters) or our own tests; nothing that could leave the board's folder. */
export const gueltigeDateiId = (id: string) => /^[A-Za-z0-9_-]{8,80}$/.test(id);

/** Object path of a board's image in the bucket. */
export const dateiPfad = (boardId: string, dateiId: string) => `boards/${boardId}/${dateiId}`;

/** Frames in presentation order: "1 Start", "2 Ziel" … by leading number, the rest left to right, then top to bottom. */
export function frameReihenfolge<T extends { name?: string | null; x: number; y: number; isDeleted?: boolean; type: string }>(elemente: readonly T[]): T[] {
  const frames = elemente.filter((e) => (e.type === 'frame' || e.type === 'magicframe') && !e.isDeleted);
  const nummer = (f: T) => {
    const treffer = /^\s*(\d+)/.exec(f.name ?? '');
    return treffer ? Number(treffer[1]) : Number.POSITIVE_INFINITY;
  };
  // Frames in one row (less than 200 px apart vertically) count as side by side.
  return [...frames].sort((a, b) => nummer(a) - nummer(b) || (Math.abs(a.y - b.y) < 200 ? a.x - b.x : a.y - b.y));
}

/** Boards of a firm, newest change first; without archived ones unless asked. */
export function boardsDerFirma<T extends { firma_id: string; archiviert: boolean; geaendert_am: string }>(boards: readonly T[], firmaId: string, mitArchiv = false): T[] {
  return boards.filter((b) => b.firma_id === firmaId && (mitArchiv || !b.archiviert)).sort((a, b) => b.geaendert_am.localeCompare(a.geaendert_am));
}
