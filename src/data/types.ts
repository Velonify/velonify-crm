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

export const EMPTY_LEISTUNG_INPUT: LeistungInput = { kategorie_id: '', titel_de: '', titel_en: '', text_de: '', text_en: '' };
