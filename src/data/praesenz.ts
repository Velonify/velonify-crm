/**
 * Who is in the hub right now and where: every open tab reports its page (and the card, company or client it has open)
 * every few seconds; crm-api keeps the reports in memory and answers with everyone else's. Nothing is stored in the
 * database, after a restart the list is simply empty until the next heartbeat.
 */

export type PraesenzArt = 'karte' | 'firma' | 'kunde';

/** The record a tab has open, e.g. a card dialog. */
export interface PraesenzObjekt {
  art: PraesenzArt;
  id: string;
  titel: string;
}

export interface PraesenzMeldung {
  /** Random id per browser tab, so two tabs of one person do not overwrite each other. */
  tab: string;
  /** Hub path, e.g. "/todo/B-1". */
  pfad: string;
  /** Readable name of the page, e.g. "To-Dos · Velonify intern". */
  bereich: string;
  objekt: PraesenzObjekt | null;
}

export interface Anwesend {
  email: string;
  /** Team name from crm-api's TEAM_ZUORDNUNG, when the address alone does not tell it (lukas@ → "Lugge"). */
  name?: string;
  pfad: string;
  bereich: string;
  objekt: PraesenzObjekt | null;
  /** ISO time of the last heartbeat. */
  zuletzt: string;
}

/** Visible tabs report this often; a report older than ABGELAUFEN_MS counts as gone (closed laptop, lost connection). */
export const HERZSCHLAG_MS = 20_000;
export const ABGELAUFEN_MS = 70_000;

const ARTEN: readonly PraesenzArt[] = ['karte', 'firma', 'kunde'];
const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const text = (wert: unknown, max: number): string | null => (typeof wert === 'string' && wert.length <= max ? wert : null);

/** Checks a report from the browser: a heartbeat, or `{ tab, weg: true }` when the tab is hidden or closed. */
export function pruefeMeldung(body: unknown): PraesenzMeldung | { tab: string; weg: true } | null {
  if (!istObjekt(body)) return null;
  const tab = text(body.tab, 64);
  if (!tab) return null;
  if (body.weg === true) return { tab, weg: true };
  const pfad = text(body.pfad, 300);
  const bereich = text(body.bereich, 120);
  if (pfad === null || !pfad.startsWith('/') || bereich === null) return null;
  let objekt: PraesenzObjekt | null = null;
  if (body.objekt != null) {
    const o = body.objekt;
    if (!istObjekt(o) || !ARTEN.includes(o.art as PraesenzArt)) return null;
    const id = text(o.id, 80);
    const titel = text(o.titel, 200);
    if (!id || titel === null) return null;
    objekt = { art: o.art as PraesenzArt, id, titel };
  }
  return { tab, pfad, bereich, objekt };
}

/** The reports of all open tabs, in memory of the one crm-api instance (it runs with --max-instances=1). */
export class PraesenzRaum {
  private readonly tabs = new Map<string, { email: string; meldung: PraesenzMeldung; zuletzt: number }>();

  melde(email: string, meldung: PraesenzMeldung, jetzt = Date.now()): void {
    this.tabs.set(`${email}\n${meldung.tab}`, { email, meldung, zuletzt: jetzt });
  }

  weg(email: string, tab: string): void {
    this.tabs.delete(`${email}\n${tab}`);
  }

  /** Everyone except `ausser`, one entry per person: their most recently active tab. */
  anwesende(ausser: string, jetzt = Date.now()): Anwesend[] {
    const jePerson = new Map<string, Anwesend & { ms: number }>();
    for (const [schluessel, t] of this.tabs) {
      if (jetzt - t.zuletzt > ABGELAUFEN_MS) {
        this.tabs.delete(schluessel);
        continue;
      }
      if (t.email === ausser) continue;
      const bisher = jePerson.get(t.email);
      // A tab with an open record beats one that only shows a page, otherwise the newer report wins.
      const besser = !bisher || (Boolean(t.meldung.objekt) && !bisher.objekt) || (Boolean(t.meldung.objekt) === Boolean(bisher.objekt) && t.zuletzt > bisher.ms);
      if (besser) {
        const { pfad, bereich, objekt } = t.meldung;
        jePerson.set(t.email, { email: t.email, pfad, bereich, objekt, zuletzt: new Date(t.zuletzt).toISOString(), ms: t.zuletzt });
      }
    }
    return [...jePerson.values()].map(({ ms: _ms, ...a }) => a).sort((a, b) => a.email.localeCompare(b.email));
  }
}

/** The others who have the same record open. */
export function andereBei(anwesende: readonly Anwesend[], art: PraesenzArt, id: string | undefined): Anwesend[] {
  return id ? anwesende.filter((a) => a.objekt?.art === art && a.objekt.id === id) : [];
}

const ART_TEXT: Record<PraesenzArt, string> = { karte: 'Karte', firma: 'Firma', kunde: 'Kunde' };

/** Where someone is, in one line: "Karte „Startseite“" or the page name. */
export function ortText(a: Pick<Anwesend, 'bereich' | 'objekt'>): string {
  return a.objekt ? `${ART_TEXT[a.objekt.art]} „${a.objekt.titel}“` : a.bereich;
}

/** Link to the place someone is: card dialogs open through "?karte=" on their board. */
export function ortLink(a: Pick<Anwesend, 'pfad' | 'objekt'>): string {
  return a.objekt?.art === 'karte' ? `${a.pfad}?karte=${encodeURIComponent(a.objekt.id)}` : a.pfad;
}
