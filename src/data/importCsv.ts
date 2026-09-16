import { TIERS } from './constants';
import { normalizeDomain, splitName } from './rules';
import type { Database, FirmaInput, KontaktInput } from './types';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT } from './types';

/** RFC 4180 CSV with auto-detected delimiter (Excel in German uses ";"). */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type ImportAktion = 'neu' | 'ergaenzen' | 'unveraendert' | 'uebersprungen' | 'fehler';

export interface ImportZeile {
  zeile: number;
  domain: string;
  name: string;
  tier: string;
  aktion: ImportAktion;
  hinweis: string;
  /** For "neu": the firm to create. */
  firma?: FirmaInput;
  /** For "ergaenzen": the existing firm and the empty fields to fill. */
  firmaId?: string;
  aenderungen?: Partial<FirmaInput>;
  /** A contact to create (new firm, or existing firm without a contact of that name). */
  kontakt?: KontaktInput;
}

export interface ImportOptionen {
  tiers: string[];
  zustaendig: string;
  dealAnlegen: boolean;
  dealTitel: string;
}

export interface ImportPlan {
  zeilen: ImportZeile[];
  fehlendeSpalten: string[];
  optionen: ImportOptionen;
}

export const PFLICHTSPALTEN = ['domain'];

/**
 * The import format, identical to the flat output of the Magento lead qualifier (CRM_COLUMNS in src/qualify.py there).
 * Also read when present: ansprechpartner_rolle, letztes_deploy (into Technik) and score_gruende (into Notiz).
 */
export const IMPORT_SPALTEN = [
  'tier', 'score', 'domain', 'firma', 'plattform', 'version', 'eol', 'register', 'ust_id',
  'ansprechpartner', 'email', 'telefon', 'ort', 'katalog_urls', 'payments', 'marketing', 'lauf',
] as const;

/** Older qualifier exports used English column names; they still import. */
const ALIASE: Record<string, string> = {
  company: 'firma',
  platform: 'plattform',
  magento_version: 'version',
  eol_state: 'eol',
  vat_id: 'ust_id',
  contact_person: 'ansprechpartner',
  phone: 'telefon',
  city: 'ort',
  score_reasons: 'score_gruende',
};

/** Fields filled from the CSV. Everything else in a firm stays untouched on import. */
const IMPORT_FELDER: (keyof FirmaInput)[] = [
  'name', 'tier', 'score', 'plattform', 'version', 'eol', 'register', 'ust_id', 'email_allgemein', 'telefon_allgemein', 'ort', 'tech_info', 'quelle', 'notiz',
];

function firmaAusZeile(get: (column: string) => string): FirmaInput {
  const katalog = get('katalog_urls');
  const technik = [get('marketing'), get('payments')].filter(Boolean).join(', ');
  const deploy = get('letztes_deploy');
  const gruende = get('score_gruende');
  const scoreText = get('score').replace(',', '.');
  const score = scoreText === '' ? null : Number(scoreText);
  const lauf = get('lauf');
  return {
    ...EMPTY_FIRMA_INPUT,
    name: get('firma') || normalizeDomain(get('domain')),
    domain: normalizeDomain(get('domain')),
    tier: get('tier').toUpperCase(),
    score: score !== null && Number.isFinite(score) ? score : null,
    plattform: get('plattform'),
    version: get('version'),
    eol: get('eol'),
    register: get('register'),
    ust_id: get('ust_id'),
    email_allgemein: get('email'),
    telefon_allgemein: get('telefon'),
    ort: get('ort'),
    tech_info: [technik, katalog && katalog !== '0' ? `${katalog} Katalog-URLs` : '', deploy ? `letztes Deploy ${deploy}` : '']
      .filter(Boolean)
      .join(' · '),
    quelle: lauf ? `Magento ${lauf}` : 'CSV-Import',
    // Why the qualifier rated the lead – useful context before the first call.
    notiz: gruende ? `Lead-Scoring: ${gruende}` : '',
  };
}

/**
 * Compares a lead-qualifier CSV with the current data. Nothing is written here; the plan is shown as a preview first.
 * Existing firms are never overwritten – only empty fields get filled.
 */
export function planeImport(rows: string[][], db: Database, optionen: ImportOptionen): ImportPlan {
  const [headerRow = [], ...daten] = rows;
  const header = headerRow.map((h) => {
    const name = h.trim().toLowerCase();
    return ALIASE[name] ?? name;
  });
  const fehlendeSpalten = PFLICHTSPALTEN.filter((column) => !header.includes(column));
  if (fehlendeSpalten.length > 0) return { zeilen: [], fehlendeSpalten, optionen };

  const firmenNachDomain = new Map(db.firmen.map((f) => [normalizeDomain(f.domain), f]));
  const gesehen = new Set<string>();
  const tiers = new Set(optionen.tiers);

  const zeilen = daten.map((row, i): ImportZeile => {
    const get = (column: string) => {
      const index = header.indexOf(column);
      return index >= 0 ? (row[index] ?? '').trim() : '';
    };
    const firma = firmaAusZeile(get);
    const basis = { zeile: i + 2, domain: firma.domain, name: firma.name, tier: firma.tier };
    const ansprechpartner = get('ansprechpartner');
    const kontakt: KontaktInput | undefined = ansprechpartner
      ? { ...EMPTY_KONTAKT_INPUT, ...splitName(ansprechpartner), rolle: get('ansprechpartner_rolle'), hauptkontakt: true }
      : undefined;

    if (!firma.domain) return { ...basis, aktion: 'fehler', hinweis: 'Keine Domain' };
    if (gesehen.has(firma.domain)) return { ...basis, aktion: 'uebersprungen', hinweis: 'Doppelt in der Datei' };
    gesehen.add(firma.domain);
    const tierBekannt = (TIERS as readonly string[]).includes(firma.tier);
    if (tierBekannt && !tiers.has(firma.tier)) return { ...basis, aktion: 'uebersprungen', hinweis: `Tier ${firma.tier} nicht ausgewählt` };
    if (!tierBekannt && firma.tier && !tiers.has('sonstige')) return { ...basis, aktion: 'uebersprungen', hinweis: `Unbekanntes Tier „${firma.tier}“` };

    const vorhanden = firmenNachDomain.get(firma.domain);
    if (!vorhanden) {
      return { ...basis, aktion: 'neu', hinweis: kontakt ? 'mit Ansprechpartner' : '', firma: { ...firma, zustaendig: optionen.zustaendig }, kontakt };
    }

    const aenderungen: Partial<FirmaInput> = {};
    for (const feld of IMPORT_FELDER) {
      const alt = vorhanden[feld];
      const neu = firma[feld];
      const altLeer = alt === null || alt === '';
      const neuLeer = neu === null || neu === '';
      if (altLeer && !neuLeer) (aenderungen as Record<string, unknown>)[feld] = neu;
    }
    const kontaktFehlt =
      kontakt &&
      !db.kontakte.some(
        (k) => k.firma_id === vorhanden.id && `${k.vorname} ${k.nachname}`.trim().toLowerCase() === ansprechpartner.toLowerCase(),
      );
    const felder = Object.keys(aenderungen);
    if (felder.length === 0 && !kontaktFehlt) {
      return { ...basis, name: vorhanden.name, aktion: 'unveraendert', hinweis: 'Schon vorhanden, nichts zu ergänzen', firmaId: vorhanden.id };
    }
    const teile = [felder.length > 0 ? `ergänzt: ${felder.join(', ')}` : '', kontaktFehlt ? 'neuer Ansprechpartner' : ''].filter(Boolean);
    return {
      ...basis,
      name: vorhanden.name,
      aktion: 'ergaenzen',
      hinweis: teile.join(' · '),
      firmaId: vorhanden.id,
      aenderungen,
      kontakt: kontaktFehlt ? { ...kontakt, hauptkontakt: !db.kontakte.some((k) => k.firma_id === vorhanden.id && k.hauptkontakt) } : undefined,
    };
  });

  return { zeilen, fehlendeSpalten, optionen };
}
