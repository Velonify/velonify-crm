// 32 characters without look-alikes (0/O, 1/I), so byte % 32 stays unbiased.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const ID_PREFIX = {
  firmen: 'F',
  kontakte: 'K',
  deals: 'D',
  aktivitaeten: 'A',
  wiedervorlagen: 'W',
  leistungskategorien: 'LK',
  leistungen: 'L',
  angebote: 'AN',
  outreach_leistungen: 'OL',
  anschreiben: 'AS',
  audits: 'SA',
  wordle: 'WD',
  monstera: 'MO',
  eingang: 'EA',
  social_plan: 'SP',
  social_inhalte: 'SI',
  social_hooks: 'SH',
  social_aufgaben: 'SU',
  social_texte: 'ST',
  social_werte: 'SW',
  social_dms: 'SD',
} as const;

export function newId(prefix: string, length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let suffix = '';
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${suffix}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

/** Whole calendar days from one YYYY-MM-DD to another (negative when `bis` is earlier). */
export function tageZwischen(von: string, bis: string): number {
  const utc = (isoDay: string) => {
    const [y, m, d] = isoDay.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(bis) - utc(von)) / 86_400_000);
}
