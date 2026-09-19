import { describe, expect, it } from 'vitest';
import { AnfrageFehler, leadRoute, pruefZeile, type Bq, type Kontext } from './api.js';
import type { Kandidat } from './pruefen.js';
import { seite } from '../testhilfen.js';

function fakeBq(antworten: Record<string, unknown[]> = {}) {
  const abfragen: { sql: string; params?: Record<string, unknown> }[] = [];
  const eingefuegt: { tabelle: string; zeilen: Record<string, unknown>[] }[] = [];
  const bq: Bq = {
    async query<T>(sql: string, params?: Record<string, unknown>) {
      abfragen.push({ sql, params });
      const schluessel = Object.keys(antworten).find((k) => sql.includes(k));
      return (schluessel ? antworten[schluessel] : []) as T[];
    },
    async insert(tabelle, zeilen) {
      eingefuegt.push({ tabelle, zeilen });
    },
  };
  return { bq, abfragen, eingefuegt };
}

const HOME = `<html><head><title>Muster Shop</title></head><body>
<script src="/web/cache/1700000000_abc.js"></script><link href="/themes/Frontend/Responsive/style.css">
<a href="/impressum">Impressum</a><a href="/checkout/cart">Warenkorb</a> 19,99 €</body></html>`;
const IMPRESSUM = '<p>Impressum</p><p>Muster Handel GmbH</p><p>Hauptstraße 1</p><p>50667 Köln</p><p>HRB 1234, Amtsgericht Köln</p>' + ' '.repeat(600);

function kontext(bq: Bq): Kontext {
  const seiten: Record<string, string> = { 'https://muster.de/': HOME, 'https://muster.de/impressum': IMPRESSUM };
  return {
    bq,
    dataset: 'p.leads',
    email: 'lukas@velonify.de',
    pruefDeps: {
      laden: async (url) => (seiten[url] ? seite(url, seiten[url]) : { url, status: 404, ok: false, headers: {}, cookies: {}, text: '' }),
      heute: new Date('2026-09-19T12:00:00Z'),
      katalog: null,
      dns: async () => ['1.2.3.4'],
    },
  };
}

describe('leadRoute', () => {
  it('prüft eine Domain, speichert die Prüfung und gibt sie zurück', async () => {
    const f = fakeBq();
    const pool = { rang_de: 50_000, lcp_ms: 1500, system: 'shopware', version: '5', system_seit: '2019-01-01', system_vorher: null };
    const k = (await leadRoute('pruefen', { domain: 'https://www.muster.de/', pool }, kontext(f.bq))) as Kandidat;
    expect(k.domain).toBe('muster.de');
    expect(k.qualifiziert).toBe(true);
    expect(k.anlaesse.map((a) => a.id)).toContain('system_ohne_support');
    expect(f.eingefuegt).toHaveLength(1);
    expect(f.eingefuegt[0].tabelle).toBe('pruefungen');
    expect(f.eingefuegt[0].zeilen[0]).toMatchObject({ domain: 'muster.de', von: 'lukas@velonify.de', qualifiziert: true, firma: 'Muster Handel GmbH', ort: 'Köln' });
  });

  it('lehnt ungültige Domains ab', async () => {
    await expect(leadRoute('pruefen', { domain: '127.0.0.1' }, kontext(fakeBq().bq))).rejects.toBeInstanceOf(AnfrageFehler);
  });

  it('speichert Entscheidungen mit Person und Zeit', async () => {
    const f = fakeBq();
    await leadRoute('entscheiden', { eintraege: [{ domain: 'www.muster.de', entscheidung: 'pipeline', firma_id: 'f_1' }, { domain: 'b.de', entscheidung: 'abgelehnt', grund: 'zu klein' }] }, kontext(f.bq));
    expect(f.eingefuegt[0].tabelle).toBe('entscheidungen');
    expect(f.eingefuegt[0].zeilen).toMatchObject([
      { domain: 'muster.de', entscheidung: 'pipeline', firma_id: 'f_1', von: 'lukas@velonify.de' },
      { domain: 'b.de', entscheidung: 'abgelehnt', grund: 'zu klein' },
    ]);
  });

  it('kennt nur die festen Entscheidungen', async () => {
    await expect(leadRoute('entscheiden', { eintraege: [{ domain: 'b.de', entscheidung: 'loeschen' }] }, kontext(fakeBq().bq))).rejects.toBeInstanceOf(AnfrageFehler);
  });

  it('holt die nächsten Kandidaten mit Obergrenze', async () => {
    const f = fakeBq({ 'pool_prio': [{ domain: 'a.de' }] });
    expect(await leadRoute('naechste', { n: 50 }, kontext(f.bq))).toEqual({ kandidaten: [{ domain: 'a.de' }] });
    expect(f.abfragen[0].params).toEqual({ n: 50 });
    await expect(leadRoute('naechste', { n: 5000 }, kontext(f.bq))).rejects.toBeInstanceOf(AnfrageFehler);
  });

  it('liefert das Detail mit ausgepacktem Ergebnis, 404 ohne Prüfung', async () => {
    const f = fakeBq({ 'letzte_pruefung': [{ daten: '{"domain":"a.de","score":70}', geprueft_am: '2026-09-19', entscheidung: null }] });
    expect(await leadRoute('detail', { domain: 'a.de' }, kontext(f.bq))).toMatchObject({ kandidat: { domain: 'a.de', score: 70 }, entscheidung: null });
    await expect(leadRoute('detail', { domain: 'b.de' }, kontext(fakeBq().bq))).rejects.toMatchObject({ status: 404 });
  });

  it('liefert mehrere Details auf einmal', async () => {
    const f = fakeBq({ 'IN UNNEST(@domains)': [{ domain: 'a.de', daten: '{"domain":"a.de"}' }] });
    expect(await leadRoute('details', { domains: ['www.a.de'] }, kontext(f.bq))).toEqual({ kandidaten: [{ domain: 'a.de' }] });
    expect(f.abfragen[0].params).toEqual({ domains: ['a.de'] });
  });

  it('importiert den neuesten Crawl mit typisiertem Datum', async () => {
    const f = fakeBq({ 'AS crawl_datum': [{ crawl_datum: '2026-09-01', crux_monat: 202608 }] });
    expect(await leadRoute('import', {}, kontext(f.bq))).toEqual({ crawl_datum: '2026-09-01', crux_monat: 202608 });
    const merge = f.abfragen.find((a) => a.sql.includes('MERGE'))!;
    expect(merge.params).toEqual({ crawl: { typ: 'DATE', wert: '2026-09-01' }, crux: 202608 });
  });
});

describe('pruefZeile', () => {
  it('speichert Listen-Spalten und das ganze Ergebnis als JSON', () => {
    const k = { domain: 'a.de', geprueft_am: '2026-09-19T12:00:00.000Z', qualifiziert: false, score: 12, ausschluss: [{ id: 'blockiert', text: 'x' }], anlaesse: [], system: '', version: '', rang_de: null, firma: { name: '', plz: '', ort: '' } } as unknown as Kandidat;
    const z = pruefZeile(k, 'a@velonify.de');
    expect(z).toMatchObject({ domain: 'a.de', ausschluss: ['blockiert'], anlaesse: [], anlass_texte: [] });
    expect(JSON.parse(z.daten as string).domain).toBe('a.de');
  });
});
