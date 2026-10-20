/** The guided tour of the public demo, „Ein Tag in der Agentur“: from the first lead to the client portal. */

export interface TourSchritt {
  titel: string;
  text: string;
  /** What to try on that page. */
  tipp: string;
  /** Page of the step; `kunde` is the id of the demo's main client. */
  pfad: (kunde: string | null) => string;
  /** The step shows the client portal („Als Kunde ansehen“) instead of a hub page. */
  kundenansicht?: boolean;
}

export const TOUR: TourSchritt[] = [
  {
    titel: 'Lead finden',
    text: 'Der Lead-Finder prüft Shops aus einem großen Pool auf Anlässe: altes Shopsystem, langsame Seiten, fehlende Werbung oder E-Mail-Tools. Hier landen nur Shops mit Grund für ein Gespräch.',
    tipp: 'Öffne einen Shop und übernimm ihn in die Pipeline.',
    pfad: () => '/leads',
  },
  {
    titel: 'Shop-Audit',
    text: 'Das Audit prüft einen Shop in vier Bereichen: Plattform, Geschwindigkeit, Tracking und Basics. Aus den Befunden werden Aufhänger fürs Anschreiben.',
    tipp: 'Gib eine Domain ein, z. B. nordlicht-outdoor.example, und starte die Prüfung.',
    pfad: () => '/audit/neu',
  },
  {
    titel: 'Anschreiben',
    text: 'Firma und Leistung wählen, Claude schreibt drei Varianten mit dem Aufhänger aus dem Audit. Verschickt wird direkt als Gmail-Entwurf, der Hub merkt sich, wer wann angeschrieben wurde.',
    tipp: 'Wähl eine Firma und lass Varianten schreiben. In der Demo sind die Texte vorbereitet.',
    pfad: () => '/contact',
  },
  {
    titel: 'Deal',
    text: 'Jeder Deal wandert durch die Phasen, mit Wert, nächstem Schritt und Wiedervorlage. Die Spalten zeigen auf einen Blick, wo Umsatz steckt und was liegen bleibt.',
    tipp: 'Zieh eine Karte in die nächste Phase oder öffne eine Firma.',
    pfad: () => '/crm/pipeline',
  },
  {
    titel: 'Angebot',
    text: 'Angebote entstehen aus dem eigenen Leistungskatalog: Pakete anklicken, Preise stehen, Kalkulation und PDF kommen mit. Nummern und Versionen zählt der Hub mit.',
    tipp: 'Öffne ein Angebot oder leg ein neues an.',
    pfad: () => '/angebote',
  },
  {
    titel: 'Kunde',
    text: 'Gewonnen: Aus dem Deal wird ein Kunde mit Board, Links, News, Fahrplan und Monatsbericht. Was „für den Kunden sichtbar“ ist, erscheint im Portal.',
    tipp: 'Schau in „Portal“: Dort wartet der Monatsbericht auf eure Einschätzung.',
    pfad: (kunde) => (kunde ? `/kunden/${kunde}` : '/kunden'),
  },
  {
    titel: 'Kundenportal',
    text: 'Und so sieht der Kunde dasselbe Projekt: Fahrplan, Freigaben, Berichte und Dateien, ohne Mails hin und her.',
    tipp: 'Gib den Startseiten-Hero frei. Zurück im Hub steht die Karte auf „Freigegeben“.',
    pfad: (kunde) => (kunde ? `/kunden/${kunde}/todos` : '/kunden'),
    kundenansicht: true,
  },
];

export interface TourStand {
  /** -1: the invitation before the first step */
  schritt: number;
  sichtbar: boolean;
}

export const TOUR_START: TourStand = { schritt: -1, sichtbar: true };

/** The saved tour progress, tolerant of anything stored by an older demo. */
export function liesTourStand(roh: string | null): TourStand | null {
  if (!roh) return null;
  try {
    const wert = JSON.parse(roh) as Partial<TourStand>;
    if (typeof wert.schritt !== 'number' || typeof wert.sichtbar !== 'boolean') return null;
    return { schritt: Math.max(-1, Math.min(TOUR.length - 1, Math.trunc(wert.schritt))), sichtbar: wert.sichtbar };
  } catch {
    return null;
  }
}
