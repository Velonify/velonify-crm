import { NotConfiguredError } from '../errors';
import type { CalendarApi } from './calendar';
import type { DriveApi } from './drive';

// The tenants' hub signs in with openid/email/profile only: no Drive, no calendar. Reading answers with nothing, so
// pages that show folders or appointments stay empty instead of failing; writing explains why it is not there.
const nichtDa = (was: string) => () => Promise.reject(new NotConfiguredError(`${was} gibt es in eurem Hub nicht.`));

export const ohneDrive: DriveApi = {
  getFile: nichtDa('Google Drive'),
  listChildren: async () => [],
  createFolder: nichtDa('Google Drive'),
  createFile: nichtDa('Google Drive'),
  copyFile: nichtDa('Google Drive'),
  move: nichtDa('Google Drive'),
  findFoldersByName: async () => [],
};

export const ohneKalender: CalendarApi = {
  createEvent: nichtDa('Der Google-Kalender'),
  updateEvent: nichtDa('Der Google-Kalender'),
  deleteEvent: nichtDa('Der Google-Kalender'),
  findEvents: async () => [],
  listEvents: async () => [],
};
