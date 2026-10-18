import { Mailer, type MailKonfig } from '../../../gemeinsam/google';
import type { Mail } from './magnete';

export { rohMail } from '../../../gemeinsam/google';
export type GmailKonfig = MailKonfig;

/** Sends through the Gmail API with a refresh token (only gmail.send), like the client portal does. */
export function gmailVersand(k: GmailKonfig, fetchFn: typeof fetch = fetch): (mail: Mail) => Promise<void> {
  const mailer = new Mailer(k, fetchFn);
  return (mail) => mailer.sende(mail);
}
