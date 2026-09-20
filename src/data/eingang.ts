import { findeDubletten, istFreemail, type DublettenTreffer } from './dubletten';
import { normalizeDomain, splitName } from './rules';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Anfrage, type Firma, type FirmaInput, type KontaktInput } from './types';

export const ANFRAGE_STATUS = { neu: 'neu', uebernommen: 'uebernommen', verworfen: 'verworfen' } as const;

export const istOffen = (anfrage: Anfrage) => anfrage.status !== ANFRAGE_STATUS.uebernommen && anfrage.status !== ANFRAGE_STATUS.verworfen;

/**
 * Domain of an inquiry: the shop address if someone filled it in, otherwise the domain of the email address.
 * A freemail address says nothing about the company, so it stays empty then.
 */
export function anfrageDomain(anfrage: Anfrage): string {
  const shop = normalizeDomain(anfrage.shop);
  if (shop) return shop;
  const ausMail = normalizeDomain(anfrage.email.split('@')[1] ?? '');
  return ausMail && !istFreemail(ausMail) ? ausMail : '';
}

/** Company name for a new firm: nobody types one into the form, so the domain has to do until someone corrects it. */
export const anfrageFirmenname = (anfrage: Anfrage) => anfrageDomain(anfrage) || anfrage.name.trim() || anfrage.email;

export function firmaAusAnfrage(anfrage: Anfrage, zustaendig = ''): FirmaInput {
  return {
    ...EMPTY_FIRMA_INPUT,
    name: anfrageFirmenname(anfrage),
    domain: anfrageDomain(anfrage),
    status: 'lead',
    email_allgemein: anfrage.email,
    quelle: anfrage.quelle || 'Website',
    zustaendig,
  };
}

export function kontaktAusAnfrage(anfrage: Anfrage): KontaktInput {
  const { vorname, nachname } = splitName(anfrage.name);
  return {
    ...EMPTY_KONTAKT_INPUT,
    vorname,
    // Somebody who leaves the name empty still needs a contact the email hangs on.
    nachname: nachname || (vorname ? '' : anfrage.email.split('@')[0]),
    email: anfrage.email,
    hauptkontakt: true,
  };
}

/** What the inquiry itself said, for the activity in the firm's timeline. */
export function anfrageText(anfrage: Anfrage): string {
  const teile = [`Anfrage über ${anfrage.quelle || 'die Website'}`];
  if (anfrage.shop) teile.push(`Shop: ${anfrage.shop}`);
  if (anfrage.themen) teile.push(`Themen: ${anfrage.themen}`);
  if (anfrage.nachricht) teile.push(anfrage.nachricht.trim());
  return teile.join('\n');
}

/** Firms that could already be the company behind an inquiry, so nobody creates a second one by accident. */
export function anfrageDubletten(anfrage: Anfrage, firmen: readonly Firma[]): DublettenTreffer[] {
  return findeDubletten(
    { name: anfrageFirmenname(anfrage), domain: anfrageDomain(anfrage), ust_id: '', register: '', email_allgemein: anfrage.email },
    firmen,
  );
}

/** Open inquiries first, newest first within each group. */
export function sortiereAnfragen(anfragen: readonly Anfrage[]): Anfrage[] {
  return [...anfragen].sort(
    (a, b) => Number(istOffen(b)) - Number(istOffen(a)) || b.eingegangen_am.localeCompare(a.eingegangen_am),
  );
}
