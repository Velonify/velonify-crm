import { ValidationError } from './errors';
import { isIsoDate } from './ids';
import type { Aufgabe, Kontakt, KundenDaten, Meilenstein, MeilensteinInput, MeilensteinStatus, PortalDaten, PortalWerkzeug, PortalZugang, TodoDaten } from './types';

/** Tools we build for clients; switched on per client on the "Portal" tab. `bald` ones are shown but cannot be switched on yet. */
export const KUNDEN_WERKZEUGE = [
  { id: 'utm', titel: 'UTM-Generator', text: 'Kampagnen-Links bauen, die Google Analytics richtig zuordnet.' },
  { id: 'social-planer', titel: 'Social-Media-Planer', text: 'Geplante Posts ansehen und freigeben.', bald: true },
] as const satisfies readonly { id: string; titel: string; text: string; bald?: boolean }[];
export type KundenWerkzeugId = (typeof KUNDEN_WERKZEUGE)[number]['id'];

export const MEILENSTEIN_STATUS_LABEL: Record<MeilensteinStatus, string> = { offen: 'Geplant', aktiv: 'Jetzt dran', erledigt: 'Erledigt' };
const MEILENSTEIN_STATUS = Object.keys(MEILENSTEIN_STATUS_LABEL) as MeilensteinStatus[];

export type FreigabeStatus = 'offen' | 'freigegeben' | 'aenderung';
export const FREIGABE_LABEL: Record<FreigabeStatus, string> = { offen: 'Freigabe offen', freigegeben: 'Freigegeben', aenderung: 'Änderung gewünscht' };

export function freigabeVon(aufgabe: Pick<Aufgabe, 'freigabe'>): FreigabeStatus | null {
  return aufgabe.freigabe in FREIGABE_LABEL ? (aufgabe.freigabe as FreigabeStatus) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A contact can get a login only with a usable e-mail address – the login link goes there. */
export function kannPortalZugang(kontakt: Pick<Kontakt, 'email' | 'archiviert'>): boolean {
  return !kontakt.archiviert && EMAIL.test(kontakt.email.trim());
}

export function zugangVon(zugaenge: readonly PortalZugang[], kontaktId: string): PortalZugang | undefined {
  return zugaenge.find((z) => z.kontakt_id === kontaktId);
}

export function werkzeugAktiv(werkzeuge: readonly PortalWerkzeug[], firmaId: string, werkzeug: string): boolean {
  return werkzeuge.some((w) => w.firma_id === firmaId && w.werkzeug === werkzeug && w.aktiv);
}

export function istKundenWerkzeug(id: string): id is KundenWerkzeugId {
  return KUNDEN_WERKZEUGE.some((w) => w.id === id);
}

export function meilensteineVon(liste: readonly Meilenstein[], firmaId: string, mitArchiv = false): Meilenstein[] {
  return liste
    .filter((m) => m.firma_id === firmaId && (mitArchiv || !m.archiviert))
    .sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0) || a.titel.localeCompare(b.titel, 'de'));
}

export function prepareMeilenstein(input: MeilensteinInput): MeilensteinInput {
  const titel = input.titel.trim();
  const datum = input.datum.trim();
  if (!titel) throw new ValidationError('titel', 'Bitte einen Titel eintragen.');
  if (datum && !isIsoDate(datum)) throw new ValidationError('datum', 'Bitte ein gültiges Datum wählen.');
  if (!MEILENSTEIN_STATUS.includes(input.status)) throw new ValidationError('status', 'Bitte einen Status wählen.');
  return { titel, datum, status: input.status };
}

/** Swaps a milestone with its neighbour and renumbers in steps of 10; returns only the values that change. */
export function tauscheMeilenstein(liste: readonly Meilenstein[], id: string, richtung: -1 | 1): { id: string; sortierung: number }[] {
  const neu = [...liste];
  const index = neu.findIndex((m) => m.id === id);
  const ziel = index + richtung;
  if (index < 0 || ziel < 0 || ziel >= neu.length) return [];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return neu.map((m, i) => ({ id: m.id, sortierung: (i + 1) * 10 })).filter((n, i) => neu[i].sortierung !== n.sortierung);
}

/** What the roadmap block of the portal shows: the current stage and the last date (go-live). */
export function fahrplanStand(meilensteine: readonly Meilenstein[]): { aktuell?: Meilenstein; ziel?: Meilenstein; erledigt: number } {
  const aktuell = meilensteine.find((m) => m.status === 'aktiv') ?? meilensteine.find((m) => m.status === 'offen');
  const ziel = [...meilensteine].reverse().find((m) => m.datum);
  return { aktuell, ziel, erledigt: meilensteine.filter((m) => m.status === 'erledigt').length };
}

export interface PortalSicht {
  karten: number;
  kartenGesamt: number;
  freigabenOffen: number;
  news: number;
  links: number;
  zugaenge: number;
  werkzeuge: number;
  meilensteine: number;
}

/** Counts of what the client will see in the portal; the board is the client's board (if any). */
export function portalSicht(firmaId: string, boardId: string | undefined, kunden: KundenDaten | undefined, todos: TodoDaten | undefined, portal: PortalDaten): PortalSicht {
  const karten = boardId && todos ? todos.aufgaben.filter((a) => a.board_id === boardId && !a.archiviert) : [];
  return {
    karten: karten.filter((a) => a.sichtbar_kunde).length,
    kartenGesamt: karten.length,
    freigabenOffen: karten.filter((a) => a.freigabe === 'offen').length,
    news: kunden ? kunden.news.filter((n) => n.firma_id === firmaId && n.sichtbar_kunde && !n.archiviert).length : 0,
    links: kunden ? kunden.links.filter((l) => l.firma_id === firmaId && l.sichtbar_kunde && !l.archiviert).length : 0,
    zugaenge: portal.zugaenge.filter((z) => z.firma_id === firmaId && z.aktiv).length,
    werkzeuge: portal.werkzeuge.filter((w) => w.firma_id === firmaId && w.aktiv).length,
    meilensteine: meilensteineVon(portal.meilensteine, firmaId).length,
  };
}
