import { z } from 'zod';
import {
  aendereKategorie,
  aenderePosten,
  ANGEBOT_STATUS,
  anzahlPosten,
  entfernePosten,
  fuegeManuellHinzu,
  kategorieStatus,
  leereAuswahl,
  naechsteNummer,
  parseAuswahl,
  schalteKategorie,
  schalteLeistung,
  statusLabel,
  uebersetze,
  type ManuellZiel,
} from '../../../../src/data/angebote';
import {
  aktiveLeistungen,
  ANSCHREIBEN_STATUS,
  anschreibenStatusLabel,
  baueAnfrage,
  KANAELE,
  kanalInfo,
  kanalLabel,
  leistungenIds,
  leistungenTitel,
  MAX_LEISTUNGEN,
  MODI,
  mitSignatur,
  OFFERS,
  offerText,
  offeneDeals,
  signaturSchluessel,
  vornameAus,
  zeichen,
  type Kanal,
  type LeistungsWahl,
  type OfferWahl,
} from '../../../../src/data/anschreiben';
import { aufhaengerVon, istVeraltet, neuestesAuditFuer } from '../../../../src/data/audit';
import { phaseLabel } from '../../../../src/data/constants';
import { spreadsheetFileUrl } from '../../../../src/data/google/drive';
import { ABRECHNUNGEN, fehltEnglisch, katalogBaum, type KategorieMitLeistungen, type Sprache } from '../../../../src/data/katalog';
import { kontaktName } from '../../../../src/data/rules';
import {
  EMPTY_KATEGORIE_INPUT,
  EMPTY_LEISTUNG_INPUT,
  EMPTY_OUTREACH_LEISTUNG_INPUT,
  type Angebot,
  type AngebotInput,
  type Anschreiben,
  type Audit,
  type Auswahl,
  type Database,
  type Firma,
  type Kontakt,
  type Leistung,
  type Leistungskategorie,
  type OutreachLeistung,
} from '../../../../src/data/types';
import { antwort, fehler, finde, firmaLink, HUB, kompakt, ohneDienst, ohneUndefined, type Werkzeugkasten, zeitBerlin } from '../hilfen';

export const angebotLink = (id: string) => `${HUB}/#/angebote/${id}`;
const KATALOG_LINK = `${HUB}/#/angebote/leistungen`;
const CONTACT_LINK = `${HUB}/#/contact`;
const GESENDET_LINK = `${HUB}/#/contact/gesendet`;
const OUTREACH_LINK = `${HUB}/#/contact/leistungen`;

const SPRACHE = z.enum(['de', 'en']);
const ANREDE = z.enum(['sie', 'du']);
const KANAL = z.enum(KANAELE.map((kanal) => kanal.wert) as [Kanal, ...Kanal[]]);
const ABRECHNUNG = z.enum(ABRECHNUNGEN.map((a) => a.wert) as ['einmalig', 'monatlich']);
const ANSCHREIBEN_STATUS_WERTE = z.enum(ANSCHREIBEN_STATUS.map((s) => s.wert) as ['gesendet', 'antwort', 'keine_antwort']);
const OFFER = z.enum(['manuell', ...OFFERS.map((o) => o.wert)] as [Exclude<OfferWahl, ''>, ...Exclude<OfferWahl, ''>[]]);

// ─── Lesbare Ausgabe ────────────────────────────────────────────────────────

/** The selection as Claude reads it: keys for changing it, origin instead of raw ids. */
function auswahlLesbar(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[]) {
  const katalog = new Set(baum.map((e) => e.kategorie.id));
  const leistungen = new Set(baum.flatMap((e) => e.leistungen.map((l) => l.id)));
  return auswahl.kategorien.map((kat) => ({
    ...kompakt({
      kategorie: kat.schluessel,
      titel: kat.titel,
      umfang: kat.umfang,
      abrechnung: kat.abrechnung,
      optional: kat.optional ? true : '',
      herkunft: !kat.kategorie_id ? 'eigene Hauptkategorie' : katalog.has(kat.kategorie_id) ? 'Katalog' : 'nicht mehr im Katalog',
    }),
    posten: kat.posten.map((p) =>
      kompakt({
        posten: p.schluessel,
        titel: p.titel,
        text: p.text,
        notiz: p.notiz,
        herkunft: !p.leistung_id ? 'manuell' : leistungen.has(p.leistung_id) ? '' : 'nicht mehr im Katalog',
      }),
    ),
  }));
}

function angebotZeile(a: Angebot, firmen: Map<string, Firma>) {
  return kompakt({
    angebot_id: a.id,
    nummer: a.nummer,
    version: a.version,
    titel: a.titel,
    firma: firmen.get(a.firma_id)?.name ?? 'Firma nicht gefunden',
    firma_id: a.firma_id,
    status: statusLabel(a.status),
    sprache: a.sprache === 'en' ? 'Englisch' : 'Deutsch',
    leistungen: anzahlPosten(parseAuswahl(a.auswahl)),
    summe_einmalig_eur: a.summe_einmalig_eur,
    summe_monatlich_eur: a.summe_monatlich_eur,
    summe_optional_eur: a.summe_optional_eur,
    kalkulation: a.sheet_id ? spreadsheetFileUrl(a.sheet_id) : '',
    archiviert: a.archiviert || '',
    geaendert_am: a.geaendert_am.slice(0, 10),
    hub: angebotLink(a.id),
  });
}

function angebotDetails(a: Angebot, db: Database, baum: readonly KategorieMitLeistungen[]) {
  const auswahl = parseAuswahl(a.auswahl);
  const kontakt = db.kontakte.find((kt) => kt.id === a.kontakt_id);
  const deal = db.deals.find((d) => d.id === a.deal_id);
  return {
    ...angebotZeile(a, new Map(db.firmen.map((f) => [f.id, f]))),
    ...kompakt({
      deal_id: a.deal_id,
      deal: deal?.titel,
      kontakt_id: a.kontakt_id,
      kontakt: kontakt ? kontaktName(kontakt) : '',
      hauptkategorien: auswahl.kategorien.length,
      davon_monatlich: auswahl.kategorien.filter((kat) => kat.abrechnung === 'monatlich').length || '',
      davon_optional: auswahl.kategorien.filter((kat) => kat.optional).length || '',
    }),
    auswahl: auswahlLesbar(auswahl, baum),
  };
}

const kategorieZeile = (kat: Leistungskategorie) =>
  kompakt({
    kategorie_id: kat.id,
    titel_de: kat.titel_de,
    titel_en: kat.titel_en,
    umfang_de: kat.umfang_de,
    umfang_en: kat.umfang_en,
    abrechnung: kat.abrechnung,
    archiviert: kat.archiviert || '',
    englisch_fehlt: !kat.archiviert && fehltEnglisch(kat) ? true : '',
  });

const leistungZeile = (l: Leistung) =>
  kompakt({
    leistung_id: l.id,
    titel_de: l.titel_de,
    titel_en: l.titel_en,
    text_de: l.text_de,
    text_en: l.text_en,
    archiviert: l.archiviert || '',
    englisch_fehlt: !l.archiviert && fehltEnglisch(l) ? true : '',
  });

const outreachZeile = (l: OutreachLeistung) =>
  kompakt({
    leistung_id: l.id,
    titel: l.titel,
    beschreibung: l.beschreibung,
    anlass: l.anlass,
    nutzen: l.nutzen,
    beleg: l.beleg,
    archiviert: l.archiviert || '',
  });

function anschreibenZeile(a: Anschreiben, db: Database, mitText: boolean) {
  const kontakt = db.kontakte.find((kt) => kt.id === a.kontakt_id);
  return kompakt({
    anschreiben_id: a.id,
    gesendet_am: zeitBerlin(a.gesendet_am),
    firma: db.firmen.find((f) => f.id === a.firma_id)?.name ?? 'Firma nicht gefunden',
    firma_id: a.firma_id,
    kontakt: kontakt ? kontaktName(kontakt) : '',
    deal_id: a.deal_id,
    kanal: kanalLabel(a.kanal),
    leistung: a.leistung,
    status: anschreibenStatusLabel(a.status),
    von: a.von,
    ...(mitText ? { sprache: a.sprache, anrede: a.anrede, aufhaenger: a.aufhaenger, betreff: a.betreff, text: a.text } : {}),
  });
}

// ─── Contact Generator: dieselbe Vorauswahl wie auf der Hub-Seite ──────────

/** Contact and deal as the hub preselects them: the given ones, else the main contact and the only open deal. "" = none. */
function vorschlag(db: Database, firma: Firma, kontaktId?: string, dealId?: string): { kontakt?: Kontakt; dealId: string } {
  const kontakte = db.kontakte.filter((kt) => kt.firma_id === firma.id && !kt.archiviert);
  let kontakt: Kontakt | undefined;
  if (kontaktId === undefined) kontakt = kontakte.find((kt) => kt.hauptkontakt);
  else if (kontaktId) {
    kontakt = kontakte.find((kt) => kt.id === kontaktId);
    if (!kontakt) throw new Error(`Der Ansprechpartner „${kontaktId}“ gehört nicht (mehr) zu ${firma.name}. Kontakte über \`firma_anzeigen\` holen.`);
  }
  const deals = offeneDeals(db.deals, firma.id);
  if (dealId === undefined) return { kontakt, dealId: deals.length === 1 ? deals[0].id : '' };
  if (dealId && !deals.some((d) => d.id === dealId)) throw new Error(`„${dealId}“ ist kein offener Deal von ${firma.name}.`);
  return { kontakt, dealId };
}

/** Chosen services in list order, the manual one last – as on the hub page. */
function leistungsWahlen(liste: readonly OutreachLeistung[], ids: readonly string[] = [], manuell?: { titel: string; beschreibung?: string }): LeistungsWahl[] {
  const aktiv = aktiveLeistungen(liste);
  const fremd = ids.filter((id) => !aktiv.some((l) => l.id === id));
  if (fremd.length > 0) throw new Error(`Outreach-Leistung „${fremd.join(', ')}“ gibt es nicht oder sie ist archiviert. IDs über \`outreach_leistungen\` holen.`);
  return [
    ...aktiv.filter((l) => ids.includes(l.id)).map((leistung): LeistungsWahl => ({ art: 'liste', leistung })),
    ...(manuell ? [{ art: 'manuell' as const, titel: manuell.titel, beschreibung: manuell.beschreibung ?? '' }] : []),
  ];
}

async function ladeAudits(k: Werkzeugkasten): Promise<Audit[]> {
  try {
    return await k.service.loadAudits();
  } catch {
    // Without the audit tab there are simply no hooks, as in the hub.
    return [];
  }
}

// ─── Werkzeuge ──────────────────────────────────────────────────────────────

export function registriereAngebote(k: Werkzeugkasten): void {
  const { server, service, sicher, lesen, schreiben, meinName, heute, person } = k;
  const jahr = () => Number(heute().slice(0, 4));

  // ─── Angebots-Rechner ─────────────────────────────────────────────────────

  server.registerTool(
    'angebote',
    {
      title: 'Angebote auflisten',
      description:
        'Angebote aus dem Angebots-Rechner (crm.velonify.de/#/angebote), neueste Nummer zuerst, mit Status, Firma, Zahl der Leistungen und Link zum Kalkulations-Sheet. Optional nach Status oder Firma gefiltert.',
      inputSchema: {
        status: z.enum(ANGEBOT_STATUS.map((s) => s.wert) as [string, ...string[]]).optional(),
        firma_id: z.string().optional(),
        archivierte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ status, firma_id, archivierte_zeigen }) => {
      const [daten, db] = await Promise.all([service.loadAngebotsDaten(), service.load()]);
      const firmen = new Map(db.firmen.map((f) => [f.id, f]));
      const aktiv = daten.angebote.filter((a) => !a.archiviert);
      const versendet = aktiv.filter((a) => a.status === 'versendet');
      const zeilen = daten.angebote
        .filter((a) => (archivierte_zeigen || !a.archiviert) && (!status || a.status === status) && (!firma_id || a.firma_id === firma_id))
        .sort((a, b) => b.nummer.localeCompare(a.nummer, 'de', { numeric: true }) || (b.version ?? 0) - (a.version ?? 0));
      return antwort({
        anzahl: zeilen.length,
        in_arbeit: aktiv.filter((a) => a.status === 'entwurf' || a.status === 'kalkulation').length,
        versendet_offen: versendet.length,
        einmalig_im_raum_eur: versendet.reduce((n, a) => n + (a.summe_einmalig_eur ?? 0), 0),
        monatlich_im_raum_eur: versendet.reduce((n, a) => n + (a.summe_monatlich_eur ?? 0), 0),
        naechste_nummer: naechsteNummer(daten.angebote, jahr()),
        katalog_leer: daten.kategorien.every((kat) => kat.archiviert) ? 'Der Leistungskatalog ist leer – `startkatalog_uebernehmen`.' : undefined,
        angebote: zeilen.map((a) => angebotZeile(a, firmen)),
        hub: `${HUB}/#/angebote`,
      });
    }),
  );

  server.registerTool(
    'angebot_anzeigen',
    {
      title: 'Angebot anzeigen',
      description:
        'Ein Angebot mit Kopf (Nummer, Firma, Deal, Ansprechpartner, Sprache, Status), Kalkulations-Sheet und Auswahl: Hauptkategorien mit Unterpunkten, Notizen und Optional-Markierung. Die Schlüssel „kategorie“ und „posten“ braucht `angebot_speichern` zum Ändern.',
      inputSchema: { angebot_id: z.string() },
      annotations: lesen,
    },
    sicher(async ({ angebot_id }) => {
      const [daten, db] = await Promise.all([service.loadAngebotsDaten(), service.load()]);
      const angebot = finde(daten.angebote, angebot_id, 'Angebot', 'angebote');
      return antwort(angebotDetails(angebot, db, katalogBaum(daten)));
    }),
  );

  server.registerTool(
    'leistungskatalog',
    {
      title: 'Leistungskatalog des Angebots-Rechners',
      description:
        'Hauptkategorien in Katalog-Reihenfolge mit ihren Unterpunkten, Texte auf Deutsch und Englisch (Englisch fällt im Angebot auf Deutsch zurück), Abrechnung einmalig/monatlich. Liefert die IDs für `angebot_speichern` und die Katalog-Pflege. Keine Preise: die stehen im Kalkulations-Sheet.',
      inputSchema: { archivierte_zeigen: z.boolean().optional() },
      annotations: lesen,
    },
    sicher(async ({ archivierte_zeigen }) => {
      const baum = katalogBaum(await service.loadAngebotsDaten(), archivierte_zeigen);
      return antwort({
        kategorien: baum.map((e) => ({ ...kategorieZeile(e.kategorie), leistungen: e.leistungen.map(leistungZeile) })),
        hinweis: baum.length === 0 ? 'Der Katalog ist leer – `startkatalog_uebernehmen` füllt ihn.' : undefined,
        hub: KATALOG_LINK,
      });
    }),
  );

  server.registerTool(
    'angebot_speichern',
    {
      title: 'Angebot anlegen oder ändern',
      description: [
        'Ohne angebot_id wird ein Angebot angelegt (Status „Entwurf“, Nummer fortlaufend JJJJ/NN wie im Hub, Deal = der einzige offene Deal, Ansprechpartner = Hauptkontakt, Titel = Deal-Titel, falls nicht angegeben).',
        'Mit angebot_id bleibt alles, was nicht angegeben ist. Die Auswahl wird schrittweise geändert, in dieser Reihenfolge:',
        'sprache (Katalogtexte werden in der neuen Sprache übernommen, manuelle bleiben), kategorien_waehlen (alle Unterpunkte einer Katalog-Hauptkategorie), leistungen_waehlen, leistungen_abwaehlen,',
        'kategorien_abwaehlen (Katalog-Unterpunkte raus, manuelle bleiben; eine eigene Hauptkategorie fällt ganz weg), manuell (eigene Unterpunkte), posten_entfernen, notizen, optional.',
        '„kategorie“ ist die kategorie_id aus dem Katalog bzw. der Schlüssel aus `angebot_anzeigen`, „posten“ der Posten-Schlüssel.',
        'Den Status ändert der Hub nicht von Hand: „In Kalkulation“ setzt `kalkulation_anlegen`. Ein bestehendes Kalkulations-Sheet wird nicht nachgezogen.',
      ].join(' '),
      inputSchema: {
        angebot_id: z.string().optional(),
        firma_id: z.string().optional().describe('Pflicht für neue Angebote'),
        deal_id: z.string().optional().describe('"" = ohne Deal'),
        kontakt_id: z.string().optional().describe('Ansprechpartner; "" = keiner'),
        titel: z.string().optional(),
        nummer: z.string().optional().describe('JJJJ/NN; Standard bei neuen Angeboten: die nächste freie Nummer'),
        sprache: SPRACHE.optional().describe('Standard bei neuen Angeboten: de'),
        kategorien_waehlen: z.array(z.string()).optional().describe('kategorie_ids: alle Unterpunkte wählen'),
        leistungen_waehlen: z.array(z.string()).optional().describe('leistung_ids aus dem Katalog'),
        leistungen_abwaehlen: z.array(z.string()).optional().describe('leistung_ids'),
        kategorien_abwaehlen: z.array(z.string()).optional().describe('kategorie_ids bzw. Schlüssel eigener Hauptkategorien'),
        manuell: z
          .array(
            z.object({
              titel: z.string().min(1).describe('Unterpunkt, z. B. „Migration Blog-Artikel“'),
              kategorie: z.string().optional().describe('kategorie_id aus dem Katalog oder Schlüssel einer eigenen Hauptkategorie im Angebot'),
              neue_kategorie: z.string().optional().describe('Name einer neuen eigenen Hauptkategorie (statt kategorie)'),
              abrechnung: ABRECHNUNG.optional().describe('Für neue_kategorie, Standard einmalig'),
            }),
          )
          .optional(),
        posten_entfernen: z.array(z.object({ kategorie: z.string(), posten: z.string() })).optional(),
        notizen: z
          .array(z.object({ kategorie: z.string(), posten: z.string(), notiz: z.string() }))
          .optional()
          .describe('Notiz fürs Sheet, z. B. „4 Sprachen: DE, EN, FR, ES“; "" löscht'),
        optional: z.array(z.object({ kategorie: z.string(), optional: z.boolean() })).optional().describe('Optionale Hauptkategorien zählen nicht zur Summe'),
      },
      annotations: schreiben,
    },
    sicher(async (args) => {
      const [daten, db] = await Promise.all([service.loadAngebotsDaten(), service.load()]);
      const baum = katalogBaum(daten);
      const vorher = args.angebot_id ? finde(daten.angebote, args.angebot_id, 'Angebot', 'angebote') : undefined;

      let kopf: Omit<AngebotInput, 'auswahl'>;
      let auswahl: Auswahl;
      if (vorher) {
        const { nummer, sprache, firma_id, deal_id, kontakt_id, titel } = vorher;
        kopf = { nummer, sprache, firma_id, deal_id, kontakt_id, titel };
        auswahl = parseAuswahl(vorher.auswahl);
        if (args.firma_id && args.firma_id !== vorher.firma_id) {
          // Like switching the firm in the hub: deal and contact follow the new firm unless given.
          const firma = finde(db.firmen, args.firma_id, 'Firma');
          const v = vorschlag(db, firma);
          kopf = { ...kopf, firma_id: firma.id, deal_id: v.dealId, kontakt_id: v.kontakt?.id ?? '' };
        }
      } else {
        if (!args.firma_id) return fehler('Für ein neues Angebot firma_id angeben.');
        const firma = finde(db.firmen, args.firma_id, 'Firma');
        const v = vorschlag(db, firma);
        const deal = db.deals.find((d) => d.id === (args.deal_id ?? v.dealId));
        kopf = {
          nummer: naechsteNummer(daten.angebote, jahr()),
          sprache: 'de',
          firma_id: firma.id,
          deal_id: deal?.id ?? '',
          kontakt_id: v.kontakt?.id ?? '',
          titel: deal?.titel ?? '',
        };
        auswahl = leereAuswahl();
      }
      kopf = { ...kopf, ...ohneUndefined({ deal_id: args.deal_id, kontakt_id: args.kontakt_id, titel: args.titel, nummer: args.nummer }) };

      const sprache: Sprache = args.sprache ?? (kopf.sprache === 'en' ? 'en' : 'de');
      if (sprache !== kopf.sprache) auswahl = uebersetze(auswahl, baum, sprache);
      kopf.sprache = sprache;

      const katalogKategorie = (id: string) => {
        const eintrag = baum.find((e) => e.kategorie.id === id);
        if (!eintrag) throw new Error(`Hauptkategorie „${id}“ gibt es im Katalog nicht (oder sie ist archiviert). IDs über \`leistungskatalog\` holen.`);
        return eintrag;
      };
      const katalogLeistung = (id: string) => {
        const leistung = baum.flatMap((e) => e.leistungen).find((l) => l.id === id);
        if (!leistung) throw new Error(`Unterpunkt „${id}“ gibt es im Katalog nicht (oder er ist archiviert). IDs über \`leistungskatalog\` holen.`);
        return leistung;
      };
      const gewaehlt = (leistungId: string) => auswahl.kategorien.some((kat) => kat.posten.some((p) => p.leistung_id === leistungId));
      const imAngebot = (schluessel: string) => {
        const kat = auswahl.kategorien.find((x) => x.schluessel === schluessel);
        if (!kat) throw new Error(`Die Hauptkategorie „${schluessel}“ ist nicht im Angebot. Schlüssel über \`angebot_anzeigen\` holen.`);
        return kat;
      };
      const postenIn = (kategorie: string, posten: string) => {
        const kat = imAngebot(kategorie);
        if (!kat.posten.some((p) => p.schluessel === posten)) throw new Error(`Posten „${posten}“ steht nicht in „${kat.titel}“. Schlüssel über \`angebot_anzeigen\` holen.`);
      };

      for (const id of args.kategorien_waehlen ?? []) {
        const eintrag = katalogKategorie(id);
        if (kategorieStatus(auswahl, eintrag) !== 'alle') auswahl = schalteKategorie(auswahl, baum, eintrag, sprache);
      }
      for (const id of args.leistungen_waehlen ?? []) {
        const leistung = katalogLeistung(id);
        if (!gewaehlt(id)) auswahl = schalteLeistung(auswahl, baum, leistung, sprache);
      }
      for (const id of args.leistungen_abwaehlen ?? []) {
        const leistung = katalogLeistung(id);
        if (gewaehlt(id)) auswahl = schalteLeistung(auswahl, baum, leistung, sprache);
      }
      for (const id of args.kategorien_abwaehlen ?? []) {
        const eintrag = baum.find((e) => e.kategorie.id === id);
        if (eintrag) {
          // The hub's main checkbox: from "teilweise" one click selects all, the next removes the catalogue items.
          const status = kategorieStatus(auswahl, eintrag);
          if (status === 'teilweise') auswahl = schalteKategorie(auswahl, baum, eintrag, sprache);
          if (status !== 'keine') auswahl = schalteKategorie(auswahl, baum, eintrag, sprache);
        } else {
          imAngebot(id);
          auswahl = { kategorien: auswahl.kategorien.filter((kat) => kat.schluessel !== id) };
        }
      }
      for (const m of args.manuell ?? []) {
        let ziel: ManuellZiel;
        if (m.neue_kategorie !== undefined) ziel = { art: 'neu', titel: m.neue_kategorie, abrechnung: m.abrechnung ?? 'einmalig' };
        else if (!m.kategorie) return fehler(`Für „${m.titel}“ kategorie oder neue_kategorie angeben.`);
        else if (auswahl.kategorien.some((kat) => kat.schluessel === m.kategorie && !baum.some((e) => e.kategorie.id === kat.kategorie_id))) {
          ziel = { art: 'auswahl', schluessel: m.kategorie };
        } else ziel = { art: 'katalog', kategorie: katalogKategorie(m.kategorie).kategorie };
        auswahl = fuegeManuellHinzu(auswahl, baum, m.titel, ziel, sprache);
      }
      for (const p of args.posten_entfernen ?? []) {
        postenIn(p.kategorie, p.posten);
        auswahl = entfernePosten(auswahl, p.kategorie, p.posten);
      }
      for (const n of args.notizen ?? []) {
        postenIn(n.kategorie, n.posten);
        auswahl = aenderePosten(auswahl, n.kategorie, n.posten, { notiz: n.notiz.trim() });
      }
      for (const o of args.optional ?? []) {
        imAngebot(o.kategorie);
        auswahl = aendereKategorie(auswahl, o.kategorie, { optional: o.optional });
      }

      const gespeichert = await service.saveAngebot({ ...kopf, auswahl }, vorher && { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am });
      const auswahlGeaendert = Boolean(vorher) && JSON.stringify(parseAuswahl(vorher!.auswahl)) !== JSON.stringify(parseAuswahl(gespeichert.auswahl));
      return antwort({
        neu: !vorher,
        hinweis: vorher?.sheet_id && auswahlGeaendert ? 'Änderungen an der Auswahl werden nicht ins bestehende Kalkulations-Sheet übertragen.' : undefined,
        angebot: angebotDetails(gespeichert, db, baum),
      });
    }),
  );

  server.registerTool(
    'kalkulation_anlegen',
    {
      title: 'Kalkulations-Sheet anlegen',
      description:
        'Legt für ein gespeichertes Angebot das Kalkulations-Sheet an (Unterpunkte als Zeilen, Preise trägt das Team im Sheet ein): im Drive-Ordner der Firma unter 00_Account/01_Finanzen (nur für Manager der Shared Drive sichtbar, wird bei Bedarf angelegt und gesperrt), sonst in 02_Sales/02_Proposals. Status „Entwurf“ wird „In Kalkulation“. Geht nur einmal pro Angebot; spätere Änderungen an der Auswahl kommen nicht ins Sheet.',
      inputSchema: { angebot_id: z.string() },
      annotations: schreiben,
    },
    sicher(async ({ angebot_id }) => {
      const daten = await service.loadAngebotsDaten();
      const angebot = finde(daten.angebote, angebot_id, 'Angebot', 'angebote');
      if (angebot.sheet_id) return antwort({ hinweis: 'Für dieses Angebot gibt es schon ein Kalkulations-Sheet.', kalkulation: spreadsheetFileUrl(angebot.sheet_id) });
      const ergebnis = await service.legeKalkulationAn(angebot.id, angebot.geaendert_am);
      return antwort({
        datei: ergebnis.datei.name,
        kalkulation: spreadsheetFileUrl(ergebnis.datei.id),
        ablage: ergebnis.ort === 'firma' ? 'Drive-Ordner der Firma' : '02_Sales/02_Proposals (die Firma hat keinen Drive-Ordner)',
        status: statusLabel(ergebnis.angebot.status),
        hub: angebotLink(angebot.id),
      });
    }),
  );

  server.registerTool(
    'angebot_archivieren',
    {
      title: 'Angebot archivieren',
      description: 'Blendet ein Angebot aus der Liste aus (z. B. Test oder Dublette); das Kalkulations-Sheet bleibt. Mit archiviert: false wieder herstellen. Vorher nachfragen.',
      inputSchema: { angebot_id: z.string(), archiviert: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ angebot_id, archiviert }) => {
      const daten = await service.loadAngebotsDaten();
      const angebot = finde(daten.angebote, angebot_id, 'Angebot', 'angebote');
      const neu = await service.setAngebotArchiviert(angebot.id, archiviert ?? true, angebot.geaendert_am);
      return antwort({ angebot: neu.nummer, titel: neu.titel, archiviert: neu.archiviert });
    }),
  );

  server.registerTool(
    'katalog_kategorie_speichern',
    {
      title: 'Hauptkategorie im Leistungskatalog anlegen oder ändern',
      description:
        'Ohne kategorie_id wird eine Hauptkategorie am Ende des Katalogs angelegt (titel_de Pflicht), mit kategorie_id werden nur die angegebenen Felder geändert. Bestehende Angebote behalten ihre kopierten Texte.',
      inputSchema: {
        kategorie_id: z.string().optional(),
        titel_de: z.string().optional(),
        titel_en: z.string().optional(),
        umfang_de: z.string().optional().describe('Kurze Umfangszeile für die Übersicht im Angebot'),
        umfang_en: z.string().optional(),
        abrechnung: ABRECHNUNG.optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ kategorie_id, ...felder }) => {
      const daten = await service.loadAngebotsDaten();
      const vorher = kategorie_id ? finde(daten.kategorien, kategorie_id, 'Hauptkategorie', 'leistungskatalog') : undefined;
      const basis = vorher
        ? { titel_de: vorher.titel_de, titel_en: vorher.titel_en, umfang_de: vorher.umfang_de, umfang_en: vorher.umfang_en, abrechnung: vorher.abrechnung }
        : EMPTY_KATEGORIE_INPUT;
      const kategorie = await service.saveKategorie({ ...basis, ...ohneUndefined(felder) }, vorher && { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am });
      return antwort({ neu: !vorher, kategorie: kategorieZeile(kategorie), hub: KATALOG_LINK });
    }),
  );

  server.registerTool(
    'katalog_leistung_speichern',
    {
      title: 'Unterpunkt im Leistungskatalog anlegen oder ändern',
      description:
        'Ohne leistung_id wird ein Unterpunkt am Ende seiner Hauptkategorie angelegt (kategorie_id und titel_de Pflicht), mit leistung_id werden nur die angegebenen Felder geändert; eine andere kategorie_id hängt ihn ans Ende jener Hauptkategorie. text_* wird im Angebot zum Aufzählungspunkt der Leistungsbeschreibung.',
      inputSchema: {
        leistung_id: z.string().optional(),
        kategorie_id: z.string().optional(),
        titel_de: z.string().optional(),
        titel_en: z.string().optional(),
        text_de: z.string().optional(),
        text_en: z.string().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ leistung_id, ...felder }) => {
      const daten = await service.loadAngebotsDaten();
      const vorher = leistung_id ? finde(daten.leistungen, leistung_id, 'Unterpunkt', 'leistungskatalog') : undefined;
      const basis = vorher
        ? { kategorie_id: vorher.kategorie_id, titel_de: vorher.titel_de, titel_en: vorher.titel_en, text_de: vorher.text_de, text_en: vorher.text_en }
        : EMPTY_LEISTUNG_INPUT;
      const eingabe = { ...basis, ...ohneUndefined(felder) };
      if (eingabe.kategorie_id) finde(daten.kategorien, eingabe.kategorie_id, 'Hauptkategorie', 'leistungskatalog');
      const leistung = await service.saveLeistung(eingabe, vorher && { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am });
      return antwort({ neu: !vorher, kategorie_id: leistung.kategorie_id, leistung: leistungZeile(leistung), hub: KATALOG_LINK });
    }),
  );

  server.registerTool(
    'katalog_archivieren',
    {
      title: 'Katalog-Eintrag archivieren',
      description:
        'Archiviert eine Hauptkategorie oder einen Unterpunkt des Leistungskatalogs (die ID genügt): verschwindet aus der Auswahl neuer Angebote, bestehende Angebote bleiben unverändert. Mit archiviert: false wieder herstellen.',
      inputSchema: { id: z.string().describe('kategorie_id oder leistung_id'), archiviert: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ id, archiviert }) => {
      const daten = await service.loadAngebotsDaten();
      const ziel = archiviert ?? true;
      const kategorie = daten.kategorien.find((x) => x.id === id);
      if (kategorie) {
        const neu = await service.setKategorieArchiviert(kategorie.id, ziel, kategorie.geaendert_am);
        return antwort({ hauptkategorie: neu.titel_de, archiviert: neu.archiviert });
      }
      const leistung = finde(daten.leistungen, id, 'Katalog-Eintrag', 'leistungskatalog');
      const neu = await service.setLeistungArchiviert(leistung.id, ziel, leistung.geaendert_am);
      return antwort({ unterpunkt: neu.titel_de, archiviert: neu.archiviert });
    }),
  );

  server.registerTool(
    'katalog_verschieben',
    {
      title: 'Katalog-Eintrag verschieben',
      description: 'Verschiebt eine Hauptkategorie (unter den aktiven) oder einen Unterpunkt (innerhalb seiner Hauptkategorie) um eine Stelle nach oben oder unten.',
      inputSchema: { id: z.string().describe('kategorie_id oder leistung_id'), richtung: z.enum(['hoch', 'runter']) },
      annotations: schreiben,
    },
    sicher(async ({ id, richtung }) => {
      const daten = await service.loadAngebotsDaten();
      const schritt = richtung === 'hoch' ? -1 : 1;
      const istKategorie = daten.kategorien.some((x) => x.id === id);
      if (istKategorie) await service.verschiebeKategorie(id, schritt);
      else await service.verschiebeLeistung(finde(daten.leistungen, id, 'Katalog-Eintrag', 'leistungskatalog').id, schritt);
      const baum = katalogBaum(await service.loadAngebotsDaten());
      const reihenfolge = istKategorie
        ? baum.map((e) => e.kategorie.titel_de)
        : (baum.find((e) => e.leistungen.some((l) => l.id === id))?.leistungen.map((l) => l.titel_de) ?? []);
      return antwort({ reihenfolge });
    }),
  );

  server.registerTool(
    'startkatalog_uebernehmen',
    {
      title: 'Startkatalog übernehmen',
      description: 'Füllt einen leeren Leistungskatalog mit dem Startkatalog (Hauptkategorien mit Unterpunkten, DE/EN). Lehnt ab, sobald der Katalog Hauptkategorien enthält.',
      annotations: schreiben,
    },
    sicher(async () => antwort({ ...(await service.uebernimmStartkatalog()), hub: KATALOG_LINK })),
  );

  // ─── Contact Generator ────────────────────────────────────────────────────

  server.registerTool(
    'outreach_leistungen',
    {
      title: 'Leistungen des Contact Generators',
      description:
        'Die Leistungen für erste Nachrichten (unabhängig vom Leistungskatalog der Angebote), in Listen-Reihenfolge: Beschreibung, Anlass, Nutzen und Beleg gehen an Claude. Liefert die leistung_ids für `anschreiben_erzeugen`.',
      inputSchema: { archivierte_zeigen: z.boolean().optional() },
      annotations: lesen,
    },
    sicher(async ({ archivierte_zeigen }) => {
      const { leistungen } = await service.loadContactDaten();
      const aktive = aktiveLeistungen(leistungen);
      const liste = archivierte_zeigen ? [...aktive, ...leistungen.filter((l) => l.archiviert)] : aktive;
      return antwort({
        leistungen: liste.map(outreachZeile),
        hinweis: leistungen.length === 0 ? 'Die Liste ist leer – `outreach_startliste_uebernehmen` füllt sie.' : undefined,
        hub: OUTREACH_LINK,
      });
    }),
  );

  server.registerTool(
    'outreach_leistung_speichern',
    {
      title: 'Outreach-Leistung anlegen oder ändern',
      description:
        'Ohne leistung_id wird eine Leistung des Contact Generators am Ende der Liste angelegt (titel Pflicht), mit leistung_id werden nur die angegebenen Felder geändert. Beleg nur mit Referenzen, die genannt werden dürfen.',
      inputSchema: {
        leistung_id: z.string().optional(),
        titel: z.string().optional(),
        beschreibung: z.string().optional().describe('Was die Leistung umfasst'),
        anlass: z.string().optional().describe('Welches Problem oder welcher Anlass passt'),
        nutzen: z.string().optional().describe('Was der Kunde davon hat, ein bis zwei Sätze'),
        beleg: z.string().optional().describe('Referenz oder Zahl, die Vertrauen schafft'),
      },
      annotations: schreiben,
    },
    sicher(async ({ leistung_id, ...felder }) => {
      const { leistungen } = await service.loadContactDaten();
      const vorher = leistung_id ? finde(leistungen, leistung_id, 'Outreach-Leistung', 'outreach_leistungen') : undefined;
      const basis = vorher
        ? { titel: vorher.titel, beschreibung: vorher.beschreibung, anlass: vorher.anlass, nutzen: vorher.nutzen, beleg: vorher.beleg }
        : EMPTY_OUTREACH_LEISTUNG_INPUT;
      const leistung = await service.saveOutreachLeistung({ ...basis, ...ohneUndefined(felder) }, vorher && { id: vorher.id, expectedGeaendertAm: vorher.geaendert_am });
      return antwort({ neu: !vorher, leistung: outreachZeile(leistung), hub: OUTREACH_LINK });
    }),
  );

  server.registerTool(
    'outreach_leistung_archivieren',
    {
      title: 'Outreach-Leistung archivieren',
      description: 'Blendet eine Leistung des Contact Generators aus der Auswahl aus; gesendete Anschreiben behalten ihren Titel. Mit archiviert: false wieder herstellen.',
      inputSchema: { leistung_id: z.string(), archiviert: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ leistung_id, archiviert }) => {
      const { leistungen } = await service.loadContactDaten();
      const leistung = finde(leistungen, leistung_id, 'Outreach-Leistung', 'outreach_leistungen');
      const neu = await service.setOutreachLeistungArchiviert(leistung.id, archiviert ?? true, leistung.geaendert_am);
      return antwort({ leistung: neu.titel, archiviert: neu.archiviert });
    }),
  );

  server.registerTool(
    'outreach_startliste_uebernehmen',
    {
      title: 'Outreach-Startliste übernehmen',
      description: 'Füllt die leere Leistungsliste des Contact Generators mit der Startliste. Lehnt ab, sobald die Liste Leistungen enthält.',
      annotations: schreiben,
    },
    sicher(async () => antwort({ leistungen: await service.uebernimmOutreachStartliste(), hub: OUTREACH_LINK })),
  );

  server.registerTool(
    'anschreiben_erzeugen',
    {
      title: 'Anschreiben erzeugen (Contact Generator)',
      description: [
        'Lässt Claude wie im Contact Generator (crm.velonify.de/#/contact) Varianten einer ersten Nachricht schreiben. Speichert nichts; verschickt wird von Hand, danach `anschreiben_gesendet`.',
        'An Claude gehen nur Firmendaten (Name, Domain, Ort, System, Technik, Notiz), Name und Rolle des Ansprechpartners, der LinkedIn-Auszug, die Leistungen, Aufhänger und Offer – keine E-Mail-Adressen, Telefonnummern oder Deal-Werte.',
        `Ansprechpartner: Standard Hauptkontakt, "" = keiner. Kanäle: ${KANAELE.map((kanal) => `${kanal.wert} (${kanal.label}${kanal.zeichenLimit ? `, max. ${kanal.zeichenLimit} Zeichen` : ''}, Anrede ${kanal.anrede})`).join(', ')}.`,
        `Höchstens ${MAX_LEISTUNGEN} Leistungen. Aufhänger aus dem neuesten Shop-Audit der Firma: Standard wie im Hub der erste je gewählter Leistung; audit_aufhaenger wählt andere (Texte aus der Antwort), [] keine.`,
      ].join(' '),
      inputSchema: {
        firma_id: z.string(),
        kontakt_id: z.string().optional(),
        kanal: KANAL.optional().describe('Standard linkedin_notiz'),
        sprache: SPRACHE.optional().describe('Standard de'),
        anrede: ANREDE.optional().describe('Standard je nach Kanal'),
        leistung_ids: z.array(z.string()).optional().describe('IDs aus `outreach_leistungen`'),
        manuelle_leistung: z.object({ titel: z.string().min(1), beschreibung: z.string().optional() }).optional().describe('Eine Leistung, die nicht in der Liste steht'),
        profil: z.string().max(1500).optional().describe('Aus dem LinkedIn-Profil des Ansprechpartners kopiert: Überschrift, Position, aktueller Beitrag. Nur mit Ansprechpartner.'),
        aufhaenger: z.string().optional().describe('Was nicht im CRM steht: Beobachtung im Shop, Post, Messe, gemeinsamer Kontakt'),
        audit_aufhaenger: z.array(z.string()).optional(),
        offer: OFFER.optional().describe(`Offer für Neukunden: ${OFFERS.map((o) => `${o.wert} (${o.label})`).join(', ')}, manuell (dann offer_text)`),
        offer_text: z.string().optional().describe('Nur Bedingungen, die wirklich gelten'),
        hinweis: z.string().max(500).optional().describe('Wunsch für neue Varianten, z. B. „kürzer, weniger formell“'),
        modus: z.enum(MODI.map((m) => m.wert) as ['komplex', 'easy']).optional().describe('komplex (Standard, mehr Denkaufwand) oder easy (schneller, etwa halb so teuer)'),
        absender: z.string().optional().describe('Vorname des Absenders, Standard: Vorname aus dem Google-Konto der angemeldeten Person'),
      },
      annotations: { ...lesen, openWorldHint: true },
    },
    sicher(async (args) => {
      const generator = k.dienste?.generator ?? ohneDienst('Der Contact Generator', 'CONTACT_GENERATOR_URL');
      const [db, contact, audits] = await Promise.all([service.load(), service.loadContactDaten(), ladeAudits(k)]);
      const firma = finde(db.firmen, args.firma_id, 'Firma');
      if (firma.archiviert) return fehler(`${firma.name} ist archiviert.`);
      const { kontakt, dealId } = vorschlag(db, firma, args.kontakt_id);
      const wahlen = leistungsWahlen(contact.leistungen, args.leistung_ids, args.manuelle_leistung);
      if (args.offer === 'manuell' && !args.offer_text?.trim()) return fehler('Für offer "manuell" den offer_text angeben.');
      const kanal = args.kanal ?? 'linkedin_notiz';
      const info = kanalInfo(kanal)!;
      const leistungIds = wahlen.flatMap((w) => (w.art === 'liste' ? [w.leistung.id] : []));

      // Hooks of the newest audit for the chosen services; by default the first per service, as in the hub.
      const audit = neuestesAuditFuer(audits, firma.id);
      const auditAufhaenger = audit ? aufhaengerVon(audit).filter((a) => leistungIds.includes(a.leistung_id)) : [];
      const unbekannt = (args.audit_aufhaenger ?? []).filter((t) => !auditAufhaenger.some((a) => a.text === t));
      if (unbekannt.length > 0) return fehler(`Diese Audit-Aufhänger passen nicht zu den gewählten Leistungen: ${unbekannt.join(' | ')}`);
      const gewaehlteAufhaenger = args.audit_aufhaenger ?? leistungIds.flatMap((id) => auditAufhaenger.find((a) => a.leistung_id === id)?.text ?? []);
      const aufhaengerGesamt = [...auditAufhaenger.map((a) => a.text).filter((t) => gewaehlteAufhaenger.includes(t)), (args.aufhaenger ?? '').trim()]
        .filter(Boolean)
        .join('\n')
        .slice(0, 1000);

      const anfrage = baueAnfrage({
        kanal,
        sprache: args.sprache ?? 'de',
        anrede: args.anrede ?? info.anrede,
        absender: args.absender ?? vornameAus(person.name, person.email),
        firma,
        kontakt,
        profil: kontakt ? args.profil : '',
        leistungen: wahlen,
        aufhaenger: aufhaengerGesamt,
        offer: offerText(args.offer ?? '', args.offer_text ?? ''),
        hinweis: args.hinweis ?? '',
        modus: args.modus ?? 'komplex',
      });
      const varianten = await generator.generiere(anfrage);
      const signatur = kanal === 'email' ? (db.einstellungen[signaturSchluessel(person.email)] ?? '') : '';
      const ohneOutreach = wahlen.flatMap((w) => (w.art === 'liste' && !w.leistung.anlass && !w.leistung.nutzen && !w.leistung.beleg ? [w.leistung.titel] : []));
      const hinweise = [
        ...(kanal === 'email' && !signatur ? ['Keine E-Mail-Signatur hinterlegt (`signatur_speichern`).'] : []),
        ...(ohneOutreach.length > 0 ? [`Ohne Anlass, Nutzen und Beleg: ${ohneOutreach.join(', ')} – der Text wird allgemeiner.`] : []),
        ...(firma.domain && !audit ? ['Noch kein Shop-Audit für diese Firma – mit Audit gibt es Aufhänger mit echten Messwerten.'] : []),
      ];

      return antwort({
        varianten: varianten.map((v, i) =>
          kompakt({
            nr: i + 1,
            betreff: v.betreff,
            text: v.text,
            zeichen: zeichen(v.text),
            zu_lang: info.zeichenLimit && zeichen(v.text) > info.zeichenLimit ? `über ${info.zeichenLimit} Zeichen – kürzen` : '',
          }),
        ),
        kanal: info.label,
        zeichen_limit: info.zeichenLimit ?? undefined,
        signatur: signatur || undefined,
        hinweise: hinweise.length > 0 ? hinweise : undefined,
        audit: audit
          ? kompakt({
              geprueft_am: audit.geprueft_am.slice(0, 10),
              veraltet: istVeraltet(audit, new Date()) ? true : '',
              aufhaenger: auditAufhaenger.map((a) => ({ text: a.text, gewaehlt: gewaehlteAufhaenger.includes(a.text) })),
            })
          : undefined,
        fuer_anschreiben_gesendet: kompakt({
          firma_id: firma.id,
          kontakt_id: kontakt?.id ?? '',
          deal_id: dealId,
          kanal,
          leistung_ids: leistungIds.length > 0 ? leistungIds : '',
          manuelle_leistung: args.manuelle_leistung?.titel,
          sprache: anfrage.sprache,
          anrede: anfrage.anrede,
          aufhaenger: aufhaengerGesamt,
        }),
        hub: CONTACT_LINK,
      });
    }),
  );

  server.registerTool(
    'anschreiben_gesendet',
    {
      title: 'Anschreiben als gesendet markieren',
      description: [
        'Nach dem Verschicken von Hand, wie „Als gesendet markieren“ im Hub: speichert die Nachricht in der Gesendet-Liste, schreibt sie in den Verlauf der Firma (E-Mail als Mail, sonst als Notiz)',
        'und schiebt einen Deal aus „neu“, „qualifiziert“ oder „vernetzung“ nach „kontaktiert“ (Zuteilung wie bei `phase_aendern`).',
        'Deal: Standard der einzige offene Deal der Firma, "" = ohne. Hat die Firma keinen offenen Deal, wird einer mit dem Leistungstitel angelegt (neuer_deal: false verhindert das).',
        'Bei E-Mail wird die hinterlegte Signatur angehängt (signatur_anhaengen: false verhindert das). Die Felder aus `anschreiben_erzeugen` → fuer_anschreiben_gesendet übernehmen.',
      ].join(' '),
      inputSchema: {
        firma_id: z.string(),
        kontakt_id: z.string().optional().describe('Standard Hauptkontakt, "" = keiner'),
        deal_id: z.string().optional(),
        kanal: KANAL,
        leistung_ids: z.array(z.string()).optional(),
        manuelle_leistung: z.string().optional().describe('Titel einer Leistung, die nicht in der Liste steht'),
        sprache: SPRACHE.optional(),
        anrede: ANREDE.optional(),
        aufhaenger: z.string().optional(),
        betreff: z.string().optional().describe('Pflicht bei E-Mail'),
        text: z.string().min(1).describe('Der Text, wie er verschickt wurde'),
        neuer_deal: z.boolean().optional().describe('Standard true'),
        signatur_anhaengen: z.boolean().optional().describe('Standard true'),
      },
      annotations: schreiben,
    },
    sicher(async (args) => {
      const [db, contact] = await Promise.all([service.load(), service.loadContactDaten()]);
      const firma = finde(db.firmen, args.firma_id, 'Firma');
      const { kontakt, dealId } = vorschlag(db, firma, args.kontakt_id, args.deal_id);
      const wahlen = leistungsWahlen(contact.leistungen, args.leistung_ids, args.manuelle_leistung ? { titel: args.manuelle_leistung } : undefined);
      if (wahlen.length === 0) return fehler('Mindestens eine Leistung angeben (leistung_ids oder manuelle_leistung).');
      const ich = meinName(db) ?? '';
      const titel = leistungenTitel(wahlen);
      const dealVorher = db.deals.find((d) => d.id === dealId);
      const neuerDeal = !dealId && offeneDeals(db.deals, firma.id).length === 0 && args.neuer_deal !== false;
      const signatur = args.kanal === 'email' && args.signatur_anhaengen !== false ? (db.einstellungen[signaturSchluessel(person.email)] ?? '') : '';

      const anschreiben = await service.markiereGesendet(
        {
          firma_id: firma.id,
          kontakt_id: kontakt?.id ?? '',
          deal_id: dealId,
          kanal: args.kanal,
          leistung_id: leistungenIds(wahlen),
          leistung: titel,
          sprache: args.sprache ?? 'de',
          anrede: args.anrede ?? kanalInfo(args.kanal)!.anrede,
          aufhaenger: args.aufhaenger ?? '',
          betreff: args.betreff ?? '',
          text: signatur ? mitSignatur(args.text, signatur) : args.text,
        },
        { ich, ...(neuerDeal ? { neuerDeal: { titel, zustaendig: firma.zustaendig || ich } } : {}) },
      );

      const erledigt = ['In der Gesendet-Liste', `Verlauf: ${kanalInfo(args.kanal)!.verlauf} gesendet (${titel})`];
      if (signatur) erledigt.push('Signatur angehängt');
      const deal = anschreiben.deal_id ? (await service.load()).deals.find((d) => d.id === anschreiben.deal_id) : undefined;
      if (neuerDeal && deal) erledigt.push(`Deal angelegt: ${deal.titel}`);
      const phaseVorher = dealVorher?.phase ?? (neuerDeal ? 'neu' : undefined);
      if (deal && phaseVorher && deal.phase !== phaseVorher) erledigt.push(`Phase: ${phaseLabel(phaseVorher)} → ${phaseLabel(deal.phase)}`);
      if (deal && deal.zustaendig !== dealVorher?.zustaendig && dealVorher) erledigt.push(`zugeteilt an ${deal.zustaendig}`);
      return antwort({ erledigt, anschreiben_id: anschreiben.id, deal_id: anschreiben.deal_id || undefined, hub: firmaLink(firma.id) });
    }),
  );

  server.registerTool(
    'anschreiben_liste',
    {
      title: 'Gesendete Anschreiben',
      description:
        'Die Gesendet-Liste des Contact Generators, neueste zuerst, mit Status (gesendet, antwort = Antwort erhalten, keine_antwort) und Antwortquote. Optional nach Firma, Kanal oder Status gefiltert.',
      inputSchema: {
        firma_id: z.string().optional(),
        kanal: KANAL.optional(),
        status: ANSCHREIBEN_STATUS_WERTE.optional(),
        mit_text: z.boolean().optional().describe('Auch Betreff, Text und Aufhänger'),
        anzahl: z.number().int().min(1).max(200).optional().describe('Standard 30'),
      },
      annotations: lesen,
    },
    sicher(async ({ firma_id, kanal, status, mit_text, anzahl }) => {
      const [db, { anschreiben }] = await Promise.all([service.load(), service.loadContactDaten()]);
      const alle = anschreiben.filter((a) => !a.archiviert);
      const liste = alle
        .filter((a) => (!firma_id || a.firma_id === firma_id) && (!kanal || a.kanal === kanal) && (!status || a.status === status))
        .sort((a, b) => b.gesendet_am.localeCompare(a.gesendet_am));
      const antworten = alle.filter((a) => a.status === 'antwort').length;
      return antwort({
        gesamt: alle.length,
        antworten,
        antwortquote: alle.length > 0 ? `${Math.round((antworten / alle.length) * 100)} %` : undefined,
        treffer: liste.length,
        anschreiben: liste.slice(0, anzahl ?? 30).map((a) => anschreibenZeile(a, db, Boolean(mit_text))),
        hub: GESENDET_LINK,
      });
    }),
  );

  server.registerTool(
    'anschreiben_status',
    {
      title: 'Status eines Anschreibens ändern',
      description: 'Setzt den Status eines gesendeten Anschreibens: gesendet, antwort (Antwort erhalten) oder keine_antwort. Ändert weder Deal noch Verlauf.',
      inputSchema: { anschreiben_id: z.string(), status: ANSCHREIBEN_STATUS_WERTE },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ anschreiben_id, status }) => {
      const { anschreiben } = await service.loadContactDaten();
      const vorher = finde(anschreiben, anschreiben_id, 'Anschreiben', 'anschreiben_liste');
      const neu = await service.setAnschreibenStatus(vorher.id, status, vorher.geaendert_am);
      return antwort({ anschreiben_id: neu.id, status: anschreibenStatusLabel(neu.status) });
    }),
  );

  server.registerTool(
    'signatur_speichern',
    {
      title: 'E-Mail-Signatur speichern',
      description: 'Speichert die persönliche E-Mail-Signatur der angemeldeten Person für den Contact Generator; `anschreiben_gesendet` hängt sie bei E-Mails an. "" löscht sie.',
      inputSchema: { signatur: z.string() },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ signatur }) => {
      await service.saveEinstellungen({ [signaturSchluessel(person.email)]: signatur.trim() });
      return antwort({ gespeichert: true, fuer: person.email, signatur: signatur.trim() || undefined });
    }),
  );
}
