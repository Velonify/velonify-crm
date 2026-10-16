import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';
import {
  AKTIVITAET_TYPEN,
  isAbgeschlossen,
  istErstkontakt,
  KONTAKT_WEGE,
  kontaktVermerk,
  PHASEN,
  phaseLabel,
} from '../../../src/data/constants';

import { findeDubletten, dublettenText } from '../../../src/data/dubletten';

import {
  dmText,
  istOffenerLead,
  leadFirmenname,
  magnetZahlen,
  sortiereLeads,
} from '../../../src/data/magnete';

import {
  INTERNES_BOARD_TITEL,
  istErledigt,
  kartenNachSpalte,
  meineAufgaben,
  sortiereBoards,
  spaltenVon,
} from '../../../src/data/todos';
import { istZustaendig, zustaendigWert } from '../../../src/data/zustaendig';
import { erwaehnteNamen } from '../../../src/data/erwaehnungen';
import { kontaktName, suggestKuerzel } from '../../../src/data/rules';
import { driveKonfiguration, indexById, kennzahlen, leseTeamZuordnung, meinTag, offeneDeals } from '../../../src/data/selectors';

import { suche } from '../../../src/data/suche';
import {
  type Aufgabe as Karte,
  EMPTY_DEAL_INPUT,
  EMPTY_FIRMA_INPUT,
  EMPTY_KONTAKT_INPUT,
  type MagnetInput,
} from '../../../src/data/types';

import {
  antwort,
  baueKasten,
  boardLink,
  dealFelder,
  dealZeile,
  datum,
  driveLink,
  fehler,
  fehlerText,
  finde,
  findeBoard,
  findeKarte,
  findeSpalte,
  firmaFelder,
  firmaLink,
  HUB,
  karteZeile,
  klein,
  kompakt,
  kontaktFelder,
  kontaktInput,
  leadZeile,
  magnetInput,
  magnetLink,
  magnetZeile,
  ohneUndefined,
  pruefeTeam,
  spalteZeile,
  aufgabeZeile,
  type Kontext,
} from './hilfen';
import { registriereAngebote } from './gruppen/angebote';
import { registriereAudit } from './gruppen/audit';
import { registriereEingang } from './gruppen/eingang';
import { registriereKunden } from './gruppen/kunden';
import { registriereSocial } from './gruppen/social';

export { leseTeamZuordnung };
export type { Kontext };

export const ANLEITUNG = `Velonify-CRM (Google Sheet hinter crm.velonify.de). Schreibende Werkzeuge laufen über dieselben Regeln wie der Hub: Verlauf, Zuständigkeit, Kundenordner.
- IDs immer über \`suchen\` oder \`firma_anzeigen\` holen, nie raten.
- Vor \`lead_anlegen\` suchen, ob die Firma schon existiert.
- Phasen: ${PHASEN.join(' → ')}. Phasenwechsel nur mit \`phase_aendern\`, LinkedIn-Anfragen mit Phase "vernetzung" und danach \`vernetzung_ergebnis\`.
- "zustaendig" sind ein oder mehrere Vornamen aus dem Team, mit Komma getrennt (z. B. "Lugge, Julian"; siehe \`ueberblick\`), keine E-Mail.
- Daten im Format JJJJ-MM-TT. Die Zeitzone ist Europe/Berlin.
- Nichts wird gelöscht. \`archivieren\` blendet Firmen, Deals, Kontakte oder Lead-Magnete aus und lässt sich rückgängig machen; vorher nachfragen.
- To-dos (Karten auf den Boards unter crm.velonify.de/#/todo): \`boards\`, \`karten\`, \`karte_anlegen\`, \`karte_verschieben\`, \`karte_erledigt\`, \`karte_kommentieren\`. Board "intern" ist „${INTERNES_BOARD_TITEL}“, Kunden-Boards über Firmenname, Kürzel oder den Slack-Channel mit # davor. Karten-IDs über \`karten\` holen. \`freigabe_anfragen\` legt eine Karte dem Kunden im Kundenportal zur Freigabe vor.
- Erwähnungen: „@Name“ mit einem Teamnamen in Kommentaren, Kartenbeschreibungen und Notizen markiert die Person (Glocke im Hub, Slack-Nachricht). Nur gezielt markieren, wenn jemand etwas tun oder wissen soll.
- Aus Slack: Bei To-dos aus Nachrichten \`karte_anlegen\` mit \`aus_slack: true\` und dem Permalink als \`link\` – pro Nachricht entsteht nur eine Karte. "meine To-dos" heißt: zustaendig ist die Person, die schreibt. Neuigkeiten für einen Kunden mit \`kunden_news_anlegen\`; für den Kunden sichtbar nur, wenn ausdrücklich gewünscht.
- Lead-Magnete (Downloads gegen E-Mail auf velonify.de/ressourcen/<adresse>/): \`magnete\`, \`magnet_speichern\`, \`magnet_leads\`, \`magnet_lead_uebernehmen\`, \`magnet_lead_verwerfen\`. Ein aktiver Magnet hat sofort seine Landingpage; aktiv geht nur mit Untertitel und beim Typ „datei“ mit Datei-Link (Google Drive, per Link freigegeben). Typ „audit“ ist der Shop-Roast: kein Download, das Team prüft den Shop und schickt einen Report; \`plaetze\` begrenzt die Zahl, danach Warteliste. Wer nur den Download wollte, bekommt keine Werbe-Mails – Kontakt danach über LinkedIn.`;

export function registriereWerkzeuge(server: McpServer, kontext: Kontext): void {
  const kasten = baueKasten(server, kontext);
  const { service, person, heute, meinName, sicher, lesen, schreiben } = kasten;

  server.registerTool(
    'ueberblick',
    {
      title: 'CRM-Überblick',
      description: 'Wer angemeldet ist, Team, Listen (Verlustgründe, Kontaktwege, Aktivitätstypen), Phasen und Kennzahlen der Pipeline. Guter Einstieg.',
      annotations: lesen,
    },
    sicher(async () => {
      const db = await service.load();
      const firmen = indexById(db.firmen);
      const deals = db.deals.filter((d) => !firmen.get(d.firma_id)?.archiviert);
      const offen = offeneDeals(deals);
      return antwort({
        angemeldet: { email: person.email, team_name: meinName(db) },
        heute: heute(),
        team: db.listen.team ?? [],
        verlustgruende: db.listen.verlustgrund ?? [],
        kontaktwege: KONTAKT_WEGE,
        aktivitaetstypen: AKTIVITAET_TYPEN,
        phasen: PHASEN.map((p) => ({ phase: p, label: phaseLabel(p), offene_deals: offen.filter((d) => d.phase === p).length })),
        kennzahlen: kennzahlen(deals, heute()),
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
          (!zustaendig || istZustaendig(d.zustaendig, zustaendig)),
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
        'Archiviert eine Firma, einen Deal, einen Kontakt oder einen Lead-Magneten (genau eines angeben), z. B. Testeinträge oder Dubletten. Archivierte Einträge verschwinden aus Pipeline und Mein Tag, bleiben aber im Sheet; mit archiviert: false wieder herstellen. Eine archivierte Firma blendet auch ihre Deals aus; ein archivierter Magnet wird inaktiv, seine Landingpage geht offline.',
      inputSchema: {
        firma_id: z.string().optional(),
        deal_id: z.string().optional(),
        kontakt_id: z.string().optional(),
        magnet: z.string().optional().describe('Adresse eines Lead-Magneten'),
        archiviert: z.boolean().optional().describe('Standard true; false stellt wieder her'),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ firma_id, deal_id, kontakt_id, magnet, archiviert }) => {
      const ids = [firma_id, deal_id, kontakt_id, magnet].filter(Boolean);
      if (ids.length !== 1) return fehler('Genau eine von firma_id, deal_id, kontakt_id oder magnet angeben.');
      const ziel = archiviert ?? true;
      if (magnet) {
        const { magnete } = await service.loadMagnetDaten();
        const m = magnete.find((x) => x.slug === magnet);
        if (!m) return fehler(`Kein Magnet mit der Adresse „${magnet}“. Adressen über \`magnete\` holen.`);
        const neu = await service.setMagnetArchiviert(m.id, ziel, m.geaendert_am);
        return antwort({ magnet: neu.titel, adresse: neu.slug, archiviert: neu.archiviert, aktiv: neu.aktiv });
      }
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

  // ─── Lead-Magnete ───────────────────────────────────────────────────────────

  server.registerTool(
    'magnete',
    {
      title: 'Lead-Magnete anzeigen',
      description:
        'Alle Lead-Magnete (kostenlose Downloads gegen E-Mail) mit Landingpage, DM-Link und Zahlen: Einträge, Download geöffnet, Newsletter bestätigt, im CRM, offen. Mit adresse nur dieser Magnet samt allen Texten und fertigem DM-Text.',
      inputSchema: {
        adresse: z.string().optional().describe('Adresse des Magneten, z. B. shopify-skills'),
        archivierte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ adresse, archivierte_zeigen }) => {
      const { magnete, leads } = await service.loadMagnetDaten();
      if (adresse) {
        const m = magnete.find((x) => x.slug === adresse);
        if (!m) return fehler(`Kein Magnet mit der Adresse „${adresse}“. Vorhanden: ${magnete.map((x) => x.slug).join(', ') || 'keine'}.`);
        return antwort({ ...magnetZeile(m, leads, true), dm_text: m.aktiv ? dmText(m) : '', hub: magnetLink() });
      }
      const liste = magnete.filter((m) => archivierte_zeigen || !m.archiviert).sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0));
      return antwort({ magnete: liste.map((m) => magnetZeile(m, leads)), hub: magnetLink() });
    }),
  );

  server.registerTool(
    'magnet_speichern',
    {
      title: 'Lead-Magnet anlegen oder ändern',
      description:
        'Legt einen Lead-Magneten an oder ändert ihn, erkannt an der Adresse (der Teil hinter velonify.de/ressourcen/). Nur angegebene Felder werden geändert. Ein aktiver Magnet hat sofort seine Landingpage (spätestens nach 2 Minuten online) und verschickt die Mail mit dem Download. Aktiv geht nur mit untertitel, beim Typ „datei“ auch mit datei_url. Die Adresse eines bestehenden Magneten lässt sich hier nicht ändern, weil verschickte Links sonst ins Leere führen.',
      inputSchema: {
        adresse: z.string().min(1).describe('Kleinbuchstaben, Ziffern, Bindestriche, z. B. shopify-skills'),
        titel: z.string().optional().describe('Überschrift der Landingpage und Name in der Mail; Pflicht beim Anlegen'),
        untertitel: z.string().optional().describe('Ein Satz unter der Überschrift, auch Vorschautext in LinkedIn-DMs'),
        inhalt: z.string().optional().describe('Text neben dem Formular: "- " Liste, "## " Zwischenüberschrift, **fett**, Leerzeile = Absatz'),
        knopf: z.string().max(40).optional().describe('Text auf dem Knopf, leer = „Kostenlos anfordern“'),
        stichwort: z.string().optional().describe('Kommentar-Stichwort unter dem Post, z. B. SKILLS'),
        typ: z.enum(['datei', 'audit']).optional().describe('datei = Download gegen E-Mail (Standard); audit = Shop-Roast, das Team prüft den Shop und schickt einen Report'),
        plaetze: z.number().int().min(1).max(1000).nullable().optional().describe('Nur bei audit: so viele Plätze, danach Warteliste; null = unbegrenzt'),
        datei_url: z.string().optional().describe('Google-Drive-Link, freigegeben für „Jeder mit dem Link“; bei audit nicht nötig'),
        mail_betreff: z.string().optional().describe('Leer = „Dein Download: <Titel>“'),
        mail_text: z.string().optional().describe('Steht nach „Hi <Vorname>,“ vor dem Download-Knopf; leer = Standardtext'),
        beschreibung: z.string().optional().describe('Interne Notiz'),
        aktiv: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ adresse, ...felder }) => {
      const { magnete } = await service.loadMagnetDaten();
      const vorhanden = magnete.find((m) => m.slug === adresse.trim().toLowerCase());
      const basis: MagnetInput = vorhanden
        ? magnetInput(vorhanden)
        : { slug: adresse, titel: '', beschreibung: '', stichwort: '', datei_url: '', mail_betreff: '', mail_text: '', aktiv: false, untertitel: '', inhalt: '', knopf: '', typ: 'datei', plaetze: null };
      if (!vorhanden && !felder.titel) return fehler('Beim Anlegen braucht der Magnet einen titel.');
      const gespeichert = await service.saveMagnet(
        { ...basis, ...ohneUndefined(felder) },
        vorhanden && { id: vorhanden.id, expectedGeaendertAm: vorhanden.geaendert_am },
      );
      const { leads } = await service.loadMagnetDaten();
      return antwort({
        erledigt: vorhanden ? 'geändert' : 'angelegt',
        ...magnetZeile(gespeichert, leads, true),
        dm_text: gespeichert.aktiv ? dmText(gespeichert) : '',
        hinweis: gespeichert.aktiv ? 'Landingpage ist spätestens nach 2 Minuten mit diesen Texten online.' : 'Inaktiv: keine Landingpage, keine Mails. Mit aktiv: true einschalten.',
        hub: magnetLink(),
      });
    }),
  );

  server.registerTool(
    'magnet_leads',
    {
      title: 'Einträge der Lead-Magnete',
      description:
        'Wer sich für einen Magneten eingetragen hat: Shop, Shopsystem, Herkunft (LinkedIn/Instagram/direkt), ob der Download geöffnet und der Newsletter bestätigt ist. Standard: nur offene Einträge (noch nicht übernommen oder verworfen), neueste zuerst.',
      inputSchema: {
        magnet: z.string().optional().describe('Nur Einträge dieses Magneten (Adresse)'),
        alle: z.boolean().optional().describe('Auch übernommene und verworfene zeigen'),
        limit: z.number().int().min(1).max(200).optional().describe('Standard 50'),
      },
      annotations: lesen,
    },
    sicher(async ({ magnet, alle, limit }) => {
      const { leads } = await service.loadMagnetDaten();
      const auswahl = sortiereLeads(leads.filter((l) => (!magnet || l.magnet === magnet) && (alle || istOffenerLead(l))));
      const zahlen = magnetZahlen(leads.filter((l) => !magnet || l.magnet === magnet));
      return antwort({ zahlen, eintraege: auswahl.slice(0, limit ?? 50).map(leadZeile), mehr: Math.max(0, auswahl.length - (limit ?? 50)), hub: `${HUB}/#/magnete` });
    }),
  );

  server.registerTool(
    'magnet_lead_uebernehmen',
    {
      title: 'Magnet-Eintrag ins CRM übernehmen',
      description:
        'Macht aus einem Magnet-Eintrag eine Firma (Quelle „LinkedIn · Magnet <adresse>“, Plattform aus dem Shopsystem), einen Kontakt, auf Wunsch einen Deal in Phase „neu“ und einen Verlaufseintrag. Gibt es die Firma schon (firma_id über `suchen`), hängt der Eintrag dort an. Ohne firma_id wird eine neue Firma angelegt; vorher mit `suchen` prüfen.',
      inputSchema: {
        lead_id: z.string().describe('ML-… aus `magnet_leads`'),
        firma_id: z.string().optional().describe('Bestehende Firma statt einer neuen'),
        firmenname: z.string().optional().describe('Name der neuen Firma; Standard ist die Shop-Domain'),
        zustaendig: z.string().optional().describe('Vorname aus dem Team; Standard: wer angemeldet ist'),
        deal_anlegen: z.boolean().optional().describe('Standard true'),
      },
      annotations: schreiben,
    },
    sicher(async ({ lead_id, firma_id, firmenname, zustaendig, deal_anlegen }) => {
      const db = await service.load();
      pruefeTeam(db, zustaendig);
      const { leads } = await service.loadMagnetDaten();
      const lead = finde(leads, lead_id, 'Eintrag');
      if (!firma_id) {
        const name = firmenname?.trim() || leadFirmenname(lead);
        const treffer = findeDubletten({ name, domain: lead.shop, ust_id: '', register: '', email_allgemein: lead.email }, db.firmen.filter((f) => !f.archiviert));
        if (treffer.length > 0) {
          return fehler(`Sieht aus wie eine Firma, die schon im CRM steht: ${treffer.map(dublettenText).join("; ")}. Mit firma_id übernehmen oder firmenname eindeutig angeben.`);
        }
      }
      const { firma, kontakt, deal } = await service.uebernimmMagnetLead(lead.id, {
        firmaId: firma_id,
        firma: firma_id || !firmenname ? undefined : { name: firmenname.trim() },
        zustaendig: zustaendig ?? meinName(db) ?? '',
        dealAnlegen: deal_anlegen ?? true,
      });
      return antwort({
        erledigt: 'übernommen',
        firma: firma.name,
        firma_id: firma.id,
        kontakt: kontaktName(kontakt),
        kontakt_id: kontakt.id,
        deal_id: deal?.id,
        hinweis: 'Kontakt am besten über LinkedIn aufnehmen. Werbe-Mails nur bei bestätigtem Newsletter.',
        hub: firmaLink(firma.id),
      });
    }),
  );

  server.registerTool(
    'magnet_lead_verwerfen',
    {
      title: 'Magnet-Eintrag verwerfen',
      description: 'Blendet einen Magnet-Eintrag aus der Liste der offenen aus (Studierende, Mitbewerber, Tests). Er bleibt im Sheet und zählt in den Zahlen weiter mit.',
      inputSchema: { lead_id: z.string().describe('ML-… aus `magnet_leads`') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ lead_id }) => {
      const lead = await service.verwirfMagnetLead(lead_id);
      return antwort({ erledigt: 'verworfen', lead_id: lead.id, email: lead.email, magnet: lead.magnet });
    }),
  );

  // ─── To-dos ─────────────────────────────────────────────────────────────────

  const boardAngabe = z.string().min(1).describe('"intern" für „Velonify intern“, sonst Firmenname, Kürzel, firma_id, board_id oder ein Slack-Channel mit # (z. B. "#client-agk-general")');

  server.registerTool(
    'boards',
    {
      title: 'To-do-Boards anzeigen',
      description: 'Alle To-do-Boards: „Velonify intern“ und je Kunde eines, mit Spalten und Zahl der offenen Karten. Kunden ohne Board bekommen eins beim ersten `karte_anlegen`.',
      annotations: lesen,
    },
    sicher(async () => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const firmen = indexById(db.firmen);
      return antwort({
        boards: sortiereBoards(daten.boards, db.firmen).map((b) => {
          const firma = firmen.get(b.firma_id);
          return kompakt({
            board_id: b.id,
            titel: b.titel,
            kunde: firma ? firma.name : 'intern',
            kuerzel: firma?.kuerzel,
            firma_id: b.firma_id,
            spalten: spaltenVon(b).map(spalteZeile),
            offene_karten: daten.aufgaben.filter((a) => a.board_id === b.id && !a.archiviert && !istErledigt(a)).length,
            hub: boardLink(b.id),
          });
        }),
      });
    }),
  );

  server.registerTool(
    'karten',
    {
      title: 'To-do-Karten anzeigen',
      description:
        'Karten eines Boards in Spaltenreihenfolge oder, ohne board, die offenen Karten einer Person über alle Boards („Meine To-dos“, fällige zuerst). Standard ohne board: die angemeldete Person. Erledigte nur mit erledigte_zeigen.',
      inputSchema: {
        board: boardAngabe.optional(),
        zustaendig: z.string().optional().describe('Vorname aus dem Team; ohne board Standard: angemeldete Person'),
        erledigte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ board: angabe, zustaendig, erledigte_zeigen }) => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const boards = indexById(daten.boards);
      const zeile = (k: Karte) => karteZeile(k, boards.get(k.board_id), daten, heute());
      if (zustaendig) pruefeTeam(db, zustaendig);

      if (!angabe) {
        const wer = zustaendig || meinName(db);
        if (!wer) return fehler('Die angemeldete Person ist nicht im Team. zustaendig oder board angeben.');
        const aktiv = new Set(daten.boards.filter((b) => !b.archiviert).map((b) => b.id));
        const karten = erledigte_zeigen
          ? daten.aufgaben.filter((a) => aktiv.has(a.board_id) && !a.archiviert && istZustaendig(a.zustaendig, wer))
          : meineAufgaben(daten.aufgaben, daten.boards, wer);
        return antwort({ fuer: wer, anzahl: karten.length, karten: karten.map(zeile), hub: `${HUB}/#/todo/meine` });
      }

      const { board } = findeBoard(db, daten.boards, angabe);
      if (!board) return antwort({ anzahl: 0, karten: [], hinweis: 'Für diese Firma gibt es noch kein Board; `karte_anlegen` legt es an.' });
      const karten = [...kartenNachSpalte(daten.aufgaben, board).values()]
        .flat()
        .filter((k) => (erledigte_zeigen || !istErledigt(k)) && (!zustaendig || istZustaendig(k.zustaendig, zustaendig)));
      return antwort({ board: board.titel, board_id: board.id, anzahl: karten.length, karten: karten.map(zeile), hub: boardLink(board.id) });
    }),
  );

  server.registerTool(
    'karte_anlegen',
    {
      title: 'To-do-Karte anlegen',
      description:
        'Legt eine Karte auf einem Board an, wie „Neue Karte“ im Hub. Fehlt das Board eines Kunden, wird es mit den Standardspalten angelegt. Ohne spalte landet die Karte unten in der ersten Spalte (Backlog). ' +
        'Für To-dos aus Slack aus_slack: true und den Permalink der Nachricht als link setzen: die Karte bekommt das Label „Slack“, und gibt es zu dem Link schon eine Karte, wird keine zweite angelegt (Antwort schon_vorhanden).',
      inputSchema: {
        board: boardAngabe,
        titel: z.string().min(1).max(200).describe('Kurz; Details in die beschreibung'),
        beschreibung: z.string().optional(),
        zustaendig: z.array(z.string()).optional().describe('Vornamen aus dem Team; Standard: angemeldete Person; [] = niemand'),
        faellig_am: datum.optional(),
        labels: z.array(z.string()).optional().describe('z. B. ["SEO", "Theme"]'),
        checkliste: z.array(z.string()).optional().describe('Punkte, alle offen'),
        spalte: z.string().optional().describe('Spalten-ID oder -Name, siehe `boards`'),
        sichtbar_kunde: z.boolean().optional().describe('Nur Kunden-Boards: Karte im Kundenportal zeigen, Standard false'),
        link: z.string().optional().describe('Quelle, z. B. Slack- oder Mail-Link (https://…)'),
        aus_slack: z.boolean().optional().describe('To-do aus einer Slack-Nachricht (z. B. täglicher Lauf): link = Permalink, Pflicht; ohne zustaendig bleibt die Karte ohne Person'),
      },
      annotations: schreiben,
    },
    sicher(async ({ board: angabe, titel, beschreibung, zustaendig, faellig_am, labels, checkliste, spalte, sichtbar_kunde, link, aus_slack }) => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const quelleLink = (link ?? '').trim();
      if (aus_slack) {
        if (!/^https:\/\/[\w.-]+\.slack\.com\/archives\//.test(quelleLink)) return fehler('Für aus_slack bitte den Permalink der Slack-Nachricht als link angeben (https://….slack.com/archives/…).');
        // The daily run reads overlapping windows; one message gives one card, also when it was archived or done meanwhile.
        const vorhanden = daten.aufgaben.find((a) => a.quelle_link.trim() === quelleLink);
        if (vorhanden) {
          const vorhandenBoard = daten.boards.find((b) => b.id === vorhanden.board_id);
          return antwort({ angelegt: false, schon_vorhanden: true, karte: karteZeile(vorhanden, vorhandenBoard, daten, heute()), hub: boardLink(vorhanden.board_id) });
        }
      }
      // A run without a person behind it (the daily routine) must not assign the cards to whoever owns the connector.
      const wer = zustaendig ? zustaendigWert(zustaendig) : aus_slack ? '' : meinName(db) ?? '';
      pruefeTeam(db, wer);
      const ziel = findeBoard(db, daten.boards, angabe);
      if (sichtbar_kunde && !ziel.firmaId) return fehler('Karten auf „Velonify intern“ sind nie für Kunden sichtbar.');
      // Check the column before a missing client board gets created.
      if (ziel.board && spalte) findeSpalte(ziel.board, spalte);
      const board = ziel.board ?? (await service.boardFuer(ziel.firmaId));
      const karte = await service.saveKarte(board.id, {
        titel,
        beschreibung: beschreibung ?? '',
        zustaendig: wer,
        faellig_am: faellig_am ?? '',
        labels: [...new Set([...(labels ?? []), ...(aus_slack ? ['Slack'] : [])])].join(','),
        checkliste: JSON.stringify((checkliste ?? []).map((text) => ({ text, erledigt: false }))),
        sichtbar_kunde: sichtbar_kunde ?? false,
        spalte_id: spalte ? findeSpalte(board, spalte).id : undefined,
        quelle: aus_slack ? 'agent' : 'manuell',
        quelle_link: quelleLink,
      });
      return antwort({
        angelegt: true,
        ...(ziel.board ? {} : { board_neu: true }),
        karte: karteZeile(karte, board, await service.loadTodoDaten(), heute()),
        hub: boardLink(board.id),
      });
    }),
  );

  server.registerTool(
    'karte_verschieben',
    {
      title: 'To-do-Karte verschieben',
      description: 'Verschiebt eine Karte in eine andere Spalte ihres Boards (unten, mit oben: true ganz oben). In der Erledigt-Spalte gilt sie als erledigt, heraus wieder als offen.',
      inputSchema: {
        karte_id: z.string(),
        spalte: z.string().describe('Spalten-ID oder -Name, siehe `boards`'),
        oben: z.boolean().optional().describe('Ganz oben statt unten einsortieren'),
      },
      annotations: schreiben,
    },
    sicher(async ({ karte_id, spalte, oben }) => {
      const { board } = findeKarte(await service.loadTodoDaten(), karte_id);
      const ziel = findeSpalte(board, spalte);
      const karte = await service.verschiebeKarte(karte_id, ziel.id, oben ? 0 : Infinity);
      return antwort({ karte: karteZeile(karte, board, await service.loadTodoDaten(), heute()), hub: boardLink(board.id) });
    }),
  );

  server.registerTool(
    'karte_erledigt',
    {
      title: 'To-do-Karte erledigen',
      description: 'Hakt eine Karte ab wie im Hub: Sie wandert in die Erledigt-Spalte ihres Boards (falls es eine gibt). Mit erledigt: false wieder öffnen, sie geht dann zurück in die erste offene Spalte.',
      inputSchema: { karte_id: z.string(), erledigt: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ karte_id, erledigt }) => {
      const { board } = findeKarte(await service.loadTodoDaten(), karte_id);
      const karte = await service.setKarteErledigt(karte_id, erledigt ?? true);
      return antwort({ karte: karteZeile(karte, board, await service.loadTodoDaten(), heute()) });
    }),
  );

  server.registerTool(
    'karte_kommentieren',
    {
      title: 'To-do-Karte kommentieren',
      description:
        'Schreibt einen Kommentar unter eine Karte, mit der angemeldeten Person als Absender. „@Name“ mit einem Teamnamen (Liste team, z. B. @Julian) markiert die Person: Sie bekommt eine Benachrichtigung unter der Glocke im Hub und, wenn eingerichtet, eine Slack-Nachricht.',
      inputSchema: { karte_id: z.string(), text: z.string().min(1) },
      annotations: schreiben,
    },
    sicher(async ({ karte_id, text }) => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const { karte } = findeKarte(daten, karte_id);
      const kommentar = await service.kommentiereKarte(karte_id, text);
      const erwaehnt = erwaehnteNamen(kommentar.text, db.listen.team ?? []).filter((n) => n !== meinName(db));
      return antwort({ kommentiert: true, karte: karte.titel, kommentar: kompakt({ ...kommentar, aufgabe_id: undefined }), ...(erwaehnt.length ? { benachrichtigt: erwaehnt } : {}) });
    }),
  );

  server.registerTool(
    'freigabe_anfragen',
    {
      title: 'Freigabe beim Kunden anfragen',
      description:
        'Legt eine Karte eines Kunden-Boards dem Kunden zur Freigabe vor: Sie wird für den Kunden sichtbar und steht im Kundenportal unter „Für dich zu tun“. Mit zuruecknehmen: true wird die Anfrage zurückgezogen (oder die Antwort des Kunden als erledigt markiert).',
      inputSchema: { karte_id: z.string(), zuruecknehmen: z.boolean().optional() },
      annotations: schreiben,
    },
    sicher(async ({ karte_id, zuruecknehmen }) => {
      const { karte, board } = findeKarte(await service.loadTodoDaten(), karte_id);
      if (!board.firma_id) return fehler('Freigaben gibt es nur auf Kunden-Boards, nicht auf „Velonify intern“.');
      const neu = zuruecknehmen ? await service.freigabeZuruecksetzen(karte.id, karte.geaendert_am) : await service.freigabeAnfragen(karte.id, karte.geaendert_am);
      return antwort({ karte: neu.titel, board: board.titel, freigabe: neu.freigabe || 'keine', sichtbar_kunde: neu.sichtbar_kunde, hub: boardLink(board.id) });
    }),
  );

  server.registerTool(
    'kunden_news_anlegen',
    {
      title: 'Kunden-News anlegen',
      description:
        'Schreibt eine Meldung in den News-Ticker eines Kunden im Client-Hub (z. B. „Tracking ist live“). Mit kunde "alle" gilt sie für alle Kunden. Für den Kunden im Kundenportal sichtbar nur mit sichtbar_kunde: true – vorher nachfragen.',
      inputSchema: {
        kunde: z.string().min(1).describe('Firmenname, Kürzel, firma_id, Slack-Channel mit # oder "alle"'),
        titel: z.string().min(1).max(160),
        text: z.string().optional(),
        art: z.enum(['update', 'meilenstein', 'hinweis']).optional().describe('Standard: update'),
        datum: datum.optional().describe('Standard: heute'),
        sichtbar_kunde: z.boolean().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ kunde, titel, text, art, datum: tag, sichtbar_kunde }) => {
      const db = await service.load();
      const alle = klein(kunde) === 'alle';
      const firmaId = alle ? '' : findeBoard(db, [], kunde).firmaId;
      if (!alle && !firmaId) return fehler('Für „Velonify intern“ gibt es keine Kunden-News. Einen Kunden oder "alle" angeben.');
      const news = await service.saveKundenNews({ firma_id: firmaId, art: art ?? 'update', titel, text: text ?? '', datum: tag ?? '', angeheftet: false, sichtbar_kunde: sichtbar_kunde ?? false });
      const firma = db.firmen.find((f) => f.id === firmaId);
      return antwort({ angelegt: true, kunde: firma?.name ?? 'alle Kunden', titel: news.titel, datum: news.datum, sichtbar_kunde: news.sichtbar_kunde, hub: firma ? `${HUB}/#/kunden/${firma.id}/news` : undefined });
    }),
  );

  registriereEingang(kasten);
  registriereKunden(kasten);
  registriereAngebote(kasten);
  registriereAudit(kasten);
  registriereSocial(kasten);
}
