export interface Meta {
  erstellt_am: string;
  erstellt_von: string;
  geaendert_am: string;
  geaendert_von: string;
}

type MetaKeys = keyof Meta;

export interface Firma extends Meta {
  id: string;
  name: string;
  domain: string;
  kuerzel: string;
  status: string;
  tier: string;
  score: number | null;
  plattform: string;
  version: string;
  eol: string;
  ort: string;
  register: string;
  ust_id: string;
  email_allgemein: string;
  telefon_allgemein: string;
  tech_info: string;
  quelle: string;
  zustaendig: string;
  drive_ordner_id: string;
  slack_channel: string;
  trello_url: string;
  notiz: string;
  archiviert: boolean;
}
export type FirmaInput = Omit<Firma, 'id' | 'archiviert' | MetaKeys>;

export interface Kontakt extends Meta {
  id: string;
  firma_id: string;
  vorname: string;
  nachname: string;
  rolle: string;
  email: string;
  telefon: string;
  linkedin: string;
  hauptkontakt: boolean;
  notiz: string;
  archiviert: boolean;
}
export type KontaktInput = Omit<Kontakt, 'id' | 'firma_id' | 'archiviert' | MetaKeys>;

export interface Deal extends Meta {
  id: string;
  firma_id: string;
  kontakt_id: string;
  titel: string;
  phase: string;
  wert_eur: number | null;
  wahrscheinlichkeit: number | null;
  zustaendig: string;
  naechster_schritt: string;
  naechster_schritt_am: string;
  verlustgrund: string;
  abgeschlossen_am: string;
  archiviert: boolean;
}
export type DealInput = Pick<
  Deal,
  'titel' | 'kontakt_id' | 'wert_eur' | 'wahrscheinlichkeit' | 'zustaendig' | 'naechster_schritt' | 'naechster_schritt_am'
>;

export interface Aktivitaet {
  id: string;
  firma_id: string;
  kontakt_id: string;
  deal_id: string;
  typ: string;
  /** ISO timestamp */
  datum: string;
  text: string;
  von: string;
  kalender_termin_id: string;
}
export type AktivitaetInput = Pick<Aktivitaet, 'firma_id' | 'kontakt_id' | 'deal_id' | 'typ' | 'datum' | 'text'>;

export interface Wiedervorlage {
  id: string;
  firma_id: string;
  deal_id: string;
  titel: string;
  /** YYYY-MM-DD */
  faellig_am: string;
  zustaendig: string;
  erledigt_am: string;
  erledigt_von: string;
  erstellt_von: string;
  erstellt_am: string;
}
export type WiedervorlageInput = Pick<Wiedervorlage, 'firma_id' | 'deal_id' | 'titel' | 'faellig_am' | 'zustaendig'>;

export type Abrechnung = 'einmalig' | 'monatlich';

/** Main category of the service catalogue, e.g. "Datenmigration". No prices: those are set per offer. */
export interface Leistungskategorie extends Meta {
  id: string;
  titel_de: string;
  titel_en: string;
  /** Short scope line for the overview table of the offer */
  umfang_de: string;
  umfang_en: string;
  abrechnung: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type LeistungskategorieInput = Pick<Leistungskategorie, 'titel_de' | 'titel_en' | 'umfang_de' | 'umfang_en' | 'abrechnung'>;

/** Sub-item of a category; `text_*` becomes a bullet in the offer's service description. */
export interface Leistung extends Meta {
  id: string;
  kategorie_id: string;
  titel_de: string;
  titel_en: string;
  text_de: string;
  text_en: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type LeistungInput = Pick<Leistung, 'kategorie_id' | 'titel_de' | 'titel_en' | 'text_de' | 'text_en'>;

export interface Katalog {
  kategorien: Leistungskategorie[];
  leistungen: Leistung[];
}

/** One chosen sub-item, with its texts copied in the offer's language (later catalogue edits do not change the offer). */
export interface AuswahlPosten {
  /** leistung_id for catalogue items, "manuell-…" for items added by hand */
  schluessel: string;
  leistung_id: string;
  titel: string;
  text: string;
  notiz: string;
}

export interface AuswahlKategorie {
  /** kategorie_id for catalogue categories, "eigen-…" for categories created in the offer */
  schluessel: string;
  kategorie_id: string;
  titel: string;
  umfang: string;
  abrechnung: string;
  /** Shown separately in sheet and PDF and not part of the total */
  optional: boolean;
  posten: AuswahlPosten[];
}

export interface Auswahl {
  kategorien: AuswahlKategorie[];
}

export interface Angebot extends Meta {
  id: string;
  /** "2026/49" – shared by all versions of an offer */
  nummer: string;
  version: number | null;
  sprache: string;
  firma_id: string;
  deal_id: string;
  kontakt_id: string;
  titel: string;
  status: string;
  /** Auswahl as JSON */
  auswahl: string;
  sheet_id: string;
  pdf_id: string;
  summe_einmalig_eur: number | null;
  summe_monatlich_eur: number | null;
  summe_optional_eur: number | null;
  archiviert: boolean;
}

export interface AngebotInput {
  nummer: string;
  sprache: string;
  firma_id: string;
  deal_id: string;
  kontakt_id: string;
  titel: string;
  auswahl: Auswahl;
}

export interface AngebotsDaten extends Katalog {
  angebote: Angebot[];
}

/**
 * Service offered in first messages of the Contact Generator. Its own short list, separate from the offer catalogue:
 * outreach pitches a few packages, offers itemise many services.
 */
export interface OutreachLeistung extends Meta {
  id: string;
  titel: string;
  /** What the service includes */
  beschreibung: string;
  /** Which problem or occasion fits this service */
  anlass: string;
  /** What the customer gains, in one or two sentences */
  nutzen: string;
  /** A reference or figure that builds trust */
  beleg: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type OutreachLeistungInput = Pick<OutreachLeistung, 'titel' | 'beschreibung' | 'anlass' | 'nutzen' | 'beleg'>;

/** A first message written with the Contact Generator and marked as sent. */
export interface Anschreiben extends Meta {
  id: string;
  firma_id: string;
  kontakt_id: string;
  deal_id: string;
  kanal: string;
  /** Outreach service, empty for a service entered by hand */
  leistung_id: string;
  /** Title of the service at the time of sending */
  leistung: string;
  sprache: string;
  anrede: string;
  aufhaenger: string;
  betreff: string;
  text: string;
  status: string;
  /** ISO timestamp */
  gesendet_am: string;
  von: string;
  archiviert: boolean;
}

export interface ContactDaten {
  leistungen: OutreachLeistung[];
  anschreiben: Anschreiben[];
}

/**
 * One shop audit, stored as it came back from the Cloud Function. The newest per company counts; older ones stay as history.
 * `merkmale`, `befunde`, `nicht_geprueft` and `aufhaenger` hold JSON (see src/data/audit.ts).
 */
export interface Audit extends Meta {
  id: string;
  /** Empty for a domain that is not (yet) in the CRM. */
  firma_id: string;
  domain: string;
  /** ISO timestamp */
  geprueft_am: string;
  von: string;
  /** ok / teilweise / fehler */
  status: string;
  plattform: string;
  version: string;
  /** eol / eol_soon / supported / unknown */
  eol: string;
  score_mobil: number | null;
  score_desktop: number | null;
  lcp_mobil_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  /** feld (real users) / labor */
  messquelle: string;
  merkmale: string;
  befunde: string;
  nicht_geprueft: string;
  zusammenfassung: string;
  aufhaenger: string;
  archiviert: boolean;
}

/** One player's game of the daily word; one row per player and day. */
export interface WordleErgebnis extends Meta {
  id: string;
  /** YYYY-MM-DD of the puzzle */
  datum: string;
  spieler: string;
  versuche: number;
  geloest: boolean;
  /** Colours per attempt ("xyxgx/ggggg"), never the letters. */
  muster: string;
}

/** Care of the team plant; one row per person and day. */
export interface MonsteraEintrag extends Meta {
  id: string;
  /** YYYY-MM-DD */
  datum: string;
  /** giessen */
  typ: string;
  /** Team member, as in the "team" list */
  von: string;
}

/** Both games of the start page; null means the tab is not set up yet. */
export interface SpieleDaten {
  wordle: WordleErgebnis[] | null;
  monstera: MonsteraEintrag[] | null;
}

/*
 * Social media: the 90-day plan lives in the hub, not in a document. One tab per kind of entry, so every
 * point can be edited and ticked off on its own.
 */

/** One entry of the editorial calendar: what goes out when, on which channel. */
export interface SocialPlanEintrag extends Meta {
  id: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM; empty for stories that go out live */
  uhrzeit: string;
  /** instagram, ig_story, linkedin, intern – see KANAELE */
  kanal: string;
  /** karussell, reel, einzelbild, story, textpost, pdf, auswertung – see FORMATE */
  format: string;
  /** Content pillar 1–4, null for internal entries */
  saeule: number | null;
  thema: string;
  /** The piece of content this entry publishes; empty when the entry stands alone */
  inhalt_id: string;
  /** geplant / in_arbeit / bereit / veroeffentlicht */
  status: string;
  /** What is still missing, e.g. "Design offen" */
  hinweis: string;
  zustaendig: string;
  erledigt_am: string;
  erledigt_von: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type SocialPlanInput = Pick<
  SocialPlanEintrag,
  'datum' | 'uhrzeit' | 'kanal' | 'format' | 'saeule' | 'thema' | 'inhalt_id' | 'status' | 'hinweis' | 'zustaendig'
>;

/** One slide of a carousel or one beat of a reel; all of them together are stored as JSON in `slides`. */
export interface SocialSlide {
  /** "1 (Hook)" for a carousel, "0–2" for a reel beat */
  label: string;
  /** On-screen text, word for word */
  text: string;
  /** Layout for a slide, shot list for a reel */
  gestaltung: string;
  /** Voice-over of a reel beat, empty elsewhere */
  sprecher: string;
}

/** A post, reel, single image or story – everything needed to produce it. */
export interface SocialInhalt extends Meta {
  id: string;
  /** Short handle used by the plan, e.g. "K1", "R2", "E3", "S7" */
  kennung: string;
  /** karussell, reel, einzelbild, story */
  art: string;
  /** Recurring series, e.g. "UMZUGSPLAN #1" */
  serie: string;
  saeule: number | null;
  titel: string;
  /** What this post is for */
  ziel: string;
  /** Headline of slide 1, or the first two seconds */
  hook: string;
  /** SocialSlide[] as JSON */
  slides: string;
  caption: string;
  cta: string;
  hashtags: string;
  alt_text: string;
  /** Sound of a reel, interaction sticker of a story */
  ton: string;
  /** What has to be recorded or approved first */
  material: string;
  hinweis: string;
  /** idee / text / gestaltung / bereit / veroeffentlicht / wartet */
  status: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type SocialInhaltInput = Pick<
  SocialInhalt,
  'kennung' | 'art' | 'serie' | 'saeule' | 'titel' | 'ziel' | 'hook' | 'caption' | 'cta' | 'hashtags' | 'alt_text' | 'ton' | 'material' | 'hinweis' | 'status'
> & { slides: SocialSlide[] };

/** A headline from the hook library, marked as used once a post carries it. */
export interface SocialHook extends Meta {
  id: string;
  saeule: number | null;
  text: string;
  /** frei / benutzt */
  status: string;
  inhalt_id: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type SocialHookInput = Pick<SocialHook, 'saeule' | 'text' | 'status' | 'inhalt_id'>;

/** Something that has to happen before or beside the plan: a missing piece, a step of week one, a weekly ritual. */
export interface SocialAufgabe extends Meta {
  id: string;
  /** fehlt / woche1 / ritual */
  bereich: string;
  titel: string;
  beschreibung: string;
  /** sofort / diese_woche / vor_0110 / vor_1310 / spaeter – empty outside "fehlt" */
  dringlichkeit: string;
  faellig_am: string;
  zustaendig: string;
  erledigt_am: string;
  erledigt_von: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type SocialAufgabeInput = Pick<SocialAufgabe, 'bereich' | 'titel' | 'beschreibung' | 'dringlichkeit' | 'faellig_am' | 'zustaendig'>;

/** A chapter of the strategy, editable so the plan can change without a commit. */
export interface SocialText extends Meta {
  id: string;
  /** Stable key, e.g. "fundament" – the start list sets it, people edit the text */
  schluessel: string;
  titel: string;
  text: string;
  sortierung: number | null;
  archiviert: boolean;
}
export type SocialTextInput = Pick<SocialText, 'schluessel' | 'titel' | 'text'>;

/** The numbers behind a post, a week or a month. Fields that do not apply stay empty. */
export interface SocialWert extends Meta {
  id: string;
  /** post / woche / monat */
  art: string;
  /** Day of the post, Monday of the week, or first day of the month */
  datum: string;
  /** Only for art = "post" */
  inhalt_id: string;
  reichweite: number | null;
  speicherungen: number | null;
  geteilt: number | null;
  profilaufrufe: number | null;
  link_klicks: number | null;
  kommentare: number | null;
  story_antworten: number | null;
  umfrage_antworten: number | null;
  neue_follower: number | null;
  follower_zielgruppe: number | null;
  sitzungen: number | null;
  formulare: number | null;
  erstgespraeche: number | null;
  angebote_wert_eur: number | null;
  notiz: string;
}
export type SocialWertInput = Omit<SocialWert, 'id' | MetaKeys>;

/** A direct message with a keyword – the earliest signal that a post works. */
export interface SocialDm extends Meta {
  id: string;
  /** YYYY-MM-DD */
  datum: string;
  /** instagram / linkedin */
  kanal: string;
  /** UMZUG, DATEN, FLOWS or something typed by hand */
  stichwort: string;
  /** The post that triggered it */
  inhalt_id: string;
  name: string;
  shop: string;
  nachricht: string;
  /** Online shop in DACH, decision maker, real need within six months */
  qualifiziert: boolean;
  /** Row in the inbox, once the message was passed on to the CRM */
  eingang_id: string;
  beantwortet_von: string;
  notiz: string;
}
export type SocialDmInput = Pick<
  SocialDm,
  'datum' | 'kanal' | 'stichwort' | 'inhalt_id' | 'name' | 'shop' | 'nachricht' | 'qualifiziert' | 'beantwortet_von' | 'notiz'
>;

/** Everything the social media tool works with, loaded in one request. */
export interface SocialDaten {
  plan: SocialPlanEintrag[];
  inhalte: SocialInhalt[];
  hooks: SocialHook[];
  aufgaben: SocialAufgabe[];
  texte: SocialText[];
  werte: SocialWert[];
  dms: SocialDm[];
}

export type Listen = Record<string, string[]>;
export type Einstellungen = Record<string, string>;

export interface EntityMap {
  firmen: Firma;
  kontakte: Kontakt;
  deals: Deal;
  aktivitaeten: Aktivitaet;
  wiedervorlagen: Wiedervorlage;
  leistungskategorien: Leistungskategorie;
  leistungen: Leistung;
  angebote: Angebot;
  outreach_leistungen: OutreachLeistung;
  anschreiben: Anschreiben;
  audits: Audit;
  wordle: WordleErgebnis;
  monstera: MonsteraEintrag;
  eingang: Anfrage;
  social_plan: SocialPlanEintrag;
  social_inhalte: SocialInhalt;
  social_hooks: SocialHook;
  social_aufgaben: SocialAufgabe;
  social_texte: SocialText;
  social_werte: SocialWert;
  social_dms: SocialDm;
}

/** An inquiry from the website form, written into the sheet by the Apps Script behind the Netlify webhook. */
export interface Anfrage extends Meta {
  id: string;
  eingegangen_am: string;
  quelle: string;
  sprache: string;
  name: string;
  email: string;
  shop: string;
  themen: string;
  nachricht: string;
  /** 'neu', 'uebernommen' or 'verworfen'. */
  status: string;
  firma_id: string;
  kontakt_id: string;
  erledigt_am: string;
  erledigt_von: string;
}

/** Everything the app knows, loaded in one go. */
export interface Database {
  firmen: Firma[];
  kontakte: Kontakt[];
  deals: Deal[];
  aktivitaeten: Aktivitaet[];
  wiedervorlagen: Wiedervorlage[];
  listen: Listen;
  einstellungen: Einstellungen;
}

export const EMPTY_FIRMA_INPUT: FirmaInput = {
  name: '', domain: '', kuerzel: '', status: 'lead', tier: '', score: null, plattform: '', version: '', eol: '',
  ort: '', register: '', ust_id: '', email_allgemein: '', telefon_allgemein: '', tech_info: '', quelle: '',
  zustaendig: '', drive_ordner_id: '', slack_channel: '', trello_url: '', notiz: '',
};

export const EMPTY_KONTAKT_INPUT: KontaktInput = {
  vorname: '', nachname: '', rolle: '', email: '', telefon: '', linkedin: '', hauptkontakt: false, notiz: '',
};

export const EMPTY_DEAL_INPUT: DealInput = {
  titel: '', kontakt_id: '', wert_eur: null, wahrscheinlichkeit: null, zustaendig: '', naechster_schritt: '', naechster_schritt_am: '',
};

export const EMPTY_KATEGORIE_INPUT: LeistungskategorieInput = { titel_de: '', titel_en: '', umfang_de: '', umfang_en: '', abrechnung: 'einmalig' };

export const EMPTY_OUTREACH_LEISTUNG_INPUT: OutreachLeistungInput = { titel: '', beschreibung: '', anlass: '', nutzen: '', beleg: '' };

export const EMPTY_LEISTUNG_INPUT: LeistungInput = { kategorie_id: '', titel_de: '', titel_en: '', text_de: '', text_en: '' };
