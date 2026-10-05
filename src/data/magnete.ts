import { ANFRAGE_STATUS } from './eingang';
import { ValidationError } from './errors';
import { normalizeDomain, splitName } from './rules';
import { findeDubletten, istFreemail, type DublettenTreffer } from './dubletten';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Firma, type FirmaInput, type KontaktInput, type Magnet, type MagnetInput, type MagnetLead } from './types';

/** Landing pages live on the website; the slug is the last part of the address. */
export const RESSOURCEN_BASIS = 'https://velonify.de/ressourcen/';

/** Same three states as an inquiry in the inbox. */
export const LEAD_STATUS = ANFRAGE_STATUS;

export const istOffenerLead = (lead: MagnetLead) => lead.status !== LEAD_STATUS.uebernommen && lead.status !== LEAD_STATUS.verworfen;

/** Shop systems the form offers, as the form sends them → value for `firmen.plattform`. */
export const SHOPSYSTEME: Record<string, string> = {
  shopify: 'Shopify',
  magento: 'Magento',
  shopware: 'Shopware',
  woocommerce: 'WooCommerce',
  anderes: 'Anderes',
  keins: 'Noch kein Shop',
};
export const shopsystemLabel = (wert: string) => SHOPSYSTEME[wert] ?? wert;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Addresses the website already uses for the pages after the form (_ressourcen/build.py, SEITEN). Every other
 * address of an active magnet gets its landing page from the template on the website, filled from this hub.
 */
export const RESERVIERTE_SLUGS = ['danke', 'newsletter', 'abmelden', 'abgemeldet', 'hoppla'];

export function prepareMagnet(input: MagnetInput, alle: readonly Magnet[], selfId?: string): MagnetInput {
  const clean: MagnetInput = {
    slug: input.slug.trim().toLowerCase(),
    titel: input.titel.trim(),
    beschreibung: input.beschreibung.trim(),
    stichwort: input.stichwort.trim().toLocaleUpperCase('de'),
    datei_url: input.datei_url.trim(),
    mail_betreff: input.mail_betreff.trim(),
    mail_text: input.mail_text.trim(),
    aktiv: input.aktiv,
    untertitel: input.untertitel.trim(),
    inhalt: input.inhalt.trim(),
    knopf: input.knopf.trim(),
    typ: input.typ === 'audit' ? 'audit' : 'datei',
    plaetze: input.typ === 'audit' && input.plaetze !== null && Number.isFinite(input.plaetze) ? Math.round(input.plaetze) : null,
  };
  if (!clean.titel) throw new ValidationError('titel', 'Bitte einen Titel eintragen.');
  if (!SLUG.test(clean.slug)) throw new ValidationError('slug', 'Nur Kleinbuchstaben, Ziffern und Bindestriche, z. B. shopify-skills.');
  if (RESERVIERTE_SLUGS.includes(clean.slug)) throw new ValidationError('slug', `„${clean.slug}“ ist schon eine feste Seite unter /ressourcen/. Bitte eine andere Adresse wählen.`);
  if (alle.some((m) => m.slug === clean.slug && m.id !== selfId)) throw new ValidationError('slug', 'Diese Adresse hat schon ein anderer Magnet.');
  if (clean.datei_url && !/^https:\/\//.test(clean.datei_url)) throw new ValidationError('datei_url', 'Der Link muss mit https:// anfangen.');
  if (clean.aktiv && clean.typ === 'datei' && !clean.datei_url) throw new ValidationError('datei_url', 'Ohne Datei-Link kann der Magnet nicht aktiv sein – die Mail hätte keinen Download.');
  if (clean.plaetze !== null && (clean.plaetze < 1 || clean.plaetze > 1000)) throw new ValidationError('plaetze', 'Plätze: eine Zahl zwischen 1 und 1000, oder leer für unbegrenzt.');
  if (clean.aktiv && !clean.untertitel) throw new ValidationError('untertitel', 'Ohne Untertitel kann der Magnet nicht aktiv sein – er steht oben auf der Landingpage und in der Vorschau der DM.');
  if (clean.knopf.length > 40) throw new ValidationError('knopf', 'Der Text auf dem Knopf darf höchstens 40 Zeichen lang sein.');
  return clean;
}

/** Link for the DM after a comment: the landing page with UTM parameters, so the CRM knows where the lead came from. */
export function dmLink(slug: string, quelle: 'linkedin' | 'instagram' = 'linkedin'): string {
  const params = new URLSearchParams({ utm_source: quelle, utm_medium: 'social', utm_campaign: slug, utm_content: 'dm' });
  return `${RESSOURCEN_BASIS}${slug}/?${params.toString()}`;
}

/** Ready-to-send DM; the name is filled in by hand, LinkedIn shows it anyway. */
export function dmText(magnet: Pick<Magnet, 'slug' | 'titel'> & Partial<Pick<Magnet, 'typ'>>, quelle: 'linkedin' | 'instagram' = 'linkedin'): string {
  if (magnet.typ === 'audit') {
    return [
      'Hey [Vorname], danke für deinen Kommentar!',
      `Hier kannst du deinen Shop für den „${magnet.titel}“ eintragen: ${dmLink(magnet.slug, quelle)}`,
      'Shop-Adresse und E-Mail rein, dann schauen wir ihn uns an und schicken dir den Report in den nächsten zwei Werktagen.',
    ].join('\n\n');
  }
  return [
    'Hey [Vorname], danke für deinen Kommentar!',
    `Hier ist der Link zu „${magnet.titel}“: ${dmLink(magnet.slug, quelle)}`,
    'E-Mail eintragen, dann kommt alles direkt in dein Postfach. Viel Spaß damit – und sag gern Bescheid, wie es dir hilft.',
  ].join('\n\n');
}

export interface MagnetZahlen {
  eintraege: number;
  /** Clicked the download link at least once. */
  geladen: number;
  /** Confirmed the newsletter and did not leave again. */
  newsletter: number;
  uebernommen: number;
  offen: number;
}

export function magnetZahlen(leads: readonly MagnetLead[]): MagnetZahlen {
  return {
    eintraege: leads.length,
    geladen: leads.filter((l) => l.download_am).length,
    newsletter: leads.filter(istNewsletterAbonnent).length,
    uebernommen: leads.filter((l) => l.status === LEAD_STATUS.uebernommen).length,
    offen: leads.filter(istOffenerLead).length,
  };
}

export const istNewsletterAbonnent = (lead: MagnetLead) => Boolean(lead.newsletter_bestaetigt_am) && !lead.newsletter_abgemeldet_am;

/** Where a sign-up came from, as a short label: "LinkedIn", "Instagram" or "direkt". */
export function herkunftLabel(lead: Pick<MagnetLead, 'utm_source'>): string {
  const quelle = lead.utm_source.trim().toLowerCase();
  if (!quelle) return 'direkt';
  if (quelle === 'linkedin') return 'LinkedIn';
  if (quelle === 'instagram') return 'Instagram';
  return lead.utm_source.trim();
}

/** `firmen.quelle` for a lead taken over, e.g. "LinkedIn · Magnet shopify-skills". */
export const leadQuelle = (lead: MagnetLead) => `${herkunftLabel(lead)} · Magnet ${lead.magnet}`;

/** Domain of the shop; without one the e-mail domain, unless it is a freemail address. */
export function leadDomain(lead: MagnetLead): string {
  const shop = normalizeDomain(lead.shop);
  if (shop) return shop;
  const ausMail = normalizeDomain(lead.email.split('@')[1] ?? '');
  return ausMail && !istFreemail(ausMail) ? ausMail : '';
}

export const leadFirmenname = (lead: MagnetLead) => leadDomain(lead) || lead.vorname.trim() || lead.email;

/** Firms that could already be the company behind a sign-up. */
export const leadDubletten = (lead: MagnetLead, firmen: readonly Firma[]): DublettenTreffer[] =>
  findeDubletten({ name: leadFirmenname(lead), domain: leadDomain(lead), ust_id: '', register: '', email_allgemein: lead.email }, firmen);

const PLATTFORM: Record<string, string> = { shopify: 'shopify', magento: 'magento', shopware: 'shopware', woocommerce: 'woocommerce' };

export function firmaAusLead(lead: MagnetLead, zustaendig = ''): FirmaInput {
  return {
    ...EMPTY_FIRMA_INPUT,
    name: leadFirmenname(lead),
    domain: leadDomain(lead),
    status: 'lead',
    plattform: PLATTFORM[lead.shopsystem] ?? '',
    email_allgemein: lead.email,
    quelle: leadQuelle(lead),
    zustaendig,
  };
}

export function kontaktAusLead(lead: MagnetLead): KontaktInput {
  // The form asks for the first name only; somebody who types the full name gets it split.
  const name = lead.vorname.trim();
  const { vorname, nachname } = name.includes(' ') ? splitName(name) : { vorname: name, nachname: '' };
  return {
    ...EMPTY_KONTAKT_INPUT,
    vorname,
    nachname: vorname || nachname ? nachname : lead.email.split('@')[0],
    email: lead.email,
    hauptkontakt: true,
  };
}

/** Timeline entry of the firm: which magnet, from where, what was done with it. */
export function leadText(lead: MagnetLead, magnet?: Pick<Magnet, 'titel'> & Partial<Pick<Magnet, 'typ'>>): string {
  const teile = [`Lead-Magnet „${magnet?.titel || lead.magnet}“ angefordert (${herkunftLabel(lead)})`];
  if (lead.shop) teile.push(`Shop: ${lead.shop}`);
  if (lead.shopsystem) teile.push(`Shopsystem: ${shopsystemLabel(lead.shopsystem)}`);
  if (magnet?.typ === 'audit') {
    if (lead.report_gesendet_am) teile.push(`Report gesendet am ${lead.report_gesendet_am.slice(0, 10)}${lead.report_von ? ` von ${lead.report_von}` : ''}`);
    if (lead.report_geoeffnet_am) teile.push(`Report ${lead.report_aufrufe ?? 1}× geöffnet`);
  } else {
    teile.push(lead.download_am ? 'Download geöffnet' : 'Download noch nicht geöffnet');
  }
  if (istNewsletterAbonnent(lead)) teile.push('Newsletter bestätigt');
  return teile.join('\n');
}

/** Open sign-ups first, newest first within each group. */
export function sortiereLeads(leads: readonly MagnetLead[]): MagnetLead[] {
  return [...leads].sort((a, b) => Number(istOffenerLead(b)) - Number(istOffenerLead(a)) || b.eingegangen_am.localeCompare(a.eingegangen_am));
}

const csvZelle = (wert: string) => (/[";\n]/.test(wert) ? `"${wert.replace(/"/g, '""')}"` : wert);

/**
 * Confirmed newsletter subscribers as CSV for the mail tool, with the proof of consent (when ticked, which
 * wording, when confirmed). One line per address. What counts is the latest event of the address across all its
 * sign-ups: confirmed after the last unsubscribe → in the list; unsubscribed afterwards → out.
 */
export function newsletterCsv(leads: readonly MagnetLead[]): string {
  const proAdresse = new Map<string, { lead: MagnetLead; abgemeldet: string }>();
  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    const eintrag = proAdresse.get(email) ?? { lead: null as unknown as MagnetLead, abgemeldet: '' };
    if (lead.newsletter_abgemeldet_am > eintrag.abgemeldet) eintrag.abgemeldet = lead.newsletter_abgemeldet_am;
    // The latest confirmation is the one that is still valid.
    if (lead.newsletter_bestaetigt_am && (!eintrag.lead || lead.newsletter_bestaetigt_am > eintrag.lead.newsletter_bestaetigt_am)) eintrag.lead = lead;
    proAdresse.set(email, eintrag);
  }
  const kopf = ['email', 'vorname', 'shop', 'shopsystem', 'magnet', 'eingetragen_am', 'bestaetigt_am', 'einwilligungstext'];
  const zeilen = [...proAdresse.entries()]
    .filter(([, e]) => e.lead && e.lead.newsletter_bestaetigt_am > e.abgemeldet)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, { lead: l }]) => [email, l.vorname, l.shop, l.shopsystem, l.magnet, l.eingegangen_am, l.newsletter_bestaetigt_am, l.newsletter_text]);
  return [kopf, ...zeilen].map((zeile) => zeile.map(csvZelle).join(';')).join('\n');
}
