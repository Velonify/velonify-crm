import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { signaturSchluessel } from '../../../../src/data/anschreiben';
import {
  AUDIT_STATUS,
  aufhaengerVon,
  baueAuditAnfrage,
  befundeVon,
  bereichLabel,
  domainSchluessel,
  firmaAbgleich,
  istVeraltet,
  merkmaleVon,
  neuesteAudits,
  nichtGeprueftVon,
  plattformLabel,
  sekunden,
  speedVon,
  TRAFFIC_LABEL,
  zaehleBefunde,
  type Messung,
} from '../../../../src/data/audit';
import { EINSTELLUNG, EOL_LABEL, FIRMEN_LINKS } from '../../../../src/data/constants';
import { ART_LABEL, meine, ungelesene } from '../../../../src/data/erwaehnungen';
import { GoogleApiError, SchemaError } from '../../../../src/data/errors';
import type { CalendarEvent } from '../../../../src/data/google/calendar';
import { missingScope } from '../../../../src/data/google/http';
import { addDays, tageZwischen } from '../../../../src/data/ids';
import { bekannteKollegen, firmaFuerTermin, neueTerminZeit, tagesBeginn, terminTage, terminZeit, verschiebeBeginn, zeitText, type TerminZeit } from '../../../../src/data/kalender';
import { leadDomain } from '../../../../src/data/magnete';
import { monsteraStand, NAME_SCHLUESSEL, wuchsform } from '../../../../src/data/monstera';
import {
  AMPEL_LABEL,
  istAuditMagnet,
  mitTexten,
  pruefeFreigabe,
  reportLink,
  reportMail,
  reportVon,
  ROAST_SCHRITT_LABEL,
  roastBereichVon,
  roastSchritt,
  type Report,
} from '../../../../src/data/roast';
import { extractDriveFolderId, kontaktName } from '../../../../src/data/rules';
import { findeTeamMitglied } from '../../../../src/data/selectors';
import { EMPTY_FIRMA_INPUT, type Audit, type Database, type MagnetLead } from '../../../../src/data/types';
import { MAX_VERSUCHE, bewerte, muster, normalisiere, raetselNummer, rangliste, teilenText, WORT_LAENGE, wortDesTages } from '../../../../src/data/wordle';
import { gmailLink } from '../../../../src/lib/gmail';
import { antwort, datum, fehler, finde, firmaLink, HUB, kompakt, klein, ohneDienst, type Werkzeugkasten } from '../hilfen';

/** Answer when the person's Google token lacks the calendar scope (connected before calendar access was added). */
export const KALENDER_NEU_VERBINDEN = 'Bitte den Connector neu verbinden, damit Kalender-Zugriff erteilt wird.';

const auditLink = (id: string) => `${HUB}/#/audit/${id}`;
const roastHubLink = (leadId: string) => `${HUB}/#/magnete/roast/${leadId}`;
const uhrzeit = z.string().regex(/^\d{2}:\d{2}$/, 'Uhrzeit als HH:MM');

const QUADRAT = { g: '🟩', y: '🟨', x: '⬜' } as const;
const ANTWORT_LABEL: Record<string, string> = { accepted: 'zugesagt', declined: 'abgelehnt', tentative: 'vielleicht', needsAction: 'offen' };

const DRIVE_ORDNER = {
  drive_leads: EINSTELLUNG.leadsOrdner,
  drive_clients: EINSTELLUNG.clientsOrdner,
  drive_vorlage: EINSTELLUNG.vorlageOrdner,
  drive_proposals: EINSTELLUNG.proposalsOrdner,
} as const;

function befundZahlText(audit: Audit): string {
  const z = zaehleBefunde(audit);
  const teile = [z.hoch && `${z.hoch} hoch`, z.mittel && `${z.mittel} mittel`, z.hinweis && `${z.hinweis} Hinweis`].filter(Boolean);
  return teile.length > 0 ? teile.join(', ') : 'keine Befunde';
}

/** One line per audit for lists. */
function auditKurz(audit: Audit, jetzt: Date) {
  return kompakt({
    audit_id: audit.id,
    domain: audit.domain,
    geprueft_am: audit.geprueft_am.slice(0, 10),
    veraltet: istVeraltet(audit, jetzt) ? true : '',
    status: AUDIT_STATUS[audit.status] ?? audit.status,
    plattform: audit.plattform && audit.plattform !== 'unbekannt' ? `${plattformLabel(audit.plattform)}${audit.version && audit.version !== '1' ? ` ${audit.version}` : ''}` : '',
    support: audit.eol && audit.eol !== 'unknown' ? EOL_LABEL[audit.eol] ?? audit.eol : '',
    pagespeed_mobil: audit.score_mobil,
    befunde: befundZahlText(audit),
  });
}

function messungText(m: Messung | null) {
  if (!m) return undefined;
  return kompakt({
    pagespeed: m.score,
    lcp: m.lcp_ms !== null ? sekunden(m.lcp_ms) : '',
    cls: m.cls,
    inp_ms: m.inp_ms,
    fcp: m.fcp_ms != null ? sekunden(m.fcp_ms) : '',
    tbt_ms: m.tbt_ms,
    ttfb_ms: m.ttfb_ms,
    quelle: m.quelle === 'feld' ? 'echte Besucher' : 'Labormessung',
    traffic: m.felddaten ? TRAFFIC_LABEL[m.felddaten] : '',
    bremsen: (m.bremsen ?? []).map((b) => `${b.titel}${b.anzeige ? ` (${b.anzeige})` : ''}`),
    drittanbieter: (m.drittanbieter ?? []).map((d) => `${d.name}: ${d.kb} KB, ${d.ms} ms`),
  });
}

function roastZeile(lead: MagnetLead) {
  return kompakt({
    lead_id: lead.id,
    magnet: lead.magnet,
    eingegangen_am: lead.eingegangen_am.slice(0, 10),
    vorname: lead.vorname,
    email: lead.email,
    shop: leadDomain(lead),
    warteliste: lead.warteliste ? true : '',
    schritt: ROAST_SCHRITT_LABEL[roastSchritt(lead)],
    audit_id: lead.audit_id,
    report_link: lead.report_freigegeben_am ? reportLink(lead) : '',
    gesendet_am: lead.report_gesendet_am.slice(0, 10),
    geoeffnet: lead.report_geoeffnet_am ? `${lead.report_aufrufe ?? 1}×, zuerst ${lead.report_geoeffnet_am.slice(0, 10)}` : '',
    firma_id: lead.firma_id,
    hub: roastHubLink(lead.id),
  });
}

function fehltFuerFreigabe(lead: MagnetLead): string {
  try {
    pruefeFreigabe(reportVon(lead), lead.report_von);
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function reportAnsicht(lead: MagnetLead, audit: Audit | undefined) {
  const report = reportVon(lead);
  if (!report) return null;
  const imReport = new Set(report.punkte.map((p) => p.befund_id));
  const entfernt = audit ? befundeVon(audit).filter((b) => !imReport.has(b.id)) : [];
  return kompakt({
    domain: report.domain,
    kennzahlen: report.kennzahlen.map((k) => `${k.label}: ${k.wert}`),
    einleitung: report.einleitung,
    punkte: report.punkte.map((p) => kompakt({ befund_id: p.befund_id, bereich: p.bereich, schwere: p.schwere, titel: p.titel, text: p.text })),
    beobachtungen: report.beobachtungen,
    fazit: report.fazit,
    ampeln: report.bereiche.map((b) => `${b.label}: ${AMPEL_LABEL[b.ampel]}`),
    geprueft_von: lead.report_von,
    entfernte_befunde: entfernt.map((b) => ({ befund_id: b.id, schwere: b.schwere, text: b.text })),
  });
}

/** "2026-10-19 10:00–11:00", "2026-10-19 bis 2026-10-21, ganztägig". */
function wann(e: CalendarEvent): string {
  const tage = terminTage(e);
  const erster = tage[0];
  const letzter = tage[tage.length - 1];
  if (e.ganztaegig) return tage.length > 1 ? `${erster} bis ${letzter}, ganztägig` : `${erster}, ganztägig`;
  if (tage.length > 1) return `${erster} ${zeitText(e, erster).replace('ab ', '')} bis ${letzter} ${zeitText(e, letzter).replace('bis ', '')}`;
  return `${erster} ${zeitText(e, erster)}`;
}

export function registriereAudit(k: Werkzeugkasten): void {
  const { server, service, person, heute, meinName, sicher, lesen, schreiben } = k;
  const nachAussen = { ...schreiben, openWorldHint: true } as const;

  /** Runs an audit like the hub does: with the outreach services for Claude's hooks, then stores it. */
  async function pruefeShop(domain: string, firmaId: string) {
    const api = k.dienste?.shopAudit ?? ohneDienst('Das Shop-Audit', 'SHOP_AUDIT_URL');
    const leistungen = await service.loadContactDaten().then(
      (d) => d.leistungen,
      (err: unknown) => {
        if (err instanceof SchemaError) return [];
        throw err;
      },
    );
    const ergebnis = await api.pruefe(baueAuditAnfrage(domain, leistungen));
    const audit = await service.speichereAudit(ergebnis, firmaId);
    return { audit, ergebnis };
  }

  async function roastLead(leadId: string) {
    const daten = await service.loadMagnetDaten();
    const lead = finde(daten.leads, leadId, 'Roast-Eintrag', 'roast_reports');
    const magnet = daten.magnete.find((m) => m.slug === lead.magnet);
    if (!istAuditMagnet(magnet)) throw new Error(`„${leadId}“ gehört zum Magneten „${lead.magnet}“, der kein Shop-Roast ist.`);
    return lead;
  }

  // ─── Shop-Audit ─────────────────────────────────────────────────────────────

  server.registerTool(
    'audits',
    {
      title: 'Shop-Audits anzeigen',
      description:
        'Übersicht wie unter /audit: alle Firmen mit Domain und ihr neuestes Audit (Plattform, Support, PageSpeed, Befunde nach Schwere, veraltet nach 30 Tagen), dazu Audits von Domains, die (noch) keiner Firma gehören. Mit zustand filtern, z. B. „nie“ oder „veraltet“ für fällige Prüfungen, „hoch“ für Firmen mit schweren Befunden.',
      inputSchema: {
        zustand: z.enum(['alle', 'nie', 'veraltet', 'geprueft', 'hoch']).optional().describe('Standard: alle'),
        suchbegriff: z.string().optional().describe('Teil von Firmenname oder Domain'),
        limit: z.number().int().min(1).max(200).optional().describe('Standard 50'),
      },
      annotations: lesen,
    },
    sicher(async ({ zustand, suchbegriff, limit }) => {
      const [db, audits] = await Promise.all([service.load(), service.loadAudits()]);
      const jetzt = new Date();
      const neueste = neuesteAudits(audits);
      const zeilen = db.firmen
        .filter((f) => !f.archiviert && f.domain)
        .map((firma) => ({ firma, audit: neueste.get(firma.id) }))
        .sort((a, b) => a.firma.name.localeCompare(b.firma.name, 'de'));
      const q = klein(suchbegriff ?? '');
      const hoch = (a?: Audit) => Boolean(a && zaehleBefunde(a).hoch > 0);
      const sichtbar = zeilen.filter(({ firma, audit }) => {
        if (q && !klein(`${firma.name} ${firma.domain}`).includes(q)) return false;
        switch (zustand ?? 'alle') {
          case 'nie':
            return !audit;
          case 'veraltet':
            return Boolean(audit && istVeraltet(audit, jetzt));
          case 'geprueft':
            return Boolean(audit);
          case 'hoch':
            return hoch(audit);
          default:
            return true;
        }
      });
      const ohneFirma = [...neueste.entries()]
        .filter(([schluessel, a]) => schluessel.startsWith('domain:') && (!q || klein(a.domain).includes(q)))
        .map(([, a]) => a)
        .sort((a, b) => b.geprueft_am.localeCompare(a.geprueft_am));
      const max = limit ?? 50;
      return antwort({
        zahlen: {
          firmen_mit_domain: zeilen.length,
          geprueft: zeilen.filter((z) => z.audit).length,
          veraltet: zeilen.filter((z) => z.audit && istVeraltet(z.audit, jetzt)).length,
          mit_schweren_befunden: zeilen.filter((z) => hoch(z.audit)).length,
        },
        firmen: sichtbar.slice(0, max).map(({ firma, audit }) => ({
          firma: firma.name,
          firma_id: firma.id,
          ...(audit ? auditKurz(audit, jetzt) : { domain: firma.domain, audit: 'nie geprüft' }),
        })),
        mehr: Math.max(0, sichtbar.length - max),
        ohne_firma: ohneFirma.slice(0, 20).map((a) => auditKurz(a, jetzt)),
        hub: `${HUB}/#/audit`,
      });
    }),
  );

  server.registerTool(
    'audit_anzeigen',
    {
      title: 'Shop-Audit anzeigen',
      description:
        'Ein Audit im Detail: Befunde nach Schwere, Aufhänger je Outreach-Leistung (für den Contact Generator), was nicht geprüft werden konnte, Merkmale (Tracking, Consent, E-Mail-Tool, Zahlarten, SEO, Technologien) und PageSpeed mobil/Desktop mit Bremsen. Mit audit_id genau dieses, sonst das neueste der Firma oder Domain.',
      inputSchema: {
        audit_id: z.string().optional().describe('SA-… aus `audits`'),
        firma_id: z.string().optional(),
        domain: z.string().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ audit_id, firma_id, domain }) => {
      const [db, audits] = await Promise.all([service.load(), service.loadAudits()]);
      const aktiv = audits.filter((a) => !a.archiviert).sort((a, b) => b.geprueft_am.localeCompare(a.geprueft_am));
      let gefunden: Audit | undefined;
      if (audit_id) gefunden = finde(audits, audit_id, 'Audit', 'audits');
      else if (firma_id) gefunden = aktiv.find((a) => a.firma_id === firma_id);
      else if (domain) gefunden = aktiv.find((a) => domainSchluessel(a.domain) === domainSchluessel(domain));
      else return fehler('audit_id, firma_id oder domain angeben.');
      if (!gefunden) return fehler('Dazu gibt es noch kein Audit. Mit `shop_pruefen` prüfen.');
      const audit = gefunden;

      const firma = audit.firma_id ? db.firmen.find((f) => f.id === audit.firma_id) : undefined;
      const passendeFirma = !audit.firma_id ? db.firmen.find((f) => !f.archiviert && f.domain && domainSchluessel(f.domain) === domainSchluessel(audit.domain)) : undefined;
      const leistungen = await service.loadContactDaten().then(
        (d) => d.leistungen,
        () => [],
      );
      const titelVon = (id: string) => leistungen.find((l) => l.id === id)?.titel ?? 'Leistung';
      const merkmale = merkmaleVon(audit);
      const speed = speedVon(audit);
      const frueher = aktiv.filter(
        (a) => a.id !== audit.id && (audit.firma_id ? a.firma_id === audit.firma_id : !a.firma_id && domainSchluessel(a.domain) === domainSchluessel(audit.domain)),
      );

      return antwort({
        ...auditKurz(audit, new Date()),
        geprueft_von: audit.von,
        firma: firma?.name,
        firma_id: firma?.id,
        nicht_zugeordnet: passendeFirma
          ? `Passt zu ${passendeFirma.name} (firma_id ${passendeFirma.id}); mit \`audit_zuordnen\` verknüpfen.`
          : !firma
            ? 'Gehört zu keiner Firma; mit `audit_zuordnen` als Lead anlegen oder zuordnen.'
            : undefined,
        zusammenfassung: audit.zusammenfassung,
        befunde: befundeVon(audit).map((b) => kompakt({ befund_id: b.id, schwere: b.schwere, bereich: bereichLabel(b.bereich), text: b.text })),
        aufhaenger: aufhaengerVon(audit).map((a) => ({ leistung: titelVon(a.leistung_id), leistung_id: a.leistung_id, text: a.text })),
        nicht_geprueft: nichtGeprueftVon(audit).map((n) => `${bereichLabel(n.bereich)}: ${n.grund}`),
        merkmale: merkmale
          ? kompakt({
              https: merkmale.https,
              analyse: [
                merkmale.analyse.ga4 && 'GA4',
                merkmale.analyse.gtm && 'Google Tag Manager',
                merkmale.analyse.universal_analytics && 'Universal Analytics',
                ...(merkmale.analyse.andere ?? []),
              ].filter(Boolean),
              pixel: merkmale.pixel,
              google_ads: merkmale.google_ads,
              consent: merkmale.consent,
              email_tools: merkmale.email_tools,
              newsletter_formular: merkmale.newsletter_formular,
              zahlarten: merkmale.zahlarten,
              bewertungen: merkmale.bewertungen,
              sprachen: merkmale.sprachen,
              seo: merkmale.seo,
              technologien: (merkmale.technologien ?? []).map((t) => (t.version ? `${t.name} ${t.version}` : t.name)),
            })
          : undefined,
        speed: { mobil: messungText(speed.mobil), desktop: messungText(speed.desktop) },
        fruehere_audits: frueher.map((a) => `${a.id} vom ${a.geprueft_am.slice(0, 10)} (${befundZahlText(a)})`),
        hub: auditLink(audit.id),
      });
    }),
  );

  server.registerTool(
    'shop_pruefen',
    {
      title: 'Shop prüfen (Shop-Audit)',
      description:
        'Prüft einen Shop wie „Domain prüfen“ im Hub (dauert 20–60 Sekunden): Plattform und Version, PageSpeed, Tracking, E-Mail-Marketing, Shop-Basics, SEO; Claude schreibt Aufhänger zu den Outreach-Leistungen. Das Audit wird gespeichert. Gehört die Domain zu einer Firma, steht es in deren Verlauf, und Plattform, Version und Support werden aktualisiert, wenn das Audit sie sicher erkannt hat. Ruft den Shop von außen ab.',
      inputSchema: {
        firma_id: z.string().optional().describe('Firma mit hinterlegter Domain'),
        domain: z.string().optional().describe('Shop-Domain, z. B. beispiel.de; wird einer Firma mit gleicher Domain zugeordnet'),
      },
      annotations: nachAussen,
    },
    sicher(async ({ firma_id, domain }) => {
      const db = await service.load();
      let firma = firma_id ? finde(db.firmen, firma_id, 'Firma') : undefined;
      if (firma && !firma.domain) return fehler(`${firma.name} hat keine Domain. Erst mit \`firma_aendern\` eintragen.`);
      const ziel = domainSchluessel(firma?.domain || domain || '');
      if (!ziel) return fehler('firma_id oder domain angeben.');
      firma ??= db.firmen.find((f) => !f.archiviert && f.domain && domainSchluessel(f.domain) === ziel);
      const { audit, ergebnis } = await pruefeShop(ziel, firma?.id ?? '');
      const abgleich = firma ? firmaAbgleich(firma, ergebnis) : null;
      return antwort({
        erledigt: 'geprüft',
        ...auditKurz(audit, new Date()),
        firma: firma?.name,
        firma_id: firma?.id,
        firma_aktualisiert: abgleich?.text,
        zusammenfassung: audit.zusammenfassung,
        befunde: befundeVon(audit).map((b) => `${b.schwere}: ${b.text}`),
        aufhaenger: aufhaengerVon(audit).length,
        hinweis: firma ? undefined : 'Die Domain gehört zu keiner Firma. Mit `audit_zuordnen` als Lead anlegen oder einer Firma zuordnen.',
        hub: auditLink(audit.id),
      });
    }),
  );

  server.registerTool(
    'audit_zuordnen',
    {
      title: 'Audit einer Firma zuordnen',
      description:
        'Verknüpft ein Audit einer Domain, die keiner Firma gehört, mit einer Firma. Ohne firma_id wird die Firma mit gleicher Domain genommen; mit als_lead_anlegen: true entsteht stattdessen ein neuer Lead (Name = Domain, Quelle „Shop-Audit“, Plattform aus dem Audit) wie „Als Lead anlegen“ im Hub.',
      inputSchema: {
        audit_id: z.string().describe('SA-… aus `audits`'),
        firma_id: z.string().optional(),
        als_lead_anlegen: z.boolean().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ audit_id, firma_id, als_lead_anlegen }) => {
      const [db, audits] = await Promise.all([service.load(), service.loadAudits()]);
      const audit = finde(audits, audit_id, 'Audit', 'audits');
      // Like the hub, only audits without a firm get assigned; moving one to another firm is not offered there.
      if (audit.firma_id) {
        const bisher = db.firmen.find((f) => f.id === audit.firma_id);
        return fehler(`Das Audit gehört schon zu ${bisher ? `${bisher.name} (firma_id ${bisher.id})` : `firma_id ${audit.firma_id}`}. Nichts geändert.`);
      }
      const domain = domainSchluessel(audit.domain);
      const gleicheDomain = db.firmen.find((f) => !f.archiviert && f.domain && domainSchluessel(f.domain) === domain);
      let zielId = firma_id;
      let neu = false;
      if (zielId) finde(db.firmen, zielId, 'Firma');
      if (!zielId && als_lead_anlegen) {
        if (gleicheDomain) return fehler(`${gleicheDomain.name} (firma_id ${gleicheDomain.id}) hat schon die Domain ${domain}. Ohne als_lead_anlegen zuordnen.`);
        const firma = await service.createFirma({
          ...EMPTY_FIRMA_INPUT,
          name: domain,
          domain,
          status: 'lead',
          plattform: audit.plattform === 'unbekannt' ? '' : audit.plattform,
          version: audit.version === '1' ? '' : audit.version,
          eol: audit.eol === 'unknown' ? '' : audit.eol,
          quelle: 'Shop-Audit',
        });
        zielId = firma.id;
        neu = true;
      }
      zielId ??= gleicheDomain?.id;
      if (!zielId) return fehler(`Keine Firma mit der Domain ${domain}. firma_id angeben (über \`suchen\`) oder als_lead_anlegen: true.`);
      const zugeordnet = await service.ordneAuditZu(audit.id, zielId, audit.geaendert_am);
      const firma = (await service.load()).firmen.find((f) => f.id === zielId);
      return antwort({
        erledigt: neu ? 'als Lead angelegt und zugeordnet' : 'zugeordnet',
        audit_id: zugeordnet.id,
        firma: firma?.name,
        firma_id: zielId,
        hinweis: neu ? 'Namen und Ansprechpartner bitte in der Firmenakte ergänzen.' : undefined,
        hub: firmaLink(zielId),
      });
    }),
  );

  // ─── Shop-Roast-Reports ─────────────────────────────────────────────────────

  server.registerTool(
    'roast_reports',
    {
      title: 'Shop-Roast-Reports anzeigen',
      description:
        'Einträge der Shop-Roast-Magneten (Typ audit) mit Stand des Reports: Shop noch nicht geprüft → Report in Arbeit → bereit zur Freigabe → freigegeben → gesendet (und ob der Report geöffnet wurde). Mit lead_id der ganze Report: Einleitung, Befund-Punkte mit befund_id, drei Beobachtungen, Fazit, Ampeln und was für die Freigabe noch fehlt.',
      inputSchema: {
        lead_id: z.string().optional().describe('ML-… für den ganzen Report'),
        alle: z.boolean().optional().describe('Auch gesendete und verworfene; Standard: nur offene'),
      },
      annotations: lesen,
    },
    sicher(async ({ lead_id, alle }) => {
      if (lead_id) {
        const lead = await roastLead(lead_id);
        const audit = lead.audit_id ? (await service.loadAudits()).find((a) => a.id === lead.audit_id) : undefined;
        return antwort({
          ...roastZeile(lead),
          freigegeben_am: lead.report_freigegeben_am ? lead.report_freigegeben_am.slice(0, 16).replace('T', ' ') : undefined,
          fehlt_fuer_freigabe: lead.audit_id && !lead.report_freigegeben_am ? fehltFuerFreigabe(lead) || undefined : undefined,
          report: reportAnsicht(lead, audit) ?? 'Noch kein Report. Mit `roast_shop_pruefen` den Shop prüfen.',
        });
      }
      const { magnete, leads } = await service.loadMagnetDaten();
      const roast = new Set(magnete.filter((m) => istAuditMagnet(m)).map((m) => m.slug));
      const liste = leads
        .filter((l) => roast.has(l.magnet) && (alle || (l.status !== 'verworfen' && !l.report_gesendet_am)))
        .sort((a, b) => a.eingegangen_am.localeCompare(b.eingegangen_am));
      return antwort({ eintraege: liste.map(roastZeile), hub: `${HUB}/#/magnete` });
    }),
  );

  server.registerTool(
    'roast_shop_pruefen',
    {
      title: 'Shop für den Roast prüfen',
      description:
        'Prüft den Shop eines Roast-Eintrags mit dem Shop-Audit (20–60 Sekunden), speichert das Audit und legt den Report-Entwurf aus den Befunden an. Ist der Shop schon geprüft, ersetzt neu_pruefen: true den Entwurf – geschriebene Texte gehen verloren, vorher nachfragen. Nach der Freigabe nicht mehr möglich.',
      inputSchema: {
        lead_id: z.string().describe('ML-… aus `roast_reports`'),
        neu_pruefen: z.boolean().optional(),
      },
      annotations: nachAussen,
    },
    sicher(async ({ lead_id, neu_pruefen }) => {
      const lead = await roastLead(lead_id);
      const domain = leadDomain(lead);
      if (!domain) return fehler('Zu diesem Eintrag gibt es keine Shop-Adresse.');
      if (lead.report_freigegeben_am) return fehler('Der Report ist schon freigegeben. Erst mit `roast_report_freigeben` (freigegeben: false) zurücknehmen.');
      if (lead.audit_id && !neu_pruefen) return fehler('Der Shop ist schon geprüft. neu_pruefen: true startet den Report wieder beim Entwurf aus den neuen Befunden, die Texte gehen verloren.');
      // Like the hub: the roast audit is stored without a firm; it moves to the firm when the lead is taken over.
      const { audit } = await pruefeShop(domain, '');
      await service.verknuepfeRoastAudit(lead.id, audit);
      return antwort({
        erledigt: `${domain} geprüft – ${befundeVon(audit).length} Befunde im Entwurf`,
        audit_id: audit.id,
        zusammenfassung: audit.zusammenfassung,
        naechster_schritt: 'Texte mit `roast_texte_schreiben` von Claude vorschlagen lassen, dann mit `roast_report_bearbeiten` gegenlesen und drei Beobachtungen ergänzen.',
        hub: roastHubLink(lead.id),
      });
    }),
  );

  server.registerTool(
    'roast_texte_schreiben',
    {
      title: 'Report-Texte von Claude',
      description:
        'Lässt das Shop-Audit (Claude) Einleitung, Überschriften, Erklärungen und Fazit für den Shop-Inhaber schreiben, wie „Texte von Claude“ im Hub, und speichert sie im Report. Es gehen nur Domain und Befunde raus, kein Name. Beobachtungen bleiben. Erklärungen mit unsicheren Zahlen werden verworfen, dort bleibt der Befundtext. Gibt es schon Texte, ersetzt ueberschreiben: true sie – vorher nachfragen.',
      inputSchema: {
        lead_id: z.string().describe('ML-… aus `roast_reports`'),
        ueberschreiben: z.boolean().optional(),
      },
      annotations: nachAussen,
    },
    sicher(async ({ lead_id, ueberschreiben }) => {
      const api = k.dienste?.shopAudit ?? ohneDienst('Das Shop-Audit', 'SHOP_AUDIT_URL');
      const lead = await roastLead(lead_id);
      const report = reportVon(lead);
      const audit = lead.audit_id ? (await service.loadAudits()).find((a) => a.id === lead.audit_id) : undefined;
      if (!report || !audit) return fehler('Es gibt noch keinen Report. Erst mit `roast_shop_pruefen` den Shop prüfen.');
      if (lead.report_freigegeben_am) return fehler('Der Report ist freigegeben. Für Änderungen erst die Freigabe zurücknehmen.');
      const befunde = befundeVon(audit).filter((b) => report.punkte.some((p) => p.befund_id === b.id));
      if (befunde.length === 0) return fehler('Im Report steht kein Befund mehr, den Claude erklären könnte.');
      const schonGeschrieben = report.einleitung || report.fazit || report.punkte.some((p) => p.titel);
      if (schonGeschrieben && !ueberschreiben) return fehler('Der Report hat schon Texte. ueberschreiben: true ersetzt Einleitung, Überschriften, Erklärungen und Fazit (die Beobachtungen bleiben).');
      const texte = await api.roastTexte({ domain: audit.domain, vorname: '', befunde, nicht_geprueft: nichtGeprueftVon(audit) });
      const neu = await service.speichereReport(lead.id, mitTexten(report, texte), lead.report_von || person.name);
      return antwort({
        erledigt: 'Texte eingesetzt und gespeichert – bitte gegenlesen',
        verworfen: texte.verworfen > 0 ? `${texte.verworfen} Erklärung(en) hatten unsichere Zahlen und wurden verworfen – dort steht noch der Befund.` : undefined,
        report: reportAnsicht(neu, audit),
        fehlt_fuer_freigabe: fehltFuerFreigabe(neu) || undefined,
        hub: roastHubLink(lead.id),
      });
    }),
  );

  server.registerTool(
    'roast_report_bearbeiten',
    {
      title: 'Roast-Report bearbeiten',
      description:
        'Ändert den Report eines Roast-Eintrags; nur angegebene Felder. punkte ändern Überschrift/Text eines Befunds (befund_id aus `roast_reports`), entfernen: true nimmt einen falschen Befund heraus, ein entfernter Befund lässt sich mit seiner befund_id wieder aufnehmen. beobachtungen ersetzt alle drei (Überschrift + Text). geprueft_von steht im Report. Längen: Einleitung/Fazit 800, Überschrift 120, Text 900 Zeichen. Nicht möglich, solange freigegeben.',
      inputSchema: {
        lead_id: z.string().describe('ML-… aus `roast_reports`'),
        einleitung: z.string().optional(),
        fazit: z.string().optional(),
        punkte: z.array(z.object({ befund_id: z.string(), titel: z.string().optional(), text: z.string().optional(), entfernen: z.boolean().optional() })).optional(),
        beobachtungen: z.array(z.object({ titel: z.string(), text: z.string() })).max(3).optional().describe('Für die Freigabe genau drei'),
        geprueft_von: z.string().optional().describe('Name im Report; Standard: bisheriger Eintrag oder wer angemeldet ist'),
      },
      annotations: schreiben,
    },
    sicher(async ({ lead_id, einleitung, fazit, punkte, beobachtungen, geprueft_von }) => {
      const lead = await roastLead(lead_id);
      const report = reportVon(lead);
      const audit = lead.audit_id ? (await service.loadAudits()).find((a) => a.id === lead.audit_id) : undefined;
      if (!report) return fehler('Es gibt noch keinen Report. Erst mit `roast_shop_pruefen` den Shop prüfen.');
      const neuePunkte = [...report.punkte];
      for (const p of punkte ?? []) {
        const index = neuePunkte.findIndex((x) => x.befund_id === p.befund_id);
        if (p.entfernen) {
          if (index >= 0) neuePunkte.splice(index, 1);
          continue;
        }
        if (index >= 0) {
          neuePunkte[index] = { ...neuePunkte[index], titel: p.titel ?? neuePunkte[index].titel, text: p.text ?? neuePunkte[index].text };
          continue;
        }
        const befund = audit ? befundeVon(audit).find((b) => b.id === p.befund_id) : undefined;
        if (!befund) return fehler(`Befund „${p.befund_id}“ gibt es in diesem Audit nicht. befund_id aus \`roast_reports\` nehmen.`);
        neuePunkte.push({ befund_id: befund.id, bereich: roastBereichVon(befund.bereich), schwere: befund.schwere, titel: p.titel ?? '', text: p.text ?? befund.text });
      }
      const rang = { hoch: 0, mittel: 1, hinweis: 2 };
      neuePunkte.sort((a, b) => rang[a.schwere] - rang[b.schwere]);
      const neu: Report = {
        ...report,
        einleitung: einleitung ?? report.einleitung,
        fazit: fazit ?? report.fazit,
        punkte: neuePunkte,
        beobachtungen: beobachtungen
          ? [...beobachtungen, ...report.beobachtungen.map(() => ({ titel: '', text: '' }))].slice(0, report.beobachtungen.length)
          : report.beobachtungen,
      };
      const gespeichert = await service.speichereReport(lead.id, neu, geprueft_von ?? (lead.report_von || person.name));
      return antwort({
        erledigt: 'gespeichert',
        schritt: ROAST_SCHRITT_LABEL[roastSchritt(gespeichert)],
        fehlt_fuer_freigabe: fehltFuerFreigabe(gespeichert) || undefined,
        report: reportAnsicht(gespeichert, audit),
        hub: roastHubLink(lead.id),
      });
    }),
  );

  server.registerTool(
    'roast_report_freigeben',
    {
      title: 'Roast-Report freigeben',
      description:
        'Gibt den Report frei: Er ist dann öffentlich unter velonify.de/roast/<token>/ erreichbar (für jeden mit dem Link). Freigabe geht nur, wenn Einleitung, jede Befund-Überschrift, drei Beobachtungen, Fazit und „geprüft von“ ausgefüllt sind; eine zweite Person muss nicht zustimmen. Vorher nachfragen. freigegeben: false nimmt die Freigabe zurück, die Seite ist wieder weg (nicht mehr nach dem Senden).',
      inputSchema: {
        lead_id: z.string().describe('ML-… aus `roast_reports`'),
        freigegeben: z.boolean().optional().describe('Standard true'),
      },
      annotations: nachAussen,
    },
    sicher(async ({ lead_id, freigegeben }) => {
      const lead = await roastLead(lead_id);
      const frei = freigegeben ?? true;
      if (!frei && lead.report_gesendet_am) return fehler('Der Report ist schon gesendet; die Freigabe bleibt, damit der Link weiter funktioniert.');
      const neu = await service.gibReportFrei(lead.id, frei);
      return antwort({
        erledigt: frei ? 'freigegeben – der Report ist unter dem Link erreichbar' : 'Freigabe zurückgenommen, die Seite ist wieder weg',
        report_link: frei ? reportLink(neu) : undefined,
        naechster_schritt: frei ? 'Mail-Text mit `roast_report_mail` holen; nach dem Versand `roast_report_gesendet`.' : undefined,
        hub: roastHubLink(lead.id),
      });
    }),
  );

  server.registerTool(
    'roast_report_mail',
    {
      title: 'Mail zum Roast-Report',
      description:
        'Empfänger, Betreff und Text der Mail mit dem Report-Link, mit deiner Signatur aus dem Contact Generator, und ein Gmail-Link, der den Entwurf in deinem Postfach öffnet. Der Hub verschickt die Mail nicht selbst – er öffnet nur diesen Entwurf, gesendet wird in Gmail. Danach `roast_report_gesendet`. Erst nach der Freigabe.',
      inputSchema: { lead_id: z.string().describe('ML-… aus `roast_reports`') },
      annotations: lesen,
    },
    sicher(async ({ lead_id }) => {
      const lead = await roastLead(lead_id);
      if (!lead.report_freigegeben_am) return fehler('Der Report ist noch nicht freigegeben. Erst `roast_report_freigeben`.');
      const db = await service.load();
      const mail = reportMail(lead, db.einstellungen[signaturSchluessel(person.email)] ?? '');
      return antwort({
        ...mail,
        gmail_entwurf: gmailLink({ ...mail, konto: person.email }),
        schon_gesendet: lead.report_gesendet_am ? lead.report_gesendet_am.slice(0, 10) : undefined,
      });
    }),
  );

  server.registerTool(
    'roast_report_gesendet',
    {
      title: 'Roast-Report als gesendet markieren',
      description: 'Vermerkt, dass die Mail mit dem Report raus ist (wie der Gmail-Knopf im Hub). Erst nach der Freigabe; verschickt selbst nichts.',
      inputSchema: { lead_id: z.string().describe('ML-… aus `roast_reports`') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ lead_id }) => {
      const lead = await roastLead(lead_id);
      if (lead.report_gesendet_am) return antwort({ erledigt: 'war schon als gesendet markiert', gesendet_am: lead.report_gesendet_am.slice(0, 10) });
      const neu = await service.markiereReportGesendet(lead.id);
      return antwort({
        erledigt: 'als gesendet markiert',
        gesendet_am: neu.report_gesendet_am.slice(0, 10),
        hinweis: 'Ins CRM übernehmen wie gewohnt mit `magnet_lead_uebernehmen`.',
      });
    }),
  );

  // ─── Kalender ───────────────────────────────────────────────────────────────

  /** Calendar tools: a token from before calendar access was added gets a clear hint instead of Google's message. */
  const kalender =
    <A>(fn: (args: A) => Promise<CallToolResult>) =>
    sicher(async (args: A) => {
      try {
        return await fn(args);
      } catch (err) {
        if (err instanceof GoogleApiError && (err.status === 401 || (err.status === 403 && missingScope(err.googleMessage)))) return fehler(KALENDER_NEU_VERBINDEN);
        if (err instanceof Error && /fehlt der Zugriff auf Google Kalender/.test(err.message)) return fehler(KALENDER_NEU_VERBINDEN);
        throw err;
      }
    });

  function terminZeile(e: CalendarEvent, db: Database) {
    const firma = firmaFuerTermin(db, e, person.email);
    return kompakt({
      termin_id: e.id,
      titel: e.titel,
      wann: wann(e),
      ort: e.ort,
      meet: e.meetLink,
      gaeste: (e.gaeste ?? []).map((g) => (g.antwort && g.antwort !== 'needsAction' ? `${g.email} (${ANTWORT_LABEL[g.antwort] ?? g.antwort})` : g.email)),
      meine_antwort: e.antwort ? ANTWORT_LABEL[e.antwort] : '',
      nur_lesen: e.bearbeitbar === false ? 'nur die Person, die ihn angelegt hat, kann ihn ändern' : '',
      serie: e.serie ? 'Termin einer Serie; Änderungen gelten nur für diesen' : '',
      abgesagt: e.abgesagt ? true : '',
      beschreibung: e.beschreibung,
      firma: firma?.name,
      firma_id: firma?.id,
      link: e.link,
    });
  }

  async function findeTermin(terminId: string, am?: string): Promise<CalendarEvent> {
    const tag = am ?? heute();
    const von = tagesBeginn(addDays(tag, am ? -1 : -31));
    const bis = tagesBeginn(addDays(tag, am ? 2 : 366));
    const termin = (await service.termine(von, bis)).find((e) => e.id === terminId);
    if (!termin) {
      throw new Error(
        `Termin „${terminId}“ nicht gefunden${am ? ` um den ${am}` : ' (gesucht: letzter Monat bis ein Jahr voraus)'}. IDs über \`termine\` holen, bei anderen Zeiträumen das Datum als am angeben.`,
      );
    }
    return termin;
  }

  /** Team names become addresses known from signatures and recent appointments; addresses stay as they are. */
  async function gastAdressen(db: Database, angaben: readonly string[]): Promise<string[]> {
    if (angaben.every((a) => a.includes('@'))) return angaben.map((a) => a.trim());
    const tag = heute();
    const events = await service.termine(tagesBeginn(addDays(tag, -60)), tagesBeginn(addDays(tag, 60)));
    const bekannte = bekannteKollegen(db, events, person.email);
    const team = db.listen.team ?? [];
    return angaben.map((angabe) => {
      if (angabe.includes('@')) return angabe.trim();
      const name = team.find((t) => klein(t) === klein(angabe));
      if (!name) throw new Error(`„${angabe}“ ist weder E-Mail-Adresse noch im Team (${team.join(', ')}).`);
      const adresse = bekannte.find((a) => findeTeamMitglied([name], '', a));
      if (!adresse) throw new Error(`Für ${name} ist keine E-Mail-Adresse bekannt. Bitte die Adresse angeben.`);
      return adresse;
    });
  }

  server.registerTool(
    'termine',
    {
      title: 'Termine anzeigen',
      description:
        'Termine aus deinem Google Kalender (primärer Kalender), wie unter /kalender: Zeit, Ort, Meet-Link, Gäste mit Zusage, zugehörige Firma (über Gäste-Adressen). Standard: heute plus 6 Tage. Mit firma_id stattdessen alle Termine mit Kontakten dieser Firma (6 Monate zurück bis 3 Monate voraus), wie in der Firmenakte.',
      inputSchema: {
        von: datum.optional().describe('Erster Tag, Standard heute'),
        bis: datum.optional().describe('Letzter Tag (einschließlich), Standard von + 6 Tage; höchstens 62 Tage'),
        firma_id: z.string().optional(),
      },
      annotations: lesen,
    },
    kalender(async ({ von, bis, firma_id }: { von?: string; bis?: string; firma_id?: string }) => {
      const db = await service.load();
      if (firma_id) {
        const firma = finde(db.firmen, firma_id, 'Firma');
        const termine = await service.termineMitFirma(db, firma.id);
        const jetzt = new Date().toISOString();
        return antwort({
          firma: firma.name,
          hinweis:
            termine.length === 0 && !db.kontakte.some((kt) => kt.firma_id === firma.id && !kt.archiviert && kt.email) ? 'Die Firma hat keine Kontakte mit E-Mail-Adresse.' : undefined,
          kommende: termine.filter((e) => e.start >= jetzt).reverse().map((e) => terminZeile(e, db)),
          vergangene: termine.filter((e) => e.start < jetzt).map((e) => terminZeile(e, db)),
          hub: firmaLink(firma.id),
        });
      }
      const erster = von ?? heute();
      const letzter = bis ?? addDays(erster, 6);
      if (letzter < erster) return fehler('bis liegt vor von.');
      if (tageZwischen(erster, letzter) > 62) return fehler('Höchstens 62 Tage auf einmal.');
      const termine = await service.termine(tagesBeginn(erster), tagesBeginn(addDays(letzter, 1)));
      return antwort({ von: erster, bis: letzter, termine: termine.map((e) => terminZeile(e, db)), hub: `${HUB}/#/kalender` });
    }),
  );

  server.registerTool(
    'termin_planen',
    {
      title: 'Termin anlegen',
      description:
        'Legt einen Termin in deinem Google Kalender an, auf Wunsch mit Google-Meet-Link. Mit firma_id kommt der Hauptkontakt als Gast dazu (oder kontakt_ids), der Termin steht im Verlauf der Firma, Standard: Titel „Velonify × <Firma>“, 30 Minuten mit Meet. Kollegen als Teamnamen oder Adressen. Einladungen gehen sofort per Mail an alle Gäste – vorher mit der Person klären.',
      inputSchema: {
        datum,
        von: uhrzeit.optional().describe('Beginn HH:MM; Standard 10:00, heute die nächste volle Stunde'),
        bis: uhrzeit.optional().describe('Ende HH:MM; sonst gilt dauer_minuten'),
        dauer_minuten: z.number().int().min(5).max(1440).optional().describe('Standard 30 mit Firma, sonst 60'),
        bis_datum: datum.optional().describe('Letzter Tag bei mehrtägigen oder ganztägigen Terminen'),
        ganztaegig: z.boolean().optional(),
        titel: z.string().optional(),
        firma_id: z.string().optional(),
        kontakt_ids: z.array(z.string()).optional().describe('Kontakte der Firma als Gäste; Standard: Hauptkontakt'),
        kollegen: z.array(z.string()).optional().describe('Teamnamen (z. B. "Julian") oder E-Mail-Adressen'),
        weitere_emails: z.array(z.string()).optional(),
        ort: z.string().optional(),
        beschreibung: z.string().optional(),
        meet: z.boolean().optional().describe('Google-Meet-Link; Standard true mit Firma, sonst false'),
        einladung_senden: z.boolean().optional().describe('Gäste per Mail einladen; Standard true'),
      },
      annotations: nachAussen,
    },
    kalender(
      async (a: {
        datum: string;
        von?: string;
        bis?: string;
        dauer_minuten?: number;
        bis_datum?: string;
        ganztaegig?: boolean;
        titel?: string;
        firma_id?: string;
        kontakt_ids?: string[];
        kollegen?: string[];
        weitere_emails?: string[];
        ort?: string;
        beschreibung?: string;
        meet?: boolean;
        einladung_senden?: boolean;
      }) => {
        const db = await service.load();
        const firma = a.firma_id ? finde(db.firmen, a.firma_id, 'Firma') : undefined;
        const titel = a.titel?.trim() || (firma ? `Velonify × ${firma.name}` : '');
        if (!titel) return fehler('Bitte einen titel angeben.');
        const kontakte = firma ? db.kontakte.filter((kt) => kt.firma_id === firma.id && !kt.archiviert) : [];
        const kontaktIds = a.kontakt_ids ?? [kontakte.find((kt) => kt.hauptkontakt && kt.email)?.id].filter((id): id is string => Boolean(id));
        const fremd = kontaktIds.find((id) => !kontakte.some((kt) => kt.id === id));
        if (fremd) return fehler(`Kontakt „${fremd}“ gehört nicht zu ${firma?.name ?? 'einer angegebenen Firma (firma_id fehlt)'}. IDs über \`firma_anzeigen\`.`);
        const kollegen = await gastAdressen(db, a.kollegen ?? []);
        let zeit: TerminZeit;
        if (a.ganztaegig) zeit = { ganztaegig: true, von_datum: a.datum, von_zeit: '10:00', bis_datum: a.bis_datum ?? a.datum, bis_zeit: '11:00' };
        else if (a.bis) zeit = { ganztaegig: false, von_datum: a.datum, von_zeit: a.von ?? '10:00', bis_datum: a.bis_datum ?? a.datum, bis_zeit: a.bis };
        else zeit = neueTerminZeit(a.datum, new Date(), a.von, a.dauer_minuten ?? (firma ? 30 : 60));
        const einladen = a.einladung_senden ?? true;
        const termin = await service.planeTermin({
          firma_id: firma?.id ?? '',
          kontakt_ids: kontaktIds,
          weitere_emails: [...kollegen, ...(a.weitere_emails ?? [])],
          titel,
          ...zeit,
          ort: a.ort ?? '',
          beschreibung: a.beschreibung ?? '',
          meet: a.meet ?? Boolean(firma),
          einladungSenden: einladen,
        });
        return antwort({
          erledigt: ['Termin angelegt', einladen && termin.teilnehmer.length > 0 && 'Einladungen verschickt', termin.meetLink && 'mit Meet-Link', firma && 'im Verlauf vermerkt']
            .filter(Boolean)
            .join(' · '),
          gaeste_kontakte: kontakte.filter((kt) => kontaktIds.includes(kt.id)).map(kontaktName),
          ...terminZeile(termin, db),
        });
      },
    ),
  );

  server.registerTool(
    'termin_aendern',
    {
      title: 'Termin ändern',
      description:
        'Ändert einen eigenen Termin (nur Termine, die du angelegt hast). Nur angegebene Felder; wird nur der Beginn verschoben, bleibt die Dauer. Gäste hinzufügen/entfernen mit Teamnamen oder Adressen. Standard: Gäste werden per Mail über die Änderung informiert – vorher nachfragen. termin_id aus `termine`; liegt der Termin nicht zwischen letztem Monat und einem Jahr voraus, das bisherige Datum als am angeben.',
      inputSchema: {
        termin_id: z.string(),
        am: datum.optional().describe('Tag, an dem der Termin bisher liegt'),
        titel: z.string().optional(),
        datum: datum.optional().describe('Neuer Tag'),
        von: uhrzeit.optional(),
        bis: uhrzeit.optional(),
        bis_datum: datum.optional(),
        ganztaegig: z.boolean().optional(),
        ort: z.string().optional(),
        beschreibung: z.string().optional(),
        meet: z.boolean().optional(),
        gaeste_hinzufuegen: z.array(z.string()).optional(),
        gaeste_entfernen: z.array(z.string()).optional(),
        einladung_senden: z.boolean().optional().describe('Gäste über die Änderung informieren; Standard true'),
      },
      annotations: nachAussen,
    },
    kalender(
      async (a: {
        termin_id: string;
        am?: string;
        titel?: string;
        datum?: string;
        von?: string;
        bis?: string;
        bis_datum?: string;
        ganztaegig?: boolean;
        ort?: string;
        beschreibung?: string;
        meet?: boolean;
        gaeste_hinzufuegen?: string[];
        gaeste_entfernen?: string[];
        einladung_senden?: boolean;
      }) => {
        const db = await service.load();
        const bisher = await findeTermin(a.termin_id, a.am);
        if (bisher.bearbeitbar === false) return fehler('Diesen Termin kann nur die Person ändern, die ihn angelegt hat.');
        let zeit = terminZeit(bisher);
        if (a.ganztaegig !== undefined) zeit = { ...zeit, ganztaegig: a.ganztaegig };
        if (zeit.ganztaegig) {
          const neuerTag = a.datum ?? zeit.von_datum;
          zeit = { ...zeit, von_datum: neuerTag, bis_datum: a.bis_datum ?? addDays(neuerTag, Math.max(0, tageZwischen(zeit.von_datum, zeit.bis_datum))) };
        } else {
          if (a.datum || a.von) zeit = verschiebeBeginn(zeit, a.datum ?? zeit.von_datum, a.von ?? zeit.von_zeit);
          if (a.bis) zeit = { ...zeit, bis_zeit: a.bis, bis_datum: a.bis_datum ?? zeit.von_datum };
          else if (a.bis_datum) zeit = { ...zeit, bis_datum: a.bis_datum };
        }
        const eigene = person.email.toLowerCase();
        const entfernen = new Set((await gastAdressen(db, a.gaeste_entfernen ?? [])).map((e) => e.toLowerCase()));
        const gaeste = [...(bisher.gaeste ?? []).map((g) => g.email.toLowerCase()), ...(await gastAdressen(db, a.gaeste_hinzufuegen ?? [])).map((e) => e.toLowerCase())].filter(
          (e) => e !== eigene && !entfernen.has(e),
        );
        const neu = await service.aendereTermin(bisher, {
          firma_id: '',
          kontakt_ids: [],
          weitere_emails: [...new Set(gaeste)],
          titel: a.titel ?? bisher.titel,
          ...zeit,
          ort: a.ort ?? bisher.ort ?? '',
          beschreibung: a.beschreibung ?? bisher.beschreibung ?? '',
          meet: a.meet ?? Boolean(bisher.meetLink),
          einladungSenden: a.einladung_senden ?? true,
        });
        return antwort({ erledigt: 'Termin geändert', ...terminZeile(neu, db) });
      },
    ),
  );

  server.registerTool(
    'termin_loeschen',
    {
      title: 'Termin löschen',
      description:
        'Löscht einen eigenen Termin aus deinem Google Kalender (nur Termine, die du angelegt hast). Gäste bekommen standardmäßig eine Absage per Mail. Lässt sich nicht rückgängig machen – immer vorher nachfragen.',
      inputSchema: {
        termin_id: z.string(),
        am: datum.optional().describe('Tag des Termins, wenn er nicht zwischen letztem Monat und einem Jahr voraus liegt'),
        absage_senden: z.boolean().optional().describe('Standard true'),
      },
      annotations: { ...nachAussen, destructiveHint: true },
    },
    kalender(async ({ termin_id, am, absage_senden }: { termin_id: string; am?: string; absage_senden?: boolean }) => {
      const bisher = await findeTermin(termin_id, am);
      if (bisher.bearbeitbar === false) return fehler('Diesen Termin kann nur die Person löschen, die ihn angelegt hat.');
      const absage = (absage_senden ?? true) && (bisher.gaeste ?? []).length > 0;
      await service.loescheTermin(bisher, absage_senden ?? true);
      return antwort({ erledigt: `Termin „${bisher.titel}“ gelöscht${absage ? ', Gäste haben eine Absage bekommen' : ''}`, wann: wann(bisher) });
    }),
  );

  // ─── Erwähnungen ────────────────────────────────────────────────────────────

  server.registerTool(
    'erwaehnungen',
    {
      title: 'Meine Erwähnungen',
      description:
        'Wo dich jemand mit @Name markiert hat (die Glocke im Hub): ungelesene zuerst, mit Auszug, wer, wo und Link. Lesen markiert nichts als gelesen; dafür `erwaehnungen_gelesen`.',
      inputSchema: {
        nur_ungelesene: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Standard 20'),
      },
      annotations: lesen,
    },
    sicher(async ({ nur_ungelesene, limit }) => {
      const [db, alle] = await Promise.all([service.load(), service.loadErwaehnungen()]);
      const ich = meinName(db);
      if (!ich) return fehler('Du stehst nicht in der Team-Liste; Erwähnungen gehen an Teamnamen.');
      const neu = ungelesene(alle, ich);
      const auswahl = [...neu, ...(nur_ungelesene ? [] : meine(alle, ich).filter((e) => e.gelesen_am))].slice(0, limit ?? 20);
      const team = db.listen.team ?? [];
      return antwort({
        ungelesen: neu.length,
        erwaehnungen: auswahl.map((e) =>
          kompakt({
            erwaehnung_id: e.id,
            gelesen: Boolean(e.gelesen_am),
            datum: e.datum.slice(0, 16).replace('T', ' '),
            von: findeTeamMitglied(team, '', e.von) ?? e.von,
            art: ART_LABEL[e.art] ?? e.art,
            titel: e.titel,
            auszug: e.auszug,
            firma_id: e.firma_id,
            link: e.link ? `${HUB}/#${e.link}` : '',
          }),
        ),
      });
    }),
  );

  server.registerTool(
    'erwaehnungen_gelesen',
    {
      title: 'Erwähnungen als gelesen markieren',
      description: 'Markiert eigene Erwähnungen als gelesen (wie Öffnen in der Glocke): die angegebenen IDs oder mit alle: true alle ungelesenen.',
      inputSchema: {
        erwaehnung_ids: z.array(z.string()).optional().describe('ER-… aus `erwaehnungen`'),
        alle: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ erwaehnung_ids, alle }) => {
      const [db, liste] = await Promise.all([service.load(), service.loadErwaehnungen()]);
      const ich = meinName(db);
      if (!ich) return fehler('Du stehst nicht in der Team-Liste; Erwähnungen gehen an Teamnamen.');
      if (!alle && !erwaehnung_ids?.length) return fehler('erwaehnung_ids oder alle: true angeben.');
      const eigene = meine(liste, ich);
      const fremd = (erwaehnung_ids ?? []).filter((id) => !eigene.some((e) => e.id === id));
      if (fremd.length > 0) return fehler(`Keine Erwähnung von dir: ${fremd.join(', ')}. IDs über \`erwaehnungen\`.`);
      const ids = alle ? ungelesene(liste, ich).map((e) => e.id) : (erwaehnung_ids ?? []);
      const markiert = await service.markiereGelesen(ids);
      return antwort({ erledigt: `${markiert.length} als gelesen markiert`, noch_ungelesen: ungelesene(await service.loadErwaehnungen(), ich).length });
    }),
  );

  // ─── Einrichtung ────────────────────────────────────────────────────────────

  server.registerTool(
    'einstellungen',
    {
      title: 'Einrichtung anzeigen',
      description:
        'Was unter /einrichtung gepflegt wird: Team und alle Auswahllisten (Verlustgründe usw.), die Links auf der Startseite (Drive, Helpcenter, Slack, Notion), die Drive-Ordner für Leads/Kunden/Vorlage/Angebote, der Standard-Dealtitel und der Name der Team-Monstera.',
      annotations: lesen,
    },
    sicher(async () => {
      const db = await service.load();
      const e = db.einstellungen;
      return antwort({
        listen: db.listen,
        links: Object.fromEntries(FIRMEN_LINKS.map((l) => [l.einstellung, e[l.einstellung] ?? ''])),
        drive_ordner: Object.fromEntries(
          Object.entries(DRIVE_ORDNER).map(([feld, schluessel]) => [feld, e[schluessel] ? `https://drive.google.com/drive/folders/${e[schluessel]}` : '']),
        ),
        deal_titel_standard: e[EINSTELLUNG.dealTitel] ?? '',
        monstera_name: e[NAME_SCHLUESSEL] ?? '',
        hinweis: 'Team und Auswahllisten ändert `liste_aendern`.',
        hub: `${HUB}/#/einrichtung`,
      });
    }),
  );

  server.registerTool(
    'einstellungen_aendern',
    {
      title: 'Einrichtung ändern',
      description:
        'Ändert Einstellungen wie unter /einrichtung; nur angegebene Felder, leerer Text leert ein Feld. Links müssen mit https:// beginnen (Slack leer = Standard-Workspace). Drive-Ordner als Link oder ID; sie werden vor dem Speichern geprüft. Gilt für das ganze Team – vorher nachfragen.',
      inputSchema: {
        link_drive: z.string().optional(),
        link_helpcenter: z.string().optional(),
        link_slack: z.string().optional(),
        link_notion: z.string().optional(),
        drive_leads: z.string().optional().describe('Ordner 02_Sales/01_Leads'),
        drive_clients: z.string().optional().describe('Ordner 01_Clients'),
        drive_vorlage: z.string().optional().describe('Ordnervorlage 03_Templates/01_Client-Folder-Template'),
        drive_proposals: z.string().optional().describe('Ordner 02_Sales/02_Proposals'),
        deal_titel_standard: z.string().optional(),
        monstera_name: z.string().max(40).optional(),
      },
      annotations: schreiben,
    },
    sicher(async (eingabe: Record<string, string | undefined>) => {
      const werte: Record<string, string> = {};
      for (const l of FIRMEN_LINKS) {
        const wert = eingabe[l.einstellung]?.trim();
        if (wert === undefined) continue;
        if (wert && !/^https:\/\/\S+$/i.test(wert)) return fehler(`${l.label}: Der Link muss mit https:// beginnen.`);
        werte[l.einstellung] = wert;
      }
      for (const [feld, schluessel] of Object.entries(DRIVE_ORDNER)) {
        const wert = eingabe[feld];
        if (wert === undefined) continue;
        const id = extractDriveFolderId(wert);
        if (id) await service.getDriveOrdner(id);
        werte[schluessel] = id;
      }
      if (eingabe.deal_titel_standard !== undefined) werte[EINSTELLUNG.dealTitel] = eingabe.deal_titel_standard.trim();
      if (eingabe.monstera_name !== undefined) werte[NAME_SCHLUESSEL] = eingabe.monstera_name.trim();
      if (Object.keys(werte).length === 0) return fehler('Nichts angegeben.');
      await service.saveEinstellungen(werte);
      return antwort({ erledigt: 'gespeichert', geaendert: werte, hub: `${HUB}/#/einrichtung` });
    }),
  );

  server.registerTool(
    'liste_aendern',
    {
      title: 'Auswahlliste ändern',
      description:
        'Ersetzt eine Auswahlliste wie unter Einrichtung → Daten (z. B. team, verlustgrund) durch die angegebenen Werte in dieser Reihenfolge. Vorher mit `einstellungen` die aktuelle Liste holen und nur gezielt ändern; „team“ steuert Zuständigkeiten und Erwähnungen – vorher nachfragen.',
      inputSchema: {
        liste: z.string().regex(/^[a-z_]{1,40}$/, 'Name der Liste in Kleinbuchstaben, z. B. verlustgrund'),
        werte: z.array(z.string()).min(1).max(100),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ liste, werte }) => {
      if (!k.setzeListe) return fehler('Listen lassen sich nur ändern, wenn das CRM in Postgres liegt.');
      const sauber = [...new Set(werte.map((w) => w.trim()).filter(Boolean))];
      if (sauber.length === 0) return fehler('Eine Liste braucht mindestens einen Wert.');
      const vorher = (await service.load()).listen[liste] ?? [];
      await k.setzeListe(liste, sauber);
      return antwort({ liste, vorher, jetzt: sauber, hub: `${HUB}/#/einrichtung/daten` });
    }),
  );

  // ─── Spiele ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'wort_des_tages',
    {
      title: 'Wort des Tages: Stand',
      description:
        'Rätselnummer von heute, ob und wie du schon gespielt hast, und die Bestenliste des Teams (heute, Serie gelöster Werktage, Schnitt). Verrät das Wort nicht.',
      annotations: lesen,
    },
    sicher(async () => {
      const [db, ergebnisse] = await Promise.all([service.load(), service.loadWordle()]);
      const tag = heute();
      const ich = meinName(db);
      const eigenes = ich ? ergebnisse.find((e) => e.datum === tag && e.spieler === ich) : undefined;
      return antwort({
        raetsel: raetselNummer(tag),
        regeln: `${WORT_LAENGE} Buchstaben, ${MAX_VERSUCHE} Versuche, ohne Umlaute. 🟩 richtige Stelle, 🟨 kommt woanders vor, ⬜ nicht im Wort.`,
        du: ich ? (eigenes ? teilenText(tag, eigenes) : 'heute noch nicht gespielt') : 'nicht im Team',
        bestenliste: rangliste(ergebnisse, db.listen.team ?? [], tag).map((s) =>
          kompakt({
            spieler: s.spieler,
            heute: s.heute ? (s.heute.geloest ? `${s.heute.versuche}/${MAX_VERSUCHE}` : `X/${MAX_VERSUCHE}`) : 'offen',
            serie: s.serie,
            gespielt: s.gespielt,
            geloest: s.geloest,
            schnitt: s.schnitt === null ? '' : Math.round(s.schnitt * 10) / 10,
          }),
        ),
        hub: `${HUB}/#/wort`,
      });
    }),
  );

  server.registerTool(
    'wort_des_tages_raten',
    {
      title: 'Wort des Tages raten',
      description:
        'Spielt das Wort des Tages für dich: immer alle bisherigen Versuche von heute in Reihenfolge schicken (gespeichert wird erst am Ende). Antwort: Farben je Versuch. Ist das Wort gefunden oder sind 6 Versuche verbraucht, wird das Ergebnis (nur die Farben) gespeichert und das Wort genannt. Nur Wörter weitergeben, die die Person selbst rät – nicht selbst raten oder vorsagen.',
      inputSchema: { versuche: z.array(z.string()).min(1).max(MAX_VERSUCHE).describe('Alle Versuche von heute, je 5 Buchstaben') },
      annotations: schreiben,
    },
    sicher(async ({ versuche }) => {
      const db = await service.load();
      const ich = meinName(db);
      if (!ich) return fehler('Du stehst nicht in der Team-Liste und kannst deshalb nicht mitspielen.');
      const tag = heute();
      const vorhanden = (await service.loadWordle()).find((e) => e.datum === tag && e.spieler === ich);
      if (vorhanden) return fehler(`Du hast heute schon gespielt:\n${teilenText(tag, vorhanden)}`);
      const woerter = versuche.map(normalisiere);
      const falsch = woerter.find((w) => w.length !== WORT_LAENGE);
      if (falsch !== undefined) return fehler(`Jeder Versuch braucht genau ${WORT_LAENGE} Buchstaben A–Z (ohne Umlaute): „${falsch}“.`);
      const loesung = wortDesTages(tag);
      const treffer = woerter.indexOf(loesung);
      const gespielt = treffer >= 0 ? woerter.slice(0, treffer + 1) : woerter;
      const geloest = treffer >= 0;
      const zeilen = gespielt.map((w) => `${w} ${bewerte(w, loesung).map((f) => QUADRAT[f]).join('')}`);
      if (!geloest && gespielt.length < MAX_VERSUCHE) return antwort({ raetsel: raetselNummer(tag), zeilen, uebrig: MAX_VERSUCHE - gespielt.length });
      const ergebnis = await service.speichereWordle({ datum: tag, spieler: ich, versuche: gespielt.length, geloest, muster: muster(gespielt, loesung) });
      return antwort({
        raetsel: raetselNummer(tag),
        zeilen,
        ergebnis: geloest ? `gelöst in ${gespielt.length}/${MAX_VERSUCHE}` : 'nicht gelöst',
        wort: loesung,
        teilen: teilenText(tag, ergebnis),
        gespeichert: true,
      });
    }),
  );

  server.registerTool(
    'monstera',
    {
      title: 'Team-Monstera',
      description:
        'Stand der Team-Pflanze auf der Startseite: Blätter, Wuchsform, Punkte (1 je neuem Lead, 10 je gewonnenem Deal, 1 je Gießtag), Durst in Werktagen und wer heute schon gegossen hat.',
      annotations: lesen,
    },
    sicher(async () => {
      const [db, eintraege] = await Promise.all([service.load(), service.loadMonstera()]);
      const tag = heute();
      const stand = monsteraStand(eintraege, db.firmen, db.deals, tag);
      const ich = meinName(db);
      return antwort({
        name: db.einstellungen[NAME_SCHLUESSEL] || 'Die Monstera',
        wuchsform: wuchsform(stand.blaetter),
        blaetter: stand.blaetter,
        punkte: stand.punkte,
        bis_zum_naechsten_blatt: stand.bisBlatt,
        zustand: stand.zustand,
        durst_werktage: stand.durst,
        letzter_giesstag: stand.letzterGiesstag,
        heute_gegossen: stand.heuteGegossen,
        du_kannst_giessen: Boolean(ich && !stand.heuteGegossen.includes(ich)),
        quellen: stand.quellen,
      });
    }),
  );

  server.registerTool(
    'monstera_giessen',
    {
      title: 'Monstera gießen',
      description: 'Gießt die Team-Monstera in deinem Namen. Einmal pro Person und Tag; ein zweites Mal ändert nichts.',
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async () => {
      const db = await service.load();
      const ich = meinName(db);
      if (!ich) return fehler('Du stehst nicht in der Team-Liste und kannst deshalb nicht gießen.');
      const tag = heute();
      const schon = (await service.loadMonstera()).some((e) => e.datum === tag && e.von === ich && e.typ === 'giessen');
      await service.giesseMonstera(ich);
      const stand = monsteraStand(await service.loadMonstera(), db.firmen, db.deals, tag);
      return antwort({
        erledigt: schon ? 'du hattest heute schon gegossen' : 'gegossen',
        name: db.einstellungen[NAME_SCHLUESSEL] || 'Die Monstera',
        blaetter: stand.blaetter,
        zustand: stand.zustand,
        heute_gegossen: stand.heuteGegossen,
      });
    }),
  );
}
