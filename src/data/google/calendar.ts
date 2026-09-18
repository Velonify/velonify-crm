import { GoogleApiError } from '../errors';
import { googleRequest, missingScope, type TokenProvider } from './http';

export interface CalendarEvent {
  id: string;
  titel: string;
  /** ISO timestamps */
  start: string;
  ende: string;
  teilnehmer: string[];
  link?: string;
  meetLink?: string;
  abgesagt: boolean;
  /** All-day events carry dates (YYYY-MM-DD) instead of timestamps; the end date is exclusive. */
  ganztaegig: boolean;
  ort?: string;
  /** The signed-in person's reply, when invited */
  antwort?: Antwort;
  beschreibung?: string;
  /** Invited guests without the organizer, with their replies. */
  gaeste?: { email: string; antwort?: Antwort }[];
  /** The signed-in person organizes the event and may change or delete it. */
  bearbeitbar?: boolean;
  /** One occurrence of a recurring event; changes apply to this occurrence only. */
  serie?: boolean;
}

export type Antwort = 'accepted' | 'declined' | 'tentative' | 'needsAction';

/** What the CRM writes into an event. */
export interface TerminDaten {
  titel: string;
  beschreibung: string;
  ort: string;
  ganztaegig: boolean;
  /** ISO timestamps, or for all-day events dates (YYYY-MM-DD) with an exclusive end date. */
  start: string;
  ende: string;
  teilnehmer: string[];
  meet: boolean;
  /** Email guests about the new event, the change or the cancellation. */
  einladungSenden: boolean;
}

/** The calendar operations the CRM needs. Implemented by Google and by the in-memory demo calendar. */
export interface CalendarApi {
  createEvent(daten: TerminDaten): Promise<CalendarEvent>;
  updateEvent(bisher: CalendarEvent, daten: TerminDaten): Promise<CalendarEvent>;
  deleteEvent(bisher: CalendarEvent, benachrichtigen: boolean): Promise<void>;
  /** Events in the signed-in person's primary calendar where `email` takes part. */
  findEvents(email: string, von: string, bis: string): Promise<CalendarEvent[]>;
  /** All events in the signed-in person's primary calendar between two ISO timestamps, in start order. */
  listEvents(von: string, bis: string): Promise<CalendarEvent[]>;
}

const BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface GoogleEvent {
  id: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  description?: string;
  recurringEventId?: string;
  attendees?: { email?: string; self?: boolean; organizer?: boolean; responseStatus?: string }[];
  organizer?: { email?: string; self?: boolean };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

function describe(status: number, googleMessage: string): string {
  if (status === 403 && missingScope(googleMessage)) {
    return 'Dem CRM fehlt der Zugriff auf Google Kalender. Bitte ab- und wieder anmelden und dabei alle Berechtigungen erlauben.';
  }
  if (status === 403) return 'Diesen Termin kann nur die Person ändern, die ihn angelegt hat.';
  if (status === 404) return 'Den Termin gibt es nicht mehr – vermutlich wurde er in Google gelöscht.';
  return `Google Kalender meldet einen Fehler (${status}): ${googleMessage}`;
}

function toEvent(event: GoogleEvent): CalendarEvent {
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;
  return {
    id: event.id,
    titel: event.summary ?? '(ohne Titel)',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    ende: event.end?.dateTime ?? event.end?.date ?? '',
    teilnehmer: [event.organizer?.email, ...(event.attendees ?? []).map((a) => a.email)].filter((e): e is string => Boolean(e)),
    link: event.htmlLink,
    meetLink: event.hangoutLink ?? video,
    abgesagt: event.status === 'cancelled',
    ganztaegig: !event.start?.dateTime && Boolean(event.start?.date),
    ort: event.location,
    antwort: event.attendees?.find((a) => a.self)?.responseStatus as Antwort | undefined,
    beschreibung: event.description,
    gaeste: (event.attendees ?? [])
      .filter((a) => a.email && !a.organizer && a.email !== event.organizer?.email)
      .map((a) => ({ email: a.email!, antwort: a.responseStatus as Antwort | undefined })),
    // Birthdays, out-of-office and similar entries are managed by Google itself.
    bearbeitbar: Boolean(event.organizer?.self) && (event.eventType ?? 'default') === 'default',
    serie: Boolean(event.recurringEventId),
  };
}

const ZEITZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Start or end of an event. A patch clears the other kind explicitly, so an event can switch between timed and all-day. */
function zeitpunkt(wert: string, ganztaegig: boolean, patch: boolean) {
  if (ganztaegig) return patch ? { date: wert, dateTime: null, timeZone: null } : { date: wert };
  return patch ? { dateTime: wert, timeZone: ZEITZONE, date: null } : { dateTime: wert, timeZone: ZEITZONE };
}

const neuesMeet = () => ({ createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } });

const gleicheGaeste = (a: readonly string[], b: readonly string[]) => {
  const set = new Set(a.map((e) => e.toLowerCase()));
  return set.size === new Set(b.map((e) => e.toLowerCase())).size && b.every((e) => set.has(e.toLowerCase()));
};

export class GoogleCalendar implements CalendarApi {
  private readonly getToken: TokenProvider;

  constructor(getToken: TokenProvider) {
    this.getToken = getToken;
  }

  private url(id: string | undefined, query: Record<string, string>): string {
    return `${BASE_URL}${id ? `/${encodeURIComponent(id)}` : ''}?${new URLSearchParams(query)}`;
  }

  async createEvent(daten: TerminDaten): Promise<CalendarEvent> {
    const url = this.url(undefined, { conferenceDataVersion: '1', sendUpdates: daten.einladungSenden ? 'all' : 'none' });
    const event = await googleRequest<GoogleEvent>(this.getToken, url, {
      method: 'POST',
      body: JSON.stringify({
        summary: daten.titel,
        description: daten.beschreibung,
        location: daten.ort,
        start: zeitpunkt(daten.start, daten.ganztaegig, false),
        end: zeitpunkt(daten.ende, daten.ganztaegig, false),
        attendees: daten.teilnehmer.map((email) => ({ email })),
        ...(daten.meet ? { conferenceData: neuesMeet() } : {}),
      }),
    }, describe);
    return toEvent(event);
  }

  async updateEvent(bisher: CalendarEvent, daten: TerminDaten): Promise<CalendarEvent> {
    const alteGaeste = bisher.gaeste ?? [];
    const body: Record<string, unknown> = {
      summary: daten.titel,
      description: daten.beschreibung,
      location: daten.ort,
      start: zeitpunkt(daten.start, daten.ganztaegig, true),
      end: zeitpunkt(daten.ende, daten.ganztaegig, true),
    };
    // Only touch the guest list when it changed, and keep the replies of those who stay invited.
    if (!gleicheGaeste(alteGaeste.map((g) => g.email), daten.teilnehmer)) {
      body.attendees = daten.teilnehmer.map((email) => ({
        email,
        responseStatus: alteGaeste.find((g) => g.email.toLowerCase() === email.toLowerCase())?.antwort,
      }));
    }
    if (daten.meet && !bisher.meetLink) body.conferenceData = neuesMeet();
    if (!daten.meet && bisher.meetLink) body.conferenceData = null;
    const url = this.url(bisher.id, { conferenceDataVersion: '1', sendUpdates: daten.einladungSenden ? 'all' : 'none' });
    const event = await googleRequest<GoogleEvent>(this.getToken, url, { method: 'PATCH', body: JSON.stringify(body) }, describe);
    return toEvent(event);
  }

  async deleteEvent(bisher: CalendarEvent, benachrichtigen: boolean): Promise<void> {
    const url = this.url(bisher.id, { sendUpdates: benachrichtigen ? 'all' : 'none' });
    try {
      await googleRequest<void>(this.getToken, url, { method: 'DELETE' }, describe);
    } catch (err) {
      // Already deleted elsewhere – that is what we wanted.
      if (err instanceof GoogleApiError && err.status === 410) return;
      throw err;
    }
  }

  async findEvents(email: string, von: string, bis: string): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      q: email,
      timeMin: von,
      timeMax: bis,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    });
    const data = await googleRequest<{ items?: GoogleEvent[] }>(this.getToken, `${BASE_URL}?${params}`, {}, describe);
    const wanted = email.toLowerCase();
    // q is a fuzzy full-text search; keep only events the person really takes part in.
    return (data.items ?? []).map(toEvent).filter((e) => e.teilnehmer.some((t) => t.toLowerCase() === wanted));
  }

  async listEvents(von: string, bis: string): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({ timeMin: von, timeMax: bis, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const data = await googleRequest<{ items?: GoogleEvent[] }>(this.getToken, `${BASE_URL}?${params}`, {}, describe);
    // Working-location entries ("Home", "Office") would fill every day without being appointments.
    return (data.items ?? []).filter((e) => e.eventType !== 'workingLocation').map(toEvent).filter((e) => !e.abgesagt);
  }
}
