/**
 * Monthly report of a client: the numbers of the calendar month (GA4, Search Console, PageSpeed), the cards done
 * and milestones reached in it, and what comes next. The portal function drafts it at the start of the next month
 * and recalculates it while it is a draft; the team adds a comment and releases it in the hub. Only released reports
 * reach the client.
 */
import { meilensteineVon } from './portal';
import { ARBEIT_SPALTEN, kundenBoard, sichtbareKarten } from './portalApi';
import { erledigtSpalte, spaltenVon } from './todos';
import type { TrackingDaten, Zeitraum } from './tracking';
import type { KundenBericht, PortalDaten, TodoDaten } from './types';

export interface BerichtDaten {
  /** Numbers of the calendar month against the month before; PageSpeed is the last measurement. */
  zahlen: TrackingDaten;
  /** Released cards done in the month. */
  erledigt: { titel: string; datum: string }[];
  /** Milestones reached in the month. */
  meilensteine: { titel: string; datum: string }[];
  /** Open milestones and the cards the team is on. */
  naechstes: { titel: string; art: 'meilenstein' | 'karte'; datum: string }[];
  /** When it was calculated (ISO). */
  stand_am: string;
  /** Sources that failed at the last calculation, for the team only. */
  fehler?: string[];
}

/** Drafts are recalculated until this day of the next month, so Search Console (about two days behind) is complete. */
export const NEU_RECHNEN_BIS_TAG = 7;
const MAX_NAECHSTES_KARTEN = 6;
const MAX_NAECHSTE_MEILENSTEINE = 2;

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const istMonat = (monat: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(monat);

/** "2026-10" → "Oktober 2026" */
export function monatName(monat: string): string {
  const [jahr, m] = monat.split('-').map(Number);
  return `${MONATE[m - 1] ?? monat} ${jahr}`;
}

/** The month before `monat`, or after it with `schritt` 1. */
export function naechsterMonat(monat: string, schritt = 1): string {
  const [jahr, m] = monat.split('-').map(Number);
  const d = new Date(Date.UTC(jahr, m - 1 + schritt, 1));
  return d.toISOString().slice(0, 7);
}

/** Day and month in Berlin. */
function berlin(jetzt: Date): { monat: string; tag: number } {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(jetzt).map((t) => [t.type, t.value]),
  );
  return { monat: `${teile.year}-${teile.month}`, tag: Number(teile.day) };
}

/** The month a report is due for: the last full month (Berlin). */
export const berichtsMonat = (jetzt: Date) => naechsterMonat(berlin(jetzt).monat, -1);

/** Whether the scheduler should draft or recalculate the report of `monat` now: in the first days of the next month. */
export function inBerichtsFenster(monat: string, jetzt: Date): boolean {
  const b = berlin(jetzt);
  return b.monat === naechsterMonat(monat) && b.tag <= NEU_RECHNEN_BIS_TAG;
}

/** The calendar month against the month before. */
export function monatsZeitraum(monat: string): Zeitraum {
  const ende = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const vorher = naechsterMonat(monat, -1);
  return { von: `${monat}-01`, bis: ende(monat), vorher_von: `${vorher}-01`, vorher_bis: ende(vorher) };
}

/** Everything of the report besides the numbers, from the client's board and roadmap (only what the portal shows). */
export function berichtInhalt(args: { firmaId: string; monat: string; todos: Pick<TodoDaten, 'boards' | 'aufgaben'>; portal: Pick<PortalDaten, 'meilensteine'> }): Pick<BerichtDaten, 'erledigt' | 'meilensteine' | 'naechstes'> {
  const { firmaId, monat, todos, portal } = args;
  const board = kundenBoard(todos.boards, firmaId);
  const fertig = board ? erledigtSpalte(spaltenVon(board))?.id : undefined;
  const karten = sichtbareKarten(todos, firmaId);
  const imMonat = (zeit: string) => zeit.slice(0, 7) === monat;

  const erledigt = karten
    .filter((k) => k.spalte_id === fertig && imMonat(k.erledigt_am))
    .sort((a, b) => a.erledigt_am.localeCompare(b.erledigt_am))
    .map((k) => ({ titel: k.titel, datum: k.erledigt_am.slice(0, 10) }));

  const etappen = meilensteineVon(portal.meilensteine, firmaId);
  // A milestone has no "done on"; its planned date counts, or the last change when it has none.
  const meilensteine = etappen
    .filter((m) => m.status === 'erledigt' && (m.datum ? imMonat(m.datum) : imMonat(m.geaendert_am)))
    .map((m) => ({ titel: m.titel, datum: m.datum || m.geaendert_am.slice(0, 10) }));

  const naechstes: BerichtDaten['naechstes'] = [
    ...etappen
      .filter((m) => m.status !== 'erledigt')
      .slice(0, MAX_NAECHSTE_MEILENSTEINE)
      .map((m) => ({ titel: m.titel, art: 'meilenstein' as const, datum: m.datum })),
    ...karten
      .filter((k) => k.spalte_id !== fertig && (ARBEIT_SPALTEN.has(k.spalte_id) || k.freigabe === 'offen'))
      .sort((a, b) => (a.faellig_am || '9999').localeCompare(b.faellig_am || '9999') || (a.sortierung ?? 0) - (b.sortierung ?? 0))
      .slice(0, MAX_NAECHSTES_KARTEN)
      .map((k) => ({ titel: k.titel, art: 'karte' as const, datum: k.faellig_am })),
  ];
  return { erledigt, meilensteine, naechstes };
}

export function liesBericht(b: Pick<KundenBericht, 'daten'> | undefined): BerichtDaten | null {
  if (!b?.daten) return null;
  try {
    const d = JSON.parse(b.daten) as BerichtDaten;
    return d && typeof d === 'object' && Array.isArray(d.erledigt) ? { ...d, zahlen: d.zahlen ?? {} } : null;
  } catch {
    return null;
  }
}

/** Reports of a client, newest month first. */
export const berichteVon = (liste: readonly KundenBericht[], firmaId: string) => liste.filter((b) => b.firma_id === firmaId).sort((a, b) => b.monat.localeCompare(a.monat));
