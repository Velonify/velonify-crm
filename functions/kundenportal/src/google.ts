/**
 * Google access of the portal function: Sheets and Drive with the function's own service account (the token comes
 * from the metadata server, no key file), the login mail with a refresh token of the mailbox hallo@velonify.de.
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

export interface MailKonfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** e.g. "Velonify <hallo@velonify.de>" */
  absender: string;
}

/**
 * RFC 2822 message, UTF-8 throughout, base64url for the Gmail API. With `html` it is multipart/alternative:
 * mail clients show the HTML, the plain text stays for clients and filters that prefer it.
 */
export function rohMail(absender: string, an: string, betreff: string, text: string, html?: string): string {
  const kodiert = (wert: string) => `=?UTF-8?B?${Buffer.from(wert, 'utf8').toString('base64')}?=`;
  const b64 = (wert: string) => Buffer.from(wert, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const kopf = [`From: ${absender}`, `To: ${an}`, `Subject: ${kodiert(betreff)}`, 'MIME-Version: 1.0'];
  const teil = (typ: string, inhalt: string) => [`Content-Type: ${typ}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(inhalt)];
  const zeilen = html
    ? (() => {
        const grenze = `velonify-${Date.now().toString(36)}`;
        return [
          ...kopf,
          `Content-Type: multipart/alternative; boundary="${grenze}"`,
          '',
          `--${grenze}`,
          ...teil('text/plain', text),
          `--${grenze}`,
          ...teil('text/html', html),
          `--${grenze}--`,
        ];
      })()
    : [...kopf, ...teil('text/plain', text)];
  return Buffer.from(zeilen.join('\r\n'), 'utf8').toString('base64url');
}

export class Mailer {
  private readonly token: () => Promise<string>;

  constructor(
    private readonly konfig: MailKonfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.token = gecacht(async () => {
      const antwort = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: konfig.clientId, client_secret: konfig.clientSecret, refresh_token: konfig.refreshToken, grant_type: 'refresh_token' }),
      });
      const daten = (await antwort.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
      if (!antwort.ok || !daten.access_token) throw new Error(`Gmail-Token fehlgeschlagen (${antwort.status}): ${daten.error ?? 'unbekannt'}`);
      return { access_token: daten.access_token, expires_in: daten.expires_in ?? 3600 };
    });
  }

  async sende(an: string, betreff: string, text: string, html?: string): Promise<void> {
    const antwort = await this.fetchFn(GMAIL_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rohMail(this.konfig.absender, an, betreff, text, html) }),
    });
    if (!antwort.ok) throw new Error(`Gmail hat die Mail nicht angenommen (${antwort.status}): ${await antwort.text()}`);
  }
}
