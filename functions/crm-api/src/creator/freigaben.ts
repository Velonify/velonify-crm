import { darfEinrichten } from '../../../../src/data/instanz';
import type { Db } from '../../../../src/data/postgres/postgresStore';
import { baustein, fehler, istObjekt, neueId, ok, type CreatorKontext, type Modul } from './modul';

/**
 * Rollen und Freigaben (Konzept: "Klar geregelt, wer entscheidet, wer antwortet und wer freigibt; Freigaben laufen per Klick").
 * Areas with who decides, answers and approves; approvals of any object of the other modules, decided with one click.
 */
export const BEREICHE = [
  { id: 'content', label: 'Content (Ideen, Skripte, Uploads)' },
  { id: 'kooperationen', label: 'Kooperationen und Anfragen' },
  { id: 'community', label: 'Kommentare und Nachrichten' },
  { id: 'finanzen', label: 'Einnahmen und Rechnungen' },
  { id: 'organisation', label: 'Termine, Ablage und Zugänge' },
] as const;

export type FreigabeStatus = 'offen' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen';

export interface Freigabe {
  id: string;
  objekt_typ: string;
  objekt_id: string;
  titel: string;
  link: string;
  bereich: string;
  freigeber: string;
  status: FreigabeStatus;
  notiz: string;
  kommentar: string;
  angefragt_von: string;
  angefragt_am: string;
  entschieden_von: string;
  entschieden_am: string;
}

export interface Zustaendigkeit {
  bereich: string;
  entscheidet: string;
  antwortet: string;
  gibt_frei: string;
}

const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : '');
const text = (w: unknown) => (w === null || w === undefined ? '' : String(w));

function zuFreigabe(z: Record<string, unknown>): Freigabe {
  return {
    id: text(z.id),
    objekt_typ: text(z.objekt_typ),
    objekt_id: text(z.objekt_id),
    titel: text(z.titel),
    link: text(z.link),
    bereich: text(z.bereich),
    freigeber: text(z.freigeber),
    status: text(z.status) as FreigabeStatus,
    notiz: text(z.notiz),
    kommentar: text(z.kommentar),
    angefragt_von: text(z.angefragt_von),
    angefragt_am: zeit(z.angefragt_am),
    entschieden_von: text(z.entschieden_von),
    entschieden_am: zeit(z.entschieden_am),
  };
}

/** The latest approval of an object, for modules that show or check its state (e.g. a script may only go to "dreh" when approved). */
export async function freigabeVon(db: Db, objektTyp: string, objektId: string): Promise<Freigabe | null> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM freigaben WHERE objekt_typ = $1 AND objekt_id = $2 ORDER BY angefragt_am DESC LIMIT 1', [objektTyp, objektId]);
  return rows[0] ? zuFreigabe(rows[0]) : null;
}

/** Who approves in an area; empty when nobody is set. */
export async function freigeberFuer(db: Db, bereich: string): Promise<string> {
  const { rows } = await db.query<{ gibt_frei: string | null }>('SELECT gibt_frei FROM zustaendigkeiten WHERE bereich = $1', [bereich]);
  return rows[0]?.gibt_frei?.trim() ?? '';
}

/**
 * Asks for an approval (also used by other modules directly). Without an explicit approver the one of the area is used.
 * An open approval of the same object is replaced, so there is only ever one open request per object.
 */
export async function frageFreigabeAn(
  db: Db,
  eingabe: { objekt_typ: string; objekt_id: string; titel: string; link?: string; bereich?: string; freigeber?: string; notiz?: string },
  von: string,
): Promise<Freigabe> {
  const freigeber = eingabe.freigeber?.trim() || (eingabe.bereich ? await freigeberFuer(db, eingabe.bereich) : '');
  if (!freigeber) throw Object.assign(new Error('Für diesen Bereich ist niemand als Freigabe eingetragen. Bitte eine Person wählen.'), { status: 400 });
  await db.query(`UPDATE freigaben SET status = 'zurueckgezogen', entschieden_von = $3, entschieden_am = now() WHERE objekt_typ = $1 AND objekt_id = $2 AND status = 'offen'`, [
    eingabe.objekt_typ,
    eingabe.objekt_id,
    von,
  ]);
  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO freigaben (id, objekt_typ, objekt_id, titel, link, bereich, freigeber, notiz, angefragt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [neueId('FG'), eingabe.objekt_typ, eingabe.objekt_id, eingabe.titel.slice(0, 200), eingabe.link ?? null, eingabe.bereich ?? null, freigeber, eingabe.notiz ?? null, von],
  );
  return zuFreigabe(rows[0]);
}

async function liste(db: Db, wer: string | null, nurOffen: boolean): Promise<Freigabe[]> {
  const bedingungen: string[] = [];
  const werte: unknown[] = [];
  if (wer) {
    werte.push(wer);
    bedingungen.push(`(freigeber = $${werte.length} OR angefragt_von = $${werte.length})`);
  }
  if (nurOffen) bedingungen.push(`status = 'offen'`);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT * FROM freigaben ${bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : ''} ORDER BY status = 'offen' DESC, angefragt_am DESC LIMIT 200`,
    werte,
  );
  return rows.map(zuFreigabe);
}

async function zustaendigkeiten(db: Db): Promise<Zustaendigkeit[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM zustaendigkeiten');
  return BEREICHE.map((b) => {
    const z = rows.find((r) => r.bereich === b.id);
    return { bereich: b.id, entscheidet: text(z?.entscheidet), antwortet: text(z?.antwortet), gibt_frei: text(z?.gibt_frei) };
  });
}

async function routen(methode: string, pfad: string, body: unknown, ctx: CreatorKontext) {
  const zu = baustein(ctx, 'freigaben');
  if (zu) return zu;
  const { pool: db } = ctx;

  if (pfad === '/c/freigaben/zustaendigkeiten') {
    if (methode === 'GET') return ok({ bereiche: BEREICHE, zustaendigkeiten: await zustaendigkeiten(db) });
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Zuständigkeiten legen Admins fest.');
    if (!istObjekt(body) || !Array.isArray(body.zustaendigkeiten)) return fehler(400, 'Zuständigkeiten fehlen.');
    for (const z of body.zustaendigkeiten) {
      if (!istObjekt(z) || !BEREICHE.some((b) => b.id === z.bereich)) return fehler(400, 'Unbekannter Bereich.');
      await db.query(
        `INSERT INTO zustaendigkeiten (bereich, entscheidet, antwortet, gibt_frei, geaendert_am, geaendert_von) VALUES ($1, $2, $3, $4, now(), $5)
         ON CONFLICT (bereich) DO UPDATE SET entscheidet = $2, antwortet = $3, gibt_frei = $4, geaendert_am = now(), geaendert_von = $5`,
        [z.bereich, text(z.entscheidet).trim() || null, text(z.antwortet).trim() || null, text(z.gibt_frei).trim() || null, ctx.email],
      );
    }
    return ok({ zustaendigkeiten: await zustaendigkeiten(db) });
  }

  if (pfad === '/c/freigaben' && methode === 'GET') {
    // Admins see all, everyone else what waits for them or what they asked for.
    return ok({ freigaben: await liste(db, darfEinrichten(ctx.rolle) ? null : ctx.person, false) });
  }
  if (pfad === '/c/freigaben/fuer-mich' && methode === 'GET') {
    const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM freigaben WHERE freigeber = $1 AND status = 'offen' ORDER BY angefragt_am`, [ctx.person]);
    return ok({ freigaben: rows.map(zuFreigabe) });
  }
  if (pfad === '/c/freigaben/objekt' && methode === 'POST') {
    if (!istObjekt(body) || typeof body.objekt_typ !== 'string' || typeof body.objekt_id !== 'string') return fehler(400, 'Objekt fehlt.');
    return ok({ freigabe: await freigabeVon(db, body.objekt_typ, body.objekt_id) });
  }
  if (methode !== 'POST') return null;

  if (pfad === '/c/freigaben/anfragen') {
    if (!istObjekt(body) || typeof body.objekt_typ !== 'string' || typeof body.objekt_id !== 'string' || typeof body.titel !== 'string' || !body.titel.trim()) {
      return fehler(400, 'Objekt und Titel fehlen.');
    }
    try {
      const freigabe = await frageFreigabeAn(
        db,
        {
          objekt_typ: body.objekt_typ,
          objekt_id: body.objekt_id,
          titel: body.titel,
          link: typeof body.link === 'string' ? body.link : undefined,
          bereich: typeof body.bereich === 'string' ? body.bereich : undefined,
          freigeber: typeof body.freigeber === 'string' ? body.freigeber : undefined,
          notiz: typeof body.notiz === 'string' ? body.notiz : undefined,
        },
        ctx.person,
      );
      return ok({ freigabe });
    } catch (err) {
      return fehler((err as { status?: number }).status ?? 500, err instanceof Error ? err.message : String(err));
    }
  }
  if (pfad === '/c/freigaben/entscheiden') {
    if (!istObjekt(body) || typeof body.id !== 'string' || (body.status !== 'freigegeben' && body.status !== 'abgelehnt')) return fehler(400, 'Entscheidung fehlt.');
    const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM freigaben WHERE id = $1', [body.id]);
    const f = rows[0] ? zuFreigabe(rows[0]) : null;
    if (!f) return fehler(404, 'Freigabe nicht gefunden.');
    if (f.status !== 'offen') return fehler(409, 'Darüber wurde schon entschieden.');
    if (f.freigeber !== ctx.person && !darfEinrichten(ctx.rolle)) return fehler(403, `Das gibt ${f.freigeber} frei.`);
    if (body.status === 'abgelehnt' && !text(body.kommentar).trim()) return fehler(400, 'Bitte kurz sagen, was fehlt.');
    const { rows: neu } = await db.query<Record<string, unknown>>(
      `UPDATE freigaben SET status = $2, kommentar = $3, entschieden_von = $4, entschieden_am = now() WHERE id = $1 RETURNING *`,
      [f.id, body.status, text(body.kommentar).trim() || null, ctx.person],
    );
    return ok({ freigabe: zuFreigabe(neu[0]) });
  }
  if (pfad === '/c/freigaben/zurueckziehen') {
    if (!istObjekt(body) || typeof body.id !== 'string') return fehler(400, 'Freigabe fehlt.');
    const { rows } = await db.query(`UPDATE freigaben SET status = 'zurueckgezogen', entschieden_von = $2, entschieden_am = now() WHERE id = $1 AND status = 'offen' AND (angefragt_von = $2 OR $3) RETURNING id`, [
      body.id,
      ctx.person,
      darfEinrichten(ctx.rolle),
    ]);
    return rows.length ? ok() : fehler(409, 'Diese Freigabe ist nicht mehr offen oder nicht deine.');
  }
  return null;
}

export const freigabenModul: Modul = { praefix: 'freigaben', routen };
