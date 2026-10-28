import { describe, expect, it } from 'vitest';
import { erstelleAblageDrive } from './drive';
import type { AblageOrdner } from './typen';
import type { CreatorApi } from '../api';

function aufbau() {
  const records = new Map<string, AblageOrdner>();
  records.set('kooperationen', { schluessel: 'kooperationen', drive_id: 'PARENT_123456789', name: 'Kooperationen', url: '', art: 'angelegt', bereit: true, erstellt_am: '', erstellt_von: '' });
  const files = new Set(['PARENT_123456789']);
  let generated = 0; let creates = 0; let timeout = false;
  const api: CreatorApi = {
    async get<T>() { return { ordner: [...records.values()] } as T; },
    async post<T>(pfad: string, body: unknown) {
      const b = body as AblageOrdner;
      let o = records.get(b.schluessel);
      if (!o) { o = { ...b, bereit: false, art: 'angelegt', url: `https://drive.google.com/drive/folders/${b.drive_id}`, erstellt_am: '', erstellt_von: '' }; records.set(b.schluessel, o); }
      if (pfad === '/c/ablage/ordner') o.bereit = true;
      return { ordner: { ...o } } as T;
    },
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('generateIds')) { generated++; return Response.json({ ids: [`GENERATED_${generated}123456789`] }); }
    if (init?.method === 'POST') {
      creates++;
      const d = JSON.parse(String(init.body)) as { id: string };
      if (files.has(d.id)) return new Response('', { status: 409 });
      files.add(d.id);
      if (timeout) { timeout = false; throw new TypeError('Network response lost'); }
      return Response.json({ id: d.id, name: 'Kampagne', mimeType: 'application/vnd.google-apps.folder' });
    }
    const id = url.match(/files\/([^?]+)/)?.[1];
    return files.has(id ?? '') ? Response.json({ id, name: 'Ordner', mimeType: 'application/vnd.google-apps.folder' }) : new Response('', { status: 404 });
  };
  return { drive: erstelleAblageDrive({ api, getToken: async () => 'test-token', fetch: fetcher }), files, counts: () => ({ generated, creates }), failAfterCreation: () => { timeout = true; } };
}

describe('Drive folder creation', () => {
  it('reuses an existing folder on repeated requests', async () => {
    const { drive, counts } = aufbau();
    const a = await drive.ordnerFuer('kooperationen', 'K-1 Kampagne');
    const b = await drive.ordnerFuer('kooperationen', 'K-1 Kampagne');
    expect(a.drive_id).toBe(b.drive_id);
    expect(counts()).toEqual({ generated: 1, creates: 1 });
  });
  it('recovers a lost creation response with the reserved ID and creates no duplicate', async () => {
    const { drive, counts, files, failAfterCreation } = aufbau();
    failAfterCreation();
    await expect(drive.ordnerFuer('kooperationen', 'K-2 Kampagne')).rejects.toThrow('Network response lost');
    const result = await drive.ordnerFuer('kooperationen', 'K-2 Kampagne');
    expect(result.bereit).toBe(true);
    expect(files.size).toBe(2);
    expect(counts()).toEqual({ generated: 1, creates: 2 });
  });
  it('keeps distinct Japanese names distinct even without Latin letters', async () => {
    const { drive } = aufbau();
    const a = await drive.ordnerFuer('kooperationen', '東京');
    const b = await drive.ordnerFuer('kooperationen', '大阪');
    expect(a.schluessel).not.toBe(b.schluessel);
    expect(a.drive_id).not.toBe(b.drive_id);
  });
});
