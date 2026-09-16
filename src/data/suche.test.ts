import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { normalisiere, suche } from './suche';

describe('suche', () => {
  it('treats umlaut spellings and accents as the same word', () => {
    expect(normalisiere('München')).toBe(normalisiere('Muenchen'));
    expect(normalisiere('Munchen')).toBe(normalisiere('MÜNCHEN'));
    expect(normalisiere('Kaffeerösterei')).toBe(normalisiere('kaffeeroesterei'));
  });

  it('finds firms, contacts and deals and ranks exact Kürzel and name starts first', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();

    expect(suche(db, 'AGK')[0]).toMatchObject({ art: 'firma', titel: 'Alpenglanz Kosmetik AG' });
    expect(suche(db, 'kaffeeroesterei').map((t) => t.titel)).toContain('Bergwerk Kaffeerösterei');

    const holm = suche(db, 'mara')[0];
    expect(holm).toMatchObject({ art: 'kontakt', titel: 'Mara Holm' });
    expect(holm.firmaId).toBe(db.firmen.find((f) => f.name.startsWith('Nordlicht'))!.id);

    // All words must match, in any field.
    expect(suche(db, 'shopify kleinod').map((t) => t.art)).toEqual(['deal']);
    expect(suche(db, 'hamburg nordlicht')[0]).toMatchObject({ art: 'firma', titel: 'Nordlicht Outdoor GmbH' });
    expect(suche(db, 'gibtesnicht')).toEqual([]);
    expect(suche(db, '   ')).toEqual([]);
  });

  it('lists archived records after active ones', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    let db = await service.load();
    const bergwerk = db.firmen.find((f) => f.name.startsWith('Bergwerk'))!;
    await service.setFirmaArchiviert(bergwerk.id, true, bergwerk.geaendert_am);
    db = await service.load();
    const firmen = suche(db, 'e').filter((t) => t.art === 'firma');
    expect(firmen.at(-1)).toMatchObject({ titel: 'Bergwerk Kaffeerösterei', archiviert: true });
  });
});
