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

export function nowIso(): string {
  return new Date().toISOString();
}
