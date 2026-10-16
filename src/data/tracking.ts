/**
 * Tracking hub: a client's numbers from Google Analytics 4, Search Console and PageSpeed. The portal function fetches
 * them once a day with analytics@velonify.de (added as viewer by the client or by us) and keeps the last snapshot in
 * kunden_tracking.daten; the hub and the portal only read that snapshot.
 */
import { ValidationError } from './errors';
import type { KundenTracking } from './types';

/** Last 28 full days against the 28 before. Search Console lags about two days, so its window ends earlier. */
export const ZEITRAUM_TAGE = 28;
const GSC_VERZUG_TAGE = 2;

export interface Zeitraum {
  von: string;
  bis: string;
  vorher_von: string;
  vorher_bis: string;
}

export interface Ga4Summen {
  nutzer: number;
  sitzungen: number;
  umsatz: number;
  transaktionen: number;
  /** transaktionen / sitzungen, 0–1 */
  conversion_rate: number;
}

export interface Ga4Daten extends Ga4Summen {
  vorher: Ga4Summen;
  zeitraum: Zeitraum;
  kanaele: { name: string; sitzungen: number; umsatz: number }[];
  verlauf: { tag: string; sitzungen: number; umsatz: number }[];
  waehrung: string;
}

export interface GscSummen {
  klicks: number;
  impressionen: number;
  /** 0–1 */
  ctr: number;
  position: number;
}

export interface GscDaten extends GscSummen {
  vorher: GscSummen;
  zeitraum: Zeitraum;
  suchanfragen: { suchanfrage: string; klicks: number; impressionen: number; position: number }[];
  seiten: { seite: string; klicks: number; impressionen: number }[];
  verlauf: { tag: string; klicks: number; impressionen: number }[];
}

export interface SpeedMessung {
  score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  /** "feld" = real users (Chrome UX Report), "labor" = one Lighthouse run */
  quelle: 'feld' | 'labor';
}

export interface SpeedDaten {
  url: string;
  mobil: SpeedMessung | null;
  desktop: SpeedMessung | null;
}

/** The snapshot in kunden_tracking.daten. Each source is missing when not set up or when it failed. */
export interface TrackingDaten {
  ga4?: Ga4Daten;
  gsc?: GscDaten;
  pagespeed?: SpeedDaten;
}

const tag = (d: Date) => d.toISOString().slice(0, 10);
const minusTage = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000);

/** The window ending `verzug` days before today (UTC days are close enough for 28-day sums). */
export function zeitraum(jetzt: Date, verzug = 1): Zeitraum {
  const bis = minusTage(jetzt, verzug);
  const von = minusTage(bis, ZEITRAUM_TAGE - 1);
  const vorherBis = minusTage(von, 1);
  return { von: tag(von), bis: tag(bis), vorher_von: tag(minusTage(vorherBis, ZEITRAUM_TAGE - 1)), vorher_bis: tag(vorherBis) };
}

export const gscZeitraum = (jetzt: Date) => zeitraum(jetzt, GSC_VERZUG_TAGE + 1);

/** Change in percent against the period before; null when there is nothing to compare with. */
export function veraenderung(jetzt: number, vorher: number): number | null {
  if (!vorher) return null;
  return Math.round(((jetzt - vorher) / vorher) * 1000) / 10;
}

export function liesDaten(t: Pick<KundenTracking, 'daten'> | undefined): TrackingDaten | null {
  if (!t?.daten) return null;
  try {
    const d = JSON.parse(t.daten) as TrackingDaten;
    return d && typeof d === 'object' && (d.ga4 || d.gsc || d.pagespeed) ? d : null;
  } catch {
    return null;
  }
}

export const trackingVon = (liste: readonly KundenTracking[], firmaId: string) => liste.find((t) => t.firma_id === firmaId);
export const hatQuelle = (t: Pick<KundenTracking, 'ga4_property' | 'gsc_site' | 'pagespeed_url'>) => !!(t.ga4_property || t.gsc_site || t.pagespeed_url);

export interface TrackingEingabe {
  ga4_property: string;
  gsc_site: string;
  pagespeed_url: string;
  sichtbar_kunde: boolean;
}

/** Cleans the setup from the hub: "properties/123" or "123" for GA4, a domain or URL property for Search Console. */
export function prepareTracking(e: TrackingEingabe): TrackingEingabe {
  const ga4 = e.ga4_property.trim().replace(/^properties\//, '');
  if (ga4 && !/^\d{5,}$/.test(ga4)) throw new ValidationError('ga4_property', 'Die GA4-Property-ID besteht nur aus Ziffern (Verwaltung → Property-Einstellungen).');
  let gsc = e.gsc_site.trim();
  if (gsc && !gsc.startsWith('sc-domain:')) {
    if (/^https?:\/\//.test(gsc)) gsc = gsc.endsWith('/') ? gsc : `${gsc}/`;
    else if (/^[\w.-]+\.[a-z]{2,}$/i.test(gsc)) gsc = `sc-domain:${gsc.toLowerCase()}`;
    else throw new ValidationError('gsc_site', 'Search Console: Domain (beispiel.de) oder URL-Präfix (https://www.beispiel.de/) eintragen.');
  }
  let url = e.pagespeed_url.trim();
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
  if (url) {
    try {
      new URL(url);
    } catch {
      throw new ValidationError('pagespeed_url', 'Die Adresse für PageSpeed ist keine gültige URL.');
    }
  }
  return { ga4_property: ga4, gsc_site: gsc, pagespeed_url: url, sichtbar_kunde: e.sichtbar_kunde };
}

// ─── Reading the API answers ────────────────────────────────────────────────

interface Ga4Zeile {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface Ga4Antwort {
  rows?: Ga4Zeile[];
  metadata?: { currencyCode?: string };
}

const n = (wert: string | undefined) => Number(wert ?? 0) || 0;
const rund2 = (wert: number) => Math.round(wert * 100) / 100;

/** GA4 metrics asked for in this order. */
export const GA4_METRIKEN = ['totalUsers', 'sessions', 'purchaseRevenue', 'transactions'] as const;

function summen(zeile: Ga4Zeile | undefined): Ga4Summen {
  const [nutzer, sitzungen, umsatz, transaktionen] = GA4_METRIKEN.map((_, i) => n(zeile?.metricValues?.[i]?.value));
  return { nutzer, sitzungen, umsatz: rund2(umsatz), transaktionen, conversion_rate: sitzungen ? transaktionen / sitzungen : 0 };
}

/**
 * Three runReport answers: totals over both ranges (dimension dateRange), by channel group, by day.
 * With two date ranges GA4 adds a "dateRange" dimension whose value is "date_range_0" / "date_range_1".
 */
export function ga4Auswerten(args: { summe: Ga4Antwort; kanaele: Ga4Antwort; verlauf: Ga4Antwort; zeitraum: Zeitraum }): Ga4Daten {
  const zeile = (name: string) => args.summe.rows?.find((r) => r.dimensionValues?.some((d) => d.value === name));
  const jetzt = summen(zeile('date_range_0'));
  return {
    ...jetzt,
    vorher: summen(zeile('date_range_1')),
    zeitraum: args.zeitraum,
    waehrung: args.summe.metadata?.currencyCode || 'EUR',
    kanaele: (args.kanaele.rows ?? [])
      .map((r) => ({ name: r.dimensionValues?.[0]?.value || '(nicht gesetzt)', sitzungen: n(r.metricValues?.[0]?.value), umsatz: rund2(n(r.metricValues?.[1]?.value)) }))
      .sort((a, b) => b.sitzungen - a.sitzungen)
      .slice(0, 8),
    verlauf: (args.verlauf.rows ?? [])
      .map((r) => {
        const d = r.dimensionValues?.[0]?.value ?? '';
        return { tag: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, sitzungen: n(r.metricValues?.[0]?.value), umsatz: rund2(n(r.metricValues?.[1]?.value)) };
      })
      .sort((a, b) => a.tag.localeCompare(b.tag)),
  };
}

interface GscZeile {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}
export interface GscAntwort {
  rows?: GscZeile[];
}

function gscSummen(a: GscAntwort): GscSummen {
  const z = a.rows?.[0];
  return { klicks: z?.clicks ?? 0, impressionen: z?.impressions ?? 0, ctr: z?.ctr ?? 0, position: rund2(z?.position ?? 0) };
}

export function gscAuswerten(args: { summe: GscAntwort; vorher: GscAntwort; suchanfragen: GscAntwort; seiten: GscAntwort; verlauf: GscAntwort; zeitraum: Zeitraum }): GscDaten {
  return {
    ...gscSummen(args.summe),
    vorher: gscSummen(args.vorher),
    zeitraum: args.zeitraum,
    suchanfragen: (args.suchanfragen.rows ?? []).map((r) => ({ suchanfrage: r.keys?.[0] ?? '', klicks: r.clicks ?? 0, impressionen: r.impressions ?? 0, position: rund2(r.position ?? 0) })),
    seiten: (args.seiten.rows ?? []).map((r) => ({ seite: r.keys?.[0] ?? '', klicks: r.clicks ?? 0, impressionen: r.impressions ?? 0 })),
    verlauf: (args.verlauf.rows ?? []).map((r) => ({ tag: r.keys?.[0] ?? '', klicks: r.clicks ?? 0, impressionen: r.impressions ?? 0 })).sort((a, b) => a.tag.localeCompare(b.tag)),
  };
}

/** Human error text for the team when a source fails (403 = analytics@ is not a viewer yet). */
export function quellenFehler(quelle: 'GA4' | 'Search Console' | 'PageSpeed', status: number, text: string): string {
  if (status === 403) return `${quelle}: kein Zugriff – analytics@velonify.de als Betrachter hinzufügen.`;
  if (status === 404) return `${quelle}: Property nicht gefunden – ID prüfen.`;
  return `${quelle}: ${status || 'Fehler'} ${text.slice(0, 140)}`.trim();
}
