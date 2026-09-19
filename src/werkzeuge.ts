export interface Werkzeug {
  id: string;
  name: string;
  beschreibung: string;
  /** Start path; all pages of the tool live below it. Missing while the tool is only planned. */
  pfad?: string;
  /** Further path prefixes that belong to the tool, for tools whose start path is "/". */
  bereiche?: string[];
  /** Sidebar entries shown while this tool is open. */
  navigation: { label: string; pfad: string; end?: boolean }[];
}

/** The tools of the company page, in the order of the tool switcher. */
export const WERKZEUGE: Werkzeug[] = [
  {
    id: 'home',
    name: 'Home',
    beschreibung: 'Überblick, Kunden und Links',
    pfad: '/',
    bereiche: ['/kalender'],
    navigation: [
      { label: 'Übersicht', pfad: '/', end: true },
      { label: 'Kalender', pfad: '/kalender' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    beschreibung: 'Leads, Pipeline und Kundenakte',
    pfad: '/crm',
    navigation: [
      { label: 'Mein Tag', pfad: '/crm', end: true },
      { label: 'Pipeline', pfad: '/crm/pipeline' },
      { label: 'Firmen', pfad: '/crm/firmen' },
      { label: 'Import', pfad: '/crm/import' },
    ],
  },
  {
    id: 'angebote',
    name: 'Angebots-Rechner',
    beschreibung: 'Leistungen auswählen, im Sheet kalkulieren, Angebot als PDF',
    pfad: '/angebote',
    navigation: [
      { label: 'Angebote', pfad: '/angebote', end: true },
      { label: 'Neues Angebot', pfad: '/angebote/neu' },
      { label: 'Leistungen', pfad: '/angebote/leistungen' },
    ],
  },
  {
    id: 'contact',
    name: 'Contact Generator',
    beschreibung: 'Erste Nachricht für Instagram, LinkedIn oder E-Mail aus den CRM-Daten',
    pfad: '/contact',
    navigation: [
      { label: 'Neues Anschreiben', pfad: '/contact', end: true },
      { label: 'Gesendet', pfad: '/contact/gesendet' },
      { label: 'Leistungen', pfad: '/contact/leistungen' },
    ],
  },
  {
    id: 'audit',
    name: 'Shop-Audit',
    beschreibung: 'Shops prüfen und Aufhänger fürs Anschreiben finden',
    pfad: '/audit',
    navigation: [
      { label: 'Übersicht', pfad: '/audit', end: true },
      { label: 'Domain prüfen', pfad: '/audit/neu' },
    ],
  },
  {
    id: 'leads',
    name: 'Lead-Finder',
    beschreibung: 'Deutsche Shops mit Anlass finden, prüfen und gezielt ins CRM übernehmen',
    pfad: '/leads',
    navigation: [
      { label: 'Backlog', pfad: '/leads', end: true },
      { label: 'Manuell prüfen', pfad: '/leads/manuell' },
      { label: 'Suche', pfad: '/leads/suche' },
    ],
  },
];

export const istGeplant = (w: Werkzeug) => !w.pfad;

/**
 * The tool a path belongs to: the one with the longest matching start path. Pages outside every tool
 * (like /einrichtung) return null, so the sidebar can stay on the tool that was open before.
 */
export function werkzeugFuerPfad(pathname: string): Werkzeug | null {
  const passt = (pfad: string) => pfad !== '/' && (pathname === pfad || pathname.startsWith(`${pfad}/`));
  const treffer = WERKZEUGE.flatMap((w) => [w.pfad, ...(w.bereiche ?? [])].filter((p): p is string => Boolean(p) && passt(p!)).map((pfad) => ({ w, pfad })));
  if (treffer.length > 0) return treffer.sort((a, b) => b.pfad.length - a.pfad.length)[0].w;
  return pathname === '/' ? WERKZEUGE[0] : null;
}
