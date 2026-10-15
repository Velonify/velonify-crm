import { describe, expect, it } from 'vitest';
import { MemorySheets } from './demo/memorySheets';
import { runSetup } from './sheets/setup';
import { inPaketen, liesSheet, pruefbericht } from './uebernahme';

describe('Übernahme aus dem Sheet', () => {
  it('reads every tab, keeps the first of duplicate ids and reports what would get lost', async () => {
    const sheets = new MemorySheets();
    await runSetup(sheets);
    const kopf = (await sheets.getValues("'firmen'!1:1"))[0].map(String);
    const zeile = (werte: Record<string, unknown>) => kopf.map((s) => werte[s] ?? '');
    await sheets.appendValues("'firmen'!A1", [
      zeile({ id: 'F-1', name: 'Eins', domain: 'eins.example', archiviert: false }),
      zeile({ id: 'F-1', name: 'Doppelt' }),
      zeile({ id: 'F-2', name: 'Zwei', domain: 'EINS.example', archiviert: false }),
      zeile({ name: 'ohne id' }),
    ]);
    const dKopf = (await sheets.getValues("'deals'!1:1"))[0].map(String);
    await sheets.appendValues("'deals'!A1", [dKopf.map((s) => ({ id: 'D-1', firma_id: 'F-9', phase: 'irgendwas' })[s as 'id'] ?? '')]);

    const abzug = await liesSheet(sheets);
    const firmen = abzug.find((t) => t.tab === 'firmen')!;
    expect(firmen.zeilen.map((z) => z.name)).toEqual(['Eins', 'Zwei']);
    expect(firmen).toMatchObject({ ohneId: 1, doppelteIds: ['F-1'] });
    const texte = pruefbericht(abzug).map((b) => `${b.tab}/${b.art}`);
    expect(texte).toEqual(expect.arrayContaining(['firmen/ohne_id', 'firmen/doppelt', 'firmen/domain', 'deals/verweis', 'deals/wert']));
    expect(abzug.find((t) => t.tab === 'listen')!.zeilen.length).toBeGreaterThan(0);
  });

  it('splits rows into packages', () => {
    expect(inPaketen([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
