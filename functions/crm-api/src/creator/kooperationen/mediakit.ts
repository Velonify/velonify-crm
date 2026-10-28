import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../../routen';
import { baustein, fehler, istObjekt, ok, type CreatorKontext, type OeffentlichKontext } from '../modul';
import { Eingabefehler, instanzName, KANAELE, kanalListe, optText, text, zeit } from './daten';
import { interaktionsrate, kontoZahlen, videoZahlen, type VideoZahlen } from './zahlen';

export const KENNZAHLEN = ['follower', 'aufrufe', 'interaktion', 'top'] as const;

export interface MediakitTexte {
  veroeffentlicht: boolean;
  name: string;
  untertitel: string;
  ueber: string;
  zielgruppe: string;
  themen: string;
  referenzen: { name: string; text: string }[];
  kontakt_email: string;
  kennzahlen: string[];
  kanaele: string[];
  zeitraum_tage: number;
  geaendert_am: string;
  geaendert_von: string;
}

export interface MediakitKanal {
  plattform: string;
  handles: string[];
  follower: number | null;
  videos: number;
  aufrufe_schnitt: number | null;
  interaktionsrate: number | null;
}

export interface MediakitZahlen {
  kanaele: MediakitKanal[];
  follower_gesamt: number | null;
  aufrufe_schnitt: number | null;
  interaktionsrate: number | null;
  top: Pick<VideoZahlen, 'id' | 'plattform' | 'titel' | 'url' | 'vorschaubild' | 'aufrufe' | 'veroeffentlicht_am'>[];
  /** True when any number shown comes from example data. */
  beispiel: boolean;
  /** True when real (non-example) numbers exist at all. */
  echt: boolean;
  stand: string;
}

async function ladeTexte(db: Db): Promise<MediakitTexte> {
  const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM mediakit WHERE id = 'standard'`);
  const z = rows[0] ?? {};
  return {
    veroeffentlicht: z.veroeffentlicht === true,
    name: text(z.name),
    untertitel: text(z.untertitel),
    ueber: text(z.ueber),
    zielgruppe: text(z.zielgruppe),
    themen: text(z.themen),
    referenzen: Array.isArray(z.referenzen) ? (z.referenzen as { name?: unknown; text?: unknown }[]).map((r) => ({ name: text(r.name), text: text(r.text) })) : [],
    kontakt_email: text(z.kontakt_email),
    kennzahlen: Array.isArray(z.kennzahlen) ? z.kennzahlen.map(String) : [...KENNZAHLEN],
    kanaele: Array.isArray(z.kanaele) ? z.kanaele.map(String) : [],
    zeitraum_tage: typeof z.zeitraum_tage === 'number' ? z.zeitraum_tage : 90,
    geaendert_am: zeit(z.geaendert_am),
    geaendert_von: text(z.geaendert_von),
  };
}

const schnitt = (werte: number[]) => (werte.length ? Math.round(werte.reduce((s, w) => s + w, 0) / werte.length) : null);

/** Live numbers of the media kit; `nurEcht` leaves out every example row (public page). */
export async function mediakitZahlen(db: Db, t: Pick<MediakitTexte, 'kanaele' | 'zeitraum_tage'>, jetzt: Date, nurEcht: boolean): Promise<MediakitZahlen> {
  const seit = new Date(jetzt.getTime() - t.zeitraum_tage * 86_400_000).toISOString();
  const konten = (await kontoZahlen(db, nurEcht)).filter((k) => t.kanaele.length === 0 || t.kanaele.includes(k.plattform));
  const videos = await videoZahlen(db, { seit, nurEcht, plattformen: t.kanaele.length ? t.kanaele : undefined });
  const plattformen = KANAELE.filter((p) => konten.some((k) => k.plattform === p) || videos.some((v) => v.plattform === p));
  const kanaele: MediakitKanal[] = plattformen.map((p) => {
    const k = konten.filter((x) => x.plattform === p);
    const v = videos.filter((x) => x.plattform === p);
    const follower = k.filter((x) => x.follower !== null);
    return {
      plattform: p,
      handles: k.map((x) => x.handle).filter(Boolean),
      follower: follower.length ? follower.reduce((s, x) => s + (x.follower ?? 0), 0) : null,
      videos: v.length,
      aufrufe_schnitt: schnitt(v.map((x) => x.aufrufe)),
      interaktionsrate: interaktionsrate(v),
    };
  });
  const mitFollower = kanaele.filter((k) => k.follower !== null);
  const { rows } = await db.query<{ echt: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM kanal_werte WHERE NOT beispiel) OR EXISTS (SELECT 1 FROM video_werte WHERE NOT beispiel) AS echt`,
  );
  const staende = [...konten.map((k) => k.stand), ...videos.map((v) => v.stand)].filter(Boolean).sort();
  return {
    kanaele,
    follower_gesamt: mitFollower.length ? mitFollower.reduce((s, k) => s + (k.follower ?? 0), 0) : null,
    aufrufe_schnitt: schnitt(videos.map((v) => v.aufrufe)),
    interaktionsrate: interaktionsrate(videos),
    top: [...videos]
      .sort((a, b) => b.aufrufe - a.aufrufe)
      .slice(0, 6)
      .map(({ id, plattform, titel, url, vorschaubild, aufrufe, veroeffentlicht_am }) => ({ id, plattform, titel, url, vorschaubild, aufrufe, veroeffentlicht_am })),
    beispiel: konten.some((k) => k.beispiel && k.follower !== null) || videos.some((v) => v.beispiel),
    echt: rows[0]?.echt === true,
    stand: staende[staende.length - 1] ?? '',
  };
}

/** Only the switched-on figures leave the house. */
function auswahl(z: MediakitZahlen, kennzahlen: string[]) {
  const an = (k: string) => kennzahlen.includes(k);
  return {
    kanaele: z.kanaele.map((k) => ({
      plattform: k.plattform,
      handles: k.handles,
      follower: an('follower') ? k.follower : null,
      aufrufe_schnitt: an('aufrufe') ? k.aufrufe_schnitt : null,
      interaktionsrate: an('interaktion') ? k.interaktionsrate : null,
    })),
    follower_gesamt: an('follower') ? z.follower_gesamt : null,
    aufrufe_schnitt: an('aufrufe') ? z.aufrufe_schnitt : null,
    interaktionsrate: an('interaktion') ? z.interaktionsrate : null,
    top: an('top') ? z.top : [],
    stand: z.stand,
  };
}

export async function mediakitOeffentlich(methode: string, ctx: OeffentlichKontext): Promise<Antwort> {
  if (!ctx.bausteine.includes('mediakit')) return fehler(404, 'Unbekannte Seite.');
  if (methode !== 'GET') return fehler(405, 'Nur GET.');
  const t = await ladeTexte(ctx.pool);
  if (!t.veroeffentlicht) return fehler(404, 'Dieses Mediakit ist gerade nicht veröffentlicht.');
  const zahlen = await mediakitZahlen(ctx.pool, t, ctx.jetzt(), true);
  return ok({
    instanz: await instanzName(ctx.pool),
    texte: { name: t.name, untertitel: t.untertitel, ueber: t.ueber, zielgruppe: t.zielgruppe, themen: t.themen, referenzen: t.referenzen, kontakt_email: t.kontakt_email, zeitraum_tage: t.zeitraum_tage },
    zahlen: auswahl(zahlen, t.kennzahlen),
    anfrage: ctx.bausteine.includes('anfrageformular'),
  });
}

export async function mediakitRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null> {
  if (!pfad.startsWith('/c/kooperationen/mediakit')) return null;
  const zu = baustein(ctx, 'mediakit');
  if (zu) return zu;
  const db = ctx.pool;
  if (pfad === '/c/kooperationen/mediakit' && methode === 'GET') {
    const t = await ladeTexte(db);
    const zahlen = await mediakitZahlen(db, t, ctx.jetzt(), false);
    return ok({ texte: t, zahlen, oeffentlich: auswahl(await mediakitZahlen(db, t, ctx.jetzt(), true), t.kennzahlen), anfrage: ctx.sicht.bausteine.includes('anfrageformular') });
  }
  if (pfad !== '/c/kooperationen/mediakit/speichern' || methode !== 'POST') return null;
  if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
  try {
    const t = await ladeTexte(db);
    const neu: MediakitTexte = { ...t };
    for (const [feld, max] of [
      ['name', 120],
      ['untertitel', 200],
      ['ueber', 4000],
      ['zielgruppe', 2000],
      ['themen', 1000],
      ['kontakt_email', 200],
    ] as const) {
      const w = optText(body[feld], feld, max);
      if (w !== undefined) neu[feld] = w ?? '';
    }
    if (neu.kontakt_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neu.kontakt_email)) throw new Eingabefehler('Die Kontakt-Adresse sieht nicht gültig aus.');
    if (body.referenzen !== undefined) {
      if (!Array.isArray(body.referenzen) || body.referenzen.length > 30) throw new Eingabefehler('Referenzen als Liste (höchstens 30).');
      neu.referenzen = body.referenzen
        .map((r) => (istObjekt(r) ? { name: (optText(r.name, 'Referenz', 120) ?? ''), text: (optText(r.text, 'Referenz-Text', 500) ?? '') } : { name: '', text: '' }))
        .filter((r) => r.name);
    }
    if (body.kennzahlen !== undefined) {
      if (!Array.isArray(body.kennzahlen) || !body.kennzahlen.every((k) => (KENNZAHLEN as readonly string[]).includes(String(k)))) throw new Eingabefehler('Unbekannte Kennzahl.');
      neu.kennzahlen = [...new Set(body.kennzahlen.map(String))];
    }
    if (body.kanaele !== undefined) neu.kanaele = kanalListe(body.kanaele);
    if (body.zeitraum_tage !== undefined) {
      const tage = Number(body.zeitraum_tage);
      if (![30, 90, 180, 365].includes(tage)) throw new Eingabefehler('Zeitraum: 30, 90, 180 oder 365 Tage.');
      neu.zeitraum_tage = tage;
    }
    if (body.veroeffentlicht !== undefined) {
      if (typeof body.veroeffentlicht !== 'boolean') throw new Eingabefehler('Veröffentlicht ist an oder aus.');
      neu.veroeffentlicht = body.veroeffentlicht;
    }
    if (neu.veroeffentlicht) {
      if (!neu.name) return fehler(400, 'Zum Veröffentlichen braucht das Mediakit einen Namen.');
      // Example numbers never go public: only once real numbers arrived from the channels.
      const echt = await mediakitZahlen(db, neu, ctx.jetzt(), true);
      if (!echt.echt || (echt.kanaele.length === 0 && echt.top.length === 0)) return fehler(409, 'Es gibt noch keine echten Zahlen aus den Kanälen, nur Beispielzahlen. Veröffentlichen geht nach der Anbindung.');
    }
    await db.query(
      `INSERT INTO mediakit (id, veroeffentlicht, name, untertitel, ueber, zielgruppe, themen, referenzen, kontakt_email, kennzahlen, kanaele, zeitraum_tage, geaendert_am, geaendert_von)
       VALUES ('standard', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
       ON CONFLICT (id) DO UPDATE SET veroeffentlicht = $1, name = $2, untertitel = $3, ueber = $4, zielgruppe = $5, themen = $6, referenzen = $7,
         kontakt_email = $8, kennzahlen = $9, kanaele = $10, zeitraum_tage = $11, geaendert_am = now(), geaendert_von = $12`,
      [neu.veroeffentlicht, neu.name || null, neu.untertitel || null, neu.ueber || null, neu.zielgruppe || null, neu.themen || null, JSON.stringify(neu.referenzen), neu.kontakt_email || null, neu.kennzahlen, neu.kanaele, neu.zeitraum_tage, ctx.person],
    );
    return ok({ texte: await ladeTexte(db) });
  } catch (err) {
    if (err instanceof Eingabefehler) return fehler(400, err.message);
    throw err;
  }
}
