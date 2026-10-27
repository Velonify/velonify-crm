import { describe, expect, it } from 'vitest';
import { testDb } from '../../../db/test/testDb';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { behandleWhiteboard, speicherAblage } from './whiteboard';

const el = (id: string, version: number, extra: Record<string, unknown> = {}) => ({ id, type: 'rectangle', version, versionNonce: version * 7, ...extra });

async function aufbau() {
  const { pool } = await testDb();
  await new PostgresStore(pool, () => 'a@velonify.de').insert('whiteboards', [
    { id: 'WB-1', titel: 'Sitemap', firma_id: '', vorlage: 'sitemap', sichtbar_kunde: false, archiviert: false, erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' },
  ]);
  const ablage = speicherAblage();
  const rufe = (methode: string, pfad: string, body?: unknown, extra: { roh?: Buffer; typ?: string } = {}) =>
    behandleWhiteboard(methode, pfad, body, { pool, ablage, email: 'a@velonify.de', ...extra });
  return { rufe, ablage };
}

describe('crm-api Whiteboard', () => {
  it('starts empty and merges parallel saves of two tabs element by element', async () => {
    const { rufe } = await aufbau();
    expect(await rufe('GET', '/whiteboard/WB-1/inhalt')).toMatchObject({ status: 200, daten: { elemente: [], stand: 0 } });
    // Tab 1 draws A and B, tab 2 only knows A, changes it and adds C.
    await rufe('POST', '/whiteboard/WB-1/inhalt', { elemente: [el('A', 1), el('B', 1)] });
    const zwei = await rufe('POST', '/whiteboard/WB-1/inhalt', { elemente: [el('A', 2, { x: 50 }), el('C', 1)] });
    expect(zwei).toMatchObject({ status: 200, daten: { stand: 2, anzahl: 3 } });
    // A late, older save of tab 1 does not undo the change of tab 2.
    await rufe('POST', '/whiteboard/WB-1/inhalt', { elemente: [el('A', 1)] });
    const stand = (await rufe('GET', '/whiteboard/WB-1/inhalt')) as { daten: { elemente: { id: string; x?: number }[] } };
    expect(stand.daten.elemente.map((e) => e.id).sort()).toEqual(['A', 'B', 'C']);
    expect(stand.daten.elemente.find((e) => e.id === 'A')?.x).toBe(50);
  });

  it('refuses unknown boards and anything that is not an element', async () => {
    const { rufe } = await aufbau();
    expect((await rufe('GET', '/whiteboard/WB-9/inhalt'))?.status).toBe(404);
    expect((await rufe('POST', '/whiteboard/WB-9/inhalt', { elemente: [] }))?.status).toBe(404);
    expect((await rufe('POST', '/whiteboard/WB-1/inhalt', { elemente: [{ id: 'X' }] }))?.status).toBe(400);
    expect(await rufe('GET', '/daten/kern')).toBeNull();
  });

  it('stores images in the bucket, not in the database, and serves them back', async () => {
    const { rufe, ablage } = await aufbau();
    const bild = Buffer.from('89504e47', 'hex');
    expect((await rufe('POST', '/whiteboard/WB-1/datei/abcdef1234', undefined, { roh: bild, typ: 'image/png' }))?.status).toBe(200);
    expect(ablage.objekte.get('boards/WB-1/abcdef1234')?.inhalt).toEqual(bild);
    expect(await rufe('GET', '/whiteboard/WB-1/datei/abcdef1234')).toMatchObject({ status: 200, typ: 'image/png', inhalt: bild });
    expect((await rufe('GET', '/whiteboard/WB-1/inhalt')) as unknown).toMatchObject({ daten: { dateien: { abcdef1234: { mimeType: 'image/png', pfad: 'boards/WB-1/abcdef1234' } } } });
    expect((await rufe('POST', '/whiteboard/WB-1/datei/abcdef1234', undefined, { roh: bild, typ: 'application/pdf' }))?.status).toBe(415);
    expect((await rufe('POST', '/whiteboard/WB-1/datei/..%2Fx', undefined, { roh: bild, typ: 'image/png' }))?.status).toBe(400);
    expect((await rufe('GET', '/whiteboard/WB-1/datei/fehlt12345'))?.status).toBe(404);
  });

  it('collects the previews of all boards that are not archived', async () => {
    const { rufe } = await aufbau();
    await rufe('POST', '/whiteboard/WB-1/inhalt', { elemente: [el('A', 1)], vorschau: 'data:image/png;base64,AAAA' });
    expect(await rufe('GET', '/whiteboard/vorschauen')).toMatchObject({ status: 200, daten: { vorschauen: { 'WB-1': 'data:image/png;base64,AAAA' } } });
  });
});
