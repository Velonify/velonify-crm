import { describe, expect, it } from 'vitest';
import { leereAuswahl, schalteKategorie, fuegeManuellHinzu, aendereKategorie } from './angebote';
import { createDemoBackend } from './demo/seed';
import { NotConfiguredError, ValidationError } from './errors';
import { SPREADSHEET_MIME } from './google/drive';
import { baueKalkulation, KALKULATION_BLATT } from './kalkulation';
import { katalogBaum } from './katalog';
import type { Auswahl } from './types';

type Zelle = { userEnteredValue?: { stringValue?: string; numberValue?: number; formulaValue?: string } };
type Request = Record<string, any>;

/** Reads the cell grid of one tab back out of the generated requests: rows of display strings (formulas as written). */
function raster(requests: unknown[], sheetId: number): string[][] {
  const update = (requests as Request[]).find((r) => r.updateCells?.start.sheetId === sheetId)!.updateCells;
  return update.rows.map((row: { values?: Zelle[] }) =>
    (row.values ?? []).map((z) => {
      const v = z.userEnteredValue;
      return v?.formulaValue ?? v?.stringValue ?? (v?.numberValue !== undefined ? String(v.numberValue) : '');
    }),
  );
}

const auswahl: Auswahl = {
  kategorien: [
    { schluessel: 'a', kategorie_id: 'a', titel: 'Datenmigration', umfang: 'Produkte, Kunden', abrechnung: 'einmalig', optional: false, posten: [
      { schluessel: 'p1', leistung_id: 'p1', titel: 'Produkte', text: 'Produkte und Medien', notiz: '~12.000 Produkte' },
      { schluessel: 'p2', leistung_id: 'p2', titel: 'Kunden', text: 'Kunden und Bestellungen', notiz: '' },
    ] },
    { schluessel: 'b', kategorie_id: 'b', titel: 'Google Ads', umfang: '', abrechnung: 'monatlich', optional: false, posten: [
      { schluessel: 'p3', leistung_id: 'p3', titel: 'Kampagnen', text: '', notiz: '' },
    ] },
    { schluessel: 'c', kategorie_id: '', titel: 'Events', umfang: '', abrechnung: 'einmalig', optional: true, posten: [
      { schluessel: 'p4', leistung_id: '', titel: '=HYPERLINK("x")', text: '', notiz: '' },
    ] },
  ],
};

describe('baueKalkulation', () => {
  const requests = baueKalkulation({ nummer: '2026/49', version: 1, datum: '2026-09-17', gueltigBis: '2026-10-17', firma: 'Nordlicht GmbH', ansprechpartner: 'Mara Holm', titel: 'Shopify-Migration', sprache: 'de', auswahl });
  const angebot = raster(requests, 0);
  const zeileVon = (typ: string, ab = 0) => angebot.findIndex((z, i) => i >= ab && z[6] === typ) + 1; // 1-based

  it('names the tabs and writes the header data', () => {
    expect((requests as Request[])[0].updateSheetProperties.properties.title).toBe(KALKULATION_BLATT.angebot);
    expect((requests as Request[])[1].addSheet.properties.title).toBe(KALKULATION_BLATT.texte);
    expect(angebot[zeileVon('kopf:nummer') - 1][1]).toBe('2026/49');
    expect(angebot[zeileVon('kopf:ansprechpartner') - 1][1]).toBe('Mara Holm');
  });

  it('sums each category over its own sub-item rows', () => {
    const k1 = zeileVon('kategorie');
    expect(angebot[k1 - 1].slice(0, 5)).toEqual(['1 · Datenmigration', 'Produkte, Kunden', `=SUM(C${k1 + 1}:C${k1 + 2})`, 'nein', 'einmalig']);
    expect(angebot[k1][5]).toBe('~12.000 Produkte');
    const k2 = zeileVon('kategorie', k1);
    expect(angebot[k2 - 1][2]).toBe(`=SUM(C${k2 + 1}:C${k2 + 1})`);
    const k3 = zeileVon('kategorie', k2);
    expect(angebot[k3 - 1][3]).toBe('ja');
  });

  it('computes totals over the position range and never writes app text as a formula', () => {
    const erste = zeileVon('kategorie');
    const letzte = angebot.map((z) => z[6]).lastIndexOf('posten') + 1;
    const bereich = (s: string) => `${s}${erste}:${s}${letzte}`;
    expect(angebot[zeileVon('summe:einmalig') - 1][2]).toBe(`=SUMIFS(${bereich('C')},${bereich('G')},"kategorie",${bereich('D')},"nein",${bereich('E')},"einmalig")`);
    expect(angebot[zeileVon('summe:monatlich') - 1][2]).toContain('"monatlich"');
    expect(angebot[zeileVon('summe:umsatzsteuer') - 1][2]).toBe(`=IF(B${zeileVon('kopf:umsatzsteuer')}="19 %",ROUND(C${zeileVon('summe:einmalig_netto')}*0.19,2),0)`);

    const manuell = (requests as Request[]).find((r) => r.updateCells?.start.sheetId === 0)!.updateCells.rows.flatMap((r: { values?: Zelle[] }) => r.values ?? []);
    const hyperlink = manuell.find((z: Zelle) => z.userEnteredValue?.stringValue === '=HYPERLINK("x")');
    expect(hyperlink?.userEnteredValue?.formulaValue).toBeUndefined();
    expect(hyperlink).toBeDefined();
  });

  it('prepares texts and a payment plan that adds up to 100', () => {
    const texte = raster(requests, 1);
    expect(texte.some((z) => z[3] === 'text:zahlungsbedingungen' && z[1].includes('14 Tage'))).toBe(true);
    const raten = texte.filter((z) => z[3] === 'rate').map((z) => Number(z[0]));
    expect(raten.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('Kalkulations-Sheet anlegen', () => {
  it('creates the sheet in the firm folder, or in 02_Proposals without one, exactly once', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const baum = katalogBaum(await service.loadAngebotsDaten());
    let wahl = schalteKategorie(leereAuswahl(), baum, baum[1], 'de');
    wahl = fuegeManuellHinzu(wahl, baum, 'Messe', { art: 'neu', titel: 'Events', abrechnung: 'einmalig' }, 'de');
    wahl = aendereKategorie(wahl, wahl.kategorien[1].schluessel, { optional: true });

    const mitOrdner = db.firmen.find((f) => f.kuerzel === 'NLO')!;
    const ohneOrdner = db.firmen.find((f) => !f.drive_ordner_id)!;
    const basis = { sprache: 'de', deal_id: '', kontakt_id: '', titel: 'Shopify-Migration', auswahl: wahl };
    const a1 = await service.saveAngebot({ ...basis, nummer: '2026/49', firma_id: mitOrdner.id });
    const a2 = await service.saveAngebot({ ...basis, nummer: '2026/50', firma_id: ohneOrdner.id });

    const e1 = await service.legeKalkulationAn(a1.id, a1.geaendert_am);
    expect(e1.ort).toBe('firma');
    expect(e1.datei).toMatchObject({ mimeType: SPREADSHEET_MIME, name: expect.stringMatching(/^\d{4}-\d{2}-\d{2}_NLO_kalkulation-shopify-migration_v01$/) });
    expect(e1.angebot).toMatchObject({ sheet_id: e1.datei.id, status: 'kalkulation' });
    // Nordlicht's folder came from the client template, so the sheet goes into its 00_Account.
    expect((await service.ordnerInhalt(mitOrdner)).find((f) => f.name === '00_Account')?.id).toBe(e1.datei.parents?.[0]);

    const e2 = await service.legeKalkulationAn(a2.id, a2.geaendert_am);
    expect(e2.ort).toBe('proposals');

    await expect(service.legeKalkulationAn(a1.id, e1.angebot.geaendert_am)).rejects.toMatchObject({ field: 'sheet_id' });
    await expect(service.legeKalkulationAn(a2.id, a2.geaendert_am)).rejects.toBeInstanceOf(ValidationError);
    const verlauf = (await service.load()).aktivitaeten.filter((a) => a.firma_id === mitOrdner.id).map((a) => a.text);
    expect(verlauf.some((t) => t.startsWith('Kalkulations-Sheet für Angebot 2026/49 angelegt'))).toBe(true);
  });

  it('explains what is missing when neither a firm folder nor 02_Proposals is set up', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    await service.saveEinstellungen({ drive_proposals_ordner_id: '' });
    const db = await service.load();
    const baum = katalogBaum(await service.loadAngebotsDaten());
    const firma = db.firmen.find((f) => !f.drive_ordner_id)!;
    const a = await service.saveAngebot({ nummer: '2026/51', sprache: 'de', firma_id: firma.id, deal_id: '', kontakt_id: '', titel: 'Audit', auswahl: schalteKategorie(leereAuswahl(), baum, baum[0], 'de') });
    await expect(service.legeKalkulationAn(a.id, a.geaendert_am)).rejects.toBeInstanceOf(NotConfiguredError);
  });
});
