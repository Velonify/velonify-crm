// Readable labels for Lead-Markt previews: region from the first postcode digit, reach from the CrUX rank bucket.

export const REGIONEN: Record<string, string> = {
  '0': 'Sachsen, Thüringen',
  '1': 'Berlin, Brandenburg, MV',
  '2': 'Hamburg, Bremen, SH, Nds.-Nord',
  '3': 'Niedersachsen, Nordhessen',
  '4': 'NRW Nord, Ruhrgebiet',
  '5': 'NRW Süd, Rheinland',
  '6': 'Hessen, RLP, Saarland',
  '7': 'Baden-Württemberg',
  '8': 'Bayern Süd',
  '9': 'Bayern Nord',
};

export const regionLabel = (plz: string) => (plz ? (REGIONEN[plz] ?? `PLZ ${plz}…`) : 'Region unbekannt');

/** CrUX buckets 1k, 5k, 10k, 50k, 100k, 500k, 1M …: "Top 10.000" in Germany. */
export const reichweiteLabel = (rang: number | null) => (rang ? `Top ${rang.toLocaleString('de-DE')} in DE` : 'kleine Reichweite');

export const ladezeitLabel = (ms: number | null) => (ms ? `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s` : '–');

/** Helpdesks the filter offers, in the order tenants ask for them. */
export const HELPDESK_AUSWAHL = ['Zendesk', 'Gorgias', 'Freshdesk', 'Richpanel', 'Tidio', 'Intercom', 'Userlike', 'LiveChat', 'Trengo', 'eDesk'];
