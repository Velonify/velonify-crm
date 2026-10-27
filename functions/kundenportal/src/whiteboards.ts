import type { Db } from '../../../src/data/postgres/postgresStore';
import { gueltigeDateiId, type WbDatei, type WbElement } from '../../../src/data/whiteboard';
import type { Ablage } from '../../gemeinsam/ablage';

/**
 * Whiteboards in the client portal, stage 1: only boards of the client's own firm that the team switched to
 * "Im Kundenportal zeigen", read-only. Deleted elements and anything about who drew what stay in the hub.
 */

export interface PortalBoard {
  id: string;
  titel: string;
  geaendert_am: string;
  vorschau: string | null;
}

export interface PortalBoardInhalt {
  id: string;
  titel: string;
  elemente: WbElement[];
  /** Ids of the images the portal may load through /whiteboard/<id>/datei/<fileId>. */
  dateien: string[];
}

export async function sichtbareBoards(db: Db, firmaId: string): Promise<PortalBoard[]> {
  const { rows } = await db.query<PortalBoard>(
    `SELECT w.id, w.titel, COALESCE(w.geaendert_am, '') AS geaendert_am, i.vorschau
       FROM whiteboards w LEFT JOIN whiteboard_inhalte i ON i.board_id = w.id
      WHERE w.firma_id = $1 AND w.sichtbar_kunde AND NOT w.archiviert
      ORDER BY w.geaendert_am DESC NULLS LAST`,
    [firmaId],
  );
  return rows.map((r) => ({ ...r, vorschau: r.vorschau ?? null }));
}

export async function boardFuerKunde(db: Db, firmaId: string, id: string): Promise<PortalBoardInhalt | null> {
  const { rows } = await db.query<{ id: string; titel: string; elemente: WbElement[] | null; dateien: Record<string, WbDatei> | null }>(
    `SELECT w.id, w.titel, i.elemente, i.dateien
       FROM whiteboards w LEFT JOIN whiteboard_inhalte i ON i.board_id = w.id
      WHERE w.id = $1 AND w.firma_id = $2 AND w.sichtbar_kunde AND NOT w.archiviert`,
    [id, firmaId],
  );
  const zeile = rows[0];
  if (!zeile) return null;
  const elemente = (zeile.elemente ?? []).filter((e) => !e.isDeleted);
  const benutzt = new Set(elemente.flatMap((e) => (e.type === 'image' && typeof e.fileId === 'string' ? [e.fileId] : [])));
  return { id: zeile.id, titel: zeile.titel, elemente, dateien: Object.keys(zeile.dateien ?? {}).filter((d) => benutzt.has(d)) };
}

/** An image of a visible board, only if the board still uses it. */
export async function dateiFuerKunde(db: Db, ablage: Ablage, firmaId: string, boardId: string, dateiId: string): Promise<{ typ: string; inhalt: Buffer } | null> {
  if (!gueltigeDateiId(dateiId)) return null;
  const board = await boardFuerKunde(db, firmaId, boardId);
  if (!board?.dateien.includes(dateiId)) return null;
  const { rows } = await db.query<{ dateien: Record<string, WbDatei> }>('SELECT dateien FROM whiteboard_inhalte WHERE board_id = $1', [boardId]);
  const eintrag = rows[0]?.dateien?.[dateiId];
  const objekt = eintrag ? await ablage.lies(eintrag.pfad) : null;
  return objekt && eintrag ? { typ: eintrag.mimeType, inhalt: objekt.inhalt } : null;
}
