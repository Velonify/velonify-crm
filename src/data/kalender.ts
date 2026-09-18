import type { CalendarEvent } from './google/calendar';
import { addDays, isoDate } from './ids';
import type { Database, Firma } from './types';

const zeitFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const tagFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });

/** Monday of the week that contains the day (weeks start on Monday). */
export function wochenStart(tag: string): string {
  const [y, m, d] = tag.split('-').map(Number);
  const wochentag = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(tag, -wochentag);
}

export const wochenTage = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** Local start of a day as ISO timestamp, for the calendar API. */
export const tagesBeginn = (tag: string) => new Date(`${tag}T00:00:00`).toISOString();

/** The local days an event covers. All-day end dates are exclusive; an event ending at midnight does not reach into the next day. */
export function terminTage(event: CalendarEvent): string[] {
  let von: string;
  let bis: string;
  if (event.ganztaegig) {
    von = event.start.slice(0, 10);
    bis = addDays(event.ende.slice(0, 10) || von, -1);
  } else {
    const start = new Date(event.start);
    const ende = new Date(event.ende || event.start);
    von = isoDate(start);
    const mitternacht = ende.getHours() === 0 && ende.getMinutes() === 0 && ende.getTime() > start.getTime();
    bis = isoDate(mitternacht ? new Date(ende.getTime() - 60_000) : ende);
  }
  const tage: string[] = [];
  for (let tag = von; tag <= bis && tage.length < 62; tag = addDays(tag, 1)) tage.push(tag);
  return tage.length > 0 ? tage : [von];
}

/** Events per day, all-day entries first, then by start time. */
export function termineJeTag(events: readonly CalendarEvent[], tage: readonly string[]): Map<string, CalendarEvent[]> {
  const jeTag = new Map(tage.map((tag) => [tag, [] as CalendarEvent[]]));
  for (const event of events) {
    for (const tag of terminTage(event)) jeTag.get(tag)?.push(event);
  }
  for (const liste of jeTag.values()) {
    liste.sort((a, b) => Number(b.ganztaegig) - Number(a.ganztaegig) || new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  return jeTag;
}

/** "10:00–11:00", "Ganztägig", or for events across midnight "ab 22:00" / "bis 02:00" on the respective day. */
export function zeitText(event: CalendarEvent, tag: string): string {
  if (event.ganztaegig) return 'Ganztägig';
  const start = new Date(event.start);
  const ende = new Date(event.ende || event.start);
  const tage = terminTage(event);
  if (tage.length > 1) {
    if (tag === tage[0]) return `ab ${zeitFormat.format(start)}`;
    if (tag === tage[tage.length - 1]) return `bis ${zeitFormat.format(ende)}`;
    return 'Ganztägig';
  }
  return `${zeitFormat.format(start)}–${zeitFormat.format(ende)}`;
}

export const istVorbei = (event: CalendarEvent, jetzt: Date) =>
  new Date(event.ganztaegig ? `${event.ende.slice(0, 10)}T00:00:00` : event.ende).getTime() <= jetzt.getTime();

/**
 * The CRM firm an appointment is about: a guest who is a contact of the firm, otherwise a guest address on the
 * firm's domain. Own colleagues (same domain as the signed-in person) do not count.
 */
export function firmaFuerTermin(db: Database, event: CalendarEvent, eigeneEmail: string): Firma | undefined {
  const eigeneDomain = eigeneEmail.split('@')[1]?.toLowerCase() ?? '';
  const gaeste = event.teilnehmer.map((t) => t.toLowerCase()).filter((t) => t.split('@')[1] !== eigeneDomain);
  if (gaeste.length === 0) return undefined;
  const aktiv = (f?: Firma) => (f && !f.archiviert ? f : undefined);
  for (const gast of gaeste) {
    const kontakt = db.kontakte.find((k) => !k.archiviert && k.email.toLowerCase() === gast);
    const firma = aktiv(db.firmen.find((f) => f.id === kontakt?.firma_id));
    if (firma) return firma;
  }
  const domains = new Set(gaeste.map((g) => g.split('@')[1]));
  return db.firmen.find((f) => !f.archiviert && f.domain && domains.has(f.domain.toLowerCase()));
}

/** "14.–20. September 2026" or "28. September – 4. Oktober 2026" */
export function wocheText(start: string): string {
  const ende = addDays(start, 6);
  const [von, bis] = [start, ende].map((t) => new Date(`${t}T00:00:00`));
  const jahr = bis.getFullYear();
  if (von.getMonth() === bis.getMonth()) return `${von.getDate()}.–${tagFormat.format(bis)} ${jahr}`;
  return `${tagFormat.format(von)}${von.getFullYear() !== jahr ? ` ${von.getFullYear()}` : ''} – ${tagFormat.format(bis)} ${jahr}`;
}

export function googleKalenderUrl(tag: string): string {
  const [y, m, d] = tag.split('-').map(Number);
  return `https://calendar.google.com/calendar/r/week/${y}/${m}/${d}`;
}

export interface TerminZeit {
  ganztaegig: boolean;
  von_datum: string;
  von_zeit: string;
  bis_datum: string;
  bis_zeit: string;
}

const uhrzeit = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The form values of an existing event; all-day end dates become inclusive again. */
export function terminZeit(event: CalendarEvent): TerminZeit {
  if (event.ganztaegig) {
    const von = event.start.slice(0, 10);
    return { ganztaegig: true, von_datum: von, von_zeit: '10:00', bis_datum: addDays(event.ende.slice(0, 10) || von, -1), bis_zeit: '11:00' };
  }
  const start = new Date(event.start);
  const ende = new Date(event.ende || event.start);
  return { ganztaegig: false, von_datum: isoDate(start), von_zeit: uhrzeit(start), bis_datum: isoDate(ende), bis_zeit: uhrzeit(ende) };
}

/** A new appointment of `dauerMin` minutes: at the given time, or at the next full hour when the day is today. */
export function neueTerminZeit(tag: string, jetzt: Date, zeit?: string, dauerMin = 60): TerminZeit {
  let beginn = zeit ?? '10:00';
  if (!zeit && tag === isoDate(jetzt)) beginn = `${String(Math.min(jetzt.getHours() + 1, 23)).padStart(2, '0')}:00`;
  const ende = new Date(new Date(`${tag}T${beginn}`).getTime() + dauerMin * 60_000);
  return { ganztaegig: false, von_datum: tag, von_zeit: beginn, bis_datum: isoDate(ende), bis_zeit: uhrzeit(ende) };
}

/** Moving the start keeps the duration, as in Google Calendar. */
export function verschiebeBeginn(alt: TerminZeit, von_datum: string, von_zeit: string): TerminZeit {
  const vorher = new Date(`${alt.von_datum}T${alt.von_zeit}`).getTime();
  const nachher = new Date(`${von_datum}T${von_zeit}`).getTime();
  const bis = new Date(`${alt.bis_datum}T${alt.bis_zeit}`).getTime();
  if ([vorher, nachher, bis].some(Number.isNaN)) return { ...alt, von_datum, von_zeit };
  const ende = new Date(bis + (nachher - vorher));
  return { ...alt, von_datum, von_zeit, bis_datum: isoDate(ende), bis_zeit: uhrzeit(ende) };
}

/** Colleague addresses for quick selection: people with a signature in the CRM and guests of the loaded events on the own domain. */
export function bekannteKollegen(db: Database, events: readonly CalendarEvent[], eigeneEmail: string): string[] {
  const eigene = eigeneEmail.toLowerCase();
  const domain = eigene.split('@')[1];
  if (!domain) return [];
  const adressen = [
    ...Object.keys(db.einstellungen).filter((k) => k.startsWith('signatur_')).map((k) => k.slice('signatur_'.length)),
    ...events.flatMap((e) => e.teilnehmer),
  ].map((e) => e.toLowerCase());
  return [...new Set(adressen)].filter((e) => e !== eigene && e.split('@')[1] === domain).sort();
}
