import { NotFoundError } from '../errors';
import type { CalendarApi, CalendarEvent, MeetingRequest } from '../google/calendar';
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

/** In-memory calendar for demo mode and tests. No invitations are sent. */
export class MemoryCalendar implements CalendarApi {
  readonly events: CalendarEvent[] = [];

  async createMeeting(request: MeetingRequest): Promise<CalendarEvent> {
    const event: CalendarEvent = {
      id: fakeId('evt'),
      titel: request.titel,
      start: request.start,
      ende: request.ende,
      teilnehmer: [...request.teilnehmer],
      meetLink: 'https://meet.google.com/demo-demo-demo',
      abgesagt: false,
      ganztaegig: false,
    };
    this.events.push(event);
    return { ...event };
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
