export type Strategie = 'mobile' | 'desktop';

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
}

interface FeldMetrik {
  percentile?: number;
}
interface Erfahrung {
  metrics?: Record<string, FeldMetrik>;
}
interface PsiAntwort {
  loadingExperience?: Erfahrung;
  originLoadingExperience?: Erfahrung;
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number; details?: { items?: unknown[] } }>;
  };
}

const zahl = (wert: unknown) => (typeof wert === 'number' && Number.isFinite(wert) ? wert : null);

/** Reads the parts of a PageSpeed Insights v5 response the audit needs. Field data wins over lab data. */
export function werteAus(antwort: PsiAntwort, strategie: Strategie): Messung {
  const audits = antwort.lighthouseResult?.audits ?? {};
  const score = zahl(antwort.lighthouseResult?.categories?.performance?.score);
  const feld = [antwort.loadingExperience, antwort.originLoadingExperience].find((e) => e?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile != null)?.metrics;

  const labor = {
    lcp_ms: zahl(audits['largest-contentful-paint']?.numericValue),
    cls: zahl(audits['cumulative-layout-shift']?.numericValue),
  };
  const messung: Messung = {
    strategie,
    score: score === null ? null : Math.round(score * 100),
    lcp_ms: labor.lcp_ms === null ? null : Math.round(labor.lcp_ms),
    cls: labor.cls === null ? null : Math.round(labor.cls * 100) / 100,
    inp_ms: null,
    quelle: 'labor',
    bytes: zahl(audits['total-byte-weight']?.numericValue),
    anfragen: audits['network-requests']?.details?.items?.length ?? null,
  };
  if (feld) {
    messung.quelle = 'feld';
    messung.lcp_ms = zahl(feld.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
    const cls = zahl(feld.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
    // CrUX reports CLS multiplied by 100.
    messung.cls = cls === null ? messung.cls : cls / 100;
    messung.inp_ms = zahl(feld.INTERACTION_TO_NEXT_PAINT?.percentile);
  }
  return messung;
}

/** One PageSpeed run. Takes 10–40 s; throws with a readable message on failure. */
export async function pagespeed(url: string, strategie: Strategie, key: string, fetcher: typeof fetch = fetch): Promise<Messung> {
  const params = new URLSearchParams({ url, strategy: strategie, category: 'performance', locale: 'de' });
  if (key) params.set('key', key);
  const antwort = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
    signal: AbortSignal.timeout(75_000),
  });
  if (!antwort.ok) {
    const body = (await antwort.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`PageSpeed ${antwort.status}: ${(body.error?.message ?? '').slice(0, 160)}`);
  }
  return werteAus((await antwort.json()) as PsiAntwort, strategie);
}
