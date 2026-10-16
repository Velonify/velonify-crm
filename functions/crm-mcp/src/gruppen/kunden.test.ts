import { beforeEach, describe, expect, it } from 'vitest';
import type { CrmService } from '../../../../src/data/crm';
import { verbinde, type Verbunden } from '../testhilfe';

let service: CrmService;
let rufe: Verbunden['rufe'];
let client: Verbunden['client'];

const akte = async (args: Record<string, unknown> = {}) => (await rufe('kunde_anzeigen', { kunde: 'AGK', ...args })).daten;
const karteVon = async (titel: string) => (await service.loadTodoDaten()).aufgaben.find((a) => a.titel === titel)!;

describe('Kunden-Werkzeuge', () => {
  beforeEach(async () => {
    ({ service, rufe, client } = await verbinde());
  });

  it('bietet die Werkzeuge an, lesende als readOnly markiert', async () => {
    const { tools } = await client.listTools();
    const namen = tools.map((t) => t.name);
    expect(namen).toEqual(
      expect.arrayContaining([
        'kunden', 'kunde_anzeigen', 'kunde_dateien', 'kunden_link_speichern', 'kunden_news_aendern', 'meilenstein_speichern', 'kunden_eintrag_archivieren',
        'kunden_eintrag_verschieben', 'portal_zugang', 'portal_werkzeug', 'karte_anzeigen', 'karte_bearbeiten', 'karte_archivieren', 'board_bearbeiten',
      ]),
    );
    for (const name of ['kunden', 'kunde_anzeigen', 'kunde_dateien', 'karte_anzeigen']) expect(tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'portal_zugang')?.annotations?.readOnlyHint).toBe(false);
    expect(tools.find((t) => t.name === 'portal_zugang')?.description).toContain('vorher nachfragen');
  });

  it('listet die Kunden wie die Kundenliste', async () => {
    const { daten } = await rufe('kunden');
    expect(daten.anzahl).toBe(1);
    expect(daten.kunden[0]).toMatchObject({ name: 'Alpenglanz Kosmetik AG', kuerzel: 'AGK', zustaendig: 'Johannes', links: 6, offene_karten: 5, slack: '#client-agk-general' });
    expect(daten.kunden[0].neueste_meldung).toContain('Go-live der neuen Produktseiten');
    expect(daten.kunden[0].hub).toBe(`https://crm.velonify.de/#/kunden/${daten.kunden[0].firma_id}`);
  });

  it('zeigt die Kundenseite mit Ticker, Links, Fahrplan und Portal', async () => {
    const daten = await akte();
    expect(daten.kunde).toMatchObject({ name: 'Alpenglanz Kosmetik AG', status: 'kunde' });
    expect(daten.kontakte[0]).toMatchObject({ name: 'Sophie Lindner', portal: 'Zugang, noch nicht angemeldet' });
    expect(daten.kontakte.find((c: { name: string }) => c.name === 'Petra Huber').portal).toContain('keine E-Mail');

    // Pinned first, the company-wide note, the finished card and the new file in the client share.
    expect(daten.ticker[0]).toMatchObject({ titel: 'Go-live der neuen Produktseiten', angeheftet: true });
    expect(daten.ticker.find((e: { alle_kunden?: boolean }) => e.alle_kunden).titel).toContain('Black-Week-Freeze');
    expect(daten.ticker.find((e: { art: string }) => e.art === 'erledigt')).toMatchObject({ titel: 'Neue Produktseiten live' });
    expect(daten.ticker.find((e: { art: string }) => e.art === 'datei').titel).toBe('Neue Datei: Reporting September.pdf');

    expect(daten.tools.map((l: { titel: string }) => l.titel)).toEqual(['Shopify-Admin', 'Staging-Shop', 'GA4', 'Klaviyo']);
    expect(daten.ressourcen[0]).toMatchObject({ titel: 'Brand-Guidelines', angeheftet: true, sichtbar_kunde: true });
    expect(daten.fahrplan.jetzt_dran).toBe('Design & Inhalte');
    expect(daten.fahrplan.meilensteine).toHaveLength(5);
    expect(daten.portal_werkzeuge).toEqual([
      { werkzeug: 'utm', titel: 'UTM-Generator', aktiv: true },
      { werkzeug: 'social-planer', titel: 'Social-Media-Planer', aktiv: false, noch_nicht_fertig: true },
    ]);
    expect(daten.kunde_sieht).toMatchObject({ zugaenge: 1, freigaben_offen: 1, links: 2, meilensteine: 5, werkzeuge: 1 });
    expect(daten.todos.offen).toBe(5);
    expect(daten.hub_werkzeuge.map((w: { titel: string }) => w.titel)).toEqual(['CRM-Akte', 'Neues Angebot', 'Shop-Audit']);

    expect((await rufe('kunde_anzeigen', { kunde: '#client-agk-general' })).daten.kunde.kuerzel).toBe('AGK');
    expect((await rufe('kunde_anzeigen', { kunde: 'intern' })).text).toContain('kein Kunde');
  });

  it('zeigt den Kundenordner und Unterordner', async () => {
    const wurzel = (await rufe('kunde_dateien', { kunde: 'AGK' })).daten;
    expect(wurzel.ordner.map((o: { name: string }) => o.name)).toContain('07_Client-Share');
    const share = (await rufe('kunde_dateien', { kunde: 'AGK', ordner: '07_client-share' })).daten;
    expect(share.hinweis).toContain('sieht der Kunde');
    expect(share.inhalt).toEqual([expect.objectContaining({ name: 'Reporting September.pdf', art: 'datei' })]);
    const creative = wurzel.ordner.find((o: { name: string }) => o.name === '03_Creative');
    expect((await rufe('kunde_dateien', { kunde: 'AGK', ordner: creative.ordner_id })).daten.inhalt.map((d: { name: string }) => d.name)).toContain('04_Final');
    expect((await rufe('kunde_dateien', { kunde: 'AGK', ordner: '03_Creative/04_Final' })).daten.inhalt).toEqual([]);
    expect((await rufe('kunde_dateien', { kunde: 'AGK', ordner: 'Gibtsnicht' })).text).toContain('Möglich');
    expect((await rufe('kunde_dateien', { kunde: 'Bergwerk' })).text).toContain('keinen Kundenordner');
  });

  it('legt Links an, ändert sie teilweise und archiviert sie', async () => {
    const neu = await rufe('kunden_link_speichern', { kunde: 'AGK', art: 'tool', titel: 'Search Console', url: 'search.google.com/search-console' });
    expect(neu.daten.link).toMatchObject({ titel: 'Search Console', url: 'https://search.google.com/search-console', art: 'Tool' });
    expect(neu.daten.link.sichtbar_kunde).toBeUndefined();
    const id = neu.daten.link.link_id;

    const geaendert = await rufe('kunden_link_speichern', { link_id: id, angeheftet: true });
    expect(geaendert.daten.link).toMatchObject({ titel: 'Search Console', url: 'https://search.google.com/search-console', angeheftet: true });

    expect((await rufe('kunden_link_speichern', { kunde: 'AGK', titel: 'Ohne Art', url: 'https://x.example' })).text).toContain('art');
    expect((await rufe('kunden_link_speichern', { kunde: 'AGK', art: 'tool', titel: 'Kaputt', url: 'ftp://x' })).fehler).toBe(true);

    expect((await rufe('kunden_eintrag_archivieren', { id })).daten).toMatchObject({ art: 'link', archiviert: true });
    expect((await akte()).tools.map((l: { titel: string }) => l.titel)).not.toContain('Search Console');
    expect((await akte({ archivierte_zeigen: true })).tools.find((l: { titel: string }) => l.titel === 'Search Console').archiviert_am).toBeTruthy();
    expect((await rufe('kunden_eintrag_archivieren', { id, archiviert: false })).daten.archiviert).toBe(false);
  });

  it('sortiert Links innerhalb ihrer Art und Meilensteine um', async () => {
    const { tools, ressourcen, fahrplan } = await akte();
    const ga4 = tools.find((l: { titel: string }) => l.titel === 'GA4').link_id;
    const hoch = await rufe('kunden_eintrag_verschieben', { id: ga4, richtung: 'hoch' });
    expect(hoch.daten.reihenfolge).toEqual(['Shopify-Admin', 'GA4', 'Staging-Shop', 'Klaviyo']);

    // The first resource follows the last tool in the stored order; moving it up must stay among resources.
    expect((await rufe('kunden_eintrag_verschieben', { id: ressourcen[0].link_id, richtung: 'hoch' })).text).toContain('ganz oben');
    const runter = await rufe('kunden_eintrag_verschieben', { id: ressourcen[0].link_id, richtung: 'runter' });
    expect(runter.daten.reihenfolge).toEqual(['Relaunch-Briefing', 'Brand-Guidelines']);
    expect((await akte()).tools.map((l: { titel: string }) => l.titel)).toEqual(['Shopify-Admin', 'GA4', 'Staging-Shop', 'Klaviyo']);

    const blackWeek = fahrplan.meilensteine.find((m: { titel: string }) => m.titel === 'Black Week').meilenstein_id;
    expect((await rufe('kunden_eintrag_verschieben', { id: blackWeek, richtung: 'hoch' })).daten.fahrplan).toEqual(['Migration', 'Tracking', 'Black Week', 'Design & Inhalte', 'Go-live Phase 2']);
    expect((await rufe('kunden_eintrag_verschieben', { id: fahrplan.meilensteine[0].meilenstein_id, richtung: 'hoch' })).fehler).toBe(true);
  });

  it('ändert, heftet an und archiviert Kunden-News', async () => {
    const meldung = (await akte()).ticker.find((e: { titel: string }) => e.titel.startsWith('Klaviyo-Flows'));
    const { daten } = await rufe('kunden_news_aendern', { news_id: meldung.news_id, angeheftet: true, text: 'Drei Flows neu.' });
    expect(daten.meldung).toMatchObject({ titel: 'Klaviyo-Flows für Warenkorbabbruch überarbeitet', text: 'Drei Flows neu.', angeheftet: true, sichtbar_kunde: true });

    const alle = await rufe('kunden_news_aendern', { news_id: meldung.news_id, kunde: 'alle' });
    expect(alle.daten.kunde).toBe('alle Kunden');
    expect(alle.daten.meldung.sichtbar_kunde).toBe(false);
    expect((await rufe('kunden_news_aendern', { news_id: meldung.news_id, kunde: 'AGK' })).daten.kunde).toBe('Alpenglanz Kosmetik AG');

    expect((await rufe('kunden_eintrag_archivieren', { id: meldung.news_id })).daten).toMatchObject({ art: 'news', archiviert: true });
    expect((await akte()).ticker.map((e: { titel: string }) => e.titel)).not.toContain(meldung.titel);
    expect((await rufe('kunden_news_aendern', { news_id: 'KN-gibtsnicht' })).fehler).toBe(true);
  });

  it('legt Meilensteine an, ändert und entfernt sie', async () => {
    const neu = await rufe('meilenstein_speichern', { kunde: 'AGK', titel: 'Nachbetreuung', datum: '2027-03-01' });
    expect(neu.daten.meilenstein).toMatchObject({ titel: 'Nachbetreuung', status: 'offen', stand: 'Geplant', datum: '2027-03-01' });
    const id = neu.daten.meilenstein.meilenstein_id;
    expect((await akte()).fahrplan.meilensteine.at(-1).titel).toBe('Nachbetreuung');

    const geaendert = await rufe('meilenstein_speichern', { meilenstein_id: id, status: 'aktiv', datum: '' });
    expect(geaendert.daten.meilenstein).toMatchObject({ titel: 'Nachbetreuung', status: 'aktiv' });
    expect(geaendert.daten.meilenstein.datum).toBeUndefined();

    expect((await rufe('meilenstein_speichern', { titel: 'Ohne Kunde' })).text).toContain('kunde');
    expect((await rufe('kunden_eintrag_archivieren', { id })).daten).toMatchObject({ art: 'meilenstein', archiviert: true });
    expect((await akte()).fahrplan.meilensteine).toHaveLength(5);
  });

  it('schaltet Portal-Zugänge und -Werkzeuge', async () => {
    const tobias = (await akte()).kontakte.find((c: { name: string }) => c.name === 'Tobias Brandl');
    const an = await rufe('portal_zugang', { kontakt_id: tobias.kontakt_id, aktiv: true });
    expect(an.daten).toMatchObject({ portal_zugang: true, kunde: 'Alpenglanz Kosmetik AG' });
    expect(an.daten.hinweis).toContain('Keine Mail verschickt');
    expect((await service.loadPortalDaten()).zugaenge.find((z) => z.kontakt_id === tobias.kontakt_id)?.aktiv).toBe(true);
    expect((await rufe('portal_zugang', { kontakt_id: tobias.kontakt_id, aktiv: false })).daten.portal_zugang).toBe(false);

    const petra = (await akte()).kontakte.find((c: { name: string }) => c.name === 'Petra Huber');
    expect((await rufe('portal_zugang', { kontakt_id: petra.kontakt_id, aktiv: true })).text).toContain('E-Mail');

    expect((await rufe('portal_werkzeug', { kunde: 'AGK', werkzeug: 'utm', aktiv: false })).daten).toMatchObject({ werkzeug: 'UTM-Generator', aktiv: false });
    expect((await rufe('portal_werkzeug', { kunde: 'AGK', werkzeug: 'social-planer', aktiv: true })).text).toContain('noch nicht fertig');
  });

  it('zeigt eine Karte mit Kommentaren', async () => {
    const karte = await karteVon('Slack-App für den To-Do-Agenten anlegen');
    await rufe('karte_kommentieren', { karte_id: karte.id, text: 'Scopes sind eingetragen.' });
    const { daten } = await rufe('karte_anzeigen', { karte_id: karte.id });
    expect(daten.karte).toMatchObject({ titel: karte.titel, board: 'Velonify intern', spalte: 'Backlog', board_id: karte.board_id });
    expect(daten.kommentare).toHaveLength(2);
    expect(daten.kommentare[1]).toMatchObject({ von: 'lugge@velonify.de', text: 'Scopes sind eingetragen.' });
    expect(daten.hub).toBe(`https://crm.velonify.de/#/todo/${karte.board_id}?karte=${karte.id}`);

    const flow = await rufe('karte_anzeigen', { karte_id: (await karteVon('Klaviyo: Browse-Abandonment-Flow')).id });
    expect(flow.daten.karte.checkliste).toEqual(['1. [x] Segment anlegen', '2. [ ] Mails texten', '3. [ ] Testversand']);
  });

  it('bearbeitet eine Karte teilweise, auch die Checkliste', async () => {
    const karte = await karteVon('Klaviyo: Browse-Abandonment-Flow');
    const { daten } = await rufe('karte_bearbeiten', {
      karte_id: karte.id,
      faellig_am: '2026-12-01',
      zustaendig: ['Julian', 'Johannes'],
      punkte_abhaken: ['2', 'testversand'],
      punkte_oeffnen: ['Segment anlegen'],
      punkte_hinzufuegen: ['Live schalten'],
    });
    expect(daten.karte).toMatchObject({ titel: karte.titel, labels: 'E-Mail', faellig: '2026-12-01', zustaendig: 'Julian, Johannes', spalte: 'In Arbeit' });
    expect(daten.karte.checkliste).toEqual(['[ ] Segment anlegen', '[x] Mails texten', '[x] Testversand', '[ ] Live schalten']);
    expect(daten.karte.sichtbar_kunde).toBeUndefined();

    const zweite = await rufe('karte_bearbeiten', { karte_id: karte.id, labels: [], faellig_am: '', punkte_entfernen: ['4'] });
    expect(zweite.daten.karte.labels).toBeUndefined();
    expect(zweite.daten.karte.faellig).toBeUndefined();
    expect(zweite.daten.karte.checkliste).toHaveLength(3);

    expect((await rufe('karte_bearbeiten', { karte_id: karte.id, zustaendig: ['Fremd'] })).text).toContain('nicht im Team');
    expect((await rufe('karte_bearbeiten', { karte_id: karte.id, punkte_abhaken: ['gibts nicht'] })).text).toContain('Vorhanden');
    const intern = await karteVon('Angebot Nordlicht nachfassen');
    expect((await rufe('karte_bearbeiten', { karte_id: intern.id, sichtbar_kunde: true })).text).toContain('nie für Kunden sichtbar');
  });

  it('zieht mit sichtbar_kunde false eine offene Freigabe zurück', async () => {
    const hero = await karteVon('Startseiten-Hero Winterkollektion');
    expect(hero.freigabe).toBe('offen');
    await rufe('karte_bearbeiten', { karte_id: hero.id, sichtbar_kunde: false });
    expect(await karteVon(hero.titel)).toMatchObject({ sichtbar_kunde: false, freigabe: '' });
  });

  it('archiviert Karten und stellt sie wieder her', async () => {
    const karte = await karteVon('Core Web Vitals der Kategorieseiten prüfen');
    expect((await rufe('karte_archivieren', { karte_id: karte.id })).daten).toMatchObject({ archiviert: true, board: 'AGK · Alpenglanz Kosmetik AG' });
    expect((await rufe('karten', { board: 'agk' })).daten.karten.map((k: { titel: string }) => k.titel)).not.toContain(karte.titel);
    expect((await rufe('karte_bearbeiten', { karte_id: karte.id, titel: 'X' })).text).toContain('archiviert');
    expect((await rufe('karte_archivieren', { karte_id: karte.id, archiviert: false })).daten.archiviert).toBe(false);
  });

  it('bearbeitet Board-Spalten, ohne Karten zu verlieren', async () => {
    const { daten } = await rufe('board_bearbeiten', {
      board: 'agk',
      titel: 'AGK · Relaunch',
      spalten: [{ spalte: 'Backlog', titel: 'Ideen' }, { spalte: 'arbeit' }, { titel: 'Review' }, { spalte: 'Wartet auf Kunde' }, { spalte: 'erledigt' }],
    });
    expect(daten).toMatchObject({ board: 'AGK · Relaunch', entfernt: ['Diese Woche'], karten_verschoben: '1 nach „Ideen“' });
    expect(daten.spalten).toEqual([
      { spalte_id: 'backlog', titel: 'Ideen' },
      { spalte_id: 'arbeit', titel: 'In Arbeit' },
      { spalte_id: 'review', titel: 'Review' },
      { spalte_id: 'wartet', titel: 'Wartet auf Kunde' },
      { spalte_id: 'erledigt', titel: 'Erledigt', erledigt: true },
    ]);
    expect((await karteVon('Black-Week-Banner einbauen')).spalte_id).toBe('backlog');

    // Marking "Review" as done takes the mark from "Erledigt" and finishes the cards in it.
    const banner = await karteVon('Black-Week-Banner einbauen');
    await rufe('karte_verschieben', { karte_id: banner.id, spalte: 'Review' });
    const umgestellt = await rufe('board_bearbeiten', {
      board: 'agk',
      spalten: [{ spalte: 'Ideen' }, { spalte: 'In Arbeit' }, { spalte: 'Review', erledigt: true }, { spalte: 'Wartet auf Kunde' }, { spalte: 'Erledigt' }],
    });
    expect(umgestellt.daten.spalten.filter((s: { erledigt?: boolean }) => s.erledigt).map((s: { titel: string }) => s.titel)).toEqual(['Review']);
    expect((await karteVon('Black-Week-Banner einbauen')).erledigt_am).not.toBe('');
    expect((await karteVon('Neue Produktseiten live')).erledigt_am).toBe('');

    expect((await rufe('board_bearbeiten', { board: 'agk', spalten: [{ spalte: 'Gibtsnicht' }] })).text).toContain('Möglich');
    expect((await rufe('board_bearbeiten', { board: 'agk', spalten: [{ spalte: 'Ideen', erledigt: true }, { spalte: 'Review', erledigt: true }] })).fehler).toBe(true);
    expect((await rufe('board_bearbeiten', { board: 'agk', spalten: [{ erledigt: true }] })).text).toContain('titel');
    expect((await rufe('board_bearbeiten', { board: 'intern' })).fehler).toBe(true);
  });
});
