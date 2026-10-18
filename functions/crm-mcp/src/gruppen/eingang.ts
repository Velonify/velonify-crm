import { z } from 'zod';
import { DEFAULT_DEAL_TITEL, EINSTELLUNG, TIERS } from '../../../../src/data/constants';
import { dublettenText, findeDubletten, type DublettenTreffer } from '../../../../src/data/dubletten';
import { anfrageDomain, anfrageDubletten, anfrageFirmenname, firmaAusAnfrage, istOffen, sortiereAnfragen } from '../../../../src/data/eingang';
import { parseCsv, planeImport, type ImportAktion, type ImportOptionen } from '../../../../src/data/importCsv';
import {
  ANLASS_LABEL,
  anlaesseIn,
  AUSSCHLUSS_LABEL,
  BEREICHE,
  brancheLabel,
  importZeilen,
  reichweiteLabel,
  scoreIn,
  systemLabel,
  tierVon,
  type Bereich,
  type EntscheidungEintrag,
  type LeadFinderApi,
  type LeadKandidat,
  type ListenZeile,
} from '../../../../src/data/leadFinder';
import { dealTitelListe, istLinkedinLink, vermerkText, vorschlag } from '../../../../src/data/linkedin';
import { isValidEmail } from '../../../../src/data/rules';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Anfrage, type Database, type Firma } from '../../../../src/data/types';
import {
  antwort,
  fehler,
  finde,
  firmaFelder,
  firmaLink,
  HUB,
  kompakt,
  kontaktFelder,
  ohneDienst,
  ohneUndefined,
  pruefeTeam,
  type Werkzeugkasten,
  zeitBerlin,
} from '../hilfen';

const ANFRAGEN_LINK = `${HUB}/#/crm/anfragen`;
const IMPORT_LINK = `${HUB}/#/crm/import`;
const BACKLOG_LINK = `${HUB}/#/leads`;
const MANUELL_LINK = `${HUB}/#/leads/manuell`;
const shopLink = (domain: string) => `${HUB}/#/leads/shop/${domain}`;

const BEREICH_IDS = ['migration', 'ads', 'klaviyo'] as const;
const bereichLabel = (b: Bereich) => BEREICHE.find((x) => x.id === b)?.label ?? b;
const dealTitelVon = (b: Bereich) => BEREICHE.find((x) => x.id === b)?.deal ?? '';

/** Same limit as the hub's file picker. */
const MAX_CSV_ZEICHEN = 5_000_000;
/** Checks run six at a time in the hub as well. */
const GLEICHZEITIG = 6;
/** The lead finder classifies a dozen shops per call. */
const BRANCHEN_JE_AUFRUF = 12;
/** Firms whose domain the lead finder can look at (useBranchenNachtrag in src/leads/useLeadFinder.ts). */
const GUELTIGE_DOMAIN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;

const IMPORT_AKTIONEN = ['neu', 'ergaenzen', 'dublette', 'unveraendert', 'uebersprungen', 'fehler'] as const satisfies readonly ImportAktion[];

const aehnlichZeile = (t: DublettenTreffer) => ({ firma_id: t.firma.id, name: t.firma.name, grund: dublettenText(t) });

/** Matches by id, so one firm found twice (by the inquiry and by a corrected name) is listed once. */
const eindeutig = (treffer: DublettenTreffer[]) => treffer.filter((t, i) => treffer.findIndex((x) => x.firma.id === t.firma.id) === i);

const schonErledigt = (a: Anfrage) => `Die Anfrage ist schon ${a.status === 'verworfen' ? 'verworfen' : 'übernommen'}.`;

function anfrageZeile(a: Anfrage, firmen: readonly Firma[]) {
  const offen = istOffen(a);
  const aehnlich = offen ? anfrageDubletten(a, firmen) : [];
  return kompakt({
    anfrage_id: a.id,
    eingegangen_am: zeitBerlin(a.eingegangen_am),
    quelle: a.quelle,
    sprache: a.sprache && a.sprache !== 'de' ? a.sprache : '',
    name: a.name,
    email: a.email,
    shop: a.shop,
    themen: a.themen,
    nachricht: a.nachricht,
    status: a.status || 'neu',
    firma_id: a.firma_id,
    erledigt_am: a.erledigt_am.slice(0, 10),
    // What a takeover would create, and which firms it may already be.
    neue_firma_hiesse: offen ? anfrageFirmenname(a) : '',
    aehnliche_firmen: aehnlich.length > 0 ? aehnlich.map(aehnlichZeile) : '',
  });
}

function backlogZeile(z: ListenZeile, bereich: Bereich) {
  const score = scoreIn(z, bereich);
  return kompakt({
    domain: z.domain,
    firma: z.firma,
    ort: [z.plz, z.ort].filter(Boolean).join(' '),
    system: systemLabel(z.system, z.version),
    score,
    tier: tierVon(score),
    anlaesse: anlaesseIn(z, bereich).map((a) => a.text || ANLASS_LABEL[a.id] || a.id),
    reichweite: reichweiteLabel(z.rang_de),
    werbung: [...(z.werbung ?? []), ...(z.gtm ? ['GTM'] : [])].join(', '),
    email_tools: (z.email_tools ?? []).join(', '),
    email: z.email,
    branche: brancheLabel(z.branche),
    entscheidung: z.entscheidung,
  });
}

/** Shops the automatic check could not judge go to "Manuell prüfen" (useLeadStapel in the hub). */
const istManuell = (k: LeadKandidat) => k.ausschluss.some((a) => a.id === 'blockiert' || a.id === 'adresse_unklar');

function kandidatKurz(k: LeadKandidat) {
  return kompakt({
    domain: k.domain,
    qualifiziert: k.qualifiziert,
    firma: k.firma.name,
    system: systemLabel(k.system, k.version),
    score: k.score,
    anlaesse: k.anlaesse.map((a) => a.text || ANLASS_LABEL[a.id] || a.id),
    ausschluss: k.ausschluss.map((a) => `${AUSSCHLUSS_LABEL[a.id] ?? a.id}: ${a.text}`),
    manuell_pruefen: istManuell(k) ? true : '',
  });
}

export function registriereEingang(k: Werkzeugkasten): void {
  const { server, service, meinName, sicher, lesen, schreiben } = k;
  // Tools that call a Cloud Function reach beyond the CRM.
  const liestAussen = { ...lesen, openWorldHint: true } as const;
  const schreibtAussen = { ...schreiben, openWorldHint: true } as const;

  const linkedin = () => k.dienste?.linkedin ?? ohneDienst('Der LinkedIn-Abruf', 'SHOP_AUDIT_URL');
  const leadFinder = (): LeadFinderApi => k.dienste?.leadFinder ?? ohneDienst('Der Lead-Finder', 'SHOP_AUDIT_URL');
  const aktiveFirmen = (db: Database) => db.firmen.filter((f) => !f.archiviert);

  // ─── Anfragen (Website-Formular, Social-DMs) ────────────────────────────────

  server.registerTool(
    'anfragen',
    {
      title: 'Anfragen im Eingang',
      description:
        'Anfragen aus dem Formular auf velonify.de (und Social-DMs) wie unter „Anfragen“ im Hub: offene zuerst, neueste oben. Zu offenen Anfragen: der Name, den eine neue Firma bekäme, und ähnliche Firmen im CRM. Liefert die anfrage_id für `anfrage_uebernehmen` und `anfrage_verwerfen`.',
      inputSchema: {
        status: z.enum(['offen', 'erledigt', 'alle']).optional().describe('Standard: offen'),
        limit: z.number().int().min(1).max(100).optional().describe('Standard 20'),
      },
      annotations: lesen,
    },
    sicher(async ({ status, limit }) => {
      const [anfragen, db] = await Promise.all([service.loadEingang(), service.load()]);
      const sortiert = sortiereAnfragen(anfragen);
      const offen = sortiert.filter(istOffen);
      const erledigt = sortiert.filter((a) => !istOffen(a));
      const wahl = status === 'alle' ? sortiert : status === 'erledigt' ? erledigt : offen;
      const firmen = aktiveFirmen(db);
      return antwort({
        offen: offen.length,
        erledigt: erledigt.length,
        anfragen: wahl.slice(0, limit ?? 20).map((a) => anfrageZeile(a, firmen)),
        hub: ANFRAGEN_LINK,
      });
    }),
  );

  server.registerTool(
    'anfrage_uebernehmen',
    {
      title: 'Anfrage ins CRM übernehmen',
      description:
        'Macht aus einer offenen Anfrage wie im Hub eine Firma (oder hängt sie über firma_id an eine bestehende), einen Ansprechpartner (eine bekannte E-Mail wird wiederverwendet), auf Wunsch einen Deal in Phase „neu“ und einen Verlaufseintrag mit dem Anfragetext. Ohne firma_id wird bei ähnlichen Firmen nichts angelegt, außer trotzdem_anlegen ist gesetzt. Das Formular fragt keinen Firmennamen ab – der Standard ist die Domain, mit firmenname korrigieren.',
      inputSchema: {
        anfrage_id: z.string().describe('EA-… aus `anfragen`'),
        firma_id: z.string().optional().describe('Bestehende Firma statt einer neuen (aehnliche_firmen aus `anfragen` oder `suchen`)'),
        firmenname: z.string().optional().describe('Name der neuen Firma; Standard: Domain aus Shop bzw. E-Mail'),
        zustaendig: z.string().optional().describe('Vorname aus dem Team; Standard: wer angemeldet ist'),
        deal_anlegen: z.boolean().optional().describe('Deal in Phase „neu“, Standard true'),
        trotzdem_anlegen: z.boolean().optional().describe('Neue Firma auch bei ähnlichen Firmen anlegen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ anfrage_id, firma_id, firmenname, zustaendig, deal_anlegen, trotzdem_anlegen }) => {
      const [anfragen, db] = await Promise.all([service.loadEingang(), service.load()]);
      const anfrage = finde(anfragen, anfrage_id, 'Anfrage', 'anfragen');
      if (!istOffen(anfrage)) return fehler(schonErledigt(anfrage));
      const wer = zustaendig ?? meinName(db) ?? '';
      pruefeTeam(db, wer);
      const name = firmenname?.trim() || anfrageFirmenname(anfrage);
      if (firma_id) {
        const firma = finde(db.firmen, firma_id, 'Firma');
        if (firma.archiviert) return fehler(`„${firma.name}“ ist archiviert. Andere Firma wählen oder sie erst wiederherstellen.`);
      } else {
        const aehnlich = eindeutig([
          ...anfrageDubletten(anfrage, aktiveFirmen(db)),
          ...findeDubletten({ ...firmaAusAnfrage(anfrage), name, domain: anfrageDomain(anfrage) }, aktiveFirmen(db)),
        ]);
        if (aehnlich.length > 0 && !trotzdem_anlegen) {
          return antwort({
            uebernommen: false,
            hinweis: 'Es gibt schon ähnliche Firmen. Nichts übernommen. Bestehende über firma_id nutzen oder trotzdem_anlegen setzen.',
            aehnlich: aehnlich.map(aehnlichZeile),
          });
        }
      }
      const ergebnis = await service.uebernimmAnfrage(anfrage.id, {
        firmaId: firma_id,
        firma: firma_id ? undefined : { name },
        zustaendig: wer,
        dealAnlegen: deal_anlegen ?? true,
      });
      return antwort({
        uebernommen: true,
        firma: ergebnis.firma.name,
        firma_id: ergebnis.firma.id,
        kontakt_id: ergebnis.kontakt.id,
        deal_id: ergebnis.deal?.id,
        hub: firmaLink(ergebnis.firma.id),
      });
    }),
  );

  server.registerTool(
    'anfrage_verwerfen',
    {
      title: 'Anfrage verwerfen',
      description: 'Verwirft eine offene Anfrage (Spam oder ohne Aussicht). Sie bleibt gespeichert, ist aber aus dem Eingang. Vorher nachfragen.',
      inputSchema: { anfrage_id: z.string().describe('EA-… aus `anfragen`') },
      annotations: schreiben,
    },
    sicher(async ({ anfrage_id }) => {
      const anfrage = finde(await service.loadEingang(), anfrage_id, 'Anfrage', 'anfragen');
      if (!istOffen(anfrage)) return fehler(schonErledigt(anfrage));
      await service.verwirfAnfrage(anfrage.id, anfrage.geaendert_am);
      return antwort({ verworfen: true, anfrage_id: anfrage.id, von: anfrage.name || anfrage.email });
    }),
  );

  // ─── Lead aus LinkedIn ──────────────────────────────────────────────────────

  server.registerTool(
    'linkedin_lesen',
    {
      title: 'LinkedIn-Link lesen',
      description:
        'Liest eine LinkedIn-Stellenanzeige, ein Profil oder eine Firmenseite (10–30 Sekunden, kostet pro Aufruf) und schlägt Firma, Ansprechpartner, Deal-Titel und Anlass vor, mit ähnlichen Firmen im CRM. Schreibt nichts. Danach mit `linkedin_lead_anlegen` anlegen (Felder aus dem Vorschlag, herkunft unverändert).',
      inputSchema: { url: z.string().min(1).describe('linkedin.com/jobs/…, /in/… oder /company/…') },
      annotations: liestAussen,
    },
    sicher(async ({ url }) => {
      if (!istLinkedinLink(url)) return fehler('Bitte einen Link zu einer Stellenanzeige (linkedin.com/jobs/…), einem Profil (linkedin.com/in/…) oder einer Firmenseite einfügen.');
      const api = linkedin();
      const db = await service.load();
      const lead = await api.lies(url.trim(), dealTitelListe(db));
      const v = vorschlag(lead, db, meinName(db) ?? '');
      return antwort({
        art: lead.art,
        url: lead.url,
        zusammenfassung: lead.zusammenfassung,
        stelle: lead.stelle ? kompakt(lead.stelle) : undefined,
        firma_auf_linkedin: kompakt({ ...lead.firma, mitarbeiter: lead.firma.mitarbeiter ?? '' }),
        passung: [lead.passung.stufe, lead.passung.text].filter(Boolean).join(': '),
        wen_ansprechen: lead.ansprechpartner_tipp || undefined,
        hinweis: lead.hinweis || undefined,
        email_qualitaet: lead.kontakt?.email ? (lead.kontakt.email_qualitaet ?? undefined) : undefined,
        vorschlag: {
          firma: kompakt({ name: v.firma.name, domain: v.firma.domain, ort: v.firma.ort, quelle: v.firma.quelle }),
          kontakt: v.kontakt ? kompakt({ ...v.kontakt, hauptkontakt: '' }) : null,
          deal_titel: v.dealTitel,
          deal_titel_moeglich: dealTitelListe(db),
          anlass: v.anlass,
          herkunft: vermerkText(lead, ''),
        },
        aehnliche_firmen: v.treffer.map(aehnlichZeile),
        weiter: 'Anlegen mit `linkedin_lead_anlegen`; bei ähnlicher Firma deren firma_id angeben.',
      });
    }),
  );

  server.registerTool(
    'linkedin_lead_anlegen',
    {
      title: 'Lead aus LinkedIn anlegen',
      description:
        'Legt nach `linkedin_lesen` an, was „Lead aus LinkedIn“ im Hub anlegt: Firma (oder bestehende über firma_id), optional Ansprechpartner (gleiches LinkedIn-Profil oder gleiche E-Mail wird wiederverwendet), optional Deal (Standard-Phase „qualifiziert“) und einen Verlaufseintrag mit LinkedIn-Link und Anlass. Prüft auf Dubletten. Leads ohne LinkedIn-Link mit `lead_anlegen`.',
      inputSchema: {
        herkunft: z.string().min(1).describe('vorschlag.herkunft aus `linkedin_lesen`, unverändert'),
        anlass: z.string().optional().describe('Warum der Lead interessant ist; Vorschlag aus `linkedin_lesen`'),
        firma_id: z.string().optional().describe('Bestehende Firma statt einer neuen'),
        firma: z.object({ ...firmaFelder, name: z.string().min(1) }).optional().describe('Neue Firma, aus vorschlag.firma'),
        kontakt: z.object(kontaktFelder).optional().describe('Aus vorschlag.kontakt; weglassen für keinen Ansprechpartner'),
        deal: z
          .object({
            titel: z.string().min(1).describe('vorschlag.deal_titel'),
            phase: z.enum(['neu', 'qualifiziert']).optional().describe('Standard: qualifiziert'),
            zustaendig: z.string().optional().describe('Standard: angemeldete Person'),
          })
          .optional()
          .describe('Weglassen für keinen Deal'),
        trotzdem_anlegen: z.boolean().optional().describe('Neue Firma auch bei ähnlichen Firmen anlegen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ herkunft, anlass, firma_id, firma, kontakt, deal, trotzdem_anlegen }) => {
      const link = herkunft.match(/https?:\/\/\S+/)?.[0] ?? '';
      if (!istLinkedinLink(link)) return fehler('herkunft enthält keinen LinkedIn-Link. vorschlag.herkunft aus `linkedin_lesen` unverändert übergeben.');
      if (!firma_id && !firma) return fehler('Entweder firma_id oder firma angeben.');
      const db = await service.load();
      const ich = meinName(db) ?? '';
      if (firma_id) {
        const bestehend = finde(db.firmen, firma_id, 'Firma');
        if (bestehend.archiviert) return fehler(`„${bestehend.name}“ ist archiviert. Andere Firma wählen oder sie erst wiederherstellen.`);
      }
      const firmaInput = { ...EMPTY_FIRMA_INPUT, quelle: 'LinkedIn', zustaendig: ich, ...ohneUndefined(firma ?? { name: '' }) };
      if (!firma_id) {
        pruefeTeam(db, firmaInput.zustaendig);
        const aehnlich = findeDubletten(firmaInput, aktiveFirmen(db));
        if (aehnlich.length > 0 && !trotzdem_anlegen) {
          return antwort({
            angelegt: false,
            hinweis: 'Es gibt schon ähnliche Firmen. Nichts angelegt. Bestehende über firma_id nutzen oder trotzdem_anlegen setzen.',
            aehnlich: aehnlich.map(aehnlichZeile),
          });
        }
      }
      // The checks of the hub form.
      if (kontakt && !kontakt.vorname?.trim() && !kontakt.nachname?.trim()) return fehler('Bitte den Namen der Person angeben oder kontakt weglassen.');
      if (kontakt?.email?.trim() && !isValidEmail(kontakt.email.trim())) return fehler('Die E-Mail-Adresse sieht nicht gültig aus.');
      const dealZustaendig = deal?.zustaendig ?? ich;
      if (deal) pruefeTeam(db, dealZustaendig);

      const ergebnis = await service.legeLinkedinLeadAn({
        firmaId: firma_id,
        firma: firmaInput,
        kontakt: kontakt ? { ...EMPTY_KONTAKT_INPUT, ...ohneUndefined(kontakt) } : null,
        deal: deal ? { titel: deal.titel.trim(), phase: deal.phase ?? 'qualifiziert', zustaendig: dealZustaendig } : null,
        // The same text as vermerkText(lead, anlass) on the hub page: the origin line, then the reason.
        vermerk: [herkunft.trim(), anlass?.trim() ?? ''].filter(Boolean).join('\n'),
      });
      return antwort({
        angelegt: true,
        firma: ergebnis.firma.name,
        firma_id: ergebnis.firma.id,
        kontakt_id: ergebnis.kontakt?.id,
        deal_id: ergebnis.deal?.id,
        hub: firmaLink(ergebnis.firma.id),
      });
    }),
  );

  // ─── CSV-Import ─────────────────────────────────────────────────────────────

  server.registerTool(
    'csv_import',
    {
      title: 'Leads aus CSV importieren',
      description: [
        'CSV wie unter „Import“ im Hub (Format des Magento-Lead-Qualifiers oder eigene Liste, Pflichtspalte „domain“, Trennzeichen Komma oder Semikolon).',
        'Ohne ausfuehren nur Vorschau: je Zeile neu / ergaenzen / dublette / unveraendert / uebersprungen / fehler. Erst nach Rückfrage mit ausfuehren: true importieren.',
        'Vorhandene Firmen (gleiche Domain) werden nie überschrieben, nur leere Felder ergänzt.',
      ].join(' '),
      inputSchema: {
        csv: z.string().min(1).describe('Inhalt der CSV-Datei, erste Zeile Spaltennamen'),
        tiers: z.array(z.enum([...TIERS, 'sonstige'])).optional().describe('Welche Tiers importieren; "sonstige" = unbekannte Tiers. Standard: A, B'),
        zustaendig: z.string().optional().describe('Für neue Leads; Standard: wer angemeldet ist'),
        deal_anlegen: z.boolean().optional().describe('Für jede neue Firma einen Deal in „neu“, Standard true'),
        deal_titel: z.string().optional().describe('Standard: Deal-Titel aus den Einstellungen'),
        dubletten_importieren: z.boolean().optional().describe('Mögliche Dubletten trotzdem importieren, Standard false'),
        ausfuehren: z.boolean().optional().describe('true schreibt den Import, sonst nur Vorschau'),
        nur_aktion: z.enum(IMPORT_AKTIONEN).optional().describe('Vorschau nur für diese Aktion'),
        limit: z.number().int().min(1).max(500).optional().describe('Zeilen in der Vorschau, Standard 50'),
      },
      annotations: schreiben,
    },
    sicher(async ({ csv, tiers, zustaendig, deal_anlegen, deal_titel, dubletten_importieren, ausfuehren, nur_aktion, limit }) => {
      if (csv.length > MAX_CSV_ZEICHEN) return fehler('Die Datei ist größer als 5 MB – bitte in kleinere Teile aufteilen.');
      const rows = parseCsv(csv);
      if (rows.length < 2) return fehler('Die CSV enthält keine Datenzeilen.');
      const db = await service.load();
      const optionen: ImportOptionen = {
        tiers: tiers ?? ['A', 'B'],
        zustaendig: zustaendig ?? meinName(db) ?? '',
        dealAnlegen: deal_anlegen ?? true,
        dealTitel: deal_titel ?? '',
        dublettenImportieren: dubletten_importieren ?? false,
      };
      pruefeTeam(db, optionen.zustaendig);
      const plan = planeImport(rows, db, optionen);
      if (plan.fehlendeSpalten.length > 0) return fehler(`In der CSV fehlt die Spalte „${plan.fehlendeSpalten.join('“, „')}“.`);

      const zaehler = Object.fromEntries(IMPORT_AKTIONEN.map((a) => [a, plan.zeilen.filter((z) => z.aktion === a).length])) as Record<ImportAktion, number>;
      const schreibend = zaehler.neu + zaehler.ergaenzen;
      const einstellungen = kompakt({
        tiers: optionen.tiers,
        zustaendig: optionen.zustaendig,
        deal_anlegen: optionen.dealAnlegen,
        deal_titel: optionen.dealAnlegen ? optionen.dealTitel.trim() || db.einstellungen[EINSTELLUNG.dealTitel] || DEFAULT_DEAL_TITEL : '',
        dubletten_importieren: optionen.dublettenImportieren,
      });

      if (ausfuehren) {
        if (schreibend === 0) return antwort({ importiert: false, hinweis: 'Nichts zu importieren.', zaehler });
        const ergebnis = await service.importiere(plan);
        return antwort({
          importiert: true,
          neue_firmen: ergebnis.neu,
          ergaenzt: ergebnis.ergaenzt,
          kontakte: ergebnis.kontakte,
          deals: ergebnis.deals,
          nicht_importiert: { dublette: zaehler.dublette, uebersprungen: zaehler.uebersprungen, fehler: zaehler.fehler },
          einstellungen,
          hub: `${HUB}/#/crm/firmen?status=lead`,
        });
      }

      const sichtbar = plan.zeilen.filter((z) => !nur_aktion || z.aktion === nur_aktion);
      const anzahl = limit ?? 50;
      return antwort({
        vorschau: true,
        zeilen_gesamt: plan.zeilen.length,
        zaehler,
        wuerde_schreiben: schreibend,
        einstellungen,
        zeilen: sichtbar.slice(0, anzahl).map((z) =>
          kompakt({ zeile: z.zeile, aktion: z.aktion, domain: z.domain, name: z.name, tier: z.tier, hinweis: z.hinweis, firma_id: z.firmaId ?? z.dubletteVon?.firmaId }),
        ),
        weitere_zeilen: sichtbar.length > anzahl ? sichtbar.length - anzahl : undefined,
        weiter: schreibend > 0 ? 'Zum Importieren denselben Aufruf mit ausfuehren: true wiederholen.' : 'Nichts zu importieren.',
        hub: IMPORT_LINK,
      });
    }),
  );

  // ─── Lead-Finder ────────────────────────────────────────────────────────────

  server.registerTool(
    'lead_finder_statistik',
    {
      title: 'Lead-Finder: Zahlen',
      description: 'Pool, geprüfte, qualifizierte, übernommene und abgelehnte Shops, Backlog und „Manuell prüfen“, Stand der Daten, dazu die eigenen Entscheidungen der letzten zwei Wochen.',
      annotations: liestAussen,
    },
    sicher(async () => {
      const api = leadFinder();
      const [s, tage] = await Promise.all([api.statistik(), api.zaehler()]);
      const heute = k.heute();
      const summe = (f: (t: (typeof tage)[number]) => boolean) => tage.filter(f).reduce((n, t) => n + t.n, 0);
      return antwort({
        ...s,
        meine_entscheidungen: {
          heute: Object.fromEntries(tage.filter((t) => t.tag === heute && t.n > 0).map((t) => [t.entscheidung, t.n])),
          vierzehn_tage: summe(() => true),
          davon_uebernommen: summe((t) => t.entscheidung === 'pipeline' || t.entscheidung === 'firma'),
        },
        hub: `${HUB}/#/leads/suche`,
      });
    }),
  );

  server.registerTool(
    'lead_finder_backlog',
    {
      title: 'Lead-Finder: Backlog',
      description:
        'Geprüfte Shops mit Anlass, die auf eine Entscheidung warten, wie der Backlog im Hub: je Sicht (migration, ads, klaviyo) nach Score sortiert, mit Filtern. Liefert die Domains für `lead_finder_shop`, `lead_finder_uebernehmen` und `lead_finder_entscheiden`.',
      inputSchema: {
        bereich: z.enum(BEREICH_IDS).optional().describe('Sicht, Standard migration'),
        suchbegriff: z.string().optional().describe('In Firma, Domain, Ort, E-Mail'),
        system: z.string().optional().describe('System-Id wie magento, shopware, oxid'),
        anlass: z.string().optional().describe(`Anlass-Id: ${Object.keys(ANLASS_LABEL).join(', ')}`),
        max_rang: z.number().int().positive().optional().describe('Nur Shops bis zu diesem Reichweiten-Rang in Deutschland, z. B. 100000'),
        plz: z.string().optional().describe('PLZ-Anfang, z. B. "5" oder "50"'),
        branchen: z.array(z.string()).optional().describe('Branchen-Ids (mode, wohnen, sport, lebensmittel …)'),
        branchen_ausblenden: z.boolean().optional().describe('Die genannten Branchen ausblenden statt nur sie zu zeigen'),
        limit: z.number().int().min(1).max(200).optional().describe('Standard 25'),
      },
      annotations: liestAussen,
    },
    sicher(async ({ bereich, suchbegriff, system, anlass, max_rang, plz, branchen, branchen_ausblenden, limit }) => {
      const ansicht: Bereich = bereich ?? 'migration';
      const alle = await leadFinder().backlog();
      // Sorting and filters as on BacklogPage.
      const zeilen = alle.filter((z) => z.bereiche.includes(ansicht)).sort((a, b) => scoreIn(b, ansicht) - scoreIn(a, ansicht) || a.domain.localeCompare(b.domain));
      const q = suchbegriff?.trim().toLowerCase() ?? '';
      const wahl = new Set(branchen ?? []);
      const sichtbar = zeilen.filter(
        (z) =>
          (!q || `${z.firma} ${z.domain} ${z.ort} ${z.email ?? ''}`.toLowerCase().includes(q)) &&
          (!system || z.system === system) &&
          (!anlass || z.anlaesse.includes(anlass)) &&
          (!max_rang || (z.rang_de !== null && z.rang_de <= max_rang)) &&
          (!plz || z.plz.startsWith(plz)) &&
          (wahl.size === 0 || wahl.has(z.branche ?? '') !== Boolean(branchen_ausblenden)),
      );
      return antwort({
        sicht: bereichLabel(ansicht),
        je_sicht: Object.fromEntries(BEREICHE.map((b) => [b.id, alle.filter((z) => z.bereiche.includes(b.id)).length])),
        treffer: sichtbar.length,
        shops: sichtbar.slice(0, limit ?? 25).map((z) => backlogZeile(z, ansicht)),
        ohne_branche: zeilen.some((z) => !z.branche) ? 'Einige Shops haben noch keine Branche; `lead_finder_branchen` ordnet sie ein.' : undefined,
        hub: BACKLOG_LINK,
      });
    }),
  );

  server.registerTool(
    'lead_finder_manuell',
    {
      title: 'Lead-Finder: Manuell prüfen',
      description:
        'Shops mit Anlass, die die automatische Prüfung nicht beurteilen konnte (sperren Abrufe, Adresse im Impressum unlesbar, keine E-Mail). Entscheiden mit `lead_finder_entscheiden`: freigeben (nur mit Kontakt-E-Mail) oder ablehnen.',
      inputSchema: { limit: z.number().int().min(1).max(200).optional().describe('Standard 25') },
      annotations: liestAussen,
    },
    sicher(async ({ limit }) => {
      const zeilen = await leadFinder().manuell();
      return antwort({
        anzahl: zeilen.length,
        shops: zeilen.slice(0, limit ?? 25).map((z) =>
          kompakt({
            domain: z.domain,
            shop: `https://${z.domain}/`,
            firma: z.firma,
            warum_manuell: z.ausschluss.filter((a) => a !== 'kein_anlass').map((a) => AUSSCHLUSS_LABEL[a] ?? a).join(', ') || (!z.email ? AUSSCHLUSS_LABEL.keine_email : ''),
            system: systemLabel(z.system, z.version),
            anlaesse: z.anlaesse.map((a) => ANLASS_LABEL[a] ?? a),
          }),
        ),
        hub: MANUELL_LINK,
      });
    }),
  );

  server.registerTool(
    'lead_finder_shop',
    {
      title: 'Lead-Finder: Prüfdaten eines Shops',
      description:
        'Alles, was die Prüfung zu einer Domain gefunden hat: Impressum, System und Support, Anlässe und Score je Sicht, Ausschlussgründe, Werbung, E-Mail-Tools – und ob schon entschieden wurde.',
      inputSchema: { domain: z.string().min(1).describe('Domain aus `lead_finder_backlog` oder `lead_finder_manuell`') },
      annotations: liestAussen,
    },
    sicher(async ({ domain }) => {
      const d = await leadFinder().detail(domain.trim().toLowerCase());
      const kd = d.kandidat;
      const f = kd.firma;
      const offen = !d.entscheidung || d.entscheidung === 'freigegeben' || d.entscheidung === 'zurueckgestellt';
      return antwort({
        domain: kd.domain,
        url: kd.url,
        geprueft_am: zeitBerlin(d.geprueft_am),
        qualifiziert: kd.qualifiziert,
        entscheidung: d.entscheidung
          ? kompakt({ entscheidung: d.entscheidung, grund: d.grund, am: d.entschieden_am?.slice(0, 10), von: d.entschieden_von, firma_id: d.firma_id })
          : undefined,
        kann_uebernommen_werden: offen && (kd.qualifiziert || d.entscheidung === 'freigegeben'),
        firma: kompakt({
          name: f.name,
          rechtsform: f.rechtsform,
          register: f.register ? `${f.register}${f.registergericht ? ` (${f.registergericht})` : ''}` : '',
          ust_id: f.ust_id,
          geschaeftsfuehrung: f.geschaeftsfuehrer.join(', '),
          adresse: [f.strasse, `${f.plz} ${f.ort}`.trim()].filter(Boolean).join(', '),
          email: f.email,
          telefon: f.telefon,
          impressum: f.url,
        }),
        system: systemLabel(kd.system, kd.version),
        support: kd.support.text || undefined,
        letztes_deploy: kd.letztes_deploy || undefined,
        branche: brancheLabel(kd.branche) || undefined,
        sichten: BEREICHE.filter((b) => kd.anlaesse.some((a) => (a.bereich ?? 'migration') === b.id)).map((b) => {
          const score = kd.scores?.[b.id] || kd.score;
          return { bereich: b.id, score, tier: tierVon(score), anlaesse: kd.anlaesse.filter((a) => (a.bereich ?? 'migration') === b.id).map((a) => a.text) };
        }),
        ausschluss: kd.ausschluss.map((a) => `${AUSSCHLUSS_LABEL[a.id] ?? a.id}: ${a.text}`),
        reichweite: reichweiteLabel(kd.rang_de),
        lcp_ms: kd.lcp_ms ?? undefined,
        produkt_urls: kd.sitemap.produkt_urls || kd.sitemap.urls || undefined,
        werbung: [...(kd.werbung ?? []), ...(kd.gtm ? ['GTM'] : [])],
        email_tools: kd.email_tools,
        zahlarten: kd.zahlarten,
        bewertungen: kd.bewertungen,
        hub: d.firma_id ? firmaLink(d.firma_id) : shopLink(kd.domain),
      });
    }),
  );

  server.registerTool(
    'lead_finder_pruefen',
    {
      title: 'Lead-Finder: nächste Shops prüfen',
      description:
        'Holt die nächsten ungeprüften Shops aus dem Pool (Reihenfolge der Vorab-Priorität) und prüft sie live, wie „Suche“ im Hub. Qualifizierte landen im Backlog, unklare unter „Manuell prüfen“. Dauert einige Sekunden je Shop; höchstens 30 pro Aufruf.',
      inputSchema: {
        anzahl: z.number().int().min(1).max(30).optional().describe('Standard 10'),
        bereich: z.enum(BEREICH_IDS).optional().describe('Sicht für die Priorität, Standard migration'),
      },
      annotations: schreibtAussen,
    },
    sicher(async ({ anzahl, bereich }) => {
      const api = leadFinder();
      const queue = await api.naechste(anzahl ?? 10, bereich ?? 'migration');
      if (queue.length === 0) return antwort({ geprueft: 0, hinweis: 'Im Pool ist nichts Ungeprüftes mehr.' });
      const ergebnisse: LeadKandidat[] = [];
      const fehlgeschlagen: { domain: string; meldung: string }[] = [];
      const arbeiter = async () => {
        while (queue.length > 0) {
          const kandidat = queue.shift()!;
          try {
            ergebnisse.push(await api.pruefe(kandidat));
          } catch (err) {
            fehlgeschlagen.push({ domain: kandidat.domain, meldung: err instanceof Error ? err.message : String(err) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(GLEICHZEITIG, queue.length) }, arbeiter));
      return antwort({
        geprueft: ergebnisse.length,
        qualifiziert: ergebnisse.filter((e) => e.qualifiziert).length,
        manuell_pruefen: ergebnisse.filter(istManuell).length,
        fehler: fehlgeschlagen.length ? fehlgeschlagen : undefined,
        shops: ergebnisse.sort((a, b) => Number(b.qualifiziert) - Number(a.qualifiziert) || b.score - a.score).map(kandidatKurz),
        hub: BACKLOG_LINK,
      });
    }),
  );

  server.registerTool(
    'lead_finder_uebernehmen',
    {
      title: 'Lead-Finder: Shops ins CRM übernehmen',
      description:
        'Übernimmt geprüfte Shops wie im Hub über die Import-Planung (Dublettenprüfung per Domain, USt-ID usw.; bestehende Firmen werden nie überschrieben, nur leere Felder ergänzt). Ziel „pipeline“ = Firma + Deal (Titel nach Sicht), „firma“ = nur Firmenübersicht. Die Entscheidung wird im Lead-Finder vermerkt. Mögliche Dubletten werden nicht übernommen und bleiben im Backlog.',
      inputSchema: {
        domains: z.array(z.string().min(1)).min(1).max(50).describe('Domains aus `lead_finder_backlog`'),
        ziel: z.enum(['pipeline', 'firma']).optional().describe('Standard pipeline'),
        bereich: z.enum(BEREICH_IDS).optional().describe('Sicht: bestimmt Score/Tier, Reihenfolge der Anlässe und den Deal-Titel. Standard migration'),
        zustaendig: z.string().optional().describe('Vorname aus dem Team; Standard: wer angemeldet ist'),
        phase: z.enum(['neu', 'qualifiziert']).optional().describe('Startphase der Deals, Standard neu'),
      },
      annotations: schreibtAussen,
    },
    sicher(async ({ domains, ziel, bereich, zustaendig, phase }) => {
      const api = leadFinder();
      const db = await service.load();
      const wer = zustaendig ?? meinName(db) ?? '';
      pruefeTeam(db, wer);
      const sicht: Bereich = bereich ?? 'migration';
      const wohin = ziel ?? 'pipeline';
      const gesucht = [...new Set(domains.map((d) => d.trim().toLowerCase()))];
      const kandidaten = await api.details(gesucht);
      const unbekannt = gesucht.filter((d) => !kandidaten.some((kd) => kd.domain === d));
      if (unbekannt.length > 0) return fehler(`Nicht geprüft oder unbekannt: ${unbekannt.join(', ')}. Domains über \`lead_finder_backlog\` holen. Nichts übernommen.`);
      // The hub only takes shops from the backlog: qualified or released, and not yet decided otherwise.
      const details = await Promise.all(gesucht.map((d) => api.detail(d)));
      const gesperrt = details.filter((d) => !(d.entscheidung === 'freigegeben' || (d.kandidat.qualifiziert && (!d.entscheidung || d.entscheidung === 'zurueckgestellt'))));
      if (gesperrt.length > 0) {
        return fehler(`Nicht übernehmbar (nicht qualifiziert oder schon entschieden): ${gesperrt.map((d) => `${d.kandidat.domain}${d.entscheidung ? ` (${d.entscheidung})` : ''}`).join(', ')}. Nichts übernommen.`);
      }

      // The same steps as useUebernahme in src/leads/useLeadFinder.ts.
      const plan = planeImport(importZeilen(kandidaten, sicht), db, {
        tiers: ['A', 'B', 'C', 'D', 'sonstige'],
        zustaendig: wer,
        dealAnlegen: wohin === 'pipeline',
        dealTitel: dealTitelVon(sicht),
        dealPhase: phase ?? 'neu',
      });
      const ergebnis = await service.importiere(plan);
      const eintraege: EntscheidungEintrag[] = plan.zeilen
        .filter((z) => ergebnis.firmen[z.domain])
        .map((z) => ({
          domain: z.domain,
          entscheidung: wohin,
          firma_id: ergebnis.firmen[z.domain],
          grund: `${bereichLabel(sicht)}${z.aktion === 'ergaenzen' ? ', war schon im CRM, leere Felder ergänzt' : ''}`,
        }));
      if (eintraege.length > 0) await api.entscheide(eintraege);
      return antwort({
        neu: ergebnis.neu,
        ergaenzt: ergebnis.ergaenzt,
        deals: ergebnis.deals,
        firmen: eintraege.map((e) => ({ domain: e.domain, firma_id: e.firma_id, hub: firmaLink(e.firma_id!) })),
        nicht_uebernommen: plan.zeilen
          .filter((z) => !ergebnis.firmen[z.domain])
          .map((z) => kompakt({ domain: z.domain, aktion: z.aktion, hinweis: z.hinweis, firma_id: z.firmaId ?? z.dubletteVon?.firmaId })),
      });
    }),
  );

  server.registerTool(
    'lead_finder_entscheiden',
    {
      title: 'Lead-Finder: ablehnen, zurückstellen, freigeben',
      description: [
        'ablehnen: endgültig, mit grund (im Hub: „Zu klein“, „Passt nicht zu uns“, „Schon im Gespräch oder Kunde“, „Firma nicht mehr aktiv“, „Daten falsch erkannt“ oder eigener Text; aus „Manuell prüfen“: „manuell verworfen“).',
        'zurueckstellen: drei Monate aus dem Backlog.',
        'freigeben: einen Shop aus „Manuell prüfen“ mit Kontakt-E-Mail in den Backlog geben.',
        'Ins CRM übernehmen geht mit `lead_finder_uebernehmen`. Vorher nachfragen.',
      ].join(' '),
      inputSchema: {
        domains: z.array(z.string().min(1)).min(1).max(100).describe('Domains aus `lead_finder_backlog` oder `lead_finder_manuell`'),
        entscheidung: z.enum(['ablehnen', 'zurueckstellen', 'freigeben']),
        grund: z.string().optional().describe('Pflicht bei ablehnen'),
        email: z.string().optional().describe('Pflicht bei freigeben: Kontakt-E-Mail des Shops'),
      },
      annotations: schreibtAussen,
    },
    sicher(async ({ domains, entscheidung, grund, email }) => {
      const api = leadFinder();
      const liste = [...new Set(domains.map((d) => d.trim().toLowerCase()))];
      let eintraege: EntscheidungEintrag[];
      if (entscheidung === 'ablehnen') {
        if (!grund?.trim()) return fehler('Zum Ablehnen einen grund angeben.');
        eintraege = liste.map((domain) => ({ domain, entscheidung: 'abgelehnt', grund: grund.trim() }));
      } else if (entscheidung === 'zurueckstellen') {
        eintraege = liste.map((domain) => ({ domain, entscheidung: 'zurueckgestellt' }));
      } else {
        if (liste.length !== 1) return fehler('Freigeben geht nur für einen Shop auf einmal, mit dessen E-Mail.');
        const adresse = email?.trim().toLowerCase() ?? '';
        if (!isValidEmail(adresse)) return fehler('Zum Freigeben eine gültige Kontakt-E-Mail angeben.');
        eintraege = [{ domain: liste[0], entscheidung: 'freigegeben', grund: 'manuell geprüft', email: adresse }];
      }
      await api.entscheide(eintraege);
      return antwort({
        erledigt: liste.length,
        entscheidung: eintraege[0].entscheidung,
        hinweis: entscheidung === 'zurueckstellen' ? 'Für 3 Monate zurückgestellt.' : entscheidung === 'freigeben' ? `${liste[0]} ist jetzt im Backlog.` : undefined,
      });
    }),
  );

  server.registerTool(
    'lead_finder_branchen',
    {
      title: 'Lead-Finder: Branchen einordnen',
      description:
        'Lässt Claude die Branche von Shops im Backlog und unter „Manuell prüfen“ anhand der Startseite einordnen, solange sie noch keine haben (das macht der Hub beim Öffnen des Backlogs).',
      inputSchema: { anzahl: z.number().int().min(1).max(48).optional().describe('Höchstens so viele Shops, Standard 24') },
      annotations: schreibtAussen,
    },
    sicher(async ({ anzahl }) => {
      const api = leadFinder();
      const ziel = anzahl ?? 24;
      const eingeordnet: { domain: string; branche: string }[] = [];
      let fehlerZahl = 0;
      let offen = 0;
      while (eingeordnet.length < ziel) {
        const e = await api.branchen(Math.min(BRANCHEN_JE_AUFRUF, ziel - eingeordnet.length));
        eingeordnet.push(...e.eingeordnet);
        fehlerZahl += e.fehler;
        offen = e.offen;
        if (e.offen === 0 || e.eingeordnet.length === 0) break;
      }
      return antwort({
        eingeordnet: eingeordnet.map((e) => ({ domain: e.domain, branche: brancheLabel(e.branche) })),
        fehler: fehlerZahl || undefined,
        noch_offen: offen,
      });
    }),
  );

  server.registerTool(
    'branchen_nachtragen',
    {
      title: 'Branchen von CRM-Firmen nachtragen',
      description:
        'Füllt die Branche von CRM-Firmen ohne Branche über den Lead-Finder (bekannte Shops sofort, die übrigen ordnet Claude ein), wie „Branchen nachtragen“ in der Firmenliste. Nur leere Felder werden geschrieben.',
      inputSchema: { limit: z.number().int().min(1).max(96).optional().describe('Höchstens so viele Firmen, Standard 24') },
      annotations: schreibtAussen,
    },
    sicher(async ({ limit }) => {
      const api = leadFinder();
      const db = await service.load();
      const offen = db.firmen.filter((f) => !f.archiviert && !f.branche && GUELTIGE_DOMAIN.test(f.domain));
      const liste = offen.slice(0, limit ?? 24);
      let ergaenzt = 0;
      // The same batches as useBranchenNachtrag in src/leads/useLeadFinder.ts.
      for (let i = 0; i < liste.length; i += BRANCHEN_JE_AUFRUF) {
        const stapel = liste.slice(i, i + BRANCHEN_JE_AUFRUF);
        const e = await api.branchenFuer(stapel.map((f) => f.domain));
        const nachDomain = new Map(e.eingeordnet.map((x) => [x.domain, x.branche]));
        const werte = stapel.flatMap((f) => (nachDomain.has(f.domain) ? [{ firmaId: f.id, branche: nachDomain.get(f.domain)! }] : []));
        if (werte.length) ergaenzt += await service.ergaenzeBranchen(werte);
      }
      return antwort({ geprueft: liste.length, ergaenzt, noch_ohne_branche: offen.length - liste.length });
    }),
  );

  server.registerTool(
    'lead_finder_pool_aktualisieren',
    {
      title: 'Lead-Finder: Pool aktualisieren',
      description: 'Lädt den Pool neu aus dem aktuellen HTTP-Archive-Crawl und den Chrome-Daten (wie „Pool aktualisieren“ unter Suche). Nur auf ausdrücklichen Wunsch, etwa einmal im Monat.',
      annotations: schreibtAussen,
    },
    sicher(async () => {
      const q = await leadFinder().importiere();
      const monat = q.crux_monat ? `${String(q.crux_monat).slice(4)}/${String(q.crux_monat).slice(0, 4)}` : '–';
      return antwort({ aktualisiert: true, crawl_vom: q.crawl_datum, chrome_daten: monat });
    }),
  );
}
