import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  EOL,
  STATUS,
  TIERS,
} from '../../../src/data/constants';
import type { CrmService } from '../../../src/data/crm';
import { DuplicateError } from '../../../src/data/errors';
import {
  dmLink,
  herkunftLabel,
  istNewsletterAbonnent,
  magnetZahlen,
  RESSOURCEN_BASIS,
  shopsystemLabel,
} from '../../../src/data/magnete';
import { roastPlaetze } from '../../../src/data/roast';
import {
  boardVon,
  checklisteVon,
  faelligkeit,
  INTERNES_BOARD_TITEL,
  spaltenVon,
} from '../../../src/data/todos';
import { personen } from '../../../src/data/zustaendig';

import { kontaktName } from '../../../src/data/rules';
import { findeTeamMitglied, type Aufgabe } from '../../../src/data/selectors';

import {
  type Aufgabe as Karte,
  type Board,
  EMPTY_KONTAKT_INPUT,
  type Database,
  type Deal,
  type Firma,
  type Kontakt,
  type KontaktInput,
  type Magnet,
  type MagnetInput,
  type MagnetLead,
  type Spalte,
  type TodoDaten,
} from '../../../src/data/types';
import type { Person } from './google';
import type { GeneratorApi } from '../../../src/data/contactGenerator';
import type { LeadFinderApi } from '../../../src/data/leadFinder';
import type { LinkedinApi } from '../../../src/data/linkedin';
import type { ShopAuditApi } from '../../../src/data/shopAudit';

const BERLIN = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "JJJJ-MM-TT HH:MM" in Berlin time. Timestamps with Z or an offset are UTC instants; plain ones are already local. */
export function zeitBerlin(wert: string): string {
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(wert)) {
    const datum = new Date(wert);
    if (!Number.isNaN(datum.getTime())) return BERLIN.format(datum);
  }
  return wert.slice(0, 16).replace('T', ' ');
}

export const HUB = 'https://crm.velonify.de';
export const firmaLink = (id: string) => `${HUB}/#/crm/firmen/${id}`;
export const driveLink = (id: string) => (id ? `https://drive.google.com/drive/folders/${id}` : undefined);

// ─── Ausgabe ────────────────────────────────────────────────────────────────

const META = new Set(['erstellt_von', 'geaendert_von']);

/** Drops empty fields and bookkeeping, so Claude reads what matters; `archiviert` only shows when set. */
export function kompakt<T extends object>(eintrag: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(eintrag).filter(
      ([schluessel, wert]) => !META.has(schluessel) && wert !== '' && wert !== null && wert !== undefined && !(schluessel === 'archiviert' && !wert),
    ),
  );
}

export const antwort = (daten: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(daten, null, 1) }] });
export const fehler = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function fehlerText(err: unknown): string {
  if (err instanceof DuplicateError) return `${err.message} (firma_id ${err.existingId}). Nichts angelegt.`;
  if (err instanceof Error) {
    if (err.name === 'ConflictError') return `${err.message} Bitte neu laden und noch einmal versuchen.`;
    return err.message || err.name;
  }
  return String(err);
}

export function dealZeile(deal: Deal, firmen: Map<string, Firma>, kontakte?: Map<string, Kontakt>) {
  const kontakt = kontakte?.get(deal.kontakt_id);
  return kompakt({
    deal_id: deal.id,
    titel: deal.titel,
    firma: firmen.get(deal.firma_id)?.name,
    firma_id: deal.firma_id,
    phase: deal.phase,
    zustaendig: deal.zustaendig,
    kontakt: kontakt ? kontaktName(kontakt) : '',
    wert_eur: deal.wert_eur,
    naechster_schritt: deal.naechster_schritt,
    naechster_schritt_am: deal.naechster_schritt_am,
    verlustgrund: deal.verlustgrund,
    abgeschlossen_am: deal.abgeschlossen_am,
    geaendert_am: deal.geaendert_am.slice(0, 10),
  });
}

export function aufgabeZeile(a: Aufgabe) {
  return kompakt({
    art: a.art,
    titel: a.titel,
    faellig: a.faellig,
    zustaendig: a.zustaendig,
    firma: a.firma?.name,
    firma_id: a.firma?.id,
    deal_id: a.deal?.id,
    deal: a.deal?.titel,
    wiedervorlage_id: a.wiedervorlage?.id,
  });
}

export function finde<T extends { id: string }>(liste: readonly T[], id: string, was: string, woher = 'suchen'): T {
  const treffer = liste.find((e) => e.id === id);
  if (!treffer) throw new Error(`${was} „${id}“ nicht gefunden. IDs über \`${woher}\` holen.`);
  return treffer;
}

export const magnetLink = () => `${HUB}/#/magnete/liste`;

export function magnetZeile(m: Magnet, leads: readonly MagnetLead[], mitTexten = false) {
  const zahlen = magnetZahlen(leads.filter((l) => l.magnet === m.slug));
  return kompakt({
    adresse: m.slug,
    titel: m.titel,
    aktiv: m.aktiv,
    archiviert: m.archiviert || '',
    typ: m.typ === 'audit' ? 'audit (Shop-Roast)' : 'datei',
    plaetze: m.plaetze !== null ? `${roastPlaetze(m, leads.filter((l) => l.magnet === m.slug)).frei} von ${m.plaetze} frei` : '',
    stichwort: m.stichwort,
    landingpage: `${RESSOURCEN_BASIS}${m.slug}/`,
    dm_link: m.aktiv ? dmLink(m.slug) : '',
    datei_url: m.datei_url,
    eintraege: zahlen.eintraege,
    download_geoeffnet: zahlen.geladen,
    newsletter: zahlen.newsletter,
    im_crm: zahlen.uebernommen,
    offen: zahlen.offen,
    ...(mitTexten
      ? { untertitel: m.untertitel, inhalt: m.inhalt, knopf: m.knopf, mail_betreff: m.mail_betreff, mail_text: m.mail_text, beschreibung: m.beschreibung }
      : {}),
  });
}

export function leadZeile(l: MagnetLead) {
  return kompakt({
    lead_id: l.id,
    magnet: l.magnet,
    eingegangen_am: zeitBerlin(l.eingegangen_am),
    vorname: l.vorname,
    email: l.email,
    shop: l.shop,
    shopsystem: l.shopsystem ? shopsystemLabel(l.shopsystem) : '',
    herkunft: herkunftLabel(l),
    download_geoeffnet: l.download_am ? l.download_am.slice(0, 10) : 'nein',
    newsletter: istNewsletterAbonnent(l) ? 'bestätigt' : l.newsletter_abgemeldet_am ? 'abgemeldet' : l.newsletter_einwilligung ? 'angehakt, nicht bestätigt' : '',
    warteliste: l.warteliste ? 'ja' : '',
    report: l.report_gesendet_am ? `gesendet ${l.report_gesendet_am.slice(0, 10)}` : l.report_freigegeben_am ? 'freigegeben' : l.audit_id ? 'geprüft, nicht freigegeben' : '',
    status: l.status,
    firma_id: l.firma_id,
  });
}

/** The editable fields of a magnet, so a partial change keeps the rest. */
export const magnetInput = (m: Magnet): MagnetInput => ({
  slug: m.slug, titel: m.titel, beschreibung: m.beschreibung, stichwort: m.stichwort, datei_url: m.datei_url, mail_betreff: m.mail_betreff,
  mail_text: m.mail_text, aktiv: m.aktiv, untertitel: m.untertitel, inhalt: m.inhalt, knopf: m.knopf, typ: m.typ, plaetze: m.plaetze,
});

export const boardLink = (id: string) => `${HUB}/#/todo/${id}`;
export const klein = (text: string) => text.trim().toLocaleLowerCase('de');

export const spalteZeile = (s: Spalte) => kompakt({ spalte_id: s.id, titel: s.titel, erledigt: s.erledigt ? true : '' });

export function karteZeile(k: Karte, board: Board | undefined, daten: TodoDaten, heute: string) {
  const spalten = board ? spaltenVon(board) : [];
  const punkte = checklisteVon(k);
  const kommentare = daten.kommentare.filter((c) => c.aufgabe_id === k.id).length;
  return kompakt({
    karte_id: k.id,
    titel: k.titel,
    board: board?.titel,
    spalte: (spalten.find((s) => s.id === k.spalte_id) ?? spalten[0])?.titel,
    zustaendig: k.zustaendig,
    faellig: k.faellig_am,
    ueberfaellig: faelligkeit(k, heute) === 'ueberfaellig' ? true : '',
    labels: k.labels,
    beschreibung: k.beschreibung,
    checkliste: punkte.length > 0 ? punkte.map((p) => `${p.erledigt ? '[x]' : '[ ]'} ${p.text}`) : '',
    erledigt_am: k.erledigt_am.slice(0, 10),
    sichtbar_kunde: k.sichtbar_kunde ? true : '',
    freigabe: k.freigabe,
    kommentare: kommentare || '',
    link: k.quelle_link,
  });
}

/**
 * The board a name points to: "intern", a board id or title, or a client by firma_id, Kürzel or name.
 * Returns the firm id for `boardFuer` and the board when it already exists.
 */
/** Prefixes of Velonify's own Slack channels; their to-dos go to the internal board. */
export const INTERNE_CHANNELS = /^(ops|dev|sales|intern|team|general|allgemein|random)(-|$)/;

/**
 * The firm of a Slack channel: the channel stored on the firm (`slack_channel`), else the naming rule
 * client-<kürzel>-… / ext-<kürzel>-…; Velonify's own channels mean the internal board. Undefined when unknown.
 */
export function firmaAusChannel(db: Database, channel: string): { firmaId: string } | undefined {
  const name = klein(channel).replace(/^#/, '');
  const firmen = db.firmen.filter((f) => !f.archiviert);
  const gespeichert = firmen.find((f) => f.slack_channel && klein(f.slack_channel).replace(/^#/, '') === name);
  if (gespeichert) return { firmaId: gespeichert.id };
  const kuerzel = /^(?:client|ext)-([a-z0-9]+)(?:-|$)/.exec(name)?.[1];
  const firma = kuerzel ? firmen.find((f) => klein(f.kuerzel) === kuerzel) : undefined;
  if (firma) return { firmaId: firma.id };
  if (INTERNE_CHANNELS.test(name)) return { firmaId: '' };
  return undefined;
}

export function findeBoard(db: Database, boards: readonly Board[], angabe: string): { firmaId: string; board?: Board } {
  const wert = klein(angabe);
  if (!wert || wert === 'intern' || wert === klein(INTERNES_BOARD_TITEL)) return { firmaId: '', board: boardVon(boards, '') };
  if (wert.startsWith('#')) {
    const ausChannel = firmaAusChannel(db, wert);
    if (!ausChannel) throw new Error(`Zum Channel „${angabe}“ gehört kein Kunde (weder als Slack-Channel der Firma eingetragen noch client-<kürzel>-…). Board "intern" oder den Kunden angeben.`);
    return { firmaId: ausChannel.firmaId, board: boardVon(boards, ausChannel.firmaId) };
  }
  const direkt = boards.find((b) => !b.archiviert && (b.id === angabe.trim() || klein(b.titel) === wert));
  if (direkt) return { firmaId: direkt.firma_id, board: direkt };
  const firmen = db.firmen.filter((f) => !f.archiviert);
  const genau = firmen.filter((f) => f.id === angabe.trim() || klein(f.kuerzel) === wert || klein(f.name) === wert);
  const treffer = genau.length > 0 ? genau : firmen.filter((f) => klein(f.name).includes(wert));
  if (treffer.length === 0) throw new Error(`Kein Board und keine Firma zu „${angabe}“. Boards über \`boards\` holen.`);
  if (treffer.length > 1) throw new Error(`„${angabe}“ ist nicht eindeutig: ${treffer.map((f) => (f.kuerzel ? `${f.name} (${f.kuerzel})` : f.name)).join(', ')}. Kürzel oder firma_id angeben.`);
  return { firmaId: treffer[0].id, board: boardVon(boards, treffer[0].id) };
}

/** A column of the board by id or title. */
export function findeSpalte(board: Board, angabe: string): Spalte {
  const spalten = spaltenVon(board);
  const spalte = spalten.find((s) => s.id === angabe.trim()) ?? spalten.find((s) => klein(s.titel) === klein(angabe));
  if (!spalte) throw new Error(`Spalte „${angabe}“ gibt es auf „${board.titel}“ nicht. Möglich: ${spalten.map((s) => s.titel).join(', ')}.`);
  return spalte;
}

export function findeKarte(daten: TodoDaten, karteId: string): { karte: Karte; board: Board } {
  const karte = finde(daten.aufgaben, karteId, 'Karte', 'karten');
  if (karte.archiviert) throw new Error(`Die Karte „${karte.titel}“ ist archiviert.`);
  return { karte, board: finde(daten.boards, karte.board_id, 'Board', 'boards') };
}

// ─── Eingaben ───────────────────────────────────────────────────────────────

export const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT');

export const firmaFelder = {
  name: z.string().optional(),
  domain: z.string().optional().describe('Shop-Domain, z. B. beispiel.de'),
  status: z.enum(STATUS).optional(),
  tier: z.enum(TIERS).optional(),
  plattform: z.string().optional().describe('z. B. Magento, Shopware, WooCommerce'),
  version: z.string().optional(),
  eol: z.enum(EOL).optional(),
  ort: z.string().optional(),
  email_allgemein: z.string().optional(),
  telefon_allgemein: z.string().optional(),
  tech_info: z.string().optional(),
  quelle: z.string().optional().describe('Woher der Lead kommt, z. B. LinkedIn, Empfehlung, Website'),
  zustaendig: z.string().optional(),
  register: z.string().optional(),
  ust_id: z.string().optional(),
  notiz: z.string().optional(),
};

export const kontaktFelder = {
  vorname: z.string().optional(),
  nachname: z.string().optional(),
  rolle: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  linkedin: z.string().optional().describe('Profil-URL'),
  hauptkontakt: z.boolean().optional(),
  notiz: z.string().optional(),
};

export const dealFelder = {
  titel: z.string().optional(),
  kontakt_id: z.string().optional(),
  wert_eur: z.number().nonnegative().nullable().optional(),
  wahrscheinlichkeit: z.number().min(0).max(100).nullable().optional(),
  zustaendig: z.string().optional(),
  naechster_schritt: z.string().optional(),
  naechster_schritt_am: z.union([datum, z.literal('')]).optional(),
};

/** The editable fields of an existing contact, so a partial change keeps the rest. */
export const kontaktInput = (k: Kontakt): KontaktInput =>
  Object.fromEntries(Object.keys(EMPTY_KONTAKT_INPUT).map((feld) => [feld, k[feld as keyof KontaktInput]])) as unknown as KontaktInput;

export const ohneUndefined = <T extends object>(eintrag: T) =>
  Object.fromEntries(Object.entries(eintrag).filter(([, wert]) => wert !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

// ─── Werkzeuge ──────────────────────────────────────────────────────────────

export interface Kontext {
  service: CrmService;
  person: Person;
  /** Fixed team name for the person (TEAM_ZUORDNUNG), when name and address do not give it away ("lukas" → "Lugge"). */
  teamName?: string;
  heute: () => string;
  /** Cloud Functions for generator, audit, lead finder and LinkedIn; tests pass demo versions. */
  dienste?: Dienste;
  /** Replaces a select list (team, verlustgrund, …), like Einrichtung → Daten; only with the Postgres store. */
  setzeListe?: (liste: string, werte: string[]) => Promise<void>;
}

/** The team name of the signed-in person: the fixed one if it is in the team, else found like the hub's useIch does. */
export function ichAus(db: Database, person: Person, teamName?: string): string | null {
  const team = db.listen.team ?? [];
  if (teamName && team.includes(teamName)) return teamName;
  return findeTeamMitglied(team, person.name, person.email);
}

export function pruefeTeam(db: Database, name: string | undefined): void {
  const team = db.listen.team ?? [];
  const fremd = personen(name).filter((n) => !team.includes(n));
  if (team.length > 0 && fremd.length > 0) throw new Error(`„${fremd.join(', ')}“ ist nicht im Team. Möglich: ${team.join(', ')}.`);
}
/** Cloud Functions the hub calls besides the database; missing ones make their tools answer with a hint. */
export interface Dienste {
  generator?: GeneratorApi;
  shopAudit?: ShopAuditApi;
  leadFinder?: LeadFinderApi;
  linkedin?: LinkedinApi;
}

/** What every group of tools gets: the service, who is signed in and the shared wrappers. */
export interface Werkzeugkasten extends Kontext {
  server: McpServer;
  meinName: (db: Database) => string | null;
  sicher: <A>(fn: (args: A) => Promise<CallToolResult>) => (args: A) => Promise<CallToolResult>;
  lesen: { readonly readOnlyHint: true; readonly openWorldHint: false };
  schreiben: { readonly readOnlyHint: false; readonly destructiveHint: false; readonly openWorldHint: false };
}

export function baueKasten(server: McpServer, kontext: Kontext): Werkzeugkasten {
  return {
    ...kontext,
    server,
    meinName: (db) => ichAus(db, kontext.person, kontext.teamName),
    sicher:
      <A>(fn: (args: A) => Promise<CallToolResult>) =>
      async (args: A): Promise<CallToolResult> => {
        try {
          return await fn(args);
        } catch (err) {
          return fehler(fehlerText(err));
        }
      },
    lesen: { readOnlyHint: true, openWorldHint: false },
    schreiben: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  };
}

/** The tool needs a Cloud Function that is not configured for this server. */
export function ohneDienst(was: string, variable: string): never {
  throw new Error(`${was} ist für den MCP-Server nicht eingerichtet (Umgebungsvariable ${variable} fehlt).`);
}
