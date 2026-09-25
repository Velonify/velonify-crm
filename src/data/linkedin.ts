import { DEFAULT_DEAL_TITEL, EINSTELLUNG } from './constants';
import { findeDubletten, type DublettenTreffer } from './dubletten';
import { AuthExpiredError } from './errors';
import { BEREICHE } from './leadFinder';
import { nameAusLinkedin, normalizeDomain } from './rules';
import type { Database, FirmaInput, KontaktInput } from './types';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT } from './types';

/*
 * Lead from a LinkedIn link. The Cloud Function "shop-audit" reads the job ad or profile through Apify under
 * /linkedin and lets Claude sort it (functions/shop-audit/src/linkedin.ts); nothing is written until a person
 * checks the prefilled form.
 */

export type LinkArt = 'job' | 'profil' | 'firma';

/** What /linkedin returns (LinkedinLead in functions/shop-audit/src/linkedin.ts). */
export interface LinkedinLead {
  art: LinkArt;
  url: string;
  firma: { name: string; domain: string; ort: string; linkedin: string; mitarbeiter: number | null; branche: string };
  kontakt: { vorname: string; nachname: string; rolle: string; email: string; email_qualitaet: number | null; linkedin: string } | null;
  stelle: { titel: string; ort: string; datum: string } | null;
  anlass: string;
  ansprechpartner_tipp: string;
  passung: { stufe: 'gut' | 'mittel' | 'schwach' | ''; text: string };
  deal_titel: string;
  zusammenfassung: string;
  hinweis: string;
  modell: string;
}

export const ART_LABEL: Record<LinkArt, string> = { job: 'Stellenanzeige', profil: 'Profil', firma: 'Firmenseite' };

/** Only the link types the function reads; anything else is caught before a paid call. */
export function istLinkedinLink(eingabe: string): boolean {
  const text = eingabe.trim();
  if (!text) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.toLowerCase();
    return (host === 'linkedin.com' || host.endsWith('.linkedin.com')) && /^\/(jobs|in|company|school|showcase)\//.test(url.pathname);
  } catch {
    return false;
  }
}

/** Deal titles to choose from: the team's default first, then the lead finder's lenses. */
export function dealTitelListe(db: Database): string[] {
  return [...new Set([db.einstellungen[EINSTELLUNG.dealTitel] || DEFAULT_DEAL_TITEL, ...BEREICHE.map((b) => b.deal)])];
}

/** Line for the firm's timeline and note: where the lead came from and why it matters. */
export function vermerkText(lead: LinkedinLead, anlass: string): string {
  const quelle = lead.stelle ? `LinkedIn-Stellenanzeige „${lead.stelle.titel}“${lead.stelle.datum ? ` vom ${lead.stelle.datum.split('-').reverse().join('.')}` : ''}` : `LinkedIn-${ART_LABEL[lead.art]}`;
  return [`Lead aus ${quelle}: ${lead.url}`, anlass.trim()].filter(Boolean).join('\n');
}

export interface LinkedinVorschlag {
  firma: FirmaInput;
  kontakt: KontaktInput | null;
  dealTitel: string;
  anlass: string;
  /** Firms already in the CRM that look like this one; the first is preselected. */
  treffer: DublettenTreffer[];
}

/** Prefills the form: a new firm from the lead, or the firm that is already in the CRM. */
export function vorschlag(lead: LinkedinLead, db: Database, zustaendig: string): LinkedinVorschlag {
  const domain = normalizeDomain(lead.firma.domain);
  const firma: FirmaInput = {
    ...EMPTY_FIRMA_INPUT,
    name: lead.firma.name || domain,
    domain,
    ort: lead.firma.ort,
    quelle: lead.art === 'job' ? 'LinkedIn-Stellenanzeige' : 'LinkedIn',
    zustaendig,
  };
  const aktive = db.firmen.filter((f) => !f.archiviert);
  const perDomain = domain ? aktive.find((f) => normalizeDomain(f.domain) === domain) : undefined;
  const treffer = [
    ...(perDomain ? [{ firma: perDomain, gruende: ['gleiche Domain'] }] : []),
    ...findeDubletten(firma, aktive).filter((t) => t.firma.id !== perDomain?.id),
  ];
  const k = lead.kontakt;
  const kontakt: KontaktInput | null = k
    ? { ...EMPTY_KONTAKT_INPUT, vorname: k.vorname, nachname: k.nachname, rolle: k.rolle, email: k.email, linkedin: k.linkedin }
    : lead.art === 'profil'
      ? { ...EMPTY_KONTAKT_INPUT, ...nameAusLinkedin(lead.url), linkedin: lead.url }
      : null;
  return { firma, kontakt, dealTitel: lead.deal_titel || dealTitelListe(db)[0], anlass: lead.anlass, treffer };
}

// ─── Cloud Function ──────────────────────────────────────────────────────────

export interface LinkedinApi {
  lies(url: string, dealTitel: string[]): Promise<LinkedinLead>;
}

export class CloudLinkedin implements LinkedinApi {
  constructor(
    private readonly basisUrl: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  async lies(url: string, dealTitel: string[]): Promise<LinkedinLead> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(`${this.basisUrl.replace(/\/$/, '')}/linkedin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, deal_titel: dealTitel }),
      });
    } catch {
      throw new Error('Der LinkedIn-Abruf ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.');
    }
    const json = (await antwort.json().catch(() => null)) as (LinkedinLead & { fehler?: string }) | null;
    if (antwort.status === 401 && /abgelaufen|nicht angemeldet/i.test(json?.fehler ?? '')) throw new AuthExpiredError();
    if (!antwort.ok || !json?.firma) throw new Error(json?.fehler ?? `Der LinkedIn-Abruf hat mit Fehler ${antwort.status} geantwortet.`);
    return json;
  }
}

/** Demo mode: an invented job ad or profile, depending on the link. LinkedIn is not contacted. */
export class DemoLinkedin implements LinkedinApi {
  constructor(private readonly dauerMs = 1200) {}

  async lies(url: string, dealTitel: string[]): Promise<LinkedinLead> {
    await new Promise((resolve) => setTimeout(resolve, this.dauerMs));
    if (!istLinkedinLink(url)) throw new Error('Bitte einen Link zu einer Stellenanzeige, einem Profil oder einer Firmenseite auf linkedin.com einfügen.');
    const profil = /\/in\//.test(url);
    const basis = {
      url: url.split('?')[0],
      firma: { name: 'Beispiel Spielwaren', domain: 'beispiel-spielwaren.de', ort: 'Köln', linkedin: 'https://www.linkedin.com/company/beispiel', mitarbeiter: 85, branche: 'Einzelhandel' },
      passung: { stufe: 'gut' as const, text: 'Eigener D2C-Shop mit Marktplätzen, E-Commerce ist Kerngeschäft. (Beispiel aus dem Demo-Modus)' },
      deal_titel: dealTitel[0] ?? DEFAULT_DEAL_TITEL,
      hinweis: '',
      modell: 'demo',
    };
    if (profil) {
      const name = nameAusLinkedin(url) ?? { vorname: 'Erika', nachname: 'Beispiel' };
      return {
        ...basis,
        art: 'profil',
        kontakt: { ...name, rolle: 'Leitung E-Commerce', email: `${name.vorname.toLowerCase()}@beispiel-spielwaren.de`, email_qualitaet: 80, linkedin: basis.url },
        stelle: null,
        anlass: 'Verantwortet seit einem halben Jahr den Onlineshop und die Marktplätze. Im Profil nennt sie den Relaunch des Shops als aktuelles Projekt.',
        ansprechpartner_tipp: '',
        zusammenfassung: 'Leitung E-Commerce bei Beispiel Spielwaren',
      };
    }
    return {
      ...basis,
      art: 'job',
      kontakt: null,
      stelle: { titel: 'Head of E-Commerce (m/w/d)', ort: 'Köln', datum: '2026-09-15' },
      anlass: 'Beispiel Spielwaren sucht eine neue Leitung für Onlineshop und Marktplätze, die das Wachstum im D2C-Kanal verantwortet. Ein guter Zeitpunkt, bevor die neue Person ihre Dienstleister festlegt.',
      ansprechpartner_tipp: 'Die Geschäftsführung, an die die Stelle berichtet.',
      zusammenfassung: 'Sucht Head of E-Commerce in Köln',
    };
  }
}
