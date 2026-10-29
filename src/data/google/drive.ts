import { GoogleApiError } from '../errors';
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
  /** Set on folders only the shared drive's managers can open (see restrictToManagers). */
  inheritedPermissionsDisabled?: boolean;
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
  /** Limits a folder in a shared drive to its managers (finance). Only managers of the drive may do this. */
  restrictToManagers(folderId: string): Promise<void>;
}

const BASE_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,webViewLink,iconLink,inheritedPermissionsDisabled';
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

  /**
   * Uploads bytes as a new file into a folder (client portal). A resumable session in one go: multipart uploads are
   * only meant for files up to 5 MB, the portal takes up to 25 MB.
   */
  async upload(name: string, mimeType: string, parentId: string, inhalt: Uint8Array<ArrayBuffer>): Promise<DriveFile> {
    const start = await fetch(`${UPLOAD_URL}?uploadType=resumable&fields=${FIELDS}&${SHARED}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.getToken()}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(inhalt.byteLength),
      },
      body: JSON.stringify({ name, mimeType, parents: [parentId] }),
    });
    const sitzung = start.headers.get('location');
    if (!start.ok || !sitzung) throw new GoogleApiError(start.status, describe(start.status, (await start.text()).slice(0, 300)));
    const antwort = await fetch(sitzung, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: inhalt });
    if (!antwort.ok) throw new GoogleApiError(antwort.status, describe(antwort.status, (await antwort.text()).slice(0, 300)));
    return (await antwort.json()) as DriveFile;
  }

  move(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile> {
    const params = new URLSearchParams({ addParents: toParentId, removeParents: fromParentId, fields: FIELDS, supportsAllDrives: 'true' });
    return this.request(`${BASE_URL}/${encodeURIComponent(fileId)}?${params}`, { method: 'PATCH', body: '{}' });
  }

  async restrictToManagers(folderId: string): Promise<void> {
    await this.request(`${BASE_URL}/${encodeURIComponent(folderId)}?fields=id&${SHARED}`, {
      method: 'PATCH',
      body: JSON.stringify({ inheritedPermissionsDisabled: true }),
    });
  }
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
export const spreadsheetFileUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
