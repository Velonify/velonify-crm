import type { Sprache } from './katalog';
import type { Auswahl } from './types';

/**
 * Builds the calculation sheet of an offer as Sheets API batchUpdate requests: tab "Angebot" with header data,
 * one row per main category (subtotal by formula) and per sub-item (price entered by hand), totals below;
 * tab "Texte" with the text blocks and payment plan for the PDF.
 * Column G ("Typ") marks every row, so the PDF step can read the sheet even after rows were moved or inserted.
 */

export const KALKULATION_BLATT = { angebot: 'Angebot', texte: 'Texte' } as const;
export const KALKULATION_SPALTEN = ['Position', 'Beschreibung', 'Preis netto €', 'Optional', 'Abrechnung', 'Notiz intern', 'Typ'] as const;
export const UST_OPTIONEN = ['19 %', 'Reverse Charge', 'Keine'] as const;
export const JA_NEIN = ['nein', 'ja'] as const;
export const ABRECHNUNG_OPTIONEN = ['einmalig', 'monatlich'] as const;

export interface KalkulationsDaten {
  nummer: string;
  version: number;
  /** YYYY-MM-DD */
  datum: string;
  gueltigBis: string;
  firma: string;
  ansprechpartner: string;
  titel: string;
  sprache: Sprache;
  auswahl: Auswahl;
}

type Farbe = { red: number; green: number; blue: number };
const kanal = (h: string, von: number) => Math.round((parseInt(h.slice(von, von + 2), 16) / 255) * 1000) / 1000;
const hex = (h: string): Farbe => ({ red: kanal(h, 1), green: kanal(h, 3), blue: kanal(h, 5) });

const FARBE = {
  eingabe: hex('#FFF2CC'),
  kategorie: hex('#F3E9ED'),
  kopf: hex('#2C0E18'),
  weiss: hex('#FFFFFF'),
  grau: hex('#7A6B71'),
  summe: hex('#C5D8E6'),
};
const EURO = { type: 'CURRENCY', pattern: '#,##0.00 €' };

interface Zelle {
  userEnteredValue?: { stringValue?: string; numberValue?: number; formulaValue?: string };
  userEnteredFormat?: Record<string, unknown>;
}

// Content from the app (titles, notes) is always written as text, never as a formula.
const text = (value: string, format?: Record<string, unknown>): Zelle => ({ userEnteredValue: { stringValue: value }, ...(format && { userEnteredFormat: format }) });
const zahl = (value: number, format?: Record<string, unknown>): Zelle => ({ userEnteredValue: { numberValue: value }, ...(format && { userEnteredFormat: format }) });
const formel = (value: string, format?: Record<string, unknown>): Zelle => ({ userEnteredValue: { formulaValue: value }, ...(format && { userEnteredFormat: format }) });
const leer = (format?: Record<string, unknown>): Zelle => (format ? { userEnteredFormat: format } : {});

const fett = (extra: Record<string, unknown> = {}) => ({ ...extra, textFormat: { bold: true, ...((extra.textFormat as object) ?? {}) } });
const hinweis = { textFormat: { italic: true, foregroundColor: FARBE.grau } };
const typFormat = { textFormat: { foregroundColor: FARBE.grau, fontSize: 8 } };
const umbruch = { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' };

function dropdown(sheetId: number, zeile0: number, spalte0: number, werte: readonly string[], zeilen = 1) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: zeile0, endRowIndex: zeile0 + zeilen, startColumnIndex: spalte0, endColumnIndex: spalte0 + 1 },
      rule: { condition: { type: 'ONE_OF_LIST', values: werte.map((w) => ({ userEnteredValue: w })) }, showCustomUi: true, strict: true },
    },
  };
}

function breiten(sheetId: number, pixel: readonly number[]) {
  return pixel.map((px, i) => ({
    updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
  }));
}

const TEXTE: Record<Sprache, { schluessel: string; abschnitt: string; text: string; hinweis: string }[]> = {
  de: [
    { schluessel: 'anschreiben', abschnitt: 'Anschreiben', text: '', hinweis: 'Persönliche Einleitung an den Ansprechpartner' },
    { schluessel: 'ausgangslage', abschnitt: 'Ausgangslage', text: '', hinweis: 'Status quo und Ziel des Projekts' },
    { schluessel: 'drittkosten', abschnitt: 'Drittkosten', text: 'Drittkosten wie Lizenzen und App-Abonnements sind nicht enthalten und werden vom Kunden direkt getragen.', hinweis: '' },
    { schluessel: 'zeitplan', abschnitt: 'Zeitplan', text: '', hinweis: 'Eine Phase pro Zeile: Phase – Inhalt – Ergebnis' },
    { schluessel: 'naechste_schritte', abschnitt: 'Nächste Schritte', text: 'Angebot annehmen, Startdatum festlegen, Zugänge bereitstellen, Kick-off ansetzen.', hinweis: '' },
    { schluessel: 'mitwirkung', abschnitt: 'Mitwirkungspflichten', text: '', hinweis: 'Was der Kunde beitragen muss' },
    { schluessel: 'zahlungsbedingungen', abschnitt: 'Zahlungsbedingungen', text: 'Rechnungsstellung bei Erreichen des jeweiligen Meilensteins, Zahlungsziel 14 Tage netto.', hinweis: '' },
    { schluessel: 'hinweise', abschnitt: 'Hinweise', text: 'Alle Preise sind Nettopreise in Euro zzgl. gesetzlicher Umsatzsteuer.', hinweis: '' },
  ],
  en: [
    { schluessel: 'anschreiben', abschnitt: 'Cover letter', text: '', hinweis: 'Persönliche Einleitung an den Ansprechpartner' },
    { schluessel: 'ausgangslage', abschnitt: 'Background', text: '', hinweis: 'Status quo und Ziel des Projekts' },
    { schluessel: 'drittkosten', abschnitt: 'Third-party costs', text: 'Third-party costs such as licences and app subscriptions are not included and are paid directly by the client.', hinweis: '' },
    { schluessel: 'zeitplan', abschnitt: 'Timeline', text: '', hinweis: 'Eine Phase pro Zeile: Phase – Inhalt – Ergebnis' },
    { schluessel: 'naechste_schritte', abschnitt: 'Next steps', text: 'Accept the offer, agree a start date, provide access, schedule the kick-off.', hinweis: '' },
    { schluessel: 'mitwirkung', abschnitt: 'Client responsibilities', text: '', hinweis: 'Was der Kunde beitragen muss' },
    { schluessel: 'zahlungsbedingungen', abschnitt: 'Payment terms', text: 'Invoiced when each milestone is reached, payable within 14 days net.', hinweis: '' },
    { schluessel: 'hinweise', abschnitt: 'Notes', text: 'All prices are net prices in euros plus statutory VAT.', hinweis: '' },
  ],
};

const ZAHLUNGSPLAN: Record<Sprache, { einmalig: [number, string][]; monatlich: [number, string][] }> = {
  de: {
    einmalig: [
      [30, 'Bei Auftragserteilung'],
      [40, 'Nach Freigabe auf Staging'],
      [30, 'Nach Go-live und Abnahme'],
    ],
    monatlich: [[100, 'Monatlich im Voraus']],
  },
  en: {
    einmalig: [
      [30, 'On order confirmation'],
      [40, 'After sign-off on staging'],
      [30, 'After go-live and acceptance'],
    ],
    monatlich: [[100, 'Monthly in advance']],
  },
};

/** File name part after date and Kürzel, e.g. "kalkulation-shopify-migration". */
export const kalkulationsThema = (titel: string) => `kalkulation ${titel}`;

export function baueKalkulation(daten: KalkulationsDaten): unknown[] {
  const ANGEBOT = 0; // A new spreadsheet's first tab always has sheetId 0.
  const TEXTE_ID = 1;
  const zeilen: Zelle[][] = [];
  const validierungen: unknown[] = [];
  const zeile = (zellen: Zelle[]) => zeilen.push(zellen) - 1; // returns the 0-based row index

  zeile([text(`Kalkulation · ${daten.titel}`, fett({ textFormat: { fontSize: 14, bold: true } }))]);
  zeile([text('Preise je Unterpunkt in Spalte C eintragen (gelb, 0 = kostenfrei). Zwischensummen und Summen rechnen automatisch. Alle Beträge netto in €.', hinweis)]);
  zeile([]);

  const kopf = (label: string, typ: string, wert: Zelle) => zeile([text(label, fett()), wert, leer(), leer(), leer(), leer(), text(`kopf:${typ}`, typFormat)]);
  const eingabe = { backgroundColor: FARBE.eingabe };
  kopf('Angebot-Nr.', 'nummer', text(daten.nummer, eingabe));
  kopf('Version', 'version', zahl(daten.version, eingabe));
  kopf('Datum', 'datum', text(daten.datum, eingabe));
  kopf('Gültig bis', 'gueltig_bis', text(daten.gueltigBis, eingabe));
  kopf('Firma', 'firma', text(daten.firma, eingabe));
  kopf('Ansprechpartner', 'ansprechpartner', text(daten.ansprechpartner, eingabe));
  kopf('Titel', 'titel', text(daten.titel, eingabe));
  kopf('Sprache', 'sprache', text(daten.sprache === 'en' ? 'English' : 'Deutsch'));
  const ustZeile = kopf('Umsatzsteuer', 'umsatzsteuer', text(UST_OPTIONEN[0], eingabe));
  validierungen.push(dropdown(ANGEBOT, ustZeile, 1, UST_OPTIONEN));
  const nachlassZeile = kopf('Nachlass netto €', 'nachlass', leer({ ...eingabe, numberFormat: EURO }));
  zeile([]);

  const kopfFormat = fett({ backgroundColor: FARBE.kopf, textFormat: { bold: true, foregroundColor: FARBE.weiss } });
  zeile(KALKULATION_SPALTEN.map((s) => text(s, kopfFormat)));

  const erste = zeilen.length;
  daten.auswahl.kategorien.forEach((kategorie, i) => {
    const katZeile = zeilen.length;
    const vonZeile = katZeile + 2; // 1-based number of the first sub-item row
    const bisZeile = katZeile + 1 + kategorie.posten.length;
    const katFormat = fett({ backgroundColor: FARBE.kategorie });
    zeile([
      text(`${i + 1} · ${kategorie.titel}`, katFormat),
      text(kategorie.umfang, { ...katFormat, ...umbruch }),
      formel(`=SUM(C${vonZeile}:C${bisZeile})`, { ...katFormat, numberFormat: EURO }),
      text(kategorie.optional ? 'ja' : 'nein', katFormat),
      text(kategorie.abrechnung === 'monatlich' ? 'monatlich' : 'einmalig', katFormat),
      leer(katFormat),
      text('kategorie', { ...typFormat, backgroundColor: FARBE.kategorie }),
    ]);
    validierungen.push(dropdown(ANGEBOT, katZeile, 3, JA_NEIN), dropdown(ANGEBOT, katZeile, 4, ABRECHNUNG_OPTIONEN));
    for (const posten of kategorie.posten) {
      zeile([
        text(posten.titel, { padding: { left: 16 }, ...umbruch }),
        text(posten.text, umbruch),
        leer({ backgroundColor: FARBE.eingabe, numberFormat: EURO }),
        leer(),
        leer(),
        text(posten.notiz, umbruch),
        text('posten', typFormat),
      ]);
    }
  });
  const letzte = zeilen.length; // 1-based number of the last position row
  zeile([]);

  const r = (spalte: string) => `${spalte}${erste + 1}:${spalte}${letzte}`;
  const summe = (label: string, typ: string, wert: string, betont = false) =>
    zeile([text(label, fett()), leer(), formel(wert, fett({ numberFormat: EURO, ...(betont && { backgroundColor: FARBE.summe }) })), leer(), leer(), leer(), text(`summe:${typ}`, typFormat)]) + 1;

  const einmalig = summe('Einmalig netto', 'einmalig', `=SUMIFS(${r('C')},${r('G')},"kategorie",${r('D')},"nein",${r('E')},"einmalig")`);
  const nachlass = summe('Nachlass', 'nachlass', `=-N(B${nachlassZeile + 1})`);
  const netto = summe('Einmalig netto nach Nachlass', 'einmalig_netto', `=C${einmalig}+C${nachlass}`, true);
  const ust = summe('Umsatzsteuer', 'umsatzsteuer', `=IF(B${ustZeile + 1}="19 %",ROUND(C${netto}*0.19,2),0)`);
  summe('Einmalig brutto', 'einmalig_brutto', `=C${netto}+C${ust}`);
  zeile([]);
  summe('Monatlich netto', 'monatlich', `=SUMIFS(${r('C')},${r('G')},"kategorie",${r('D')},"nein",${r('E')},"monatlich")`, true);
  summe('Optional netto', 'optional', `=SUMIFS(${r('C')},${r('G')},"kategorie",${r('D')},"ja")`);

  // ─── Tab "Texte" ───
  const texte: Zelle[][] = [];
  texte.push([text(`Texte fürs Angebot · ${daten.titel}`, fett({ textFormat: { fontSize: 14, bold: true } }))]);
  texte.push([text('Leere Abschnitte erscheinen nicht im PDF. Spalte D nicht ändern.', hinweis)]);
  texte.push([]);
  texte.push(['Abschnitt', 'Text', 'Hinweis', 'Typ'].map((s) => text(s, kopfFormat)));
  for (const t of TEXTE[daten.sprache]) {
    texte.push([text(t.abschnitt, fett()), text(t.text, { ...umbruch, backgroundColor: FARBE.eingabe }), text(t.hinweis, { ...hinweis, ...umbruch }), text(`text:${t.schluessel}`, typFormat)]);
  }
  texte.push([]);
  texte.push(['Rate %', 'Meilenstein', '', 'Typ'].map((s) => text(s, kopfFormat)));
  const nurMonatlich = daten.auswahl.kategorien.length > 0 && daten.auswahl.kategorien.every((k) => k.abrechnung === 'monatlich');
  const raten = ZAHLUNGSPLAN[daten.sprache][nurMonatlich ? 'monatlich' : 'einmalig'];
  const ersteRate = texte.length + 1;
  for (const [prozent, meilenstein] of raten) {
    texte.push([zahl(prozent, eingabe), text(meilenstein, eingabe), leer(), text('rate', typFormat)]);
  }
  texte.push([formel(`=SUM(A${ersteRate}:A${texte.length})`, fett()), text('Summe (muss 100 ergeben)', hinweis), leer(), text('raten_summe', typFormat)]);

  const zellen = (sheetId: number, rows: Zelle[][]) => ({
    updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: rows.map((values) => ({ values })), fields: 'userEnteredValue,userEnteredFormat' },
  });

  return [
    { updateSheetProperties: { properties: { sheetId: ANGEBOT, title: KALKULATION_BLATT.angebot }, fields: 'title' } },
    {
      addSheet: {
        properties: { sheetId: TEXTE_ID, title: KALKULATION_BLATT.texte, gridProperties: { rowCount: Math.max(100, texte.length + 20), columnCount: 6 } },
      },
    },
    // Enough rows and columns for everything written below.
    {
      updateSheetProperties: {
        properties: { sheetId: ANGEBOT, gridProperties: { rowCount: Math.max(200, zeilen.length + 50), columnCount: 10 } },
        fields: 'gridProperties(rowCount,columnCount)',
      },
    },
    zellen(ANGEBOT, zeilen),
    zellen(TEXTE_ID, texte),
    ...validierungen,
    ...breiten(ANGEBOT, [300, 420, 130, 80, 100, 240, 80]),
    ...breiten(TEXTE_ID, [200, 560, 260, 110]),
  ];
}
