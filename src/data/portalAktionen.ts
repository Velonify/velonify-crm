/**
 * What the client may change through the portal: answer an approval, comment, send a request, upload files.
 * Pure functions that check everything against the client's own board and return the rows to write; the portal
 * function only loads, writes and answers. Every check is done on the server, never trusted from the browser.
 */
import { FOLDER_MIME, isFolder, type DriveApi, type DriveFile } from './google/drive';
import { ID_PREFIX, newId } from './ids';
import { prepareKundenNews } from './kunden';
import { CLIENT_SHARE_ORDNER, kundenBoard, sichtbareKarten, type Berechtigung, type PortalDatei } from './portalApi';
import { kartenNachSpalte, prepareKarte, sortierungZwischen, spaltenVon } from './todos';
import type { Aufgabe, AufgabenKommentar, KundenNews, Meta, TodoDaten } from './types';

/** Subfolder of 07_Client-Share where uploads of the client land. */
export const VOM_KUNDEN_ORDNER = 'Vom Kunden';
export const TITEL_MAX = 200;
export const TEXT_MAX = 5000;
/** Cloud Functions take at most 32 MB per request; we stay clearly below. */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_ANHAENGE = 20;
const NEWS_TITEL_MAX = 140;

export const KEINE_ANFRAGEN = 'Anfragen gehen gerade nicht. Schreib uns bitte eine Mail an hallo@velonify.de.';
export const ZU_GROSS = 'Die Datei ist größer als 25 MB. Schick größere Dateien bitte per WeTransfer oder als Link (z. B. in einem Kommentar).';

/** An error the portal answers with as `{ fehler }` and this HTTP status. */
export class PortalFehler extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PortalFehler';
    this.status = status;
  }
}

const KARTE_FEHLT = 'Diese Karte gibt es nicht (mehr).';

/** Meta fields of a row written by the portal: the contact's address as author. */
export function portalMeta(email: string, jetzt: Date): Meta {
  const zeit = jetzt.toISOString();
  return { erstellt_am: zeit, erstellt_von: email, geaendert_am: zeit, geaendert_von: email };
}

/** YYYY-MM-DD in Europe/Berlin, whatever time zone the server runs in. */
export function heuteInBerlin(jetzt: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

/** A trimmed string from untrusted JSON; anything else counts as empty. */
function text(wert: unknown): string {
  return typeof wert === 'string' ? wert.trim() : '';
}

function pruefeLaenge(wert: string, max: number, was: string): void {
  if (wert.length > max) throw new PortalFehler(400, `${was} darf höchstens ${max.toLocaleString('de-DE')} Zeichen lang sein.`);
}

/**
 * A card the logged-in contact may act on: on the client's own (not archived) board, released for the client,
 * not archived. Anything else – another client's card, an internal card, a hidden one – is simply "not there".
 */
export function sichtbareKarte(berechtigung: Berechtigung, todos: Pick<TodoDaten, 'boards' | 'aufgaben'>, karteId: unknown): Aufgabe {
  const id = text(karteId);
  const karte = id ? sichtbareKarten(todos, berechtigung.firma.id).find((a) => a.id === id) : undefined;
  if (!karte) throw new PortalFehler(404, KARTE_FEHLT);
  return karte;
}

function kommentar(aufgabeId: string, inhalt: string, email: string, jetzt: Date): AufgabenKommentar {
  return { id: newId(ID_PREFIX.aufgaben_kommentare), aufgabe_id: aufgabeId, text: inhalt, von: email, datum: jetzt.toISOString() };
}

export interface FreigabeErgebnis {
  karte: Aufgabe;
  changes: Pick<Aufgabe, 'freigabe' | 'freigabe_am' | 'freigabe_von' | 'geaendert_am' | 'geaendert_von'>;
  /** The note as a comment on the card, when there is one. */
  kommentar: AufgabenKommentar | null;
}

/** `POST /freigabe`: the client approves a card or asks for changes – only while the approval is open. */
export function portalFreigabe(args: { berechtigung: Berechtigung; todos: Pick<TodoDaten, 'boards' | 'aufgaben'>; eingabe: Record<string, unknown>; jetzt: Date }): FreigabeErgebnis {
  const { berechtigung, todos, eingabe, jetzt } = args;
  const karte = sichtbareKarte(berechtigung, todos, eingabe.karte_id);
  const entscheidung = eingabe.entscheidung;
  if (entscheidung !== 'freigegeben' && entscheidung !== 'aenderung') throw new PortalFehler(400, 'Bitte gib frei oder wünsch dir eine Änderung.');
  if (karte.freigabe !== 'offen') throw new PortalFehler(409, 'Diese Karte wartet gerade nicht auf deine Freigabe. Lade die Seite bitte neu.');
  const notiz = text(eingabe.notiz);
  pruefeLaenge(notiz, TEXT_MAX, 'Die Notiz');
  if (entscheidung === 'aenderung' && !notiz) throw new PortalFehler(400, 'Bitte schreib kurz, was anders sein soll.');
  const email = berechtigung.kontakt.email.trim();
  const zeit = jetzt.toISOString();
  return {
    karte,
    changes: { freigabe: entscheidung, freigabe_am: zeit, freigabe_von: email, geaendert_am: zeit, geaendert_von: email },
    kommentar: notiz ? kommentar(karte.id, notiz, email, jetzt) : null,
  };
}

/** `POST /kommentar`: a comment of the client on a card they can see. */
export function portalKommentar(args: { berechtigung: Berechtigung; todos: Pick<TodoDaten, 'boards' | 'aufgaben'>; eingabe: Record<string, unknown>; jetzt: Date }): AufgabenKommentar {
  const { berechtigung, todos, eingabe, jetzt } = args;
  const karte = sichtbareKarte(berechtigung, todos, eingabe.karte_id);
  const inhalt = text(eingabe.text);
  if (!inhalt) throw new PortalFehler(400, 'Bitte schreib einen Kommentar.');
  pruefeLaenge(inhalt, TEXT_MAX, 'Der Kommentar');
  return kommentar(karte.id, inhalt, berechtigung.kontakt.email.trim(), jetzt);
}

/** The ids of `datei_ids`, unique; anything that is not a list of strings is rejected. */
function dateiIds(wert: unknown): string[] {
  if (wert === undefined || wert === null) return [];
  if (!Array.isArray(wert) || wert.some((id) => typeof id !== 'string')) throw new PortalFehler(400, 'Die Anhänge sind ungültig.');
  const ids = [...new Set((wert as string[]).map((id) => id.trim()).filter(Boolean))];
  if (ids.length > MAX_ANHAENGE) throw new PortalFehler(400, `Bitte häng höchstens ${MAX_ANHAENGE} Dateien an.`);
  return ids;
}

/** Whether a request needs the list of uploaded files (only to check its attachments). */
export const anfrageHatAnhaenge = (eingabe: Record<string, unknown>) => Array.isArray(eingabe.datei_ids) && eingabe.datei_ids.length > 0;

export interface AnfrageErgebnis {
  karte: Aufgabe;
  /** Internal news for the team in the hub (not visible to the client). */
  news: KundenNews;
}

/**
 * `POST /anfrage`: a new card in the first column of the client's board, visible to the client and marked as their
 * request, plus an internal news entry so the team notices it. Attachments must be files the client uploaded.
 */
export function portalAnfrage(args: {
  berechtigung: Berechtigung;
  todos: Pick<TodoDaten, 'boards' | 'aufgaben'>;
  eingabe: Record<string, unknown>;
  /** Files in „Vom Kunden“ of this client – the only ones that may be attached. */
  kundenDateien: readonly PortalDatei[];
  jetzt: Date;
}): AnfrageErgebnis {
  const { berechtigung, todos, eingabe, kundenDateien, jetzt } = args;
  const { firma, kontakt } = berechtigung;
  const titel = text(eingabe.titel);
  const details = text(eingabe.details);
  if (!titel) throw new PortalFehler(400, 'Bitte gib deiner Anfrage einen Titel.');
  pruefeLaenge(titel, TITEL_MAX, 'Der Titel');
  pruefeLaenge(details, TEXT_MAX, 'Die Beschreibung');
  const dringend = eingabe.dringend === true;
  const anhaenge = dateiIds(eingabe.datei_ids).map((id) => {
    const datei = kundenDateien.find((d) => d.id === id && d.von === 'kunde');
    if (!datei) throw new PortalFehler(400, 'Eine der Dateien gibt es nicht (mehr). Lade sie bitte noch einmal hoch.');
    return datei;
  });

  const board = kundenBoard(todos.boards, firma.id);
  if (!board) throw new PortalFehler(409, KEINE_ANFRAGEN);
  const spalten = spaltenVon(board);
  const spalte = spalten.find((s) => !s.erledigt) ?? spalten[0];
  const spalteKarten = kartenNachSpalte(todos.aufgaben, board).get(spalte.id) ?? [];

  const beschreibung = [details, anhaenge.length > 0 ? `Anhänge (07_Client-Share/${VOM_KUNDEN_ORDNER}):\n${anhaenge.map((d) => `- ${d.name}`).join('\n')}` : '']
    .filter(Boolean)
    .join('\n\n');
  // Same cleaning as cards created in the hub.
  const clean = prepareKarte({ titel, beschreibung, zustaendig: firma.zustaendig, faellig_am: '', labels: dringend ? 'Dringend' : '', checkliste: '', sichtbar_kunde: true });
  const email = kontakt.email.trim();
  const meta = portalMeta(email, jetzt);
  const karte: Aufgabe = {
    id: newId(ID_PREFIX.aufgaben),
    board_id: board.id,
    spalte_id: spalte.id,
    titel: clean.titel,
    beschreibung: clean.beschreibung,
    zustaendig: clean.zustaendig,
    faellig_am: '',
    labels: clean.labels,
    checkliste: '',
    sortierung: sortierungZwischen(spalteKarten[spalteKarten.length - 1]?.sortierung, null),
    quelle: 'kunde',
    quelle_link: '',
    sichtbar_kunde: true,
    erledigt_am: '',
    erledigt_von: '',
    archiviert: false,
    freigabe: '',
    freigabe_am: '',
    freigabe_von: '',
    ...meta,
  };

  const name = `${kontakt.vorname} ${kontakt.nachname}`.trim() || email;
  const newsTitel = `Neue Anfrage: ${clean.titel}`;
  const news = prepareKundenNews(
    {
      firma_id: firma.id,
      art: 'hinweis',
      titel: newsTitel.length > NEWS_TITEL_MAX ? `${newsTitel.slice(0, NEWS_TITEL_MAX - 1)}…` : newsTitel,
      text: `${name} hat im Kundenportal eine Anfrage gestellt${dringend ? ' (dringend)' : ''}. Sie liegt als Karte auf dem Board.`,
      datum: heuteInBerlin(jetzt),
      angeheftet: false,
      sichtbar_kunde: false,
    },
    heuteInBerlin(jetzt),
  );
  return { karte, news: { ...news, id: newId(ID_PREFIX.kunden_news), archiviert: false, ...meta } };
}

// ─── Files ──────────────────────────────────────────────────────────────────

/** The client share of a firm folder and its upload subfolder (ids empty when missing). */
export interface KundenOrdner {
  shareId: string;
  vomKundenId: string;
}

const alsPortalDatei = (f: DriveFile, von: PortalDatei['von']): PortalDatei => ({ id: f.id, name: f.name, mimeType: f.mimeType, geaendert: f.modifiedTime ?? '', von });

/** Files of both folders, newest first; folders are left out. */
export function portalDateien(share: readonly DriveFile[], vomKunden: readonly DriveFile[]): PortalDatei[] {
  return [
    ...share.filter((f) => !isFolder(f)).map((f) => alsPortalDatei(f, 'velonify')),
    ...vomKunden.filter((f) => !isFolder(f)).map((f) => alsPortalDatei(f, 'kunde')),
  ].sort((a, b) => b.geaendert.localeCompare(a.geaendert));
}

/** Lists 07_Client-Share and its „Vom Kunden“ subfolder; empty without firm folder or share. */
export async function ladeKundenDateien(drive: Pick<DriveApi, 'listChildren'>, ordnerId: string): Promise<KundenOrdner & { dateien: PortalDatei[] }> {
  if (!ordnerId) return { shareId: '', vomKundenId: '', dateien: [] };
  const share = (await drive.listChildren(ordnerId)).find((f) => isFolder(f) && f.name === CLIENT_SHARE_ORDNER);
  if (!share) return { shareId: '', vomKundenId: '', dateien: [] };
  const inhalt = await drive.listChildren(share.id);
  const vomKunden = inhalt.find((f) => isFolder(f) && f.name === VOM_KUNDEN_ORDNER);
  const hochgeladen = vomKunden ? await drive.listChildren(vomKunden.id) : [];
  return { shareId: share.id, vomKundenId: vomKunden?.id ?? '', dateien: portalDateien(inhalt, hochgeladen) };
}

/** A file may be downloaded only when it lies directly in the share or in „Vom Kunden“ – nothing else of the folder. */
export function dateiErlaubt(meta: Pick<DriveFile, 'mimeType' | 'parents'> | null, ordner: KundenOrdner): boolean {
  if (!meta || meta.mimeType === FOLDER_MIME || !ordner.shareId) return false;
  const eltern = meta.parents ?? [];
  return eltern.includes(ordner.shareId) || (ordner.vomKundenId !== '' && eltern.includes(ordner.vomKundenId));
}

/** A safe file name from the `X-Dateiname` header (URI-encoded): no paths, no control characters, at most 150 chars. */
export function sauberDateiname(roh: string | undefined): string {
  let name = roh ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // not encoded – use as is
  }
  name = name
    .normalize('NFC')
    .split(/[/\\]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (name.length > 150) {
    const punkt = name.lastIndexOf('.');
    const endung = punkt > 0 && name.length - punkt <= 10 ? name.slice(punkt) : '';
    name = name.slice(0, 150 - endung.length).trimEnd() + endung;
  }
  return name || 'Datei';
}

/** The type the file is stored with; Google's own types would turn the upload into a Doc, so they are not accepted. */
export function sauberDateityp(roh: string | undefined): string {
  const typ = (roh ?? '').split(';')[0].trim().toLowerCase();
  if (!/^[a-z0-9][\w.+-]*\/[\w.+-]+$/.test(typ) || typ.startsWith('application/vnd.google-apps.')) return 'application/octet-stream';
  return typ;
}

/** Checks the size of an upload before it goes to Drive. */
export function pruefeUpload(groesse: number): void {
  if (groesse <= 0) throw new PortalFehler(400, 'Die Datei ist leer.');
  if (groesse > UPLOAD_MAX_BYTES) throw new PortalFehler(413, ZU_GROSS);
}

