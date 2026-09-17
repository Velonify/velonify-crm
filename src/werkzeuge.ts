export interface Werkzeug {
  id: string;
  name: string;
  beschreibung: string;
  /** Start path; all pages of the tool live below it. Missing while the tool is only planned. */
  pfad?: string;
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
    navigation: [{ label: 'Übersicht', pfad: '/', end: true }],
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
];

export const istGeplant = (w: Werkzeug) => !w.pfad;

/**
 * The tool a path belongs to: the one with the longest matching start path. Pages outside every tool
 * (like /einrichtung) return null, so the sidebar can stay on the tool that was open before.
 */
export function werkzeugFuerPfad(pathname: string): Werkzeug | null {
  const treffer = WERKZEUGE.filter((w) => w.pfad && w.pfad !== '/' && (pathname === w.pfad || pathname.startsWith(`${w.pfad}/`)));
  if (treffer.length > 0) return treffer.sort((a, b) => b.pfad!.length - a.pfad!.length)[0];
  return pathname === '/' ? WERKZEUGE[0] : null;
}
