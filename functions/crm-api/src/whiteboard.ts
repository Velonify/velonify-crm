import { BILD_TYPEN, dateiPfad, fuehreZusammen, gueltigeDateiId, MAX_DATEI_BYTES, MAX_INHALT_BYTES, MAX_VORSCHAU_ZEICHEN, pruefeElemente, type WbDatei, type WbElement } from '../../../src/data/whiteboard';
import type { Db, DbPool } from '../../../src/data/postgres/postgresStore';
import type { Antwort } from './routen';
import type { Ablage } from '../../gemeinsam/ablage';

export { cloudStorage, speicherAblage, type Ablage } from '../../gemeinsam/ablage';

/** A binary answer (an image) instead of JSON. */
export interface DateiAntwort {
  status: 200;
  typ: string;
  inhalt: Buffer;
}

const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });

interface InhaltZeile {
  elemente: WbElement[];
  dateien: Record<string, WbDatei>;
  stand: string | number;
}

async function boardDa(db: Db, id: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM whiteboards WHERE id = $1', [id]);
  return rows.length > 0;
}

export interface WhiteboardKontext {
  pool: DbPool;
  ablage: Ablage;
  email: string;
  /** Body of the request exactly as sent, for image uploads. */
  roh?: Buffer;
  /** Content-Type of the request. */
  typ?: string;
}

/**
 * The drawing and the images of a board, outside the generic tables because of their size:
 * GET /whiteboard/vorschauen, GET|POST /whiteboard/<id>/inhalt, GET|POST /whiteboard/<id>/datei/<fileId>.
 * Saving merges element by element (see fuehreZusammen) in one transaction with the row locked, so parallel saves of
 * two tabs both arrive. Returns null for paths outside /whiteboard.
 */
export async function behandleWhiteboard(methode: string, pfad: string, body: unknown, ctx: WhiteboardKontext): Promise<Antwort | DateiAntwort | null> {
  if (!pfad.startsWith('/whiteboard/')) return null;
  const { pool } = ctx;

  if (pfad === '/whiteboard/vorschauen') {
    if (methode !== 'GET') return fehler(405, 'Nur GET.');
    const { rows } = await pool.query<{ board_id: string; vorschau: string }>(
      'SELECT i.board_id, i.vorschau FROM whiteboard_inhalte i JOIN whiteboards w ON w.id = i.board_id WHERE NOT w.archiviert AND i.vorschau IS NOT NULL',
    );
    return { status: 200, daten: { vorschauen: Object.fromEntries(rows.map((r) => [r.board_id, r.vorschau])) } };
  }

  const inhalt = /^\/whiteboard\/([A-Z0-9-]{1,40})\/inhalt$/.exec(pfad);
  if (inhalt) {
    const id = inhalt[1];
    if (methode === 'GET') {
      if (!(await boardDa(pool, id))) return fehler(404, 'Dieses Whiteboard gibt es nicht.');
      const { rows } = await pool.query<InhaltZeile>('SELECT elemente, dateien, stand FROM whiteboard_inhalte WHERE board_id = $1', [id]);
      const zeile = rows[0];
      return { status: 200, daten: { elemente: zeile?.elemente ?? [], dateien: zeile?.dateien ?? {}, stand: Number(zeile?.stand ?? 0) } };
    }
    if (methode !== 'POST') return fehler(405, 'Nur GET oder POST.');
    const daten = body as { elemente?: unknown; vorschau?: unknown } | null;
    const elemente = pruefeElemente(daten?.elemente);
    if (!elemente) return fehler(400, 'Inhalt ungültig.');
    if (Buffer.byteLength(JSON.stringify(elemente)) > MAX_INHALT_BYTES) return fehler(413, 'Das Whiteboard ist zu groß zum Speichern. Bitte große Freihand-Flächen oder Bilder entfernen.');
    const vorschau = typeof daten?.vorschau === 'string' && daten.vorschau.startsWith('data:image/') && daten.vorschau.length <= MAX_VORSCHAU_ZEICHEN ? daten.vorschau : null;
    return pool.transaktion(async (db) => {
      if (!(await boardDa(db, id))) return fehler(404, 'Dieses Whiteboard gibt es nicht.');
      await db.query('INSERT INTO whiteboard_inhalte (board_id) VALUES ($1) ON CONFLICT (board_id) DO NOTHING', [id]);
      const { rows } = await db.query<InhaltZeile>('SELECT elemente, dateien, stand FROM whiteboard_inhalte WHERE board_id = $1 FOR UPDATE', [id]);
      const zusammen = fuehreZusammen(rows[0].elemente, elemente);
      const stand = Number(rows[0].stand) + 1;
      await db.query(
        'UPDATE whiteboard_inhalte SET elemente = $2::jsonb, vorschau = COALESCE($3, vorschau), stand = $4, gespeichert_am = now(), gespeichert_von = $5 WHERE board_id = $1',
        [id, JSON.stringify(zusammen), vorschau, stand, ctx.email],
      );
      return { status: 200, daten: { stand, anzahl: zusammen.filter((e) => !e.isDeleted).length } };
    });
  }

  const datei = /^\/whiteboard\/([A-Z0-9-]{1,40})\/datei\/([^/]+)$/.exec(pfad);
  if (datei) {
    const [, id, dateiId] = datei;
    if (!gueltigeDateiId(dateiId)) return fehler(400, 'Ungültige Datei.');
    if (methode === 'GET') {
      const { rows } = await pool.query<{ dateien: Record<string, WbDatei> }>('SELECT dateien FROM whiteboard_inhalte WHERE board_id = $1', [id]);
      const eintrag = rows[0]?.dateien?.[dateiId];
      const objekt = eintrag ? await ctx.ablage.lies(eintrag.pfad) : null;
      return objekt ? { status: 200, typ: eintrag!.mimeType, inhalt: objekt.inhalt } : fehler(404, 'Bild nicht gefunden.');
    }
    if (methode !== 'POST') return fehler(405, 'Nur GET oder POST.');
    const typ = (ctx.typ ?? '').split(';')[0].trim().toLowerCase();
    if (!(BILD_TYPEN as readonly string[]).includes(typ)) return fehler(415, 'Nur Bilder (PNG, JPG, GIF, WebP, SVG).');
    if (!ctx.roh || ctx.roh.length === 0) return fehler(400, 'Leere Datei.');
    if (ctx.roh.length > MAX_DATEI_BYTES) return fehler(413, 'Bilder dürfen höchstens 8 MB groß sein.');
    if (!(await boardDa(pool, id))) return fehler(404, 'Dieses Whiteboard gibt es nicht.');
    const ziel = dateiPfad(id, dateiId);
    await ctx.ablage.schreibe(ziel, typ, ctx.roh);
    const eintrag: WbDatei = { mimeType: typ, pfad: ziel, groesse: ctx.roh.length, erstellt: Date.now() };
    await pool.query(
      `INSERT INTO whiteboard_inhalte (board_id, dateien) VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
       ON CONFLICT (board_id) DO UPDATE SET dateien = whiteboard_inhalte.dateien || jsonb_build_object($2::text, $3::jsonb)`,
      [id, dateiId, JSON.stringify(eintrag)],
    );
    return { status: 200, daten: { ok: true } };
  }
  return fehler(404, 'Unbekannte Route.');
}
