import type { BausteinId } from './data/instanz';

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
  navigation: { label: string; pfad: string; end?: boolean; versteckt?: boolean; baustein?: BausteinId }[];
}

/** The tools of the company page, in the order of the tool switcher. */
export const WERKZEUGE: Werkzeug[] = [
  {
    id: 'home',
    name: 'Home',
    kurz: 'Home',
    beschreibung: 'Überblick, Kunden und Links',
    pfad: '/',
    bereiche: ['/eingang', '/kalender', '/anfragen', '/wort', '/freigaben'],
    navigation: [
      { label: 'Übersicht', pfad: '/', end: true },
      { label: 'Eingang', pfad: '/eingang' },
      // Own instances only (building block "Rollen und Freigaben").
      { label: 'Freigaben', pfad: '/freigaben', baustein: 'freigaben' },
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
    id: 'whiteboard',
    name: 'Whiteboard',
    kurz: 'Board',
    beschreibung: 'Gemeinsam skizzieren wie in Miro: Sticky Notes, Vorlagen, Frames, Kommentare, live mit dem Team',
    pfad: '/whiteboard',
    navigation: [{ label: 'Alle Whiteboards', pfad: '/whiteboard', end: true }],
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
  {
    id: 'leadmarkt',
    name: 'Lead-Markt',
    kurz: 'Leads',
    beschreibung: 'Geprüfte Shopify-Shops mit Helpdesk, Technik und Größe: ansehen, gezielt freischalten, ins CRM übernehmen',
    pfad: '/leadmarkt',
    navigation: [{ label: 'Lead-Markt', pfad: '/leadmarkt', end: true }],
  },
  // Creator profile (own instances only, see src/data/instanz.ts): Konzept v2, Bauplan section 11.
  {
    id: 'kalender',
    name: 'Kalender',
    kurz: 'Kalender',
    beschreibung: 'Fristen für Uploads, Drehtage, Kampagnen, Abgaben, Buchhaltung und GK, als Abo in jedem Kalender',
    pfad: '/fristen',
    navigation: [{ label: 'Kalender', pfad: '/fristen', end: true }],
  },
  {
    id: 'content',
    name: 'Content',
    kurz: 'Content',
    beschreibung: 'Content-Plan je Kanal, Recherche, Skripte, Thumbnail-Briefings und Upload-Hygiene',
    pfad: '/content',
    navigation: [
      { label: 'Plan', pfad: '/content', end: true, baustein: 'contentplan' },
      { label: 'Recherche', pfad: '/content/recherche', baustein: 'recherche' },
      { label: 'Skripte', pfad: '/content/skripte', baustein: 'skripte' },
      { label: 'Thumbnails', pfad: '/content/thumbnails', baustein: 'thumbnails' },
      { label: 'Upload', pfad: '/content/upload', baustein: 'upload' },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    kurz: 'Zahlen',
    beschreibung: 'Zahlen aller Kanäle, Merkmale je Video, Wochen- und Monatsbericht, Benchmarking',
    pfad: '/analytics',
    navigation: [
      { label: 'Übersicht', pfad: '/analytics', end: true, baustein: 'kanaele' },
      { label: 'Videos', pfad: '/analytics/videos', baustein: 'kanaele' },
      { label: 'Merkmale', pfad: '/analytics/merkmale', baustein: 'merkmale' },
      { label: 'Berichte', pfad: '/analytics/berichte', baustein: 'berichte' },
      { label: 'Benchmarking', pfad: '/analytics/benchmarking', baustein: 'benchmarking' },
      { label: 'Twitch', pfad: '/analytics/twitch', baustein: 'twitch' },
      { label: 'Kanäle', pfad: '/analytics/kanaele', baustein: 'kanaele' },
    ],
  },
  {
    id: 'kooperationen',
    name: 'Kooperationen',
    kurz: 'Koops',
    beschreibung: 'Partner, Stand, Betrag und Zahlung; Pipeline, Anfragen, Mediakit und Reporting an Partner',
    pfad: '/kooperationen',
    navigation: [
      { label: 'Übersicht', pfad: '/kooperationen', end: true, baustein: 'kooperationen' },
      { label: 'Pipeline', pfad: '/kooperationen/pipeline', baustein: 'pipeline' },
      { label: 'Anfragen', pfad: '/kooperationen/anfragen', baustein: 'anfrageformular' },
      { label: 'Mediakit', pfad: '/kooperationen/mediakit', baustein: 'mediakit' },
      { label: 'Reportings', pfad: '/kooperationen/reportings', baustein: 'partnerreporting' },
    ],
  },
  {
    id: 'einnahmen',
    name: 'Einnahmen',
    kurz: 'Einnahmen',
    beschreibung: 'Kooperationen, AdSense, Twitch und Affiliate in einer Übersicht, in EUR und JPY',
    pfad: '/einnahmen',
    navigation: [{ label: 'Übersicht', pfad: '/einnahmen', end: true }],
  },
  {
    id: 'ablage',
    name: 'Ablage',
    kurz: 'Ablage',
    beschreibung: 'Feste Ordnerstruktur in Google Drive, auch für Rohmaterial, Schnitte und Belege',
    pfad: '/ablage',
    navigation: [{ label: 'Ablage', pfad: '/ablage', end: true }],
  },
  {
    id: 'plattform',
    name: 'Plattform',
    kurz: 'Plattform',
    beschreibung: 'Tester und Kunden des Hubs: Zugänge, Laufzeit, Funktionen, Nutzung, Feedback und der Lead-Markt',
    pfad: '/plattform',
    navigation: [
      { label: 'Mandanten', pfad: '/plattform', end: true },
      { label: 'Lead-Markt', pfad: '/plattform/markt' },
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
      { werkzeug: 'whiteboard', label: 'Whiteboard', pfad: '/whiteboard', icon: 'whiteboard' },
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
      { werkzeug: 'leadmarkt', label: 'Lead-Markt', pfad: '/leadmarkt', icon: 'leads' },
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
  {
    titel: 'Content & Zahlen',
    eintraege: [
      { werkzeug: 'content', label: 'Content', pfad: '/content', icon: 'content' },
      { werkzeug: 'analytics', label: 'Analytics', pfad: '/analytics', icon: 'analytics' },
    ],
  },
  {
    titel: 'Kooperationen',
    eintraege: [
      { werkzeug: 'kooperationen', label: 'Kooperationen', pfad: '/kooperationen', icon: 'kooperationen' },
      { werkzeug: 'einnahmen', label: 'Einnahmen', pfad: '/einnahmen', icon: 'einnahmen' },
    ],
  },
  {
    titel: 'Organisation',
    eintraege: [
      { werkzeug: 'kalender', label: 'Kalender', pfad: '/fristen', icon: 'kalender' },
      { werkzeug: 'ablage', label: 'Ablage', pfad: '/ablage', icon: 'ablage' },
    ],
  },
  {
    titel: 'Velonify Hub',
    eintraege: [{ werkzeug: 'plattform', label: 'Plattform', pfad: '/plattform', icon: 'plattform' }],
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

/** Browser tab title of a tool, e.g. "Velonify CRM", in a tenant's hub "vennie Hub · CRM". Home is the platform itself. */
export const seitentitel = (w: Werkzeug, marke?: string) => (marke ? (w.id === 'home' ? marke : `${marke} · ${w.name}`) : w.id === 'home' ? 'Velonify' : `Velonify ${w.name}`);

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
