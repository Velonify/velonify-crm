import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ConflictError, NotFoundError } from '../../src/data/errors';
import { schemaSql } from '../../src/data/postgres/ddl';
import { PostgresStore } from '../../src/data/postgres/postgresStore';
import type { Firma } from '../../src/data/types';
import { testDb } from './testDb';

const firma = (id: string, extra: Partial<Firma> = {}) =>
  ({ id, name: `Firma ${id}`, domain: `${id.toLowerCase()}.example`, score: 80, archiviert: false, geaendert_am: '2026-10-01T10:00:00.000Z', geaendert_von: 'a@velonify.de', ...extra }) as unknown as Firma;

async function store(person = 'test@velonify.de') {
  const { pool, pg } = await testDb();
  return { s: new PostgresStore(pool, () => person), pg };
}

describe('PostgresStore', () => {
  it('matches the generated schema migration', () => {
    expect(readFileSync(new URL('../migrationen/001_schema.sql', import.meta.url), 'utf8')).toBe(schemaSql());
  });

  it('returns empty text as "" like the sheet, keeps numbers and booleans typed and the insertion order', async () => {
    const { s } = await store();
    await s.insert('firmen', [firma('F-B'), firma('F-A', { score: null as never, notiz: '' })]);
    const { firmen } = await s.load();
    expect(firmen.map((f) => f.id)).toEqual(['F-B', 'F-A']);
    expect(firmen[1]).toMatchObject({ score: null, notiz: '', archiviert: false, kuerzel: '' });
    expect(firmen[0].score).toBe(80);
  });

  it('refuses an update when geaendert_am changed and writes nothing of the call', async () => {
    const { s } = await store();
    await s.insert('firmen', [firma('F-A'), firma('F-B')]);
    const fehler = await s
      .update('firmen', [
        { id: 'F-A', changes: { notiz: 'neu' } },
        { id: 'F-B', changes: { notiz: 'neu' }, expectedGeaendertAm: '2026-09-01T00:00:00.000Z' },
      ])
      .catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ConflictError);
    expect((fehler as ConflictError).geaendertVon).toBe('a@velonify.de');
    expect((await s.load()).firmen.every((f) => f.notiz === '')).toBe(true);
  });

  it('throws NotFoundError for unknown ids and builds several updates of one record on each other', async () => {
    const { s } = await store();
    await s.insert('firmen', [firma('F-A')]);
    await expect(s.update('firmen', [{ id: 'F-X', changes: { notiz: 'x' } }])).rejects.toBeInstanceOf(NotFoundError);
    const [a, b] = await s.update('firmen', [
      { id: 'F-A', changes: { notiz: 'eins' } },
      { id: 'F-A', changes: { ort: 'Hamburg' } },
    ]);
    expect(a.notiz).toBe('eins');
    expect(b).toMatchObject({ notiz: 'eins', ort: 'Hamburg' });
    expect((await s.load()).firmen[0]).toMatchObject({ notiz: 'eins', ort: 'Hamburg' });
  });

  it('logs inserts and real changes with the person, and upserts settings', async () => {
    const { s, pg } = await store('lukas@velonify.de');
    await s.insert('firmen', [firma('F-A')]);
    await s.update('firmen', [{ id: 'F-A', changes: { notiz: 'x' } }]);
    await s.update('firmen', [{ id: 'F-A', changes: { notiz: 'x' } }]);
    const { rows } = await pg.query<{ aktion: string; von: string }>("SELECT aktion, von FROM aenderungen WHERE tabelle = 'firmen' ORDER BY id");
    expect(rows).toEqual([
      { aktion: 'insert', von: 'lukas@velonify.de' },
      { aktion: 'update', von: 'lukas@velonify.de' },
    ]);
    await s.saveEinstellungen({ leads_ordner: 'a' });
    await s.saveEinstellungen({ leads_ordner: 'b', clients_ordner: 'c' });
    expect((await s.load()).einstellungen).toEqual({ leads_ordner: 'b', clients_ordner: 'c' });
  });
});
