// Fixed vocabularies. Business logic depends on these values, so they live in code, not in the sheet.

export const PHASEN = ['neu', 'qualifiziert', 'vernetzung', 'kontaktiert', 'gespraech', 'angebot', 'gewonnen', 'verloren'] as const;
export type Phase = (typeof PHASEN)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  neu: 'Neu',
  qualifiziert: 'Qualifiziert',
  vernetzung: 'Vernetzung',
  kontaktiert: 'Kontaktiert',
  gespraech: 'Gespräch',
  angebot: 'Angebot',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
};

export const phaseLabel = (phase: string) => PHASE_LABEL[phase as Phase] ?? (phase || '–');
export const phaseIndex = (phase: string) => PHASEN.indexOf(phase as Phase);
export const isAbgeschlossen = (phase: string) => phase === 'gewonnen' || phase === 'verloren';

/** Used for the weighted pipeline value when a deal has no own probability. */
export const STANDARD_WAHRSCHEINLICHKEIT: Record<Phase, number> = {
  neu: 10,
  qualifiziert: 20,
  vernetzung: 25,
  kontaktiert: 30,
  gespraech: 50,
  angebot: 70,
  gewonnen: 100,
  verloren: 0,
};

export const STATUS = ['lead', 'kunde', 'ehemalig'] as const;
export const STATUS_LABEL: Record<string, string> = { lead: 'Lead', kunde: 'Kunde', ehemalig: 'Ehemalig' };
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? (status || '–');

// Same tiers as the Magento lead qualifier: A ≥ 68, B ≥ 48, C ≥ 30, D below.
export const TIERS = ['A', 'B', 'C', 'D'] as const;

export const EOL = ['eol', 'eol_soon', 'supported', 'unknown'] as const;
export const EOL_LABEL: Record<string, string> = {
  eol: 'Kein Support mehr',
  eol_soon: 'Support endet in < 12 Monaten',
  supported: 'Noch unterstützt',
  unknown: 'Unbekannt',
};

/** Types a person can log by hand. */
export const AKTIVITAET_TYPEN = ['notiz', 'anruf', 'mail', 'meeting'] as const;
export const AKTIVITAET_LABEL: Record<string, string> = {
  notiz: 'Notiz',
  anruf: 'Anruf',
  mail: 'E-Mail',
  meeting: 'Meeting',
  phasenwechsel: 'Phase',
  system: 'System',
};

/** How a lead was contacted, asked when a deal moves from "Neu"/"Qualifiziert" to "Kontaktiert". */
export const KONTAKT_WEGE = ['E-Mail', 'LinkedIn', 'Instagram', 'Telefon', 'Persönlich', 'Sonstiges'] as const;

/** Phases from which moving to "Kontaktiert" means a first contact, so the pipeline asks how it happened. */
export const istErstkontakt = (von: string, nach: string) => nach === 'kontaktiert' && (von === 'neu' || von === 'qualifiziert' || von === 'vernetzung');

/** Moving from "Qualifiziert" to one of these hands the lead to whoever moves it. */
export const istZuteilung = (von: string, nach: string) => von === 'qualifiziert' && (nach === 'vernetzung' || nach === 'kontaktiert');

/** Days until a LinkedIn connection request (sent without a message) is checked again. */
export const VERNETZUNG_TAGE = 7;

const VERNETZUNG_SCHRITT = 'Vernetzung prüfen';
const VERNETZUNG_ANFRAGE = 'Vernetzungsanfrage auf LinkedIn';

/** Next step of a deal in "Vernetzung": "Vernetzung prüfen: Max Muster". */
export const vernetzungSchritt = (person: string) => `${VERNETZUNG_SCHRITT}${person ? `: ${person}` : ''}`;
export const istVernetzungSchritt = (text: string) => text.startsWith(VERNETZUNG_SCHRITT);

/** Verlauf note when a request goes out: "Vernetzungsanfrage auf LinkedIn an Max Muster: über das Magento-Ende". */
export const vernetzungVermerk = (person: string, notiz: string) =>
  `${VERNETZUNG_ANFRAGE} an ${person || 'die Firma'}${notiz.trim() ? `: ${notiz.trim()}` : ''}`;
export const istVernetzungVermerk = (text: string) => text.startsWith(VERNETZUNG_ANFRAGE);

/** What happens after a connection request was accepted or not. */
export const VERNETZUNG_ERGEBNISSE = ['angenommen', 'email', 'warten', 'andere', 'verloren'] as const;
export type VernetzungErgebnis = (typeof VERNETZUNG_ERGEBNISSE)[number];
export const VERNETZUNG_KEINE_REAKTION = 'Keine Reaktion';

/** "nach 4 Tagen", "am selben Tag" – how long a request was open. */
export const tageText = (tage: number | null) => (tage === null ? '' : tage <= 0 ? 'am selben Tag' : tage === 1 ? 'nach 1 Tag' : `nach ${tage} Tagen`);

/** Note for the Verlauf: "Kontaktiert über LinkedIn: Vernetzungsanfrage an die Geschäftsführerin". */
export const kontaktVermerk = (weg: string, notiz: string) => `Kontaktiert über ${weg}${notiz.trim() ? `: ${notiz.trim()}` : ''}`;

export const DEFAULT_DEAL_TITEL = 'Shopify-Migration';

/** Keys in the "einstellungen" tab. */
export const EINSTELLUNG = {
  leadsOrdner: 'drive_leads_ordner_id',
  clientsOrdner: 'drive_clients_ordner_id',
  vorlageOrdner: 'drive_vorlage_ordner_id',
  proposalsOrdner: 'drive_proposals_ordner_id',
  dealTitel: 'deal_titel_standard',
  socialZiel: 'social_ziel_url',
} as const;

export const SLACK_STANDARD_URL = 'https://velonify.slack.com';

/** Company-wide links on the start page, stored under these keys in "einstellungen". */
export const FIRMEN_LINKS = [
  { einstellung: 'link_drive', label: 'Google Drive', hinweis: 'Shared Drive „Velonify“' },
  { einstellung: 'link_helpcenter', label: 'Helpcenter', hinweis: 'Google Doc „00_Helpcenter – Wo gehört was hin“' },
  { einstellung: 'link_slack', label: 'Slack', hinweis: `Leer lassen für ${SLACK_STANDARD_URL}` },
  { einstellung: 'link_trello', label: 'Trello', hinweis: 'Workspace mit allen Boards' },
  { einstellung: 'link_notion', label: 'Notion', hinweis: 'Velonify-Workspace' },
] as const;

/** Folder names in the shared drive, used by "Ordner automatisch suchen". */
export const DRIVE_ORDNER_NAMEN = {
  leads: '01_Leads',
  clients: '01_Clients',
  vorlage: '01_Client-Folder-Template',
  proposals: '02_Proposals',
} as const;
