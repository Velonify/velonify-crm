import { readdirSync, readFileSync } from 'node:fs';
import { load, type CheerioAPI } from 'cheerio';

/*
 * Technology detection with the fingerprints of webappanalyzer (maintained fork of the Wappalyzer data, GPL-3.0),
 * downloaded by scripts/lade-technik.mjs into ./technik. Only fingerprints that work on the raw HTML are used:
 * script URLs, inline scripts, HTML, meta tags, headers, cookies and CSS selectors. JavaScript globals ("js")
 * would need a real browser and are skipped.
 */

interface Muster {
  regex: RegExp;
  version: string;
  confidence: number;
}

interface DomRegel {
  selector: string;
  attributes: [string, Muster[]][];
  text: Muster[];
}

interface Fingerabdruck {
  name: string;
  cats: number[];
  website: string;
  scriptSrc: Muster[];
  scripts: Muster[];
  html: Muster[];
  url: Muster[];
  meta: [string, Muster[]][];
  headers: [string, Muster[]][];
  cookies: [string, Muster[]][];
  dom: DomRegel[];
  implies: string[];
  requires: string[];
  requiresCategory: number[];
  excludes: string[];
}

export interface Technologie {
  name: string;
  kategorien: string[];
  version: string;
  website: string;
}

export interface Katalog {
  technik: Fingerabdruck[];
  kategorien: Map<number, string>;
}

type Roh = Record<string, unknown>;
const liste = (wert: unknown): string[] => (wert === undefined || wert === null ? [] : Array.isArray(wert) ? wert.map(String) : [String(wert)]);

/** "regex\;version:\1\;confidence:50" → compiled pattern. Invalid regexes are dropped. */
export function muster(roh: string): Muster | null {
  const [quelle, ...zusatz] = roh.split('\\;');
  const m: Muster = { regex: /(?:)/, version: '', confidence: 100 };
  for (const teil of zusatz) {
    const [schluessel, ...rest] = teil.split(':');
    if (schluessel === 'version') m.version = rest.join(':');
    if (schluessel === 'confidence') m.confidence = Number(rest.join(':')) || 0;
  }
  try {
    // Wappalyzer treats every pattern as case-insensitive. Some sources escape "/", which JS tolerates.
    m.regex = new RegExp(quelle, 'i');
  } catch {
    return null;
  }
  return m;
}

const musterListe = (wert: unknown) => liste(wert).flatMap((s) => muster(s) ?? []);
const musterObjekt = (wert: unknown): [string, Muster[]][] =>
  wert && typeof wert === 'object' && !Array.isArray(wert) ? Object.entries(wert as Roh).map(([k, v]) => [k.toLowerCase(), musterListe(v)]) : [];

function domRegeln(wert: unknown): DomRegel[] {
  if (!wert) return [];
  if (typeof wert === 'string' || Array.isArray(wert)) return liste(wert).map((selector) => ({ selector, attributes: [], text: [] }));
  // Rules that only check runtime "properties" need a real browser and are dropped.
  return Object.entries(wert as Roh).flatMap(([selector, regel]) => {
    const r = (regel ?? {}) as Roh;
    const attributes = musterObjekt(r.attributes);
    const text = musterListe(r.text);
    return 'exists' in r || attributes.length > 0 || text.length > 0 ? [{ selector, attributes, text }] : [];
  });
}

/** Fingerprints too loose to trust, e.g. Onsen UI matches every script URL containing "onsen" – like "consentmanager". */
const UNZUVERLAESSIG = new Set(['Onsen UI']);

/** Builds the catalogue from the raw JSON files; exported for tests with small fixtures. */
export function baueKatalog(technologien: Record<string, Roh>, kategorien: Record<string, { name: string }>): Katalog {
  const technik = Object.entries(technologien).filter(([name]) => !UNZUVERLAESSIG.has(name)).map(([name, t]): Fingerabdruck => ({
    name,
    cats: (t.cats as number[] | undefined) ?? [],
    website: String(t.website ?? ''),
    scriptSrc: musterListe(t.scriptSrc),
    scripts: musterListe(t.scripts),
    html: musterListe(t.html),
    url: musterListe(t.url),
    meta: musterObjekt(t.meta),
    headers: musterObjekt(t.headers),
    cookies: musterObjekt(t.cookies),
    dom: domRegeln(t.dom),
    implies: liste(t.implies).map((s) => s.split('\\;')[0]),
    requires: liste(t.requires).map((s) => s.split('\\;')[0]),
    requiresCategory: liste(t.requiresCategory).map(Number),
    excludes: liste(t.excludes).map((s) => s.split('\\;')[0]),
  }));
  return { technik, kategorien: new Map(Object.entries(kategorien).map(([id, k]) => [Number(id), k.name])) };
}

let geladen: Katalog | null | undefined;

/** The downloaded catalogue, read once per instance. Null when ./technik is missing (detection is then skipped). */
export function katalog(): Katalog | null {
  if (geladen !== undefined) return geladen;
  try {
    const ordner = new URL('../technik/', import.meta.url);
    const technologien: Record<string, Roh> = {};
    for (const datei of readdirSync(ordner).filter((d) => /^[a-z_]\.json$/.test(d))) {
      Object.assign(technologien, JSON.parse(readFileSync(new URL(datei, ordner), 'utf8')));
    }
    geladen = baueKatalog(technologien, JSON.parse(readFileSync(new URL('categories.json', ordner), 'utf8')));
  } catch (error) {
    console.error('webappanalyzer-Daten fehlen', error instanceof Error ? error.message : error);
    geladen = null;
  }
  return geladen;
}

export interface Seitendaten {
  url: string;
  html: string;
  headers: Record<string, string>;
  /** name → value */
  cookies: Record<string, string>;
  /** Further script URLs, e.g. those PageSpeed saw being loaded. */
  skripte?: string[];
}

const MAX_HTML = 1_000_000;

interface Treffer {
  confidence: number;
  version: string;
}

function version(m: Muster, match: RegExpExecArray): string {
  if (!m.version) return '';
  // "\1" inserts a group; "\1?a:b" picks a or b depending on whether group 1 matched.
  return m.version
    .replace(/\\(\d)\?([^:]*):(.*)$/, (_, n: string, ja: string, nein: string) => (match[Number(n)] ? ja : nein))
    .replace(/\\(\d)/g, (_, n: string) => match[Number(n)] ?? '')
    .trim();
}

/** Matches one page against the catalogue. */
export function erkenneTechnik(seite: Seitendaten, kat: Katalog): Technologie[] {
  const html = seite.html.slice(0, MAX_HTML);
  let $: CheerioAPI | null = null;
  try {
    $ = load(html);
  } catch {
    $ = null;
  }
  const scriptSrc = [...new Set([...($ ? $('script[src]').map((_, el) => $!(el).attr('src') ?? '').get() : []), ...(seite.skripte ?? [])])];
  const inline = $ ? $('script:not([src])').map((_, el) => $!(el).text()).get().join('\n').slice(0, 500_000) : '';
  const meta = new Map<string, string>();
  if ($) {
    $('meta').each((_, el) => {
      const e = $!(el);
      const key = (e.attr('name') ?? e.attr('property') ?? e.attr('http-equiv') ?? '').toLowerCase();
      if (key) meta.set(key, e.attr('content') ?? '');
    });
  }
  const cookies = new Map(Object.entries(seite.cookies).map(([k, v]) => [k.toLowerCase(), v]));

  const gefunden = new Map<string, Treffer>();
  const treffer = (name: string, m: Muster, wert: string) => {
    const match = m.regex.exec(wert);
    if (!match) return;
    const bisher = gefunden.get(name) ?? { confidence: 0, version: '' };
    gefunden.set(name, { confidence: Math.min(100, bisher.confidence + m.confidence), version: bisher.version || version(m, match) });
  };
  const paare = (name: string, regeln: [string, Muster[]][], quelle: Map<string, string> | Record<string, string>) => {
    for (const [schluessel, liste] of regeln) {
      const wert = quelle instanceof Map ? quelle.get(schluessel) : quelle[schluessel];
      if (wert === undefined) continue;
      if (liste.length === 0) gefunden.set(name, { confidence: 100, version: gefunden.get(name)?.version ?? '' });
      for (const m of liste) treffer(name, m, wert);
    }
  };

  for (const t of kat.technik) {
    for (const m of t.scriptSrc) for (const src of scriptSrc) treffer(t.name, m, src);
    for (const m of t.scripts) treffer(t.name, m, inline);
    for (const m of t.html) treffer(t.name, m, html);
    for (const m of t.url) treffer(t.name, m, seite.url);
    paare(t.name, t.meta, meta);
    paare(t.name, t.headers, seite.headers);
    paare(t.name, t.cookies, cookies);
    if ($) {
      for (const regel of t.dom) {
        let elemente;
        try {
          elemente = $(regel.selector);
        } catch {
          continue; // selectors cheerio does not support
        }
        if (elemente.length === 0) continue;
        if (regel.attributes.length === 0 && regel.text.length === 0) {
          gefunden.set(t.name, { confidence: 100, version: gefunden.get(t.name)?.version ?? '' });
          continue;
        }
        elemente.slice(0, 20).each((_, el) => {
          const e = $!(el);
          for (const [attr, liste] of regel.attributes) {
            const wert = e.attr(attr);
            if (wert !== undefined) for (const m of liste) treffer(t.name, m, wert);
          }
          for (const m of regel.text) treffer(t.name, m, e.text());
        });
      }
    }
  }

  const nachName = new Map(kat.technik.map((t) => [t.name, t]));
  // Implied technologies (e.g. WooCommerce implies WordPress), transitively.
  const offen = [...gefunden.keys()];
  while (offen.length > 0) {
    const t = nachName.get(offen.pop()!);
    for (const impliziert of t?.implies ?? []) {
      if (!gefunden.has(impliziert) && nachName.has(impliziert)) {
        gefunden.set(impliziert, { confidence: 100, version: '' });
        offen.push(impliziert);
      }
    }
  }

  const sicher = [...gefunden].filter(([, t]) => t.confidence >= 50).map(([name]) => name);
  const vorhanden = new Set(sicher);
  const kategorienDa = new Set(sicher.flatMap((n) => nachName.get(n)?.cats ?? []));
  const ausgeschlossen = new Set(sicher.flatMap((n) => nachName.get(n)?.excludes ?? []));

  return sicher
    .filter((name) => {
      const t = nachName.get(name)!;
      return !ausgeschlossen.has(name) && t.requires.every((r) => vorhanden.has(r)) && (t.requiresCategory.length === 0 || t.requiresCategory.some((c) => kategorienDa.has(c)));
    })
    .map((name) => {
      const t = nachName.get(name)!;
      return { name, kategorien: t.cats.map((c) => kat.kategorien.get(c) ?? String(c)), version: gefunden.get(name)!.version, website: t.website };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Category ids used to complement our own rules. */
export const KATEGORIE = { ecommerce: 6, email: 75, consent: 67 } as const;

/** Mail delivery infrastructure in the "Email" category; not a marketing tool with signup forms or flows. */
export const VERSANDDIENSTE = new Set([
  'Amazon SES', 'Mailgun', 'Sendgrid', 'SparkPost', 'Google Workspace', 'Microsoft 365', 'Zoho Mail', 'Mailman', 'Hiver',
  'Open-Xchange App Suite', 'EmailJS', 'SmtpJS', 'Xverify', 'Clearout', 'INBOX', 'Genesys Cloud', 'DanDomain email',
]);
