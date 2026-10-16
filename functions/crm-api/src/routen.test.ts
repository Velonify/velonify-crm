import { describe, expect, it } from 'vitest';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { testDb } from '../../../db/test/testDb';
import { behandle, behandleAdmin, behandleDaten } from './routen';

async function store() {
  const { pool } = await testDb();
  return new PostgresStore(pool, () => 'test@velonify.de');
}

const deal = { id: 'D-1', firma_id: 'F-1', titel: 'Migration', phase: 'neu', geaendert_am: '2026-10-01T10:00:00.000Z', geaendert_von: 'a@velonify.de' };

describe('crm-api Routen', () => {
  it('loads every data group of the hub', async () => {
    const s = await store();
    for (const gruppe of ['kern', 'angebote', 'contact', 'audits', 'wordle', 'monstera', 'eingang', 'spiele', 'social', 'magnete', 'kunden', 'todos', 'erwaehnungen', 'portal']) {
      expect((await behandle('GET', `/daten/${gruppe}`, undefined, s)).status, gruppe).toBe(200);
    }
    expect((await behandle('GET', '/daten/geheim', undefined, s)).status).toBe(404);
  });

  it('inserts, updates and answers a conflict with 409 and who changed it', async () => {
    const s = await store();
    expect((await behandle('POST', '/einfuegen', { tab: 'deals', records: [deal] }, s)).status).toBe(200);
    const ok = await behandle('POST', '/aendern', { tab: 'deals', updates: [{ id: 'D-1', changes: { phase: 'qualifiziert' }, expectedGeaendertAm: deal.geaendert_am }] }, s);
    expect(ok).toMatchObject({ status: 200, daten: { records: [{ id: 'D-1', phase: 'qualifiziert' }] } });
    const konflikt = await behandle('POST', '/aendern', { tab: 'deals', updates: [{ id: 'D-1', changes: { phase: 'angebot' }, expectedGeaendertAm: 'alt' }] }, s);
    expect(konflikt).toMatchObject({ status: 409, daten: { geaendert_von: 'a@velonify.de', geaendert_am: deal.geaendert_am } });
    expect((await behandle('POST', '/aendern', { tab: 'deals', updates: [{ id: 'D-9', changes: {} }] }, s)).status).toBe(404);
  });

  it('hands inserted mentions to the Slack hook, and a failing hook does not fail the write', async () => {
    const s = await store();
    const erwaehnung = { id: 'ER-1', person: 'Julian', von: 'test@velonify.de', datum: '2026-10-16T10:00:00Z', art: 'kommentar', link: '/todo/B-1?karte=T-1', gelesen_am: '' };
    const erhalten: unknown[][] = [];
    const ok = await behandle('POST', '/einfuegen', { tab: 'erwaehnungen', records: [erwaehnung] }, s, { erwaehnt: async (e) => void erhalten.push(e) });
    expect(ok.status).toBe(200);
    expect(erhalten).toEqual([[erwaehnung]]);
    await behandle('POST', '/einfuegen', { tab: 'deals', records: [deal] }, s, { erwaehnt: async (e) => void erhalten.push(e) });
    expect(erhalten).toHaveLength(1);
    const kaputt = await behandle('POST', '/einfuegen', { tab: 'erwaehnungen', records: [{ ...erwaehnung, id: 'ER-2' }] }, s, { erwaehnt: async () => { throw new Error('Slack down'); } });
    expect(kaputt.status).toBe(200);
    const gelesen = await behandle('POST', '/aendern', { tab: 'erwaehnungen', updates: [{ id: 'ER-1', changes: { gelesen_am: '2026-10-16T11:00:00Z' } }] }, s);
    expect(gelesen).toMatchObject({ status: 200, daten: { records: [{ id: 'ER-1', gelesen_am: '2026-10-16T11:00:00Z' }] } });
  });

  it('refuses unknown tables, the settings tables and malformed bodies', async () => {
    const s = await store();
    expect((await behandle('POST', '/einfuegen', { tab: 'pg_user', records: [deal] }, s)).status).toBe(400);
    expect((await behandle('POST', '/einfuegen', { tab: 'einstellungen', records: [deal] }, s)).status).toBe(400);
    expect((await behandle('POST', '/einfuegen', { tab: 'deals', records: [{ titel: 'ohne id' }] }, s)).status).toBe(400);
    expect((await behandle('POST', '/einstellungen', { werte: { a: 1 } }, s)).status).toBe(400);
    expect((await behandle('DELETE', '/einfuegen', {}, s)).status).toBe(405);
  });
});

describe('Übernahme aus dem Sheet', () => {
  it('writes rows with their ids, updates on a second run and counts per table', async () => {
    const { pool, pg } = await testDb();
    const zeilen = [{ id: 'F-1', name: 'Eins', score: '80', archiviert: 'FALSE' }, { id: 'F-2', name: 'Zwei' }];
    expect((await behandleAdmin('POST', '/admin/uebernahme', { tab: 'firmen', zeilen }, pool)).daten).toEqual({ geschrieben: 2 });
    await behandleAdmin('POST', '/admin/uebernahme', { tab: 'firmen', zeilen: [{ id: 'F-1', name: 'Eins neu', score: 90 }] }, pool);
    await behandleAdmin('POST', '/admin/uebernahme', { tab: 'listen', zeilen: [{ liste: 'team', wert: 'Lugge' }] }, pool);
    await behandleAdmin('POST', '/admin/uebernahme', { tab: 'listen', zeilen: [{ liste: 'team', wert: 'Lugge' }] }, pool);
    const zahlen = (await behandleAdmin('GET', '/admin/zaehlen', undefined, pool)).daten as Record<string, number>;
    expect(zahlen).toMatchObject({ firmen: 2, listen: 1, deals: 0 });
    const { firmen } = await new PostgresStore(pool).load();
    expect(firmen[0]).toMatchObject({ id: 'F-1', name: 'Eins neu', score: 90 });
    expect((await pg.query('SELECT count(*)::int AS n FROM aenderungen')).rows).toEqual([{ n: 0 }]);
  });
});

describe('Datenansicht', () => {
  it('reads any table, shows the change log of a record and replaces a select list', async () => {
    const { pool } = await testDb();
    const s = new PostgresStore(pool, () => 'lukas@velonify.de');
    await behandle('POST', '/einfuegen', { tab: 'deals', records: [deal] }, s);
    await behandle('POST', '/aendern', { tab: 'deals', updates: [{ id: 'D-1', changes: { titel: 'Neu' } }] }, s);
    expect(await behandleDaten('GET', '/tabelle/deals', undefined, s)).toMatchObject({ status: 200, daten: { records: [{ id: 'D-1', titel: 'Neu' }] } });
    expect((await behandleDaten('GET', '/tabelle/pg_roles', undefined, s))?.status).toBe(404);
    const verlauf = (await behandleDaten('GET', '/verlauf/deals/D-1', undefined, s))?.daten as { eintraege: { aktion: string; von: string; vorher: { titel: string } | null }[] };
    expect(verlauf.eintraege.map((e) => e.aktion)).toEqual(['update', 'insert']);
    expect(verlauf.eintraege[0]).toMatchObject({ von: 'lukas@velonify.de', vorher: { titel: 'Migration' } });
    await behandleDaten('POST', '/listen', { liste: 'team', werte: ['Lugge', 'Johannes'] }, s);
    await behandleDaten('POST', '/listen', { liste: 'team', werte: ['Lugge', 'Julian', 'Lugge'] }, s);
    expect((await s.load()).listen.team).toEqual(['Lugge', 'Julian']);
    expect((await behandleDaten('POST', '/listen', { liste: 'team', werte: [] }, s))?.status).toBe(400);
    expect(await behandleDaten('GET', '/daten/kern', undefined, s)).toBeNull();
  });
});
