import { DuplicateError, ValidationError } from './errors';
import { isIsoDate } from './ids';
import type { DealInput, Firma, FirmaInput, KontaktInput, WiedervorlageInput } from './types';

/** "https://www.Shop.de/impressum" → "shop.de" */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '');
}

/** Accepts a folder ID or a full Drive folder URL. */
export function extractDriveFolderId(input: string): string {
  const value = input.trim();
  const match = value.match(/\/folders\/([A-Za-z0-9_-]+)/) ?? value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return match ? match[1] : value;
}

// Existing customers keep two letters (SB, PW, BF); new abbreviations get three.
const KUERZEL_PATTERN = /^[A-Z]{2,3}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGAL_FORMS = /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|se|e\.?\s?k|e\.?\s?v|co|inc|ltd|haftungsbeschränkt)\b\.?/gi;

function trimStrings<T extends object>(input: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) result[key] = typeof value === 'string' ? value.trim() : value;
  return result as T;
}

function transliterate(text: string): string {
  return text
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function nameWords(name: string): string[] {
  return transliterate(name).replace(LEGAL_FORMS, ' ').split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** "artplants GmbH & Co. KG" → "artplants": lowercase, no legal form, no punctuation. */
export function normalizeFirmenname(name: string): string {
  return nameWords(name).join(' ').toLowerCase();
}

/** Proposes a free three-letter Kürzel: initials first, then letters from the name. */
export function suggestKuerzel(name: string, vergeben: Iterable<string>): string {
  const taken = new Set([...vergeben].map((k) => k.toUpperCase()));
  const words = nameWords(name).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const joined = words.join('');
  const candidates: string[] = [];
  if (words.length >= 3) candidates.push(words[0][0] + words[1][0] + words[2][0]);
  if (words.length >= 2) {
    candidates.push(words[0][0] + words[1].slice(0, 2), words[0].slice(0, 2) + words[1][0]);
  }
  candidates.push(joined.slice(0, 3));
  // Fallback: first letter plus every later pair of letters.
  for (let i = 1; i < joined.length; i++) {
    for (let j = i + 1; j < joined.length; j++) candidates.push(joined[0] + joined[i] + joined[j]);
  }
  return candidates.map((c) => c.toUpperCase()).find((c) => c.length === 3 && KUERZEL_PATTERN.test(c) && !taken.has(c)) ?? '';
}

/** "SB" + "Sturm & Berger GmbH" → "SB_Sturm-Berger", matching the Drive naming convention. */
export function driveFolderName(kuerzel: string, name: string): string {
  return `${kuerzel.toUpperCase()}_${nameWords(name).join('-')}`;
}

/**
 * Cleans and validates the fields present in `changes`, and checks domain and Kürzel against all other firms.
 */
export function prepareFirma<T extends Partial<FirmaInput>>(changes: T, alle: readonly Firma[], selfId?: string): T {
  const result: Partial<FirmaInput> = trimStrings(changes);

  if (result.name !== undefined && result.name === '') {
    throw new ValidationError('name', 'Bitte einen Namen angeben.');
  }

  const andere = alle.filter((f) => f.id !== selfId);

  if (result.domain !== undefined) {
    result.domain = normalizeDomain(result.domain);
    const treffer = result.domain && andere.find((f) => normalizeDomain(f.domain) === result.domain);
    if (treffer) throw new DuplicateError('domain', treffer.id, treffer.name);
  }

  if (result.kuerzel !== undefined) {
    result.kuerzel = result.kuerzel.toUpperCase();
    if (result.kuerzel && !KUERZEL_PATTERN.test(result.kuerzel)) {
      throw new ValidationError('kuerzel', 'Kürzel: 2 oder 3 Buchstaben, ohne Umlaute.');
    }
    const treffer = result.kuerzel && andere.find((f) => f.kuerzel.toUpperCase() === result.kuerzel);
    if (treffer) throw new DuplicateError('kuerzel', treffer.id, treffer.name);
  }

  if (result.email_allgemein && !EMAIL_PATTERN.test(result.email_allgemein)) {
    throw new ValidationError('email_allgemein', 'Die E-Mail-Adresse sieht nicht gültig aus.');
  }
  if (result.drive_ordner_id !== undefined) result.drive_ordner_id = extractDriveFolderId(result.drive_ordner_id);
  if (result.slack_channel !== undefined) result.slack_channel = result.slack_channel.replace(/^#/, '');
  if (result.score !== undefined && result.score !== null && !Number.isFinite(result.score)) {
    throw new ValidationError('score', 'Score muss eine Zahl sein.');
  }
  return result as T;
}

export function prepareKontakt(input: KontaktInput): KontaktInput {
  const result = trimStrings(input);
  if (!result.vorname && !result.nachname) throw new ValidationError('nachname', 'Bitte Vor- oder Nachnamen angeben.');
  if (result.email) {
    result.email = result.email.toLowerCase();
    if (!EMAIL_PATTERN.test(result.email)) throw new ValidationError('email', 'Die E-Mail-Adresse sieht nicht gültig aus.');
  }
  return result;
}

export function prepareDeal(input: DealInput): DealInput {
  const result = trimStrings(input);
  if (!result.titel) throw new ValidationError('titel', 'Bitte einen Titel angeben.');
  if (result.wert_eur !== null && (!Number.isFinite(result.wert_eur) || result.wert_eur < 0)) {
    throw new ValidationError('wert_eur', 'Der Angebotswert muss eine Zahl ab 0 sein.');
  }
  if (
    result.wahrscheinlichkeit !== null &&
    (!Number.isFinite(result.wahrscheinlichkeit) || result.wahrscheinlichkeit < 0 || result.wahrscheinlichkeit > 100)
  ) {
    throw new ValidationError('wahrscheinlichkeit', 'Die Wahrscheinlichkeit muss zwischen 0 und 100 liegen.');
  }
  if (result.naechster_schritt_am && !isIsoDate(result.naechster_schritt_am)) {
    throw new ValidationError('naechster_schritt_am', 'Bitte ein gültiges Datum angeben.');
  }
  return result;
}

export function prepareWiedervorlage(input: WiedervorlageInput): WiedervorlageInput {
  const result = trimStrings(input);
  if (!result.titel) throw new ValidationError('titel', 'Bitte angeben, worum es geht.');
  if (!isIsoDate(result.faellig_am)) throw new ValidationError('faellig_am', 'Bitte ein Fälligkeitsdatum angeben.');
  return result;
}

export const kontaktName = (k: { vorname: string; nachname: string }) => [k.vorname, k.nachname].filter(Boolean).join(' ');

/** "Uwe Möllmann" → { vorname: "Uwe", nachname: "Möllmann" }; a single word counts as surname. */
export function splitName(full: string): { vorname: string; nachname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { vorname: '', nachname: parts[0] ?? '' };
  return { vorname: parts.slice(0, -1).join(' '), nachname: parts[parts.length - 1] };
}

export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value);
