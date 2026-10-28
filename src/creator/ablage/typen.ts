/**
 * Fixed folder structure in Google Drive (Punkte 3, 27) and the password manager setup help (Punkt 6), shared by the hub
 * and crm-api (functions/crm-api/src/creator/organisation.ts). The folders live in Drive; crm-api keeps their ids.
 */

export interface VorlagenOrdner {
  /** Place in the structure; the parent is everything before the last "/", top level hangs below "haupt". */
  schluessel: string;
  name: string;
  beschreibung: string;
}

export const HAUPTORDNER = 'haupt';

/** Template of the structure, parents before children. Belege get one subfolder per year (JAHRES_ORDNER). */
export const ABLAGE_VORLAGE: VorlagenOrdner[] = [
  { schluessel: 'content', name: 'Content', beschreibung: 'Alles rund um Videos und Beiträge' },
  { schluessel: 'content/rohmaterial', name: 'Rohmaterial', beschreibung: 'Aufnahmen vom Dreh, je Video ein Unterordner' },
  { schluessel: 'content/schnitt', name: 'Schnitt', beschreibung: 'Schnittfassungen und fertige Videos, je Video ein Unterordner' },
  { schluessel: 'content/thumbnails', name: 'Thumbnails', beschreibung: 'Vorschaubilder und ihre Vorlagen' },
  { schluessel: 'kooperationen', name: 'Kooperationen', beschreibung: 'Je Kooperation ein Unterordner: Briefing, Vertrag, Material, Reporting' },
  { schluessel: 'buchhaltung', name: 'Buchhaltung', beschreibung: 'Was die Buchhaltung und der Steuerberater brauchen' },
  { schluessel: 'buchhaltung/belege', name: 'Belege', beschreibung: 'Eingangsbelege, je Jahr ein Unterordner' },
  { schluessel: 'buchhaltung/rechnungen', name: 'Rechnungen', beschreibung: 'Rechnungen, wie die Buchhaltung sie stellt' },
  { schluessel: 'vertraege', name: 'Verträge', beschreibung: 'Verträge mit Partnern, Agentur und Dienstleistern' },
  { schluessel: 'branding', name: 'Branding', beschreibung: 'Logos, Schriften, Fotos' },
  { schluessel: 'branding/mediakit', name: 'Mediakit', beschreibung: 'Mediakit und Pressefotos' },
  { schluessel: 'gesellschaft', name: 'Gesellschaft (Formalien)', beschreibung: 'Unterlagen der Gesellschaft: Register, Beschlüsse, Schreiben der Behörden' },
];

/** Gets one subfolder per year, named like the year. */
export const JAHRES_ORDNER = 'buchhaltung/belege';

export const istVorlage = (schluessel: string) => schluessel === HAUPTORDNER || ABLAGE_VORLAGE.some((o) => o.schluessel === schluessel);

export const elternVon = (schluessel: string) => (schluessel.includes('/') ? schluessel.slice(0, schluessel.lastIndexOf('/')) : HAUPTORDNER);

/** Key part of a free name (cooperation, video, year): lower case, letters and digits, dashes. */
export function schluesselTeil(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const istSchluessel = (wert: unknown): wert is string =>
  typeof wert === 'string' && wert.length <= 200 && (wert === HAUPTORDNER || /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(wert));

export const istDriveId = (wert: unknown): wert is string => typeof wert === 'string' && /^[A-Za-z0-9_-]{10,120}$/.test(wert);

export const driveOrdnerUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

export interface AblageOrdner {
  schluessel: string;
  name: string;
  drive_id: string;
  url: string;
  art: 'angelegt' | 'verknuepft';
  erstellt_am: string;
  erstellt_von: string;
  bereit: boolean;
}

// Password manager: recommended, set up with this checklist, never built into the hub (Konzept, Abgrenzung).

export const PASSWORTMANAGER = [
  {
    id: '1password',
    name: '1Password',
    url: 'https://1password.com',
    vorteile: 'Sehr einfach im Alltag, gute Apps für Handy und Browser, Wiederherstellung durch Admins im Team-Konto.',
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    url: 'https://bitwarden.com',
    vorteile: 'Offener Quellcode, günstiger, Organisation mit Sammlungen für getrennte Bereiche.',
  },
] as const;

export type PasswortmanagerWahl = (typeof PASSWORTMANAGER)[number]['id'];
export const istPasswortmanager = (wert: unknown): wert is PasswortmanagerWahl => PASSWORTMANAGER.some((p) => p.id === wert);

export interface EinrichtungsSchritt {
  id: string;
  abschnitt: 'Konto' | 'Tresore' | '2FA' | 'Notfall' | 'Alltag';
  text: string;
  /** Wording for the chosen manager, where its names differ. */
  einpassword?: string;
  bitwarden?: string;
}

export const PASSWORT_SCHRITTE: EinrichtungsSchritt[] = [
  { id: 'konto', abschnitt: 'Konto', text: 'Team-Konto auf die Gesellschaft anlegen, nicht auf eine Privatperson.', einpassword: '1Password Teams oder Business auf die Gesellschaft anlegen, nicht auf eine Privatperson.', bitwarden: 'Bitwarden-Organisation (Teams) auf die Gesellschaft anlegen, nicht auf eine Privatperson.' },
  { id: 'admins', abschnitt: 'Konto', text: 'Zwei Admins festlegen, damit nie eine Person allein den Schlüssel hat.' },
  { id: 'einladen', abschnitt: 'Konto', text: 'Jede Person mit eigenem Konto einladen; keine geteilten Logins.' },
  { id: 'team-tresor', abschnitt: 'Tresore', text: 'Team-Tresor für gemeinsame Zugänge anlegen: Kanäle, Google, Tools.', einpassword: 'Tresor (Vault) „Team“ für gemeinsame Zugänge anlegen: Kanäle, Google, Tools.', bitwarden: 'Sammlung (Collection) „Team“ für gemeinsame Zugänge anlegen: Kanäle, Google, Tools.' },
  { id: 'partner-tresore', abschnitt: 'Tresore', text: 'Getrennte Tresore für Partner anlegen, je einer für Schnitt, Agentur und Steuerberatung, nur mit den Zugängen, die sie brauchen.', bitwarden: 'Getrennte Sammlungen für Partner anlegen, je eine für Schnitt, Agentur und Steuerberatung, nur mit den Zugängen, die sie brauchen.' },
  { id: 'kanaele', abschnitt: 'Tresore', text: 'Zugänge der Kanäle (TikTok, Instagram, YouTube, Twitch) in den Team-Tresor übernehmen und dabei lange, neue Passwörter setzen.' },
  { id: 'aufraeumen', abschnitt: 'Tresore', text: 'Alte Passwortlisten in Notizen, Chats und Tabellen löschen, sobald alles im Tresor liegt.' },
  { id: '2fa-manager', abschnitt: '2FA', text: 'Zwei-Faktor-Anmeldung für das Passwortmanager-Konto jeder Person einschalten.' },
  { id: '2fa-kanaele', abschnitt: '2FA', text: 'Zwei-Faktor-Anmeldung bei allen Kanälen und bei Google einschalten; die Codes im Tresor hinterlegen, damit ein verlorenes Handy niemanden aussperrt.' },
  { id: 'wiederherstellung', abschnitt: '2FA', text: 'Wiederherstellungscodes der Kanäle und von Google im Tresor ablegen.' },
  { id: 'notfall', abschnitt: 'Notfall', text: 'Notfallzugang einrichten.', einpassword: 'Emergency Kit jeder Person ausdrucken und sicher verwahren; Wiederherstellung durch die Admins einschalten.', bitwarden: 'Notfallzugang (Emergency Access) für eine Vertrauensperson einrichten.' },
  { id: 'notfall-test', abschnitt: 'Notfall', text: 'Einmal durchspielen, wie ein Admin einen gesperrten Zugang wiederherstellt.' },
  { id: 'offboarding', abschnitt: 'Alltag', text: 'Endet eine Zusammenarbeit: Zugang zum Tresor entziehen und die Passwörter darin ändern.' },
  { id: 'nicht-im-hub', abschnitt: 'Alltag', text: 'Passwörter nie in den Hub, in Karten, Notizen oder Chats schreiben; dort nur auf den Tresor verweisen.' },
];

export const schrittText = (schritt: EinrichtungsSchritt, wahl: string | null) =>
  (wahl === '1password' ? schritt.einpassword : wahl === 'bitwarden' ? schritt.bitwarden : undefined) ?? schritt.text;

export interface PasswortmanagerStand {
  wahl: PasswortmanagerWahl | null;
  haken: Record<string, { von: string; am: string }>;
  geaendert_am: string;
  geaendert_von: string;
}
