import { gscAuswerten, gscZeitraum, ga4Auswerten, GA4_METRIKEN, hatQuelle, liesDaten, quellenFehler, zeitraum, type Ga4Antwort, type GscAntwort, type SpeedMessung, type TrackingDaten } from '../../../src/data/tracking';
import type { Store } from '../../../src/data/store';
import type { KundenTracking } from '../../../src/data/types';
import { pagespeed, type Strategie } from '../../shop-audit/src/pagespeed';

export interface KennzahlenAbhaengigkeiten {
  /** Access token of analytics@velonify.de (scopes analytics.readonly, webmasters.readonly); null = not set up. */
  googleToken: (() => Promise<string>) | null;
  pagespeedKey: string;
  fetch?: typeof fetch;
  jetzt: Date;
}

class QuellenFehler extends Error {}

async function holeJson<T>(f: typeof fetch, quelle: 'GA4' | 'Search Console', url: string, token: string, body: unknown): Promise<T> {
  const antwort = await f(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => '');
    const meldung = (() => {
      try {
        return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
      } catch {
        return text;
      }
    })();
    throw new QuellenFehler(quellenFehler(quelle, antwort.status, meldung));
  }
  return (await antwort.json()) as T;
}

/**
 * Fetches all sources of one client in parallel. A failing source is left out of the snapshot and reported in
 * `fehler`; the others still count.
 */
export async function holeKennzahlen(t: Pick<KundenTracking, 'ga4_property' | 'gsc_site' | 'pagespeed_url'>, d: KennzahlenAbhaengigkeiten): Promise<{ daten: TrackingDaten; fehler: string[] }> {
  const f = d.fetch ?? fetch;
  const daten: TrackingDaten = {};
  const fehler: string[] = [];
  const merke = (err: unknown, quelle: string) => fehler.push(err instanceof QuellenFehler ? err.message : `${quelle}: ${err instanceof Error ? err.message.slice(0, 160) : 'Fehler'}`);
  const token = (t.ga4_property || t.gsc_site) && d.googleToken ? await d.googleToken() : '';
  if ((t.ga4_property || t.gsc_site) && !d.googleToken) fehler.push('GA4/Search Console: Zugang von analytics@velonify.de ist nicht eingerichtet.');

  const ga4 = async () => {
    const z = zeitraum(d.jetzt);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(t.ga4_property)}:runReport`;
    const metriken = GA4_METRIKEN.map((name) => ({ name }));
    const bereich = [{ startDate: z.von, endDate: z.bis }];
    const [summe, kanaele, verlauf] = await Promise.all([
      holeJson<Ga4Antwort>(f, 'GA4', url, token, { dateRanges: [{ startDate: z.von, endDate: z.bis }, { startDate: z.vorher_von, endDate: z.vorher_bis }], metrics: metriken }),
      holeJson<Ga4Antwort>(f, 'GA4', url, token, { dateRanges: bereich, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'purchaseRevenue' }] }),
      holeJson<Ga4Antwort>(f, 'GA4', url, token, { dateRanges: bereich, dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'purchaseRevenue' }] }),
    ]);
    daten.ga4 = ga4Auswerten({ summe, kanaele, verlauf, zeitraum: z });
  };

  const gsc = async () => {
    const z = gscZeitraum(d.jetzt);
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(t.gsc_site)}/searchAnalytics/query`;
    const abfrage = (extra: Record<string, unknown>, von = z.von, bis = z.bis) => holeJson<GscAntwort>(f, 'Search Console', url, token, { startDate: von, endDate: bis, ...extra });
    const [summe, vorher, suchanfragen, seiten, verlauf] = await Promise.all([
      abfrage({}),
      abfrage({}, z.vorher_von, z.vorher_bis),
      abfrage({ dimensions: ['query'], rowLimit: 10 }),
      abfrage({ dimensions: ['page'], rowLimit: 10 }),
      abfrage({ dimensions: ['date'], rowLimit: 100 }),
    ]);
    daten.gsc = gscAuswerten({ summe, vorher, suchanfragen, seiten, verlauf, zeitraum: z });
  };

  const speed = async () => {
    const messen = async (s: Strategie): Promise<SpeedMessung | null> => {
      const { messung } = await pagespeed(t.pagespeed_url, s, d.pagespeedKey, f);
      return { score: messung.score, lcp_ms: messung.lcp_ms, cls: messung.cls, inp_ms: messung.inp_ms, quelle: messung.quelle };
    };
    const [mobil, desktop] = await Promise.all([messen('mobile'), messen('desktop')]);
    daten.pagespeed = { url: t.pagespeed_url, mobil, desktop };
  };

  await Promise.all([
    t.ga4_property && token ? ga4().catch((e) => merke(e, 'GA4')) : null,
    t.gsc_site && token ? gsc().catch((e) => merke(e, 'Search Console')) : null,
    t.pagespeed_url ? speed().catch((e) => merke(e, 'PageSpeed')) : null,
  ]);
  return { daten, fehler };
}

const QUELLEN = { ga4: 'ga4_property', gsc: 'gsc_site', pagespeed: 'pagespeed_url' } as const;

/**
 * Fetches the numbers of every client with a source (or of one client) and stores the snapshot. A source that fails
 * today keeps yesterday's numbers, so one hiccup does not empty the client's page; `fehler` tells the team.
 */
export async function aktualisiereKennzahlen(store: Store, d: KennzahlenAbhaengigkeiten, firmaId?: string): Promise<{ kunden: number; fehler: number }> {
  const { tracking } = await store.loadPortalDaten();
  const liste = tracking.filter((t) => hatQuelle(t) && (!firmaId || t.firma_id === firmaId));
  let fehlerAnzahl = 0;
  const ergebnisse = await Promise.all(
    liste.map(async (t) => {
      const { daten, fehler } = await holeKennzahlen(t, d);
      const alt = liesDaten(t) ?? {};
      for (const [quelle, feld] of Object.entries(QUELLEN) as [keyof TrackingDaten, (typeof QUELLEN)[keyof typeof QUELLEN]][]) {
        if (!daten[quelle] && t[feld] && alt[quelle]) Object.assign(daten, { [quelle]: alt[quelle] });
      }
      fehlerAnzahl += fehler.length;
      return { id: t.id, changes: { stand_am: d.jetzt.toISOString(), fehler: fehler.join('\n'), daten: JSON.stringify(daten) } };
    }),
  );
  if (ergebnisse.length) await store.update('kunden_tracking', ergebnisse);
  return { kunden: ergebnisse.length, fehler: fehlerAnzahl };
}
