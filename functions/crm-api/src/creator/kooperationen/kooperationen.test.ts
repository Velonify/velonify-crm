import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../../db/test/testDb';
import { BAUSTEINE } from '../../../../../src/data/instanz';
import { testKi } from '../ki';
import { speicherGeheimnisse } from '../geheimnisse';
import type { CreatorKontext } from '../modul';
import { kooperationsModule } from '../kooperationen';
import { istTag } from './daten';
let db: Awaited<ReturnType<typeof testDb>>;
let ctx: CreatorKontext;
const [koop, eink] = kooperationsModule(async () => new Response('', { status: 503 }));
const call = (path: string, body?: unknown, context = ctx) => koop.routen!(body === undefined ? 'GET' : 'POST', path, body, context);
beforeEach(async () => {
  db = await testDb();
  ctx = { pool: db.pool, email: 'admin@beispiel.example', person: 'Mara', rolle: 'admin',
    sicht: { profil: 'creator', name: 'Beispiel', email: 'admin@beispiel.example', person: 'Mara', rolle: 'admin', werkzeuge: ['home', 'kooperationen', 'einnahmen'], bausteine: BAUSTEINE.map(x => x.id), betraege: true, velonify_zugang: true },
    ki: testKi(() => 'Gemessene Zahlen'), geheimnisse: speicherGeheimnisse(),
    umgebung: { hubUrl: 'https://hub.example', apiUrl: 'https://api.example', wert: () => undefined }, jetzt: () => new Date('2026-10-28T12:00:00Z') };
});
afterEach(async () => db?.pg.close());
describe('cooperation contracts', () => {
  it('persists changes and keeps linked deadlines unique', async () => {
    const result = await call('/c/kooperationen/speichern', { partner: 'Beispiel', betrag: 500, wiedervorlage: '2026-11-01', zahlung: 'rechnung_gestellt', faellig_am: '2026-11-10' });
    expect(result?.status).toBe(200);
    expect((await call('/c/kooperationen/liste'))?.daten).toMatchObject({ kooperationen: [{ partner: 'Beispiel', betrag: 500 }] });
    const id = (result!.daten as { kooperation: { id: string } }).kooperation.id;
    await call('/c/kooperationen/speichern', { id, wiedervorlage: '2026-11-02' });
    expect((await db.pool.query('SELECT * FROM fristen')).rows).toHaveLength(2);
  });
  it('redacts amounts and ignores unauthorized amount writes', async () => {
    const created = await call('/c/kooperationen/speichern', { partner: 'Beispiel', betrag: 745.25 });
    const id = (created!.daten as { kooperation: { id: string } }).kooperation.id;
    const cutter = { ...ctx, rolle: 'schnitt' as const, sicht: { ...ctx.sicht, rolle: 'schnitt' as const, betraege: false } };
    expect((await call('/c/kooperationen/speichern', { id, betrag: 1 }, cutter))?.daten).not.toHaveProperty('kooperation.betrag');
    expect(Number((await db.pool.query<{ betrag: string }>('SELECT betrag FROM kooperationen WHERE id=$1', [id])).rows[0].betrag)).toBe(745.25);
    expect((await call('/c/kooperationen/liste', undefined, cutter))?.daten).toMatchObject({ summen: null, betraege: false });
    expect((await eink.routen!('GET', '/c/einnahmen/export/2026', undefined, cutter))?.status).toBe(403);
  });
  it('enforces switches and approval even through the generic save route', async () => {
    const limited = { ...ctx, sicht: { ...ctx.sicht, bausteine: ['kooperationen' as const] } };
    expect((await call('/c/kooperationen/speichern', { partner: 'Beispiel', stand: 'vertrag' }, limited))?.status).toBe(403);
    expect((await call('/c/kooperationen/speichern', { partner: 'Beispiel', stand: 'reporting' }))?.status).toBe(409);
    expect((await call('/c/kooperationen/mediakit', undefined, limited))?.status).toBe(403);
  });
  it('rejects impossible dates and publishing without real metrics', async () => {
    expect(istTag('2026-02-30')).toBe(false);
    expect((await call('/c/kooperationen/speichern', { partner: 'Beispiel', wiedervorlage: '2026-02-30' }))?.status).toBe(400);
    expect((await call('/c/kooperationen/mediakit/speichern', { name: 'Beispiel', veroeffentlicht: true }))?.status).toBe(409);
  });
});
