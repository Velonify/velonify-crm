import { befundeVon, nichtGeprueftVon, plattformLabel, sekunden, type Bereich, type Schwere } from './audit';
import { EOL_LABEL } from './constants';
import { ValidationError } from './errors';
import type { Audit, Magnet, MagnetLead } from './types';

/*
 * Shop-Roast: a lead magnet of type "audit". The shop gets checked with the shop audit, the team writes a report
 * from the findings, and the report is shown on velonify.de/roast/<token>/. The report is stored as JSON in
 * `magnet_leads.report` and contains everything the page shows – the website never reads the `audits` tab.
 * Concept: Hub-Intern/Shop-Audit/Shop-Roast - Konzept.md in the vault.
 */

export const ROAST_BASIS = 'https://velonify.de/roast/';
export const reportLink = (lead: Pick<MagnetLead, 'token'>) => `${ROAST_BASIS}${lead.token}/`;

export const istAuditMagnet = (magnet?: Pick<Magnet, 'typ'>) => magnet?.typ === 'audit';

/** Traffic light of one area: red with a severe finding, yellow with a medium one, green otherwise. */
export type Ampel = 'rot' | 'gelb' | 'gruen' | 'offen';
export type RoastBereich = 'plattform' | 'geschwindigkeit' | 'marketing' | 'basics';

/** The four areas the report promises, each covering one or two areas of the audit. */
export const ROAST_BEREICHE: { wert: RoastBereich; label: string; audit: (Bereich | 'produktseite')[] }[] = [
  { wert: 'plattform', label: 'Plattform & Version', audit: ['plattform'] },
  { wert: 'geschwindigkeit', label: 'Geschwindigkeit', audit: ['geschwindigkeit'] },
  { wert: 'marketing', label: 'Tracking & E-Mail-Marketing', audit: ['tracking', 'email'] },
  { wert: 'basics', label: 'Shop-Basics & SEO', audit: ['shop', 'seo', 'produktseite'] },
];
export const roastBereichVon = (bereich: string): RoastBereich => ROAST_BEREICHE.find((b) => (b.audit as string[]).includes(bereich))?.wert ?? 'basics';

export interface ReportPunkt {
  befund_id: string;
  bereich: RoastBereich;
  schwere: Schwere;
  titel: string;
  text: string;
}

export interface Beobachtung {
  titel: string;
  text: string;
}

export interface ReportBereich {
  bereich: RoastBereich;
  label: string;
  ampel: Ampel;
  /** Why the area could not be checked, if so. */
  hinweis: string;
  punkte: ReportPunkt[];
}

export interface Kennzahl {
  label: string;
  wert: string;
}

/** What the report page on velonify.de shows. Version 1. */
export interface Report {
  version: 1;
  domain: string;
  geprueft_am: string;
  kennzahlen: Kennzahl[];
  einleitung: string;
  punkte: ReportPunkt[];
  beobachtungen: Beobachtung[];
  fazit: string;
  /** Built from `punkte` on every save, so the page only renders. */
  bereiche: ReportBereich[];
}

export const BEOBACHTUNGEN = 3;
const leereBeobachtungen = (): Beobachtung[] => Array.from({ length: BEOBACHTUNGEN }, () => ({ titel: '', text: '' }));

export function ampelVon(punkte: readonly Pick<ReportPunkt, 'schwere'>[], offen: boolean): Ampel {
  if (punkte.some((p) => p.schwere === 'hoch')) return 'rot';
  if (punkte.some((p) => p.schwere === 'mittel')) return 'gelb';
  return offen && punkte.length === 0 ? 'offen' : 'gruen';
}

export const AMPEL_LABEL: Record<Ampel, string> = { rot: 'Dringend', gelb: 'Luft nach oben', gruen: 'Passt', offen: 'Nicht geprüft' };

function kennzahlenVon(audit: Audit): Kennzahl[] {
  const zahlen: Kennzahl[] = [];
  if (audit.plattform && audit.plattform !== 'unbekannt') {
    const version = audit.version && audit.version !== '1' ? ` ${audit.version}` : '';
    zahlen.push({ label: 'Shopsystem', wert: `${plattformLabel(audit.plattform)}${version}` });
    if (audit.eol && audit.eol !== 'unknown') zahlen.push({ label: 'Support', wert: EOL_LABEL[audit.eol] ?? audit.eol });
  }
  if (audit.score_mobil !== null) zahlen.push({ label: 'PageSpeed mobil', wert: `${audit.score_mobil} / 100` });
  if (audit.score_desktop !== null) zahlen.push({ label: 'PageSpeed Desktop', wert: `${audit.score_desktop} / 100` });
  if (audit.lcp_mobil_ms !== null) zahlen.push({ label: audit.messquelle === 'feld' ? 'Ladezeit mobil (echte Besucher)' : 'Ladezeit mobil (Messung)', wert: sekunden(audit.lcp_mobil_ms) });
  return zahlen;
}

/** Areas with their traffic light, from the points that are left after editing. */
export function bereicheVon(punkte: readonly ReportPunkt[], audit: Pick<Audit, 'nicht_geprueft'>): ReportBereich[] {
  const nicht = nichtGeprueftVon(audit as Audit);
  return ROAST_BEREICHE.map((b) => {
    const eigene = punkte.filter((p) => p.bereich === b.wert);
    // The product page is optional; only a whole area that could not be checked turns grey.
    const offen = nicht.filter((n) => n.bereich !== 'produktseite' && (b.audit as string[]).includes(n.bereich));
    return { bereich: b.wert, label: b.label, ampel: ampelVon(eigene, offen.length > 0), hinweis: offen.map((n) => n.grund).join(' '), punkte: eigene };
  });
}

/** First draft from the audit: every finding becomes a point with its plain text, the team or Claude rewrites it. */
export function reportEntwurf(audit: Audit): Report {
  const rang = { hoch: 0, mittel: 1, hinweis: 2 };
  const punkte = befundeVon(audit)
    .sort((a, b) => rang[a.schwere] - rang[b.schwere])
    .map((b): ReportPunkt => ({ befund_id: b.id, bereich: roastBereichVon(b.bereich), schwere: b.schwere, titel: '', text: b.text }));
  return {
    version: 1,
    domain: audit.domain,
    geprueft_am: audit.geprueft_am,
    kennzahlen: kennzahlenVon(audit),
    einleitung: '',
    punkte,
    beobachtungen: leereBeobachtungen(),
    fazit: '',
    bereiche: bereicheVon(punkte, audit),
  };
}

export function reportVon(lead: Pick<MagnetLead, 'report'>): Report | null {
  if (!lead.report) return null;
  try {
    const r = JSON.parse(lead.report) as Report;
    return r && r.version === 1 ? { ...r, beobachtungen: [...r.beobachtungen, ...leereBeobachtungen()].slice(0, BEOBACHTUNGEN) } : null;
  } catch {
    return null;
  }
}

/** What Claude wrote for the shop owner (functions/shop-audit, route /roast). */
export interface RoastTexte {
  einleitung: string;
  punkte: { befund_id: string; titel: string; text: string }[];
  fazit: string;
}

/** Puts Claude's texts into the draft; points Claude left out keep what they had. */
export function mitTexten(report: Report, texte: RoastTexte): Report {
  const neu = new Map(texte.punkte.map((p) => [p.befund_id, p]));
  return {
    ...report,
    einleitung: texte.einleitung || report.einleitung,
    fazit: texte.fazit || report.fazit,
    punkte: report.punkte.map((p) => {
      const t = neu.get(p.befund_id);
      return t ? { ...p, titel: t.titel || p.titel, text: t.text || p.text } : p;
    }),
  };
}

const MAX = { einleitung: 800, fazit: 800, titel: 120, text: 900 };

/** Trims, drops empty points and rebuilds the areas. Throws when something is far too long for the page. */
export function bereinigeReport(report: Report, audit: Pick<Audit, 'nicht_geprueft'>): Report {
  const zuLang = (feld: string, wert: string, max: number) => {
    if (wert.length > max) throw new ValidationError(feld, `Höchstens ${max} Zeichen (jetzt ${wert.length}).`);
    return wert;
  };
  const punkte = report.punkte
    .map((p) => ({ ...p, titel: zuLang('punkte', p.titel.trim(), MAX.titel), text: zuLang('punkte', p.text.trim(), MAX.text) }))
    .filter((p) => p.text);
  return {
    ...report,
    einleitung: zuLang('einleitung', report.einleitung.trim(), MAX.einleitung),
    fazit: zuLang('fazit', report.fazit.trim(), MAX.fazit),
    punkte,
    beobachtungen: report.beobachtungen.map((b) => ({ titel: zuLang('beobachtungen', b.titel.trim(), MAX.titel), text: zuLang('beobachtungen', b.text.trim(), MAX.text) })),
    bereiche: bereicheVon(punkte, audit),
  };
}

/** A report goes out only complete: opening, every point with a title, three observations, conclusion, a name. */
export function pruefeFreigabe(report: Report | null, von: string): void {
  if (!report) throw new ValidationError('report', 'Es gibt noch keinen Report. Erst den Shop prüfen.');
  if (!report.einleitung) throw new ValidationError('einleitung', 'Bitte eine Einleitung schreiben (oder von Claude vorschlagen lassen).');
  if (report.punkte.some((p) => !p.titel)) throw new ValidationError('punkte', 'Jeder Befund braucht eine Überschrift.');
  if (report.beobachtungen.length < BEOBACHTUNGEN || report.beobachtungen.some((b) => !b.titel || !b.text)) throw new ValidationError('beobachtungen', `Bitte alle ${BEOBACHTUNGEN} Beobachtungen mit Überschrift und Text ausfüllen.`);
  if (!report.fazit) throw new ValidationError('fazit', 'Bitte ein Fazit schreiben.');
  if (!von.trim()) throw new ValidationError('report_von', 'Bitte eintragen, wer den Shop geprüft hat – der Name steht im Report.');
}

/** Places taken: everybody on the list except the waiting list and discarded entries. */
export function roastPlaetze(magnet: Pick<Magnet, 'plaetze'>, leads: readonly MagnetLead[]): { vergeben: number; frei: number | null } {
  const vergeben = leads.filter((l) => !l.warteliste && l.status !== 'verworfen').length;
  return { vergeben, frei: magnet.plaetze === null ? null : Math.max(0, magnet.plaetze - vergeben) };
}

export type RoastSchritt = 'pruefen' | 'schreiben' | 'freigeben' | 'senden' | 'gesendet';

export function roastSchritt(lead: MagnetLead): RoastSchritt {
  if (!lead.audit_id) return 'pruefen';
  if (lead.report_gesendet_am) return 'gesendet';
  if (lead.report_freigegeben_am) return 'senden';
  const report = reportVon(lead);
  try {
    pruefeFreigabe(report, lead.report_von);
    return 'freigeben';
  } catch {
    return 'schreiben';
  }
}

export const ROAST_SCHRITT_LABEL: Record<RoastSchritt, string> = {
  pruefen: 'Shop noch nicht geprüft',
  schreiben: 'Report in Arbeit',
  freigeben: 'Bereit zur Freigabe',
  senden: 'Freigegeben, noch nicht gesendet',
  gesendet: 'Report gesendet',
};

/** Gmail draft from the person who checked the shop; the personal signature of the Contact Generator closes it. */
export function reportMail(lead: MagnetLead, signatur: string): { an: string; betreff: string; text: string } {
  const report = reportVon(lead);
  const domain = report?.domain || lead.shop;
  const anrede = lead.vorname.trim() ? `Hi ${lead.vorname.trim()},` : 'Hi,';
  return {
    an: lead.email,
    betreff: `Euer Shop-Roast: ${domain}`,
    text: [
      anrede,
      `wie versprochen haben wir uns ${domain} angesehen. Hier ist euer Report:`,
      reportLink(lead),
      'Den Link könnt ihr gern intern weiterleiten. Über den Knopf auf der Seite gibt es den Report auch als PDF.',
      'Wenn du Fragen hast oder wir die Punkte kurz gemeinsam durchgehen sollen, antworte einfach auf diese Mail.',
      signatur.trim() || `Viele Grüße\n${lead.report_von}`,
    ].join('\n\n'),
  };
}
