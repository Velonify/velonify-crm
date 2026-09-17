import { googleRequest, missingScope, type TokenProvider } from './http';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export const isFolder = (file: DriveFile) => file.mimeType === FOLDER_MIME;

/** The Drive operations the CRM needs. Implemented by Google and by the in-memory demo drive. */
export interface DriveApi {
  getFile(id: string): Promise<DriveFile>;
  listChildren(folderId: string): Promise<DriveFile[]>;
  createFolder(name: string, parentId: string): Promise<DriveFile>;
  /** Creates an empty Google file (e.g. a spreadsheet) directly in a folder. */
  createFile(name: string, mimeType: string, parentId: string): Promise<DriveFile>;
  copyFile(fileId: string, name: string, parentId: string): Promise<DriveFile>;
  move(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile>;
  findFoldersByName(name: string): Promise<DriveFile[]>;
}

const BASE_URL = 'https://www.googleapis.com/drive/v3/files';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,webViewLink,iconLink';
// Shared drives need these flags on every call, otherwise their files are invisible to the API.
const SHARED = 'supportsAllDrives=true';

function describe(status: number, googleMessage: string): string {
  if (status === 403 && missingScope(googleMessage)) {
    return 'Dem CRM fehlt der Zugriff auf Google Drive. Bitte ab- und wieder anmelden und dabei alle Berechtigungen erlauben.';
  }
  if (status === 403) return `Kein Zugriff auf diesen Drive-Ordner. Hast du in der Shared Drive mindestens die Rolle „Content-Manager“? (${googleMessage})`;
  if (status === 404) return 'Drive-Ordner nicht gefunden – gelöscht oder nicht für dich freigegeben.';
  return `Google Drive meldet einen Fehler (${status}): ${googleMessage}`;
}

const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export class GoogleDrive implements DriveApi {
  private readonly getToken: TokenProvider;

  constructor(getToken: TokenProvider) {
    this.getToken = getToken;
  }

  private request<T>(url: string, init: RequestInit = {}): Promise<T> {
    return googleRequest<T>(this.getToken, url, init, describe);
  }

  getFile(id: string): Promise<DriveFile> {
    return this.request(`${BASE_URL}/${encodeURIComponent(id)}?fields=${FIELDS}&${SHARED}`);
  }

  private async search(q: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: '200',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
        orderBy: 'folder,name',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.request<{ files?: DriveFile[]; nextPageToken?: string }>(`${BASE_URL}?${params}`);
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken ?? '';
    } while (pageToken && files.length < 1000);
    return files;
  }

  listChildren(folderId: string): Promise<DriveFile[]> {
    return this.search(`'${escapeQuery(folderId)}' in parents and trashed = false`);
  }

  findFoldersByName(name: string): Promise<DriveFile[]> {
    return this.search(`name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  }

  createFolder(name: string, parentId: string): Promise<DriveFile> {
    return this.request(`${BASE_URL}?fields=${FIELDS}&${SHARED}`, {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
  }

  createFile(name: string, mimeType: string, parentId: string): Promise<DriveFile> {
    return this.request(`${BASE_URL}?fields=${FIELDS}&${SHARED}`, {
      method: 'POST',
      body: JSON.stringify({ name, mimeType, parents: [parentId] }),
    });
  }

  copyFile(fileId: string, name: string, parentId: string): Promise<DriveFile> {
    return this.request(`${BASE_URL}/${encodeURIComponent(fileId)}/copy?fields=${FIELDS}&${SHARED}`, {
      method: 'POST',
      body: JSON.stringify({ name, parents: [parentId] }),
    });
  }

  move(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile> {
    const params = new URLSearchParams({ addParents: toParentId, removeParents: fromParentId, fields: FIELDS, supportsAllDrives: 'true' });
    return this.request(`${BASE_URL}/${encodeURIComponent(fileId)}?${params}`, { method: 'PATCH', body: '{}' });
  }
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
export const spreadsheetFileUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
