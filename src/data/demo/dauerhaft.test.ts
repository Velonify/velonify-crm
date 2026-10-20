import { describe, expect, it } from 'vitest';
import { istGueltig, STAND_VERSION, type DemoStand } from './dauerhaft';
import { DemoLeadFinder } from './leadFinderDemo';
import { createDemoBackend, stelleDemoHer } from './seed';

describe('Demo im Browser speichern', () => {
  it('stellt Tabellen, Drive und Kalender so wieder her, wie sie gespeichert wurden', async () => {
    const { service, sheets, drive, calendar } = await createDemoBackend(() => 'test@velonify.de');
    const firma = (await service.load()).firmen[0];
    await service.updateFirma(firma.id, { notiz: 'Nach dem Neuladen noch da' }, firma.geaendert_am);
    // IndexedDB keeps a structured clone, so nothing of the old objects may leak into the new demo.
    const daten = structuredClone({ sheets: sheets.zustand(), drive: drive.zustand(), kalender: calendar.events });

    const wieder = stelleDemoHer(() => 'test@velonify.de', daten);
    const vorher = await service.load();
    const nachher = await wieder.service.load();
    expect(nachher.firmen).toEqual(vorher.firmen);
    expect(nachher.deals).toEqual(vorher.deals);
    expect(nachher.firmen.find((f) => f.id === firma.id)?.notiz).toBe('Nach dem Neuladen noch da');
    expect(await wieder.drive.listChildren(vorher.firmen.find((f) => f.drive_ordner_id)!.drive_ordner_id)).toEqual(
      await drive.listChildren(vorher.firmen.find((f) => f.drive_ordner_id)!.drive_ordner_id),
    );
    expect(wieder.calendar.events).toEqual(calendar.events);
  });

  it('meldet jede Änderung, damit sie gespeichert wird', async () => {
    const { service, sheets } = await createDemoBackend(() => 'test@velonify.de');
    let aenderungen = 0;
    sheets.beiAenderung = () => aenderungen++;
    await service.saveWiedervorlage({ firma_id: '', deal_id: '', titel: 'Testen', faellig_am: '2026-10-21', zustaendig: 'Lugge' });
    expect(aenderungen).toBeGreaterThan(0);
  });

  it('merkt sich geprüfte und entschiedene Shops des Lead-Finders', async () => {
    const lf = new DemoLeadFinder(0);
    const [naechster] = await lf.naechste(1, 'migration');
    await lf.pruefe(naechster);
    await lf.entscheide([{ domain: naechster.domain, entscheidung: 'abgelehnt' }]);
    const wieder = new DemoLeadFinder(0);
    wieder.stelleHer(structuredClone(lf.zustand()));
    expect(await wieder.statistik()).toEqual(await lf.statistik());
  });

  it('verwirft alte oder fremde Stände', () => {
    const jetzt = Date.parse('2026-10-20T12:00:00Z');
    const stand = { version: STAND_VERSION, gespeichert_am: '2026-10-19T12:00:00Z', sheets: { title: '', nextSheetId: 1, tabs: [] } } as unknown as DemoStand;
    expect(istGueltig(stand, jetzt)).toBe(true);
    expect(istGueltig({ ...stand, version: STAND_VERSION + 1 }, jetzt)).toBe(false);
    expect(istGueltig({ ...stand, gespeichert_am: '2026-09-01T12:00:00Z' }, jetzt)).toBe(false);
    expect(istGueltig(null, jetzt)).toBe(false);
  });
});
