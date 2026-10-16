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
  notiz: string;
  archiviert: boolean;
  /** Industry id from BRANCHEN (src/data/branchen.ts), empty when unknown. */
  branche: string;
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

/** A lead magnet: something to download that people get by e-mail after signing up on velonify.de/ressourcen/<slug>/. */
export interface Magnet extends Meta {
  id: string;
  /** Address part of the landing page and the value the form sends; never change it once links are out. */
  slug: string;
  titel: string;
  /** Internal note: what is inside, for whom. */
  beschreibung: string;
  /** Comment keyword of the LinkedIn post, e.g. SKILLS. */
  stichwort: string;
  /** Where the download button in the mail leads, usually a shared Google Drive file. */
  datei_url: string;
  mail_betreff: string;
  /** Opening of the mail; empty uses the standard text. Paragraphs separated by an empty line. */
  mail_text: string;
  /** Only active magnets have a landing page and send mails; sign-ups for inactive ones are still recorded. */
  aktiv: boolean;
  /** Landing page: the sentence under the title, also the preview text in a LinkedIn DM. */
  untertitel: string;
  /** Landing page: what is inside. Lines with "- " become a list, "## " a heading, **bold** stays bold. */
  inhalt: string;
  /** Landing page: label of the submit button; empty means "Kostenlos anfordern". */
  knopf: string;
  /** 'datei' sends a download; 'audit' (Shop-Roast) confirms by mail and the team sends a report later. */
  typ: MagnetTyp;
  /** Audit magnets only: how many shops get a report; later sign-ups land on the waiting list. Empty = no limit. */
  plaetze: number | null;
  sortierung: number | null;
  archiviert: boolean;
}
export type MagnetInput = Pick<
  Magnet,
  'slug' | 'titel' | 'beschreibung' | 'stichwort' | 'datei_url' | 'mail_betreff' | 'mail_text' | 'aktiv' | 'untertitel' | 'inhalt' | 'knopf' | 'typ' | 'plaetze'
>;
export type MagnetTyp = 'datei' | 'audit' | '';

/** A sign-up for a lead magnet, written by the Apps Script behind the form on velonify.de. */
export interface MagnetLead extends Meta {
  id: string;
  /** Slug of the magnet. */
  magnet: string;
  eingegangen_am: string;
  vorname: string;
  email: string;
  shop: string;
  shopsystem: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  /** Secret part of the links in the mail. */
  token: string;
  mail_gesendet_am: string;
  /** First click on the download link – proves the address is real. */
  download_am: string;
  downloads: number | null;
  /** The newsletter box was ticked; only counts once confirmed. */
  newsletter_einwilligung: boolean;
  /** Wording of the box at the time, as proof of what was agreed to. */
  newsletter_text: string;
  newsletter_bestaetigt_am: string;
  newsletter_abgemeldet_am: string;
  /** 'neu', 'uebernommen' or 'verworfen', as in the inbox. */
  status: string;
  firma_id: string;
  kontakt_id: string;
  erledigt_am: string;
  erledigt_von: string;
  /** Audit magnets: signed up after all places were taken. Set by the Apps Script. */
  warteliste: boolean;
  /** Audit magnets: the shop audit the report is built on (tab `audits`). */
  audit_id: string;
  /** Audit magnets: the report as JSON (see src/data/roast.ts). Everything in it is shown to the shop. */
  report: string;
  /** Who checked the shop; named in the report. */
  report_von: string;
  /** Only a released report is shown on velonify.de/roast/<token>. */
  report_freigegeben_am: string;
  report_gesendet_am: string;
  /** First and count of views of the report page, written by the Apps Script. */
  report_geoeffnet_am: string;
  report_aufrufe: number | null;
}

/** Everything the lead magnet tool works with, loaded in one request. */
export interface MagnetDaten {
  magnete: Magnet[];
  leads: MagnetLead[];
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
  magnete: Magnet;
  magnet_leads: MagnetLead;
  kunden_links: KundenLink;
  kunden_news: KundenNews;
  boards: Board;
  aufgaben: Aufgabe;
  aufgaben_kommentare: AufgabenKommentar;
  erwaehnungen: Erwaehnung;
  portal_zugaenge: PortalZugang;
  portal_werkzeuge: PortalWerkzeug;
  kunden_tracking: KundenTracking;
  kunden_meilensteine: Meilenstein;
}

export type KundenLinkArt = 'tool' | 'ressource';

/** A link on a client page: a tool the client uses (Shopify admin, GA4 …) or a resource (briefing, brand guide …). Never a password. */
export interface KundenLink extends Meta {
  id: string;
  firma_id: string;
  art: KundenLinkArt;
  titel: string;
  url: string;
  beschreibung: string;
  /** Shown on the overview of the client page. */
  angeheftet: boolean;
  /** May be shown in the client portal. */
  sichtbar_kunde: boolean;
  sortierung: number | null;
  archiviert: boolean;
}
export type KundenLinkInput = Pick<KundenLink, 'art' | 'titel' | 'url' | 'beschreibung' | 'angeheftet' | 'sichtbar_kunde'>;

export type KundenNewsArt = 'update' | 'meilenstein' | 'hinweis';

/** A message in the news ticker of one client, or of all clients when `firma_id` is empty. */
export interface KundenNews extends Meta {
  id: string;
  firma_id: string;
  art: KundenNewsArt;
  titel: string;
  text: string;
  /** YYYY-MM-DD */
  datum: string;
  angeheftet: boolean;
  sichtbar_kunde: boolean;
  archiviert: boolean;
}
export type KundenNewsInput = Pick<KundenNews, 'firma_id' | 'art' | 'titel' | 'text' | 'datum' | 'angeheftet' | 'sichtbar_kunde'>;

export interface KundenDaten {
  links: KundenLink[];
  news: KundenNews[];
}

/** A column of a board, stored as JSON in `boards.spalten`. Cards in the column marked `erledigt` count as done. */
export interface Spalte {
  id: string;
  titel: string;
  erledigt?: boolean;
}

/** A to-do board: one per client (`firma_id`) and an internal one without firm. */
export interface Board extends Meta {
  id: string;
  firma_id: string;
  titel: string;
  /** JSON array of Spalte, in display order. */
  spalten: string;
  archiviert: boolean;
}

export interface ChecklistenPunkt {
  text: string;
  erledigt: boolean;
}

/** `kunde`: a request the client sent from the client portal. */
export type AufgabenQuelle = 'manuell' | 'agent' | 'kunde';

/** A card on a board. */
export interface Aufgabe extends Meta {
  id: string;
  board_id: string;
  spalte_id: string;
  titel: string;
  beschreibung: string;
  zustaendig: string;
  /** YYYY-MM-DD or empty */
  faellig_am: string;
  /** Comma-separated */
  labels: string;
  /** JSON array of ChecklistenPunkt */
  checkliste: string;
  /** Position within the column; fractional so a move writes one row only. */
  sortierung: number | null;
  quelle: string;
  /** e.g. the Slack message a suggestion came from */
  quelle_link: string;
  sichtbar_kunde: boolean;
  erledigt_am: string;
  erledigt_von: string;
  archiviert: boolean;
  /** Approval by the client: empty, `offen` (asked), `freigegeben` or `aenderung` (client wants changes). */
  freigabe: string;
  freigabe_am: string;
  freigabe_von: string;
}
export type AufgabeInput = Pick<Aufgabe, 'titel' | 'beschreibung' | 'zustaendig' | 'faellig_am' | 'labels' | 'checkliste' | 'sichtbar_kunde'> & {
  spalte_id?: string;
  quelle?: string;
  quelle_link?: string;
};

export interface AufgabenKommentar {
  id: string;
  aufgabe_id: string;
  text: string;
  von: string;
  datum: string;
}

/** Where a mention was written. */
export type ErwaehnungsArt = 'kommentar' | 'karte' | 'verlauf' | 'firma' | 'kontakt' | 'news';

/** One team member tagged with "@Name" somewhere in the hub; the bell shows the unread ones of the signed-in person. */
export interface Erwaehnung {
  id: string;
  /** Team name of the tagged person, as in the list "team". */
  person: string;
  /** Address of the person who wrote it. */
  von: string;
  datum: string;
  art: ErwaehnungsArt;
  /** Row the text lives in: comment, card, activity, firm, contact or news. */
  quelle_id: string;
  aufgabe_id: string;
  firma_id: string;
  /** What it is about, e.g. the card title or the firm name. */
  titel: string;
  /** The text around the mention, shortened. */
  auszug: string;
  /** Hub path that opens the place, e.g. "/todo/B-1?karte=T-1". */
  link: string;
  gelesen_am: string;
}

export interface TodoDaten {
  boards: Board[];
  aufgaben: Aufgabe[];
  kommentare: AufgabenKommentar[];
}

/** A contact of a client that may log in to the client portal. */
export interface PortalZugang extends Meta {
  id: string;
  firma_id: string;
  kontakt_id: string;
  aktiv: boolean;
  /** Last login, written by the portal. */
  zuletzt_am: string;
  /** Summary rhythm the contact chose ('' = default, see portalBenachrichtigung.ts). */
  updates: string;
  /** Channel for the summaries and for the instant notifications: 'email', 'slack' or 'beide' ('' = default). */
  kanal_updates: string;
  kanal_hinweise: string;
  /** When the last summary went out (ISO). */
  update_am: string;
  /** Instant notifications are sent for everything up to this time (ISO); empty until the first run. */
  hinweise_bis: string;
}

/** A client tool (UTM generator …) switched on or off for one client. */
export interface PortalWerkzeug extends Meta {
  id: string;
  firma_id: string;
  werkzeug: string;
  aktiv: boolean;
}

/**
 * Where a client's numbers come from (GA4 property, Search Console property, page for PageSpeed) and the last
 * snapshot the portal function fetched with analytics@velonify.de. One row per client.
 */
export interface KundenTracking extends Meta {
  id: string;
  firma_id: string;
  /** GA4 property id, e.g. "123456789" */
  ga4_property: string;
  /** Search Console property: "sc-domain:example.de" or "https://www.example.de/" */
  gsc_site: string;
  /** Page measured by PageSpeed (usually the start page) */
  pagespeed_url: string;
  /** Whether the client sees the numbers in the portal */
  sichtbar_kunde: boolean;
  /** When the snapshot was fetched (ISO) */
  stand_am: string;
  /** What went wrong at the last fetch, per source, for the team */
  fehler: string;
  /** The snapshot as JSON (see TrackingDaten in tracking.ts) */
  daten: string;
}

export type MeilensteinStatus = 'offen' | 'aktiv' | 'erledigt';

/** A stage of the client's roadmap, shown as progress in the portal. */
export interface Meilenstein extends Meta {
  id: string;
  firma_id: string;
  titel: string;
  /** YYYY-MM-DD or empty */
  datum: string;
  status: MeilensteinStatus;
  sortierung: number | null;
  archiviert: boolean;
}
export type MeilensteinInput = Pick<Meilenstein, 'titel' | 'datum' | 'status'>;

export interface PortalDaten {
  zugaenge: PortalZugang[];
  werkzeuge: PortalWerkzeug[];
  meilensteine: Meilenstein[];
  tracking: KundenTracking[];
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
  zustaendig: '', drive_ordner_id: '', slack_channel: '', notiz: '', branche: '',
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
