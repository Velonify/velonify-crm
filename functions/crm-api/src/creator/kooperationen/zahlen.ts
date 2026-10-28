import type { Db } from '../../../../../src/data/postgres/postgresStore';
import { tag, text, zahl, zeit } from './daten';

/** Latest values of one video (newest day; on the same day the API value before the TikTok Studio export). */
export interface VideoZahlen {
  id: string;
  plattform: string;
  titel: string;
  url: string;
  vorschaubild: string;
  veroeffentlicht_am: string;
  typ: string;
  aufrufe: number;
  reichweite: number | null;
  likes: number;
  kommentare: number;
  shares: number;
  saves: number;
  beispiel: boolean;
  stand: string;
}

/** Latest snapshot per video for the given videos (or all videos published since `seit`). */
export async function videoZahlen(db: Db, auswahl: { ids?: string[]; seit?: string; nurEcht?: boolean; plattformen?: string[] }): Promise<VideoZahlen[]> {
  const bedingungen: string[] = [];
  const werte: unknown[] = [];
  if (auswahl.ids) {
    werte.push(auswahl.ids);
    bedingungen.push(`v.id = ANY($${werte.length})`);
  }
  if (auswahl.seit) {
    werte.push(auswahl.seit);
    bedingungen.push(`v.veroeffentlicht_am >= $${werte.length}`);
  }
  if (auswahl.plattformen && auswahl.plattformen.length > 0) {
    werte.push(auswahl.plattformen);
    bedingungen.push(`v.plattform = ANY($${werte.length})`);
  }
  if (auswahl.nurEcht) bedingungen.push('NOT v.beispiel AND NOT w.beispiel');
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id, v.plattform, v.titel, v.url, v.vorschaubild, v.veroeffentlicht_am, v.typ, v.beispiel AS video_beispiel,
            w.aufrufe, w.reichweite, w.likes, w.kommentare, w.shares, w.saves, w.beispiel AS werte_beispiel, w.datum::text AS stand
     FROM videos v
     JOIN LATERAL (SELECT * FROM video_werte x WHERE x.video_id = v.id ORDER BY x.datum DESC, (x.quelle = 'api') DESC LIMIT 1) w ON true
     ${bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : ''}
     ORDER BY v.veroeffentlicht_am DESC NULLS LAST`,
    werte,
  );
  return rows.map((r) => ({
    id: text(r.id),
    plattform: text(r.plattform),
    titel: text(r.titel),
    url: text(r.url),
    vorschaubild: text(r.vorschaubild),
    veroeffentlicht_am: zeit(r.veroeffentlicht_am),
    typ: text(r.typ),
    aufrufe: zahl(r.aufrufe) ?? 0,
    reichweite: zahl(r.reichweite),
    likes: zahl(r.likes) ?? 0,
    kommentare: zahl(r.kommentare) ?? 0,
    shares: zahl(r.shares) ?? 0,
    saves: zahl(r.saves) ?? 0,
    beispiel: r.video_beispiel === true || r.werte_beispiel === true,
    stand: tag(r.stand),
  }));
}

export const interaktionen = (v: Pick<VideoZahlen, 'likes' | 'kommentare' | 'shares' | 'saves'>) => v.likes + v.kommentare + v.shares + v.saves;

/** Interaction rate in percent (likes, comments, shares, saves per view), one decimal; null without views. */
export function interaktionsrate(videos: Pick<VideoZahlen, 'aufrufe' | 'likes' | 'kommentare' | 'shares' | 'saves'>[]): number | null {
  const aufrufe = videos.reduce((s, v) => s + v.aufrufe, 0);
  if (aufrufe <= 0) return null;
  return Math.round((videos.reduce((s, v) => s + interaktionen(v), 0) / aufrufe) * 1000) / 10;
}

export interface KontoZahlen {
  id: string;
  plattform: string;
  handle: string;
  follower: number | null;
  stand: string;
  beispiel: boolean;
}

/** Followers per channel account from the newest day of kanal_werte. */
export async function kontoZahlen(db: Db, nurEcht: boolean): Promise<KontoZahlen[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT k.id, k.plattform, k.handle, k.beispiel AS konto_beispiel, w.follower, w.datum::text AS stand, w.beispiel AS werte_beispiel
     FROM kanal_konten k
     LEFT JOIN LATERAL (SELECT * FROM kanal_werte x WHERE x.konto_id = k.id AND x.follower IS NOT NULL ${nurEcht ? 'AND NOT x.beispiel' : ''} ORDER BY x.datum DESC LIMIT 1) w ON true
     WHERE k.status <> 'getrennt' ${nurEcht ? 'AND NOT k.beispiel' : ''}
     ORDER BY k.plattform`,
  );
  return rows.map((r) => ({
    id: text(r.id),
    plattform: text(r.plattform),
    handle: text(r.handle),
    follower: zahl(r.follower),
    stand: tag(r.stand),
    beispiel: r.konto_beispiel === true || r.werte_beispiel === true,
  }));
}
