export type Strategie = 'mobile' | 'desktop';

/** One of the largest savings Lighthouse reports ("Bilder optimieren", "Nicht verwendetes JavaScript" …). */
export interface Bremse {
  id: string;
  /** German title from Lighthouse (locale=de). */
  titel: string;
  /** e.g. "Geschätzte Einsparung von 513 KiB" */
  anzeige: string;
  /** Estimated saving on LCP or FCP in ms (0 when unknown). */
  ms: number;
  bytes: number;
}

export interface Drittanbieter {
  name: string;
  kb: number;
  /** Main-thread time in ms */
  ms: number;
}

export interface Messung {
  strategie: Strategie;
  /** Lighthouse performance score 0–100 (lab). */
  score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  /** Only field data has INP; the lab run cannot measure interactions. */
  inp_ms: number | null;
  /** "feld" = Chrome UX Report (real users), "labor" = one Lighthouse run. */
  quelle: 'feld' | 'labor';
  bytes: number | null;
  anfragen: number | null;
  fcp_ms: number | null;
  tbt_ms: number | null;
  /** Time to first byte: field value when available, else Lighthouse's server response time. */
  ttfb_ms: number | null;
  /** Whether Google has real-user data for this page, only for the whole origin, or none – a rough traffic signal. */
  felddaten: 'seite' | 'origin' | 'keine';
  bremsen: Bremse[];
  drittanbieter: Drittanbieter[];
}

interface FeldMetrik {
  percentile?: number;
}
interface Erfahrung {
  metrics?: Record<string, FeldMetrik>;
  origin_fallback?: boolean;
}
interface Audit {
  score?: number | null;
  title?: string;
  displayValue?: string;
  numericValue?: number;
  metricSavings?: Record<string, number>;
  details?: { type?: string; items?: Record<string, unknown>[]; overallSavingsMs?: number; overallSavingsBytes?: number };
}
export interface PsiAntwort {
  loadingExperience?: Erfahrung;
  originLoadingExperience?: Erfahrung;
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, Audit>;
  };
}

const zahl = (wert: unknown) => (typeof wert === 'number' && Number.isFinite(wert) ? wert : null);
const rund = (wert: number | null) => (wert === null ? null : Math.round(wert));

/** Audits that are not savings of their own or have a finding of their own. */
const KEINE_BREMSE = new Set(['server-response-time', 'third-parties-insight', 'lcp-discovery-insight', 'network-dependency-tree-insight', 'mainthread-work-breakdown', 'bf-cache', 'unsized-images', 'interactive']);

/** "Geschätzte Einsparung von 513 KiB" → bytes */
function bytesAusText(text: string): number {
  const m = /([\d.,]+)\s*(KiB|MiB)/.exec(text);
  if (!m) return 0;
  const wert = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Math.round(wert * (m[2] === 'MiB' ? 1024 * 1024 : 1024));
}

function bremsenAus(audits: Record<string, Audit>): Bremse[] {
  return Object.entries(audits)
    .filter(([id, a]) => !KEINE_BREMSE.has(id) && a.score != null && a.score < 0.9 && (a.metricSavings || a.details?.type === 'opportunity'))
    .map(([id, a]) => ({
      id,
      titel: (a.title ?? id).trim(),
      anzeige: (a.displayValue ?? '').trim(),
      ms: Math.round(Math.max(a.metricSavings?.LCP ?? 0, a.metricSavings?.FCP ?? 0, a.details?.overallSavingsMs ?? 0)),
      bytes: Math.round(a.details?.overallSavingsBytes ?? bytesAusText(a.displayValue ?? '')),
    }))
    .filter((b) => b.ms >= 100 || b.bytes >= 100 * 1024)
    .sort((a, b) => b.ms - a.ms || b.bytes - a.bytes)
    .slice(0, 4);
}

function drittanbieterAus(audits: Record<string, Audit>): Drittanbieter[] {
  const items = audits['third-parties-insight']?.details?.items ?? audits['third-party-summary']?.details?.items ?? [];
  return items
    .map((i) => ({
      name: typeof i.entity === 'string' ? i.entity : String((i.entity as { text?: string } | undefined)?.text ?? ''),
      kb: Math.round((zahl(i.transferSize) ?? 0) / 1024),
      ms: Math.round(zahl(i.mainThreadTime) ?? zahl(i.blockingTime) ?? 0),
    }))
    .filter((d) => d.name)
    .sort((a, b) => b.ms - a.ms || b.kb - a.kb)
    .slice(0, 6);
}

/** Script URLs the lab run loaded, including tools the Tag Manager injects later. Used for technology detection only. */
export function skripteAus(antwort: PsiAntwort): string[] {
  const items = antwort.lighthouseResult?.audits?.['network-requests']?.details?.items ?? [];
  return items
    .filter((i) => i.resourceType === 'Script' && typeof i.url === 'string')
    .map((i) => String(i.url))
    .slice(0, 400);
}

/** Reads the parts of a PageSpeed Insights v5 response the audit needs. Field data wins over lab data. */
export function werteAus(antwort: PsiAntwort, strategie: Strategie): Messung {
  const audits = antwort.lighthouseResult?.audits ?? {};
  const score = zahl(antwort.lighthouseResult?.categories?.performance?.score);
  const seite = antwort.loadingExperience;
  const hatWerte = (e?: Erfahrung) => e?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile != null;
  const feld = hatWerte(seite) ? seite!.metrics : hatWerte(antwort.originLoadingExperience) ? antwort.originLoadingExperience!.metrics : undefined;
  const felddaten = hatWerte(seite) && !seite!.origin_fallback ? 'seite' : feld ? 'origin' : 'keine';

  const labor = {
    lcp_ms: zahl(audits['largest-contentful-paint']?.numericValue),
    cls: zahl(audits['cumulative-layout-shift']?.numericValue),
  };
  const messung: Messung = {
    strategie,
    score: score === null ? null : Math.round(score * 100),
    lcp_ms: rund(labor.lcp_ms),
    cls: labor.cls === null ? null : Math.round(labor.cls * 100) / 100,
    inp_ms: null,
    quelle: 'labor',
    bytes: zahl(audits['total-byte-weight']?.numericValue),
    anfragen: audits['network-requests']?.details?.items?.length ?? null,
    fcp_ms: rund(zahl(audits['first-contentful-paint']?.numericValue)),
    tbt_ms: rund(zahl(audits['total-blocking-time']?.numericValue)),
    ttfb_ms: rund(zahl(audits['server-response-time']?.numericValue)),
    felddaten,
    bremsen: bremsenAus(audits),
    drittanbieter: drittanbieterAus(audits),
  };
  if (feld) {
    messung.quelle = 'feld';
    messung.lcp_ms = zahl(feld.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
    const cls = zahl(feld.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
    // CrUX reports CLS multiplied by 100.
    messung.cls = cls === null ? messung.cls : cls / 100;
    messung.inp_ms = zahl(feld.INTERACTION_TO_NEXT_PAINT?.percentile);
    messung.fcp_ms = zahl(feld.FIRST_CONTENTFUL_PAINT_MS?.percentile) ?? messung.fcp_ms;
    messung.ttfb_ms = zahl(feld.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile) ?? messung.ttfb_ms;
  }
  return messung;
}

export interface PagespeedErgebnis {
  messung: Messung;
  skripte: string[];
}

/** One PageSpeed run. Takes 10–40 s; throws with a readable message on failure. */
export async function pagespeed(url: string, strategie: Strategie, key: string, fetcher: typeof fetch = fetch): Promise<PagespeedErgebnis> {
  const params = new URLSearchParams({ url, strategy: strategie, category: 'performance', locale: 'de' });
  if (key) params.set('key', key);
  const antwort = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
    signal: AbortSignal.timeout(75_000),
  });
  if (!antwort.ok) {
    const body = (await antwort.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`PageSpeed ${antwort.status}: ${(body.error?.message ?? '').slice(0, 160)}`);
  }
  const json = (await antwort.json()) as PsiAntwort;
  return { messung: werteAus(json, strategie), skripte: skripteAus(json) };
}
