import type { Db, DbPool } from '../../../../src/data/postgres/postgresStore';
import { aendern, alle, einfuegen, ergebnis, feld, neueId, neuesToken, wahr, type Ergebnis, type Zeile } from './tabelle';

/**
 * Lead magnets (former apps-script/magnete): sign-ups from velonify.de/ressourcen/<slug>/ into `magnet_leads` with the
 * download mail, the clicks on the mail's links, the landing page texts and the Shop-Roast report. Called only by the
 * website's Netlify functions, with the same actions and answers the Apps Script had.
 *
 * Instead of LockService, every action runs in a transaction holding an advisory lock, so two sign-ups in the same
 * second cannot both take the last free place or both send a mail.
 */

// The same address gets the mail again at most every 10 minutes …
const ERNEUT_NACH_MS = 10 * 60 * 1000;
// … and at most 5 mails a day, whatever the magnet.
const MAILS_PRO_TAG = 5;
// Emergency brake should spam get through: at most this many download mails a day overall.
const MAILS_GESAMT_PRO_TAG = 300;

export interface Mail {
  an: string;
  betreff: string;
  text: string;
  html: string;
}

export interface MagnetKonfig {
  basis: string;
  signatur: string;
  sende(mail: Mail): Promise<void>;
}

type Lead = Zeile;
type Magnet = Zeile;

function gesperrt<T>(db: DbPool, arbeit: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaktion(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('magnete')), set_config('app.person', 'Website', true)`);
    return arbeit(tx);
  });
}

const istAudit = (magnet: Magnet | undefined) => !!magnet && String(magnet.typ ?? '').toLowerCase() === 'audit';

/** Empty = unlimited. */
function anzahlPlaetze(magnet: Magnet): number | null {
  const roh = magnet.plaetze;
  return roh === null || roh === undefined || String(roh).trim() === '' || !Number.isFinite(Number(roh)) ? null : Number(roh);
}

/** Like the hub (src/data/roast.ts, roastPlaetze): everyone except the waiting list and discarded ones. */
const vergebenePlaetze = (magnet: Magnet, leads: Lead[]) => leads.filter((l) => l.magnet === magnet.slug && !wahr(l.warteliste) && l.status !== 'verworfen').length;

function platzFrei(magnet: Magnet, leads: Lead[]): boolean {
  const plaetze = anzahlPlaetze(magnet);
  return plaetze === null || vergebenePlaetze(magnet, leads) < plaetze;
}

const mailsHeute = (leads: Lead[], email: string | null, jetzt: number) =>
  leads.filter((l) => (email === null || String(l.email).toLowerCase() === email) && l.mail_gesendet_am && jetzt - new Date(String(l.mail_gesendet_am)).getTime() < 24 * 3600 * 1000).length;

/** New sign-up from Netlify: create the row (or find it again) and send the mail. */
async function eintrag(db: DbPool, k: MagnetKonfig, einsendung: Record<string, unknown>): Promise<Ergebnis> {
  const felder = (einsendung.data ?? {}) as Record<string, unknown>;
  if (feld(felder, 'bot-field')) return ergebnis(200, 'Ignoriert.');
  const email = feld(felder, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ergebnis(400, 'Keine gültige E-Mail-Adresse.');
  const slug = feld(felder, 'magnet').toLowerCase();
  if (!slug) return ergebnis(400, 'Ohne Magnet weiß ich nicht, was ich schicken soll.');
  const einwilligung = Boolean(feld(felder, 'newsletter'));

  return gesperrt(db, async (tx) => {
    const magnet = (await alle(tx, 'magnete')).find((m) => m.slug === slug && !wahr(m.archiviert));
    const leads = await alle(tx, 'magnet_leads');
    const jetzt = new Date();
    const vorhanden = leads.find((l) => l.magnet === slug && String(l.email).toLowerCase() === email);
    let lead = vorhanden;
    let neuEingewilligt = false;
    if (!lead) {
      lead = {
        id: neueId('ML'),
        magnet: slug,
        eingegangen_am: String(einsendung.created_at ?? '') || jetzt.toISOString(),
        vorname: feld(felder, 'vorname'),
        email,
        shop: feld(felder, 'shop'),
        shopsystem: feld(felder, 'shopsystem'),
        utm_source: feld(felder, 'utm_source'),
        utm_medium: feld(felder, 'utm_medium'),
        utm_campaign: feld(felder, 'utm_campaign'),
        utm_content: feld(felder, 'utm_content'),
        token: neuesToken(),
        downloads: 0,
        newsletter_einwilligung: einwilligung,
        newsletter_text: einwilligung ? feld(felder, 'newsletter_text') : '',
        status: 'neu',
        warteliste: istAudit(magnet) && !platzFrei(magnet!, leads),
        report_aufrufe: 0,
        erstellt_am: jetzt.toISOString(),
        erstellt_von: 'Website',
        geaendert_am: jetzt.toISOString(),
        geaendert_von: 'Website',
      };
      await einfuegen(tx, 'magnet_leads', lead);
      leads.push(lead);
    } else if (einwilligung && !wahr(lead.newsletter_einwilligung)) {
      // Ticked the newsletter box the second time: consent counts from now, confirmed by mail.
      await aendern(tx, 'magnet_leads', lead, { newsletter_einwilligung: true, newsletter_text: feld(felder, 'newsletter_text'), newsletter_abgemeldet_am: '' });
      neuEingewilligt = true;
    }

    if (!magnet || !wahr(magnet.aktiv) || !(magnet.datei_url || istAudit(magnet))) return ergebnis(200, 'Gespeichert, Magnet ist nicht aktiv – keine Mail.');
    // Whoever just ticked the newsletter box needs the mail with the confirmation link right away.
    if (vorhanden && !neuEingewilligt && vorhanden.mail_gesendet_am && jetzt.getTime() - new Date(String(vorhanden.mail_gesendet_am)).getTime() < ERNEUT_NACH_MS) {
      return ergebnis(200, 'Mail ging gerade erst raus – nicht noch einmal.');
    }
    if (mailsHeute(leads, email, jetzt.getTime()) >= MAILS_PRO_TAG) return ergebnis(429, 'Zu viele Mails an diese Adresse heute.');
    if (mailsHeute(leads, null, jetzt.getTime()) >= MAILS_GESAMT_PRO_TAG) return ergebnis(429, 'Tageslimit für Download-Mails erreicht.');

    await k.sende(magnetMail(k, magnet, lead));
    await aendern(tx, 'magnet_leads', lead, { mail_gesendet_am: new Date().toISOString() });
    return ergebnis(200, vorhanden ? 'Mail erneut gesendet.' : 'Gespeichert, Mail gesendet.');
  });
}

async function mitLead(db: DbPool, token: unknown, aktion: (tx: Db, lead: Lead) => Promise<Ergebnis>): Promise<Ergebnis> {
  const t = String(token ?? '');
  if (!/^[a-f0-9]{32}$/.test(t)) return ergebnis(400, 'Ungültiger Link.');
  return gesperrt(db, async (tx) => {
    const [lead] = await alle(tx, 'magnet_leads', 'WHERE token = $1', [t]);
    return lead ? aktion(tx, lead) : ergebnis(404, 'Diesen Link kennen wir nicht.');
  });
}

/** Click on the download button: count it, return the file link. */
const download = (db: DbPool, token: unknown) =>
  mitLead(db, token, async (tx, lead) => {
    const [magnet] = await alle(tx, 'magnete', 'WHERE slug = $1', [lead.magnet]);
    if (!magnet || !magnet.datei_url) return ergebnis(404, 'Zu diesem Link gibt es keine Datei mehr.');
    await aendern(tx, 'magnet_leads', lead, { download_am: lead.download_am || new Date().toISOString(), downloads: (Number(lead.downloads) || 0) + 1 });
    return ergebnis(200, 'Download.', { ziel: magnet.datei_url });
  });

/** Newsletter confirmation (double opt-in). Only who ticked the box can confirm. */
const newsletter = (db: DbPool, token: unknown) =>
  mitLead(db, token, async (tx, lead) => {
    if (!wahr(lead.newsletter_einwilligung)) return ergebnis(409, 'Für diese Adresse wurde kein Newsletter angefragt.');
    await aendern(tx, 'magnet_leads', lead, {
      newsletter_bestaetigt_am: lead.newsletter_abgemeldet_am ? new Date().toISOString() : lead.newsletter_bestaetigt_am || new Date().toISOString(),
      newsletter_abgemeldet_am: '',
    });
    return ergebnis(200, 'Newsletter bestätigt.');
  });

/** Unsubscribe – for the address, not just this one entry. */
const abmelden = (db: DbPool, token: unknown) =>
  mitLead(db, token, async (tx, lead) => {
    const jetzt = new Date().toISOString();
    for (const l of await alle(tx, 'magnet_leads', 'WHERE lower(email) = $1', [String(lead.email).toLowerCase()])) {
      if (wahr(l.newsletter_einwilligung) && !l.newsletter_abgemeldet_am) await aendern(tx, 'magnet_leads', l, { newsletter_abgemeldet_am: jetzt });
    }
    return ergebnis(200, 'Abgemeldet.');
  });

/**
 * Landing page texts for the website. Only active magnets and only what is public on the page anyway; for audit
 * magnets with limited places also how many are free.
 */
async function inhalt(db: DbPool, slugRoh: unknown): Promise<Ergebnis> {
  const slug = String(slugRoh ?? '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return ergebnis(400, 'Ungültige Adresse.');
  const magnet = (await alle(db, 'magnete', 'WHERE slug = $1', [slug])).find((m) => wahr(m.aktiv) && !wahr(m.archiviert) && (m.datei_url || istAudit(m)));
  if (!magnet) return ergebnis(404, 'Kein aktiver Magnet unter dieser Adresse.');
  const plaetze = istAudit(magnet) ? anzahlPlaetze(magnet) : null;
  const leads = plaetze === null ? [] : await alle(db, 'magnet_leads', 'WHERE magnet = $1', [slug]);
  return ergebnis(200, 'Inhalt.', {
    titel: String(magnet.titel ?? ''),
    untertitel: String(magnet.untertitel ?? ''),
    inhalt: String(magnet.inhalt ?? ''),
    knopf: String(magnet.knopf ?? ''),
    typ: istAudit(magnet) ? 'audit' : 'datei',
    plaetze,
    frei: plaetze === null ? null : Math.max(0, plaetze - vergebenePlaetze(magnet, leads)),
  });
}

/** The released Shop-Roast report for velonify.de/roast/<token>/. Every call counts, except previews (zaehlen: false). */
const report = (db: DbPool, token: unknown, zaehlen: boolean) =>
  mitLead(db, token, async (tx, lead) => {
    if (!lead.report_freigegeben_am || !lead.report) return ergebnis(404, 'Diesen Report gibt es (noch) nicht.');
    let inhalt: unknown;
    try {
      inhalt = JSON.parse(String(lead.report));
    } catch {
      return ergebnis(500, 'Der Report ist beschädigt.');
    }
    if (zaehlen) {
      await aendern(tx, 'magnet_leads', lead, { report_geoeffnet_am: lead.report_geoeffnet_am || new Date().toISOString(), report_aufrufe: (Number(lead.report_aufrufe) || 0) + 1 });
    }
    return ergebnis(200, 'Report.', {
      vorname: String(lead.vorname ?? ''),
      shop: String(lead.shop ?? ''),
      von: String(lead.report_von ?? ''),
      freigegeben_am: String(lead.report_freigegeben_am),
      report: inhalt,
    });
  });

export function behandleMagnet(db: DbPool, k: MagnetKonfig, koerper: unknown): Promise<Ergebnis> {
  const b = (koerper ?? {}) as Record<string, unknown>;
  switch (b.aktion) {
    case 'eintrag':
      return eintrag(db, k, (b.payload ?? {}) as Record<string, unknown>);
    case 'download':
      return download(db, b.token);
    case 'newsletter':
      return newsletter(db, b.token);
    case 'abmelden':
      return abmelden(db, b.token);
    case 'inhalt':
      return inhalt(db, b.magnet);
    case 'report':
      return report(db, b.token, b.zaehlen !== false);
    default:
      return Promise.resolve(ergebnis(400, 'Unbekannte Aktion.'));
  }
}

// ─── Mail ──────────────────────────────────────────────────────────────────

/** "https://www.shop.de/kategorie" → "shop.de" */
const shopName = (url: unknown) => String(url ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '');
const esc = (text: unknown) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function magnetMail(k: MagnetKonfig, magnet: Magnet, lead: Lead): Mail {
  const basis = k.basis;
  const audit = istAudit(magnet);
  const titel = String(magnet.titel ?? '');
  const downloadUrl = audit ? '' : `${basis}/m/d/${lead.token}`;
  const newsletterUrl = `${basis}/ressourcen/newsletter/?t=${lead.token}`;
  const zeigeNewsletter = wahr(lead.newsletter_einwilligung) && !lead.newsletter_bestaetigt_am;
  const vorname = String(lead.vorname ?? '').trim();
  const anrede = vorname ? `Hi ${vorname},` : 'Hi,';
  const eigenerText = String(magnet.mail_text ?? '').trim();
  let absaetze: string[];
  let betreff: string;
  if (audit) {
    const shop = shopName(lead.shop) || 'deinen Shop';
    if (wahr(lead.warteliste)) {
      absaetze = [
        `danke für deine Anmeldung zum „${titel}“! Die Plätze für diese Runde sind leider schon vergeben.`,
        `Wir haben ${shop} auf die Warteliste gesetzt und melden uns, sobald wir wieder Shops prüfen.`,
      ];
      betreff = `${titel}: du stehst auf der Warteliste`;
    } else {
      absaetze = eigenerText
        ? eigenerText.split(/\n\s*\n/)
        : [
            `danke, dass du uns ${shop} zeigst! Wir prüfen den Shop in vier Bereichen: Plattform und Version, Geschwindigkeit, Tracking und E-Mail-Marketing, Shop-Basics und SEO. Dazu schreibt dir jemand aus unserem Team drei eigene Beobachtungen.`,
            'Innerhalb von zwei Werktagen bekommst du den Report per Mail.',
          ];
      betreff = String(magnet.mail_betreff ?? '').trim() || `${titel}: wir schauen uns ${shop} an`;
    }
  } else {
    absaetze = eigenerText ? eigenerText.split(/\n\s*\n/) : [`danke für dein Interesse! Hier ist wie versprochen „${titel}“.`];
    betreff = String(magnet.mail_betreff ?? '').trim() || `Dein Download: ${titel}`;
  }

  const text = [anrede, '', ...absaetze.map((a) => `${a}\n`)];
  if (downloadUrl) text.push(`Zum Download: ${downloadUrl}`, '');
  if (zeigeNewsletter) text.push('Du wolltest außerdem unseren Newsletter. Bitte bestätige das noch mit einem Klick, erst dann tragen wir dich ein:', newsletterUrl, '');
  text.push('Wenn Fragen auftauchen: Antworte einfach auf diese Mail, sie landet direkt bei mir.', '', 'Viele Grüße', k.signatur, `Velonify · ${basis.replace(/^https?:\/\//, '')}`, '');
  text.push(`Du bekommst diese Mail, weil diese Adresse auf velonify.de für „${titel}“ eingetragen wurde. Warst du das nicht, ignoriere sie einfach.`);

  return { an: String(lead.email), betreff, text: text.join('\n'), html: mailHtml({ anrede, absaetze, titel, downloadUrl, newsletterUrl: zeigeNewsletter ? newsletterUrl : '', signatur: k.signatur, basis }) };
}

function mailHtml(m: { anrede: string; absaetze: string[]; titel: string; downloadUrl: string; newsletterUrl: string; signatur: string; basis: string }): string {
  const bordeaux = '#45142D';
  const schrift = "font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;";
  const p = (inhalt: string, extra = '') => `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.55; color: #1E1A1C; ${extra}">${inhalt}</p>`;
  const knopf = (url: string, beschriftung: string, voll: boolean) => {
    const stil = voll ? `background: ${bordeaux}; color: #FFFFFF; border: 2px solid ${bordeaux};` : `background: #FFFFFF; color: ${bordeaux}; border: 2px solid ${bordeaux};`;
    return `<p style="margin: 8px 0 24px;"><a href="${esc(url)}" style="display: inline-block; padding: 14px 22px; font-size: 15px; font-weight: 700; text-decoration: none; ${stil}">${esc(beschriftung)}</a></p>`;
  };
  const inhalt = [p(esc(m.anrede)), ...m.absaetze.map((a) => p(esc(a.trim()).replace(/\n/g, '<br>')))];
  if (m.downloadUrl) inhalt.push(knopf(m.downloadUrl, 'Jetzt herunterladen', true));
  if (m.newsletterUrl) {
    inhalt.push('<hr style="border: 0; border-top: 1px solid #E4DDE0; margin: 8px 0 24px;">');
    inhalt.push(p('Du wolltest außerdem unseren Newsletter. Bitte bestätige das noch mit einem Klick – erst dann tragen wir dich ein:'));
    inhalt.push(knopf(m.newsletterUrl, 'Newsletter bestätigen', false));
    inhalt.push(p('Kein Interesse mehr? Dann ignoriere diesen Teil einfach, du bekommst nur den Download.', 'font-size: 14px; color: #6B6266;'));
  }
  inhalt.push(p('Wenn Fragen auftauchen: Antworte einfach auf diese Mail, sie landet direkt bei mir.'));
  inhalt.push(p(`Viele Grüße<br><strong>${esc(m.signatur)}</strong><br>Velonify`));
  const fuss =
    `Du bekommst diese Mail, weil diese Adresse auf velonify.de für „${esc(m.titel)}“ eingetragen wurde. ` +
    'Warst du das nicht, ignoriere sie einfach – wir schreiben dir nichts weiter.<br>' +
    `<a href="${m.basis}/impressum/" style="color: #6B6266;">Impressum</a> · <a href="${m.basis}/datenschutz/" style="color: #6B6266;">Datenschutz</a>`;
  return (
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin: 0; padding: 0; background: #F4F1F2;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #F4F1F2;"><tr><td align="center" style="padding: 32px 16px;">' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #FFFFFF; ${schrift}">` +
    `<tr><td style="padding: 28px 32px 8px;"><img src="${m.basis}/assets/img/velonify-wordmark-bordeaux.png" alt="Velonify" height="22" style="height: 22px; width: auto; display: block;"></td></tr>` +
    `<tr><td style="padding: 20px 32px 12px;">${inhalt.join('')}</td></tr>` +
    '</table>' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; ${schrift}"><tr><td style="padding: 16px 32px; font-size: 12px; line-height: 1.5; color: #6B6266;">${fuss}</td></tr></table>` +
    '</td></tr></table></body></html>'
  );
}
