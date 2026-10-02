import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { brancheLabel, istBranche, passtBranche, zahlJeBranche } from './branchen';
import { parseCsv, planeImport } from './importCsv';
import { EMPTY_FIRMA_INPUT, type Database } from './types';

describe('Branchenfilter', () => {
  const f = (ids: string[], ausblenden = false) => ({ wahl: new Set(ids), ausblenden });

  it('zeigt ohne Auswahl alles, sonst nur die gewählten oder alle außer ihnen', () => {
    expect([passtBranche(f([]), 'mode'), passtBranche(f([]), '')]).toEqual([true, true]);
    expect([passtBranche(f(['mode', 'schmuck']), 'mode'), passtBranche(f(['mode', 'schmuck']), 'beauty'), passtBranche(f(['mode']), '')]).toEqual([true, false, false]);
    expect([passtBranche(f(['mode'], true), 'mode'), passtBranche(f(['mode'], true), 'beauty'), passtBranche(f(['mode'], true), null)]).toEqual([false, true, true]);
  });

  it('zählt je Branche und kennt nur die feste Liste', () => {
    expect(zahlJeBranche(['mode', 'mode', '', null, 'tiere'])).toEqual({ mode: 2, tiere: 1 });
    expect([istBranche('mode'), istBranche('Mode'), istBranche('')]).toEqual([true, false, false]);
    expect([brancheLabel('mode'), brancheLabel(''), brancheLabel('alt')]).toEqual(['Mode & Bekleidung', '', 'alt']);
  });
});

describe('Branche im CRM', () => {
  const optionen = { tiers: ['A', 'B', 'C', 'D', 'sonstige'], zustaendig: '', dealAnlegen: false, dealTitel: '' };

  it('übernimmt eine bekannte Branche beim Import und ergänzt sie nur, wo sie fehlt', () => {
    const db = { firmen: [{ ...EMPTY_FIRMA_INPUT, id: 'F-1', domain: 'alt.example', name: 'Alt', branche: 'beauty', tier: 'A', archiviert: false }], kontakte: [], deals: [] } as unknown as Database;
    const plan = planeImport(parseCsv('domain;tier;branche\nneu.example;A;mode\nalt.example;A;mode\nquatsch.example;A;Mode\n'), db, optionen);
    expect(plan.zeilen.map((z) => z.firma?.branche ?? z.aenderungen?.branche)).toEqual(['mode', undefined, '']);
    expect(plan.zeilen[1].aenderungen).not.toHaveProperty('branche');
  });

  it('ergänzt fehlende Branchen in einem Schritt und überschreibt keine gewählte', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const vorher = await service.load();
    const nordlicht = vorher.firmen.find((x) => x.name.startsWith('Nordlicht'))!;
    const bergwerk = vorher.firmen.find((x) => x.name.startsWith('Bergwerk'))!;
    expect([nordlicht.branche, bergwerk.branche]).toEqual(['sport', '']);
    const n = await service.ergaenzeBranchen([
      { firmaId: nordlicht.id, branche: 'mode' },
      { firmaId: bergwerk.id, branche: 'lebensmittel' },
      { firmaId: 'F-gibtsnicht', branche: 'mode' },
    ]);
    expect(n).toBe(1);
    const nachher = await service.load();
    expect(nachher.firmen.find((x) => x.id === nordlicht.id)!.branche).toBe('sport');
    expect(nachher.firmen.find((x) => x.id === bergwerk.id)!.branche).toBe('lebensmittel');
    expect(await service.ergaenzeBranchen([{ firmaId: bergwerk.id, branche: 'erfunden' }])).toBe(0);
  });
});
