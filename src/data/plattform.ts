// Tenants of the hub (testers and paying customers): packages, trial period and what a tenant may do. Shared by
// crm-api (which enforces it) and the hub (which shows it). Velonify itself is not a tenant.

export type MandantStatus = 'test' | 'aktiv' | 'nur_lesen' | 'gesperrt';
export type Paket = 'test' | 'basis' | 'pro' | 'agentur';
export type Rolle = 'inhaber' | 'mitarbeiter';

export interface Mandant {
  id: string;
  name: string;
  status: MandantStatus;
  paket: Paket;
  /** JJJJ-MM-TT */
  test_start: string;
  test_ende: string;
  /** Tool id → on/off; missing tools follow the package. */
  funktionen: Record<string, boolean>;
  lead_kontingent: number;
  lead_zeitraum: 'gesamt' | 'monat';
  ki_kontingent: number;
  notiz: string;
  bedingungen_am: string;
  bedingungen_von: string;
  buchung_paket: string;
  buchung_am: string;
  buchung_von: string;
  angelegt_am: string;
  geaendert_am: string;
}

export interface Zugang {
  email: string;
  mandant_id: string;
  name: string;
  rolle: Rolle;
  aktiv: boolean;
  letzter_login: string;
}

/** What a tenant can do right now: everything, look only (trial over, not booked yet) or nothing. */
export type Zugriff = 'voll' | 'nur_lesen' | 'gesperrt';

/** After the trial the hub stays readable for this many days, then it is locked. */
export const NUR_LESEN_TAGE = 7;
/** A locked trial is deleted this many days after it ended (done by hand, the admin tool shows when). */
export const LOESCHEN_NACH_TAGEN = 30;
export const TEST_TAGE = 30;
/** From this day of the trial on, the founder price is offered. */
export const GRUENDERPREIS_AB_TAG = 20;

export interface PaketInfo {
  id: Paket;
  name: string;
  preis: string;
  personen: number | null;
  /** Leads per month (or in total for the trial). */
  leads: number;
  ki: number;
  werkzeuge: string[];
}

/**
 * Tools a tenant can ever get. Lead-Finder, Lead-Magnete and Social Media are Velonify's own and stay with us; Kunden
 * (client hub with Drive folders and the client portal) needs Google Drive and its own portal per tenant and follows later.
 */
export const MANDANTEN_WERKZEUGE = ['home', 'crm', 'todo', 'angebote', 'contact', 'audit', 'leadmarkt'] as const;

export const PAKETE: Record<Paket, PaketInfo> = {
  test: { id: 'test', name: 'Test', preis: '30 Tage kostenlos', personen: 3, leads: 40, ki: 150, werkzeuge: [...MANDANTEN_WERKZEUGE] },
  basis: { id: 'basis', name: 'Basis', preis: '149 € im Monat', personen: 3, leads: 0, ki: 50, werkzeuge: ['home', 'crm', 'todo', 'angebote'] },
  pro: { id: 'pro', name: 'Pro', preis: '349 € im Monat', personen: 10, leads: 150, ki: 500, werkzeuge: [...MANDANTEN_WERKZEUGE] },
  agentur: { id: 'agentur', name: 'Agentur', preis: 'ab 699 € im Monat', personen: null, leads: 400, ki: 1500, werkzeuge: [...MANDANTEN_WERKZEUGE] },
};

const TAG_MS = 24 * 60 * 60 * 1000;

/** Whole days from `von` to `bis` (both JJJJ-MM-TT), negative when `bis` is earlier. */
export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / TAG_MS);
}

export function plusTage(datum: string, tage: number): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) + tage * TAG_MS).toISOString().slice(0, 10);
}

/** Today in Berlin as JJJJ-MM-TT. */
export function heuteBerlin(jetzt = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt);
}

/**
 * Access from status and dates: an active tenant may do everything; a trial until its last day, then read-only for
 * NUR_LESEN_TAGE days, then locked. `nur_lesen` and `gesperrt` set by hand always apply.
 */
export function zugriff(m: Pick<Mandant, 'status' | 'test_ende'>, heute: string): Zugriff {
  if (m.status === 'aktiv') return 'voll';
  if (m.status === 'gesperrt') return 'gesperrt';
  if (m.status === 'nur_lesen') return 'nur_lesen';
  if (!m.test_ende || heute <= m.test_ende) return 'voll';
  return tageZwischen(m.test_ende, heute) <= NUR_LESEN_TAGE ? 'nur_lesen' : 'gesperrt';
}

/** Days left in the trial including today (0 after the last day); null when it is not a trial. */
export function testTageUebrig(m: Pick<Mandant, 'status' | 'test_ende'>, heute: string): number | null {
  if (m.status !== 'test' || !m.test_ende) return null;
  return Math.max(0, tageZwischen(heute, m.test_ende) + 1);
}

/** Day of the trial, starting at 1 on the first day. */
export function testTag(m: Pick<Mandant, 'test_start'>, heute: string): number {
  return m.test_start ? tageZwischen(m.test_start, heute) + 1 : 1;
}

/** Is the tool on for this tenant: the switch in the admin tool wins, otherwise the package decides. */
export function werkzeugAn(m: Pick<Mandant, 'paket' | 'funktionen'>, werkzeug: string): boolean {
  if (!(MANDANTEN_WERKZEUGE as readonly string[]).includes(werkzeug)) return false;
  const schalter = m.funktionen?.[werkzeug];
  return typeof schalter === 'boolean' ? schalter : PAKETE[m.paket]?.werkzeuge.includes(werkzeug) ?? false;
}

export function aktiveWerkzeuge(m: Pick<Mandant, 'paket' | 'funktionen'>): string[] {
  return MANDANTEN_WERKZEUGE.filter((w) => werkzeugAn(m, w));
}

/** Start of the period the lead quota counts in: the whole trial, or the current calendar month. */
export function kontingentAb(m: Pick<Mandant, 'lead_zeitraum' | 'test_start'>, heute: string): string {
  return m.lead_zeitraum === 'monat' ? `${heute.slice(0, 7)}-01` : m.test_start || '2000-01-01';
}

/** What the hub of a tenant gets from GET /ich. */
export interface MandantSicht {
  mandant: Pick<Mandant, 'id' | 'name' | 'status' | 'paket' | 'test_start' | 'test_ende' | 'bedingungen_am' | 'buchung_paket' | 'buchung_am'>;
  rolle: Rolle;
  zugriff: Zugriff;
  heute: string;
  tage_uebrig: number | null;
  test_tag: number;
  werkzeuge: string[];
  leads: { kontingent: number; verbraucht: number; zeitraum: 'gesamt' | 'monat' };
  ki: { kontingent: number; verbraucht: number };
  /** Feedback question due now (tag3, tag14, tag25) that this person has not answered yet. */
  feedback_frage: FeedbackAnlass | null;
  /** Leads of the Lead-Markt that went to a conversation, an offer or were won: for the success card. */
  erfolge: { leads: number; gespraeche: number; angebote: number; gewonnen: number };
}

export type FeedbackAnlass = 'frei' | 'tag3' | 'tag14' | 'tag25';

export const FEEDBACK_FRAGEN: Record<Exclude<FeedbackAnlass, 'frei'>, { ab_tag: number; frage: string; skala?: { min: number; max: number; links: string; rechts: string } }> = {
  tag3: { ab_tag: 3, frage: 'Was wolltest du als Erstes mit dem Hub erledigen, und hat es geklappt?' },
  tag14: { ab_tag: 14, frage: 'Wie gut passen die Leads bisher zu dem, was du verkaufst?', skala: { min: 1, max: 5, links: 'passen nicht', rechts: 'genau richtig' } },
  tag25: {
    ab_tag: 25,
    frage: 'Wie wahrscheinlich empfiehlst du den Hub weiter? Und was müsste stimmen, damit du ihn weiter nutzt?',
    skala: { min: 0, max: 10, links: 'gar nicht', rechts: 'auf jeden Fall' },
  },
};

/** The latest question that is due and not answered yet; earlier unanswered ones are skipped. */
export function faelligeFrage(tag: number, beantwortet: string[]): FeedbackAnlass | null {
  const faellig = (Object.entries(FEEDBACK_FRAGEN) as [Exclude<FeedbackAnlass, 'frei'>, { ab_tag: number }][])
    .filter(([, f]) => tag >= f.ab_tag)
    .sort((a, b) => b[1].ab_tag - a[1].ab_tag)[0];
  return faellig && !beantwortet.includes(faellig[0]) ? faellig[0] : null;
}

/** Health of a tenant for the admin overview, 0–100: active days, leads used, pipeline movement, last login. */
export function gesundheit(w: { aktive_tage_7: number; leads_anteil: number; bewegungen_7: number; tage_seit_login: number | null }): number {
  if (w.tage_seit_login === null) return 0;
  const aktiv = Math.min(1, w.aktive_tage_7 / 4) * 40;
  const leads = Math.min(1, w.leads_anteil / 0.5) * 30;
  const bewegung = Math.min(1, w.bewegungen_7 / 5) * 20;
  const frisch = w.tage_seit_login <= 2 ? 10 : w.tage_seit_login <= 6 ? 5 : 0;
  return Math.round(aktiv + leads + bewegung + frisch);
}

export const ist_mandanten_id = (id: string) => /^[a-z0-9_]{2,30}$/.test(id);

// Own instances (own Google Cloud project, database and crm-api), steered from the admin tool "Plattform" → Instanzen.
// Their status comes from the instance's GET /steuerung/status: metadata only, never content.

export const ist_instanz_kennung = (kennung: string) => /^[a-z0-9-]{2,30}$/.test(kennung);

/** An instance as Velonify's hub knows it (table plattform_instanzen). */
export interface PlattformInstanz {
  kennung: string;
  name: string;
  domain: string;
  /** The instance's crm-api, https only. */
  api_url: string;
  /** GitHub repo with the workflow instanz.yml, e.g. Velonify/velonify-hub-beispiel. */
  repo: string;
  notiz: string;
  aktiv: boolean;
  angelegt_am: string;
  geaendert_am: string;
}

/** What an instance says about itself (GET /steuerung/status). */
export interface InstanzStatus {
  /** Commit the instance's crm-api was deployed from (HUB_VERSION); '' when not set. */
  version: string;
  profil: string;
  name: string;
  bausteine: string[];
  werkzeuge: string[];
  /** Whether Velonify's support may sign in (the instance's admins switch it). */
  velonify_zugang: boolean;
  zugaenge: { aktiv: number; inaktiv: number; rollen: Record<string, number>; aktiv_7_tage: number; letzter_login: string };
  kanaele: { plattform: string; status: string; beispiel: boolean; verbunden_am: string; letzte_abholung: string; fehler: string }[];
  /** Claude calls of the current month (Berlin). */
  ki: { monat: string; aufrufe: number; tokens_ein: number; tokens_aus: number; modelle: { modell: string; aufrufe: number; tokens_ein: number; tokens_aus: number }[] };
  speicher: { datenbank_bytes: number };
  /** Active entries of "Neu im Hub". */
  neuigkeiten: number;
  /** When the instance answered (ISO). */
  stand: string;
}

/** An entry of "Neu im Hub" in an instance. */
export interface InstanzNeuigkeit {
  id: string;
  titel: string;
  text: string;
  link: string;
  werkzeug: string;
  am: string;
  von: string;
  archiviert: boolean;
}

/** A commit of the hub code between the instance's version and main. */
export interface InstanzCommit {
  sha: string;
  titel: string;
  autor: string;
  am: string;
  url: string;
}

/** A run of the workflow instanz.yml in the instance's repo. */
export interface InstanzLauf {
  id: number;
  /** queued, in_progress, completed … */
  status: string;
  /** success, failure, cancelled …; '' while running */
  ergebnis: string;
  am: string;
  url: string;
}

/** What Velonify did at an instance (table plattform_instanz_protokoll). */
export interface InstanzProtokoll {
  art: 'update' | 'bausteine' | 'neuigkeit';
  detail: Record<string, unknown>;
  von: string;
  am: string;
}
