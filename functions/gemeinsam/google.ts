/**
 * Google access shared by the functions: tokens of the function's own service account (from the metadata server, no
 * key file), tokens of a user account from its refresh token, and mail through the Gmail API (only gmail.send).
 */
const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export const DIENSTKONTO_SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

interface Zwischenspeicher {
  token: string;
  bis: number;
}

/** A token provider that caches until shortly before expiry. */
function gecacht(holen: () => Promise<{ access_token: string; expires_in: number }>): () => Promise<string> {
  let cache: Zwischenspeicher | null = null;
  return async () => {
    if (cache && cache.bis > Date.now() + 60_000) return cache.token;
    const antwort = await holen();
    cache = { token: antwort.access_token, bis: Date.now() + antwort.expires_in * 1000 };
    return cache.token;
  };
}

export function dienstkontoToken(fetchFn: typeof fetch = fetch): () => Promise<string> {
  return gecacht(async () => {
    const antwort = await fetchFn(`${METADATA_TOKEN}?scopes=${encodeURIComponent(DIENSTKONTO_SCOPES.join(','))}`, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!antwort.ok) throw new Error(`Kein Token vom Metadatenserver (${antwort.status}).`);
    return (await antwort.json()) as { access_token: string; expires_in: number };
  });
}

/** Access tokens of a user account from its refresh token (OAuth client of the CRM), cached until shortly before expiry. */
export function nutzerToken(konfig: { clientId: string; clientSecret: string; refreshToken: string; wofuer: string }, fetchFn: typeof fetch = fetch): () => Promise<string> {
  return gecacht(async () => {
    const antwort = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: konfig.clientId, client_secret: konfig.clientSecret, refresh_token: konfig.refreshToken, grant_type: 'refresh_token' }),
    });
    const daten = (await antwort.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!antwort.ok || !daten.access_token) throw new Error(`${konfig.wofuer}-Token fehlgeschlagen (${antwort.status}): ${daten.error ?? 'unbekannt'}`);
    return { access_token: daten.access_token, expires_in: daten.expires_in ?? 3600 };
  });
}

export interface MailKonfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** e.g. "Velonify <hallo@velonify.de>"; must be the mailbox of the refresh token or one of its send-as aliases. */
  absender: string;
  /** Optional Reply-To, when replies should land elsewhere than the sender. */
  antwortAn?: string;
}

export interface Mail {
  an: string;
  betreff: string;
  text: string;
  html?: string;
}

const kodiert = (wert: string) => `=?UTF-8?B?${Buffer.from(wert, 'utf8').toString('base64')}?=`;
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

/** "Name <adresse>" with the name encoded, so umlauts survive. */
function adresse(wert: string): string {
  const treffer = /^(.*)<([^>]+)>\s*$/.exec(wert);
  return treffer && treffer[1].trim() ? `${kodiert(treffer[1].trim())} <${treffer[2]}>` : wert;
}

/**
 * RFC 2822 message, UTF-8 throughout, base64url for the Gmail API. With `html` it is multipart/alternative:
 * mail clients show the HTML, the plain text stays for clients and filters that prefer it.
 */
export function rohMail(k: Pick<MailKonfig, 'absender' | 'antwortAn'>, mail: Mail, grenze = `velonify-${Date.now().toString(36)}`): string {
  const kopf = [`From: ${adresse(k.absender)}`, `To: ${mail.an}`, ...(k.antwortAn ? [`Reply-To: ${k.antwortAn}`] : []), `Subject: ${kodiert(mail.betreff)}`, 'MIME-Version: 1.0'];
  const teil = (typ: string, inhalt: string) => [`Content-Type: ${typ}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(inhalt)];
  const zeilen = mail.html
    ? [...kopf, `Content-Type: multipart/alternative; boundary="${grenze}"`, '', `--${grenze}`, ...teil('text/plain', mail.text), `--${grenze}`, ...teil('text/html', mail.html), `--${grenze}--`, '']
    : [...kopf, ...teil('text/plain', mail.text)];
  return Buffer.from(zeilen.join('\r\n'), 'utf8').toString('base64url');
}

export class Mailer {
  private readonly token: () => Promise<string>;

  constructor(
    private readonly konfig: MailKonfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.token = nutzerToken({ ...konfig, wofuer: 'Gmail' }, fetchFn);
  }

  async sende(mail: Mail): Promise<void> {
    const antwort = await this.fetchFn(GMAIL_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rohMail(this.konfig, mail) }),
    });
    if (!antwort.ok) throw new Error(`Gmail hat die Mail nicht angenommen (${antwort.status}): ${await antwort.text()}`);
  }
}
