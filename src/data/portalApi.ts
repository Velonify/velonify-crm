/**
 * What the client portal may see. The portal function builds its answer only through `kundensicht`, which copies
 * whitelisted fields of the client's own, released records – nothing else of the sheet leaves the server.
 * Shared with the portal frontend as the contract of the API.
 */
import { CLIENT_SHARE_ORDNER } from './kunden';
import { freigabeVon, meilensteineVon, type FreigabeStatus } from './portal';
import { checklisteVon, erledigtSpalte, spaltenVon } from './todos';
import { slackChannelUrl } from './start';
import { personen } from './zustaendig';
import type { Aufgabe, AufgabenKommentar, Board, Database, Firma, Kontakt, KundenDaten, MeilensteinStatus, PortalDaten, PortalZugang, Spalte, TodoDaten } from './types';

export { CLIENT_SHARE_ORDNER };

/** How long a login link and a session are valid. */
export const LINK_GUELTIG_MS = 15 * 60_000;
export const SITZUNG_GUELTIG_MS = 30 * 24 * 60 * 60_000;
/** Done cards older than the newest ones are left out; the portal shows them collapsed anyway. */
export const MAX_ERLEDIGT = 30;
export const MAX_NEWS = 50;

export type PortalPhase = 'wartet' | 'arbeit' | 'geplant' | 'erledigt';

export interface PortalKommentar {
  von: string;
  /** Written by Velonify (true) or by someone of the client (false). */
  team: boolean;
  /** Written by the logged-in contact. */
  ich: boolean;
  text: string;
  datum: string;
}

export interface PortalKarte {
  id: string;
  titel: string;
  beschreibung: string;
  phase: PortalPhase;
  zustaendig: string[];
  faellig_am: string;
  /** YYYY-MM-DD, done cards only */
  erledigt_am: string;
  checkliste: { text: string; erledigt: boolean }[];
  freigabe: FreigabeStatus | '';
  /** ISO time the approval was asked for (`offen`) or answered (`freigegeben`, `aenderung`); empty without approval. */
  freigabe_am: string;
  /** Came in as a request of the client. */
  anfrage: boolean;
  kommentare: PortalKommentar[];
}

export interface PortalDatei {
  id: string;
  name: string;
  mimeType: string;
  geaendert: string;
  /** Shared by Velonify (directly in 07_Client-Share) or uploaded by the client (subfolder „Vom Kunden“). */
  von: 'velonify' | 'kunde';
}

export interface Kundensicht {
  kunde: { name: string; kuerzel: string };
  /** The client's Slack channel (from the firm in the hub); the preferred way to reach the team. Null without one. */
  slack: { channel: string; url: string } | null;
  ich: { vorname: string; nachname: string; email: string };
  team: string[];
  fahrplan: { titel: string; datum: string; status: MeilensteinStatus }[];
  karten: PortalKarte[];
  news: { id: string; art: string; titel: string; text: string; datum: string }[];
  links: { titel: string; url: string; beschreibung: string; art: string }[];
  werkzeuge: string[];
  dateien: PortalDatei[];
}

/** Columns that mean "the team is on it" on the standard board. */
const ARBEIT_SPALTEN = new Set(['woche', 'arbeit', 'wartet']);

/** Internal nicknames in `zustaendig` and the name clients see instead. */
export const KUNDEN_NAME: Record<string, string> = { Lugge: 'Lukas' };
/** The team members of a `zustaendig` value as clients see them. */
export const fuerKunden = (wert: string) => [...new Set(personen(wert).map((n) => KUNDEN_NAME[n] ?? n))];

export const normalisiereEmail = (email: string) => email.trim().toLowerCase();

export interface Berechtigung {
  zugang: PortalZugang;
  kontakt: Kontakt;
  firma: Firma;
}

/**
 * The login of an e-mail address: an active portal login of a contact that is not archived, at a firm that is an
 * active client. Anything else is no login (the caller answers the same either way, so nobody can probe addresses).
 */
export function findeBerechtigung(db: Pick<Database, 'firmen' | 'kontakte'>, portal: Pick<PortalDaten, 'zugaenge'>, email: string): Berechtigung | null {
  const gesucht = normalisiereEmail(email);
  if (!gesucht) return null;
  for (const kontakt of db.kontakte) {
    if (kontakt.archiviert || normalisiereEmail(kontakt.email) !== gesucht) continue;
    const berechtigung = pruefeBerechtigung(db, portal, kontakt.id, kontakt.firma_id);
    if (berechtigung) return berechtigung;
  }
  return null;
}

/** Re-checked on every request with a session: the login can be switched off in the hub at any time. */
export function pruefeBerechtigung(db: Pick<Database, 'firmen' | 'kontakte'>, portal: Pick<PortalDaten, 'zugaenge'>, kontaktId: string, firmaId: string): Berechtigung | null {
  const kontakt = db.kontakte.find((k) => k.id === kontaktId);
  if (!kontakt || kontakt.archiviert || kontakt.firma_id !== firmaId) return null;
  const firma = db.firmen.find((f) => f.id === firmaId);
  if (!firma || firma.archiviert || firma.status !== 'kunde') return null;
  const zugang = portal.zugaenge.find((z) => z.kontakt_id === kontaktId && z.firma_id === firmaId && z.aktiv);
  return zugang ? { zugang, kontakt, firma } : null;
}

const datumTeil = (zeitpunkt: string) => zeitpunkt.slice(0, 10);

/** Team members appear with their first name (from the address), people of the client with their name. */
function absender(von: string, teamDomain: string, kontakte: readonly Kontakt[], ich: string): { von: string; team: boolean; ich: boolean } {
  const adresse = normalisiereEmail(von);
  const selbst = adresse !== '' && adresse === normalisiereEmail(ich);
  if (adresse.endsWith(`@${teamDomain}`)) {
    const name = adresse.split('@')[0].split(/[._-]/)[0];
    return { von: name.charAt(0).toUpperCase() + name.slice(1), team: true, ich: selbst };
  }
  const kontakt = kontakte.find((k) => normalisiereEmail(k.email) === adresse);
  return { von: kontakt ? `${kontakt.vorname} ${kontakt.nachname}`.trim() : 'Kunde', team: false, ich: selbst };
}

/** What `portalKarte` needs besides the card: the board's columns, all comments and who is asking. */
export interface KartenKontext {
  spalten: Spalte[];
  kommentare: readonly AufgabenKommentar[];
  /** Contacts of the client, for the names under their comments. */
  kontakte: readonly Kontakt[];
  /** E-mail of the logged-in contact. */
  ich: string;
  teamDomain: string;
}

export function kartenKontext(args: { berechtigung: Berechtigung; db: Pick<Database, 'kontakte'>; todos: Pick<TodoDaten, 'boards' | 'kommentare'>; teamDomain: string }): KartenKontext {
  const { berechtigung, db, todos, teamDomain } = args;
  const board = kundenBoard(todos.boards, berechtigung.firma.id);
  return {
    spalten: board ? spaltenVon(board) : [],
    kommentare: todos.kommentare,
    kontakte: db.kontakte.filter((k) => k.firma_id === berechtigung.firma.id),
    ich: berechtigung.kontakt.email,
    teamDomain,
  };
}

/** The (not archived) board of the client, if there is one. */
export const kundenBoard = (boards: readonly Board[], firmaId: string) => boards.find((b) => b.firma_id === firmaId && !b.archiviert);

/** One card as the portal shows it – whitelisted fields only. */
export function portalKarte(a: Aufgabe, kontext: KartenKontext): PortalKarte {
  const fertig = erledigtSpalte(kontext.spalten)?.id;
  const freigabe = freigabeVon(a);
  const phase: PortalPhase = a.spalte_id === fertig ? 'erledigt' : freigabe === 'offen' ? 'wartet' : ARBEIT_SPALTEN.has(a.spalte_id) ? 'arbeit' : 'geplant';
  return {
    id: a.id,
    titel: a.titel,
    beschreibung: a.beschreibung,
    phase,
    zustaendig: fuerKunden(a.zustaendig),
    faellig_am: a.faellig_am,
    erledigt_am: phase === 'erledigt' ? datumTeil(a.erledigt_am) : '',
    checkliste: checklisteVon(a).map((p) => ({ text: p.text, erledigt: p.erledigt })),
    freigabe: freigabe ?? '',
    freigabe_am: freigabe ? a.freigabe_am : '',
    anfrage: a.quelle === 'kunde',
    kommentare: kontext.kommentare
      .filter((k) => k.aufgabe_id === a.id)
      .sort((x, y) => x.datum.localeCompare(y.datum))
      .map((k) => ({ ...absender(k.von, kontext.teamDomain, kontext.kontakte, kontext.ich), text: k.text, datum: k.datum })),
  };
}

/** Cards the client may see: on the client's board, released, not archived and in a column that still exists. */
export function sichtbareKarten(todos: Pick<TodoDaten, 'boards' | 'aufgaben'>, firmaId: string): Aufgabe[] {
  const board = kundenBoard(todos.boards, firmaId);
  if (!board) return [];
  const spaltenIds = new Set(spaltenVon(board).map((s) => s.id));
  return todos.aufgaben.filter((a) => a.board_id === board.id && a.sichtbar_kunde && !a.archiviert && spaltenIds.has(a.spalte_id));
}

export function kundensicht(args: {
  berechtigung: Berechtigung;
  db: Pick<Database, 'kontakte'> & Partial<Pick<Database, 'einstellungen'>>;
  kunden: KundenDaten;
  todos: TodoDaten;
  portal: PortalDaten;
  dateien: PortalDatei[];
  teamDomain: string;
}): Kundensicht {
  const { berechtigung, kunden, todos, portal, dateien } = args;
  const { firma, kontakt } = berechtigung;
  const kontext = kartenKontext(args);
  const fertig = erledigtSpalte(kontext.spalten)?.id;
  const reihenfolge = (id: string) => kontext.spalten.findIndex((s) => s.id === id);

  const sichtbar = sichtbareKarten(todos, firma.id).sort(
    (a, b) => reihenfolge(a.spalte_id) - reihenfolge(b.spalte_id) || (a.sortierung ?? 0) - (b.sortierung ?? 0),
  );
  const offen = sichtbar.filter((a) => a.spalte_id !== fertig);
  const erledigt = sichtbar
    .filter((a) => a.spalte_id === fertig)
    .sort((a, b) => b.erledigt_am.localeCompare(a.erledigt_am))
    .slice(0, MAX_ERLEDIGT);

  return {
    kunde: { name: firma.name, kuerzel: firma.kuerzel },
    slack: firma.slack_channel.trim()
      ? { channel: firma.slack_channel.trim().replace(/^#/, ''), url: slackChannelUrl(args.db.einstellungen ?? {}, firma.slack_channel.trim()) }
      : null,
    ich: { vorname: kontakt.vorname, nachname: kontakt.nachname, email: kontakt.email },
    team: fuerKunden(firma.zustaendig),
    fahrplan: meilensteineVon(portal.meilensteine, firma.id).map((m) => ({ titel: m.titel, datum: m.datum, status: m.status })),
    karten: [...offen, ...erledigt].map((a) => portalKarte(a, kontext)),
    news: kunden.news
      .filter((n) => (n.firma_id === firma.id || n.firma_id === '') && n.sichtbar_kunde && !n.archiviert)
      .sort((a, b) => b.datum.localeCompare(a.datum))
      .slice(0, MAX_NEWS)
      .map((n) => ({ id: n.id, art: n.art, titel: n.titel, text: n.text, datum: n.datum })),
    links: kunden.links
      .filter((l) => l.firma_id === firma.id && l.sichtbar_kunde && !l.archiviert)
      .sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
      .map((l) => ({ titel: l.titel, url: l.url, beschreibung: l.beschreibung, art: l.art })),
    werkzeuge: portal.werkzeuge.filter((w) => w.firma_id === firma.id && w.aktiv).map((w) => w.werkzeug),
    dateien,
  };
}

/** Text of the login mail (plain text, German, "du"). */
export function loginMail(vorname: string, link: string, jetzt = new Date()): { betreff: string; text: string } {
  // The time makes every subject unique, so Gmail does not thread the mails and hide the newest link behind "…".
  const uhr = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(jetzt);
  return {
    betreff: `Dein Anmeldelink für das Velonify-Kundenportal (${uhr} Uhr)`,
    text: [
      `Hallo${vorname ? ` ${vorname}` : ''},`,
      '',
      `mit diesem Link meldest du dich im Velonify-Kundenportal an (angefordert um ${uhr} Uhr):`,
      '',
      link,
      '',
      'Der Link gilt 15 Minuten und funktioniert nur einmal. Danach bleibst du angemeldet, solange du das Portal mindestens alle 30 Tage öffnest.',
      '',
      'Du hast keinen Link angefordert? Dann kannst du diese Mail ignorieren.',
      '',
      'Viele Grüße',
      'dein Velonify-Team',
    ].join('\n'),
  };
}
