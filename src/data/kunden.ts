import { ValidationError } from './errors';
import { isIsoDate } from './ids';
import type { Aufgabe, Database, Firma, KundenLink, KundenLinkArt, KundenLinkInput, KundenNews, KundenNewsArt, KundenNewsInput } from './types';
import type { DriveFile } from './google/drive';

/** Subfolder of the client folder template that the client portal will show. */
export const CLIENT_SHARE_ORDNER = '07_Client-Share';
/** New files in the client share count as news for this many days. */
export const NEUE_DATEI_TAGE = 14;

export const LINK_ART_LABEL: Record<KundenLinkArt, string> = { tool: 'Tool', ressource: 'Ressource' };
export const NEWS_ART_LABEL: Record<KundenNewsArt, string> = { update: 'Update', meilenstein: 'Meilenstein', hinweis: 'Hinweis' };

const LINK_ARTEN = Object.keys(LINK_ART_LABEL) as KundenLinkArt[];
const NEWS_ARTEN = Object.keys(NEWS_ART_LABEL) as KundenNewsArt[];

/** Active clients, sorted by Kürzel, then name – the firms that get a page in the client hub. */
export function kundenListe(db: Pick<Database, 'firmen'>): Firma[] {
  return db.firmen
    .filter((f) => f.status === 'kunde' && !f.archiviert)
    .sort((a, b) => (a.kuerzel || '~').localeCompare(b.kuerzel || '~') || a.name.localeCompare(b.name, 'de'));
}

export function prepareKundenLink(input: KundenLinkInput): KundenLinkInput {
  const titel = input.titel.trim();
  let url = input.url.trim();
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  if (!LINK_ARTEN.includes(input.art)) throw new ValidationError('art', 'Bitte „Tool“ oder „Ressource“ wählen.');
  if (!titel) throw new ValidationError('titel', 'Bitte einen Titel eintragen.');
  if (!/^https?:\/\/\S+$/.test(url)) throw new ValidationError('url', 'Bitte einen Link eintragen, der mit https:// anfängt.');
  return { art: input.art, titel, url, beschreibung: input.beschreibung.trim(), angeheftet: input.angeheftet, sichtbar_kunde: input.sichtbar_kunde };
}

export function prepareKundenNews(input: KundenNewsInput, heute: string): KundenNewsInput {
  const clean: KundenNewsInput = {
    firma_id: input.firma_id.trim(),
    art: input.art,
    titel: input.titel.trim(),
    text: input.text.trim(),
    datum: input.datum.trim() || heute,
    angeheftet: input.angeheftet,
    sichtbar_kunde: input.sichtbar_kunde,
  };
  if (!NEWS_ARTEN.includes(clean.art)) throw new ValidationError('art', 'Bitte eine Art wählen.');
  if (!clean.titel) throw new ValidationError('titel', 'Bitte eine Überschrift eintragen.');
  if (clean.titel.length > 140) throw new ValidationError('titel', 'Die Überschrift darf höchstens 140 Zeichen lang sein – Details gehören in den Text.');
  if (!isIsoDate(clean.datum)) throw new ValidationError('datum', 'Bitte ein gültiges Datum wählen.');
  return clean;
}

/** Links of one client in their order; archived ones only on request. */
export function linksVon(links: readonly KundenLink[], firmaId: string, mitArchiv = false): KundenLink[] {
  return links
    .filter((l) => l.firma_id === firmaId && (mitArchiv || !l.archiviert))
    .sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0) || a.titel.localeCompare(b.titel, 'de'));
}

/** Swaps a link with its neighbour and renumbers the list in steps of 10; returns only the values that change. */
export function tauscheLink(liste: readonly KundenLink[], id: string, richtung: -1 | 1): { id: string; sortierung: number }[] {
  const neu = [...liste];
  const index = neu.findIndex((l) => l.id === id);
  const ziel = index + richtung;
  if (index < 0 || ziel < 0 || ziel >= neu.length) return [];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return neu.map((l, i) => ({ id: l.id, sortierung: (i + 1) * 10 })).filter((n, i) => neu[i].sortierung !== n.sortierung);
}

export interface TickerEintrag {
  id: string;
  /** YYYY-MM-DD */
  datum: string;
  art: KundenNewsArt | 'datei' | 'erledigt';
  titel: string;
  text: string;
  url?: string;
  angeheftet: boolean;
  /** Set for messages that go to all clients. */
  alleKunden: boolean;
  /** The stored message, missing for entries derived from Drive. */
  news?: KundenNews;
}

/**
 * Ticker of one client: own and company-wide messages plus files that came into the client share recently.
 * Pinned messages first, then newest first. With `firmaId` null it is the ticker across all clients.
 */
export function ticker(
  news: readonly KundenNews[],
  firmaId: string | null,
  heute: string,
  neueDateien: readonly DriveFile[] = [],
  mitArchiv = false,
): TickerEintrag[] {
  const grenze = new Date(`${heute}T00:00:00`);
  grenze.setDate(grenze.getDate() - NEUE_DATEI_TAGE);
  const eintraege: TickerEintrag[] = news
    .filter((n) => (mitArchiv || !n.archiviert) && (firmaId === null || n.firma_id === firmaId || n.firma_id === ''))
    .map((n) => ({ id: n.id, datum: n.datum, art: n.art, titel: n.titel, text: n.text, angeheftet: n.angeheftet, alleKunden: n.firma_id === '', news: n }));
  for (const datei of neueDateien) {
    if (!datei.modifiedTime || new Date(datei.modifiedTime) < grenze) continue;
    eintraege.push({
      id: `datei-${datei.id}`,
      datum: datei.modifiedTime.slice(0, 10),
      art: 'datei',
      titel: `Neue Datei: ${datei.name}`,
      text: '',
      url: datei.webViewLink,
      angeheftet: false,
      alleKunden: false,
    });
  }
  return sortiereTicker(eintraege);
}

/** Pinned first, then newest first. */
export const sortiereTicker = (eintraege: TickerEintrag[]) =>
  eintraege.sort((a, b) => Number(b.angeheftet) - Number(a.angeheftet) || b.datum.localeCompare(a.datum) || a.titel.localeCompare(b.titel, 'de'));

/** Cards finished on the client board, as ticker entries linking to the board. */
export function erledigtAlsTicker(karten: readonly Pick<Aufgabe, 'id' | 'titel' | 'erledigt_am' | 'board_id'>[]): TickerEintrag[] {
  return karten.map((k) => ({
    id: `karte-${k.id}`,
    datum: k.erledigt_am.slice(0, 10),
    art: 'erledigt',
    titel: k.titel,
    text: '',
    angeheftet: false,
    alleKunden: false,
  }));
}

export interface HubWerkzeug {
  label: string;
  pfad: string;
}

/** Hub tools opened for this client: CRM file, offers, shop audit of their domain. */
export function hubWerkzeuge(firma: Firma): HubWerkzeug[] {
  const werkzeuge: HubWerkzeug[] = [{ label: 'CRM-Akte', pfad: `/crm/firmen/${firma.id}` }, { label: 'Neues Angebot', pfad: `/angebote/neu?firma=${encodeURIComponent(firma.id)}` }];
  if (firma.domain) werkzeuge.push({ label: 'Shop-Audit', pfad: `/audit/neu?domain=${encodeURIComponent(firma.domain)}` });
  return werkzeuge;
}

/** Subfolders of a client folder in template order (00_Account … 07_Client-Share), then loose files. */
export function ordnerReiter(inhalt: readonly DriveFile[], istOrdner: (f: DriveFile) => boolean): DriveFile[] {
  return inhalt.filter(istOrdner).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}
