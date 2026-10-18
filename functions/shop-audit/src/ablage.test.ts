import { describe, expect, it } from 'vitest';
import { AuftragSchema, ladeErgebnis, speichereErgebnis } from './ablage.js';
import type { Bq } from './leads/api.js';

function fakeBq(zeilen: unknown[] = []) {
  const abfragen: { sql: string; params?: Record<string, unknown> }[] = [];
  const eingefuegt: { tabelle: string; zeilen: Record<string, unknown>[] }[] = [];
  const bq: Bq = {
    async query<T>(sql: string, params?: Record<string, unknown>) {
      abfragen.push({ sql, params });
      return zeilen as T[];
    },
    async insert(tabelle, z) {
      eingefuegt.push({ tabelle, zeilen: z });
    },
  };
  return { bq, abfragen, eingefuegt };
}

const AUFTRAG = '3f1c2b9e-8a4d-4c6e-9b1a-2d3e4f5a6b7c';

describe('ablage', () => {
  it('stores the result as JSON with order and person', async () => {
    const f = fakeBq();
    await speichereErgebnis(f.bq, AUFTRAG, 'team@velonify.de', { befunde: [] });
    expect(f.eingefuegt[0].tabelle).toBe('audit_ergebnisse');
    expect(f.eingefuegt[0].zeilen[0]).toMatchObject({ auftrag: AUFTRAG, email: 'team@velonify.de', ergebnis: '{"befunde":[]}' });
  });

  it('loads only the own order and returns null while it runs', async () => {
    const leer = fakeBq();
    await expect(ladeErgebnis(leer.bq, 'p.leads', AUFTRAG, 'team@velonify.de')).resolves.toBeNull();
    expect(leer.abfragen[0].sql).toContain('`p.leads.audit_ergebnisse`');
    expect(leer.abfragen[0].params).toEqual({ auftrag: AUFTRAG, email: 'team@velonify.de' });

    const fertig = fakeBq([{ ergebnis: '{"befunde":[]}' }]);
    await expect(ladeErgebnis(fertig.bq, 'p.leads', AUFTRAG, 'team@velonify.de')).resolves.toEqual({ befunde: [] });
  });

  it('accepts only uuid order ids', () => {
    expect(AuftragSchema.test(AUFTRAG)).toBe(true);
    expect(AuftragSchema.test("x' OR 1=1 --")).toBe(false);
  });
});
