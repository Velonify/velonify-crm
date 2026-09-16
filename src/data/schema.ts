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
      'id', 'firma_id', 'deal_id', 'titel', 'faellig_am', 'zustaendig', 'erledigt_am', 'erstellt_von', 'erstellt_am',
    ],
  },
  listen: {
    name: 'listen',
    columns: ['liste', 'wert'],
  },
} as const satisfies Record<string, TabSchema>;

export type TabName = keyof typeof SCHEMA;

/** Allowed values for select fields. Written to the "listen" tab on setup and editable there afterwards. */
export const LISTEN_DEFAULTS: Record<string, string[]> = {
  status: ['lead', 'kunde', 'ehemalig'],
  tier: ['A', 'B', 'C'],
  eol: ['eol', 'unknown', 'supported'],
  phase: ['neu', 'qualifiziert', 'kontaktiert', 'gespraech', 'angebot', 'gewonnen', 'verloren'],
  team: ['Lugge', 'Johannes', 'Julian'],
  verlustgrund: ['Kein Budget', 'Kein Bedarf', 'Timing', 'Wettbewerber', 'Keine Rückmeldung', 'Sonstiges'],
  aktivitaetstyp: ['notiz', 'anruf', 'mail', 'meeting', 'phasenwechsel'],
};
