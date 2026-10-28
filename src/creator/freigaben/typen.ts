/** Mirrors functions/crm-api/src/creator/freigaben.ts (the frontend does not import function code). */
export type FreigabeStatus = 'offen' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen';

export interface Freigabe {
  id: string;
  objekt_typ: string;
  objekt_id: string;
  titel: string;
  link: string;
  bereich: string;
  freigeber: string;
  status: FreigabeStatus;
  notiz: string;
  kommentar: string;
  angefragt_von: string;
  angefragt_am: string;
  entschieden_von: string;
  entschieden_am: string;
}

export interface Zustaendigkeit {
  bereich: string;
  entscheidet: string;
  antwortet: string;
  gibt_frei: string;
}

export const STATUS_TEXT: Record<FreigabeStatus, string> = {
  offen: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  zurueckgezogen: 'Zurückgezogen',
};
