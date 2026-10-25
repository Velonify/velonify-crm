/** Personal view settings: which tools sit in the rail, what the start page shows, how busy pages are. */

/** Sections of the start page that can be switched on and off. */
export const START_BEREICHE = [
  { id: 'heute', label: 'Heute dran', beschreibung: 'Fällige Wiedervorlagen, Deals und Karten' },
  { id: 'kalender', label: 'Kalender heute', beschreibung: 'Termine von heute und der nächste Termin' },
  { id: 'kunden', label: 'Kunden', beschreibung: 'Kunden mit offenen Karten und offene Angebote' },
  { id: 'pipeline', label: 'Pipeline', beschreibung: 'Deals je Phase mit Wert' },
  { id: 'monstera', label: 'Die Monstera', beschreibung: 'Die Team-Pflanze zum Gießen' },
  { id: 'wort', label: 'Wort des Tages', beschreibung: 'Das tägliche Worträtsel im Team' },
  { id: 'links', label: 'Links', beschreibung: 'Feste Firmen-Links aus der Einrichtung' },
  { id: 'dateiname', label: 'Dateiname', beschreibung: 'Dateinamen nach dem Schema der Shared Drive bauen' },
  { id: 'schnellstart', label: 'Schnellstart-Knöpfe', beschreibung: 'Firma anlegen, Angebot, Anschreiben, Shop prüfen im Kopf' },
] as const;

export type StartBereich = (typeof START_BEREICHE)[number]['id'];

export interface Ansicht {
  /** Start page sections; missing ids fall back to the default. */
  start: Partial<Record<StartBereich, boolean>>;
  /** Tools switched off in the rail (by id). Home cannot be switched off. */
  ausgeblendet: string[];
  /** Key figures in the page heads (Pipeline, Mein Tag, Kunden …). */
  kennzahlen: boolean;
  /** Explanatory lines under page heads ("Karten zwischen Spalten ziehen …"). */
  erklaerungen: boolean;
  /** "Braucht Aufmerksamkeit" in the sidebar: firms with overdue cards or follow-ups. */
  aufmerksamkeit: boolean;
}

/** Calm by default: what is due today, the calendar and the clients. Everything else is opt-in. */
export const START_STANDARD: Record<StartBereich, boolean> = {
  heute: true,
  kalender: true,
  kunden: true,
  pipeline: false,
  monstera: false,
  wort: false,
  links: false,
  dateiname: false,
  schnellstart: false,
};

export const ANSICHT_STANDARD: Ansicht = { start: {}, ausgeblendet: [], kennzahlen: false, erklaerungen: false, aufmerksamkeit: true };

/** Key in "einstellungen" for a person's view, like the signature one address per person. */
export const ansichtSchluessel = (email: string) => `ansicht_${email.trim().toLowerCase()}`;

export const zeigeStart = (ansicht: Ansicht, bereich: StartBereich) => ansicht.start[bereich] ?? START_STANDARD[bereich];

/** Reads a stored view; anything broken or missing falls back to the calm default. */
export function leseAnsicht(roh: string | undefined | null): Ansicht {
  if (!roh) return ANSICHT_STANDARD;
  try {
    const wert = JSON.parse(roh) as Partial<Ansicht>;
    const start = typeof wert.start === 'object' && wert.start ? (wert.start as Ansicht['start']) : {};
    return {
      start: Object.fromEntries(Object.entries(start).filter(([k, v]) => k in START_STANDARD && typeof v === 'boolean')),
      ausgeblendet: Array.isArray(wert.ausgeblendet) ? wert.ausgeblendet.filter((id): id is string => typeof id === 'string' && id !== 'home') : [],
      kennzahlen: typeof wert.kennzahlen === 'boolean' ? wert.kennzahlen : ANSICHT_STANDARD.kennzahlen,
      erklaerungen: typeof wert.erklaerungen === 'boolean' ? wert.erklaerungen : ANSICHT_STANDARD.erklaerungen,
      aufmerksamkeit: typeof wert.aufmerksamkeit === 'boolean' ? wert.aufmerksamkeit : ANSICHT_STANDARD.aufmerksamkeit,
    };
  } catch {
    return ANSICHT_STANDARD;
  }
}

export const schreibeAnsicht = (ansicht: Ansicht) => JSON.stringify(ansicht);
