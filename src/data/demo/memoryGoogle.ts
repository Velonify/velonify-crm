import { NotFoundError } from '../errors';
import type { CalendarApi, CalendarEvent, TerminDaten } from '../google/calendar';
import { FOLDER_MIME, type DriveApi, type DriveFile } from '../google/drive';

let counter = 0;
const fakeId = (prefix: string) => `${prefix}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** In-memory drive for demo mode and tests. Links point nowhere. */
export class MemoryDrive implements DriveApi {
  private readonly files = new Map<string, DriveFile>();

  add(name: string, parentId: string | null, mimeType = FOLDER_MIME): DriveFile {
    const file: DriveFile = {
      id: fakeId('drv'),
      name,
      mimeType,
      parents: parentId ? [parentId] : [],
      modifiedTime: new Date().toISOString(),
    };
    this.files.set(file.id, file);
    return file;
  }

  async getFile(id: string): Promise<DriveFile> {
    const file = this.files.get(id);
    if (!file) throw new NotFoundError('Drive-Ordner nicht gefunden – gelöscht oder nicht für dich freigegeben.');
    return { ...file };
  }

  async listChildren(folderId: string): Promise<DriveFile[]> {
    return [...this.files.values()].filter((f) => f.parents?.includes(folderId)).map((f) => ({ ...f }));
  }

  async createFolder(name: string, parentId: string): Promise<DriveFile> {
    await this.getFile(parentId);
    return { ...this.add(name, parentId) };
  }

  async createFile(name: string, mimeType: string, parentId: string): Promise<DriveFile> {
    await this.getFile(parentId);
    return { ...this.add(name, parentId, mimeType) };
  }

  async copyFile(fileId: string, name: string, parentId: string): Promise<DriveFile> {
    const source = await this.getFile(fileId);
    return { ...this.add(name, parentId, source.mimeType) };
  }

  async move(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile> {
    const file = this.files.get(fileId);
    if (!file) throw new NotFoundError();
    file.parents = [...(file.parents ?? []).filter((p) => p !== fromParentId), toParentId];
    return { ...file };
  }

  async findFoldersByName(name: string): Promise<DriveFile[]> {
    return [...this.files.values()].filter((f) => f.name === name && f.mimeType === FOLDER_MIME).map((f) => ({ ...f }));
  }
}

function alsTermin(daten: TerminDaten, bisher?: CalendarEvent) {
  return {
    titel: daten.titel,
    beschreibung: daten.beschreibung,
    ort: daten.ort || undefined,
    start: daten.start,
    ende: daten.ende,
    ganztaegig: daten.ganztaegig,
    teilnehmer: [...daten.teilnehmer],
    gaeste: daten.teilnehmer.map((email) => ({ email, antwort: 'needsAction' as const })),
    meetLink: daten.meet ? (bisher?.meetLink ?? `https://meet.google.com/demo-${fakeId('')}`) : undefined,
  };
}

/** In-memory calendar for demo mode and tests. No invitations are sent. */
export class MemoryCalendar implements CalendarApi {
  readonly events: CalendarEvent[] = [];

  async createEvent(daten: TerminDaten): Promise<CalendarEvent> {
    const event: CalendarEvent = { id: fakeId('evt'), abgesagt: false, bearbeitbar: true, ...alsTermin(daten) };
    this.events.push(event);
    return { ...event };
  }

  async updateEvent(bisher: CalendarEvent, daten: TerminDaten): Promise<CalendarEvent> {
    const event = this.events.find((e) => e.id === bisher.id);
    if (!event) throw new NotFoundError('Den Termin gibt es nicht mehr.');
    Object.assign(event, alsTermin(daten, event));
    return { ...event };
  }

  async deleteEvent(bisher: CalendarEvent): Promise<void> {
    const index = this.events.findIndex((e) => e.id === bisher.id);
    if (index >= 0) this.events.splice(index, 1);
  }

  async findEvents(email: string, von: string, bis: string): Promise<CalendarEvent[]> {
    const wanted = email.toLowerCase();
    return this.events
      .filter((e) => e.teilnehmer.some((t) => t.toLowerCase() === wanted) && e.start >= von && e.start <= bis)
      .map((e) => ({ ...e }));
  }

  async listEvents(von: string, bis: string): Promise<CalendarEvent[]> {
    const zeit = (wert: string) => new Date(wert.length === 10 ? `${wert}T00:00:00` : wert).getTime();
    return this.events
      .filter((e) => !e.abgesagt && zeit(e.ende) > zeit(von) && zeit(e.start) < zeit(bis))
      .sort((a, b) => zeit(a.start) - zeit(b.start))
      .map((e) => ({ ...e }));
  }
}
