import { VERNETZUNG_TAGE } from './constants';
import { istOffen } from './eingang';
import { meinTag, offeneDeals, tageSeitVernetzung } from './selectors';
import { faelligkeit, meineAufgaben } from './todos';
import type { Anfrage, Database, Erwaehnung, MagnetLead, TodoDaten } from './types';
import { istZustaendig } from './zustaendig';
import { kartenLink } from './erwaehnungen';

export type EingangArt = 'erwaehnung' | 'wiedervorlage' | 'schritt' | 'vernetzung' | 'karte' | 'anfrage' | 'magnet';

/** One thing that needs a decision today, from whichever tool it comes. */
export interface EingangEintrag {
  key: string;
  art: EingangArt;
  titel: string;
  unter: string;
  /** "überfällig", "heute", "neu" – drives the colour of the chip. */
  dringlichkeit: 'ueberfaellig' | 'heute' | 'neu';
  /** Sort key: overdue first (oldest first), then today, then new items (newest first). */
  sortierung: string;
  /** Short date text for the chip, e.g. "seit 3 Tagen", "heute", "19.10.". */
  wann: string;
  pfad: string;
  firmaId?: string;
  dealId?: string;
  /** Id of the source record, for the action (follow-up, card, mention). */
  quelleId: string;
}

export interface EingangQuellen {
  db: Database;
  erwaehnungen?: readonly Erwaehnung[];
  anfragen?: readonly Anfrage[];
  magnetLeads?: readonly MagnetLead[];
  todo?: TodoDaten;
}

export const ART_LABEL: Record<EingangArt, string> = {
  erwaehnung: 'Erwähnung',
  wiedervorlage: 'Wiedervorlage',
  schritt: 'Nächster Schritt',
  vernetzung: 'Vernetzung',
  karte: 'To-do',
  anfrage: 'Anfrage',
  magnet: 'Lead-Magnet',
};

const tagText = (tage: number) => (tage <= 0 ? 'heute' : tage === 1 ? 'seit gestern' : `seit ${tage} Tagen`);
const tageZwischenIso = (von: string, bis: string) => Math.round((Date.parse(bis) - Date.parse(von)) / 86_400_000);
const kurzDatum = (iso: string) => {
  const [, m, t] = iso.slice(0, 10).split('-');
  return t && m ? `${t}.${m}.` : iso;
};

/**
 * Collects everything that needs a decision today: overdue and due follow-ups and next steps, connection requests
 * without an answer after VERNETZUNG_TAGE days, due cards, unread mentions, open inquiries and new magnet leads.
 * `ich` limits personal items to one team member; with null everything is shown. `ausgeblendet` holds keys put off
 * until tomorrow.
 */
export function sammleEingang(quellen: EingangQuellen, ich: string | null, heute: string, ausgeblendet: ReadonlySet<string> = new Set()): EingangEintrag[] {
  const { db } = quellen;
  const eintraege: EingangEintrag[] = [];
  const firmen = new Map(db.firmen.map((f) => [f.id, f]));
  const firmaName = (id: string) => firmen.get(id)?.name ?? '';

  const tag = meinTag(db, ich, heute, 0);
  for (const a of [...tag.ueberfaellig, ...tag.heute]) {
    const ueber = a.faellig < heute;
    eintraege.push({
      key: `${a.art}:${a.key}`,
      art: a.art === 'wiedervorlage' ? 'wiedervorlage' : 'schritt',
      titel: a.titel,
      unter: [a.firma?.name, a.deal?.titel].filter(Boolean).join(' · '),
      dringlichkeit: ueber ? 'ueberfaellig' : 'heute',
      sortierung: `0${a.faellig}`,
      wann: ueber ? tagText(tageZwischenIso(a.faellig, heute)) : 'heute',
      pfad: a.firma ? `/crm/firmen/${a.firma.id}` : '/crm',
      firmaId: a.firma?.id,
      dealId: a.deal?.id,
      quelleId: a.art === 'wiedervorlage' ? a.wiedervorlage!.id : a.deal!.id,
    });
  }

  // Connection requests: after a week without an answer it is time to decide (follow up or let go).
  for (const d of offeneDeals(db.deals)) {
    if (d.phase !== 'vernetzung' || (ich && d.zustaendig && !istZustaendig(d.zustaendig, ich))) continue;
    const firma = firmen.get(d.firma_id);
    if (!firma || firma.archiviert) continue;
    const tage = tageSeitVernetzung(db.aktivitaeten, d.id, heute);
    if (tage === null || tage < VERNETZUNG_TAGE) continue;
    if (eintraege.some((e) => e.dealId === d.id && e.art === 'schritt')) continue;
    eintraege.push({
      key: `vernetzung:${d.id}`,
      art: 'vernetzung',
      titel: `${firma.name}: ${tage} Tage ohne Antwort`,
      unter: 'LinkedIn-Anfrage · nachfassen oder verwerfen',
      dringlichkeit: 'ueberfaellig',
      sortierung: `0${heute}`,
      wann: `seit ${tage} Tagen`,
      pfad: `/crm/firmen/${firma.id}`,
      firmaId: firma.id,
      dealId: d.id,
      quelleId: d.id,
    });
  }

  if (quellen.todo && ich) {
    const { boards } = quellen.todo;
    for (const k of meineAufgaben(quellen.todo.aufgaben, boards, ich)) {
      const f = faelligkeit(k, heute);
      if (f !== 'ueberfaellig' && f !== 'heute') continue;
      const board = boards.find((b) => b.id === k.board_id);
      eintraege.push({
        key: `karte:${k.id}`,
        art: 'karte',
        titel: k.titel,
        unter: board ? board.titel : 'To-do',
        dringlichkeit: f,
        sortierung: `0${k.faellig_am}`,
        wann: f === 'heute' ? 'heute' : tagText(tageZwischenIso(k.faellig_am, heute)),
        pfad: kartenLink(k.board_id, k.id),
        quelleId: k.id,
      });
    }
  }

  for (const e of quellen.erwaehnungen ?? []) {
    if (e.gelesen_am || (ich && e.person !== ich)) continue;
    eintraege.push({
      key: `erwaehnung:${e.id}`,
      art: 'erwaehnung',
      titel: e.titel,
      unter: e.auszug,
      dringlichkeit: 'neu',
      sortierung: `1${invert(e.datum)}`,
      wann: kurzDatum(e.datum),
      pfad: e.link,
      firmaId: e.firma_id || undefined,
      quelleId: e.id,
    });
  }

  for (const a of quellen.anfragen ?? []) {
    if (!istOffen(a)) continue;
    eintraege.push({
      key: `anfrage:${a.id}`,
      art: 'anfrage',
      titel: `Anfrage von ${a.name || a.email}`,
      unter: [a.shop, a.themen].filter(Boolean).join(' · ') || a.nachricht.slice(0, 120),
      dringlichkeit: 'neu',
      sortierung: `1${invert(a.eingegangen_am)}`,
      wann: kurzDatum(a.eingegangen_am),
      pfad: '/anfragen',
      quelleId: a.id,
    });
  }

  for (const l of quellen.magnetLeads ?? []) {
    if (l.status && l.status !== 'neu') continue;
    eintraege.push({
      key: `magnet:${l.id}`,
      art: 'magnet',
      titel: `${l.vorname || l.email} hat „${l.magnet}“ geladen`,
      unter: [l.shop, l.shopsystem].filter(Boolean).join(' · ') || l.email,
      dringlichkeit: 'neu',
      sortierung: `1${invert(l.eingegangen_am)}`,
      wann: kurzDatum(l.eingegangen_am),
      pfad: '/magnete',
      firmaId: l.firma_id || undefined,
      quelleId: l.id,
    });
  }

  for (const e of eintraege) if (e.firmaId && !e.unter) e.unter = firmaName(e.firmaId);
  return eintraege.filter((e) => !ausgeblendet.has(e.key)).sort((a, b) => a.sortierung.localeCompare(b.sortierung) || a.titel.localeCompare(b.titel, 'de'));
}

/** Newest first within the "new" group, with plain string sorting. */
function invert(iso: string): string {
  return iso.replace(/\d/g, (z) => String(9 - Number(z)));
}
