import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  AKTIVITAET_TYPEN,
  EOL,
  isAbgeschlossen,
  istErstkontakt,
  KONTAKT_WEGE,
  kontaktVermerk,
  PHASEN,
  phaseLabel,
  STATUS,
  TIERS,
} from '../../../src/data/constants';
import type { CrmService } from '../../../src/data/crm';
import { findeDubletten, dublettenText } from '../../../src/data/dubletten';
import { DuplicateError } from '../../../src/data/errors';
import { kontaktName, suggestKuerzel } from '../../../src/data/rules';
import { driveKonfiguration, findeTeamMitglied, indexById, kennzahlen, meinTag, offeneDeals, type Aufgabe } from '../../../src/data/selectors';
import { suche } from '../../../src/data/suche';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Database, type Deal, type Firma, type Kontakt, type KontaktInput } from '../../../src/data/types';
import type { Person } from './google';

const HUB = 'https://crm.velonify.de';
const firmaLink = (id: string) => `${HUB}/#/crm/firmen/${id}`;
const driveLink = (id: string) => (id ? `https://drive.google.com/drive/folders/${id}` : undefined);

export const ANLEITUNG = `Velonify-CRM (Google Sheet hinter crm.velonify.de). Schreibende Werkzeuge laufen über dieselben Regeln wie der Hub: Verlauf, Zuständigkeit, Kundenordner.
- IDs immer über \`suchen\` oder \`firma_anzeigen\` holen, nie raten.
- Vor \`lead_anlegen\` suchen, ob die Firma schon existiert.
- Phasen: ${PHASEN.join(' → ')}. Phasenwechsel nur mit \`phase_aendern\`, LinkedIn-Anfragen mit Phase "vernetzung" und danach \`vernetzung_ergebnis\`.
- "zustaendig" ist ein Vorname aus dem Team (siehe \`ueberblick\`), keine E-Mail.
- Daten im Format JJJJ-MM-TT. Die Zeitzone ist Europe/Berlin.
- Nichts wird gelöscht. \`archivieren\` blendet Firmen, Deals oder Kontakte aus und lässt sich rückgängig machen; vorher nachfragen.`;

// ─── Ausgabe ────────────────────────────────────────────────────────────────

const META = new Set(['erstellt_von', 'geaendert_von', 'archiviert']);

/** Drops empty fields and bookkeeping, so Claude reads what matters. */
function kompakt<T extends object>(eintrag: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(eintrag).filter(([schluessel, wert]) => !META.has(schluessel) && wert !== '' && wert !== null && wert !== undefined),
  );
}

const antwort = (daten: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(daten, null, 1) }] });
const fehler = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

function fehlerText(err: unknown): string {
  if (err instanceof DuplicateError) return `${err.message} (firma_id ${err.existingId}). Nichts angelegt.`;
  if (err instanceof Error) {
    if (err.name === 'ConflictError') return `${err.message} Bitte neu laden und noch einmal versuchen.`;
    return err.message || err.name;
  }
  return String(err);
}

function dealZeile(deal: Deal, firmen: Map<string, Firma>, kontakte?: Map<string, Kontakt>) {
  const kontakt = kontakte?.get(deal.kontakt_id);
  return kompakt({
    deal_id: deal.id,
    titel: deal.titel,
    firma: firmen.get(deal.firma_id)?.name,
    firma_id: deal.firma_id,
    phase: deal.phase,
    zustaendig: deal.zustaendig,
    kontakt: kontakt ? kontaktName(kontakt) : '',
    wert_eur: deal.wert_eur,
    naechster_schritt: deal.naechster_schritt,
    naechster_schritt_am: deal.naechster_schritt_am,
    verlustgrund: deal.verlustgrund,
    abgeschlossen_am: deal.abgeschlossen_am,
    geaendert_am: deal.geaendert_am.slice(0, 10),
  });
}

function aufgabeZeile(a: Aufgabe) {
  return kompakt({
    art: a.art,
    titel: a.titel,
    faellig: a.faellig,
    zustaendig: a.zustaendig,
    firma: a.firma?.name,
    firma_id: a.firma?.id,
    deal_id: a.deal?.id,
    deal: a.deal?.titel,
    wiedervorlage_id: a.wiedervorlage?.id,
  });
}

function finde<T extends { id: string }>(liste: readonly T[], id: string, was: string): T {
  const treffer = liste.find((e) => e.id === id);
  if (!treffer) throw new Error(`${was} „${id}“ nicht gefunden. IDs über \`suchen\` holen.`);
  return treffer;
}

// ─── Eingaben ───────────────────────────────────────────────────────────────

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT');

const firmaFelder = {
  name: z.string().optional(),
  domain: z.string().optional().describe('Shop-Domain, z. B. beispiel.de'),
  status: z.enum(STATUS).optional(),
  tier: z.enum(TIERS).optional(),
  plattform: z.string().optional().describe('z. B. Magento, Shopware, WooCommerce'),
  version: z.string().optional(),
  eol: z.enum(EOL).optional(),
  ort: z.string().optional(),
  email_allgemein: z.string().optional(),
  telefon_allgemein: z.string().optional(),
  tech_info: z.string().optional(),
  quelle: z.string().optional().describe('Woher der Lead kommt, z. B. LinkedIn, Empfehlung, Website'),
  zustaendig: z.string().optional(),
  register: z.string().optional(),
  ust_id: z.string().optional(),
  notiz: z.string().optional(),
};

const kontaktFelder = {
  vorname: z.string().optional(),
  nachname: z.string().optional(),
  rolle: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  linkedin: z.string().optional().describe('Profil-URL'),
  hauptkontakt: z.boolean().optional(),
  notiz: z.string().optional(),
};

const dealFelder = {
  titel: z.string().optional(),
  kontakt_id: z.string().optional(),
  wert_eur: z.number().nonnegative().nullable().optional(),
  wahrscheinlichkeit: z.number().min(0).max(100).nullable().optional(),
  zustaendig: z.string().optional(),
  naechster_schritt: z.string().optional(),
  naechster_schritt_am: z.union([datum, z.literal('')]).optional(),
};

/** The editable fields of an existing contact, so a partial change keeps the rest. */
const kontaktInput = (k: Kontakt): KontaktInput =>
  Object.fromEntries(Object.keys(EMPTY_KONTAKT_INPUT).map((feld) => [feld, k[feld as keyof KontaktInput]])) as unknown as KontaktInput;

const ohneUndefined = <T extends object>(eintrag: T) =>
  Object.fromEntries(Object.entries(eintrag).filter(([, wert]) => wert !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

// ─── Werkzeuge ──────────────────────────────────────────────────────────────

export interface Kontext {
  service: CrmService;
  person: Person;
  /** Fixed team name for the person (TEAM_ZUORDNUNG), when name and address do not give it away ("lukas" → "Lugge"). */
  teamName?: string;
  heute: () => string;
}

/** The team name of the signed-in person: the fixed one if it is in the team, else found like the hub's useIch does. */
function ichAus(db: Database, person: Person, teamName?: string): string | null {
  const team = db.listen.team ?? [];
  if (teamName && team.includes(teamName)) return teamName;
  return findeTeamMitglied(team, person.name, person.email);
}

/** "lukas@velonify.de=Lugge; julian@velonify.de=Julian" → address → team name. */
export function leseTeamZuordnung(wert: string): Map<string, string> {
  const zuordnung = new Map<string, string>();
  for (const eintrag of wert.split(/[;,]/)) {
    const [email, name] = eintrag.split('=').map((t) => t.trim());
    if (email && name) zuordnung.set(email.toLowerCase(), name);
  }
  return zuordnung;
}

function pruefeTeam(db: Database, name: string | undefined): void {
  const team = db.listen.team ?? [];
  if (name && team.length > 0 && !team.includes(name)) throw new Error(`„${name}“ ist nicht im Team. Möglich: ${team.join(', ')}.`);
}

export function registriereWerkzeuge(server: McpServer, { service, person, teamName, heute }: Kontext): void {
  const meinName = (db: Database) => ichAus(db, person, teamName);

  const lesen = { readOnlyHint: true, openWorldHint: false } as const;
  const schreiben = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  const sicher =
    <A>(fn: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        return await fn(args);
      } catch (err) {
        return fehler(fehlerText(err));
      }
    };

  server.registerTool(
    'ueberblick',
    {
      title: 'CRM-Überblick',
      description: 'Wer angemeldet ist, Team, Listen (Verlustgründe, Kontaktwege, Aktivitätstypen), Phasen und Kennzahlen der Pipeline. Guter Einstieg.',
      annotations: lesen,
    },
    sicher(async () => {
      const db = await service.load();
      const offen = offeneDeals(db.deals.filter((d) => !d.archiviert));
      return antwort({
        angemeldet: { email: person.email, team_name: meinName(db) },
        heute: heute(),
        team: db.listen.team ?? [],
        verlustgruende: db.listen.verlustgrund ?? [],
        kontaktwege: KONTAKT_WEGE,
        aktivitaetstypen: AKTIVITAET_TYPEN,
        phasen: PHASEN.map((p) => ({ phase: p, label: phaseLabel(p), offene_deals: offen.filter((d) => d.phase === p).length })),
        kennzahlen: kennzahlen(db.deals, heute()),
        firmen: db.firmen.filter((f) => !f.archiviert).length,
        drive_eingerichtet: Boolean(driveKonfiguration(db.einstellungen)),
      });
    }),
  );

  server.registerTool(
    'suchen',
    {
      title: 'Im CRM suchen',
      description: 'Sucht Firmen (Name, Domain, Kürzel, Ort), Kontakte (Name, E-Mail, Rolle) und Deals (Titel). Umlaute egal. Liefert IDs für die anderen Werkzeuge.',
      inputSchema: { suchbegriff: z.string().min(1), archivierte_zeigen: z.boolean().optional() },
      annotations: lesen,
    },
    sicher(async ({ suchbegriff, archivierte_zeigen }) => {
      const db = await service.load();
      const treffer = suche(db, suchbegriff, 10).filter((t) => archivierte_zeigen || !t.archiviert);
      if (treffer.length === 0) return antwort({ treffer: [], hinweis: 'Nichts gefunden.' });
      return antwort({
        treffer: treffer.map((t) => kompakt({ art: t.art, id: t.id, firma_id: t.firmaId, titel: t.titel, details: t.details, archiviert: t.archiviert || '' })),
      });
    }),
  );

  server.registerTool(
    'firma_anzeigen',
    {
      title: 'Firmenakte anzeigen',
      description: 'Alles zu einer Firma: Stammdaten, Kontakte, Deals, offene Wiedervorlagen und die letzten Einträge im Verlauf, mit Link in den Hub.',
      inputSchema: { firma_id: z.string(), verlauf_anzahl: z.number().int().min(0).max(200).optional().describe('Standard 25') },
      annotations: lesen,
    },
    sicher(async ({ firma_id, verlauf_anzahl }) => {
      const db = await service.load();
      const firma = finde(db.firmen, firma_id, 'Firma');
      const firmen = indexById(db.firmen);
      const kontakte = db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert);
      const kontaktIndex = indexById(db.kontakte);
      const verlauf = db.aktivitaeten
        .filter((a) => a.firma_id === firma.id)
        .sort((a, b) => b.datum.localeCompare(a.datum))
        .slice(0, verlauf_anzahl ?? 25);
      return antwort({
        firma: kompakt({ ...firma, archiviert: firma.archiviert || '' }),
        hub: firmaLink(firma.id),
        drive: driveLink(firma.drive_ordner_id),
        kontakte: kontakte.map((k) => kompakt({ kontakt_id: k.id, name: kontaktName(k), ...k, id: undefined, firma_id: undefined, vorname: undefined, nachname: undefined })),
        deals: db.deals.filter((d) => d.firma_id === firma.id && !d.archiviert).map((d) => dealZeile(d, firmen, kontaktIndex)),
        wiedervorlagen: db.wiedervorlagen
          .filter((w) => w.firma_id === firma.id && !w.erledigt_am)
          .map((w) => kompakt({ wiedervorlage_id: w.id, titel: w.titel, faellig_am: w.faellig_am, zustaendig: w.zustaendig, deal_id: w.deal_id })),
        verlauf: verlauf.map((a) =>
          kompakt({ datum: a.datum.slice(0, 16), typ: a.typ, text: a.text, von: a.von, deal_id: a.deal_id, kontakt: kontaktIndex.get(a.kontakt_id) ? kontaktName(kontaktIndex.get(a.kontakt_id)!) : '' }),
        ),
      });
    }),
  );

  server.registerTool(
    'pipeline',
    {
      title: 'Pipeline',
      description: 'Deals nach Phase, optional gefiltert nach Phase und Zuständigkeit. Standard: nur offene Deals.',
      inputSchema: {
        phase: z.enum(PHASEN).optional(),
        zustaendig: z.string().optional().describe('Vorname aus dem Team'),
        abgeschlossene_zeigen: z.boolean().optional().describe('Auch gewonnene und verlorene Deals'),
      },
      annotations: lesen,
    },
    sicher(async ({ phase, zustaendig, abgeschlossene_zeigen }) => {
      const db = await service.load();
      const firmen = indexById(db.firmen);
      const kontakte = indexById(db.kontakte);
      const deals = db.deals.filter(
        (d) =>
          !d.archiviert &&
          !firmen.get(d.firma_id)?.archiviert &&
          (abgeschlossene_zeigen || phase === 'gewonnen' || phase === 'verloren' || !isAbgeschlossen(d.phase)) &&
          (!phase || d.phase === phase) &&
          (!zustaendig || d.zustaendig === zustaendig),
      );
      const nachPhase = PHASEN.map((p) => ({
        phase: p,
        deals: deals.filter((d) => d.phase === p).map((d) => dealZeile(d, firmen, kontakte)),
      })).filter((g) => g.deals.length > 0);
      return antwort({ anzahl: deals.length, phasen: nachPhase });
    }),
  );

  server.registerTool(
    'mein_tag',
    {
      title: 'Mein Tag',
      description: 'Überfällige, heutige und kommende Wiedervorlagen und nächste Schritte sowie offene Deals ohne nächsten Schritt, wie „Mein Tag“ im Hub. Standard: für die angemeldete Person.',
      inputSchema: {
        person: z.string().optional().describe('Vorname aus dem Team; "alle" für das ganze Team'),
        tage: z.number().int().min(1).max(60).optional().describe('Wie weit voraus, Standard 7'),
      },
      annotations: lesen,
    },
    sicher(async ({ person: wer, tage }) => {
      const db = await service.load();
      const ich = wer === 'alle' ? null : wer || meinName(db);
      if (ich) pruefeTeam(db, ich);
      const firmen = indexById(db.firmen);
      const tag = meinTag(db, ich, heute(), tage ?? 7);
      return antwort({
        fuer: ich ?? 'alle',
        heute: heute(),
        ueberfaellig: tag.ueberfaellig.map(aufgabeZeile),
        heute_faellig: tag.heute.map(aufgabeZeile),
        naechste_tage: tag.naechsteTage.map(aufgabeZeile),
        ohne_naechsten_schritt: tag.ohneNaechstenSchritt.map((d) => dealZeile(d, firmen)),
      });
    }),
  );

  // ─── Schreiben ──────────────────────────────────────────────────────────────

  server.registerTool(
    'lead_anlegen',
    {
      title: 'Lead anlegen',
      description:
        'Legt eine Firma an (oder nimmt eine bestehende über firma_id), optional mit Ansprechpartner und Deal, und vermerkt den Anlass im Verlauf. Prüft auf Dubletten und legt bei ähnlichen Firmen nichts an, außer trotzdem_anlegen ist gesetzt.',
      inputSchema: {
        firma_id: z.string().optional().describe('Bestehende Firma statt einer neuen'),
        firma: z.object({ ...firmaFelder, name: z.string().min(1) }).optional(),
        kontakt: z.object(kontaktFelder).optional(),
        deal: z
          .object({
            titel: z.string().min(1),
            phase: z.enum(['neu', 'qualifiziert']).optional().describe('Standard: neu'),
            zustaendig: z.string().optional().describe('Standard: angemeldete Person'),
          })
          .optional(),
        vermerk: z.string().optional().describe('Eintrag im Verlauf: woher der Lead kommt und warum er interessant ist'),
        trotzdem_anlegen: z.boolean().optional().describe('Auch bei ähnlichen Firmen anlegen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, firma, kontakt, deal, vermerk, trotzdem_anlegen }) => {
      if (!firma_id && !firma) return fehler('Entweder firma_id oder firma angeben.');
      const db = await service.load();
      const ich = meinName(db) ?? '';
      if (firma_id) finde(db.firmen, firma_id, 'Firma');

      const firmaInput = { ...EMPTY_FIRMA_INPUT, quelle: 'Claude', zustaendig: ich, ...ohneUndefined(firma ?? { name: '' }) };
      if (!firma_id) {
        pruefeTeam(db, firmaInput.zustaendig);
        const aehnlich = findeDubletten(firmaInput, db.firmen);
        if (aehnlich.length > 0 && !trotzdem_anlegen) {
          return antwort({
            angelegt: false,
            hinweis: 'Es gibt schon ähnliche Firmen. Nichts angelegt. Bestehende über firma_id nutzen oder trotzdem_anlegen setzen.',
            aehnlich: aehnlich.map((t) => ({ firma_id: t.firma.id, name: t.firma.name, grund: dublettenText(t) })),
          });
        }
      }
      if (deal?.zustaendig) pruefeTeam(db, deal.zustaendig);

      const ergebnis = await service.legeLinkedinLeadAn({
        firmaId: firma_id,
        firma: firmaInput,
        kontakt: kontakt ? { ...EMPTY_KONTAKT_INPUT, ...ohneUndefined(kontakt) } : null,
        deal: deal ? { titel: deal.titel, phase: deal.phase ?? 'neu', zustaendig: deal.zustaendig ?? ich } : null,
        vermerk: vermerk?.trim() || `Lead über Claude angelegt (${person.email})`,
      });
      return antwort({
        angelegt: true,
        firma_id: ergebnis.firma.id,
        kontakt_id: ergebnis.kontakt?.id,
        deal_id: ergebnis.deal?.id,
        hub: firmaLink(ergebnis.firma.id),
      });
    }),
  );

  server.registerTool(
    'firma_aendern',
    {
      title: 'Firma ändern',
      description: 'Ändert Stammdaten einer Firma. Nur die angegebenen Felder werden überschrieben.',
      inputSchema: { firma_id: z.string(), felder: z.object(firmaFelder) },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, felder }) => {
      const db = await service.load();
      const firma = finde(db.firmen, firma_id, 'Firma');
      const aenderungen = ohneUndefined(felder);
      if (Object.keys(aenderungen).length === 0) return fehler('Keine Felder angegeben.');
      pruefeTeam(db, aenderungen.zustaendig);
      const neu = await service.updateFirma(firma.id, aenderungen, firma.geaendert_am);
      return antwort({ geaendert: Object.keys(aenderungen), firma: kompakt(neu), hub: firmaLink(neu.id) });
    }),
  );

  server.registerTool(
    'kontakt_speichern',
    {
      title: 'Ansprechpartner anlegen oder ändern',
      description: 'Ohne kontakt_id wird ein neuer Ansprechpartner bei der Firma angelegt, mit kontakt_id werden nur die angegebenen Felder geändert.',
      inputSchema: { firma_id: z.string(), kontakt_id: z.string().optional(), felder: z.object(kontaktFelder) },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, kontakt_id, felder }) => {
      const db = await service.load();
      finde(db.firmen, firma_id, 'Firma');
      const vorher = kontakt_id ? finde(db.kontakte, kontakt_id, 'Kontakt') : undefined;
      if (vorher && vorher.firma_id !== firma_id) return fehler('Der Kontakt gehört zu einer anderen Firma.');
      const basis = vorher ? kontaktInput(vorher) : EMPTY_KONTAKT_INPUT;
      const kontakt = await service.saveKontakt(
        firma_id,
        { ...basis, ...ohneUndefined(felder) },
        vorher ? { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am } : undefined,
      );
      return antwort({ kontakt_id: kontakt.id, kontakt: kompakt(kontakt), neu: !vorher });
    }),
  );

  server.registerTool(
    'deal_speichern',
    {
      title: 'Deal anlegen oder ändern',
      description:
        'Ohne deal_id wird ein neuer Deal (Phase „neu“) bei der Firma angelegt, mit deal_id werden nur die angegebenen Felder geändert. Die Phase ändert nur `phase_aendern`.',
      inputSchema: { firma_id: z.string().optional().describe('Pflicht für neue Deals'), deal_id: z.string().optional(), felder: z.object(dealFelder) },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, deal_id, felder }) => {
      const db = await service.load();
      const aenderungen = ohneUndefined(felder);
      pruefeTeam(db, aenderungen.zustaendig);
      if (deal_id) {
        const vorher = finde(db.deals, deal_id, 'Deal');
        const deal = await service.saveDeal(
          vorher.firma_id,
          {
            titel: vorher.titel,
            kontakt_id: vorher.kontakt_id,
            wert_eur: vorher.wert_eur,
            wahrscheinlichkeit: vorher.wahrscheinlichkeit,
            zustaendig: vorher.zustaendig,
            naechster_schritt: vorher.naechster_schritt,
            naechster_schritt_am: vorher.naechster_schritt_am,
            ...aenderungen,
          },
          { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am },
        );
        return antwort({ deal: dealZeile(deal, indexById(db.firmen)) });
      }
      if (!firma_id) return fehler('Für einen neuen Deal firma_id angeben.');
      finde(db.firmen, firma_id, 'Firma');
      const deal = await service.saveDeal(firma_id, { ...EMPTY_DEAL_INPUT, zustaendig: meinName(db) ?? '', ...aenderungen });
      return antwort({ neu: true, deal: dealZeile(deal, indexById(db.firmen)) });
    }),
  );

  server.registerTool(
    'phase_aendern',
    {
      title: 'Deal-Phase ändern',
      description: [
        'Verschiebt einen Deal wie im Hub: Verlauf, Zuteilung an die angemeldete Person (von „qualifiziert“ aus), Status „Kunde“ bei „gewonnen“.',
        'Erstkontakt (nach „kontaktiert“ aus neu/qualifiziert/vernetzung): kontaktweg ist Pflicht.',
        '„verloren“: verlustgrund aus der Liste ist Pflicht.',
        '„angebot“/„gewonnen“: legt den Kundenordner in 01_Clients an bzw. verschiebt den Lead-Ordner dorthin (abschaltbar mit kundenordner: false).',
        '„vernetzung“: LinkedIn-Anfrage ohne Nachricht, setzt „Vernetzung prüfen“ in 7 Tagen; kontakt_id = angefragte Person, vermerk = Notiz.',
      ].join(' '),
      inputSchema: {
        deal_id: z.string(),
        phase: z.enum(PHASEN),
        verlustgrund: z.string().optional(),
        kontaktweg: z.enum(KONTAKT_WEGE).optional(),
        kontakt_id: z.string().optional().describe('Wer kontaktiert bzw. angefragt wurde'),
        vermerk: z.string().optional().describe('Zusatz für den Verlauf'),
        kundenordner: z.boolean().optional().describe('Standard true'),
        kuerzel: z.string().optional().describe('Kürzel für einen neuen Kundenordner, sonst Vorschlag aus dem Namen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ deal_id, phase, verlustgrund, kontaktweg, kontakt_id, vermerk, kundenordner, kuerzel }) => {
      const db = await service.load();
      const deal = finde(db.deals, deal_id, 'Deal');
      const firma = finde(db.firmen, deal.firma_id, 'Firma');
      if (deal.phase === phase) return antwort({ hinweis: `Der Deal ist schon in „${phaseLabel(phase)}“.` });
      const ich = meinName(db) ?? '';
      if (kontakt_id) {
        const kontakt = finde(db.kontakte, kontakt_id, 'Kontakt');
        if (kontakt.firma_id !== firma.id) return fehler('Der Kontakt gehört zu einer anderen Firma.');
      }

      if (phase === 'vernetzung') {
        const neu = await service.sendeVernetzung(deal.id, deal.geaendert_am, { kontaktId: kontakt_id ?? '', notiz: vermerk ?? '', ich });
        return antwort({ erledigt: ['Phase: Vernetzung', `${neu.naechster_schritt} am ${neu.naechster_schritt_am}`], deal: dealZeile(neu, indexById(db.firmen)) });
      }

      const gruende = db.listen.verlustgrund ?? [];
      if (phase === 'verloren' && (!verlustgrund || (gruende.length > 0 && !gruende.includes(verlustgrund)))) {
        return fehler(`Für „verloren“ einen verlustgrund angeben: ${gruende.join(', ')}.`);
      }
      const erstkontakt = istErstkontakt(deal.phase, phase);
      if (erstkontakt && !kontaktweg) return fehler(`Erstkontakt: kontaktweg angeben (${KONTAKT_WEGE.join(', ')}).`);

      const konfig = driveKonfiguration(db.einstellungen);
      const ordnerPhase = (phase === 'angebot' || phase === 'gewonnen') && kundenordner !== false && Boolean(konfig);
      const ordnerKuerzel = firma.kuerzel || kuerzel?.toUpperCase() || suggestKuerzel(firma.name, db.firmen.map((f) => f.kuerzel).filter(Boolean));

      const erledigt: string[] = [];
      try {
        const neu = await service.changePhase(deal.id, phase, deal.geaendert_am, verlustgrund ?? '', ich);
        erledigt.push(`Phase: ${phaseLabel(deal.phase)} → ${phaseLabel(phase)}`);
        if (neu.zustaendig !== deal.zustaendig) erledigt.push(`zugeteilt an ${neu.zustaendig}`);
        if (erstkontakt && kontaktweg) {
          await service.addAktivitaet({ firma_id: firma.id, kontakt_id: kontakt_id ?? deal.kontakt_id, deal_id: deal.id, typ: 'notiz', datum: '', text: kontaktVermerk(kontaktweg, vermerk ?? '') });
          erledigt.push(`Verlauf: ${kontaktVermerk(kontaktweg, vermerk ?? '')}`);
        } else if (vermerk?.trim()) {
          await service.addAktivitaet({ firma_id: firma.id, kontakt_id: kontakt_id ?? '', deal_id: deal.id, typ: 'notiz', datum: '', text: vermerk });
          erledigt.push('Vermerk im Verlauf');
        }
        if (ordnerPhase && !firma.drive_ordner_id) {
          const mitOrdner = await service.legeLeadOrdnerAn(firma.id, ordnerKuerzel, undefined, 'clients');
          erledigt.push(`Kundenordner angelegt: ${driveLink(mitOrdner.drive_ordner_id)}`);
        } else if (ordnerPhase && (await service.ordnerOrt(db, firma)) === 'leads') {
          await service.verschiebeNachClients(firma.id);
          erledigt.push('Ordner nach 01_Clients verschoben');
        }
        if (phase === 'gewonnen' && firma.status !== 'kunde') erledigt.push(`${firma.name} ist jetzt Kunde`);
        return antwort({ erledigt, deal: dealZeile(neu, indexById(db.firmen)), hub: firmaLink(firma.id) });
      } catch (err) {
        // The phase may already be changed when a later step fails – say what happened.
        if (erledigt.length === 0) throw err;
        return fehler(`${fehlerText(err)} Bereits erledigt: ${erledigt.join(', ')}.`);
      }
    }),
  );

  server.registerTool(
    'vernetzung_ergebnis',
    {
      title: 'Ergebnis einer LinkedIn-Anfrage',
      description:
        'Für Deals in „vernetzung“: angenommen → kontaktiert (LinkedIn), email → nicht angenommen, per E-Mail kontaktiert, warten → 7 Tage weiter warten, verloren → „Keine Reaktion“. Eine andere Person anfragen: `phase_aendern` mit phase "vernetzung" und kontakt_id.',
      inputSchema: { deal_id: z.string(), ergebnis: z.enum(['angenommen', 'email', 'warten', 'verloren']) },
      annotations: schreiben,
    },
    sicher(async ({ deal_id, ergebnis }) => {
      const db = await service.load();
      const deal = finde(db.deals, deal_id, 'Deal');
      const neu = await service.vernetzungErgebnis(deal.id, deal.geaendert_am, ergebnis, meinName(db) ?? '');
      return antwort({ deal: dealZeile(neu, indexById(db.firmen)) });
    }),
  );

  server.registerTool(
    'notiz_hinzufuegen',
    {
      title: 'Eintrag im Verlauf',
      description: 'Schreibt eine Notiz, ein Telefonat, eine Mail oder ein Meeting in den Verlauf einer Firma, optional zu Deal und Kontakt.',
      inputSchema: {
        firma_id: z.string(),
        text: z.string().min(1),
        typ: z.enum(AKTIVITAET_TYPEN).optional().describe('Standard: notiz'),
        deal_id: z.string().optional(),
        kontakt_id: z.string().optional(),
        datum: datum.optional().describe('Wann es war, Standard: jetzt'),
      },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, text, typ, deal_id, kontakt_id, datum: wann }) => {
      const db = await service.load();
      finde(db.firmen, firma_id, 'Firma');
      if (deal_id && finde(db.deals, deal_id, 'Deal').firma_id !== firma_id) return fehler('Der Deal gehört zu einer anderen Firma.');
      if (kontakt_id && finde(db.kontakte, kontakt_id, 'Kontakt').firma_id !== firma_id) return fehler('Der Kontakt gehört zu einer anderen Firma.');
      const eintrag = await service.addAktivitaet({ firma_id, deal_id: deal_id ?? '', kontakt_id: kontakt_id ?? '', typ: typ ?? 'notiz', datum: wann ?? '', text });
      return antwort({ eingetragen: kompakt(eintrag) });
    }),
  );

  server.registerTool(
    'wiedervorlage_setzen',
    {
      title: 'Wiedervorlage setzen',
      description: 'Legt eine Wiedervorlage an (erscheint in „Mein Tag“). Für den nächsten Schritt eines Deals besser `deal_speichern` mit naechster_schritt(_am).',
      inputSchema: {
        firma_id: z.string(),
        titel: z.string().min(1),
        faellig_am: datum,
        zustaendig: z.string().optional().describe('Standard: angemeldete Person'),
        deal_id: z.string().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ firma_id, titel, faellig_am, zustaendig, deal_id }) => {
      const db = await service.load();
      finde(db.firmen, firma_id, 'Firma');
      if (deal_id && finde(db.deals, deal_id, 'Deal').firma_id !== firma_id) return fehler('Der Deal gehört zu einer anderen Firma.');
      pruefeTeam(db, zustaendig);
      const w = await service.saveWiedervorlage({ firma_id, titel, faellig_am, deal_id: deal_id ?? '', zustaendig: zustaendig ?? meinName(db) ?? '' });
      return antwort({ wiedervorlage_id: w.id, wiedervorlage: kompakt(w) });
    }),
  );

  server.registerTool(
    'wiedervorlage_erledigt',
    {
      title: 'Wiedervorlage erledigen',
      description: 'Hakt eine Wiedervorlage ab (oder öffnet sie wieder mit erledigt: false).',
      inputSchema: { wiedervorlage_id: z.string(), erledigt: z.boolean().optional() },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ wiedervorlage_id, erledigt }) => {
      const db = await service.load();
      finde(db.wiedervorlagen, wiedervorlage_id, 'Wiedervorlage');
      const w = await service.setWiedervorlageErledigt(wiedervorlage_id, erledigt ?? true);
      return antwort({ wiedervorlage: kompakt(w) });
    }),
  );

  server.registerTool(
    'archivieren',
    {
      title: 'Archivieren',
      description:
        'Archiviert eine Firma, einen Deal oder einen Kontakt (genau eine ID angeben), z. B. Testeinträge oder Dubletten. Archivierte Einträge verschwinden aus Pipeline und Mein Tag, bleiben aber im Sheet; mit archiviert: false wieder herstellen. Eine archivierte Firma blendet auch ihre Deals aus.',
      inputSchema: {
        firma_id: z.string().optional(),
        deal_id: z.string().optional(),
        kontakt_id: z.string().optional(),
        archiviert: z.boolean().optional().describe('Standard true; false stellt wieder her'),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ firma_id, deal_id, kontakt_id, archiviert }) => {
      const ids = [firma_id, deal_id, kontakt_id].filter(Boolean);
      if (ids.length !== 1) return fehler('Genau eine von firma_id, deal_id oder kontakt_id angeben.');
      const ziel = archiviert ?? true;
      const db = await service.load();
      if (firma_id) {
        const firma = finde(db.firmen, firma_id, 'Firma');
        const neu = await service.setFirmaArchiviert(firma.id, ziel, firma.geaendert_am);
        return antwort({ firma: neu.name, firma_id: neu.id, archiviert: neu.archiviert, hub: firmaLink(neu.id) });
      }
      if (deal_id) {
        const deal = finde(db.deals, deal_id, 'Deal');
        const neu = await service.setDealArchiviert(deal.id, ziel, deal.geaendert_am);
        return antwort({ deal: neu.titel, deal_id: neu.id, firma: db.firmen.find((f) => f.id === neu.firma_id)?.name, archiviert: neu.archiviert });
      }
      const kontakt = finde(db.kontakte, kontakt_id!, 'Kontakt');
      const neu = await service.setKontaktArchiviert(kontakt.id, ziel, kontakt.geaendert_am);
      return antwort({ kontakt: kontaktName(neu), kontakt_id: neu.id, archiviert: neu.archiviert });
    }),
  );
}
