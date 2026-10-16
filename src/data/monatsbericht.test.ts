import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { berichtInhalt, berichtsMonat, inBerichtsFenster, liesBericht, monatName, monatsZeitraum, naechsterMonat } from './monatsbericht';
import { findeBerechtigung, kundensicht, vorschauBerechtigung } from './portalApi';
import { ereignisseSeit, hinweisNachricht } from './portalBenachrichtigung';
import type { Aufgabe, Meilenstein } from './types';

describe('Monatsbericht: Zeiträume', () => {
  it('takes the calendar month against the month before, across years', () => {
    expect(monatsZeitraum('2026-10')).toEqual({ von: '2026-10-01', bis: '2026-10-31', vorher_von: '2026-09-01', vorher_bis: '2026-09-30' });
    expect(monatsZeitraum('2027-03')).toMatchObject({ bis: '2027-03-31', vorher_bis: '2027-02-28' });
    expect(monatsZeitraum('2026-01')).toMatchObject({ vorher_von: '2025-12-01' });
    expect(naechsterMonat('2026-12')).toBe('2027-01');
    expect(monatName('2026-10')).toBe('Oktober 2026');
  });

  it('is due for the last month, drafted only in the first week of the next one (Berlin time)', () => {
    // 1 November 00:30 in Berlin is still 31 October in UTC.
    expect(berichtsMonat(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(inBerichtsFenster('2026-10', new Date('2026-11-01T05:00:00Z'))).toBe(true);
    expect(inBerichtsFenster('2026-10', new Date('2026-11-07T05:00:00Z'))).toBe(true);
    expect(inBerichtsFenster('2026-10', new Date('2026-11-08T05:00:00Z'))).toBe(false);
    expect(inBerichtsFenster('2026-10', new Date('2026-10-20T05:00:00Z'))).toBe(false);
  });
});

describe('Monatsbericht: Inhalt', () => {
  it('lists released cards done in the month, milestones reached and what comes next', async () => {
    const { service } = await createDemoBackend(() => 'lukas@velonify.de');
    const todos = await service.loadTodoDaten();
    const portal = await service.loadPortalDaten();
    const firmaId = portal.zugaenge[0].firma_id;
    const board = todos.boards.find((b) => b.firma_id === firmaId)!;
    const karte = (titel: string, spalte_id: string, erledigt_am: string, sichtbar_kunde = true) => ({ ...todos.aufgaben[0], id: titel, board_id: board.id, titel, spalte_id, erledigt_am, sichtbar_kunde, faellig_am: '', archiviert: false, freigabe: '' }) as Aufgabe;
    const etappe = (titel: string, status: Meilenstein['status'], datum: string, geaendert_am = '') => ({ ...portal.meilensteine[0], id: titel, firma_id: firmaId, titel, status, datum, geaendert_am, sortierung: 0, archiviert: false }) as Meilenstein;

    const inhalt = berichtInhalt({
      firmaId,
      monat: '2026-10',
      todos: {
        boards: todos.boards,
        aufgaben: [
          karte('Im Oktober fertig', 'erledigt', '2026-10-12T09:00:00Z'),
          karte('Im September fertig', 'erledigt', '2026-09-30T09:00:00Z'),
          karte('Intern fertig', 'erledigt', '2026-10-13T09:00:00Z', false),
          karte('Läuft gerade', 'arbeit', ''),
          karte('Liegt im Backlog', 'backlog', ''),
        ],
      },
      portal: { meilensteine: [etappe('Migration', 'erledigt', '2026-10-05'), etappe('Ohne Datum', 'erledigt', '', '2026-10-20T10:00:00Z'), etappe('Alt', 'erledigt', '2026-08-01'), etappe('Go-live', 'aktiv', '2026-11-20')] },
    });
    expect(inhalt.erledigt).toEqual([{ titel: 'Im Oktober fertig', datum: '2026-10-12' }]);
    expect(inhalt.meilensteine.map((m) => m.titel)).toEqual(['Migration', 'Ohne Datum']);
    expect(inhalt.naechstes).toEqual([
      { titel: 'Go-live', art: 'meilenstein', datum: '2026-11-20' },
      { titel: 'Läuft gerade', art: 'karte', datum: '' },
    ]);
  });
});

describe('Monatsbericht: Freigabe, Portal und Benachrichtigung', () => {
  it('shows a draft only in the team access, a released report to the client, and notifies once', async () => {
    const { service } = await createDemoBackend(() => 'lukas@velonify.de');
    const db = await service.load();
    const berechtigung = findeBerechtigung(db, await service.loadPortalDaten(), 'sophie@alpenglanz.example')!;
    const laden = async () => {
      const portal = await service.loadPortalDaten();
      return { db, portal, kunden: await service.loadKundenDaten(), todos: await service.loadTodoDaten(), dateien: [], teamDomain: 'velonify.de' };
    };

    const entwurf = (await service.loadPortalDaten()).berichte[0];
    expect(entwurf.status).toBe('entwurf');
    expect(kundensicht({ ...(await laden()), berechtigung }).berichte).toEqual([]);
    const team = kundensicht({ ...(await laden()), berechtigung: vorschauBerechtigung(db, berechtigung.firma.id, 'lukas@velonify.de')!, vorschau: 'lukas@velonify.de' });
    expect(team.berichte).toHaveLength(1);
    expect(team.berichte[0]).toMatchObject({ status: 'entwurf', titel: monatName(entwurf.monat) });

    await service.saveBerichtKommentar(entwurf.id, '  Starker Monat, Fokus jetzt auf Black Week.  ');
    const frei = await service.freigebenBericht(entwurf.id, true);
    expect(frei).toMatchObject({ status: 'freigegeben', kommentar: 'Starker Monat, Fokus jetzt auf Black Week.', freigegeben_von: 'lukas@velonify.de' });

    const sicht = kundensicht({ ...(await laden()), berechtigung });
    expect(sicht.berichte[0]).toMatchObject({ status: 'freigegeben', von: 'Lukas', kommentar: 'Starker Monat, Fokus jetzt auf Black Week.' });
    expect(sicht.berichte[0].daten.zahlen.ga4?.umsatz).toBe(48210);
    expect(liesBericht(frei)?.erledigt.length).toBeGreaterThan(0);

    const { portal, kunden, todos } = await laden();
    const fenster = { berechtigung, kunden, todos, portal, dateien: [], teamDomain: 'velonify.de' };
    const ereignisse = ereignisseSeit({ ...fenster, seit: new Date(Date.parse(frei.freigegeben_am) - 60_000).toISOString(), bis: new Date(Date.parse(frei.freigegeben_am) + 60_000).toISOString() });
    expect(ereignisse.filter((e) => e.art === 'bericht')).toHaveLength(1);
    const nachricht = hinweisNachricht({ ereignisse: ereignisse.filter((e) => e.art === 'bericht'), vorname: 'Sophie', firmaName: 'Alpenglanz', portalUrl: 'https://kunden.velonify.de' });
    expect(nachricht.betreff).toBe(`Dein Monatsbericht ${monatName(entwurf.monat)} ist da`);
    expect(ereignisseSeit({ ...fenster, seit: frei.freigegeben_am, bis: new Date(Date.parse(frei.freigegeben_am) + 60_000).toISOString() }).some((e) => e.art === 'bericht')).toBe(false);

    await service.freigebenBericht(entwurf.id, false);
    expect(kundensicht({ ...(await laden()), berechtigung }).berichte).toEqual([]);
  });
});
