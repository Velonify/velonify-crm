export interface Werkzeug {
  id: string;
  name: string;
  /** Label in the tool rail, at most ~8 characters. */
  kurz: string;
  beschreibung: string;
  /** Start path; all pages of the tool live below it. Missing while the tool is only planned. */
  pfad?: string;
  /** Further path prefixes that belong to the tool, for tools whose start path is "/". */
  bereiche?: string[];
  /** Pages of the tool, shown as tabs above the page. `versteckt` pages keep their name but get no tab (reached via buttons). */
  navigation: { label: string; pfad: string; end?: boolean; versteckt?: boolean }[];
}

/** The tools of the company page, in the order of the tool switcher. */
export const WERKZEUGE: Werkzeug[] = [
  {
    id: 'home',
    name: 'Home',
    kurz: 'Home',
    beschreibung: 'Überblick, Kunden und Links',
    pfad: '/',
    bereiche: ['/eingang', '/kalender', '/anfragen', '/wort'],
    navigation: [
      { label: 'Übersicht', pfad: '/', end: true },
      { label: 'Eingang', pfad: '/eingang' },
      { label: 'Kalender', pfad: '/kalender' },
      { label: 'Anfragen', pfad: '/anfragen', versteckt: true },
      { label: 'Wort des Tages', pfad: '/wort' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    kurz: 'CRM',
    beschreibung: 'Leads, Pipeline und Kundenakte',
    pfad: '/crm',
    navigation: [
      { label: 'Mein Tag', pfad: '/crm', end: true },
      { label: 'Pipeline', pfad: '/crm/pipeline' },
      { label: 'Firmen', pfad: '/crm/firmen' },
      { label: 'Anfragen', pfad: '/crm/anfragen' },
      { label: 'Aus LinkedIn', pfad: '/crm/linkedin', versteckt: true },
      { label: 'Import', pfad: '/crm/import', versteckt: true },
    ],
  },
  {
    id: 'kunden',
    name: 'Kunden',
    kurz: 'Kunden',
    beschreibung: 'Client-Hub: Dateien, Tools, Ressourcen und News je Kunde',
    pfad: '/kunden',
    navigation: [{ label: 'Alle Kunden', pfad: '/kunden', end: true }],
  },
  {
    id: 'todo',
    name: 'To-Dos',
    kurz: 'To-Dos',
    beschreibung: 'Alle offenen Karten auf einen Blick, Boards für Velonify und jeden Kunden',
    pfad: '/todo',
    navigation: [
      { label: 'Übersicht', pfad: '/todo', end: true },
      { label: 'Meine Aufgaben', pfad: '/todo/meine' },
    ],
  },
  {
    id: 'angebote',
    name: 'Angebots-Rechner',
    kurz: 'Angebote',
    beschreibung: 'Leistungen auswählen, im Sheet kalkulieren, Angebot als PDF',
    pfad: '/angebote',
    navigation: [
      { label: 'Angebote', pfad: '/angebote', end: true },
      { label: 'Neues Angebot', pfad: '/angebote/neu', versteckt: true },
      { label: 'Leistungen', pfad: '/angebote/leistungen' },
    ],
  },
  {
    id: 'contact',
    name: 'Contact Generator',
    kurz: 'Kontakt',
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
    kurz: 'Audit',
    beschreibung: 'Shops prüfen und Aufhänger fürs Anschreiben finden',
    pfad: '/audit',
    navigation: [
      { label: 'Übersicht', pfad: '/audit', end: true },
      { label: 'Domain prüfen', pfad: '/audit/neu', versteckt: true },
    ],
  },
  {
    id: 'social',
    name: 'Social Media',
    kurz: 'Social',
    beschreibung: 'Der 90-Tage-Plan: Redaktionsplan, fertige Posts, Aufgaben und was die Zahlen sagen',
    pfad: '/social',
    navigation: [
      { label: 'Übersicht', pfad: '/social', end: true },
      { label: 'Redaktionsplan', pfad: '/social/plan' },
      { label: 'Inhalte', pfad: '/social/inhalte' },
      { label: 'Aufgaben', pfad: '/social/aufgaben' },
      { label: 'Messung', pfad: '/social/messung' },
      { label: 'Strategie', pfad: '/social/strategie' },
    ],
  },
  {
    id: 'leads',
    name: 'Lead-Finder',
    kurz: 'Leads',
    beschreibung: 'Deutsche Shops mit Anlass finden, prüfen und gezielt ins CRM übernehmen',
    pfad: '/leads',
    navigation: [
      { label: 'Backlog', pfad: '/leads', end: true },
      { label: 'Manuell prüfen', pfad: '/leads/manuell' },
      { label: 'Suche', pfad: '/leads/suche' },
    ],
  },
  {
    id: 'magnete',
    name: 'Lead-Magnete',
    kurz: 'Magnete',
    beschreibung: 'Downloads gegen E-Mail: Einträge von velonify.de/ressourcen, Mails und Übernahme ins CRM',
    pfad: '/magnete',
    navigation: [
      { label: 'Leads', pfad: '/magnete', end: true },
      { label: 'Magnete', pfad: '/magnete/liste' },
    ],
  },
];

/** What a sidebar entry counts: open items in the inbox, CRM items due today, my cards due today. */
export type LeistenZahl = 'eingang' | 'heute' | 'todo';

export interface LeistenEintrag {
  /** Tool the entry opens; switching the tool off in the view settings hides the entry. */
  werkzeug: string;
  label: string;
  pfad: string;
  icon: string;
  zahl?: LeistenZahl;
}

/**
 * The sidebar: one line per tool with its name, grouped like the work. The inbox gets its own line because it is
 * where the day starts, even though it lives in Home.
 */
export const LEISTE: { titel?: string; eintraege: LeistenEintrag[] }[] = [
  {
    eintraege: [
      { werkzeug: 'home', label: 'Home', pfad: '/', icon: 'home' },
      { werkzeug: 'home', label: 'Eingang', pfad: '/eingang', icon: 'eingang', zahl: 'eingang' },
      { werkzeug: 'todo', label: 'To-Dos', pfad: '/todo', icon: 'todo', zahl: 'todo' },
    ],
  },
  {
    titel: 'Vertrieb',
    eintraege: [
      { werkzeug: 'crm', label: 'CRM', pfad: '/crm', icon: 'crm', zahl: 'heute' },
      { werkzeug: 'angebote', label: 'Angebote', pfad: '/angebote', icon: 'angebote' },
      { werkzeug: 'contact', label: 'Contact Generator', pfad: '/contact', icon: 'contact' },
      { werkzeug: 'audit', label: 'Shop-Audit', pfad: '/audit', icon: 'audit' },
      { werkzeug: 'leads', label: 'Lead-Finder', pfad: '/leads', icon: 'leads' },
      { werkzeug: 'magnete', label: 'Lead-Magnete', pfad: '/magnete', icon: 'magnete' },
    ],
  },
  {
    titel: 'Kunden & Marketing',
    eintraege: [
      { werkzeug: 'kunden', label: 'Kunden', pfad: '/kunden', icon: 'kunden' },
      { werkzeug: 'social', label: 'Social Media', pfad: '/social', icon: 'social' },
    ],
  },
];

/** The entry for a path: the inbox has its own line, everything else goes by tool. */
export function leistenEintragFuerPfad(pathname: string): LeistenEintrag | null {
  const alle = LEISTE.flatMap((g) => g.eintraege);
  if (pathname === '/eingang' || pathname.startsWith('/eingang/')) return alle.find((e) => e.pfad === '/eingang') ?? null;
  const w = werkzeugFuerPfad(pathname);
  return w ? (alle.find((e) => e.werkzeug === w.id) ?? null) : null;
}

export const istGeplant = (w: Werkzeug) => !w.pfad;

/** Browser tab title of a tool, e.g. "Velonify CRM". Home is the platform itself, so it stays "Velonify". */
export const seitentitel = (w: Werkzeug) => (w.id === 'home' ? 'Velonify' : `Velonify ${w.name}`);

/** Readable name of a page for "Gerade online", e.g. "CRM · Pipeline". */
export function bereichFuerPfad(pathname: string): string {
  const w = werkzeugFuerPfad(pathname);
  if (!w) return pathname.startsWith('/einrichtung') ? 'Einrichtung' : 'Hub';
  const seite = w.navigation
    .filter((n) => (n.end ? pathname === n.pfad : pathname === n.pfad || pathname.startsWith(`${n.pfad}/`)))
    .sort((a, b) => b.pfad.length - a.pfad.length)[0];
  return seite && seite.label !== w.name ? `${w.name} · ${seite.label}` : w.name;
}

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
