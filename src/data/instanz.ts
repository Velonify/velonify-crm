/**
 * Own instances: a complete hub for one customer under <kennung>.velonify.de with its own Google Cloud project,
 * database and crm-api, built from the same code with VITE_PROFIL (frontend) and INSTANZ_PROFIL (crm-api).
 * Who may sign in lives in instanz_zugaenge of the instance's database; name and switches in einstellungen (instanz_*).
 * Plan: Vault `Hub-Intern/Matsu-Instanz - Bauplan.md`.
 */

export type Profil = 'creator';

/**
 * admin: everything incl. Einrichtung; team: everything but Einrichtung; schnitt: like team without amounts;
 * partner: only the tools (and boards) their login lists, e.g. cutter, deal agency, tax advisor.
 */
export type InstanzRolle = 'admin' | 'team' | 'schnitt' | 'partner';
/** Velonify's support login (crm-api's ADMINS): like admin, visible in the team list, switchable off by the instance's admins. */
export type InstanzRolleMitSupport = InstanzRolle | 'velonify';

export const INSTANZ_ROLLEN: { id: InstanzRolle; label: string; beschreibung: string }[] = [
  { id: 'admin', label: 'Admin', beschreibung: 'Alles, auch Einrichtung, Team und Zugänge' },
  { id: 'team', label: 'Team', beschreibung: 'Alle Werkzeuge, keine Einrichtung' },
  { id: 'schnitt', label: 'Schnitt', beschreibung: 'Wie Team, aber ohne Beträge' },
  { id: 'partner', label: 'Partner', beschreibung: 'Nur die freigegebenen Werkzeuge und Boards, Beträge wahlweise' },
];

/**
 * The building blocks of the concept (Konzept v2, "Start-Umfang" and "Baukasten"). `start` ones are on from the first day,
 * the others are built and switched on by Velonify when the customer needs them. A tool shows up when one of its blocks is on.
 */
export const BAUSTEINE = [
  // Generelle Organisation
  { id: 'boards', werkzeug: 'todo', label: 'Projekt-Boards (Liste und Kanban)', bereich: 'Organisation', start: true },
  { id: 'kalender', werkzeug: 'kalender', label: 'Kalender mit Fristen', bereich: 'Organisation', start: true },
  { id: 'ablage', werkzeug: 'ablage', label: 'Feste Ablagestruktur in Google Drive', bereich: 'Organisation', start: true },
  { id: 'freigaben', werkzeug: 'home', label: 'Rollen und Freigaben', bereich: 'Organisation', start: false },
  { id: 'partner', werkzeug: 'home', label: 'Zugänge für Partner', bereich: 'Organisation', start: false },
  // Content
  { id: 'contentplan', werkzeug: 'content', label: 'Content-Plan je Kanal', bereich: 'Content', start: true },
  { id: 'recherche', werkzeug: 'content', label: 'Recherche-Assistent', bereich: 'Content', start: false },
  { id: 'skripte', werkzeug: 'content', label: 'Skripte, Titel und Hooks', bereich: 'Content', start: false },
  { id: 'thumbnails', werkzeug: 'content', label: 'Thumbnail-Briefings', bereich: 'Content', start: false },
  { id: 'upload', werkzeug: 'content', label: 'Upload-Hygiene', bereich: 'Content', start: false },
  // Analytics und Steuerung
  { id: 'kanaele', werkzeug: 'analytics', label: 'Anbindung der Kanäle', bereich: 'Analytics', start: true },
  { id: 'merkmale', werkzeug: 'analytics', label: 'Merkmale je Video', bereich: 'Analytics', start: true },
  { id: 'berichte', werkzeug: 'analytics', label: 'Wochen- und Monatsbericht', bereich: 'Analytics', start: true },
  { id: 'benchmarking', werkzeug: 'analytics', label: 'Wettbewerbs-Benchmarking', bereich: 'Analytics', start: false },
  { id: 'ableitungen', werkzeug: 'analytics', label: 'Ableitungen in den Plan', bereich: 'Analytics', start: false },
  { id: 'twitch', werkzeug: 'analytics', label: 'Twitch-Anbindung und Twitch-Repurposing', bereich: 'Analytics', start: false },
  // Kooperationen und Einnahmen
  { id: 'kooperationen', werkzeug: 'kooperationen', label: 'Interne Kooperations-Übersicht', bereich: 'Kooperationen', start: true },
  { id: 'pipeline', werkzeug: 'kooperationen', label: 'Kooperations-Pipeline', bereich: 'Kooperationen', start: false },
  { id: 'anfrageformular', werkzeug: 'kooperationen', label: 'Anfrageformular', bereich: 'Kooperationen', start: false },
  { id: 'mediakit', werkzeug: 'kooperationen', label: 'Live-Mediakit', bereich: 'Kooperationen', start: false },
  { id: 'partnerreporting', werkzeug: 'kooperationen', label: 'Partner-Reporting', bereich: 'Kooperationen', start: false },
  { id: 'einnahmen', werkzeug: 'einnahmen', label: 'Einnahmen-Übersicht', bereich: 'Kooperationen', start: false },
  // Extra, nicht im Konzept
  { id: 'whiteboard', werkzeug: 'whiteboard', label: 'Whiteboard', bereich: 'Extra', start: false },
] as const;

export type BausteinId = (typeof BAUSTEINE)[number]['id'];

/** Tools of each profile, in sidebar order. */
export const PROFIL_WERKZEUGE: Record<Profil, readonly string[]> = {
  creator: ['home', 'todo', 'kalender', 'content', 'analytics', 'kooperationen', 'einnahmen', 'ablage', 'whiteboard'],
};

/** Keys in einstellungen that only go through /instanz/einstellungen (admins), never through POST /einstellungen. */
export const INSTANZ_EINSTELLUNG = {
  name: 'instanz_name',
  /** JSON object building block id → on/off; a missing block follows its `start`. */
  funktionen: 'instanz_funktionen',
  /** "aus" closes the hub for Velonify's support logins. */
  velonifyZugang: 'instanz_velonify_zugang',
} as const;

export const istInstanzEinstellung = (schluessel: string) => schluessel.startsWith('instanz_');

export interface InstanzZugang {
  email: string;
  name: string;
  rolle: InstanzRolle;
  /** partner only: tool ids. */
  werkzeuge: string[];
  /** partner only: board ids of the To-Dos they see. */
  boards: string[];
  ohne_betraege: boolean;
  aktiv: boolean;
  letzter_login: string;
  angelegt_am: string;
}

/** What the instance's hub asks crm-api about itself (GET /instanz/ich). */
export interface InstanzSicht {
  profil: Profil;
  /** Name from the Einrichtung, shown as "<name> HUB" with "by Velonify" below; empty until set. */
  name: string;
  email: string;
  /** Team name of the person (first name), as in the team list, `zustaendig` fields and approvals. */
  person: string;
  rolle: InstanzRolleMitSupport;
  /** Tools this person sees: those of the switched-on blocks, for partners only their own. */
  werkzeuge: string[];
  /** Switched-on building blocks of the instance. */
  bausteine: BausteinId[];
  /** Whether amounts (cooperations, income) are visible to this person. */
  betraege: boolean;
  velonify_zugang: boolean;
}

export function istProfil(wert: unknown): wert is Profil {
  return typeof wert === 'string' && wert in PROFIL_WERKZEUGE;
}

export function istInstanzRolle(wert: unknown): wert is InstanzRolle {
  return wert === 'admin' || wert === 'team' || wert === 'schnitt' || wert === 'partner';
}

export const istBaustein = (wert: unknown): wert is BausteinId => typeof wert === 'string' && BAUSTEINE.some((b) => b.id === wert);

export const darfEinrichten = (rolle: InstanzRolleMitSupport | undefined) => rolle === 'admin' || rolle === 'velonify';

function leseFunktionen(wert: string | undefined): Record<string, boolean> {
  try {
    const roh: unknown = JSON.parse(wert || '{}');
    if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) return {};
    return Object.fromEntries(Object.entries(roh).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'));
  } catch {
    return {};
  }
}

/** The switched-on building blocks: the saved switches, else the start scope of the concept. */
export function instanzBausteine(einstellungen: Record<string, string | undefined>): BausteinId[] {
  const schalter = leseFunktionen(einstellungen[INSTANZ_EINSTELLUNG.funktionen]);
  return BAUSTEINE.filter((b) => schalter[b.id] ?? b.start).map((b) => b.id);
}

/** The tools of the profile whose blocks are on; Home always stays. */
export function instanzWerkzeuge(profil: Profil, einstellungen: Record<string, string | undefined>): string[] {
  const an = new Set<string>(instanzBausteine(einstellungen).map((id) => BAUSTEINE.find((b) => b.id === id)!.werkzeug));
  return PROFIL_WERKZEUGE[profil].filter((w) => w === 'home' || an.has(w));
}

/** A partner's tools: what the instance has on, narrowed to their login; Home always. */
export function partnerWerkzeuge(instanz: string[], zugang: Pick<InstanzZugang, 'werkzeuge'>): string[] {
  return instanz.filter((w) => w === 'home' || zugang.werkzeuge.includes(w));
}

export const listeAus = (wert: string | null | undefined): string[] =>
  (wert ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

/** First name for the team list: from the stored name, else the start of the address. */
export function teamName(z: Pick<InstanzZugang, 'name' | 'email'>): string {
  return (z.name?.trim().split(/\s+/)[0] || z.email.split('@')[0]).replace(/^./, (c) => c.toUpperCase());
}
