import { DuplicateError, ValidationError } from './errors';
import type { Firma, FirmaInput } from './types';

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

/**
 * Cleans and validates the fields present in `changes`, and checks domain and Kürzel against all other firms.
 * Shared by every repository implementation so the rules are identical in demo and Sheets mode.
 */
export function prepareFirma<T extends Partial<FirmaInput>>(changes: T, alle: readonly Firma[], selfId?: string): T {
  const result: Partial<FirmaInput> = {};
  for (const [key, value] of Object.entries(changes) as [keyof FirmaInput, unknown][]) {
    (result as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() : value;
  }

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

  if (result.drive_ordner_id !== undefined) {
    result.drive_ordner_id = extractDriveFolderId(result.drive_ordner_id);
  }

  if (result.slack_channel !== undefined) {
    result.slack_channel = result.slack_channel.replace(/^#/, '');
  }

  if (result.score !== undefined && result.score !== null && !Number.isFinite(result.score)) {
    throw new ValidationError('score', 'Score muss eine Zahl sein.');
  }

  return result as T;
}
