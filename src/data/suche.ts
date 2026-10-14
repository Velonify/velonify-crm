import { phaseLabel } from './constants';
import { kontaktName } from './rules';
import type { Database } from './types';

export type TrefferArt = 'firma' | 'kontakt' | 'deal' | 'aktion' | 'werkzeug';

export interface Treffer {
  art: TrefferArt;
  id: string;
  firmaId: string;
  titel: string;
  details: string;
  archiviert: boolean;
  score: number;
  /** Where the hit leads; firms, contacts and deals open the firm file. */
  pfad?: string;
}

/** Things to do from the command palette, found by name or by one of the extra words. */
export const AKTIONEN: { titel: string; pfad: string; woerter: string }[] = [
  { titel: 'Neue Firma anlegen', pfad: '/crm/firmen/neu', woerter: 'lead firma neu anlegen' },
  { titel: 'Lead aus LinkedIn', pfad: '/crm/linkedin', woerter: 'linkedin profil lead' },
  { titel: 'Neues Angebot', pfad: '/angebote/neu', woerter: 'angebot kalkulation pdf' },
  { titel: 'Anschreiben erstellen', pfad: '/contact', woerter: 'nachricht mail linkedin instagram contact' },
  { titel: 'Shop prüfen', pfad: '/audit/neu', woerter: 'audit domain shop check' },
  { titel: 'Meine Aufgaben', pfad: '/todo/meine', woerter: 'todo karten aufgaben' },
  { titel: 'Mein Tag', pfad: '/crm', woerter: 'heute wiedervorlagen fällig' },
  { titel: 'Pipeline', pfad: '/crm/pipeline', woerter: 'deals phasen' },
  { titel: 'Kalender', pfad: '/kalender', woerter: 'termine meet' },
  { titel: 'Einrichtung', pfad: '/einrichtung', woerter: 'setup einstellungen tabs' },
];

/** Actions and tools for the palette; with an empty query all of them, so the palette is useful before typing. */
export function befehle(eingabe: string, werkzeuge: readonly { id: string; name: string; beschreibung: string; pfad?: string }[]): Treffer[] {
  const woerter = normalisiere(eingabe).split(/\s+/).filter(Boolean);
  const passt = (text: string) => woerter.every((w) => normalisiere(text).includes(w));
  const aktionen = AKTIONEN.filter((a) => passt(`${a.titel} ${a.woerter}`)).map((a, i) => ({
    art: 'aktion' as const, id: `aktion-${i}`, firmaId: '', titel: a.titel, details: '', archiviert: false, score: 1, pfad: a.pfad,
  }));
  const tools = werkzeuge
    .filter((w) => w.pfad && passt(`${w.name} ${w.beschreibung}`))
    .map((w) => ({ art: 'werkzeug' as const, id: `werkzeug-${w.id}`, firmaId: '', titel: w.name, details: w.beschreibung, archiviert: false, score: 1, pfad: w.pfad }));
  return woerter.length === 0 ? [...aktionen.slice(0, 6), ...tools] : [...aktionen, ...tools];
}

/**
 * Brings query and data to one spelling: lowercase, no accents, umlauts folded to the base vowel –
 * so "münchen", "muenchen" and "munchen" are the same word.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every query word must appear in one of the fields. Matches at the start of the main field rank highest,
 * then at a word start in it, then anywhere in it, then in another field.
 */
function bewerte(woerter: string[], haupt: string, weitere: string[]): number {
  const h = normalisiere(haupt);
  const rest = weitere.map(normalisiere);
  let score = 0;
  for (const wort of woerter) {
    if (h.startsWith(wort)) score += 30;
    else if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(wort)}`).test(h)) score += 20;
    else if (h.includes(wort)) score += 10;
    else if (rest.some((feld) => feld.includes(wort))) score += 5;
    else return 0;
  }
  return score;
}

export function suche(db: Database, eingabe: string, limitProArt = 6): Treffer[] {
  const woerter = normalisiere(eingabe).split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];
  const firmen = new Map(db.firmen.map((f) => [f.id, f]));
  const treffer: Treffer[] = [];

  for (const f of db.firmen) {
    const score = bewerte(woerter, f.name, [f.domain, f.kuerzel, f.ort, f.quelle, f.email_allgemein, f.telefon_allgemein]);
    if (score > 0) {
      treffer.push({
        art: 'firma', id: f.id, firmaId: f.id, titel: f.name,
        details: [f.kuerzel, f.domain, f.ort].filter(Boolean).join(' · '),
        archiviert: f.archiviert,
        // Exact Kürzel match ("SB") beats everything.
        score: score + (normalisiere(f.kuerzel) === woerter.join(' ') ? 100 : 0),
      });
    }
  }

  for (const k of db.kontakte) {
    const firma = firmen.get(k.firma_id);
    const name = kontaktName(k);
    const score = bewerte(woerter, name, [k.email, k.telefon, k.rolle, firma?.name ?? '']);
    if (score > 0) {
      treffer.push({
        art: 'kontakt', id: k.id, firmaId: k.firma_id, titel: name,
        details: [k.rolle, firma?.name, k.email].filter(Boolean).join(' · '),
        archiviert: k.archiviert || Boolean(firma?.archiviert),
        score,
      });
    }
  }

  for (const d of db.deals) {
    const firma = firmen.get(d.firma_id);
    const score = bewerte(woerter, d.titel, [firma?.name ?? '', d.naechster_schritt]);
    if (score > 0) {
      treffer.push({
        art: 'deal', id: d.id, firmaId: d.firma_id, titel: d.titel,
        details: [firma?.name, phaseLabel(d.phase)].filter(Boolean).join(' · '),
        archiviert: d.archiviert || Boolean(firma?.archiviert),
        score,
      });
    }
  }

  const sortiert = treffer.sort(
    (a, b) => Number(a.archiviert) - Number(b.archiviert) || b.score - a.score || a.titel.localeCompare(b.titel, 'de'),
  );
  const proArt = new Map<TrefferArt, number>();
  return sortiert.filter((t) => {
    const n = (proArt.get(t.art) ?? 0) + 1;
    proArt.set(t.art, n);
    return n <= limitProArt;
  });
}
