import { describe, expect, it } from 'vitest';
import { ungelesene } from '../erwaehnungen';
import { createDemoBackend } from './seed';

describe('Schaufenster der Demo', () => {
  it('erzählt die Beispieldaten als die der erfundenen Agentur und füllt die Pipeline', async () => {
    const { service, sheets } = await createDemoBackend(() => 'lena@kranich-commerce.example', { schaufenster: true });
    const db = await service.load();
    expect(db.listen.team).toEqual(['Lena', 'Tim', 'Aylin', 'Marek', 'Pia']);
    expect(db.firmen.length).toBeGreaterThan(35);
    expect(new Set(db.deals.map((d) => d.phase))).toEqual(new Set(['neu', 'qualifiziert', 'vernetzung', 'kontaktiert', 'gespraech', 'angebot', 'gewonnen', 'verloren']));
    expect(db.firmen.filter((f) => f.status === 'kunde').length).toBeGreaterThanOrEqual(4);
    expect((await service.loadAngebotsDaten()).angebote.length).toBeGreaterThanOrEqual(4);
    expect(ungelesene(await service.loadErwaehnungen(), 'Lena').length).toBeGreaterThanOrEqual(2);
    // Tags of the agency: kind of lead and region, nothing of Velonify's own territories.
    const tags = new Set(db.firmen.flatMap((f) => f.tags.split(',').map((t) => t.trim()).filter(Boolean)));
    expect([...tags].filter((t) => /Gebiet|Zahnarzt|Dach/.test(t))).toEqual([]);
    expect(['Shop-Lead', 'Performance-Lead', 'Region Nord', 'Region Süd'].every((t) => tags.has(t))).toBe(true);
    expect(db.firmen.filter((f) => !/Region /.test(f.tags)).map((f) => `${f.name} (${f.ort})`)).toEqual([]);

    // No trace of Velonify's own team in any cell.
    const tabs = (await sheets.getSpreadsheet()).sheets!.map((s) => s.properties!.title as string);
    const zellen = tabs.flatMap((t) => sheets.rows(t).flat()).filter((c): c is string => typeof c === 'string');
    expect(zellen.filter((c) => /Velonify|velonify\.de|\bLugge\b|\bJohannes\b|\bJulian\b/.test(c))).toEqual([]);
  });
});
