import { beforeEach, describe, expect, it } from 'vitest';
import {
  aendereKategorie,
  anzahlPosten,
  entfernePosten,
  fuegeManuellHinzu,
  kategorieStatus,
  leereAuswahl,
  naechsteNummer,
  parseAuswahl,
  schalteKategorie,
  schalteLeistung,
  uebersetze,
} from './angebote';
import { CrmService } from './crm';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import { katalogBaum, type KategorieMitLeistungen } from './katalog';
import type { AngebotsDaten, Database } from './types';

describe('Angebotsnummer', () => {
  it('continues the JJJJ/NN sequence per year', () => {
    expect(naechsteNummer([], 2026)).toBe('2026/01');
    expect(naechsteNummer([{ nummer: '2026/48' }, { nummer: '2026/07' }, { nummer: '2025/90' }, { nummer: 'kaputt' }], 2026)).toBe('2026/49');
  });
});

describe('Auswahl', () => {
  let baum: KategorieMitLeistungen[];
  let daten: AngebotsDaten;

  beforeEach(async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    daten = await service.loadAngebotsDaten();
    baum = katalogBaum(daten);
  });

  it('selects a whole main category and deselects it again, keeping manual items', () => {
    const [analyse] = baum;
    let auswahl = schalteKategorie(leereAuswahl(), baum, analyse, 'de');
    expect(kategorieStatus(auswahl, analyse)).toBe('alle');
    expect(anzahlPosten(auswahl)).toBe(analyse.leistungen.length);

    auswahl = schalteLeistung(auswahl, baum, analyse.leistungen[1], 'de');
    expect(kategorieStatus(auswahl, analyse)).toBe('teilweise');
    auswahl = schalteKategorie(auswahl, baum, analyse, 'de');
    expect(kategorieStatus(auswahl, analyse)).toBe('alle');
    // Catalogue order is kept even though the item was re-added last.
    expect(auswahl.kategorien[0].posten.map((p) => p.leistung_id)).toEqual(analyse.leistungen.map((l) => l.id));

    auswahl = fuegeManuellHinzu(auswahl, baum, 'Sonderworkshop', { art: 'katalog', kategorie: analyse.kategorie }, 'de');
    auswahl = schalteKategorie(auswahl, baum, analyse, 'de');
    expect(auswahl.kategorien[0].posten.map((p) => p.titel)).toEqual(['Sonderworkshop']);
    expect(kategorieStatus(auswahl, analyse)).toBe('teilweise');
  });

  it('adds manual items to new own categories at the end and removes empty categories', () => {
    let auswahl = schalteLeistung(leereAuswahl(), baum, baum[3].leistungen[0], 'de');
    auswahl = fuegeManuellHinzu(auswahl, baum, 'Messe-Setup', { art: 'neu', titel: 'Events', abrechnung: 'einmalig' }, 'de');
    auswahl = schalteLeistung(auswahl, baum, baum[0].leistungen[0], 'de');
    expect(auswahl.kategorien.map((k) => k.titel)).toEqual([baum[0].kategorie.titel_de, baum[3].kategorie.titel_de, 'Events']);

    const eigene = auswahl.kategorien[2];
    auswahl = fuegeManuellHinzu(auswahl, baum, 'Standbau', { art: 'auswahl', schluessel: eigene.schluessel }, 'de');
    expect(auswahl.kategorien[2].posten.map((p) => p.titel)).toEqual(['Messe-Setup', 'Standbau']);

    auswahl = aendereKategorie(auswahl, eigene.schluessel, { optional: true });
    expect(auswahl.kategorien[2].optional).toBe(true);
    for (const p of auswahl.kategorien[2].posten) auswahl = entfernePosten(auswahl, eigene.schluessel, p.schluessel);
    expect(auswahl.kategorien).toHaveLength(2);

    expect(() => fuegeManuellHinzu(auswahl, baum, '  ', { art: 'katalog', kategorie: baum[0].kategorie }, 'de')).toThrow(ValidationError);
    expect(() => fuegeManuellHinzu(auswahl, baum, 'X', { art: 'neu', titel: '', abrechnung: 'einmalig' }, 'de')).toThrow(ValidationError);
  });

  it('copies texts in the chosen language and translates catalogue items, not manual ones', () => {
    let auswahl = schalteKategorie(leereAuswahl(), baum, baum[0], 'de');
    auswahl = fuegeManuellHinzu(auswahl, baum, 'Eigener Punkt', { art: 'katalog', kategorie: baum[0].kategorie }, 'de');
    const en = uebersetze(auswahl, baum, 'en');
    expect(en.kategorien[0].titel).toBe(baum[0].kategorie.titel_en);
    expect(en.kategorien[0].posten[0].text).toBe(baum[0].leistungen[0].text_en);
    expect(en.kategorien[0].posten.at(-1)!.titel).toBe('Eigener Punkt');
    expect(parseAuswahl(JSON.stringify(en))).toEqual(en);
    expect(parseAuswahl('{kaputt')).toEqual(leereAuswahl());
  });
});

describe('Angebot speichern', () => {
  let crm: CrmService;
  let db: Database;

  beforeEach(async () => {
    const demo = await createDemoBackend(() => 'test@velonify.de');
    crm = demo.service;
    db = await crm.load();
  });

  it('validates, stores the selection and logs it in the firm history', async () => {
    const baum = katalogBaum(await crm.loadAngebotsDaten());
    const firma = db.firmen.find((f) => f.kuerzel === 'NLO')!;
    const deal = db.deals.find((d) => d.firma_id === firma.id)!;
    const andereFirma = db.firmen.find((f) => f.id !== firma.id)!;
    const auswahl = schalteKategorie(leereAuswahl(), baum, baum[1], 'de');
    const input = { nummer: '2026/49', sprache: 'de', firma_id: firma.id, deal_id: deal.id, kontakt_id: '', titel: 'Shopify-Migration', auswahl };

    await expect(crm.saveAngebot({ ...input, auswahl: leereAuswahl() })).rejects.toMatchObject({ field: 'auswahl' });
    await expect(crm.saveAngebot({ ...input, nummer: '49' })).rejects.toMatchObject({ field: 'nummer' });
    await expect(crm.saveAngebot({ ...input, firma_id: andereFirma.id })).rejects.toMatchObject({ field: 'deal_id' });

    const angebot = await crm.saveAngebot(input);
    expect(angebot).toMatchObject({ nummer: '2026/49', version: 1, status: 'entwurf' });
    await expect(crm.saveAngebot(input)).rejects.toMatchObject({ field: 'nummer' });

    const daten = await crm.loadAngebotsDaten();
    expect(parseAuswahl(daten.angebote[0].auswahl)).toEqual(auswahl);
    const verlauf = (await crm.load()).aktivitaeten.filter((a) => a.firma_id === firma.id);
    expect(verlauf.some((a) => a.text.startsWith('Angebot 2026/49 angelegt'))).toBe(true);

    const geaendert = await crm.saveAngebot({ ...input, titel: 'Shopify-Plus-Migration' }, { id: angebot.id, expectedGeaendertAm: angebot.geaendert_am });
    expect(geaendert.titel).toBe('Shopify-Plus-Migration');
  });
});
