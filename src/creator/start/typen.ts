/** Home of an own instance (GET /c/start) and its legal details (/oeffentlich/start/recht). Shared by crm-api and the hub. */

/** Tiles of the Home; only those of the person's switched-on tools and building blocks come back in `kacheln`. */
export type StartKachel = 'uploads' | 'fristen' | 'kooperationen' | 'freigaben' | 'zahlen' | 'bericht';

export interface StartInhalt {
  id: string;
  titel: string;
  kanal: string;
  format: string;
  status: string;
  geplant_am: string;
  zustaendig: string;
}

export interface StartFrist {
  id: string;
  titel: string;
  datum: string;
  uhrzeit: string;
  art: string;
  link: string;
  zustaendig: string;
}

export interface StartKooperation {
  id: string;
  partner: string;
  faellig_am: string;
  stand: string;
  zahlung: string;
  /** Only for people who see amounts; null otherwise or when the table has no amount. */
  betrag: number | null;
  waehrung: string;
}

export interface StartFreigabe {
  id: string;
  titel: string;
  link: string;
  objekt_typ: string;
  angefragt_von: string;
  angefragt_am: string;
}

export interface StartKanal {
  id: string;
  plattform: string;
  handle: string;
  status: string;
  /** Date of the latest values; '' when there are none yet. */
  datum: string;
  follower: number | null;
  /** Follower change against the values a week earlier. */
  follower_plus: number | null;
  /** Views of the last seven days of values. */
  aufrufe_7: number | null;
  /** Invented sample numbers until the channel is connected. */
  beispiel: boolean;
}

export interface StartBericht {
  id: string;
  typ: string;
  von: string;
  bis: string;
  status: string;
  beispiel: boolean;
}

export interface StartNeuigkeit {
  id: string;
  titel: string;
  text: string;
  link: string;
  werkzeug: string;
  am: string;
  /** Published after the person last looked at "Neu im Hub". */
  neu: boolean;
}

export interface StartDaten {
  heute: string;
  woche: { von: string; bis: string };
  person: string;
  kacheln: StartKachel[];
  uploads: StartInhalt[];
  fristen: StartFrist[];
  kooperationen: StartKooperation[];
  freigaben: StartFreigabe[];
  zahlen: StartKanal[];
  bericht: StartBericht | null;
  neuigkeiten: StartNeuigkeit[];
  /** Whether the tour starts for this person (first login, or restarted from the settings). */
  rundgang: boolean;
}

/** Legal details of the instance, maintained in the Einrichtung, shown on the public legal pages. */
export const RECHT_FELDER = [
  { id: 'verantwortlicher', label: 'Verantwortlicher (Firma oder Name)', mehrzeilig: false, max: 120 },
  { id: 'vertreten_durch', label: 'Vertreten durch', mehrzeilig: false, max: 160 },
  { id: 'anschrift', label: 'Anschrift', mehrzeilig: true, max: 400 },
  { id: 'email', label: 'E-Mail', mehrzeilig: false, max: 120 },
  { id: 'telefon', label: 'Telefon', mehrzeilig: false, max: 40 },
  { id: 'register', label: 'Register und Registernummer', mehrzeilig: false, max: 200 },
  { id: 'ust_id', label: 'Umsatzsteuer-ID', mehrzeilig: false, max: 40 },
  { id: 'inhaltlich', label: 'Inhaltlich verantwortlich (§ 18 Abs. 2 MStV)', mehrzeilig: true, max: 300 },
  { id: 'datenschutz_kontakt', label: 'Kontakt für Datenschutz (falls abweichend)', mehrzeilig: true, max: 300 },
] as const;

export type RechtFeld = (typeof RECHT_FELDER)[number]['id'];

export interface RechtDaten {
  /** Name of the hub from the Einrichtung ("<Name> HUB"). */
  name: string;
  /** Public address of the hub (HUB_URL). */
  hub_url: string;
  angaben: Record<RechtFeld, string>;
  /** Date of the last change of the details (JJJJ-MM-TT), '' while nothing is saved. */
  stand: string;
}

/** Key in einstellungen for a legal field; instanz_* keys only change through crm-api's instance routes. */
export const rechtSchluessel = (feld: RechtFeld | 'stand') => `instanz_recht_${feld}`;
