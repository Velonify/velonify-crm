const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatDateTime(iso: string): string {
  if (!iso) return '–';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

/** "2026-09-16" → "16.09.2026" */
export function formatDate(isoDay: string): string {
  if (!isoDay) return '–';
  const date = new Date(`${isoDay.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? isoDay : dateOnly.format(date);
}

export function formatDayShort(isoDay: string): string {
  const date = new Date(`${isoDay.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? isoDay : weekday.format(date);
}

export function formatEuro(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : euro.format(value);
}

export function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return '–';
  return days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

/** Relative wording for a due date: "heute", "morgen", "seit 3 Tagen", "in 5 Tagen". */
export function faelligText(isoDay: string, heute: string): string {
  const diff = Math.round((new Date(`${isoDay}T00:00:00`).getTime() - new Date(`${heute}T00:00:00`).getTime()) / 86_400_000);
  if (!Number.isFinite(diff)) return isoDay;
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'seit gestern';
  return diff < 0 ? `seit ${-diff} Tagen` : `in ${diff} Tagen`;
}

/** "lugge@velonify.de" → "lugge" */
export function shortUser(email: string): string {
  return email.split('@')[0] || '–';
}

export const websiteUrl = (domain: string) => `https://${domain}`;

export const numberOrNull = (text: string): number | null => {
  const trimmed = text.trim().replace(/\./g, '').replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
};
