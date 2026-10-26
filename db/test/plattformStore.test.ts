import { describe, expect, it } from 'vitest';
import { PlattformFehler, PlattformStore, type MarktDaten, type MarktVorschau } from '../../src/data/postgres/plattformStore';
import { PostgresStore } from '../../src/data/postgres/postgresStore';
import type { Firma } from '../../src/data/types';
import { testDb } from './testDb';

const vorschau = (extra: Partial<MarktVorschau> = {}): MarktVorschau => ({
  branche: 'mode', plz_bereich: '5', land: 'DE', rang_de: 50_000, lcp_ms: 2100, shopify_plus: false, helpdesk: ['Zendesk'],
  email_tools: ['Klaviyo'], zahlarten: ['PayPal'], bewertungen: [], sprachen: ['de'], apps: 40, produkte: 300, ...extra,
});
const daten = (domain: string): MarktDaten => ({
  domain, firma: `Shop ${domain}`, rechtsform: 'GmbH', email: `info@${domain}`, telefon: '0221 123', ansprechpartner: 'Erika Muster',
  strasse: 'Weg 1', plz: '50667', ort: 'Köln', register: 'HRB 1', ust_id: 'DE1',
});

// 26.10.2026, 10:00 in Berlin
const JETZT = new Date('2026-10-26T09:00:00Z');

async function aufbau(jetzt = JETZT) {
  const crm = await testDb({ plattform: true });
  const plattform = new PlattformStore(crm.pool, () => jetzt);
  const vennie = await testDb();
  await plattform.speichereMandant({ id: 'vennie', name: 'vennie', lead_kontingent: 2 }, 'lukas@velonify.de');
  const zugang = await plattform.speichereZugang({ email: 'Leon@Vennie.tech', mandant_id: 'vennie', name: 'Leon Beispiel', rolle: 'inhaber' });
  return { crm, plattform, vennie, zugang };
}

describe('PlattformStore', () => {
  it('starts a 30-day trial today and finds the login case-insensitively, inactive logins do not count', async () => {
    const { plattform } = await aufbau();
    const gefunden = await plattform.zugang('leon@vennie.tech');
    expect(gefunden?.mandant).toMatchObject({ id: 'vennie', status: 'test', paket: 'test', test_start: '2026-10-26', test_ende: '2026-11-24', lead_kontingent: 2 });
    expect(gefunden?.zugang).toMatchObject({ email: 'leon@vennie.tech', rolle: 'inhaber', aktiv: true });

    await plattform.speichereZugang({ email: 'leon@vennie.tech', mandant_id: 'vennie', aktiv: false });
    expect(await plattform.zugang('leon@vennie.tech')).toBeNull();
    expect(await plattform.zugang('fremd@example.com')).toBeNull();
  });

  it('refuses Velonify addresses and addresses of another tenant', async () => {
    const { plattform } = await aufbau();
    await plattform.speichereMandant({ id: 'andere', name: 'Andere' }, 'lukas@velonify.de');
    await expect(plattform.speichereZugang({ email: 'julian@velonify.de', mandant_id: 'vennie' })).rejects.toThrow(PlattformFehler);
    await expect(plattform.speichereZugang({ email: 'leon@vennie.tech', mandant_id: 'andere' })).rejects.toThrow(/anderen Mandanten/);
  });

  it('takes shops into the market except Velonify firms, and previews carry no name, domain or contact', async () => {
    const { crm, plattform } = await aufbau();
    await new PostgresStore(crm.pool).insert('firmen', [{ id: 'F-1', name: 'Unser Lead', domain: 'www.unser-lead.de', archiviert: false } as unknown as Firma]);
    const neu = await plattform.marktAufnehmen([
      { domain: 'unser-lead.de', vorschau: vorschau(), daten: daten('unser-lead.de') },
      { domain: 'shop-a.de', vorschau: vorschau(), daten: daten('shop-a.de') },
      { domain: 'shop-b.de', vorschau: vorschau({ helpdesk: [], rang_de: 10_000 }), daten: daten('shop-b.de') },
    ]);
    expect(neu).toBe(2);
    const seite = await plattform.markt('vennie', {});
    expect(seite.gesamt).toBe(2);
    // Shops with a helpdesk first.
    expect(seite.eintraege[0].vorschau.helpdesk).toEqual(['Zendesk']);
    expect(JSON.stringify(seite)).not.toMatch(/shop-a|Shop shop|info@|Muster/);
    expect((await plattform.markt('vennie', { nur_helpdesk: true })).gesamt).toBe(1);
  });

  it('unlocks a lead into the tenant database, counts it once and gives it to nobody else', async () => {
    const { plattform, vennie, zugang } = await aufbau();
    await plattform.speichereMandant({ id: 'andere', name: 'Andere' }, 'lukas@velonify.de');
    const andere = await plattform.mandant('andere');
    await plattform.marktAufnehmen([{ domain: 'shop-a.de', vorschau: vorschau(), daten: daten('shop-a.de') }]);
    const [lead] = (await plattform.markt('vennie', {})).eintraege;
    const m = (await plattform.mandant('vennie'))!;

    const { firma_id, neu } = await plattform.freischalten(zugang, m, lead.id, vennie.pool);
    expect(neu).toBe(true);
    const db = await new PostgresStore(vennie.pool).load();
    expect(db.firmen[0]).toMatchObject({ id: firma_id, domain: 'shop-a.de', email_allgemein: 'info@shop-a.de', quelle: 'Velonify Lead-Markt', zustaendig: 'Leon', branche: 'mode' });
    expect(db.kontakte[0]).toMatchObject({ vorname: 'Erika', nachname: 'Muster', firma_id });
    expect(db.deals[0]).toMatchObject({ firma_id, phase: 'neu', titel: 'Lead-Markt' });

    // A second click returns the same firm without counting again.
    expect(await plattform.freischalten(zugang, m, lead.id, vennie.pool)).toEqual({ firma_id, neu: false, koeder: null });
    expect(await plattform.leadsVerbraucht(m)).toBe(1);
    expect((await plattform.markt('vennie', {})).gesamt).toBe(0);
    expect((await plattform.markt('andere', {})).gesamt).toBe(0);
    const fremd = { ...zugang, email: 'x@andere.de', mandant_id: 'andere' };
    await expect(plattform.freischalten(fremd, andere!, lead.id, (await testDb()).pool)).rejects.toThrow(/jemand anderen/);
  });

  it('stops at the quota with 402, and decoys neither count nor show to other tenants', async () => {
    const { plattform, vennie, zugang } = await aufbau();
    await plattform.speichereMandant({ id: 'andere', name: 'Andere' }, 'lukas@velonify.de');
    await plattform.marktAufnehmen(['a', 'b', 'c'].map((x) => ({ domain: `shop-${x}.de`, vorschau: vorschau(), daten: daten(`shop-${x}.de`) })));
    await plattform.koederAnlegen('vennie', { domain: 'koeder-laden.de', firma: 'Köder Laden GmbH', email: 'kontakt@koeder-laden.de', plz: '44135' }, vorschau());
    expect((await plattform.markt('andere', {})).gesamt).toBe(3);
    const m = (await plattform.mandant('vennie'))!;
    const eintraege = (await plattform.markt('vennie', {})).eintraege;
    expect(eintraege).toHaveLength(4);

    // The decoy is the only shop with postcode 4…; the quota is 2.
    const echte = eintraege.filter((e) => e.vorschau.plz_bereich === '5');
    const koeder = eintraege.find((e) => e.vorschau.plz_bereich === '4')!;
    await plattform.freischalten(zugang, m, echte[0].id, vennie.pool);
    await plattform.freischalten(zugang, m, koeder.id, vennie.pool);
    await plattform.freischalten(zugang, m, echte[1].id, vennie.pool);
    const ergebnis = await plattform.freischalten(zugang, m, echte[2].id, vennie.pool).catch((err: unknown) => err);
    expect(ergebnis).toBeInstanceOf(PlattformFehler);
    expect((ergebnis as PlattformFehler).status).toBe(402);
    expect(await plattform.leadsVerbraucht(m)).toBe(2);
    const domains = (await new PostgresStore(vennie.pool).load()).firmen.map((f) => f.domain);
    expect(domains).toHaveLength(3);
    expect(domains).toContain('koeder-laden.de');
    const [uebersicht] = (await plattform.mandanten()).filter((u) => u.mandant.id === 'vennie');
    expect(uebersicht.signale).toEqual(expect.arrayContaining(['Lead-Kontingent aufgebraucht', 'Köder-Lead freigeschaltet']));
  });

  it('turns read-only after the trial, and the view shows days left, quota and the due feedback question', async () => {
    const { plattform, vennie, zugang } = await aufbau();
    const m = (await plattform.mandant('vennie'))!;
    const sicht = await plattform.sicht(zugang, m, vennie.pool);
    expect(sicht).toMatchObject({ zugriff: 'voll', tage_uebrig: 30, test_tag: 1, feedback_frage: null, leads: { kontingent: 2, verbraucht: 0 } });
    expect(sicht.werkzeuge).toContain('leadmarkt');
    expect(sicht.werkzeuge).not.toContain('leads');

    const spaeter = new PlattformStore((await aufbau()).crm.pool, () => new Date('2026-11-27T09:00:00Z'));
    const fruehere = (await spaeter.mandant('vennie'))!;
    const sichtSpaeter = await spaeter.sicht(zugang, fruehere, vennie.pool);
    expect(sichtSpaeter).toMatchObject({ zugriff: 'nur_lesen', tage_uebrig: 0, feedback_frage: 'tag25' });
    await spaeter.marktAufnehmen([{ domain: 'shop-a.de', vorschau: vorschau(), daten: daten('shop-a.de') }]);
    const [lead] = (await spaeter.markt('vennie', {})).eintraege;
    await expect(spaeter.freischalten(zugang, fruehere, lead.id, vennie.pool)).rejects.toThrow(/abgelaufen/);
  });

  it('counts successes by the furthest phase of unlocked leads only', async () => {
    const { plattform, vennie, zugang } = await aufbau();
    await plattform.marktAufnehmen([{ domain: 'shop-a.de', vorschau: vorschau(), daten: daten('shop-a.de') }]);
    const m = (await plattform.mandant('vennie'))!;
    const [lead] = (await plattform.markt('vennie', {})).eintraege;
    await plattform.freischalten(zugang, m, lead.id, vennie.pool);
    await vennie.pg.query(`UPDATE deals SET phase = 'angebot'`);
    expect(await plattform.erfolge(m, vennie.pool)).toEqual({ leads: 1, gespraeche: 1, angebote: 1, gewonnen: 0 });
  });
});
