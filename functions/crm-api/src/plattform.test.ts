import { describe, expect, it } from 'vitest';
import { PlattformStore } from '../../../src/data/postgres/plattformStore';
import { PostgresStore } from '../../../src/data/postgres/postgresStore';
import { testDb } from '../../../db/test/testDb';
import { behandleMandant, behandlePlattformAdmin, pruefeKi, type MandantKontext } from './plattform';

async function aufbau(jetzt = new Date('2026-10-26T09:00:00Z')) {
  const crm = await testDb({ plattform: true });
  const plattform = new PlattformStore(crm.pool, () => jetzt);
  await behandlePlattformAdmin('POST', '/plattform/mandant', {}, { id: 'vennie', name: 'vennie', ki_kontingent: 1, test_start: '2026-10-26' }, plattform, 'lukas@velonify.de');
  await behandlePlattformAdmin('POST', '/plattform/zugang', {}, { email: 'leon@vennie.tech', mandant_id: 'vennie', name: 'Leon', rolle: 'inhaber' }, plattform, 'lukas@velonify.de');
  const hub = await testDb();
  const meldungen: string[] = [];
  const kontext = async (): Promise<MandantKontext> => {
    const { zugang, mandant } = (await plattform.zugang('leon@vennie.tech'))!;
    return { plattform, zugang, mandant, pool: hub.pool, store: new PostgresStore(hub.pool, () => zugang.email), melde: async (t) => void meldungen.push(t) };
  };
  return { plattform, hub, kontext, meldungen };
}

describe('crm-api für Mandanten', { timeout: 60_000 }, () => {
  it('answers /ich with the trial and puts the logins into the team list', async () => {
    const { kontext } = await aufbau();
    const ich = await behandleMandant('GET', '/ich', undefined, await kontext());
    expect(ich).toMatchObject({ status: 200, daten: { zugriff: 'voll', tage_uebrig: 30, rolle: 'inhaber', mandant: { id: 'vennie' } } });
    const kern = await behandleMandant('GET', '/daten/kern', undefined, await kontext());
    expect((kern.daten as { listen: { team: string[] } }).listen.team).toEqual(['Leon']);
  });

  it('keeps the data view and Velonify routes closed', async () => {
    const { kontext } = await aufbau();
    expect((await behandleMandant('GET', '/tabelle/firmen', undefined, await kontext())).status).toBe(403);
    expect((await behandleMandant('GET', '/plattform/mandanten', undefined, await kontext())).status).toBe(403);
    expect((await behandleMandant('POST', '/admin/uebernahme', {}, await kontext())).status).toBe(403);
  });

  it('is read-only after the trial and locked a week later, feedback and booking still work', async () => {
    const lesen = await aufbau(new Date('2026-11-26T09:00:00Z'));
    const firma = { tab: 'firmen', records: [{ id: 'F-1', name: 'Neu', domain: 'neu.de', archiviert: false }] };
    expect((await behandleMandant('POST', '/einfuegen', firma, await lesen.kontext())).status).toBe(403);
    expect((await behandleMandant('GET', '/daten/kern', undefined, await lesen.kontext())).status).toBe(200);

    const zu = await aufbau(new Date('2026-12-10T09:00:00Z'));
    expect((await behandleMandant('GET', '/daten/kern', undefined, await zu.kontext())).status).toBe(403);
    expect((await behandleMandant('POST', '/buchen', { paket: 'pro' }, await zu.kontext())).status).toBe(200);
    expect(zu.meldungen[0]).toMatch(/vennie will Pro \(349 € im Monat\) buchen/);
    const [uebersicht] = ((await behandlePlattformAdmin('GET', '/plattform/mandanten', {}, undefined, zu.plattform, 'lukas@velonify.de')).daten as { mandanten: { signale: string[] }[] }).mandanten;
    expect(uebersicht.signale).toContain('Will Pro buchen');
  });

  it('logs pipeline moves for the health score and reports feedback', async () => {
    const { kontext, plattform, meldungen } = await aufbau();
    const deal = { id: 'D-1', firma_id: 'F-1', titel: 'x', phase: 'neu', geaendert_am: '2026-10-26T09:00:00.000Z', geaendert_von: 'leon@vennie.tech' };
    await behandleMandant('POST', '/einfuegen', { tab: 'deals', records: [deal] }, await kontext());
    await behandleMandant('POST', '/aendern', { tab: 'deals', updates: [{ id: 'D-1', changes: { phase: 'gespraech' }, expectedGeaendertAm: deal.geaendert_am }] }, await kontext());
    expect((await behandleMandant('POST', '/feedback', { anlass: 'tag14', wert: 4, text: 'Gute Leads' }, await kontext())).status).toBe(200);
    expect((await behandleMandant('POST', '/feedback', { anlass: 'quatsch', text: 'x' }, await kontext())).status).toBe(400);
    const detail = await plattform.mandantDetail('vennie');
    expect(detail.nutzung.map((n) => (n as { art: string }).art)).toContain('bewegung');
    expect(detail.feedback).toHaveLength(1);
    // The test database has no hub_vennie, so the admin page asks for it.
    expect(detail.datenbank).toBe(false);
    expect(meldungen.at(-1)).toMatch(/Feedback von Leon \(vennie, tag14, 4\): Gute Leads/);
  });

  it('lets KI requests through only for switched-on tools, allowed paths and within the quota', async () => {
    const { kontext } = await aufbau();
    const ctx = await kontext();
    const alle = ['contact', 'audit'];
    expect(await pruefeKi('audit', '/leads/backlog', ctx, alle)).toMatchObject({ status: 403 });
    expect(await pruefeKi('contact', '/', ctx, ['audit'])).toMatchObject({ status: 403 });
    expect(await pruefeKi('audit', '/ergebnis', ctx, alle)).toEqual({ pfad: '/ergebnis' });
    expect(await pruefeKi('contact', '/frage', ctx, alle)).toEqual({ pfad: '/frage' });
    // ki_kontingent is 1: the second call is refused with 402.
    expect(await pruefeKi('audit', '/', ctx, alle)).toMatchObject({ status: 402 });
  });
});
