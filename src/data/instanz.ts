/**
 * Own instances: a complete hub for one customer under <kennung>.velonify.de with its own Google Cloud project,
 * database and crm-api, built from the same code with VITE_PROFIL (frontend) and INSTANZ_PROFIL (crm-api).
 * Who may sign in lives in instanz_zugaenge of the instance's database; name and switches in einstellungen (instanz_*).
 * Plan: Vault `Hub-Intern/Matsu-Instanz - Bauplan.md`.
 */

export type Profil = 'creator';

/** admin: everything incl. Einrichtung; team: everything but Einrichtung; schnitt: like team without amounts. */
export type InstanzRolle = 'admin' | 'team' | 'schnitt';
/** Velonify's support login (crm-api's ADMINS): like admin, visible in the team list, switchable off by the instance's admins. */
export type InstanzRolleMitSupport = InstanzRolle | 'velonify';

export const INSTANZ_ROLLEN: { id: InstanzRolle; label: string; beschreibung: string }[] = [
  { id: 'admin', label: 'Admin', beschreibung: 'Alles, auch Einrichtung, Team und Zugänge' },
  { id: 'team', label: 'Team', beschreibung: 'Alle Werkzeuge, keine Einrichtung' },
  { id: 'schnitt', label: 'Schnitt', beschreibung: 'Wie Team, aber ohne Beträge' },
];

/** Tools of each profile, in sidebar order. New creator tools join here as they are built. */
export const PROFIL_WERKZEUGE: Record<Profil, readonly string[]> = {
  creator: ['home', 'todo', 'whiteboard'],
};

/** Keys in einstellungen that only go through /instanz/einstellungen (admins), never through POST /einstellungen. */
export const INSTANZ_EINSTELLUNG = {
  name: 'instanz_name',
  /** JSON object tool id → on/off; a missing tool is on. */
  funktionen: 'instanz_funktionen',
  /** "aus" closes the hub for Velonify's support logins. */
  velonifyZugang: 'instanz_velonify_zugang',
} as const;

export const istInstanzEinstellung = (schluessel: string) => schluessel.startsWith('instanz_');

export interface InstanzZugang {
  email: string;
  name: string;
  rolle: InstanzRolle;
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
  rolle: InstanzRolleMitSupport;
  werkzeuge: string[];
  velonify_zugang: boolean;
}

export function istProfil(wert: unknown): wert is Profil {
  return typeof wert === 'string' && wert in PROFIL_WERKZEUGE;
}

export function istInstanzRolle(wert: unknown): wert is InstanzRolle {
  return wert === 'admin' || wert === 'team' || wert === 'schnitt';
}

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

/** The tools of the profile minus those switched off; Home always stays. */
export function instanzWerkzeuge(profil: Profil, einstellungen: Record<string, string | undefined>): string[] {
  const schalter = leseFunktionen(einstellungen[INSTANZ_EINSTELLUNG.funktionen]);
  return PROFIL_WERKZEUGE[profil].filter((w) => w === 'home' || schalter[w] !== false);
}

/** First name for the team list: from the stored name, else the start of the address. */
export function teamName(z: Pick<InstanzZugang, 'name' | 'email'>): string {
  return (z.name?.trim().split(/\s+/)[0] || z.email.split('@')[0]).replace(/^./, (c) => c.toUpperCase());
}
