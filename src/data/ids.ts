// 32 characters without look-alikes (0/O, 1/I), so byte % 32 stays unbiased.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const ID_PREFIX = {
  firmen: 'F',
  kontakte: 'K',
  deals: 'D',
  aktivitaeten: 'A',
  wiedervorlagen: 'W',
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
