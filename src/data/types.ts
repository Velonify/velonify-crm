export interface Meta {
  erstellt_am: string;
  erstellt_von: string;
  geaendert_am: string;
  geaendert_von: string;
}

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

/** Fields a person edits. id, archiviert and the meta columns are set by the repository. */
export type FirmaInput = Omit<Firma, 'id' | 'archiviert' | keyof Meta>;

export type Listen = Record<string, string[]>;

export const EMPTY_FIRMA_INPUT: FirmaInput = {
  name: '',
  domain: '',
  kuerzel: '',
  status: 'lead',
  tier: '',
  score: null,
  plattform: '',
  version: '',
  eol: '',
  ort: '',
  register: '',
  ust_id: '',
  email_allgemein: '',
  telefon_allgemein: '',
  tech_info: '',
  quelle: '',
  zustaendig: '',
  drive_ordner_id: '',
  slack_channel: '',
  trello_url: '',
  notiz: '',
};
