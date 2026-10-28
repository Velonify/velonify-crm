import { describe, expect, it } from 'vitest';
import { InstanzStore } from '../../../src/data/postgres/instanzStore';
import { testDb } from '../../../db/test/testDb';
import type { InstanzRolleMitSupport, InstanzSicht } from '../../../src/data/instanz';
import { behandleInstanz, instanzRolle } from './instanz';
import { speicherGeheimnisse } from './creator/geheimnisse';
import { testKi } from './creator/ki';

const SUPPORT = ['lukas@velonify.de'];

async function aufbau() {
  const { pool } = await testDb();
  const instanz = new InstanzStore(pool);
  const als = async (email: string) => {
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    const dienste = { profil: 'creator' as const, instanz, pool, ki: testKi(() => '{}'), geheimnisse: speicherGeheimnisse(), umgebung: { hubUrl: 'https://beispiel.velonify.de', apiUrl: 'https://api.example', wert: () => undefined } };
    return (methode: string, pfad: string, body?: unknown) => behandleInstanz(methode, pfad, body, { ...dienste, email, rolle: rolle as InstanzRolleMitSupport });
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
    expect(ich.daten as InstanzSicht).toMatchObject({ name: 'Beispiel Media', rolle: 'admin', profil: 'creator', werkzeuge: ['home', 'todo', 'kalender', 'content', 'analytics', 'kooperationen', 'ablage'], betraege: true, velonify_zugang: true });
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

  it('lets only Velonify switch building blocks and shows the tools of the switched-on blocks', async () => {
    const { als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    const mara = await als('mara@example.com');
    expect((await mara('POST', '/instanz/einstellungen', { bausteine: { einnahmen: true } })).status).toBe(403);
    expect((await lukas('POST', '/instanz/einstellungen', { bausteine: { crm: true } })).status).toBe(400);
    const an = (await lukas('POST', '/instanz/einstellungen', { bausteine: { einnahmen: true, ablage: false, whiteboard: true } })).daten as InstanzSicht;
    expect(an.werkzeuge).toEqual(['home', 'todo', 'kalender', 'content', 'analytics', 'kooperationen', 'einnahmen', 'whiteboard']);
    expect(an.bausteine).toContain('einnahmen');
    expect(an.bausteine).not.toContain('ablage');
  });

  it('gives partners only their tools and boards, amounts only when allowed', async () => {
    const { als, pool } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', rolle: 'admin' });
    expect((await lukas('POST', '/instanz/zugang', { email: 'cut@example.com', rolle: 'partner' })).status).toBe(403);
    await lukas('POST', '/instanz/einstellungen', { bausteine: { partner: true } });
    await pool.query(`INSERT INTO boards (id, titel, spalten, archiviert) VALUES ('B-SCHNITT', 'Schnitt', '[]', false), ('B-INTERN', 'Intern', '[]', false)`);
    await pool.query(`INSERT INTO aufgaben (id, board_id, spalte_id, titel, archiviert) VALUES ('K-1', 'B-SCHNITT', 's', 'Rohschnitt', false), ('K-2', 'B-INTERN', 's', 'Vertrag', false)`);
    expect((await lukas('POST', '/instanz/zugang', { email: 'cut@example.com', name: 'Cut Partner', rolle: 'partner', werkzeuge: ['todo', 'content'], boards: ['B-SCHNITT'], ohne_betraege: true })).status).toBe(200);
    const cut = await als('cut@example.com');
    const ich = (await cut('GET', '/instanz/ich')).daten as InstanzSicht;
    expect(ich).toMatchObject({ rolle: 'partner', werkzeuge: ['home', 'todo', 'content'], betraege: false });
    const todos = (await cut('GET', '/daten/todos')).daten as { boards: { id: string }[]; aufgaben: { id: string }[] };
    expect(todos.boards.map((b) => b.id)).toEqual(['B-SCHNITT']);
    expect(todos.aufgaben.map((a) => a.id)).toEqual(['K-1']);
    expect((await cut('GET', '/c/kooperationen/liste')).status).toBe(403);
    expect((await cut('GET', '/tabelle/aufgaben')).status).toBe(403);
    expect((await cut('POST', '/einfuegen', { tab: 'aufgaben', records: [{ id: 'K-3', board_id: 'B-INTERN', spalte_id: 's', titel: 'x' }] })).status).toBe(403);
  });

  it('asks for approvals by area and lets only the approver decide with one click', async () => {
    const { als } = await aufbau();
    const lukas = await als('lukas@velonify.de');
    await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', name: 'Mara', rolle: 'admin' });
    await lukas('POST', '/instanz/zugang', { email: 'kim@example.com', name: 'Kim', rolle: 'team' });
    const kim = await als('kim@example.com');
    expect((await kim('GET', '/c/freigaben')).status).toBe(403);
    await lukas('POST', '/instanz/einstellungen', { bausteine: { freigaben: true } });
    const mara = await als('mara@example.com');
    expect((await mara('POST', '/c/freigaben/zustaendigkeiten', { zustaendigkeiten: [{ bereich: 'content', entscheidet: 'Mara', antwortet: 'Kim', gibt_frei: 'Mara' }] })).status).toBe(200);
    const angefragt = await kim('POST', '/c/freigaben/anfragen', { objekt_typ: 'skript', objekt_id: 'S-1', titel: 'Skript Bahn-Video', bereich: 'content' });
    const { freigabe } = angefragt.daten as { freigabe: { id: string; freigeber: string } };
    expect(freigabe.freigeber).toBe('Mara');
    expect((await kim('POST', '/c/freigaben/entscheiden', { id: freigabe.id, status: 'freigegeben' })).status).toBe(403);
    expect((await mara('POST', '/c/freigaben/entscheiden', { id: freigabe.id, status: 'abgelehnt' })).status).toBe(400);
    expect((await mara('POST', '/c/freigaben/entscheiden', { id: freigabe.id, status: 'freigegeben' })).status).toBe(200);
    expect(((await mara('GET', '/c/freigaben/fuer-mich')).daten as { freigaben: unknown[] }).freigaben).toHaveLength(0);
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
