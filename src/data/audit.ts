import type { Audit, Firma, OutreachLeistung } from './types';

/*
 * Shop audit: types of the Cloud Function response (functions/shop-audit) and helpers around the `audits` tab.
 * The function measures and derives findings; the app stores, shows and reuses them.
 */

export type Schwere = 'hoch' | 'mittel' | 'hinweis';
export type Bereich = 'plattform' | 'geschwindigkeit' | 'tracking' | 'email' | 'shop' | 'seo';

export interface Befund {
  id: string;
  bereich: Bereich;
  schwere: Schwere;
  text: string;
  wert: string;
}

export interface NichtGeprueft {
  bereich: Bereich | 'produktseite';
  grund: string;
}

export interface Aufhaenger {
  leistung_id: string;
  text: string;
  befunde: string[];
}

export interface Bremse {
  id: string;
  titel: string;
  anzeige: string;
  ms: number;
  bytes: number;
}

export interface Drittanbieter {
  name: string;
  kb: number;
  ms: number;
}

export interface Technologie {
  name: string;
  kategorien: string[];
  version: string;
  website: string;
}

export interface Messung {
  strategie: 'mobile' | 'desktop';
  score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  quelle: 'feld' | 'labor';
  bytes: number | null;
  anfragen: number | null;
  /** Fields below arrived later; older audits lack them. */
  fcp_ms?: number | null;
  tbt_ms?: number | null;
  ttfb_ms?: number | null;
  felddaten?: 'seite' | 'origin' | 'keine';
  bremsen?: Bremse[];
  drittanbieter?: Drittanbieter[];
}

export interface Merkmale {
  plattform: { name: string; sicherheit: number; version: string; edition: string; deploy_ts: number; belege: string[] };
  https: boolean;
  analyse: { ga4: boolean; gtm: boolean; universal_analytics: boolean; andere?: string[] };
  pixel: string[];
  google_ads: boolean;
  consent: string[];
  email_tools: string[];
  newsletter_formular: boolean;
  zahlarten: string[];
  bewertungen: string[];
  sprachen: string[];
  technologien?: Technologie[];
  seo: {
    title: string;
    meta_description: boolean;
    h1: boolean;
    canonical: boolean;
    organization_markup: boolean;
    product_markup: boolean | null;
    product_bewertungen: boolean | null;
    sitemap: boolean | null;
    robots_sperrt_alles: boolean | null;
  };
}

/** Response of the Cloud Function; mirrors the JSON built in functions/shop-audit/src/index.ts. */
export interface AuditErgebnis {
  domain: string;
  url: string;
  status: 'ok' | 'teilweise' | 'fehler';
  plattform: { name: string; version: string; edition: string; sicherheit: number; eol: string; eol_datum: string };
  mobil: Messung | null;
  desktop: Messung | null;
  merkmale: Merkmale | null;
  produkt_url: string;
  befunde: Befund[];
  nicht_geprueft: NichtGeprueft[];
  geprueft_am: string;
  zusammenfassung: string;
  aufhaenger: Aufhaenger[];
  hinweis: string;
  modell: string;
}

/** What the app sends: the domain and the outreach services Claude writes hooks for. */
export interface AuditAnfrage {
  domain: string;
  leistungen: { id: string; titel: string; beschreibung: string; anlass: string }[];
}

export const baueAuditAnfrage = (domain: string, leistungen: readonly OutreachLeistung[]): AuditAnfrage => ({
  domain: domain.trim(),
  leistungen: leistungen
    .filter((l) => !l.archiviert)
    .slice(0, 20)
    .map((l) => ({ id: l.id, titel: l.titel, beschreibung: l.beschreibung.slice(0, 1000), anlass: l.anlass.slice(0, 1000) })),
});

/** Audits older than this are marked as outdated and skipped by "Alle prüfen" only while they are younger. */
export const AUDIT_FRISCH_TAGE = 30;

export const SCHWERE = [
  { wert: 'hoch', label: 'Hoch' },
  { wert: 'mittel', label: 'Mittel' },
  { wert: 'hinweis', label: 'Hinweis' },
] as const;

export const BEREICHE: { wert: Bereich; label: string }[] = [
  { wert: 'plattform', label: 'Plattform & Version' },
  { wert: 'geschwindigkeit', label: 'Geschwindigkeit' },
  { wert: 'tracking', label: 'Tracking & Marketing' },
  { wert: 'email', label: 'E-Mail-Marketing' },
  { wert: 'shop', label: 'Shop-Basics' },
  { wert: 'seo', label: 'SEO' },
];
export const bereichLabel = (wert: string) => BEREICHE.find((b) => b.wert === wert)?.label ?? (wert === 'produktseite' ? 'Produktseite' : wert);

export const AUDIT_STATUS: Record<string, string> = { ok: 'Vollständig', teilweise: 'Teilweise geprüft', fehler: 'Nicht erreichbar' };

const PLATTFORM_NAMEN: Record<string, string> = {
  magento1: 'Magento 1', magento2: 'Magento 2', shopify: 'Shopify', shopware5: 'Shopware 5', shopware6: 'Shopware 6',
  woocommerce: 'WooCommerce', oxid: 'OXID', jtl: 'JTL', prestashop: 'PrestaShop', bigcommerce: 'BigCommerce',
  salesforce_cc: 'Salesforce Commerce Cloud', wix: 'Wix', plentymarkets: 'plentymarkets', sap_commerce: 'SAP Commerce',
  intershop: 'Intershop', spryker: 'Spryker', epages: 'ePages', xt_commerce: 'xt:Commerce', gambio: 'Gambio', unbekannt: 'Unbekannt',
};
export const plattformLabel = (wert: string) => PLATTFORM_NAMEN[wert] ?? (wert || '–');


function json<T>(wert: string, ersatz: T): T {
  if (!wert) return ersatz;
  try {
    return JSON.parse(wert) as T;
  } catch {
    return ersatz;
  }
}

export const befundeVon = (audit: Audit) => json<Befund[]>(audit.befunde, []);
export const aufhaengerVon = (audit: Audit) => json<Aufhaenger[]>(audit.aufhaenger, []);
export const nichtGeprueftVon = (audit: Audit) => json<NichtGeprueft[]>(audit.nicht_geprueft, []);
/** The `merkmale` column also carries the full PageSpeed measurements under `speed`. */
type MerkmaleSpalte = Partial<Merkmale> & { speed?: { mobil: Messung | null; desktop: Messung | null } };
export const merkmaleVon = (audit: Audit): Merkmale | null => {
  const m = json<MerkmaleSpalte | null>(audit.merkmale, null);
  return m?.plattform ? (m as Merkmale) : null;
};
export const speedVon = (audit: Audit) => json<MerkmaleSpalte | null>(audit.merkmale, null)?.speed ?? { mobil: null, desktop: null };

/** Rough size signal: Google only has real-user data for pages with noticeable Chrome traffic. */
export const TRAFFIC_LABEL: Record<string, string> = {
  seite: 'Relevanter Traffic (Google hat Nutzerdaten für die Startseite)',
  origin: 'Etwas Traffic (Google hat Nutzerdaten nur für die Domain insgesamt)',
  keine: 'Wenig Traffic (Google hat keine Nutzerdaten)',
};

export function zaehleBefunde(audit: Audit): Record<Schwere, number> {
  const anzahl = { hoch: 0, mittel: 0, hinweis: 0 };
  for (const b of befundeVon(audit)) anzahl[b.schwere] = (anzahl[b.schwere] ?? 0) + 1;
  return anzahl;
}

/** Row for the `audits` tab, without id and meta. */
export function auditZeile(ergebnis: AuditErgebnis, firmaId: string): Omit<Audit, 'id' | 'von' | 'archiviert' | 'erstellt_am' | 'erstellt_von' | 'geaendert_am' | 'geaendert_von'> {
  return {
    firma_id: firmaId,
    domain: ergebnis.domain,
    geprueft_am: ergebnis.geprueft_am,
    status: ergebnis.status,
    plattform: ergebnis.plattform.name,
    version: ergebnis.plattform.version,
    eol: ergebnis.plattform.eol,
    score_mobil: ergebnis.mobil?.score ?? null,
    score_desktop: ergebnis.desktop?.score ?? null,
    lcp_mobil_ms: ergebnis.mobil?.lcp_ms ?? null,
    cls: ergebnis.mobil?.cls ?? null,
    inp_ms: ergebnis.mobil?.inp_ms ?? null,
    messquelle: ergebnis.mobil?.quelle ?? '',
    merkmale: JSON.stringify({ ...(ergebnis.merkmale ?? {}), speed: { mobil: ergebnis.mobil, desktop: ergebnis.desktop } }),
    befunde: JSON.stringify(ergebnis.befunde),
    nicht_geprueft: JSON.stringify(ergebnis.nicht_geprueft),
    zusammenfassung: ergebnis.zusammenfassung,
    aufhaenger: JSON.stringify(ergebnis.aufhaenger),
  };
}

/** Bare host for comparing a company's domain with an audit ("https://www.x.de/" → "x.de"). */
export const domainSchluessel = (domain: string) => domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '');

/** Newest audit per company id, and per domain for audits without a company. */
export function neuesteAudits(audits: readonly Audit[]): Map<string, Audit> {
  const neueste = new Map<string, Audit>();
  for (const audit of audits) {
    if (audit.archiviert) continue;
    const schluessel = audit.firma_id || `domain:${domainSchluessel(audit.domain)}`;
    const bisher = neueste.get(schluessel);
    if (!bisher || audit.geprueft_am > bisher.geprueft_am) neueste.set(schluessel, audit);
  }
  return neueste;
}

export const neuestesAuditFuer = (audits: readonly Audit[], firmaId: string) => neuesteAudits(audits).get(firmaId);

export function istVeraltet(audit: Audit, jetzt: Date): boolean {
  return jetzt.getTime() - new Date(audit.geprueft_am).getTime() > AUDIT_FRISCH_TAGE * 24 * 3600 * 1000;
}

/**
 * Changes to the company's platform fields when the audit knows better, plus the history text.
 * Only certain values overwrite: an unknown platform or an empty version never clears what the qualifier found.
 */
export function firmaAbgleich(firma: Firma, ergebnis: AuditErgebnis): { changes: Partial<Pick<Firma, 'plattform' | 'version' | 'eol'>>; text: string } | null {
  const p = ergebnis.plattform;
  if (!ergebnis.merkmale || p.name === 'unbekannt') return null;
  const changes: Partial<Pick<Firma, 'plattform' | 'version' | 'eol'>> = {};
  const neuePlattform = p.name !== firma.plattform;
  if (neuePlattform) changes.plattform = p.name;
  // Version and support status belong to the platform: on a new platform the old ones are wrong.
  const version = p.version && p.version !== '1' ? p.version : '';
  if (version && version !== firma.version) changes.version = version;
  else if (neuePlattform && firma.version && !version) changes.version = '';
  if (p.eol !== 'unknown' && p.eol !== firma.eol) changes.eol = p.eol;
  else if (neuePlattform && firma.eol && p.eol === 'unknown') changes.eol = '';

  const teile = (Object.keys(changes) as (keyof typeof changes)[]).map((feld) => {
    const label = { plattform: 'Plattform', version: 'Version', eol: 'Support' }[feld];
    return `${label} ${firma[feld] || '–'} → ${changes[feld] || '–'}`;
  });
  return teile.length === 0 ? null : { changes, text: `Shop-Audit: ${teile.join(', ')}` };
}

/** Text for the history entry of every audit of a company. */
export function auditVerlaufText(ergebnis: AuditErgebnis): string {
  const hoch = ergebnis.befunde.filter((b) => b.schwere === 'hoch').length;
  const zahl = ergebnis.befunde.length > 0 ? `${ergebnis.befunde.length} Befunde, davon ${hoch} hoch.` : '';
  const rest = [ergebnis.zusammenfassung, zahl].filter(Boolean).join(' ');
  return `Shop-Audit (${AUDIT_STATUS[ergebnis.status] ?? ergebnis.status})${rest ? ` – ${rest}` : ''}`;
}

export const sekunden = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`);
