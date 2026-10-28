import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { testDb } from '../../../../db/test/testDb';
import { BAUSTEINE, type InstanzSicht } from '../../../../src/data/instanz';
import { analyticsModulMit, faellig } from './analytics';
import { speicherGeheimnisse } from './geheimnisse';
import { testKi } from './ki';
import type { CreatorKontext, Modul, TaktKontext } from './modul';

let ctx: CreatorKontext;
let pg: PGlite;
let modul: Modul;
const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
const call = (p: string, b?: unknown) => modul.routen!(b === undefined ? 'GET' : 'POST', `/c/analytics${p}`, b, ctx);
const daten = <T>(a: Awaited<ReturnType<typeof call>>) => a!.daten as T;

describe('Creator Analytics integration', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    const t = await testDb();
    pg = t.pg;
    const sicht: InstanzSicht = {
      profil: 'creator',
      name: 'Beispiel',
      email: 'mara@example.com',
      person: 'Mara',
      rolle: 'admin',
      werkzeuge: ['home', 'analytics', 'content', 'todo'],
      bausteine: BAUSTEINE.map((b) => b.id),
      betraege: true,
      velonify_zugang: true,
    };
    ctx = {
      pool: t.pool,
      email: sicht.email,
      person: 'Mara',
      rolle: 'admin',
      sicht,
      ki: testKi(() => '{}'),
      geheimnisse: speicherGeheimnisse(),
      umgebung: { hubUrl: 'https://hub.example', apiUrl: 'https://api.example', wert: () => undefined },
      jetzt: () => new Date('2026-10-28T12:00:00Z'),
    };
    modul = analyticsModulMit(fakeFetch);
  });
  afterEach(async () => {
    await pg.close();
  });

  it('plays in clearly marked sample numbers once, only for admins', async () => {
    ctx.rolle = 'team';
    expect((await call('/beispiele', {}))?.status).toBe(403);
    ctx.rolle = 'admin';
    expect((await call('/beispiele', {}))?.status).toBe(200);
    expect((await call('/beispiele', {}))?.status).toBe(200);
    const u = daten<{ konten: { plattform: string }[]; videos: unknown[]; beispiel: boolean }>(await call('/uebersicht'));
    expect(u.beispiel).toBe(true);
    expect(new Set(u.konten.map((k) => k.plattform))).toEqual(new Set(['youtube', 'instagram', 'tiktok']));
    expect(u.videos.length).toBeGreaterThan(0);
  });

  it('checks the building block of every path and the admin rights for connecting and fetching', async () => {
    ctx.sicht.bausteine = ctx.sicht.bausteine.filter((b) => !['benchmarking', 'twitch', 'ableitungen'].includes(b));
    expect((await call('/benchmark'))?.status).toBe(403);
    expect((await call('/twitch'))?.status).toBe(403);
    expect((await call('/berichte/ableitung', { bericht_id: 'B', index: 0 }))?.status).toBe(403);
    // Without client id/secret the connection answers 503 with the missing variables, never a broken redirect.
    expect((await call('/verbinden', { plattform: 'youtube' }))?.status).toBe(503);
    ctx.rolle = 'team';
    expect((await call('/verbinden', { plattform: 'youtube' }))?.status).toBe(403);
    expect((await call('/abrufen', {}))?.status).toBe(403);
    const k = daten<{ einrichtung: Record<string, string[]> }>(await call('/kanaele'));
    expect(Object.values(k.einrichtung).every((f) => f.length === 0)).toBe(true);
  });

  it('refuses an unknown or used OAuth state on the public callback', async () => {
    const oeff = { pool: ctx.pool, ki: ctx.ki, geheimnisse: ctx.geheimnisse, umgebung: ctx.umgebung, bausteine: ctx.sicht.bausteine, herkunft: '', jetzt: ctx.jetzt };
    const a = await modul.oeffentlich!('GET', '/oeffentlich/analytics/rueckruf/youtube', undefined, oeff, { state: 'falsch', code: 'x' });
    expect(a?.status).toBe(400);
    expect((await modul.oeffentlich!('GET', '/oeffentlich/analytics/rueckruf/unbekannt', undefined, oeff, {}))?.status).toBe(404);
  });

  it('keeps Instagram benchmarking manual or by CSV, with preview, errors and no double rows', async () => {
    const csv = 'plattform,handle,name,datum,follower,beitraege\ninstagram,beispiel.creator,Beispiel,2026-10-20,12000,240\ninstagram,beispiel.creator,Beispiel,2026-10-27,12500,244\n';
    const v = daten<{ gueltig: boolean; zeilen: unknown[] }>(await call('/benchmark/vorschau', { csv }));
    expect(v.gueltig).toBe(true);
    expect(v.zeilen).toHaveLength(2);
    const doppelt = daten<{ gueltig: boolean }>(await call('/benchmark/vorschau', { csv: csv + 'instagram,beispiel.creator,Beispiel,2026-10-27,1,1\n' }));
    expect(doppelt.gueltig).toBe(false);
    expect((await call('/benchmark/import', { csv: 'plattform,handle,datum,follower\nfacebook,x,2026-13-01,1\n' }))?.status).toBe(400);
    expect((await call('/benchmark/import', { csv }))?.status).toBe(200);
    expect((await call('/benchmark/import', { csv }))?.status).toBe(200);
    const b = daten<{ kanaele: unknown[]; werte: { quelle: string }[] }>(await call('/benchmark'));
    expect(b.kanaele).toHaveLength(1);
    expect(b.werte).toHaveLength(2);
    expect(b.werte.every((w) => w.quelle === 'manuell')).toBe(true);
    // Without Facebook Login the API fetch says what to do instead of failing silently.
    const abruf = daten<{ kanaele: { fehler?: string }[] }>(await call('/benchmark/abrufen', {}));
    expect(abruf.kanaele[0].fehler).toMatch(/Facebook Login|manuell/);
  });

  it('lets Claude suggest features only from the maintained lists', async () => {
    await call('/beispiele', {});
    for (const [art, wert] of [['thema', 'Alltag'], ['format', 'Reaktion'], ['hook', 'Frage']]) expect((await call('/merkmale/liste', { art, wert }))?.status).toBe(200);
    await ctx.pool.query('DELETE FROM video_merkmale');
    ctx.ki = testKi(() => JSON.stringify({ thema: 'Alltag', format: 'Reaktion', hook: 'Frage', begruendung: 'passt' }));
    const r = daten<{ bearbeitet: number }>(await call('/merkmale/vorschlagen', {}));
    expect(r.bearbeitet).toBeGreaterThan(0);
    ctx.ki = testKi(() => JSON.stringify({ thema: 'Erfunden', format: 'Reaktion', hook: 'Frage' }));
    await ctx.pool.query('DELETE FROM video_merkmale');
    expect((await call('/merkmale/vorschlagen', {}))?.status).toBe(502);
  });

  it('writes the weekly report once, needs an assessment before approval, and runs from the timed job', async () => {
    await call('/beispiele', {});
    ctx.ki = testKi(() => JSON.stringify({ text: 'Die Woche lief gut.', ableitungen: [{ titel: 'Mehr Alltag', kanal: 'tiktok', format: 'Reaktion', begruendung: 'beste Werte' }, { titel: 'Frage-Hooks', kanal: 'instagram', format: 'Reel', begruendung: 'hohe Rate' }, { titel: 'Langform', kanal: 'youtube', format: 'Vlog', begruendung: 'Wiedergabezeit' }] }));
    const erstellt = await call('/berichte/erstellen', { typ: 'woche' });
    expect(erstellt?.status).toBe(200);
    const { id } = daten<{ id: string }>(erstellt);
    expect(daten<{ vorhanden?: boolean }>(await call('/berichte/erstellen', { typ: 'woche' })).vorhanden).toBe(true);
    expect((await call('/berichte/freigeben', { id }))?.status).toBe(409);
    expect((await call('/berichte/einschaetzen', { id, einschaetzung: 'Passt so.' }))?.status).toBe(200);
    expect((await call(`/berichte/${id}`))?.status).toBe(200);
    expect(faellig(new Date('2026-11-02T06:00:00Z'))).toEqual({ woche: true, monat: false });
    expect(faellig(new Date('2026-11-01T06:00:00Z'))).toEqual({ woche: false, monat: true });
    const takt: TaktKontext = { pool: ctx.pool, ki: ctx.ki, geheimnisse: ctx.geheimnisse, umgebung: ctx.umgebung, bausteine: ctx.sicht.bausteine, jetzt: () => new Date('2026-11-02T06:00:00Z') };
    const lauf = (await modul.takte!.berichte(takt)) as { woche: unknown };
    expect(lauf.woche).toBeTruthy();
  });
});
