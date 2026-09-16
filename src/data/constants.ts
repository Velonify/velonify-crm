// Fixed vocabularies. Business logic depends on these values, so they live in code, not in the sheet.

export const PHASEN = ['neu', 'qualifiziert', 'kontaktiert', 'gespraech', 'angebot', 'gewonnen', 'verloren'] as const;
export type Phase = (typeof PHASEN)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  neu: 'Neu',
  qualifiziert: 'Qualifiziert',
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

export const DEFAULT_DEAL_TITEL = 'Shopify-Migration';

/** Keys in the "einstellungen" tab. */
export const EINSTELLUNG = {
  leadsOrdner: 'drive_leads_ordner_id',
  clientsOrdner: 'drive_clients_ordner_id',
  vorlageOrdner: 'drive_vorlage_ordner_id',
  dealTitel: 'deal_titel_standard',
} as const;

/** Folder names in the shared drive, used by "Ordner automatisch suchen". */
export const DRIVE_ORDNER_NAMEN = {
  leads: '01_Leads',
  clients: '01_Clients',
  vorlage: '01_Client-Folder-Template',
} as const;
