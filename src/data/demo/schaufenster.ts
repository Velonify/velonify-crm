import { leereAuswahl, naechsteNummer, schalteKategorie } from '../angebote';
import type { CrmService } from '../crm';
import { addDays } from '../ids';
import { katalogBaum } from '../katalog';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT } from '../types';
import { alsAgentur, DEMO_TEAM, teamEmail } from './agentur';
import type { MemoryCalendar } from './memoryGoogle';
import type { MemorySheets } from './memorySheets';

/**
 * The showcase of the public demo: retells the sample data as that of the invented agency and adds the volume
 * a prospect expects – a full pipeline, several clients, offers, appointments and mentions.
 * Invented shops on the reserved .example TLD only (public repo).
 */
export async function fuelleSchaufenster(args: {
  service: CrmService;
  sheets: MemorySheets;
  calendar: MemoryCalendar;
  heute: string;
  /** Runs `fn` as if the given team member did it, so history, comments and mentions have real authors. */
  als: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}) {
  const { service, sheets, calendar, heute, als } = args;

  // Everything seeded so far was written for Velonify's three founders.
  sheets.ersetzeText(alsAgentur);
  for (const e of calendar.events) {
    e.titel = alsAgentur(e.titel);
    e.teilnehmer = e.teilnehmer.map(alsAgentur);
    e.gaeste = e.gaeste?.map((g) => ({ ...g, email: alsAgentur(g.email) }));
  }
  await sheets.appendValues("'listen'!A:B", DEMO_TEAM.slice(3).map((p) => ['team', p.name]));
  // The base seed comments as its demo user, who is now Lena herself: Tim wrote that one.
  for (const tab of ['aufgaben_kommentare', 'erwaehnungen']) {
    const [kopf, ...zeilen] = sheets.rows(tab);
    const von = kopf?.indexOf('von') ?? -1;
    if (von >= 0) for (const z of zeilen) if (z[von] === teamEmail('Lena')) z[von] = teamEmail('Tim');
  }
  // Both writes went around the service: read again so its snapshot knows the new names.
  // The base seed tags a few leads with Velonify's own territories (dentists in Dortmund …): the agency tags its way.
  for (const f of (await service.load()).firmen) await service.updateFirma(f.id, { tags: demoTags(f.ort, 'Shopify-Migration') }, f.geaendert_am);

  const tage = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  for (const f of FIRMEN) {
    const zustaendig = f.zustaendig;
    await als(zustaendig, async () => {
      const firma = await service.createFirma({
        ...EMPTY_FIRMA_INPUT,
        name: f.name,
        domain: `${f.slug}.example`,
        ort: f.ort,
        branche: f.branche,
        plattform: f.plattform,
        version: f.version ?? '',
        eol: f.plattform === 'magento1' || f.plattform === 'shopware5' || f.version?.startsWith('2.4.4') ? 'eol' : '',
        tier: f.tier,
        score: f.score,
        quelle: f.quelle ?? 'Lead-Finder',
        zustaendig,
        notiz: f.anlass,
        email_allgemein: `info@${f.slug}.example`,
        tags: demoTags(f.ort, f.titel),
        ...(f.kuerzel ? { kuerzel: f.kuerzel, slack_channel: `client-${f.kuerzel.toLowerCase()}-general` } : {}),
      });
      const [vorname, nachname, rolle] = f.kontakt;
      const kontakt = await service.saveKontakt(firma.id, {
        ...EMPTY_KONTAKT_INPUT,
        vorname,
        nachname,
        rolle,
        email: `${vorname.toLowerCase()}@${f.slug}.example`,
        hauptkontakt: true,
      });
      let deal = await service.saveDeal(firma.id, {
        ...EMPTY_DEAL_INPUT,
        titel: f.titel,
        kontakt_id: kontakt.id,
        wert_eur: f.wert,
        wahrscheinlichkeit: WAHRSCHEINLICHKEIT[f.phase] ?? 0,
        zustaendig,
      });
      for (const ziel of WEG[f.phase] ?? []) {
        deal = await service.changePhase(deal.id, ziel, deal.geaendert_am, ziel === 'verloren' ? (f.verlust ?? 'Kein Budget') : '', zustaendig);
      }

      // History in the order it happened: first message, call, meeting, offer.
      const schritte = VERLAUF[f.phase] ?? [];
      for (const [i, s] of schritte.entries()) {
        await service.addAktivitaet({
          firma_id: firma.id,
          kontakt_id: kontakt.id,
          deal_id: deal.id,
          typ: s.typ,
          datum: tage(f.alter - i * Math.max(1, Math.floor(f.alter / (schritte.length + 1)))),
          text: s.text(f),
        });
      }

      if (f.naechster) {
        const [titel, inTagen] = f.naechster;
        const { kontakt_id, wert_eur, wahrscheinlichkeit } = deal;
        deal = await service.saveDeal(
          firma.id,
          { titel: deal.titel, kontakt_id, wert_eur, wahrscheinlichkeit, zustaendig, naechster_schritt: titel, naechster_schritt_am: addDays(heute, inTagen) },
          { id: deal.id, expectedGeaendertAm: deal.geaendert_am },
        );
      }

      if (f.phase === 'angebot') {
        const daten = await service.loadAngebotsDaten();
        const baum = katalogBaum(daten);
        let auswahl = leereAuswahl();
        for (const i of f.angebot ?? [1]) if (baum[i]) auswahl = schalteKategorie(auswahl, baum, baum[i], 'de');
        await service.saveAngebot({
          nummer: naechsteNummer(daten.angebote, new Date().getFullYear()),
          sprache: 'de',
          firma_id: firma.id,
          deal_id: deal.id,
          kontakt_id: kontakt.id,
          titel: f.titel,
          auswahl,
        });
      }

      if (f.kuerzel) await kundeEinrichten(service, firma.id, f, heute, als);
    });
  }

  // Mentions for the person visitors start as, so the bell shows a number right away.
  const db = await service.load();
  const intern = await service.boardFuer('');
  const karte = (titel: string, spalte_id: string, zustaendig: string, felder: Partial<{ faellig_am: string; labels: string; beschreibung: string }> = {}) =>
    service.saveKarte(intern.id, { titel, beschreibung: '', zustaendig, faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false, spalte_id, ...felder });
  const pitch = await als('Aylin', () => karte('Pitch-Deck für die Messe aktualisieren', 'arbeit', 'Aylin', { faellig_am: addDays(heute, 1), labels: 'Sales, Messe' }));
  await als('Aylin', () => service.kommentiereKarte(pitch.id, '@Lena kannst du bis morgen die neuen Case-Zahlen von Alpenglanz freigeben?'));
  const quartal = await als('Tim', () => karte('Auslastung Q1 planen', 'woche', 'Lena', { faellig_am: addDays(heute, 3), labels: 'Intern' }));
  await als('Tim', () => service.kommentiereKarte(quartal.id, '@Lena drei Angebote stehen kurz vor Zusage – wir brauchen ab Januar eine zweite Entwicklerin. @Marek siehst du das genauso?'));
  await als('Pia', () => karte('Black-Week-Kampagnen aller Kunden prüfen', 'woche', 'Pia', { faellig_am: addDays(heute, 2), labels: 'Ads, Black Week' }));
  await als('Marek', () => karte('Shopware-6-Update-Routine dokumentieren', 'backlog', 'Marek', { labels: 'Entwicklung' }));
  const hanse = db.firmen.find((f) => f.name.startsWith('Hanseatische'));
  if (hanse) {
    await als('Aylin', () =>
      service.addAktivitaet({ firma_id: hanse.id, kontakt_id: '', deal_id: '', typ: 'notiz', datum: new Date().toISOString(), text: '@Lena Jan Overbeck will dich beim Zweittermin dabeihaben, es geht um alle drei Länder-Shops.' }),
    );
  }

  // The week in the calendar: internal rituals plus calls with prospects and clients.
  const um = (inTagen: number, stunde: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + inTagen);
    d.setHours(stunde, minute, 0, 0);
    return d.toISOString();
  };
  const termin = (titel: string, start: string, ende: string, teilnehmer: string[], meet = true) =>
    calendar.events.push({
      id: `schau-${calendar.events.length}`, titel, start, ende, teilnehmer, abgesagt: false, ganztaegig: false,
      gaeste: teilnehmer.slice(1).map((email) => ({ email, antwort: 'accepted' as const })),
      bearbeitbar: teilnehmer[0] === teamEmail('Lena'),
      ...(meet ? { meetLink: `https://meet.google.com/demo-${calendar.events.length}` } : {}),
    });
  termin('Pipeline-Review', um(1, 9), um(1, 9, 45), [teamEmail('Lena'), teamEmail('Aylin'), teamEmail('Tim')]);
  termin('Zweittermin Hanseatische Teemanufaktur', um(0, 11), um(0, 12), [teamEmail('Aylin'), teamEmail('Lena'), 'jan@hanseatische-tee.example']);
  termin('Kickoff Lindgrün Naturkosmetik', um(2, 10), um(2, 11, 30), [teamEmail('Tim'), teamEmail('Lena'), teamEmail('Marek'), 'carla@lindgruen-kosmetik.example']);
  termin('Ads-Review Alpenglanz', um(1, 15), um(1, 15, 30), [teamEmail('Pia'), 'tobias@alpenglanz.example']);
  termin('Angebotsbesprechung Eichenhof', um(3, 14), um(3, 15), [teamEmail('Lena'), 'friedrich@eichenhof-moebel.example']);
  termin('1:1 Lena / Tim', um(4, 16), um(4, 16, 30), [teamEmail('Lena'), teamEmail('Tim')], false);
}

async function kundeEinrichten(
  service: CrmService,
  firmaId: string,
  f: DemoFirma,
  heute: string,
  als: <T>(name: string, fn: () => Promise<T>) => Promise<T>,
) {
  const board = await service.boardFuer(firmaId);
  for (const [spalte_id, titel, zustaendig, inTagen, sichtbar_kunde] of f.karten ?? []) {
    await als(zustaendig || f.zustaendig, () =>
      service.saveKarte(board.id, {
        titel, beschreibung: '', zustaendig, faellig_am: inTagen === null ? '' : addDays(heute, inTagen), labels: '', checkliste: '',
        sichtbar_kunde, spalte_id,
      }),
    );
  }
  for (const [titel, art, vorTagen] of f.news ?? []) {
    await service.saveKundenNews({ firma_id: firmaId, art, titel, text: '', datum: addDays(heute, -vorTagen), angeheftet: false, sichtbar_kunde: true });
  }
}

type Phase = 'neu' | 'qualifiziert' | 'vernetzung' | 'kontaktiert' | 'gespraech' | 'angebot' | 'gewonnen' | 'verloren';

interface DemoFirma {
  name: string;
  slug: string;
  ort: string;
  branche: string;
  plattform: string;
  version?: string;
  tier: string;
  score: number;
  phase: Phase;
  titel: string;
  wert: number;
  zustaendig: string;
  kontakt: [string, string, string];
  /** Why the shop is worth talking to: note on the firm and source of the history texts */
  anlass: string;
  /** Days since the first contact */
  alter: number;
  naechster?: [string, number];
  quelle?: string;
  verlust?: string;
  /** Catalogue categories (index in the tree) for the offer */
  angebot?: number[];
  kuerzel?: string;
  karten?: [string, string, string, number | null, boolean][];
  news?: [string, 'update' | 'meilenstein' | 'hinweis', number][];
}

// The path through the pipeline for each phase; each step is a real phase change with its side effects.
const WEG: Partial<Record<Phase, Phase[]>> = {
  qualifiziert: ['qualifiziert'],
  vernetzung: ['qualifiziert', 'vernetzung'],
  kontaktiert: ['qualifiziert', 'kontaktiert'],
  gespraech: ['qualifiziert', 'kontaktiert', 'gespraech'],
  angebot: ['qualifiziert', 'kontaktiert', 'gespraech', 'angebot'],
  gewonnen: ['qualifiziert', 'kontaktiert', 'gespraech', 'angebot', 'gewonnen'],
  verloren: ['qualifiziert', 'kontaktiert', 'verloren'],
};

const WAHRSCHEINLICHKEIT: Partial<Record<Phase, number>> = { qualifiziert: 10, vernetzung: 10, kontaktiert: 20, gespraech: 40, angebot: 60, gewonnen: 100 };

const PLATTFORM: Record<string, string> = {
  magento1: 'Magento 1', magento2: 'Magento 2', shopware5: 'Shopware 5', shopware6: 'Shopware 6', woocommerce: 'WooCommerce', shopify: 'Shopify',
};
const system = (f: DemoFirma) => [PLATTFORM[f.plattform] ?? f.plattform, f.version].filter(Boolean).join(' ');

const MAIL = { typ: 'mail', text: (f: DemoFirma) => `Erstansprache per Mail an ${f.kontakt[0]}: Aufhänger aus dem Shop-Audit (${system(f)}).` };
const ANRUF = { typ: 'anruf', text: (f: DemoFirma) => `Kurz telefoniert. ${f.anlass} Interesse an einem Termin.` };
const MEETING = { typ: 'meeting', text: (f: DemoFirma) => `Erstgespräch mit ${f.kontakt[0]} ${f.kontakt[1]} (${f.kontakt[2]}): Ziele, Budget und Zeitplan besprochen.` };
const ANGEBOT = { typ: 'notiz', text: (f: DemoFirma) => `Angebot „${f.titel}“ geschickt, ${f.wert.toLocaleString('de-DE')} €.` };
const ZUSAGE = { typ: 'anruf', text: (f: DemoFirma) => `Zusage von ${f.kontakt[0]}. Kickoff wird geplant.` };
const ABSAGE = { typ: 'mail', text: (f: DemoFirma) => `${f.kontakt[0]} hat abgesagt: ${f.verlust ?? 'kein Budget'}.` };

const VERLAUF: Partial<Record<Phase, { typ: string; text: (f: DemoFirma) => string }[]>> = {
  kontaktiert: [MAIL],
  gespraech: [MAIL, ANRUF, MEETING],
  angebot: [MAIL, MEETING, ANGEBOT],
  gewonnen: [MAIL, MEETING, ANGEBOT, ZUSAGE],
  verloren: [MAIL, ABSAGE],
};

const REGION: Record<string, string> = Object.fromEntries(
  (
    [
      ['Nord', 'Hamburg Kiel Flensburg Husum Westerland Rostock Bremen Cuxhaven Lüneburg Celle Hannover Verden'],
      ['West', 'Köln Düsseldorf Duisburg Solingen Münster Bielefeld Paderborn'],
      ['Mitte', 'Kassel Göttingen Erfurt Weimar'],
      ['Ost', 'Berlin Dresden Leipzig'],
      ['Süd', 'München Stuttgart Konstanz Freiburg Heidelberg Mannheim Nürnberg Bamberg Augsburg Garmisch-Partenkirchen Innsbruck'],
    ] as const
  ).flatMap(([region, orte]) => orte.split(' ').map((ort) => [ort, region])),
);

/** Tags the agency gives its firms: the kind of lead and the region, so the tag filter has something to show. */
export function demoTags(ort: string, titel: string): string {
  const art = /retainer|ads|black-week/i.test(titel) ? (/seo/i.test(titel) ? 'SEO-Lead' : 'Performance-Lead') : 'Shop-Lead';
  const region = REGION[ort];
  return region ? `${art}, Region ${region}` : art;
}

const FIRMEN: DemoFirma[] = [
  // Prospects that just came in from the lead finder
  { name: 'Kupferkessel Brauerei-Shop', slug: 'kupferkessel-brauerei', ort: 'Bamberg', branche: 'lebensmittel', plattform: 'magento1', tier: 'A', score: 88, phase: 'neu', titel: 'Shopify-Migration', wert: 28000, zustaendig: 'Aylin', kontakt: ['Bernd', 'Seitz', 'Inhaber'], anlass: 'Läuft seit Jahren auf Magento 1 ohne Sicherheitsupdates.', alter: 1 },
  { name: 'Wollknäuel Garnshop', slug: 'wollknaeuel-garne', ort: 'Göttingen', branche: 'hobby', plattform: 'shopware5', tier: 'B', score: 71, phase: 'neu', titel: 'Shopware-6-Umzug', wert: 15000, zustaendig: 'Aylin', kontakt: ['Ina', 'Brosche', 'Geschäftsführerin'], anlass: 'Shopware 5 ist am Ende, 2.300 Produkte.', alter: 1 },
  { name: 'Klangwerk Hifi', slug: 'klangwerk-hifi', ort: 'Mannheim', branche: 'technik', plattform: 'magento2', version: '2.4.4', tier: 'B', score: 66, phase: 'neu', titel: 'Shopify-Migration', wert: 22000, zustaendig: 'Lena', kontakt: ['Dario', 'Rossi', 'E-Commerce-Leiter'], anlass: 'Magento 2.4.4 ohne Support, Mobile-Score 31.', alter: 2 },
  { name: 'Strandgut Wohnaccessoires', slug: 'strandgut-wohnen', ort: 'Westerland', branche: 'wohnen', plattform: 'woocommerce', tier: 'C', score: 44, phase: 'neu', titel: 'Performance-Retainer', wert: 9500, zustaendig: 'Pia', kontakt: ['Maren', 'Thiessen', 'Inhaberin'], anlass: 'Kein Meta-Pixel, kein Consent-Banner.', alter: 2 },
  { name: 'Glutnest Kaminöfen', slug: 'glutnest-kamin', ort: 'Paderborn', branche: 'garten', plattform: 'shopware6', version: '6.4', tier: 'B', score: 62, phase: 'neu', titel: 'Tracking-Setup', wert: 7500, zustaendig: 'Pia', kontakt: ['Holger', 'Brandt', 'Marketing'], anlass: 'GA4 doppelt eingebunden, Umsatz wird verdoppelt.', alter: 3 },
  { name: 'Fuchsbau Kinderzimmer', slug: 'fuchsbau-kinder', ort: 'Heidelberg', branche: 'kinder', plattform: 'magento2', version: '2.4.6', tier: 'A', score: 79, phase: 'neu', titel: 'Shopify-Migration', wert: 30000, zustaendig: 'Aylin', kontakt: ['Jule', 'Krämer', 'Geschäftsführerin'], anlass: 'Wartungskosten Magento laut Stellenanzeige ein Problem.', alter: 3 },

  // Qualified and connection requests
  { name: 'Wellenreiter Surfshop', slug: 'wellenreiter-surf', ort: 'Kiel', branche: 'sport', plattform: 'woocommerce', tier: 'B', score: 68, phase: 'qualifiziert', titel: 'Shopify-Migration', wert: 16000, zustaendig: 'Aylin', kontakt: ['Finn', 'Petersen', 'Inhaber'], anlass: 'Shop bricht bei Saisonstart unter Last zusammen.', alter: 4, naechster: ['Erstkontakt per Mail', 0] },
  { name: 'Pfotenglück Tierbedarf', slug: 'pfotenglueck', ort: 'Hannover', branche: 'tiere', plattform: 'shopware5', tier: 'A', score: 84, phase: 'qualifiziert', titel: 'Shopware-6-Umzug', wert: 38000, zustaendig: 'Lena', kontakt: ['Svenja', 'Albrecht', 'Head of E-Commerce'], anlass: 'Abo-Modell für Futter geplant, Shopware 5 kann das nicht.', alter: 5, naechster: ['Erstkontakt per Mail', 0] },
  { name: 'Tintenfass Papeterie', slug: 'tintenfass-papeterie', ort: 'Weimar', branche: 'hobby', plattform: 'shopware6', version: '6.5', tier: 'C', score: 41, phase: 'qualifiziert', titel: 'SEO-Retainer', wert: 9000, zustaendig: 'Pia', kontakt: ['Clara', 'Weiß', 'Inhaberin'], anlass: 'Gute Produkte, kaum organische Sichtbarkeit.', alter: 6, naechster: ['Shop-Audit anschauen', 1] },
  { name: 'Sattelfest Reitsport', slug: 'sattelfest-reitsport', ort: 'Verden', branche: 'sport', plattform: 'magento2', version: '2.4.5', tier: 'B', score: 63, phase: 'vernetzung', titel: 'Shopify-Migration', wert: 24000, zustaendig: 'Aylin', kontakt: ['Henrike', 'Lüders', 'Geschäftsführerin'], anlass: 'LinkedIn: sucht neue Agentur für den Relaunch.', alter: 7, naechster: ['Vernetzung prüfen', 0] },
  { name: 'Bienenstock Imkereibedarf', slug: 'bienenstock-imkerei', ort: 'Celle', branche: 'hobby', plattform: 'woocommerce', tier: 'C', score: 47, phase: 'vernetzung', titel: 'Shopify-Migration', wert: 11000, zustaendig: 'Lena', kontakt: ['Gero', 'Hansen', 'Inhaber'], anlass: 'Wächst stark über Instagram, Shop kommt nicht hinterher.', alter: 5, naechster: ['Vernetzung prüfen', 2] },

  // In conversation
  { name: 'Lichtblick Leuchten', slug: 'lichtblick-leuchten', ort: 'Nürnberg', branche: 'wohnen', plattform: 'magento2', version: '2.4.4', tier: 'A', score: 86, phase: 'kontaktiert', titel: 'Shopify-Migration', wert: 42000, zustaendig: 'Lena', kontakt: ['Thomas', 'Maier', 'Geschäftsführer'], anlass: 'Magento 2.4.4 ohne Support, 4.800 Produkte mit Varianten.', alter: 9, naechster: ['Nachfassen per Telefon', -1] },
  { name: 'Seemannsgarn Strickwaren', slug: 'seemannsgarn', ort: 'Husum', branche: 'mode', plattform: 'shopware5', tier: 'B', score: 59, phase: 'kontaktiert', titel: 'Shopware-6-Umzug', wert: 21000, zustaendig: 'Aylin', kontakt: ['Kerstin', 'Jessen', 'Inhaberin'], anlass: 'Shopware 5, Checkout ohne PayPal Express.', alter: 8, naechster: ['Zweite Mail mit Case', 1] },
  { name: 'Gartenglück Pflanzenversand', slug: 'gartenglueck', ort: 'Erfurt', branche: 'garten', plattform: 'magento2', version: '2.4.6', tier: 'A', score: 81, phase: 'kontaktiert', titel: 'Performance-Retainer', wert: 30000, zustaendig: 'Pia', kontakt: ['Ralf', 'Engel', 'Marketingleiter'], anlass: 'Google-Ads-Konto ohne Conversion-Tracking.', alter: 10, naechster: ['Ads-Konto-Check anbieten', 2] },
  { name: 'Fernweh Reisegepäck', slug: 'fernweh-gepaeck', ort: 'Köln', branche: 'mode', plattform: 'magento2', version: '2.4.5', tier: 'B', score: 65, phase: 'kontaktiert', titel: 'Shopify-Migration', wert: 27000, zustaendig: 'Aylin', kontakt: ['Nadine', 'Schumacher', 'E-Commerce-Managerin'], anlass: 'Ladezeit Kategorieseite 6,2 Sekunden.', alter: 6, naechster: ['LinkedIn-Nachricht schicken', 3] },
  { name: 'Haarmonie Friseurbedarf', slug: 'haarmonie', ort: 'Düsseldorf', branche: 'beauty', plattform: 'shopware5', tier: 'B', score: 57, phase: 'kontaktiert', titel: 'B2B-Shop auf Shopware 6', wert: 34000, zustaendig: 'Tim', kontakt: ['Sandra', 'Becker', 'Vertriebsleiterin'], anlass: 'B2B-Preise laufen über Excel-Listen.', alter: 12, naechster: ['Nachfassen per Telefon', 0] },
  { name: 'Sternwarte Spielwaren', slug: 'sternwarte-spiel', ort: 'Augsburg', branche: 'kinder', plattform: 'woocommerce', tier: 'C', score: 49, phase: 'kontaktiert', titel: 'Black-Week-Sprint', wert: 8500, zustaendig: 'Pia', kontakt: ['Lukas', 'Hartl', 'Inhaber'], anlass: 'Black Week ist der wichtigste Monat, keine Kampagnen geplant.', alter: 4, naechster: ['Kampagnen-Idee schicken', 1] },
  { name: 'Hanseatische Teemanufaktur', slug: 'hanseatische-tee', ort: 'Bremen', branche: 'lebensmittel', plattform: 'shopware6', version: '6.4', tier: 'A', score: 90, phase: 'gespraech', titel: 'Shopify-Plus-Migration', wert: 58000, zustaendig: 'Aylin', kontakt: ['Jan', 'Overbeck', 'Geschäftsführer'], anlass: 'Drei Länder-Shops, Abo-Tee und B2B auf einer Plattform gewünscht.', alter: 18, naechster: ['Zweittermin mit Lena', 0] },
  { name: 'Uhrwerk Nord', slug: 'uhrwerk-nord', ort: 'Flensburg', branche: 'schmuck', plattform: 'magento2', version: '2.4.6', tier: 'A', score: 83, phase: 'gespraech', titel: 'Shopify-Migration', wert: 36000, zustaendig: 'Lena', kontakt: ['Mats', 'Carstensen', 'Inhaber'], anlass: 'Hohe Warenkörbe, aber Conversion-Rate unter 1 %.', alter: 15, naechster: ['Workshop-Termin vorschlagen', 2] },
  { name: 'Speichenwerk Fahrräder', slug: 'speichenwerk', ort: 'Dresden', branche: 'fahrzeuge', plattform: 'shopware6', version: '6.5', tier: 'B', score: 69, phase: 'gespraech', titel: 'Konfigurator und Tracking', wert: 29000, zustaendig: 'Tim', kontakt: ['Robert', 'Liebig', 'Geschäftsführer'], anlass: 'Fahrrad-Konfigurator verliert 70 % der Nutzer.', alter: 14, naechster: ['Technische Machbarkeit klären', 1] },
  { name: 'Kornblume Bio-Feinkost', slug: 'kornblume-feinkost', ort: 'Lüneburg', branche: 'lebensmittel', plattform: 'woocommerce', tier: 'B', score: 61, phase: 'gespraech', titel: 'Shopify-Migration', wert: 19000, zustaendig: 'Aylin', kontakt: ['Anke', 'Möller', 'Inhaberin'], anlass: 'Kühlversand mit Lieferterminen fehlt im Checkout.', alter: 11, naechster: ['Referenz Alpenglanz schicken', -2] },
  { name: 'Klingenwerk Solingen', slug: 'klingenwerk', ort: 'Solingen', branche: 'hobby', plattform: 'magento1', tier: 'A', score: 85, phase: 'gespraech', titel: 'Shopify-Migration', wert: 33000, zustaendig: 'Lena', kontakt: ['Werner', 'Kuhl', 'Geschäftsführer'], anlass: 'Magento 1, Export nach Japan und USA wächst.', alter: 20, naechster: ['Budget mit Geschäftsführung klären', 4] },

  // Offers out
  { name: 'Eichenhof Möbelwerkstatt', slug: 'eichenhof-moebel', ort: 'Kassel', branche: 'wohnen', plattform: 'magento2', version: '2.4.5', tier: 'A', score: 87, phase: 'angebot', titel: 'Shopify-Plus-Relaunch', wert: 62000, zustaendig: 'Lena', kontakt: ['Friedrich', 'Hellwig', 'Geschäftsführer'], anlass: 'Möbel nach Maß, Konfigurator und Lieferzeiten pro Holzart.', alter: 30, naechster: ['Angebot besprechen', 3], angebot: [1, 3] },
  { name: 'Salzwiese Feinkost', slug: 'salzwiese-feinkost', ort: 'Rostock', branche: 'lebensmittel', plattform: 'shopware6', version: '6.4', tier: 'B', score: 72, phase: 'angebot', titel: 'Shopware-6-Upgrade und CRO', wert: 24000, zustaendig: 'Tim', kontakt: ['Katrin', 'Voss', 'E-Commerce-Leiterin'], anlass: 'Update auf 6.6 steht aus, Checkout-Abbrüche hoch.', alter: 24, naechster: ['Angebot nachfassen', -1], angebot: [2] },
  { name: 'Brückner Arbeitsschutz', slug: 'brueckner-arbeitsschutz', ort: 'Duisburg', branche: 'b2b', plattform: 'magento2', version: '2.4.4', tier: 'A', score: 91, phase: 'angebot', titel: 'B2B-Shop auf Shopify Plus', wert: 74000, zustaendig: 'Lena', kontakt: ['Michael', 'Brückner', 'Geschäftsführer'], anlass: 'Kundenspezifische Preise, Rahmenverträge, SAP-Anbindung.', alter: 35, naechster: ['Rückfragen zur SAP-Schnittstelle', 1], angebot: [1, 4] },
  { name: 'Gezeiten Fischfeinkost', slug: 'gezeiten-fisch', ort: 'Cuxhaven', branche: 'lebensmittel', plattform: 'woocommerce', tier: 'B', score: 64, phase: 'angebot', titel: 'Shopify-Migration', wert: 18500, zustaendig: 'Aylin', kontakt: ['Hauke', 'Janssen', 'Inhaber'], anlass: 'Expressversand und Frischegarantie im Checkout.', alter: 21, naechster: ['Angebot nachfassen', 0], angebot: [1] },

  // Won: three more clients next to Alpenglanz
  {
    name: 'Lindgrün Naturkosmetik', slug: 'lindgruen-kosmetik', ort: 'Freiburg', branche: 'beauty', plattform: 'shopify', tier: 'A', score: 89, phase: 'gewonnen', titel: 'Shopify-Migration', wert: 46000, zustaendig: 'Tim', kontakt: ['Carla', 'Brenner', 'Geschäftsführerin'], anlass: 'Von Magento auf Shopify, Abo für Nachfüllpacks.', alter: 40, kuerzel: 'LGN', quelle: 'Empfehlung',
    karten: [
      ['woche', 'Kickoff vorbereiten', 'Tim', 2, false],
      ['woche', 'Produktdaten-Export prüfen', 'Marek', 1, false],
      ['backlog', 'Abo-App auswählen', 'Marek', null, true],
      ['wartet', 'Zugang zum alten Magento-Backend', '', -1, true],
    ],
    news: [['Vertrag unterschrieben, Kickoff am Mittwoch', 'meilenstein', 1]],
  },
  {
    name: 'Rotkehlchen Kindermode', slug: 'rotkehlchen-kids', ort: 'Münster', branche: 'kinder', plattform: 'shopware6', version: '6.6', tier: 'B', score: 74, phase: 'gewonnen', titel: 'Performance-Retainer', wert: 3200, zustaendig: 'Pia', kontakt: ['Miriam', 'Stein', 'Marketingleiterin'], anlass: 'Monatlicher Retainer für Google und Meta Ads.', alter: 90, kuerzel: 'RKM', quelle: 'Website',
    karten: [
      ['arbeit', 'Black-Week-Kampagnen aufsetzen', 'Pia', 3, true],
      ['woche', 'Feed-Optimierung Google Shopping', 'Pia', 1, true],
      ['erledigt', 'Oktober-Reporting verschickt', 'Pia', null, true],
      ['backlog', 'TikTok-Ads testen', '', null, false],
    ],
    news: [['ROAS im September: 4,8 (Vormonat 3,9)', 'update', 6]],
  },
  {
    name: 'Zeitlos Vintage Möbel', slug: 'zeitlos-vintage', ort: 'Berlin', branche: 'wohnen', plattform: 'shopify', tier: 'B', score: 70, phase: 'gewonnen', titel: 'Shopify-Theme und CRO', wert: 21000, zustaendig: 'Marek', kontakt: ['Leon', 'Fischer', 'Gründer'], anlass: 'Einzelstücke, jedes Produkt nur einmal verfügbar.', alter: 60, kuerzel: 'ZVM', quelle: 'LinkedIn',
    karten: [
      ['arbeit', 'Produktseite: „Nur 1 verfügbar“-Hinweis', 'Marek', 2, true],
      ['wartet', 'Neue Produktfotos Herbst', '', 4, true],
      ['erledigt', 'Theme-Update auf Version 15', 'Marek', null, true],
    ],
    news: [['Neues Theme ist live', 'meilenstein', 9]],
  },

  // Lost, with reasons for the evaluation
  { name: 'Pedalwerk E-Bikes', slug: 'pedalwerk', ort: 'Stuttgart', branche: 'fahrzeuge', plattform: 'magento2', version: '2.4.6', tier: 'B', score: 58, phase: 'verloren', titel: 'Shopify-Migration', wert: 31000, zustaendig: 'Aylin', kontakt: ['Sven', 'Kurz', 'Geschäftsführer'], anlass: 'Händlerportal und Endkundenshop getrennt.', alter: 28, verlust: 'Wettbewerber' },
  { name: 'Gipfelstürmer Bergsport', slug: 'gipfelstuermer', ort: 'Garmisch-Partenkirchen', branche: 'sport', plattform: 'magento1', tier: 'B', score: 60, phase: 'verloren', titel: 'Shopify-Migration', wert: 26000, zustaendig: 'Lena', kontakt: ['Andreas', 'Huber', 'Inhaber'], anlass: 'Magento 1, Inhaber will erst nach der Wintersaison wechseln.', alter: 25, verlust: 'Timing' },
  { name: 'Funkenflug Grillshop', slug: 'funkenflug-grill', ort: 'Bielefeld', branche: 'garten', plattform: 'woocommerce', tier: 'C', score: 39, phase: 'verloren', titel: 'Performance-Retainer', wert: 12000, zustaendig: 'Pia', kontakt: ['Dennis', 'Wolf', 'Inhaber'], anlass: 'Saisonale Nachfrage, Budget nur im Sommer.', alter: 33, verlust: 'Kein Budget' },
];

