import { describe, expect, it } from 'vitest';
import { MemorySheets } from '../demo/memorySheets';
import { checkSetup, runSetup } from './setup';
import { SheetStore } from './sheetStore';
import type { SheetsApi } from './sheetsClient';

/** Counts what actually goes to Google: every request costs quota. */
function zaehlend(api: SheetsApi) {
  const anzahl: Record<string, number> = {};
  const gezaehlt = new Proxy(api, {
    get(ziel, name: string) {
      const wert = Reflect.get(ziel, name);
      if (typeof wert !== 'function') return wert;
      return (...args: unknown[]) => {
        anzahl[name] = (anzahl[name] ?? 0) + 1;
        return (wert as (...a: unknown[]) => unknown).apply(ziel, args);
      };
    },
  });
  return { api: gezaehlt, anzahl };
}

async function store() {
  const sheets = new MemorySheets();
  await runSetup(sheets);
  const { api, anzahl } = zaehlend(sheets);
  return { store: new SheetStore(api), anzahl };
}

describe('Anfragen an Google', () => {
  it('sets up and checks the sheet with a handful of requests, not one per tab', async () => {
    const sheets = new MemorySheets();
    const { api, anzahl } = zaehlend(sheets);
    await runSetup(api);
    const gesamtSetup = Object.values(anzahl).reduce((a, b) => a + b, 0);
    // 13 tabs: asking each one on its own used to be well over 25 requests.
    expect(gesamtSetup).toBeLessThanOrEqual(12);

    for (const name of Object.keys(anzahl)) anzahl[name] = 0;
    const status = await checkSetup(api);
    expect(status.ready).toBe(true);
    expect(Object.values(anzahl).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3);
  });

  it('loads both games of the start page in one read', async () => {
    const { store: s, anzahl } = await store();
    const spiele = await s.loadSpiele();
    expect(spiele.wordle).toEqual([]);
    expect(spiele.monstera).toEqual([]);
    expect(anzahl.getSpreadsheet).toBe(1);
    expect(anzahl.batchGetValues).toBe(1);
    expect(anzahl.getValues ?? 0).toBe(0);
  });

  it('asks for the list of tabs only once for several views', async () => {
    const { store: s, anzahl } = await store();
    await s.loadSpiele();
    await s.loadAudits();
    await s.loadContactDaten();
    expect(anzahl.getSpreadsheet).toBe(1);
  });

  it('looks again after the setup created new tabs', async () => {
    const sheets = new MemorySheets();
    const { api, anzahl } = zaehlend(sheets);
    const s = new SheetStore(api);
    await expect(s.loadSpiele()).resolves.toEqual({ wordle: null, monstera: null });
    await runSetup(sheets);
    s.vergissStruktur();
    const spiele = await s.loadSpiele();
    expect(spiele.wordle).toEqual([]);
    expect(anzahl.getSpreadsheet).toBe(2);
  });
});
