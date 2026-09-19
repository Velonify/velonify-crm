/**
 * Structure of the "CRM-Datenbank" Google Sheet: one tab per entity, row 1 holds the column names.
 * The app reads columns by name, so column order in the sheet does not matter and extra columns are kept.
 */
export interface TabSchema {
  readonly name: string;
  readonly columns: readonly string[];
  readonly numeric?: readonly string[];
  readonly boolean?: readonly string[];
}

const META = ['erstellt_am', 'erstellt_von', 'geaendert_am', 'geaendert_von'] as const;

export const SCHEMA = {
  firmen: {
    name: 'firmen',
    columns: [
      'id', 'name', 'domain', 'kuerzel', 'status', 'tier', 'score', 'plattform', 'version', 'eol',
      'ort', 'register', 'ust_id', 'email_allgemein', 'telefon_allgemein', 'tech_info', 'quelle',
      'zustaendig', 'drive_ordner_id', 'slack_channel', 'trello_url', 'notiz', 'archiviert', ...META,
    ],
    numeric: ['score'],
    boolean: ['archiviert'],
  },
  kontakte: {
    name: 'kontakte',
    columns: [
      'id', 'firma_id', 'vorname', 'nachname', 'rolle', 'email', 'telefon', 'linkedin',
      'hauptkontakt', 'notiz', 'archiviert', ...META,
    ],
    boolean: ['hauptkontakt', 'archiviert'],
  },
  deals: {
    name: 'deals',
    columns: [
      'id', 'firma_id', 'kontakt_id', 'titel', 'phase', 'wert_eur', 'wahrscheinlichkeit', 'zustaendig',
      'naechster_schritt', 'naechster_schritt_am', 'verlustgrund', 'abgeschlossen_am', 'archiviert', ...META,
    ],
    numeric: ['wert_eur', 'wahrscheinlichkeit'],
    boolean: ['archiviert'],
  },
  aktivitaeten: {
    name: 'aktivitaeten',
    columns: ['id', 'firma_id', 'kontakt_id', 'deal_id', 'typ', 'datum', 'text', 'von', 'kalender_termin_id'],
  },
  wiedervorlagen: {
    name: 'wiedervorlagen',
    columns: [
      'id', 'firma_id', 'deal_id', 'titel', 'faellig_am', 'zustaendig', 'erledigt_am', 'erledigt_von',
      'erstellt_von', 'erstellt_am',
    ],
  },
  leistungskategorien: {
    name: 'leistungskategorien',
    columns: ['id', 'titel_de', 'titel_en', 'umfang_de', 'umfang_en', 'abrechnung', 'sortierung', 'archiviert', ...META],
    numeric: ['sortierung'],
    boolean: ['archiviert'],
  },
  leistungen: {
    name: 'leistungen',
    columns: ['id', 'kategorie_id', 'titel_de', 'titel_en', 'text_de', 'text_en', 'sortierung', 'archiviert', ...META],
    numeric: ['sortierung'],
    boolean: ['archiviert'],
  },
  angebote: {
    name: 'angebote',
    columns: [
      'id', 'nummer', 'version', 'sprache', 'firma_id', 'deal_id', 'kontakt_id', 'titel', 'status', 'auswahl',
      'sheet_id', 'pdf_id', 'summe_einmalig_eur', 'summe_monatlich_eur', 'summe_optional_eur', 'archiviert', ...META,
    ],
    numeric: ['version', 'summe_einmalig_eur', 'summe_monatlich_eur', 'summe_optional_eur'],
    boolean: ['archiviert'],
  },
  outreach_leistungen: {
    name: 'outreach_leistungen',
    columns: ['id', 'titel', 'beschreibung', 'anlass', 'nutzen', 'beleg', 'sortierung', 'archiviert', ...META],
    numeric: ['sortierung'],
    boolean: ['archiviert'],
  },
  anschreiben: {
    name: 'anschreiben',
    columns: [
      'id', 'firma_id', 'kontakt_id', 'deal_id', 'kanal', 'leistung_id', 'leistung', 'sprache', 'anrede', 'aufhaenger',
      'betreff', 'text', 'status', 'gesendet_am', 'von', 'archiviert', ...META,
    ],
    boolean: ['archiviert'],
  },
  audits: {
    name: 'audits',
    columns: [
      'id', 'firma_id', 'domain', 'geprueft_am', 'von', 'status', 'plattform', 'version', 'eol',
      'score_mobil', 'score_desktop', 'lcp_mobil_ms', 'cls', 'inp_ms', 'messquelle',
      'merkmale', 'befunde', 'nicht_geprueft', 'zusammenfassung', 'aufhaenger', 'archiviert', ...META,
    ],
    numeric: ['score_mobil', 'score_desktop', 'lcp_mobil_ms', 'cls', 'inp_ms'],
    boolean: ['archiviert'],
  },
  wordle: {
    name: 'wordle',
    columns: ['id', 'datum', 'spieler', 'versuche', 'geloest', 'muster', ...META],
    numeric: ['versuche'],
    boolean: ['geloest'],
  },
  listen: {
    name: 'listen',
    columns: ['liste', 'wert'],
  },
  einstellungen: {
    name: 'einstellungen',
    columns: ['schluessel', 'wert'],
  },
} as const satisfies Record<string, TabSchema>;

export type TabName = keyof typeof SCHEMA;

/** Tabs the CRM loads on start. */
export const ENTITY_TABS = ['firmen', 'kontakte', 'deals', 'aktivitaeten', 'wiedervorlagen'] as const;
/** Tabs of the offer tool, loaded only when it is opened – so the CRM keeps working before they are set up. */
export const ANGEBOTS_TABS = ['leistungskategorien', 'leistungen', 'angebote'] as const;
/** Tabs of the Contact Generator, loaded only when it is opened. */
export const CONTACT_TABS = ['outreach_leistungen', 'anschreiben'] as const;
/** Tabs of the shop audit, loaded only when audits are shown. */
export const AUDIT_TABS = ['audits'] as const;
/** Tab of the daily word game on the start page, loaded only by the game. */
export const WORDLE_TABS = ['wordle'] as const;
export type EntityTab =
  | (typeof ENTITY_TABS)[number]
  | (typeof ANGEBOTS_TABS)[number]
  | (typeof CONTACT_TABS)[number]
  | (typeof AUDIT_TABS)[number]
  | (typeof WORDLE_TABS)[number];

/** Editable select values, written to the "listen" tab on setup and maintained there afterwards. */
export const LISTEN_DEFAULTS: Record<string, string[]> = {
  team: ['Lugge', 'Johannes', 'Julian'],
  verlustgrund: ['Kein Budget', 'Kein Bedarf', 'Timing', 'Wettbewerber', 'Keine Rückmeldung', 'Sonstiges'],
};
