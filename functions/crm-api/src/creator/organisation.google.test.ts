import { afterEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../db/test/testDb';
import { InstanzStore } from '../../../../src/data/postgres/instanzStore';
import type { InstanzRolleMitSupport } from '../../../../src/data/instanz';
import type { ExplorerAntwort } from '../../../../src/creator/ablage/typen';
import type { Frist, GoogleTermin } from '../../../../src/creator/kalender/typen';
import { behandleInstanz, behandleOeffentlich, instanzRolle, type InstanzDienste } from '../instanz';
import { setzeDriveNetz } from './ablageDrive';
import { speicherGeheimnisse } from './geheimnisse';
import { setzeKalenderNetz } from './googleKalender';
import { testKi } from './ki';

const SUPPORT = ['lukas@velonify.de'];
const JETZT = new Date('2026-11-10T09:00:00Z');
const UMGEBUNG: Record<string, string> = { YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'geheim' };

async function aufbau() {
  const { pool } = await testDb();
  const instanz = new InstanzStore(pool);
  const dienste: InstanzDienste = {
    profil: 'creator',
    instanz,
    pool,
    ki: testKi(() => '{}'),
    geheimnisse: speicherGeheimnisse(),
    umgebung: { hubUrl: 'https://beispiel.velonify.de', apiUrl: 'https://api.example', wert: (n) => UMGEBUNG[n] },
    jetzt: () => JETZT,
  };
  const als = async (email: string) => {
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    return (methode: string, pfad: string, body?: unknown) => behandleInstanz(methode, pfad, body, { ...dienste, email, rolle: rolle as InstanzRolleMitSupport });
  };
  const lukas = await als('lukas@velonify.de');
  await lukas('POST', '/instanz/einstellungen', { name: 'Beispiel' });
  await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', name: 'Mara Beispiel', rolle: 'admin' });
  await lukas('POST', '/instanz/zugang', { email: 'kim@example.com', name: 'Kim Test', rolle: 'team' });
  await lukas('POST', '/instanz/einstellungen', { bausteine: { partner: true } });
  await lukas('POST', '/instanz/zugang', { email: 'cut@example.com', name: 'Cutter Test', rolle: 'partner', werkzeuge: ['ablage'] });
  return { pool, dienste, mara: await als('mara@example.com'), kim: await als('kim@example.com'), cutter: await als('cut@example.com') };
}

/** A small Google Drive in memory: files with one parent each, the shared main folder is "HAUPT00000". */
function fakeDrive() {
  const dateien = new Map<string, { id: string; name: string; mimeType: string; parents: string[]; trashed?: boolean }>();
  dateien.set('HAUPT00000', { id: 'HAUPT00000', name: 'Matsu Ablage', mimeType: 'application/vnd.google-apps.folder', parents: ['ROOT000000'] });
  dateien.set('PRIVAT0000', { id: 'PRIVAT0000', name: 'Privat', mimeType: 'application/vnd.google-apps.folder', parents: ['ROOT000000'] });
  let n = 0;
  const antwort = (status: number, daten: unknown) => new Response(JSON.stringify(daten), { status, headers: { 'content-type': 'application/json' } });
  const holen = (async (eingabe: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(eingabe));
    const id = decodeURIComponent(url.pathname.split('/files')[1]?.replace(/^\//, '') ?? '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (!id && init?.method === 'POST') {
      const neu = { id: `ORDNER${String(++n).padStart(4, '0')}`, name: body.name, mimeType: body.mimeType, parents: body.parents };
      dateien.set(neu.id, neu);
      return antwort(200, neu);
    }
    if (!id) {
      const eltern = /'([^']+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1];
      return antwort(200, { files: [...dateien.values()].filter((d) => d.parents.includes(eltern ?? '') && !d.trashed) });
    }
    const d = dateien.get(id);
    if (!d) return antwort(404, { error: { message: 'File not found' } });
    if (init?.method === 'PATCH') {
      if (body.name) d.name = body.name;
      const neuerElternteil = url.searchParams.get('addParents');
      if (neuerElternteil) d.parents = [neuerElternteil];
    }
    return antwort(200, d);
  }) as typeof fetch;
  return { dateien, netz: { holen, token: async () => 'token', konto: async () => 'crm-api@beispiel.iam.gserviceaccount.com' } };
}

afterEach(() => {
  setzeDriveNetz(null);
  setzeKalenderNetz(null);
});

describe('Ablage als Explorer über das Dienstkonto', { timeout: 60_000 }, () => {
  it('connects the shared main folder, builds the structure and browses, renames and moves inside it only', async () => {
    const { mara, kim, cutter } = await aufbau();
    const drive = fakeDrive();
    setzeDriveNetz(drive.netz);
    expect((await kim('POST', '/c/ablage/explorer', {})).status).toBe(409);
    expect((await mara('POST', '/c/ablage/explorer/einrichten', { link: 'https://drive.google.com/drive/folders/FEHLT00000' })).status).toBe(412);
    expect((await kim('POST', '/c/ablage/explorer/einrichten', { link: 'https://drive.google.com/drive/folders/HAUPT00000' })).status).toBe(403);
    expect((await mara('POST', '/c/ablage/explorer/einrichten', { link: 'https://drive.google.com/drive/folders/HAUPT00000?usp=sharing' })).status).toBe(200);
    const struktur = await mara('POST', '/c/ablage/explorer/einrichten', { struktur: true });
    expect(struktur.status).toBe(200);
    const ordner = (struktur.daten as { ordner: { schluessel: string; drive_id: string }[] }).ordner;
    expect(ordner.map((o) => o.schluessel)).toEqual(expect.arrayContaining(['content/cutter', 'buchhaltung/belege/2026']));
    // A second run reuses everything.
    const anzahl = drive.dateien.size;
    await mara('POST', '/c/ablage/explorer/einrichten', { struktur: true });
    expect(drive.dateien.size).toBe(anzahl);

    const start = (await kim('POST', '/c/ablage/explorer', {})).daten as ExplorerAntwort;
    expect(start.pfad).toEqual([{ id: 'HAUPT00000', name: 'Ablage' }]);
    expect(start.eintraege.every((e) => e.fest)).toBe(true);
    expect((await kim('POST', '/c/ablage/explorer', { ordner: 'PRIVAT0000' })).status).toBe(404);

    const content = ordner.find((o) => o.schluessel === 'content')!.drive_id;
    const neu = await kim('POST', '/c/ablage/explorer/neu', { eltern: content, name: 'Japan-Reise' });
    const id = (neu.daten as { eintrag: { id: string } }).eintrag.id;
    expect((await kim('POST', '/c/ablage/explorer/umbenennen', { id, name: 'Japan-Reise 2027' })).status).toBe(200);
    expect(drive.dateien.get(id)?.name).toBe('Japan-Reise 2027');
    expect((await kim('POST', '/c/ablage/explorer/umbenennen', { id: content, name: 'Anders' })).status).toBe(409);
    const cutterOrdner = ordner.find((o) => o.schluessel === 'content/cutter')!.drive_id;
    expect((await kim('POST', '/c/ablage/explorer/verschieben', { id, ziel: cutterOrdner })).status).toBe(200);
    expect(drive.dateien.get(id)?.parents).toEqual([cutterOrdner]);
    expect((await kim('POST', '/c/ablage/explorer/verschieben', { id, ziel: 'PRIVAT0000' })).status).toBe(404);

    // One folder per video, made once.
    const a = await kim('POST', '/c/ablage/explorer/unterordner', { bereich: 'content/rohmaterial', name: 'I-1 Dreh' });
    const b = await kim('POST', '/c/ablage/explorer/unterordner', { bereich: 'content/rohmaterial', name: 'I-1 Dreh' });
    expect((a.daten as { ordner: { drive_id: string } }).ordner.drive_id).toBe((b.daten as { ordner: { drive_id: string } }).ordner.drive_id);

    // Partners start in their area and never reach bookkeeping.
    const sicht = (await cutter('POST', '/c/ablage/explorer', {})).daten as ExplorerAntwort;
    expect(sicht.pfad[0].name).toBe('Branding');
    expect(sicht.bereiche.some((x) => x.schluessel.startsWith('buchhaltung'))).toBe(false);
    expect((await cutter('POST', '/c/ablage/explorer', { ordner: ordner.find((o) => o.schluessel === 'buchhaltung')!.drive_id })).status).toBe(403);
    expect((await cutter('POST', '/c/ablage/explorer', { ordner: 'HAUPT00000' })).status).toBe(403);
    expect((await cutter('POST', '/c/ablage/explorer/umbenennen', { id, name: 'x' })).status).toBe(403);
  });
});

/** Google OAuth and Calendar in memory. */
function fakeKalender() {
  const events = new Map<string, Record<string, unknown>>();
  const aufrufe: string[] = [];
  let n = 0;
  events.set('fremd', { id: 'fremd', summary: 'Zahnarzt', start: { dateTime: '2026-11-12T08:00:00Z' }, end: { dateTime: '2026-11-12T09:00:00Z' }, htmlLink: 'https://calendar.google.com/x' });
  const antwort = (status: number, daten: unknown) => new Response(status === 204 ? null : JSON.stringify(daten), { status, headers: { 'content-type': 'application/json' } });
  const holen = (async (eingabe: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(eingabe));
    aufrufe.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.hostname === 'oauth2.googleapis.com') return antwort(200, { access_token: 'zugang', refresh_token: 'dauer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events' });
    if (url.pathname.endsWith('/calendars/primary')) return antwort(200, { id: 'noel@example.com' });
    const teile = url.pathname.split('/events');
    const id = teile[1]?.replace(/^\//, '');
    if (!id && init?.method === 'POST') {
      const e = { ...JSON.parse(String(init.body)), id: `E${++n}` };
      events.set(e.id, e);
      return antwort(200, e);
    }
    if (!id) return antwort(200, { items: [...events.values()] });
    if (!events.has(id)) return antwort(404, {});
    if (init?.method === 'DELETE') {
      events.delete(id);
      return antwort(204, null);
    }
    events.set(id, { ...events.get(id), ...JSON.parse(String(init?.body ?? '{}')) });
    return antwort(200, events.get(id));
  }) as typeof fetch;
  return { events, aufrufe, holen };
}

describe('Google-Kalender-Anbindung', { timeout: 60_000 }, () => {
  it('connects one calendar, writes deadlines with guests, updates and deletes them and shows the other events', async () => {
    const { mara, kim, cutter, dienste } = await aufbau();
    const g = fakeKalender();
    setzeKalenderNetz(g.holen);
    expect((await kim('POST', '/c/kalender/google/verbinden', {})).status).toBe(403);
    expect((await cutter('GET', '/c/kalender/google')).status).toBe(403);
    const start = await mara('POST', '/c/kalender/google/verbinden', {});
    const url = new URL((start.daten as { url: string }).url);
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example/oeffentlich/kalender/google');
    const state = url.searchParams.get('state')!;

    const zurueck = await behandleOeffentlich('GET', '/oeffentlich/kalender/google', undefined, { code: 'c', state }, dienste, '');
    expect(zurueck.daten).toEqual({ umleiten: 'https://beispiel.velonify.de/#/kalender?google=verbunden' });
    expect((await behandleOeffentlich('GET', '/oeffentlich/kalender/google', undefined, { code: 'c', state }, dienste, '')).status).toBe(400);
    expect(((await kim('GET', '/c/kalender/google')).daten as { google: { verbunden: { email: string } } }).google.verbunden.email).toBe('noel@example.com');

    const neu = await kim('POST', '/c/kalender/speichern', { titel: 'Drehtag', datum: '2026-11-12', uhrzeit: '14:00', art: 'dreh', zustaendig: 'Kim, Mara' });
    const frist = (neu.daten as { frist: Frist }).frist;
    const event = [...g.events.values()].find((e) => (e.extendedProperties as { private: { hubFrist: string } } | undefined)?.private.hubFrist === frist.id)!;
    expect(event).toMatchObject({ summary: 'Drehtag', start: { dateTime: '2026-11-12T14:00:00', timeZone: 'Europe/Berlin' }, end: { dateTime: '2026-11-12T14:30:00' } });
    expect(event.attendees).toEqual([{ email: 'kim@example.com' }, { email: 'mara@example.com' }]);

    // Unchanged deadlines cost nothing; a change patches the same event.
    const vorher = g.aufrufe.length;
    await kim('POST', '/c/kalender/google/abgleichen', {});
    expect(g.aufrufe.slice(vorher).filter((a) => !a.startsWith('GET'))).toEqual([]);
    await kim('POST', '/c/kalender/erledigt', { id: frist.id, erledigt: true });
    expect(g.events.get(event.id as string)?.summary).toBe('Erledigt: Drehtag');
    await kim('POST', '/c/kalender/archivieren', { id: frist.id, archiviert: true });
    expect(g.events.has(event.id as string)).toBe(false);

    const liste = (await kim('POST', '/c/kalender/liste', { von: '2026-11-01', bis: '2026-11-30' })).daten as { termine: GoogleTermin[] };
    expect(liste.termine).toEqual([expect.objectContaining({ titel: 'Zahnarzt', datum: '2026-11-12', uhrzeit: '09:00', bis_uhrzeit: '10:00' })]);

    expect((await mara('POST', '/c/kalender/google/trennen', {})).status).toBe(200);
    expect(((await kim('GET', '/c/kalender/google')).daten as { google: { verbunden: null } }).google.verbunden).toBeNull();
  });
});
