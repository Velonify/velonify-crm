import { createHash } from 'node:crypto';
import { listeAus, teamName } from '../../../../../src/data/instanz';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../../routen';
import { baustein, fehler, istObjekt, neueId, ok, type CreatorKontext, type OeffentlichKontext } from '../modul';
import { Eingabefehler, instanzName, istTag, KANAELE, kanalListe, optText, tag, text, zeit } from './daten';
import { speichereKooperation } from './uebersicht';

/** Budget frames a brand can pick in the public form. */
export const BUDGETS = ['bis 1.000 €', '1.000–3.000 €', '3.000–10.000 €', 'über 10.000 €', 'noch offen'] as const;

/** At most this many requests per sender address and hour (on top of the general limit in index.ts). */
const JE_STUNDE = 5;
/** Faster than this after loading the form is a script, not a person. */
const MINDESTZEIT_MS = 3000;

export interface Anfrage {
  id: string;
  firma: string;
  ansprechpartner: string;
  email: string;
  marke: string;
  kanaele: string[];
  zeitraum_von: string;
  zeitraum_bis: string;
  budget: string;
  nachricht: string;
  status: 'neu' | 'uebernommen' | 'abgelehnt';
  kooperation_id: string;
  ablehnungsgrund: string;
  eingegangen_am: string;
  bearbeitet_von: string;
  bearbeitet_am: string;
}

const SPALTEN = `id, firma, ansprechpartner, email, marke, kanaele, zeitraum_von::text, zeitraum_bis::text, budget, nachricht, status, kooperation_id,
  ablehnungsgrund, eingegangen_am, bearbeitet_von, bearbeitet_am`;

function zuAnfrage(z: Record<string, unknown>): Anfrage {
  return {
    id: text(z.id),
    firma: text(z.firma),
    ansprechpartner: text(z.ansprechpartner),
    email: text(z.email),
    marke: text(z.marke),
    kanaele: Array.isArray(z.kanaele) ? z.kanaele.map(String) : [],
    zeitraum_von: tag(z.zeitraum_von),
    zeitraum_bis: tag(z.zeitraum_bis),
    budget: text(z.budget),
    nachricht: text(z.nachricht),
    status: text(z.status) as Anfrage['status'],
    kooperation_id: text(z.kooperation_id),
    ablehnungsgrund: text(z.ablehnungsgrund),
    eingegangen_am: zeit(z.eingegangen_am),
    bearbeitet_von: text(z.bearbeitet_von),
    bearbeitet_am: zeit(z.bearbeitet_am),
  };
}

/** Who answers requests: "antwortet" of the area Kooperationen, else every active admin of the instance. */
async function empfaenger(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ antwortet: string | null }>(`SELECT antwortet FROM zustaendigkeiten WHERE bereich = 'kooperationen'`);
  const namen = listeAus(rows[0]?.antwortet);
  if (namen.length > 0) return namen;
  const { rows: admins } = await db.query<{ email: string; name: string | null }>(`SELECT email, name FROM instanz_zugaenge WHERE rolle = 'admin' AND aktiv ORDER BY email`);
  return [...new Set(admins.map((a) => teamName({ email: a.email, name: a.name ?? '' })))];
}

/** A bell entry (erwaehnungen, like an @-mention) for everyone who answers requests. */
async function benachrichtige(db: Db, a: Anfrage, jetzt: Date): Promise<string[]> {
  const namen = await empfaenger(db);
  const auszug = a.nachricht.replace(/\s+/g, ' ').trim();
  for (const person of namen) {
    await db.query(
      `INSERT INTO erwaehnungen (id, person, von, datum, art, quelle_id, aufgabe_id, firma_id, titel, auszug, link, gelesen_am)
       VALUES ($1, $2, 'Anfrageformular', $3, 'kooperation', $4, '', '', $5, $6, $7, '')`,
      [neueId('ER'), person, jetzt.toISOString(), a.id, `Kooperationsanfrage: ${a.firma}${a.marke ? ` (${a.marke})` : ''}`.slice(0, 200), auszug.length > 180 ? `${auszug.slice(0, 179)}…` : auszug, `/kooperationen/anfragen?id=${a.id}`],
    );
  }
  return namen;
}

const pflicht = (w: unknown, feld: string, max: number): string => {
  const t = optText(w, feld, max);
  if (!t) throw new Eingabefehler(`Bitte ${feld} angeben.`);
  return t;
};

/** Public: GET form settings, POST a request. */
export async function anfrageOeffentlich(methode: string, body: unknown, ctx: OeffentlichKontext): Promise<Antwort> {
  if (!ctx.bausteine.includes('anfrageformular')) return fehler(404, 'Unbekannte Seite.');
  if (methode === 'GET') {
    const { rows } = await ctx.pool.query<{ plattform: string }>('SELECT DISTINCT plattform FROM kanal_konten');
    const eigene = rows.map((r) => r.plattform).filter((p) => (KANAELE as readonly string[]).includes(p));
    return ok({ name: await instanzName(ctx.pool), kanaele: eigene.length ? KANAELE.filter((k) => eigene.includes(k)) : KANAELE, budgets: BUDGETS, mediakit: ctx.bausteine.includes('mediakit') });
  }
  if (methode !== 'POST') return fehler(405, 'Nur GET oder POST.');
  if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
  // Honeypot: people never see the field "website"; bots fill it. Answer as if it worked, store nothing.
  if (typeof body.website === 'string' && body.website.trim()) return ok({ ok: true });
  if (typeof body.geladen_ms === 'number' && body.geladen_ms < MINDESTZEIT_MS) return ok({ ok: true });

  try {
    const firma = pflicht(body.firma, 'die Firma', 200);
    const ansprechpartner = pflicht(body.ansprechpartner, 'eine Ansprechperson', 200);
    const email = pflicht(body.email, 'eine E-Mail-Adresse', 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Eingabefehler('Die E-Mail-Adresse sieht nicht gültig aus.');
    const marke = optText(body.marke, 'Marke oder Produkt', 200) ?? null;
    const kanaele = body.kanaele === undefined ? [] : kanalListe(body.kanaele);
    const von = body.zeitraum_von ? String(body.zeitraum_von) : null;
    const bis = body.zeitraum_bis ? String(body.zeitraum_bis) : null;
    if ((von && !istTag(von)) || (bis && !istTag(bis))) throw new Eingabefehler('Zeitraum bitte als Datum.');
    if (von && bis && bis < von) throw new Eingabefehler('Der Zeitraum endet vor seinem Beginn.');
    const budget = body.budget === undefined || body.budget === '' ? null : String(body.budget);
    if (budget && !(BUDGETS as readonly string[]).includes(budget)) throw new Eingabefehler('Bitte einen Budget-Rahmen aus der Liste wählen.');
    const nachricht = pflicht(body.nachricht, 'eine kurze Nachricht', 5000);
    if (nachricht.length < 20) throw new Eingabefehler('Bitte beschreibt eure Idee in ein, zwei Sätzen (mindestens 20 Zeichen).');
    if (body.einwilligung !== true) throw new Eingabefehler('Bitte bestätigt, dass wir eure Angaben zur Bearbeitung speichern dürfen.');

    const herkunft = ctx.herkunft ? createHash('sha256').update(ctx.herkunft).digest('hex') : null;
    if (herkunft) {
      const { rows } = await ctx.pool.query<{ anzahl: string }>(`SELECT count(*) AS anzahl FROM kooperation_anfragen WHERE herkunft = $1 AND eingegangen_am > $2`, [
        herkunft,
        new Date(ctx.jetzt().getTime() - 3600_000).toISOString(),
      ]);
      if (Number(rows[0].anzahl) >= JE_STUNDE) return fehler(429, 'Ihr habt gerade schon mehrere Anfragen geschickt. Bitte später noch einmal.');
    }
    const { rows } = await ctx.pool.query<Record<string, unknown>>(
      `INSERT INTO kooperation_anfragen (id, firma, ansprechpartner, email, marke, kanaele, zeitraum_von, zeitraum_bis, budget, nachricht, herkunft, eingegangen_am)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${SPALTEN}`,
      [neueId('KA'), firma, ansprechpartner, email.toLowerCase(), marke, kanaele, von, bis, budget, nachricht, herkunft, ctx.jetzt().toISOString()],
    );
    await benachrichtige(ctx.pool, zuAnfrage(rows[0]), ctx.jetzt());
    // Never echo internal data: only "received".
    return ok({ ok: true });
  } catch (err) {
    if (err instanceof Eingabefehler) return fehler(400, err.message);
    throw err;
  }
}

/** Signed in: /c/kooperationen/anfragen… */
export async function anfragenRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext, heute: string): Promise<Antwort | null> {
  if (!pfad.startsWith('/c/kooperationen/anfragen')) return null;
  const zu = baustein(ctx, 'anfrageformular');
  if (zu) return zu;
  const db = ctx.pool;

  if (pfad === '/c/kooperationen/anfragen' && methode === 'GET') {
    const { rows } = await db.query<Record<string, unknown>>(`SELECT ${SPALTEN} FROM kooperation_anfragen ORDER BY status = 'neu' DESC, eingegangen_am DESC LIMIT 300`);
    return ok({ anfragen: rows.map(zuAnfrage), empfaenger: await empfaenger(db) });
  }
  if (methode !== 'POST' || !istObjekt(body) || typeof body.id !== 'string') return methode === 'POST' ? fehler(400, 'Anfrage fehlt.') : null;
  const { rows } = await db.query<Record<string, unknown>>(`SELECT ${SPALTEN} FROM kooperation_anfragen WHERE id = $1`, [body.id]);
  if (!rows[0]) return fehler(404, 'Anfrage nicht gefunden.');
  const a = zuAnfrage(rows[0]);
  if (a.status !== 'neu') return fehler(409, a.status === 'uebernommen' ? 'Diese Anfrage ist schon in der Pipeline.' : 'Diese Anfrage wurde schon abgelehnt.');

  if (pfad === '/c/kooperationen/anfragen/uebernehmen') {
    const notiz = [`Anfrage über das Formular vom ${a.eingegangen_am.slice(0, 10)}.`, a.budget ? `Budget-Rahmen: ${a.budget}.` : '', '', a.nachricht].filter((z, i) => z || i === 2).join('\n');
    const k = await speichereKooperation(
      ctx,
      {
        partner: a.firma,
        marke: a.marke || null,
        ansprechpartner: a.ansprechpartner,
        email: a.email,
        kanaele: a.kanaele,
        zeitraum_von: a.zeitraum_von || null,
        zeitraum_bis: a.zeitraum_bis || null,
        stand: 'anfrage',
        notiz,
        ueber_agentur: body.ueber_agentur === true,
        zustaendig: typeof body.zustaendig === 'string' ? body.zustaendig : ctx.person,
        wiedervorlage: typeof body.wiedervorlage === 'string' && body.wiedervorlage ? body.wiedervorlage : null,
      },
      heute,
    );
    await db.query(`UPDATE kooperationen SET anfrage_id = $2 WHERE id = $1`, [k.id, a.id]);
    await db.query(`UPDATE kooperation_anfragen SET status = 'uebernommen', kooperation_id = $2, bearbeitet_von = $3, bearbeitet_am = now() WHERE id = $1`, [a.id, k.id, ctx.person]);
    return ok({ kooperation: { ...k, anfrage_id: a.id } });
  }
  if (pfad === '/c/kooperationen/anfragen/ablehnen') {
    const grund = optText(body.grund, 'Grund', 1000) ?? null;
    await db.query(`UPDATE kooperation_anfragen SET status = 'abgelehnt', ablehnungsgrund = $2, bearbeitet_von = $3, bearbeitet_am = now() WHERE id = $1`, [a.id, grund, ctx.person]);
    return ok();
  }
  return null;
}
