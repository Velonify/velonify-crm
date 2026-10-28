import { darfEinrichten, type BausteinId } from '../../../../src/data/instanz';
import type { Antwort } from '../routen';
import { ableitung, benchmarkAbruf, benchmarkLesen, benchmarkSpeichern, benchmarkWert, berichtEinschaetzen, berichtErstellen, berichtFreigeben, berichtLesen, listeSpeichern, merkmaleVorschlagen, merkmalSpeichern } from './analytics/auswertung';
import { beispiele } from './analytics/beispiele';
import { BENCHMARK_FELDER, benchmarkImport, benchmarkVorschau, STUDIO_FELDER, studioImport, studioVorschau } from './analytics/csv';
import { kontenLesen, listenLesen, merkmalVergleich, videosLesen, type Zeile } from './analytics/daten';
import type { Dienste, Holen } from './analytics/gemeinsam';
import { abrufen, rueckruf, trennen, verbinden } from './analytics/kanaele';
import { ADAPTER, konfigFuer } from './analytics/plattformen';
import { clipAufgabe, clipsVorschlagen, clipVerwerfen, twitchLesen, twitchValidieren } from './analytics/twitch';
import { fehler, istObjekt, ok, type CreatorKontext, type Modul, type TaktKontext } from './modul';

/**
 * Modul Kanäle und Analytics (Bauplan Abschnitt 11, Punkte 12–20). The work lives in ./analytics/*; this file maps paths
 * to it, checks the building block of every path and turns thrown `{status}` errors into answers.
 */

/** Building block each path below /c/analytics needs; first match wins. */
const BAUSTEIN_FUER: [RegExp, BausteinId][] = [
  [/^\/merkmale/, 'merkmale'],
  [/^\/berichte\/ableitung$/, 'ableitungen'],
  [/^\/berichte/, 'berichte'],
  [/^\/benchmark/, 'benchmarking'],
  [/^\/twitch/, 'twitch'],
  [/^/, 'kanaele'],
];

async function mitStatus(arbeit: () => Promise<Antwort | null>): Promise<Antwort | null> {
  try {
    return await arbeit();
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && err instanceof Error) return fehler(status, err.message);
    throw err;
  }
}

const dienste = (ctx: CreatorKontext, holen: Holen): Dienste => ({
  pool: ctx.pool,
  ki: ctx.ki,
  geheimnisse: ctx.geheimnisse,
  umgebung: ctx.umgebung,
  bausteine: ctx.sicht.bausteine,
  holen,
  jetzt: ctx.jetzt,
  person: ctx.person,
  email: ctx.email,
});

const taktDienste = (ctx: TaktKontext, holen: Holen): Dienste => ({ ...ctx, holen });

/** Whether a weekly or monthly report is due today (Mondays and the 1st), in Europe/Berlin. */
export function faellig(jetzt: Date): { woche: boolean; monat: boolean } {
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric' }).formatToParts(jetzt);
  return { woche: teile.find((t) => t.type === 'weekday')?.value === 'Mon', monat: teile.find((t) => t.type === 'day')?.value === '1' };
}

async function routen(methode: string, pfad: string, body: unknown, ctx: CreatorKontext, holen: Holen): Promise<Antwort | null> {
  const rest = pfad.replace(/^\/c\/analytics/, '') || '/';
  const noetig = BAUSTEIN_FUER.find(([muster]) => muster.test(rest))![1];
  if (!ctx.sicht.bausteine.includes(noetig)) return fehler(403, 'Dieser Baustein ist in eurem Hub nicht eingeschaltet.');
  const b: Zeile = istObjekt(body) ? body : {};
  const d = dienste(ctx, holen);

  if (methode === 'GET') {
    switch (rest) {
      case '/':
      case '/uebersicht': {
        const videos = await videosLesen(ctx.pool);
        const konten = await kontenLesen(ctx.pool);
        return ok({ konten, videos, vergleich: merkmalVergleich(videos), beispiel: konten.some((k) => (k as Zeile).beispiel === true) });
      }
      case '/kanaele':
        return ok({
          konten: await kontenLesen(ctx.pool),
          // Missing variables per platform, only for admins (so they know what to set up).
          einrichtung: Object.fromEntries(Object.entries(ADAPTER).map(([p, a]) => [p, darfEinrichten(ctx.rolle) ? konfigFuer(a, ctx.umgebung).fehlt : []])),
          studio_felder: STUDIO_FELDER,
        });
      case '/merkmale': {
        const videos = await videosLesen(ctx.pool);
        return ok({ listen: await listenLesen(ctx.pool), videos, vergleich: merkmalVergleich(videos) });
      }
      case '/berichte':
        return ok({ berichte: await berichtLesen(ctx.pool) });
      case '/benchmark':
        return ok({ ...(await benchmarkLesen(ctx.pool)), csv_felder: BENCHMARK_FELDER });
      case '/twitch':
        return ok(await twitchLesen(ctx));
    }
    const bericht = /^\/berichte\/([A-Za-z0-9-]+)$/.exec(rest);
    if (bericht) {
      const [r] = await berichtLesen(ctx.pool, bericht[1]);
      return r ? ok({ bericht: r }) : fehler(404, 'Bericht nicht gefunden.');
    }
    return null;
  }
  if (methode !== 'POST') return null;

  switch (rest) {
    case '/verbinden':
      return ok(await verbinden(b, ctx));
    case '/trennen':
      return ok(await trennen(b, ctx));
    case '/abrufen':
      if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Den Abruf starten nur Admins.');
      return ok(await abrufen(d, typeof b.id === 'string' ? b.id : undefined));
    case '/beispiele':
      return ok(await beispiele(ctx));
    case '/studio/vorschau':
      return ok(await studioVorschau(ctx.pool, b));
    case '/studio/import':
      if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Exporte importieren nur Admins.');
      return ok(await studioImport(ctx.pool, b, ctx.person));
    case '/merkmale/speichern':
      return ok(await merkmalSpeichern(b, ctx));
    case '/merkmale/liste':
      return ok(await listeSpeichern(b, ctx));
    case '/merkmale/vorschlagen':
      return ok(await merkmaleVorschlagen(d, typeof b.video_id === 'string' ? b.video_id : undefined));
    case '/berichte/erstellen':
      return ok(await berichtErstellen(d, String(b.typ ?? '')));
    case '/berichte/einschaetzen':
      return ok(await berichtEinschaetzen(b, ctx));
    case '/berichte/freigeben':
      return ok(await berichtFreigeben(b, ctx));
    case '/berichte/ableitung':
      return ok(await ableitung(b, ctx));
    case '/benchmark/kanal':
      return ok(await benchmarkSpeichern(b, ctx));
    case '/benchmark/wert':
      return ok(await benchmarkWert(b, ctx));
    case '/benchmark/vorschau':
      return ok(benchmarkVorschau(b));
    case '/benchmark/import':
      return ok(await benchmarkImport(ctx.pool, b, ctx.person));
    case '/benchmark/abrufen':
      return ok(await benchmarkAbruf(d));
    case '/twitch/vorschlagen':
      return ok(await clipsVorschlagen(b, d));
    case '/twitch/aufgabe':
      return ok(await clipAufgabe(b, ctx));
    case '/twitch/verwerfen':
      return ok(await clipVerwerfen(b, ctx));
  }
  return null;
}

/** All requests to the platforms can be replaced in tests (`holen`). */
export function analyticsModulMit(holen: Holen = (...args) => fetch(...args)): Modul {
  return {
    praefix: 'analytics',
    routen: (m, p, b, ctx) => mitStatus(() => routen(m, p, b, ctx, holen)),
    oeffentlich: (m, p, _b, ctx, query) =>
      mitStatus(async () => {
        const treffer = /^\/oeffentlich\/analytics\/rueckruf\/([a-z]+)$/.exec(p);
        if (!treffer || m !== 'GET') return null;
        return ok(await rueckruf(treffer[1], query, ctx, holen));
      }),
    takte: {
      // Daily: numbers of all connected channels, features for new videos, public benchmark numbers.
      abruf: async (ctx) => {
        const d = taktDienste(ctx, holen);
        const kanaele = await abrufen(d);
        const merkmale = await merkmaleVorschlagen(d).catch((e: Error) => ({ fehler: e.message }));
        const benchmark = await benchmarkAbruf(d).catch((e: Error) => ({ fehler: e.message }));
        return { kanaele, merkmale, benchmark };
      },
      // Daily as well; writes the weekly report on Mondays and the monthly one on the 1st (each only once).
      berichte: async (ctx) => {
        if (!ctx.bausteine.includes('berichte')) return { uebersprungen: true };
        const d = taktDienste(ctx, holen);
        const { woche, monat } = faellig(ctx.jetzt());
        return {
          woche: woche ? await berichtErstellen(d, 'woche').catch((e: Error) => ({ fehler: e.message })) : null,
          monat: monat ? await berichtErstellen(d, 'monat').catch((e: Error) => ({ fehler: e.message })) : null,
        };
      },
      // Hourly: Twitch requires apps to validate their tokens regularly.
      'twitch-validierung': (ctx) => twitchValidieren(taktDienste(ctx, holen)),
    },
  };
}

export const analyticsModul = analyticsModulMit();
