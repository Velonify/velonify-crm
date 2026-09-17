import { isAbgeschlossen } from './constants';
import { ValidationError } from './errors';
import type { Anschreiben, Deal, Firma, Kontakt, Leistung, Leistungskategorie } from './types';

export const KANAELE = [
  { wert: 'instagram', label: 'Instagram', verlauf: 'Instagram-Nachricht', zeichenLimit: 1000, anrede: 'du' },
  { wert: 'linkedin_notiz', label: 'LinkedIn-Notiz', verlauf: 'LinkedIn-Vernetzungsanfrage', zeichenLimit: 300, anrede: 'sie' },
  { wert: 'linkedin_nachricht', label: 'LinkedIn-Nachricht', verlauf: 'LinkedIn-Nachricht', zeichenLimit: null, anrede: 'sie' },
  { wert: 'email', label: 'E-Mail', verlauf: 'E-Mail', zeichenLimit: null, anrede: 'sie' },
] as const;

export type Kanal = (typeof KANAELE)[number]['wert'];
export type Anrede = 'sie' | 'du';

export const kanalInfo = (wert: string) => KANAELE.find((k) => k.wert === wert);
export const kanalLabel = (wert: string) => kanalInfo(wert)?.label ?? (wert || '–');

export const ANSCHREIBEN_STATUS = [
  { wert: 'gesendet', label: 'Gesendet' },
  { wert: 'antwort', label: 'Antwort erhalten' },
  { wert: 'keine_antwort', label: 'Keine Antwort' },
] as const;

export const anschreibenStatusLabel = (wert: string) => ANSCHREIBEN_STATUS.find((s) => s.wert === wert)?.label ?? (wert || '–');

export type LeistungsWahl =
  | { art: 'katalog'; kategorie: Leistungskategorie; leistungen: readonly Leistung[] }
  | { art: 'manuell'; titel: string; beschreibung: string };

export const leistungsTitel = (wahl: LeistungsWahl) => (wahl.art === 'katalog' ? wahl.kategorie.titel_de : wahl.titel.trim());

export interface GeneratorEingabe {
  kanal: Kanal;
  sprache: 'de' | 'en';
  anrede: Anrede;
  absender: string;
  firma: Firma;
  kontakt?: Kontakt;
  leistung: LeistungsWahl;
  aufhaenger: string;
  hinweis?: string;
}

/** Request body of the Cloud Function; mirrors `AnfrageSchema` in functions/contact-generator/src/anfrage.ts. */
export interface GeneratorAnfrage {
  kanal: Kanal;
  sprache: 'de' | 'en';
  anrede: Anrede;
  absender: { vorname: string };
  firma: Pick<Firma, 'name' | 'domain' | 'ort' | 'plattform' | 'version' | 'eol' | 'tech_info' | 'notiz'>;
  kontakt: Pick<Kontakt, 'vorname' | 'nachname' | 'rolle'> | null;
  leistung: { titel: string; unterpunkte: string[]; anlass: string; nutzen: string; beleg: string; beschreibung: string };
  aufhaenger: string;
  hinweis: string;
}

export interface Variante {
  betreff: string;
  text: string;
}

/** Cuts CRM text to the length the Cloud Function accepts, so a long note does not block generating. */
// String length as zod counts it (UTF-16 units), not characters.
const kurz = (wert: string, max: number) => wert.trim().slice(0, max);

/**
 * Picks only what the text needs from the CRM. E-mail addresses, phone numbers, register data and deal values
 * never leave the browser.
 */
export function baueAnfrage(e: GeneratorEingabe): GeneratorAnfrage {
  const absender = e.absender.trim();
  if (!absender) throw new ValidationError('absender', 'Bitte den Vornamen des Absenders angeben.');
  const titel = leistungsTitel(e.leistung);
  if (!titel) throw new ValidationError('leistung', 'Bitte eine Leistung wählen oder manuell beschreiben.');

  // Limits as in functions/contact-generator/src/anfrage.ts.
  const f = e.firma;
  return {
    kanal: e.kanal,
    sprache: e.sprache,
    anrede: e.anrede,
    absender: { vorname: kurz(absender, 40) },
    firma: {
      name: kurz(f.name, 200),
      domain: kurz(f.domain, 200),
      ort: kurz(f.ort, 100),
      plattform: kurz(f.plattform, 50),
      version: kurz(f.version, 50),
      eol: kurz(f.eol, 20),
      tech_info: kurz(f.tech_info, 1000),
      notiz: kurz(f.notiz, 2000),
    },
    kontakt: e.kontakt ? { vorname: kurz(e.kontakt.vorname, 60), nachname: kurz(e.kontakt.nachname, 60), rolle: kurz(e.kontakt.rolle, 120) } : null,
    leistung:
      e.leistung.art === 'katalog'
        ? {
            titel: kurz(titel, 200),
            unterpunkte: e.leistung.leistungen.filter((l) => !l.archiviert).slice(0, 30).map((l) => kurz(l.titel_de, 200)),
            anlass: kurz(e.leistung.kategorie.outreach_anlass, 1000),
            nutzen: kurz(e.leistung.kategorie.outreach_nutzen, 1000),
            beleg: kurz(e.leistung.kategorie.outreach_beleg, 1000),
            beschreibung: '',
          }
        : { titel: kurz(titel, 200), unterpunkte: [], anlass: '', nutzen: '', beleg: '', beschreibung: kurz(e.leistung.beschreibung, 2000) },
    aufhaenger: kurz(e.aufhaenger, 1000),
    hinweis: kurz(e.hinweis ?? '', 500),
  };
}

/** Characters as LinkedIn counts them: an emoji or umlaut is one. */
export const zeichen = (text: string) => [...text].length;

export const mitSignatur = (text: string, signatur: string) => (signatur.trim() ? `${text.trimEnd()}\n\n${signatur.trim()}` : text);

export const mailtoLink = (email: string, betreff: string, text: string) =>
  `mailto:${email.trim()}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;

/** Key in "einstellungen" for the personal e-mail signature. */
export const signaturSchluessel = (email: string) => `signatur_${email.trim().toLowerCase()}`;

/** "Lukas Hanke" → "Lukas"; without a profile name the part of the address before the first dot. */
export function vornameAus(name: string, email: string): string {
  const ausName = name.trim().split(/\s+/)[0] ?? '';
  if (ausName) return ausName;
  const teil = email.split('@')[0].split(/[._-]/)[0] ?? '';
  return teil ? teil[0].toUpperCase() + teil.slice(1) : '';
}

export const offeneDeals = (deals: readonly Deal[], firmaId: string) =>
  deals.filter((d) => d.firma_id === firmaId && !d.archiviert && !isAbgeschlossen(d.phase));

export type AnschreibenInput = Pick<
  Anschreiben,
  'firma_id' | 'kontakt_id' | 'deal_id' | 'kanal' | 'kategorie_id' | 'leistung' | 'sprache' | 'anrede' | 'aufhaenger' | 'betreff' | 'text'
>;

export function prepareAnschreiben(input: AnschreibenInput): AnschreibenInput {
  const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as AnschreibenInput;
  const kanal = kanalInfo(clean.kanal);
  if (!kanal) throw new ValidationError('kanal', 'Bitte einen Kanal wählen.');
  if (!clean.firma_id) throw new ValidationError('firma_id', 'Bitte eine Firma wählen.');
  if (!clean.leistung) throw new ValidationError('leistung', 'Bitte eine Leistung angeben.');
  if (!clean.text) throw new ValidationError('text', 'Der Nachrichtentext ist leer.');
  if (kanal.zeichenLimit && zeichen(clean.text) > kanal.zeichenLimit) {
    throw new ValidationError('text', `Die ${kanal.label} ist ${zeichen(clean.text)} Zeichen lang, erlaubt sind ${kanal.zeichenLimit}.`);
  }
  if (clean.kanal === 'email' && !clean.betreff) throw new ValidationError('betreff', 'Bitte einen Betreff angeben.');
  if (clean.kanal !== 'email') clean.betreff = '';
  return clean;
}

/** Entry in the firm's history: what went out, via which channel, for which service. */
export function verlaufText(input: Pick<Anschreiben, 'kanal' | 'leistung' | 'betreff' | 'text'>): string {
  const kopf = `${kanalInfo(input.kanal)?.verlauf ?? input.kanal} gesendet (Contact Generator, ${input.leistung})`;
  const betreff = input.betreff ? [`Betreff: ${input.betreff}`] : [];
  return [kopf, ...betreff, '', input.text].join('\n');
}
