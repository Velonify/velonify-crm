import { randomBytes } from 'node:crypto';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../../routen';
import { freigabeVon } from '../freigaben';
import { baustein, fehler, istObjekt, neueId, ok, type CreatorKontext, type OeffentlichKontext } from '../modul';
import { instanzName, KANAL_NAME, optText, PHASEN, tag, text, zeit } from './daten';
import { koopTitel, ladeKooperation, speichereKooperation, type Kooperation } from './uebersicht';
import { interaktionsrate, videoZahlen, type VideoZahlen } from './zahlen';

/** Object type of reports in approvals (FreigabeKnopf, area "kooperationen"). */
export const REPORTING_TYP = 'partnerreporting';

export interface ReportingSummen {
  videos: number;
  aufrufe: number;
  reichweite: number | null;
  likes: number;
  kommentare: number;
  shares: number;
  saves: number;
  interaktionsrate: number | null;
}

export interface ReportingKennzahlen {
  summen: ReportingSummen;
  videos: Omit<VideoZahlen, 'beispiel' | 'typ'>[];
  /** Newest day of the numbers. */
  stand: string;
}

export interface Reporting {
  id: string;
  kooperation_id: string;
  schluessel: string;
  titel: string;
  zeitraum_von: string;
  zeitraum_bis: string;
  video_ids: string[];
  kennzahlen: ReportingKennzahlen;
  text: string;
  beispiel: boolean;
  link_aktiv: boolean;
  geteilt_am: string;
  geteilt_von: string;
  geoeffnet_am: string;
  archiviert: boolean;
  erstellt_am: string;
  erstellt_von: string;
  geaendert_am: string;
  geaendert_von: string;
}

const SPALTEN = `id, kooperation_id, schluessel, titel, zeitraum_von::text, zeitraum_bis::text, video_ids, kennzahlen, text, beispiel, link_aktiv, geteilt_am,
  geteilt_von, geoeffnet_am, archiviert, erstellt_am, erstellt_von, geaendert_am, geaendert_von`;

function zuReporting(z: Record<string, unknown>): Reporting {
  return {
    id: text(z.id),
    kooperation_id: text(z.kooperation_id),
    schluessel: text(z.schluessel),
    titel: text(z.titel),
    zeitraum_von: tag(z.zeitraum_von),
    zeitraum_bis: tag(z.zeitraum_bis),
    video_ids: Array.isArray(z.video_ids) ? z.video_ids.map(String) : [],
    kennzahlen: (typeof z.kennzahlen === 'string' ? JSON.parse(z.kennzahlen) : z.kennzahlen) as ReportingKennzahlen,
    text: text(z.text),
    beispiel: z.beispiel === true,
    link_aktiv: z.link_aktiv === true,
    geteilt_am: zeit(z.geteilt_am),
    geteilt_von: text(z.geteilt_von),
    geoeffnet_am: zeit(z.geoeffnet_am),
    archiviert: z.archiviert === true,
    erstellt_am: zeit(z.erstellt_am),
    erstellt_von: text(z.erstellt_von),
    geaendert_am: zeit(z.geaendert_am),
    geaendert_von: text(z.geaendert_von),
  };
}

async function ladeReporting(db: Db, id: string): Promise<Reporting | null> {
  const { rows } = await db.query<Record<string, unknown>>(`SELECT ${SPALTEN} FROM kooperation_reportings WHERE id = $1`, [id]);
  return rows[0] ? zuReporting(rows[0]) : null;
}

/** Videos linked to a cooperation through the content plan (inhalte.kooperation_id → video_id, or videos.inhalt_id). */
async function verknuepfteVideoIds(db: Db, kooperationId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT v.id FROM videos v
     WHERE v.id IN (SELECT video_id FROM inhalte WHERE kooperation_id = $1 AND video_id IS NOT NULL AND NOT archiviert)
        OR v.inhalt_id IN (SELECT id FROM inhalte WHERE kooperation_id = $1 AND NOT archiviert)`,
    [kooperationId],
  );
  return rows.map((r) => r.id);
}

/** Candidates for a report: the linked videos (preselected) and every other video of the campaign period. */
async function kandidaten(db: Db, k: Kooperation) {
  const verknuepft = await verknuepfteVideoIds(db, k.id);
  const seit = k.zeitraum_von ? new Date(`${k.zeitraum_von}T00:00:00Z`).toISOString() : undefined;
  const imZeitraum = seit ? await videoZahlen(db, { seit }) : [];
  const bis = k.zeitraum_bis ? `${k.zeitraum_bis}T23:59:59Z` : '';
  const alle = [...(await videoZahlen(db, { ids: verknuepft })), ...imZeitraum.filter((v) => !verknuepft.includes(v.id) && (!bis || v.veroeffentlicht_am <= new Date(bis).toISOString()))];
  return alle.map((v) => ({ ...v, verknuepft: verknuepft.includes(v.id) }));
}

export function summiere(videos: Pick<VideoZahlen, 'aufrufe' | 'reichweite' | 'likes' | 'kommentare' | 'shares' | 'saves'>[]): ReportingSummen {
  const s = (f: 'aufrufe' | 'likes' | 'kommentare' | 'shares' | 'saves') => videos.reduce((n, v) => n + v[f], 0);
  const mitReichweite = videos.filter((v) => v.reichweite !== null);
  return {
    videos: videos.length,
    aufrufe: s('aufrufe'),
    reichweite: mitReichweite.length ? mitReichweite.reduce((n, v) => n + (v.reichweite ?? 0), 0) : null,
    likes: s('likes'),
    kommentare: s('kommentare'),
    shares: s('shares'),
    saves: s('saves'),
    interaktionsrate: interaktionsrate(videos),
  };
}

async function kennzahlenFuer(db: Db, ids: string[]): Promise<{ kennzahlen: ReportingKennzahlen; beispiel: boolean; von: string; bis: string }> {
  const videos = await videoZahlen(db, { ids });
  const tage = videos.map((v) => v.veroeffentlicht_am.slice(0, 10)).filter(Boolean).sort();
  const staende = videos.map((v) => v.stand).filter(Boolean).sort();
  return {
    kennzahlen: { summen: summiere(videos), videos: videos.map(({ beispiel: _b, typ: _t, ...rest }) => (void _b, void _t, rest)), stand: staende[staende.length - 1] ?? '' },
    beispiel: videos.some((v) => v.beispiel),
    von: tage[0] ?? '',
    bis: tage[tage.length - 1] ?? '',
  };
}

const zahlText = (n: number | null) => (n === null ? 'nicht verfügbar' : n.toLocaleString('de-DE'));

/** Draft text by Claude (Sonnet) from the numbers only; the team edits it before approval. */
async function schreibeText(ctx: CreatorKontext, k: Kooperation, r: Pick<Reporting, 'zeitraum_von' | 'zeitraum_bis'> & { kennzahlen: ReportingKennzahlen }, creator: string): Promise<string> {
  const s = r.kennzahlen.summen;
  const zeilen = r.kennzahlen.videos.map(
    (v) =>
      `- ${KANAL_NAME[v.plattform] ?? v.plattform}, „${v.titel || 'ohne Titel'}“, veröffentlicht ${v.veroeffentlicht_am.slice(0, 10) || 'unbekannt'}: ${zahlText(v.aufrufe)} Aufrufe, Reichweite ${zahlText(v.reichweite)}, ${zahlText(v.likes)} Likes, ${zahlText(v.kommentare)} Kommentare, ${zahlText(v.shares)} Shares, ${zahlText(v.saves)} Saves`,
  );
  return (
    await ctx.ki.frage({
      zweck: 'partnerreporting',
      modell: 'gut',
      email: ctx.email,
      maxTokens: 1500,
      system:
        'Du schreibst für ein Creator-Management den Kampagnenbericht an einen Markenpartner. Deutsch, Sie-Form, sachlich und freundlich, kurz (3 bis 5 Absätze). ' +
        'Nutze ausschließlich die gegebenen Zahlen, erfinde nichts, runde nicht um und rechne keine neuen Kennzahlen aus. Keine Beträge, keine internen Notizen, keine Versprechen für künftige Kampagnen. ' +
        'Aufbau: kurzer Rückblick auf die Kampagne, die wichtigsten Ergebnisse, was besonders gut lief (nur wenn die Zahlen es zeigen), Dank. Keine Überschriften, keine Aufzählungszeichen, kein Markdown.',
      nachricht: [
        `Creator: ${creator || 'die Creatorin'}`,
        `Partner: ${k.partner}${k.marke ? `, Marke/Produkt: ${k.marke}` : ''}`,
        `Kampagne: ${koopTitel(k)}`,
        k.leistung ? `Vereinbarte Leistung: ${k.leistung}` : '',
        `Zeitraum: ${r.zeitraum_von || '?'} bis ${r.zeitraum_bis || '?'}`,
        `Summen über ${s.videos} Inhalte: ${zahlText(s.aufrufe)} Aufrufe, Reichweite ${zahlText(s.reichweite)}, ${zahlText(s.likes)} Likes, ${zahlText(s.kommentare)} Kommentare, ${zahlText(s.shares)} Shares, ${zahlText(s.saves)} Saves, Interaktionsrate ${s.interaktionsrate === null ? 'nicht verfügbar' : `${s.interaktionsrate.toLocaleString('de-DE')} %`}`,
        `Stand der Zahlen: ${r.kennzahlen.stand || 'unbekannt'}`,
        'Inhalte:',
        ...zeilen,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  ).trim();
}

/** Whether the report may be shared: no example numbers, and – with "Rollen und Freigaben" on – approved after its last change. */
async function darfTeilen(ctx: CreatorKontext, r: Reporting): Promise<string | null> {
  if (r.beispiel) return 'Dieser Bericht enthält Beispielzahlen und kann nicht an den Partner gehen.';
  if (!r.text.trim()) return 'Der Bericht hat noch keinen Text.';
  if (r.kennzahlen.summen.videos === 0) return 'Der Bericht enthält keine Videos.';
  if (ctx.sicht.bausteine.includes('freigaben')) {
    const f = await freigabeVon(ctx.pool, REPORTING_TYP, r.id);
    if (!f || f.status !== 'freigegeben') return 'Der Bericht ist noch nicht freigegeben.';
    if (new Date(f.entschieden_am).getTime() < new Date(r.geaendert_am).getTime()) return 'Der Bericht wurde nach der Freigabe geändert. Bitte erneut freigeben lassen.';
  }
  return null;
}

const berichtLink = (ctx: Pick<CreatorKontext, 'umgebung'>, schluessel: string) => `${ctx.umgebung.hubUrl}/#/oeffentlich/bericht/${schluessel}`;

export async function reportingRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext, heute: string): Promise<Antwort | null> {
  if (!pfad.startsWith('/c/kooperationen/reportings')) return null;
  const zu = baustein(ctx, 'partnerreporting');
  if (zu) return zu;
  const db = ctx.pool;

  if (pfad === '/c/kooperationen/reportings' && methode === 'GET') {
    const { rows } = await db.query<Record<string, unknown>>(`SELECT ${SPALTEN} FROM kooperation_reportings ORDER BY archiviert, erstellt_am DESC`);
    const reportings = rows.map(zuReporting);
    const { rows: koops } = await db.query<Record<string, unknown>>(`SELECT id, partner, marke, titel, stand, zeitraum_von::text, zeitraum_bis::text FROM kooperationen WHERE NOT archiviert ORDER BY partner`);
    const freigaben = Object.fromEntries(await Promise.all(reportings.map(async (r) => [r.id, await freigabeVon(db, REPORTING_TYP, r.id)] as const)));
    return ok({
      reportings: reportings.map((r) => ({ ...r, link: r.link_aktiv ? berichtLink(ctx, r.schluessel) : '' })),
      kooperationen: koops.map((k) => ({ id: text(k.id), titel: koopTitel({ titel: text(k.titel), marke: text(k.marke), partner: text(k.partner) }), partner: text(k.partner), stand: text(k.stand), zeitraum_von: tag(k.zeitraum_von), zeitraum_bis: tag(k.zeitraum_bis) })),
      freigaben,
    });
  }

  const kand = /^\/c\/kooperationen\/reportings\/kandidaten\/([A-Z0-9-]+)$/.exec(pfad);
  if (kand && methode === 'GET') {
    const k = await ladeKooperation(db, kand[1]);
    if (!k) return fehler(404, 'Kooperation nicht gefunden.');
    return ok({ videos: await kandidaten(db, k) });
  }

  if (methode !== 'POST' || !istObjekt(body)) return methode === 'POST' ? fehler(400, 'Anfrage ohne Inhalt.') : null;

  if (pfad === '/c/kooperationen/reportings/erstellen') {
    if (typeof body.kooperation_id !== 'string') return fehler(400, 'Kooperation fehlt.');
    const k = await ladeKooperation(db, body.kooperation_id);
    if (!k) return fehler(404, 'Kooperation nicht gefunden.');
    const ids = Array.isArray(body.video_ids) ? [...new Set(body.video_ids.map(String))] : await verknuepfteVideoIds(db, k.id);
    if (ids.length === 0) return fehler(409, 'Mit dieser Kooperation sind noch keine Videos verknüpft. Verknüpft die Inhalte im Content-Plan oder wählt Videos aus.');
    const z = await kennzahlenFuer(db, ids);
    if (z.kennzahlen.summen.videos === 0) return fehler(409, 'Für die gewählten Videos gibt es noch keine Zahlen.');
    const von = k.zeitraum_von || z.von;
    const bis = k.zeitraum_bis || z.bis;
    const creator = (await db.query<{ name: string | null }>(`SELECT name FROM mediakit WHERE id = 'standard'`)).rows[0]?.name ?? (await instanzName(db));
    const berichtText = await schreibeText(ctx, k, { zeitraum_von: von, zeitraum_bis: bis, kennzahlen: z.kennzahlen }, creator ?? '');
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO kooperation_reportings (id, kooperation_id, schluessel, titel, zeitraum_von, zeitraum_bis, video_ids, kennzahlen, text, beispiel, erstellt_von, geaendert_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING ${SPALTEN}`,
      [neueId('KR'), k.id, randomBytes(24).toString('base64url'), `Kampagnenbericht ${koopTitel(k)}`.slice(0, 200), von || null, bis || null, ids, JSON.stringify(z.kennzahlen), berichtText, z.beispiel, ctx.person],
    );
    return ok({ reporting: zuReporting(rows[0]) });
  }

  if (typeof body.id !== 'string') return fehler(400, 'Bericht fehlt.');
  const r = await ladeReporting(db, body.id);
  if (!r) return fehler(404, 'Bericht nicht gefunden.');

  if (pfad === '/c/kooperationen/reportings/speichern') {
    const titel = optText(body.titel, 'Titel', 200);
    const berichtText = optText(body.text, 'Text', 20000);
    if (titel === null) return fehler(400, 'Der Titel fehlt.');
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE kooperation_reportings SET titel = COALESCE($2, titel), text = COALESCE($3, text), link_aktiv = false, geaendert_am = now(), geaendert_von = $4 WHERE id = $1 RETURNING ${SPALTEN}`,
      [r.id, titel ?? null, berichtText === undefined ? null : (berichtText ?? ''), ctx.person],
    );
    return ok({ reporting: zuReporting(rows[0]) });
  }
  if (pfad === '/c/kooperationen/reportings/aktualisieren') {
    // Fresh numbers of the same videos (partners often want the final numbers a few days later); text stays, unless asked.
    const z = await kennzahlenFuer(db, r.video_ids);
    let berichtText = r.text;
    if (body.text_neu === true) {
      const k = await ladeKooperation(db, r.kooperation_id);
      if (!k) return fehler(404, 'Kooperation nicht gefunden.');
      const creator = (await db.query<{ name: string | null }>(`SELECT name FROM mediakit WHERE id = 'standard'`)).rows[0]?.name ?? (await instanzName(db));
      berichtText = await schreibeText(ctx, k, { zeitraum_von: r.zeitraum_von, zeitraum_bis: r.zeitraum_bis, kennzahlen: z.kennzahlen }, creator ?? '');
    }
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE kooperation_reportings SET kennzahlen = $2, beispiel = $3, text = $4, link_aktiv = false, geaendert_am = now(), geaendert_von = $5 WHERE id = $1 RETURNING ${SPALTEN}`,
      [r.id, JSON.stringify(z.kennzahlen), z.beispiel, berichtText, ctx.person],
    );
    return ok({ reporting: zuReporting(rows[0]) });
  }
  if (pfad === '/c/kooperationen/reportings/teilen') {
    const grund = await darfTeilen(ctx, r);
    if (grund) return fehler(409, grund);
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE kooperation_reportings SET link_aktiv = true, geteilt_am = COALESCE(geteilt_am, now()), geteilt_von = COALESCE(geteilt_von, $2) WHERE id = $1 RETURNING ${SPALTEN}`,
      [r.id, ctx.person],
    );
    // The pipeline moves on to "Reporting an den Partner" (never backwards).
    const k = await ladeKooperation(db, r.kooperation_id);
    if (k && ctx.sicht.bausteine.includes('pipeline') && (!ctx.sicht.bausteine.includes('freigaben') || (await freigabeVon(db, 'kooperation', k.id))?.status === 'freigegeben') && (PHASEN as readonly string[]).indexOf(k.stand) < PHASEN.indexOf('reporting') && (PHASEN as readonly string[]).includes(k.stand)) {
      await speichereKooperation(ctx, { id: k.id, stand: 'reporting' }, heute);
    }
    return ok({ reporting: zuReporting(rows[0]), link: berichtLink(ctx, r.schluessel) });
  }
  if (pfad === '/c/kooperationen/reportings/link-aus') {
    await db.query(`UPDATE kooperation_reportings SET link_aktiv = false WHERE id = $1`, [r.id]);
    return ok({ reporting: await ladeReporting(db, r.id) });
  }
  if (pfad === '/c/kooperationen/reportings/archivieren') {
    if (typeof body.archiviert !== 'boolean') return fehler(400, 'archiviert fehlt.');
    await db.query(`UPDATE kooperation_reportings SET archiviert = $2, link_aktiv = CASE WHEN $2 THEN false ELSE link_aktiv END WHERE id = $1`, [r.id, body.archiviert]);
    return ok({ reporting: await ladeReporting(db, r.id) });
  }
  return null;
}

/** Public report for the partner behind its secret link: numbers, text, period; nothing internal. */
export async function berichtOeffentlich(methode: string, schluessel: string, ctx: OeffentlichKontext): Promise<Antwort> {
  if (!ctx.bausteine.includes('partnerreporting')) return fehler(404, 'Unbekannte Seite.');
  if (methode !== 'GET') return fehler(405, 'Nur GET.');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(schluessel)) return fehler(404, 'Diesen Bericht gibt es nicht oder der Link ist nicht mehr aktiv.');
  const { rows } = await ctx.pool.query<Record<string, unknown>>(`SELECT ${SPALTEN} FROM kooperation_reportings WHERE schluessel = $1 AND link_aktiv AND NOT archiviert AND NOT beispiel`, [schluessel]);
  if (!rows[0]) return fehler(404, 'Diesen Bericht gibt es nicht oder der Link ist nicht mehr aktiv.');
  const r = zuReporting(rows[0]);
  await ctx.pool.query(`UPDATE kooperation_reportings SET geoeffnet_am = $2 WHERE id = $1`, [r.id, ctx.jetzt().toISOString()]);
  const { rows: koop } = await ctx.pool.query<Record<string, unknown>>(`SELECT partner, marke FROM kooperationen WHERE id = $1`, [r.kooperation_id]);
  const creator = (await ctx.pool.query<{ name: string | null }>(`SELECT name FROM mediakit WHERE id = 'standard'`)).rows[0]?.name ?? '';
  return ok({
    instanz: await instanzName(ctx.pool),
    creator: creator ?? '',
    partner: text(koop[0]?.partner),
    marke: text(koop[0]?.marke),
    titel: r.titel,
    zeitraum_von: r.zeitraum_von,
    zeitraum_bis: r.zeitraum_bis,
    kennzahlen: r.kennzahlen,
    text: r.text,
    geteilt_am: r.geteilt_am,
  });
}
