import { describe, expect, it } from 'vitest';
import { testDb } from '../../../db/test/testDb';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { speicherAblage } from '../../gemeinsam/ablage';
import { boardFuerKunde, dateiFuerKunde, sichtbareBoards } from './whiteboards';

const meta = { erstellt_am: '', erstellt_von: '', geaendert_am: '2026-10-27T10:00:00Z', geaendert_von: '' };
const el = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'rectangle', version: 1, versionNonce: 1, ...extra });

async function aufbau() {
  const { pool } = await testDb();
  await new PostgresStore(pool).insert('whiteboards', [
    { id: 'WB-1', titel: 'Sitemap', firma_id: 'F-1', vorlage: '', sichtbar_kunde: true, archiviert: false, ...meta },
    { id: 'WB-2', titel: 'Intern', firma_id: 'F-1', vorlage: '', sichtbar_kunde: false, archiviert: false, ...meta },
    { id: 'WB-3', titel: 'Andere Firma', firma_id: 'F-2', vorlage: '', sichtbar_kunde: true, archiviert: false, ...meta },
  ]);
  const elemente = [el('A'), el('weg', { isDeleted: true }), el('bild', { type: 'image', fileId: 'datei12345' }), el('S', { customData: { sticky: true } })];
  const dateien = { datei12345: { mimeType: 'image/png', pfad: 'boards/WB-1/datei12345', groesse: 3, erstellt: 1 }, alt1234567: { mimeType: 'image/png', pfad: 'boards/WB-1/alt1234567', groesse: 3, erstellt: 1 } };
  await pool.query('INSERT INTO whiteboard_inhalte (board_id, elemente, dateien) VALUES ($1, $2::jsonb, $3::jsonb)', ['WB-1', JSON.stringify(elemente), JSON.stringify(dateien)]);
  const ablage = speicherAblage();
  await ablage.schreibe('boards/WB-1/datei12345', 'image/png', Buffer.from('png'));
  await ablage.schreibe('boards/WB-1/alt1234567', 'image/png', Buffer.from('alt'));
  return { pool, ablage };
}

describe('Whiteboards im Kundenportal', () => {
  it('lists only the visible boards of the own firm', async () => {
    const { pool } = await aufbau();
    expect((await sichtbareBoards(pool, 'F-1')).map((b) => b.id)).toEqual(['WB-1']);
  });

  it('shows a visible board without deleted elements, and nothing of hidden or foreign ones', async () => {
    const { pool } = await aufbau();
    const board = await boardFuerKunde(pool, 'F-1', 'WB-1');
    expect(board?.elemente.map((e) => e.id)).toEqual(['A', 'bild', 'S']);
    expect(board?.dateien).toEqual(['datei12345']);
    expect(await boardFuerKunde(pool, 'F-1', 'WB-2')).toBeNull();
    expect(await boardFuerKunde(pool, 'F-1', 'WB-3')).toBeNull();
  });

  it('serves only images the visible board still uses', async () => {
    const { pool, ablage } = await aufbau();
    expect((await dateiFuerKunde(pool, ablage, 'F-1', 'WB-1', 'datei12345'))?.inhalt.toString()).toBe('png');
    expect(await dateiFuerKunde(pool, ablage, 'F-1', 'WB-1', 'alt1234567')).toBeNull();
    expect(await dateiFuerKunde(pool, ablage, 'F-2', 'WB-1', 'datei12345')).toBeNull();
  });
});
