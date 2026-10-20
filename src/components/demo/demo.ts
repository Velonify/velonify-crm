/**
 * Shared bits of the public demo that the hub's own pages may touch without loading the demo code: the roles to
 * start as, the tour steps and the event that opens the client view.
 */
import { DEMO_TEAM, type DemoPerson } from '../../data/demo/agentur';
import { DEMO_EINSTELLUNGEN } from '../../data/demo/speicher';

export interface DemoRolle {
  id: 'gf' | 'pl' | 'vertrieb';
  titel: string;
  person: DemoPerson;
  text: string;
  /** Where this role starts. */
  start: string;
}

const person = (name: string) => DEMO_TEAM.find((p) => p.name === name)!;

export const ROLLEN: DemoRolle[] = [
  { id: 'gf', titel: 'Geschäftsführung', person: person('Lena'), text: 'Pipeline, Umsatz und Auslastung im Blick. Was heute ansteht, für die ganze Agentur.', start: '/' },
  { id: 'pl', titel: 'Projektleitung', person: person('Tim'), text: 'Kunden, Boards, Freigaben und Monatsberichte. Und was der Kunde im Portal sieht.', start: '/kunden' },
  { id: 'vertrieb', titel: 'Vertrieb', person: person('Aylin'), text: 'Leads finden, Shops prüfen, anschreiben und Angebote schreiben.', start: '/crm' },
];

export function gemerkt(schluessel: string): string | null {
  try {
    return localStorage.getItem(schluessel);
  } catch {
    return null;
  }
}

export function merke(schluessel: string, wert: string): void {
  try {
    localStorage.setItem(schluessel, wert);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

/** Whether the visitor picked a role already (then the welcome does not come back). */
export const rolleGewaehlt = () => !!gemerkt(DEMO_EINSTELLUNGEN.rolle);

const KUNDENANSICHT = 'velonify-demo:kundenansicht';

export interface KundenansichtZiel {
  /** Without a firm: the demo's main client. */
  firmaId: string | null;
  /** The portal page to open on. */
  reiter?: 'start' | 'projekt' | 'berichte' | 'dateien';
}

/** Opens the client portal of a firm as its client sees it ("Als Kunde ansehen"). */
export function oeffneKundenansicht(firmaId?: string, reiter?: KundenansichtZiel['reiter']): void {
  window.dispatchEvent(new CustomEvent<KundenansichtZiel>(KUNDENANSICHT, { detail: { firmaId: firmaId ?? null, reiter } }));
}

export function beiKundenansicht(fn: (ziel: KundenansichtZiel) => void): () => void {
  const hoerer = (e: Event) => fn((e as CustomEvent<KundenansichtZiel>).detail);
  window.addEventListener(KUNDENANSICHT, hoerer);
  return () => window.removeEventListener(KUNDENANSICHT, hoerer);
}

/** The demo's main client, whose portal the tour shows. */
export const HAUPTKUNDE = 'Alpenglanz Kosmetik AG';
