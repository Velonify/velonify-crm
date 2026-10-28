import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCreatorApi, type CreatorApi } from '../api';
import { ABLAGE_VORLAGE, HAUPTORDNER, JAHRES_ORDNER, elternVon, schluesselTeil, type AblageOrdner } from './typen';

const MIME = 'application/vnd.google-apps.folder';
export class DriveFehler extends Error { constructor(message: string, public status: number) { super(message); } }
interface Datei { id: string; name: string; mimeType: string; trashed?: boolean; }
interface DriveAbhaengigkeiten { api: CreatorApi; getToken(): Promise<string>; fetch?: typeof fetch; }

/** A stable suffix also distinguishes titles whose Latin transliteration is empty or identical. */
function kennung(name: string) {
  let h = 2166136261;
  for (const c of name.normalize('NFC')) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return `${schluesselTeil(name) || 'ordner'}-${(h >>> 0).toString(36)}`;
}

/** Browser Drive calls use only the signed-in person's drive.file grant; no token is stored in the hub. */
export function erstelleAblageDrive({ api, getToken, fetch: holen = fetch }: DriveAbhaengigkeiten) {
  async function request<T>(pfad: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error('Bitte melde dich erneut mit Google an, um Drive zu verwenden.');
    const r = await holen(`https://www.googleapis.com/drive/v3/${pfad}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    if (!r.ok) throw new DriveFehler(r.status === 401 ? 'Die Google-Anmeldung ist abgelaufen. Bitte erneut anmelden.' : r.status === 403 ? 'Google Drive hat den Zugriff abgelehnt. Prüfe die Ordnerfreigabe und melde dich mit Drive-Zugriff erneut an.' : r.status === 404 ? 'Der Drive-Ordner ist für dieses Google-Konto nicht zugänglich. Bitte über die Ordnerauswahl freigeben.' : `Drive antwortet mit Fehler ${r.status}. Bitte erneut versuchen.`, r.status);
    return r.json() as Promise<T>;
  }
  async function pruefe(id: string) {
    const d = await request<Datei>(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`);
    if (d.mimeType !== MIME || d.trashed) throw new Error('Bitte einen vorhandenen Drive-Ordner wählen, der nicht im Papierkorb liegt.');
    return d;
  }
  async function ordnerAnlegen(schluessel: string, name: string): Promise<AblageOrdner> {
    const { ordner } = await api.get<{ ordner: AblageOrdner[] }>('/c/ablage');
    const vorhanden = ordner.find(o => o.schluessel === schluessel);
    if (vorhanden?.bereit) { await pruefe(vorhanden.drive_id); return vorhanden; }
    const eltern = ordner.find(o => o.schluessel === elternVon(schluessel));
    if (!eltern?.bereit) throw new Error('Bitte zuerst den übergeordneten Ordner in der Einrichtung anlegen oder verknüpfen.');
    await pruefe(eltern.drive_id);
    let reserviert = vorhanden;
    if (!reserviert) {
      const { ids } = await request<{ ids: string[] }>('files/generateIds?count=1&space=drive&type=files');
      if (!ids[0]) throw new Error('Google hat keine Ordner-ID geliefert. Bitte erneut versuchen.');
      reserviert = (await api.post<{ ordner: AblageOrdner }>('/c/ablage/reservieren', { schluessel, name, drive_id: ids[0] })).ordner;
    }
    // The reserved ID is shared across retries and clients. A successful retry returns 409, never a duplicate.
    try {
      await request<Datei>('files?fields=id,name,mimeType&supportsAllDrives=true', { method: 'POST', body: JSON.stringify({ id: reserviert.drive_id, name: reserviert.name, mimeType: MIME, parents: [eltern.drive_id], appProperties: { hubAblage: schluessel } }) });
    } catch (e) {
      if (!(e instanceof DriveFehler) || e.status !== 409) throw e;
      await pruefe(reserviert.drive_id);
    }
    return (await api.post<{ ordner: AblageOrdner }>('/c/ablage/ordner', { schluessel, name: reserviert.name, drive_id: reserviert.drive_id })).ordner;
  }
  return {
    async verknuepfen(schluessel: string, id: string) {
      const d = await pruefe(id);
      return (await api.post<{ ordner: AblageOrdner }>('/c/ablage/ordner', { schluessel, name: d.name, drive_id: d.id, art: 'verknuepft' })).ordner;
    },
    async vorlageAnlegen(fortschritt?: (name: string) => void) {
      const { ordner } = await api.get<{ ordner: AblageOrdner[] }>('/c/ablage');
      if (!ordner.some(o => o.schluessel === HAUPTORDNER && o.bereit)) throw new Error('Bitte zuerst einen Hauptordner mit Google auswählen.');
      for (const v of ABLAGE_VORLAGE) { fortschritt?.(v.name); await ordnerAnlegen(v.schluessel, v.name); }
      const jahr = new Date().getFullYear().toString();
      await ordnerAnlegen(`${JAHRES_ORDNER}/${jahr}`, jahr);
    },
    async ordnerFuer(bereich: 'content/rohmaterial' | 'content/schnitt' | 'content/thumbnails' | 'kooperationen' | 'buchhaltung/belege', name: string) {
      if (!name.trim() || name.length > 200) throw new Error('Bitte einen Ordnernamen mit 1 bis 200 Zeichen angeben.');
      return ordnerAnlegen(`${bereich}/${kennung(name.trim())}`, name.trim());
    },
  };
}
export function useAblageDrive() {
  const api = useCreatorApi(); const { getToken } = useAuth();
  return useMemo(() => erstelleAblageDrive({ api, getToken }), [api, getToken]);
}

interface PickerView { setIncludeFolders(v: boolean): PickerView; setSelectFolderEnabled(v: boolean): PickerView; setMimeTypes(v: string): PickerView; }
interface PickerBuilder { addView(v: PickerView): PickerBuilder; setOAuthToken(v: string): PickerBuilder; setDeveloperKey(v: string): PickerBuilder; setAppId(v: string): PickerBuilder; setOrigin(v: string): PickerBuilder; setLocale(v: string): PickerBuilder; setCallback(v: (data: { action: string; docs?: { id: string }[] }) => void): PickerBuilder; build(): { setVisible(v: boolean): void }; }
interface PickerGlobal { google?: { picker?: { DocsView: new () => PickerView; PickerBuilder: new () => PickerBuilder; Action: { PICKED: string; CANCEL: string } } }; gapi?: { load(name: string, config: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void }; }
let laden: Promise<void> | undefined;
function pickerLaden() {
  const w = window as unknown as PickerGlobal;
  if (w.google?.picker) return Promise.resolve();
  if (!laden) laden = new Promise<void>((resolve, reject) => {
    const fehler = () => { laden = undefined; reject(new Error('Die Google-Ordnerauswahl konnte nicht geladen werden. Bitte erneut versuchen.')); };
    const starten = () => w.gapi ? w.gapi.load('picker', { callback: resolve, onerror: fehler, timeout: 15000, ontimeout: fehler }) : fehler();
    if (w.gapi) starten();
    else { const script = document.createElement('script'); script.src = 'https://apis.google.com/js/api.js'; script.async = true; script.onload = starten; script.onerror = fehler; document.head.appendChild(script); }
  });
  return laden;
}
export async function waehleDriveOrdner(token: string): Promise<string | null> {
  const key = import.meta.env.VITE_GOOGLE_PICKER_KEY as string | undefined;
  const appId = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;
  if (!key || !appId) throw new Error('Die Google-Ordnerauswahl ist noch nicht eingerichtet. Bitte Velonify um die Drive-Einrichtung bitten.');
  if (!token) throw new Error('Bitte zuerst mit Google anmelden.');
  await pickerLaden();
  const picker = (window as unknown as PickerGlobal).google?.picker;
  if (!picker) throw new Error('Die Google-Ordnerauswahl ist nicht verfügbar. Bitte erneut versuchen.');
  return new Promise(resolve => {
    const view = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(MIME);
    const dialog = new picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(key).setAppId(appId).setOrigin(window.location.origin).setLocale('de').setCallback(data => {
      if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
      else if (data.action === picker.Action.CANCEL) resolve(null);
    }).build();
    dialog.setVisible(true);
  });
}
