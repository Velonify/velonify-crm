import type { Seite } from '../laden.js';

/*
 * The Impressum (§ 5 DDG) is the cheapest hard proof of a real German company: name, legal form, address,
 * register number and VAT ID have to be published. Ported from the lead qualifier (impressum.py) with two fixes:
 * the operator block is preferred over lines naming the web agency or a service provider, and phone numbers
 * only come from tel: links or labelled lines, never from any digit run in the text.
 */

export interface Firma {
  gefunden: boolean;
  url: string;
  name: string;
  rechtsform: string;
  register: string;
  registergericht: string;
  ust_id: string;
  geschaeftsfuehrer: string[];
  strasse: string;
  plz: string;
  ort: string;
  /** DE, AT, CH or '' when unclear. */
  land: string;
  offshore: boolean;
  email: string;
  telefon: string;
}

export const leereFirma = (): Firma => ({
  gefunden: false, url: '', name: '', rechtsform: '', register: '', registergericht: '', ust_id: '', geschaeftsfuehrer: [],
  strasse: '', plz: '', ort: '', land: '', offshore: false, email: '', telefon: '',
});

const LINK_ZIEL = /impressum|imprint|legal-notice|anbieterkennzeichnung|rechtliche-hinweise/i;
const LINK_TEXT = /^\s*(impressum|imprint|anbieterkennzeichnung|rechtliche hinweise)\s*$/i;
const FALLBACK_PFADE = ['/impressum', '/impressum/', '/impressum.html', '/de/impressum'];
const IST_IMPRESSUM = /impressum|imprint|angaben\s+gem(?:ä|ae|a)(?:ß|ss)|anbieterkennzeichnung|§\s*5\s*(?:tmg|ddg)/i;

/** Links to the Impressum on the homepage, by URL or by link text. At most three, in page order. */
export function impressumLinks(home: Seite): string[] {
  const links: string[] = [];
  for (const m of home.text.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = /href=["']([^"'#]+)["']/i.exec(m[1])?.[1];
    if (!href || /^(mailto|tel|javascript):/i.test(href)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    if (!LINK_ZIEL.test(href) && !LINK_TEXT.test(text)) continue;
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), home.url).toString();
      if (!links.includes(url)) links.push(url);
    } catch {
      /* ignore broken hrefs */
    }
    if (links.length >= 3) break;
  }
  return links;
}

/** Loads the Impressum: the shop's own link first, then common paths. At most four requests. */
export async function ladeImpressum(home: Seite, laden: (url: string) => Promise<Seite>): Promise<Seite | null> {
  const origin = new URL(home.url).origin;
  const kandidaten = [...impressumLinks(home), ...FALLBACK_PFADE.map((p) => origin + p)];
  const gesehen = new Set<string>();
  for (const url of kandidaten) {
    if (gesehen.has(url) || gesehen.size >= 4) continue;
    gesehen.add(url);
    const seite = await laden(url);
    if (seite.ok && seite.text.length > 500 && IST_IMPRESSUM.test(seite.text)) return seite;
  }
  return null;
}

const ENTITAETEN: Record<string, string> = {
  amp: '&', nbsp: ' ', szlig: 'ß', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', quot: '"', apos: "'",
  sect: '§', copy: '©', euro: '€', middot: '·', bull: '•', ndash: '–', mdash: '—', lt: '<', gt: '>', eacute: 'é',
};

export function entitaeten(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (ganz, name: string) => ENTITAETEN[name] ?? ganz);
}

const BLOCK = '(?:br|p|div|li|tr|td|th|h[1-6]|section|article|address|table|ul|ol|dt|dd|header|footer)';

/** Tags become line breaks, not spaces: Impressum fields are line-based. */
export function textAus(html: string): string {
  let t = html.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(new RegExp(`</?${BLOCK}\\b[^>]*>`, 'gi'), '\n').replace(/<[^>]+>/g, ' ');
  t = entitaeten(t).replace(/[ \t ​]+/g, ' ');
  return t.split('\n').map((z) => z.trim()).filter(Boolean).join('\n');
}

/** Legal forms, most specific first. */
const RECHTSFORMEN: [string, RegExp][] = [
  ['GmbH & Co. KG', /gmbh\s*(?:&|und|u\.)\s*co\.?\s*kg/i],
  ['AG & Co. KG', /\bag\s*(?:&|und|u\.)\s*co\.?\s*kg/i],
  ['UG & Co. KG', /\bug\s*\(haftungsbeschr[äa]nkt\)\s*(?:&|und)\s*co\.?\s*kg/i],
  ['SE', /\bSE\b/],
  ['AG', /\bAG\b/],
  ['GmbH', /\bgmbh\b/i],
  ['UG', /\bug\s*\(haftungsbeschr/i],
  ['e.K.', /\be\.\s?(?:k|kfm|kfr)\.(?=\s|$|,|\))/i],
  ['OHG', /\bohg\b/i],
  ['KG', /\bKG\b/],
  ['GbR', /\bgbr\b/i],
];

/** Lines about whoever built or hosts the site, dispute resolution and the like; the lines after them belong to that block. */
// Specific phrases only: "Fachmarkt für Raumgestaltung KG" is an operator, "Gestaltung:" is a credit.
const FREMDER_BLOCK = /realisiert (?:durch|von)|umgesetzt (?:durch|von)|(?:technische )?umsetzung(?: und [a-zä]+)?\s*:|webdesign|web-design|programmierung\s*:|konzeption(?: und [a-zä]+)?\s*:|gestaltung\s*:|(?:design|gestaltet|entwickelt|erstellt|programmiert) (?:by|von|durch)|made by|powered by|hosting|gehostet|händlerbund|trusted shops|bildnachweis|bildquellen|fotos?\s*:|fotografie\s*:|(?:internet|werbe|web|digital|design|kreativ)agentur|streitschlichtung|os-plattform|verbraucherstreit|datenschutzbeauftragt/i;
/** Headings that announce the operator. Only short lines count: "Betreiber" also appears in liability disclaimers. */
const BETREIBER_ANKER = /^(?:impressum\b.{0,40}|.{0,20}angaben\s+(?:gem(?:ä|ae|a)(?:ß|ss)|nach).*|.{0,20}anbieter(?:kennzeichnung)?\b.*|.{0,20}betreiber\b.*|diensteanbieter.*|herausgeber.*|inhaber(?:in)?\b.*|verantwortlich für den (?:shop)?betrieb.*|anschrift\s*:?)$/i;
const IST_ANKER = (z: string) => z.length <= 70 && BETREIBER_ANKER.test(z);

/** "12345 Musterstadt", "D-12345 Musterstadt", "Lange Str. 1, 12345 Musterstadt", "… · 12345 Musterstadt" */
const PLZ_ORT = /(?:^|[ \t,·|•–])(?:DE?-?[ \t]?)?(\d{5})[ \t]+([A-ZÄÖÜ][\wäöüß.\-/ ]{1,40}?)(?=[ \t]*(?:[,(·|•]|$))/;

/** Drops blocks about agencies, hosting, photo credits and dispute resolution: the heading and the four lines after it. */
function ohneFremdeBloecke(zeilen: string[]): string[] {
  const behalten: string[] = [];
  let ueberspringen = 0;
  for (const zeile of zeilen) {
    if (FREMDER_BLOCK.test(zeile)) {
      ueberspringen = 4;
      continue;
    }
    if (ueberspringen > 0) {
      ueberspringen--;
      continue;
    }
    behalten.push(zeile);
  }
  return behalten;
}

/**
 * The part of the Impressum about the operator, found from the address rather than from headings (those show up in
 * navigation menus and cookie banners too): the first postal-code line with a legal form or an operator heading in
 * the six lines above it, from those six lines on. Without any German address, the block after the first operator
 * heading, so an offshore address can still be read.
 */
export function betreiberText(text: string): string {
  const zeilen = ohneFremdeBloecke(text.split('\n'));
  const plz = zeilen.flatMap((z, i) => (PLZ_ORT.test(z) ? [i] : []));
  const davorPasst = (i: number) => zeilen.slice(Math.max(0, i - 6), i + 1).some((z) => IST_ANKER(z) || RECHTSFORMEN.some(([, m]) => m.test(z)));
  const adresse = plz.find(davorPasst) ?? plz[0];
  if (adresse !== undefined) return zeilen.slice(Math.max(0, adresse - 6), adresse + 45).join('\n');
  const anker = zeilen.findIndex(IST_ANKER);
  return zeilen.slice(Math.max(0, anker), Math.max(0, anker) + 45).join('\n');
}

const OFFSHORE = ['hong kong', 'hongkong', 'shenzhen', 'guangdong', 'guangzhou', 'zhejiang', 'china', 'singapore', 'kowloon', 'sheung wan', 'delaware', 'wyoming', 'cyprus', 'zypern', 'limassol', 'dubai', 'sharjah'];
const STRASSE = /(str\.|straße|strasse|weg|platz|allee|ring|gasse|damm|ufer|chaussee|markt|hof|park|feld|berg|pfad|zeile|steig|kamp|twiete|\d+\s*[a-z]?)\s*$/i;
// Names never span lines, so only spaces between their parts.
const NAME = String.raw`(?:(?:Dr|Prof)\. )*[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?: (?:von|van|de|zu)\b)?(?: [A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?){1,2}`;

function geschaeftsfuehrer(text: string): string[] {
  const m = new RegExp(String.raw`(?:Gesch[äa]ftsf[üu]hr\w*|Vertretungsberechtigt\w*|Vertreten\s+durch|Inhaber(?:in)?|Vorstand)\s*(?:[ \t]+der[ \t][^:\n]{0,60})?(?:\([^)\n]{0,30}\))?[ \t]*[:\-]?\s*(?:(?:Kauffrau|Kaufmann|Herr|Frau|Komplementär(?:in)?)[ \t]+)?((?:${NAME})(?:[ \t]*(?:,|und|&)[ \t]*(?:${NAME}))*)`, 'u').exec(text);
  if (!m) return [];
  return m[1].split(/[ \t]*(?:,|\bund\b|&)[ \t]*/).map((n) => n.trim()).filter((n) => n.split(/\s/).length >= 2).slice(0, 4);
}

function registerUndGericht(text: string): { register: string; gericht: string } {
  // "HRB 1234", "HRB-Nr. 1234", "HRB Musterstadt 3116"
  const m = /\b(HRB|HRA)\s*[:\-.]?\s*(?:Nr\.?\s*)?(?:([A-ZÄÖÜ][a-zäöüß]+)\s+)?(\d{1,7}(?:\s?(?!AG\b)[A-Z]{1,2}\b)?)/.exec(text);
  if (!m) return { register: '', gericht: '' };
  const agKurz = /\bAG\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s(?:am|an der|im|in der)\s[A-ZÄÖÜ][a-zäöüß]+)?)/.exec(text.split('\n').find((z) => /\bHR[AB]\b/.test(z)) ?? '');
  const gericht = /(?:Amtsgericht|Registergericht\s*:?\s*(?:Amtsgericht)?|Handelsregister\s*(?:beim|des)?\s*(?:Amtsgericht(?:s)?)?)\s*[:\-]?\s*([A-ZÄÖÜ][a-zäöüß.\-]+(?:\s(?:am|an der|im|in der|\/)\s?[A-ZÄÖÜ][a-zäöüß.\-]+|\s\([A-Z][a-z]+\))?)/.exec(text);
  const g = gericht?.[1] && !/^(HR[AB]|Amtsgericht\w*|Registergericht|Handelsregister|Registernummer)$/i.test(gericht[1]) ? gericht[1].replace(/[.,]$/, '') : '';
  return { register: `${m[1]} ${m[3].trim()}`, gericht: g || m[2] || agKurz?.[1] || '' };
}

function kontakt(html: string, text: string, domain: string): { email: string; telefon: string } {
  const mails = [
    ...[...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1])),
    ...[...text.replace(/\s*[([{]\s*(?:at|ät)\s*[)\]}]\s*/gi, '@').replace(/\s*[([{]\s*(?:dot|punkt)\s*[)\]}]\s*/gi, '.').matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi)].map((m) => m[0]),
  ].map((m) => m.toLowerCase().replace(/\.$/, ''));
  const eigene = domain.replace(/^www\./, '');
  const email = mails.find((m) => m.endsWith(`@${eigene}`) || m.endsWith(`.${eigene}`)) ?? mails.find((m) => !/example|beispiel|sentry|wixpress/.test(m)) ?? '';

  const telLink = /href=["']tel:([+\d\s()/.-]{6,25})["']/i.exec(html)?.[1];
  const telLabel = /(?:Tel(?:efon)?|Fon|Phone|Hotline)\.?\s*(?:\([^)]*\))?\s*[:.]?\s*((?:\+|0)[\d\s/()\-–.]{5,22}\d)/i.exec(text)?.[1];
  const telefon = (telLink ?? telLabel ?? '').replace(/[–]/g, '-').replace(/\s{2,}/g, ' ').trim();
  return { email, telefon };
}

/** Everything the Impressum page tells about the company. */
export function leseImpressum(seite: Seite | null, domain: string): Firma {
  const f = leereFirma();
  if (!seite) return f;
  f.gefunden = true;
  f.url = seite.url;
  const voll = textAus(seite.text);
  const text = betreiberText(voll);

  const reg = registerUndGericht(text);
  f.register = reg.register;
  f.registergericht = reg.gericht;

  f.ust_id = (/\bDE\s?\d{3}\s?\d{3}\s?\d{3}\b/.exec(text)?.[0] ?? /\bATU\s?\d{8}\b/.exec(text)?.[0] ?? /\bCHE[- ]?\d{3}\.?\d{3}\.?\d{3}\b/.exec(text)?.[0] ?? '').replace(/\s/g, '');

  // The operator is the first line with a legal form. Register lines ("AG Musterstadt" = Amtsgericht) do not count.
  const REGISTERZEILE = /\bHR[AB]\b|registergericht|amtsgericht|handelsregister|registernummer|\bust\b|ust-?id|umsatzsteuer|steuernummer|\bsteuer-?id|gesellschafterin|komplementär|©|&copy;|copyright|alle rechte|\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/i;
  const nameZeilen = text.split('\n').filter((z) => z.length <= 120 && !REGISTERZEILE.test(z));
  let nameIndex = -1;
  for (const zeile of nameZeilen) {
    const treffer = RECHTSFORMEN.find(([, muster]) => muster.test(zeile));
    if (!treffer) continue;
    const [form, muster] = treffer;
    nameIndex = text.split('\n').indexOf(zeile);
    f.rechtsform = form;
    // Company name = the fragment of that line up to and including the legal form.
    const quelle = muster.source.replace(/^\\b/, '');
    const name = new RegExp(String.raw`([A-ZÄÖÜ0-9][\wäöüßÄÖÜ&.'\-+]*(?:\s+[\wäöüßÄÖÜ&.'\-+]+){0,6}?\s*(?:${quelle}))`, muster.flags).exec(zeile);
    f.name = (name?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^.{0,40}?\b(?:betrieben von|betreiber(?:in)? ist|anbieter(?:in)? ist)\s*:?\s*/i, '')
      .replace(/^(?:impressum|angaben|anbieter|betreiber|firma|unternehmen|name|verantwortlich)\b[^:]{0,40}?(?::|\b(?:der|des|von)\b)\s*/i, '')
      .trim()
      .slice(0, 120);
    break;
  }

  f.geschaeftsfuehrer = geschaeftsfuehrer(text);

  const zeilen = text.split('\n');
  const nachName = zeilen.findIndex((z, i) => i >= Math.max(0, nameIndex) && PLZ_ORT.test(z));
  const plzIndex = nachName >= 0 ? nachName : zeilen.findIndex((z) => PLZ_ORT.test(z));
  if (plzIndex >= 0) {
    const zeile = zeilen[plzIndex];
    const m = PLZ_ORT.exec(zeile)!;
    f.plz = m[1];
    f.ort = m[2].trim().replace(/\s+(?:Deutschland|Germany)$/i, '');
    const davor = zeile.slice(0, m.index).split(/[,·|•]/).map((t) => t.trim()).filter(Boolean).at(-1);
    const strasse = davor ?? zeilen[plzIndex - 1] ?? '';
    if (STRASSE.test(strasse) && strasse.length <= 60) f.strasse = strasse.trim();
  }
  if (/\b(?:A-?|AT-?)\d{4}\s+[A-ZÄÖÜ]|österreich|austria/i.test(text) && !f.plz) f.land = 'AT';
  else if (/\bCH-?\d{4}\s+[A-ZÄÖÜ]|schweiz|switzerland/i.test(text) && !f.plz) f.land = 'CH';
  else if (f.plz || f.ust_id.startsWith('DE')) f.land = 'DE';

  // Only the address block counts: "China" is also a cymbal in a music shop's navigation.
  const von = nameIndex >= 0 && (plzIndex < 0 || nameIndex <= plzIndex) ? nameIndex : Math.max(0, plzIndex - 3);
  const bis = plzIndex >= 0 ? plzIndex + 4 : von + 15;
  const adresse = zeilen.slice(von, bis).join(' ').toLowerCase();
  f.offshore = OFFSHORE.some((o) => new RegExp(`\\b${o}\\b`).test(adresse));
  Object.assign(f, kontakt(seite.text, text, domain));
  return f;
}
