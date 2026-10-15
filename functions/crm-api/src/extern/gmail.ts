import type { Mail } from './magnete';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface GmailKonfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** e.g. "Lukas von Velonify <lukas@velonify.de>"; must be the mailbox of the refresh token or one of its send-as aliases. */
  absender: string;
  /** Optional Reply-To, when replies should land elsewhere than the sender. */
  antwortAn?: string;
}

const kodiert = (wert: string) => `=?UTF-8?B?${Buffer.from(wert, 'utf8').toString('base64')}?=`;
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

/** "Name <adresse>" with the name encoded, so umlauts survive. */
function adresse(wert: string): string {
  const treffer = /^(.*)<([^>]+)>\s*$/.exec(wert);
  return treffer && treffer[1].trim() ? `${kodiert(treffer[1].trim())} <${treffer[2]}>` : wert;
}

/** RFC 2822 message with a plain text and an HTML part, base64url for the Gmail API. */
export function rohMail(k: GmailKonfig, mail: Mail, grenze = `velonify-${Date.now().toString(36)}`): string {
  const zeilen = [
    `From: ${adresse(k.absender)}`,
    `To: ${mail.an}`,
    ...(k.antwortAn ? [`Reply-To: ${k.antwortAn}`] : []),
    `Subject: ${kodiert(mail.betreff)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${grenze}"`,
    '',
    `--${grenze}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(mail.text),
    `--${grenze}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(mail.html),
    `--${grenze}--`,
    '',
  ];
  return Buffer.from(zeilen.join('\r\n'), 'utf8').toString('base64url');
}

/** Sends through the Gmail API with a refresh token (only gmail.send), like the client portal does. */
export function gmailVersand(k: GmailKonfig, fetchFn: typeof fetch = fetch): (mail: Mail) => Promise<void> {
  let cache: { token: string; bis: number } | null = null;
  const token = async () => {
    if (cache && cache.bis > Date.now() + 60_000) return cache.token;
    const antwort = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: k.clientId, client_secret: k.clientSecret, refresh_token: k.refreshToken, grant_type: 'refresh_token' }),
    });
    const daten = (await antwort.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!antwort.ok || !daten.access_token) throw new Error(`Gmail-Token fehlgeschlagen (${antwort.status}): ${daten.error ?? 'unbekannt'}`);
    cache = { token: daten.access_token, bis: Date.now() + (daten.expires_in ?? 3600) * 1000 };
    return cache.token;
  };
  return async (mail) => {
    const antwort = await fetchFn(GMAIL_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rohMail(k, mail) }),
    });
    if (!antwort.ok) throw new Error(`Gmail hat die Mail nicht angenommen (${antwort.status}): ${await antwort.text()}`);
  };
}
