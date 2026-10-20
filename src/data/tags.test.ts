import { describe, expect, it } from 'vitest';
import { parseCsv, planeImport } from './importCsv';
import { EMPTY_FIRMA_INPUT, type Database } from './types';
import { formatTags, istLeadArt, mitTags, parseTags, passtTags, sortiereTags, zahlJeTag } from './tags';

describe('tags', () => {
  it('parses comma-separated tags without empties and repeats', () => {
    expect(parseTags(' SEO-Lead,  Gebiet   Dortmund ,,seo-lead, Zahnarzt ')).toEqual(['SEO-Lead', 'Gebiet Dortmund', 'Zahnarzt']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });

  it('formats and merges tags', () => {
    expect(formatTags(['SEO-Lead', ' Zahnarzt', 'seo-lead'])).toBe('SEO-Lead, Zahnarzt');
    expect(mitTags('SEO-Lead, Zahnarzt', ['Gebiet Essen', 'zahnarzt'])).toBe('SEO-Lead, Zahnarzt, Gebiet Essen');
  });

  it('requires every chosen tag, or hides any of them', () => {
    const roh = 'SEO-Lead, Gebiet Dortmund, Zahnarzt';
    expect(passtTags({ wahl: new Set(), ausblenden: false }, roh)).toBe(true);
    expect(passtTags({ wahl: new Set(['seo-lead', 'Gebiet Dortmund']), ausblenden: false }, roh)).toBe(true);
    expect(passtTags({ wahl: new Set(['SEO-Lead', 'Gebiet Essen']), ausblenden: false }, roh)).toBe(false);
    expect(passtTags({ wahl: new Set(['SEO-Lead']), ausblenden: true }, roh)).toBe(false);
    expect(passtTags({ wahl: new Set(['Shop-Lead']), ausblenden: true }, roh)).toBe(true);
    expect(passtTags({ wahl: new Set(['SEO-Lead']), ausblenden: false }, '')).toBe(false);
  });

  it('counts tags and puts lead kinds first', () => {
    const zahlen = zahlJeTag(['SEO-Lead, Zahnarzt', 'seo-lead, Dach', 'Zahnarzt', '', null]);
    expect(zahlen).toEqual({ 'SEO-Lead': 2, Zahnarzt: 2, Dach: 1 });
    expect(sortiereTags(zahlen)).toEqual(['SEO-Lead', 'Zahnarzt', 'Dach']);
    expect(istLeadArt('Shop-Lead')).toBe(true);
    expect(istLeadArt('Leadgen')).toBe(false);
  });

  it('imports the tags column and fills it only where a firm has none', () => {
    const db = { firmen: [{ ...EMPTY_FIRMA_INPUT, id: 'F-1', domain: 'alt.example', name: 'Alt', tags: 'Shop-Lead', tier: 'A', archiviert: false }], kontakte: [], deals: [] } as unknown as Database;
    const optionen = { tiers: ['A', 'B', 'C'], zustaendig: 'Lugge', dealAnlegen: true, dealTitel: 'SEO + Website', dublettenImportieren: false };
    const plan = planeImport(parseCsv('domain;tier;tags\nneu.example;C;SEO-Lead, Gebiet Dortmund ,seo-lead\nalt.example;A;SEO-Lead\n'), db, optionen as never);
    expect(plan.zeilen[0].firma?.tags).toBe('SEO-Lead, Gebiet Dortmund');
    expect(plan.zeilen[1].aenderungen ?? {}).not.toHaveProperty('tags');
  });
});
