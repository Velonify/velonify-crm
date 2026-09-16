import { phaseLabel } from './constants';
import { kontaktName } from './rules';
import type { Database } from './types';

export type TrefferArt = 'firma' | 'kontakt' | 'deal';

export interface Treffer {
  art: TrefferArt;
  id: string;
  firmaId: string;
  titel: string;
  details: string;
  archiviert: boolean;
  score: number;
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
