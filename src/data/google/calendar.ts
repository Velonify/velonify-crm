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
  antwort?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}

export interface MeetingRequest {
  titel: string;
  start: string;
  ende: string;
  beschreibung: string;
  teilnehmer: string[];
  einladungSenden: boolean;
}

/** The calendar operations the CRM needs. Implemented by Google and by the in-memory demo calendar. */
export interface CalendarApi {
  createMeeting(request: MeetingRequest): Promise<CalendarEvent>;
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
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
  organizer?: { email?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

function describe(status: number, googleMessage: string): string {
  if (status === 403 && missingScope(googleMessage)) {
    return 'Dem CRM fehlt der Zugriff auf Google Kalender. Bitte ab- und wieder anmelden und dabei alle Berechtigungen erlauben.';
  }
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
    antwort: event.attendees?.find((a) => a.self)?.responseStatus as CalendarEvent['antwort'],
  };
}

export class GoogleCalendar implements CalendarApi {
  private readonly getToken: TokenProvider;

  constructor(getToken: TokenProvider) {
    this.getToken = getToken;
  }

  async createMeeting(request: MeetingRequest): Promise<CalendarEvent> {
    const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: request.einladungSenden ? 'all' : 'none' });
    const event = await googleRequest<GoogleEvent>(this.getToken, `${BASE_URL}?${params}`, {
      method: 'POST',
      body: JSON.stringify({
        summary: request.titel,
        description: request.beschreibung,
        start: { dateTime: request.start },
        end: { dateTime: request.ende },
        attendees: request.teilnehmer.map((email) => ({ email })),
        conferenceData: {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      }),
    }, describe);
    return toEvent(event);
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
