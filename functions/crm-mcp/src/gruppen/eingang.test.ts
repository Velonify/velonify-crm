import { describe, expect, it } from 'vitest';
import { DemoLeadFinder } from '../../../../src/data/demo/leadFinderDemo';
import { demoDienste, verbinde } from '../testhilfe';

/** Demo lead finder without waiting, so the checks run instantly. */
const schnell = () => verbinde(undefined, undefined, { dienste: { ...demoDienste(), leadFinder: new DemoLeadFinder(0) } });

const JOB = 'https://www.linkedin.com/jobs/view/123456/?trk=demo';

describe('Eingang: Anfragen', () => {
  it('listet offene Anfragen mit Vorschlag und ähnlichen Firmen', async () => {
    const { rufe } = await verbinde();
    const { daten } = await rufe('anfragen');
    expect(daten.offen).toBe(2);
    expect(daten.anfragen.map((a: { anfrage_id: string }) => a.anfrage_id)).toEqual(['EA-DEMO1', 'EA-DEMO2']);
    const bekannt = daten.anfragen[0];
    expect(bekannt.neue_firma_hiesse).toBe('nordlicht-outdoor.example');
    expect(bekannt.aehnliche_firmen[0].name).toBe('Nordlicht Outdoor GmbH');
    expect(daten.anfragen[1].aehnliche_firmen).toBeUndefined();
  });

  it('übernimmt nicht bei ähnlicher Firma, hängt aber über firma_id an', async () => {
    const { rufe, service } = await verbinde();
    const abgelehnt = await rufe('anfrage_uebernehmen', { anfrage_id: 'EA-DEMO1' });
    expect(abgelehnt.daten.uebernommen).toBe(false);
    const firmaId = abgelehnt.daten.aehnlich[0].firma_id;

    const { daten } = await rufe('anfrage_uebernehmen', { anfrage_id: 'EA-DEMO1', firma_id: firmaId, deal_anlegen: false });
    expect(daten).toMatchObject({ uebernommen: true, firma_id: firmaId });
    expect(daten.deal_id).toBeUndefined();
    const db = await service.load();
    expect(db.aktivitaeten.some((a) => a.firma_id === firmaId && a.text.startsWith('Anfrage über'))).toBe(true);
    const nochmal = await rufe('anfrage_uebernehmen', { anfrage_id: 'EA-DEMO1', firma_id: firmaId });
    expect(nochmal.fehler).toBe(true);
    expect(nochmal.text).toContain('schon übernommen');
  });

  it('legt aus einer neuen Anfrage Firma, Kontakt und Deal an', async () => {
    const { rufe, service } = await verbinde();
    const { daten } = await rufe('anfrage_uebernehmen', { anfrage_id: 'EA-DEMO2', firmenname: 'Fjordlicht Testhandel' });
    expect(daten.uebernommen).toBe(true);
    const db = await service.load();
    const firma = db.firmen.find((f) => f.id === daten.firma_id)!;
    expect(firma).toMatchObject({ name: 'Fjordlicht Testhandel', domain: 'fjordlicht.example', zustaendig: 'Lugge' });
    expect(db.deals.find((d) => d.id === daten.deal_id)?.phase).toBe('neu');
    expect((await rufe('anfragen')).daten.offen).toBe(1);
  });

  it('verwirft eine Anfrage und meldet unbekannte IDs mit Herkunft', async () => {
    const { rufe } = await verbinde();
    expect((await rufe('anfrage_verwerfen', { anfrage_id: 'EA-DEMO2' })).daten.verworfen).toBe(true);
    const erledigt = await rufe('anfragen', { status: 'erledigt' });
    expect(erledigt.daten.anfragen[0]).toMatchObject({ anfrage_id: 'EA-DEMO2', status: 'verworfen' });
    const falsch = await rufe('anfrage_verwerfen', { anfrage_id: 'EA-GIBTSNICHT' });
    expect(falsch.fehler).toBe(true);
    expect(falsch.text).toContain('`anfragen`');
  });
});

describe('Eingang: LinkedIn', () => {
  it('liest einen Link und legt den Lead mit Herkunft im Verlauf an', async () => {
    const { rufe, service } = await verbinde();
    const gelesen = await rufe('linkedin_lesen', { url: JOB });
    const v = gelesen.daten.vorschlag;
    expect(v.firma).toMatchObject({ domain: 'beispiel-spielwaren.de', quelle: 'LinkedIn-Stellenanzeige' });
    expect(v.herkunft).toContain('LinkedIn-Stellenanzeige');
    expect(gelesen.daten.aehnliche_firmen).toEqual([]);

    const { daten } = await rufe('linkedin_lead_anlegen', {
      herkunft: v.herkunft,
      anlass: v.anlass,
      firma: v.firma,
      deal: { titel: v.deal_titel },
    });
    expect(daten.angelegt).toBe(true);
    const db = await service.load();
    expect(db.deals.find((d) => d.id === daten.deal_id)?.phase).toBe('qualifiziert');
    const vermerk = db.aktivitaeten.find((a) => a.firma_id === daten.firma_id && a.typ === 'notiz')!;
    expect(vermerk.text).toContain('https://www.linkedin.com/jobs/view/123456/');
    expect(vermerk.text).toContain(v.anlass);

    // A second time the firm is found as a duplicate.
    const nochmal = await rufe('linkedin_lead_anlegen', { herkunft: v.herkunft, firma: v.firma });
    expect(nochmal.daten.angelegt).toBe(false);
  });

  it('lehnt fremde Links und fehlende Dienste ab', async () => {
    const { rufe } = await verbinde();
    expect((await rufe('linkedin_lesen', { url: 'https://beispiel.example/jobs' })).fehler).toBe(true);
    expect((await rufe('linkedin_lead_anlegen', { herkunft: 'irgendwas', firma: { name: 'Test' } })).text).toContain('LinkedIn-Link');
    const ohne = await verbinde(undefined, undefined, { dienste: {} });
    const r = await ohne.rufe('linkedin_lesen', { url: JOB });
    expect(r.fehler).toBe(true);
    expect(r.text).toContain('SHOP_AUDIT_URL');
  });
});

describe('Eingang: CSV-Import', () => {
  const CSV = [
    'tier;domain;firma;ansprechpartner',
    'A;neu-testshop.example;Neu Testshop GmbH;Erika Probe',
    'C;klein-testshop.example;Klein Testshop;',
    'B;nordlicht-outdoor.example;;',
    'A;;Ohne Domain;',
  ].join('\n');

  it('zeigt erst die Vorschau und importiert dann', async () => {
    const { rufe, service } = await verbinde();
    const vorschau = await rufe('csv_import', { csv: CSV });
    expect(vorschau.daten.vorschau).toBe(true);
    expect(vorschau.daten.zaehler).toMatchObject({ neu: 1, uebersprungen: 1, fehler: 1 });
    expect(vorschau.daten.zeilen.find((z: { domain: string }) => z.domain === 'klein-testshop.example').hinweis).toContain('Tier C');
    expect((await service.load()).firmen.some((f) => f.domain === 'neu-testshop.example')).toBe(false);

    const { daten } = await rufe('csv_import', { csv: CSV, ausfuehren: true });
    expect(daten).toMatchObject({ importiert: true, neue_firmen: 1, kontakte: 1, deals: 1 });
    const db = await service.load();
    expect(db.firmen.find((f) => f.domain === 'neu-testshop.example')?.zustaendig).toBe('Lugge');
  });

  it('meldet eine fehlende Pflichtspalte', async () => {
    const { rufe } = await verbinde();
    const r = await rufe('csv_import', { csv: 'firma,ort\nTest,Köln' });
    expect(r.fehler).toBe(true);
    expect(r.text).toContain('domain');
  });
});

describe('Eingang: Lead-Finder', () => {
  it('liest Backlog, Manuell-Liste, Prüfdaten und Zahlen', async () => {
    const { rufe } = await schnell();
    const backlog = await rufe('lead_finder_backlog', { limit: 5 });
    expect(backlog.daten.shops).toHaveLength(5);
    const scores = backlog.daten.shops.map((s: { score: number }) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const manuell = await rufe('lead_finder_manuell');
    expect(manuell.daten.shops[0].warum_manuell).toContain('Blockiert');

    const shop = await rufe('lead_finder_shop', { domain: backlog.daten.shops[0].domain });
    expect(shop.daten.kann_uebernommen_werden).toBe(true);
    expect(shop.daten.sichten.length).toBeGreaterThan(0);

    const zahlen = await rufe('lead_finder_statistik');
    expect(zahlen.daten.backlog).toBeGreaterThan(0);
  });

  it('prüft die nächsten Shops aus dem Pool', async () => {
    const { rufe } = await schnell();
    const vorher = (await rufe('lead_finder_statistik')).daten.geprueft;
    const { daten } = await rufe('lead_finder_pruefen', { anzahl: 3 });
    expect(daten.geprueft).toBe(3);
    expect((await rufe('lead_finder_statistik')).daten.geprueft).toBe(vorher + 3);
  });

  it('übernimmt Shops über die Import-Planung und vermerkt die Entscheidung', async () => {
    const { rufe, service } = await schnell();
    const [shop] = (await rufe('lead_finder_backlog', { limit: 1 })).daten.shops;
    const { daten } = await rufe('lead_finder_uebernehmen', { domains: [shop.domain], bereich: 'migration' });
    expect(daten).toMatchObject({ neu: 1, deals: 1 });
    const db = await service.load();
    const firma = db.firmen.find((f) => f.id === daten.firmen[0].firma_id)!;
    expect(firma).toMatchObject({ domain: shop.domain, quelle: 'Lead-Finder' });
    expect(db.deals.find((d) => d.firma_id === firma.id)?.titel).toBe('Shopify-Migration');
    const detail = await rufe('lead_finder_shop', { domain: shop.domain });
    expect(detail.daten.entscheidung).toMatchObject({ entscheidung: 'pipeline', firma_id: firma.id });

    const unbekannt = await rufe('lead_finder_uebernehmen', { domains: ['nicht-geprueft.example'] });
    expect(unbekannt.fehler).toBe(true);

    const nochmal = await rufe('lead_finder_uebernehmen', { domains: [shop.domain] });
    expect(nochmal.fehler).toBe(true);
    expect(nochmal.text).toContain('schon entschieden');
  });

  it('lehnt ab, stellt zurück und gibt manuell geprüfte Shops frei', async () => {
    const { rufe } = await schnell();
    const [a, b] = (await rufe('lead_finder_backlog', { limit: 2 })).daten.shops;
    expect((await rufe('lead_finder_entscheiden', { domains: [a.domain], entscheidung: 'ablehnen' })).fehler).toBe(true);
    await rufe('lead_finder_entscheiden', { domains: [a.domain], entscheidung: 'ablehnen', grund: 'Zu klein' });
    await rufe('lead_finder_entscheiden', { domains: [b.domain], entscheidung: 'zurueckstellen' });
    const rest = (await rufe('lead_finder_backlog', { limit: 200 })).daten.shops.map((s: { domain: string }) => s.domain);
    expect(rest).not.toContain(a.domain);
    expect(rest).not.toContain(b.domain);

    const [manuell] = (await rufe('lead_finder_manuell')).daten.shops;
    expect((await rufe('lead_finder_entscheiden', { domains: [manuell.domain], entscheidung: 'freigeben', email: 'kein-mail' })).fehler).toBe(true);
    const frei = await rufe('lead_finder_entscheiden', { domains: [manuell.domain], entscheidung: 'freigeben', email: 'kontakt@testshop.example' });
    expect(frei.daten.entscheidung).toBe('freigegeben');
    const backlog = (await rufe('lead_finder_backlog', { limit: 200 })).daten.shops.map((s: { domain: string }) => s.domain);
    expect(backlog).toContain(manuell.domain);
  });

  it('ordnet Branchen ein, trägt sie bei CRM-Firmen nach und aktualisiert den Pool', async () => {
    const { rufe, service } = await schnell();
    const branchen = await rufe('lead_finder_branchen', { anzahl: 48 });
    expect(branchen.daten.eingeordnet.length).toBeGreaterThan(5);
    expect(branchen.daten.noch_offen).toBe(0);
    expect((await rufe('lead_finder_backlog', { branchen: ['lebensmittel'] })).daten.shops.length).toBeGreaterThan(0);

    const ohne = (await service.load()).firmen.filter((f) => !f.archiviert && !f.branche).length;
    const nachtrag = await rufe('branchen_nachtragen', { limit: 3 });
    expect(nachtrag.daten.geprueft).toBe(3);
    expect((await service.load()).firmen.filter((f) => !f.archiviert && !f.branche).length).toBe(ohne - nachtrag.daten.ergaenzt);

    expect((await rufe('lead_finder_pool_aktualisieren')).daten.aktualisiert).toBe(true);
  });

  it('sagt, wenn der Lead-Finder nicht eingerichtet ist', async () => {
    const { rufe } = await verbinde(undefined, undefined, { dienste: {} });
    const r = await rufe('lead_finder_backlog');
    expect(r.fehler).toBe(true);
    expect(r.text).toContain('Der Lead-Finder');
  });

  it('markiert lesende und schreibende Werkzeuge', async () => {
    const { client } = await verbinde();
    const { tools } = await client.listTools();
    const hinweis = (name: string) => tools.find((t) => t.name === name)?.annotations?.readOnlyHint;
    for (const name of ['anfragen', 'linkedin_lesen', 'lead_finder_backlog', 'lead_finder_manuell', 'lead_finder_shop', 'lead_finder_statistik']) expect(hinweis(name)).toBe(true);
    for (const name of ['anfrage_uebernehmen', 'anfrage_verwerfen', 'linkedin_lead_anlegen', 'csv_import', 'lead_finder_pruefen', 'lead_finder_uebernehmen', 'lead_finder_entscheiden', 'lead_finder_branchen', 'branchen_nachtragen', 'lead_finder_pool_aktualisieren']) {
      expect(hinweis(name)).toBe(false);
    }
  });
});
