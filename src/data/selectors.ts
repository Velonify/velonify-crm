import { EINSTELLUNG, isAbgeschlossen, istVernetzungVermerk, phaseIndex, STANDARD_WAHRSCHEINLICHKEIT, type Phase } from './constants';
import { addDays, isoDate, tageZwischen } from './ids';
import type { Aktivitaet, Database, Deal, Einstellungen, Firma, Wiedervorlage } from './types';

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export const offeneDeals = (deals: readonly Deal[]) => deals.filter((d) => !d.archiviert && !isAbgeschlossen(d.phase));

/** The most advanced open deal phase of a firm; "gewonnen"/"verloren" only if nothing is open. */
export function fortschritt(deals: readonly Deal[]): string {
  const aktive = deals.filter((d) => !d.archiviert);
  const offen = offeneDeals(aktive);
  if (offen.length > 0) return offen.reduce((best, d) => (phaseIndex(d.phase) > phaseIndex(best.phase) ? d : best)).phase;
  if (aktive.some((d) => d.phase === 'gewonnen')) return 'gewonnen';
  if (aktive.some((d) => d.phase === 'verloren')) return 'verloren';
  return '';
}

export const wahrscheinlichkeit = (deal: Deal) => deal.wahrscheinlichkeit ?? STANDARD_WAHRSCHEINLICHKEIT[deal.phase as Phase] ?? 0;

export interface Kennzahlen {
  offen: number;
  pipelineWert: number;
  gewichtet: number;
  angebotWert: number;
  gewonnenMonat: number;
  gewonnenMonatWert: number;
}

export function kennzahlen(deals: readonly Deal[], heute: string): Kennzahlen {
  const offen = offeneDeals(deals);
  const monat = heute.slice(0, 7);
  const gewonnen = deals.filter((d) => !d.archiviert && d.phase === 'gewonnen' && d.abgeschlossen_am.startsWith(monat));
  return {
    offen: offen.length,
    pipelineWert: offen.reduce((sum, d) => sum + (d.wert_eur ?? 0), 0),
    gewichtet: offen.reduce((sum, d) => sum + ((d.wert_eur ?? 0) * wahrscheinlichkeit(d)) / 100, 0),
    angebotWert: offen.filter((d) => d.phase === 'angebot').reduce((sum, d) => sum + (d.wert_eur ?? 0), 0),
    gewonnenMonat: gewonnen.length,
    gewonnenMonatWert: gewonnen.reduce((sum, d) => sum + (d.wert_eur ?? 0), 0),
  };
}

export interface Aufgabe {
  key: string;
  art: 'wiedervorlage' | 'deal';
  titel: string;
  faellig: string;
  zustaendig: string;
  firma?: Firma;
  deal?: Deal;
  wiedervorlage?: Wiedervorlage;
}

export interface MeinTag {
  ueberfaellig: Aufgabe[];
  heute: Aufgabe[];
  naechsteTage: Aufgabe[];
  ohneNaechstenSchritt: Deal[];
}

/**
 * Open follow-ups and deal next steps, grouped by due date. `ich` limits everything to one team member;
 * items without anyone assigned are shown to everybody so they are not forgotten.
 */
export function meinTag(db: Database, ich: string | null, heute: string, tage = 7): MeinTag {
  const firmen = indexById(db.firmen);
  const deals = indexById(db.deals);
  const meins = (zustaendig: string) => !ich || !zustaendig || zustaendig === ich;
  const aktiveFirma = (id: string) => {
    const firma = firmen.get(id);
    return firma && !firma.archiviert ? firma : undefined;
  };

  const aufgaben: Aufgabe[] = [];
  for (const w of db.wiedervorlagen) {
    if (w.erledigt_am || !meins(w.zustaendig)) continue;
    const firma = aktiveFirma(w.firma_id);
    if (w.firma_id && !firma) continue;
    aufgaben.push({ key: w.id, art: 'wiedervorlage', titel: w.titel, faellig: w.faellig_am, zustaendig: w.zustaendig, firma, deal: deals.get(w.deal_id), wiedervorlage: w });
  }
  for (const d of offeneDeals(db.deals)) {
    if (!d.naechster_schritt_am || !meins(d.zustaendig)) continue;
    const firma = aktiveFirma(d.firma_id);
    if (!firma) continue;
    aufgaben.push({ key: d.id, art: 'deal', titel: d.naechster_schritt || 'Nächster Schritt', faellig: d.naechster_schritt_am, zustaendig: d.zustaendig, firma, deal: d });
  }
  aufgaben.sort((a, b) => a.faellig.localeCompare(b.faellig) || a.titel.localeCompare(b.titel, 'de'));

  const bis = addDays(heute, tage);
  return {
    ueberfaellig: aufgaben.filter((a) => a.faellig < heute),
    heute: aufgaben.filter((a) => a.faellig === heute),
    naechsteTage: aufgaben.filter((a) => a.faellig > heute && a.faellig <= bis),
    ohneNaechstenSchritt: offeneDeals(db.deals).filter(
      (d) => meins(d.zustaendig) && !d.naechster_schritt_am && aktiveFirma(d.firma_id),
    ),
  };
}

/** Finds the team entry for the signed-in person: "Julian" matches "Julian Muster" or "julian@velonify.de". */
export function findeTeamMitglied(team: readonly string[], name: string, email: string): string | null {
  const kandidaten = [name.split(/\s+/)[0], email.split('@')[0].split(/[._-]/)[0]].map((s) => s.toLowerCase()).filter(Boolean);
  return team.find((mitglied) => kandidaten.includes(mitglied.toLowerCase())) ?? null;
}

export interface DriveKonfiguration {
  leads: string;
  clients: string;
  vorlage: string;
}

export function driveKonfiguration(einstellungen: Einstellungen): DriveKonfiguration | null {
  const leads = einstellungen[EINSTELLUNG.leadsOrdner] ?? '';
  const clients = einstellungen[EINSTELLUNG.clientsOrdner] ?? '';
  if (!leads || !clients) return null;
  return { leads, clients, vorlage: einstellungen[EINSTELLUNG.vorlageOrdner] ?? '' };
}

/** Days since the newest LinkedIn connection request of a deal, or null when none is in the Verlauf. */
export function tageSeitVernetzung(aktivitaeten: readonly Aktivitaet[], dealId: string, heute: string): number | null {
  let neueste = '';
  for (const a of aktivitaeten) {
    if (a.deal_id === dealId && istVernetzungVermerk(a.text) && a.datum > neueste) neueste = a.datum;
  }
  if (!neueste) return null;
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(neueste) ? neueste : isoDate(new Date(neueste));
  return tageZwischen(tag, heute);
}
