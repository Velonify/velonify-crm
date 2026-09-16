import { normalizeDomain, normalizeFirmenname } from './rules';
import type { Firma, FirmaInput } from './types';

export type DublettenFelder = Pick<FirmaInput, 'name' | 'domain' | 'ust_id' | 'register' | 'email_allgemein'> & { id?: string };

export interface DublettenTreffer {
  firma: Firma;
  gruende: string[];
}

// Shared mailboxes say nothing about the company behind them.
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 't-online.de', 'outlook.com', 'outlook.de',
  'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'aol.com', 'freenet.de',
  'posteo.de', 'mail.de', 'proton.me', 'protonmail.com', 'bluewin.ch', 'aon.at',
]);

const GRUND = {
  ust: 'gleiche USt-ID',
  register: 'gleiche Handelsregisternummer',
  name: 'gleicher Name',
  domain: 'gleiche E-Mail-/Web-Domain',
} as const;

interface Schluessel {
  key: string;
  grund: string;
  /** Registry court, when known – the same HRB number at two different courts is two companies. */
  gericht?: string;
}

function registerTeile(register: string): { nummer: string; gericht: string } | null {
  const match = register.match(/\b(HR\s?[AB])\s*[-.:]?\s*(\d{2,7})/i);
  if (!match) return null;
  const gericht = register
    .replace(match[0], '')
    .replace(/amtsgericht|\bAG\b|registergericht|[()[\],:]/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return { nummer: `${match[1].replace(/\s/g, '').toUpperCase()} ${match[2]}`, gericht };
}

function schluessel(f: DublettenFelder): Schluessel[] {
  const result: Schluessel[] = [];
  const ust = f.ust_id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ust.length >= 8) result.push({ key: `ust:${ust}`, grund: GRUND.ust });

  const register = registerTeile(f.register);
  if (register) result.push({ key: `reg:${register.nummer}`, grund: GRUND.register, gericht: register.gericht });

  const domain = normalizeDomain(f.domain);
  const name = normalizeFirmenname(f.name);
  // Names that are only the domain (import fallback) say nothing beyond the domain itself.
  if (name.length >= 4 && name !== normalizeFirmenname(domain)) result.push({ key: `name:${name}`, grund: GRUND.name });

  const mailDomain = normalizeDomain(f.email_allgemein.split('@')[1] ?? '');
  for (const d of new Set([domain, mailDomain])) {
    if (d && !FREEMAIL.has(d)) result.push({ key: `dom:${d}`, grund: GRUND.domain });
  }
  return result;
}

const gerichteVertraeglich = (a?: string, b?: string) => !a || !b || a === b;

function vergleiche(a: Schluessel[], b: Schluessel[]): string[] {
  const gruende = new Set<string>();
  for (const x of a) {
    const y = b.find((s) => s.key === x.key);
    if (y && (x.grund !== GRUND.register || gerichteVertraeglich(x.gericht, y.gericht))) gruende.add(x.grund);
  }
  return [...gruende];
}

/** Firms that look like the same company as `ziel` – for warnings before saving or importing. */
export function findeDubletten(ziel: DublettenFelder, alle: readonly Firma[]): DublettenTreffer[] {
  const eigene = schluessel(ziel);
  if (eigene.length === 0) return [];
  return alle
    .filter((f) => f.id !== ziel.id)
    .map((firma) => ({ firma, gruende: vergleiche(eigene, schluessel(firma)) }))
    .filter((t) => t.gruende.length > 0)
    .sort((a, b) => Number(a.firma.archiviert) - Number(b.firma.archiviert) || b.gruende.length - a.gruende.length);
}

/** Possible duplicates for every active firm, among the other active firms. */
export function dublettenIndex(alle: readonly Firma[]): Map<string, DublettenTreffer[]> {
  const aktive = alle.filter((f) => !f.archiviert);
  const schluesselJeFirma = new Map(aktive.map((f) => [f.id, schluessel(f)]));
  const nachKey = new Map<string, Firma[]>();
  for (const f of aktive) {
    for (const s of schluesselJeFirma.get(f.id)!) (nachKey.get(s.key) ?? nachKey.set(s.key, []).get(s.key)!).push(f);
  }

  const index = new Map<string, DublettenTreffer[]>();
  for (const f of aktive) {
    const kandidaten = new Set<Firma>();
    for (const s of schluesselJeFirma.get(f.id)!) for (const k of nachKey.get(s.key) ?? []) if (k.id !== f.id) kandidaten.add(k);
    const treffer = [...kandidaten]
      .map((firma) => ({ firma, gruende: vergleiche(schluesselJeFirma.get(f.id)!, schluesselJeFirma.get(firma.id)!) }))
      .filter((t) => t.gruende.length > 0);
    if (treffer.length > 0) index.set(f.id, treffer);
  }
  return index;
}

export const dublettenText = (treffer: DublettenTreffer) =>
  `${treffer.firma.name}${treffer.firma.domain ? ` (${treffer.firma.domain})` : ''}: ${treffer.gruende.join(', ')}`;
