import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import { hubWerkzeuge, kundenListe, linksVon, prepareKundenLink, prepareKundenNews, tauscheLink, ticker } from './kunden';
import type { KundenLink, KundenNews } from './types';

const meta = { erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' };
const news = (id: string, felder: Partial<KundenNews>): KundenNews => ({
  id, firma_id: 'F-1', art: 'update', titel: id, text: '', datum: '2026-10-10', angeheftet: false, sichtbar_kunde: false, archiviert: false, ...meta, ...felder,
});
const link = (id: string, sortierung: number, felder: Partial<KundenLink> = {}): KundenLink => ({
  id, firma_id: 'F-1', art: 'tool', titel: id, url: 'https://x.example', beschreibung: '', angeheftet: false, sichtbar_kunde: false, sortierung, archiviert: false, ...meta, ...felder,
});

describe('client hub', () => {
  it('cleans links and adds https:// to bare domains', () => {
    expect(prepareKundenLink({ art: 'tool', titel: ' GA4 ', url: 'analytics.google.com', beschreibung: ' ', angeheftet: true, sichtbar_kunde: false })).toEqual({
      art: 'tool', titel: 'GA4', url: 'https://analytics.google.com', beschreibung: '', angeheftet: true, sichtbar_kunde: false,
    });
    expect(() => prepareKundenLink({ art: 'tool', titel: '', url: 'https://x.example', beschreibung: '', angeheftet: false, sichtbar_kunde: false })).toThrow(ValidationError);
    expect(() => prepareKundenLink({ art: 'tool', titel: 'X', url: 'ftp://x', beschreibung: '', angeheftet: false, sichtbar_kunde: false })).toThrow(/https/);
  });

  it('dates news today when no date is given and rejects bad input', () => {
    const basis = { firma_id: '', art: 'hinweis' as const, titel: 'Freeze', text: '', datum: '', angeheftet: false, sichtbar_kunde: false };
    expect(prepareKundenNews(basis, '2026-10-14').datum).toBe('2026-10-14');
    expect(() => prepareKundenNews({ ...basis, titel: ' ' }, '2026-10-14')).toThrow(ValidationError);
    expect(() => prepareKundenNews({ ...basis, datum: '14.10.2026' }, '2026-10-14')).toThrow(/Datum/);
  });

  it('builds the ticker: pinned first, newest next, company-wide included, recent client-share files added', () => {
    const alle = [
      news('alt', { datum: '2026-10-01' }),
      news('neu', { datum: '2026-10-12' }),
      news('oben', { datum: '2026-09-01', angeheftet: true }),
      news('global', { firma_id: '', datum: '2026-10-11' }),
      news('fremd', { firma_id: 'F-2', datum: '2026-10-13' }),
      news('weg', { archiviert: true }),
    ];
    const dateien = [
      { id: 'd1', name: 'Report.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-13T09:00:00Z' },
      { id: 'd2', name: 'Alt.pdf', mimeType: 'application/pdf', modifiedTime: '2026-08-01T09:00:00Z' },
    ];
    expect(ticker(alle, 'F-1', '2026-10-14', dateien).map((e) => e.id)).toEqual(['oben', 'datei-d1', 'neu', 'global', 'alt']);
    expect(ticker(alle, null, '2026-10-14').map((e) => e.id)).toEqual(['oben', 'fremd', 'neu', 'global', 'alt']);
  });

  it('orders links and swaps neighbours', () => {
    const liste = linksVon([link('b', 20), link('a', 10), link('x', 5, { archiviert: true }), link('c', 30, { firma_id: 'F-2' })], 'F-1');
    expect(liste.map((l) => l.id)).toEqual(['a', 'b']);
    expect(tauscheLink(liste, 'b', -1)).toEqual([{ id: 'b', sortierung: 10 }, { id: 'a', sortierung: 20 }]);
    expect(tauscheLink(liste, 'a', -1)).toEqual([]);
  });

  it('lists clients and opens hub tools for them', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const [kunde] = kundenListe(db);
    expect(kunde.name).toBe('Alpenglanz Kosmetik AG');
    expect(hubWerkzeuge(kunde).map((w) => w.label)).toEqual(['CRM-Akte', 'Neues Angebot', 'Shop-Audit']);
    const daten = await service.loadKundenDaten();
    expect(linksVon(daten.links, kunde.id)).toHaveLength(6);
    const share = (await service.ordnerDateien(kunde.drive_ordner_id)).find((f) => f.name === '07_Client-Share');
    expect(share).toBeDefined();
    expect((await service.ordnerDateien(share!.id)).map((f) => f.name)).toEqual(['Reporting September.pdf']);
  });
});
