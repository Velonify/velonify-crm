const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  if (!iso) return '–';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

/** "lugge@velonify.de" → "lugge" */
export function shortUser(email: string): string {
  return email.split('@')[0] || '–';
}

export const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead',
  kunde: 'Kunde',
  ehemalig: 'Ehemalig',
};

export const EOL_LABEL: Record<string, string> = {
  eol: 'Kein Support mehr',
  unknown: 'Unbekannt',
  supported: 'Noch unterstützt',
};

export const statusLabel = (status: string) => STATUS_LABEL[status] ?? (status || '–');

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

export const websiteUrl = (domain: string) => `https://${domain}`;
