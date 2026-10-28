import { describe, expect, it } from 'vitest';
import { InstanzStore } from '../../../src/data/postgres/instanzStore';
import { testDb } from '../../../db/test/testDb';
import type { InstanzRolleMitSupport, InstanzSicht } from '../../../src/data/instanz';
import { behandleInstanz, instanzRolle } from './instanz';

const SUPPORT = ['lukas@velonify.de'];

async function aufbau() {
  const { pool } = await testDb();
  const instanz = new InstanzStore(pool);
  const als = async (email: string) => {
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    return (methode: string, pfad: string, body?: unknown) => behandleInstanz(methode, pfad, body, { profil: 'creator', instanz, pool, email, rolle: rolle as InstanzRolleMitSupport });
  };
  return { pool, instanz, als };
}

describe('crm-api in einer eigenen Instanz', { timeout: 60_000 }, () => {
  it('lets in only invited addresses and Velonify support, and support only while it is switched on', async () => {
    const { instanz, als } = await aufbau();
    expect(await instanzRolle(instanz, 'fremd@example.com', SUPPORT)).toBeNull();
    expect(await instanzRolle(instanz, 'lukas@velonify.de', SUPPORT)).toBe('velonify');

    const lukas = await als('lukas@velonify.de');
    expect((await lukas('POST', '/instanz/zugang', { email: 'Chefin@Example.com', name: 'Mara Beispiel', rolle: 'admin' })).status).toBe(200);
    expect(await instanzRolle(instanz, 'chefin@example.com', SUPPORT)).toBe('admin');

    const chefin = await als('chefin@example.com');
    expect((await chefin('POST', '/instanz/einstellungen', { velonify_zugang: false })).status).toBe(200);
    expect(await instanzRolle(instanz, 'lukas@velonify.de', SUPPORT)).toBeNull();
  });

  it('answers /instanz/ich with name, role and the tools of the profile, and fills the team list', async () => {
    const { pool, als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/einstellungen', { name: 'Beispiel Media' });
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', name: 'Mara Beispiel', rolle: 'admin' });
    await lukas('POST', '/instanz/zugang', { email: 'cut@example.com', rolle: 'schnitt' });

    const ich = await (await als('mara@example.com'))('GET', '/instanz/ich');
    expect(ich.status).toBe(200);
    expect(ich.daten as InstanzSicht).toMatchObject({ name: 'Beispiel Media', rolle: 'admin', profil: 'creator', werkzeuge: ['home', 'todo', 'whiteboard'], velonify_zugang: true });
    const { rows } = await pool.query<{ wert: string }>(`SELECT wert FROM listen WHERE liste = 'team' ORDER BY nr`);
    expect(rows.map((r) => r.wert)).toEqual(['Mara', 'Cut']);
  });

  it('keeps Einrichtung, data view and Velonify routes closed for team and schnitt', async () => {
    const { als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    await lukas('POST', '/instanz/zugang', { email: 'team@example.com', rolle: 'team' });
    const team = await als('team@example.com');
    expect((await team('GET', '/instanz/zugaenge')).status).toBe(403);
    expect((await team('POST', '/instanz/zugang', { email: 'neu@example.com' })).status).toBe(403);
    expect((await team('GET', '/tabelle/firmen')).status).toBe(403);
    expect((await team('POST', '/admin/uebernahme', {})).status).toBe(403);
    expect((await team('GET', '/plattform/mandanten')).status).toBe(403);
    // Instance settings never go through the generic route.
    expect((await team('POST', '/einstellungen', { werte: { instanz_velonify_zugang: 'an' } })).status).toBe(403);
    expect((await team('GET', '/daten/kern')).status).toBe(200);
  });

  it('lets only Velonify switch tools, keeps Home and refuses tools outside the profile', async () => {
    const { als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    const mara = await als('mara@example.com');
    expect((await mara('POST', '/instanz/einstellungen', { funktionen: { whiteboard: false } })).status).toBe(403);
    expect((await lukas('POST', '/instanz/einstellungen', { funktionen: { crm: true } })).status).toBe(400);
    const an = await lukas('POST', '/instanz/einstellungen', { funktionen: { whiteboard: false, home: false } });
    expect((an.daten as InstanzSicht).werkzeuge).toEqual(['home', 'todo']);
  });

  it('never lets the last admin go or an admin demote themselves', async () => {
    const { als, instanz } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    await lukas('POST', '/instanz/zugang', { email: 'team@example.com', rolle: 'team' });
    const mara = await als('mara@example.com');
    expect((await mara('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'team' })).status).toBe(400);
    expect((await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', aktiv: false })).status).toBe(409);
    expect(await instanzRolle(instanz, 'mara@example.com', SUPPORT)).toBe('admin');
    expect((await lukas('POST', '/instanz/zugang', { email: 'team@example.com', rolle: 'chef' })).status).toBe(400);
  });

  it('hides amounts from schnitt like from Velonify employees', async () => {
    const { als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    await lukas('POST', '/instanz/zugang', { email: 'cut@example.com', rolle: 'schnitt' });
    const deal = { tab: 'deals', records: [{ id: 'D-1', firma_id: 'F-1', titel: 'Kooperation', phase: 'neu', wert_eur: 1200, archiviert: false }] };
    expect((await lukas('POST', '/einfuegen', deal)).status).toBe(200);
    const kern = async (email: string) => ((await (await als(email))('GET', '/daten/kern')).daten as { deals: { wert_eur: number | null }[] }).deals[0];
    expect((await kern('cut@example.com')).wert_eur).toBeNull();
    expect(Number((await kern('mara@example.com')).wert_eur)).toBe(1200);
  });
});
