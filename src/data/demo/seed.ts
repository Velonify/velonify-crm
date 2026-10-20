import { CrmService } from '../crm';
import { DemoShopAudit } from '../shopAudit';
import { EINSTELLUNG } from '../constants';
import { addDays, isoDate } from '../ids';
import { SheetStore } from '../sheets/sheetStore';
import type { KundenFeedback } from '../types';
import { berichtInhalt, berichtsMonat, monatsZeitraum, naechsterMonat, type BerichtDaten } from '../monatsbericht';
import { runSetup } from '../sheets/setup';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT } from '../types';
import type { CalendarEvent } from '../google/calendar';
import type { DriveFile } from '../google/drive';
import { MemoryCalendar, MemoryDrive } from './memoryGoogle';
import { AGENTUR, teamEmail } from './agentur';
import { MemorySheets, type SheetsZustand } from './memorySheets';
import { fuelleSchaufenster } from './schaufenster';

export interface DemoBackend {
  service: CrmService;
  sheets: MemorySheets;
  drive: MemoryDrive;
  calendar: MemoryCalendar;
}

/** A demo saved earlier (see dauerhaft.ts): sheet, drive and calendar as plain data. */
export interface DemoDaten {
  sheets: SheetsZustand;
  drive: DriveFile[];
  kalender: CalendarEvent[];
}

// Calculation sheets live in memory too; their links lead nowhere.
const kalkulation = () => new MemorySheets('Kalkulation (Demo)');

/** Picks up a demo saved earlier, as it was: no seeding. */
export function stelleDemoHer(currentUser: () => string, daten: DemoDaten): DemoBackend {
  const sheets = MemorySheets.aus(daten.sheets);
  const drive = new MemoryDrive(daten.drive);
  const calendar = new MemoryCalendar(daten.kalender);
  const service = new CrmService({ store: new SheetStore(sheets), drive, calendar, currentUser, tabelle: kalkulation });
  return { service, sheets, drive, calendar };
}

/**
 * Builds demo mode: an in-memory sheet, drive and calendar driven by the real CrmService,
 * filled with invented companies on the reserved .example TLD. This repo is public – never real leads here.
 * `schaufenster` turns it into the public demo: an invented agency with a full pipeline (see schaufenster.ts);
 * tests run without it on the small Velonify set.
 */
export async function createDemoBackend(currentUser: () => string, optionen: { schaufenster?: boolean } = {}): Promise<DemoBackend> {
  const sheets = new MemorySheets();
  await runSetup(sheets);

  const drive = new MemoryDrive();
  const shared = drive.add(optionen.schaufenster ? AGENTUR.name : 'Velonify', null);
  const sales = drive.add('02_Sales', shared.id);
  const leads = drive.add('01_Leads', sales.id);
  const proposals = drive.add('02_Proposals', sales.id);
  const clients = drive.add('01_Clients', shared.id);
  const templates = drive.add('03_Templates', shared.id);
  const vorlage = drive.add('01_Client-Folder-Template', templates.id);
  for (const name of ['00_Account', '01_Onboarding', '02_Strategy', '04_Delivery', '05_Reporting', '06_Meetings', '07_Client-Share', '99_Archive']) {
    drive.add(name, vorlage.id);
  }
  const creative = drive.add('03_Creative', vorlage.id);
  for (const name of ['01_Briefings', '02_Assets-In', '03_WIP', '04_Final']) drive.add(name, creative.id);

  // Seed data is attributed to a demo user; afterwards to whoever uses the demo.
  let seeding = true;
  let alsEmail: string | null = null;
  const calendar = new MemoryCalendar();
  const service = new CrmService({
    store: new SheetStore(sheets),
    drive,
    calendar,
    currentUser: () => alsEmail ?? (seeding ? 'demo@velonify.de' : currentUser()),
    tabelle: kalkulation,
  });
  await service.saveEinstellungen({
    [EINSTELLUNG.leadsOrdner]: leads.id,
    [EINSTELLUNG.clientsOrdner]: clients.id,
    [EINSTELLUNG.vorlageOrdner]: vorlage.id,
    [EINSTELLUNG.proposalsOrdner]: proposals.id,
  });

  const heute = isoDate(new Date());
  const firma = (input: Partial<typeof EMPTY_FIRMA_INPUT>) => service.createFirma({ ...EMPTY_FIRMA_INPUT, quelle: 'Demo', ...input });
  const kontakt = (firmaId: string, input: Partial<typeof EMPTY_KONTAKT_INPUT>) => service.saveKontakt(firmaId, { ...EMPTY_KONTAKT_INPUT, ...input });
  const deal = (firmaId: string, input: Partial<typeof EMPTY_DEAL_INPUT>) => service.saveDeal(firmaId, { ...EMPTY_DEAL_INPUT, titel: 'Shopify-Migration', ...input });
  const phase = async (dealId: string, ziel: string, grund = '') => {
    const db = await service.load();
    const d = db.deals.find((x) => x.id === dealId)!;
    return service.changePhase(dealId, ziel, d.geaendert_am, grund);
  };

  const nordlicht = await firma({ name: 'Nordlicht Outdoor GmbH', domain: 'nordlicht-outdoor.example', tier: 'A', score: 92, plattform: 'magento2', version: '2.4.6', eol: 'eol', ort: 'Hamburg', register: 'HRB 000001 (AG Hamburg)', email_allgemein: 'info@nordlicht-outdoor.example', telefon_allgemein: '040 000000', tech_info: 'ga4, meta_pixel, trustedshops · 812 Katalog-URLs', zustaendig: 'Lugge', branche: 'sport', tags: 'Shop-Lead, Gebiet Hamburg' });
  const nk = await kontakt(nordlicht.id, { vorname: 'Mara', nachname: 'Holm', rolle: 'Head of E-Commerce', email: 'mara.holm@nordlicht-outdoor.example', telefon: '040 000001' });
  const nd = await deal(nordlicht.id, { kontakt_id: nk.id, wert_eur: 48000, zustaendig: 'Lugge', naechster_schritt: 'Angebot nachfassen', naechster_schritt_am: addDays(heute, -1) });
  await service.legeLeadOrdnerAn(nordlicht.id, 'NLO');
  await phase(nd.id, 'qualifiziert');
  await phase(nd.id, 'gespraech');
  await phase(nd.id, 'angebot');
  await service.verschiebeNachClients(nordlicht.id);

  const bergwerk = await firma({ name: 'Bergwerk Kaffeerösterei', domain: 'bergwerk-kaffee.example', tier: 'B', score: 64, plattform: 'magento1', eol: 'eol', ort: 'München', email_allgemein: 'hallo@bergwerk-kaffee.example', tech_info: 'ga4 · 140 Katalog-URLs', zustaendig: 'Johannes' });
  const bd = await deal(bergwerk.id, { wert_eur: 18000, zustaendig: 'Johannes', naechster_schritt: 'Erstkontakt per Mail', naechster_schritt_am: heute });
  await phase(bd.id, 'qualifiziert');

  const kleinod = await firma({ name: 'Kleinod Schmuckmanufaktur', domain: 'kleinod-schmuck.example', tier: 'A', score: 81, plattform: 'magento2', version: '2.4.7', eol: 'supported', ort: 'Leipzig', zustaendig: 'Julian', notiz: 'Erstgespräch lief gut, wartet auf Budgetfreigabe.' });
  const kk = await kontakt(kleinod.id, { vorname: 'Jonas', nachname: 'Brandt', rolle: 'Geschäftsführer', email: 'jonas@kleinod-schmuck.example' });
  const kd = await deal(kleinod.id, { kontakt_id: kk.id, wert_eur: 32000, wahrscheinlichkeit: 60, zustaendig: 'Julian', naechster_schritt: 'Workshop-Termin abstimmen', naechster_schritt_am: addDays(heute, 3) });
  await phase(kd.id, 'kontaktiert');
  await phase(kd.id, 'gespraech');
  await service.saveWiedervorlage({ firma_id: kleinod.id, deal_id: kd.id, titel: 'Budgetfreigabe erfragen', faellig_am: addDays(heute, 2), zustaendig: 'Julian' });
  await service.addAktivitaet({ firma_id: kleinod.id, kontakt_id: kk.id, deal_id: kd.id, typ: 'anruf', datum: new Date(Date.now() - 3 * 86_400_000).toISOString(), text: 'Erstgespräch: Magento-Wartung wird zu teuer, Relaunch für Q1 geplant.' });

  const alpenglanz = await firma({ name: 'Alpenglanz Kosmetik AG', domain: 'alpenglanz.example', kuerzel: 'AGK', status: 'kunde', plattform: 'shopify_plus', ort: 'Innsbruck', quelle: 'Empfehlung', zustaendig: 'Johannes', slack_channel: 'client-agk-general', branche: 'beauty' });
  const ad = await deal(alpenglanz.id, { titel: 'Shopify-Plus-Relaunch', wert_eur: 65000, zustaendig: 'Johannes' });
  await phase(ad.id, 'gewonnen');
  const ak = await kontakt(alpenglanz.id, { vorname: 'Sophie', nachname: 'Lindner', rolle: 'Geschäftsführerin', email: 'sophie@alpenglanz.example', hauptkontakt: true });
  await kontakt(alpenglanz.id, { vorname: 'Tobias', nachname: 'Brandl', rolle: 'Marketing', email: 'tobias@alpenglanz.example' });
  await kontakt(alpenglanz.id, { vorname: 'Petra', nachname: 'Huber', rolle: 'Buchhaltung' });
  await service.saveWiedervorlage({ firma_id: alpenglanz.id, deal_id: '', titel: 'Quartalsreport schicken', faellig_am: addDays(heute, -3), zustaendig: 'Johannes' });

  const feldmann = await firma({ name: 'Feldmann Werkzeuge', domain: 'feldmann-werkzeuge.example', tier: 'C', score: 38, plattform: 'magento2', version: '2.4.4', eol: 'eol', ort: 'Stuttgart', tags: 'SEO-Lead, Gebiet Dortmund, Dach' });
  const fd = await deal(feldmann.id, { wert_eur: 12000 });
  await phase(fd.id, 'verloren', 'Kein Budget');

  const seeblick = await firma({ name: 'Seeblick Heimtextil', domain: 'seeblick-heimtextil.example', tier: 'B', score: 58, plattform: 'magento2', version: '2.4.5', eol: 'eol', ort: 'Konstanz', zustaendig: 'Lugge', tags: 'SEO-Lead, Gebiet Stuttgart, Zahnarzt' });
  const sk = await kontakt(seeblick.id, { vorname: 'Lea', nachname: 'Sommer', rolle: 'Geschäftsführerin', linkedin: 'https://www.linkedin.com/in/lea-sommer-demo' });
  const sd = await deal(seeblick.id, { wert_eur: 22000, zustaendig: 'Lugge' });
  await phase(sd.id, 'qualifiziert');
  const vernetzt = await service.sendeVernetzung(sd.id, (await service.load()).deals.find((d) => d.id === sd.id)!.geaendert_am, { kontaktId: sk.id, notiz: '', ich: 'Lugge' });
  // The request is a week old in the demo, so the reminder is due today.
  const { titel, kontakt_id, wert_eur, wahrscheinlichkeit, zustaendig, naechster_schritt } = vernetzt;
  await service.saveDeal(seeblick.id, { titel, kontakt_id, wert_eur, wahrscheinlichkeit, zustaendig, naechster_schritt, naechster_schritt_am: heute }, { id: vernetzt.id, expectedGeaendertAm: vernetzt.geaendert_am });

  await service.uebernimmStartkatalog();
  await service.uebernimmOutreachStartliste();

  // A few appointments this week, so the calendar page has something to show.
  const um = (tage: number, stunde: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + tage);
    d.setHours(stunde, minute, 0, 0);
    return d.toISOString();
  };
  const termin = (titel: string, start: string, ende: string, teilnehmer: string[], extra: Partial<(typeof calendar.events)[number]> = {}) =>
    calendar.events.push({
      id: `demo-${calendar.events.length}`, titel, start, ende, teilnehmer, abgesagt: false, ganztaegig: false,
      // The first person organizes; the demo user is Lugge.
      gaeste: teilnehmer.slice(1).map((email) => ({ email, antwort: 'accepted' as const })),
      bearbeitbar: teilnehmer.length === 0 || teilnehmer[0] === 'lugge@velonify.de',
      ...extra,
    });
  termin('Team-Sync', um(0, 9, 30), um(0, 10), ['lugge@velonify.de', 'johannes@velonify.de', 'julian@velonify.de'], { meetLink: 'https://meet.google.com/demo-team-sync' });
  termin('Migrations-Call Nordlicht', um(0, 14), um(0, 15), ['lugge@velonify.de', 'mara.holm@nordlicht-outdoor.example'], { meetLink: 'https://meet.google.com/demo-nordlicht' });
  termin('Workshop Kleinod', um(1, 10), um(1, 12), ['julian@velonify.de', 'jonas@kleinod-schmuck.example'], { ort: 'Leipzig' });
  termin('Fokuszeit Angebot', um(2, 13), um(2, 16), ['lugge@velonify.de']);
  termin('E-Commerce-Messe', addDays(heute, 3), addDays(heute, 5), [], { ganztaegig: true, ort: 'Köln' });
  termin('Abgelehnter Termin', um(1, 16), um(1, 17), ['lugge@velonify.de', 'extern@beispiel.example'], { antwort: 'declined', bearbeitbar: false });

  // Word game: Johannes plays every day and has already solved today's word, Julian now and then.
  const wordle = (spieler: string, tage: number, muster: string, geloest = true) =>
    service.speichereWordle({ datum: addDays(heute, -tage), spieler, versuche: muster.split('/').length, geloest, muster });
  for (let tag = 1; tag <= 6; tag++) await wordle('Johannes', tag, ['xyxxg', 'gxyxg', 'ggggg'].slice(tag % 2).join('/'));
  await wordle('Johannes', 0, 'xxyxx/gyxxg/ggggg');
  await wordle('Julian', 1, 'xxxxx/yxxyx/xgyxx/ggxgg/ggggg');
  await wordle('Julian', 3, 'xyxxx/xxgyx/gxgxx/gggxg/gggxg/gggxg', false);

  // Two inquiries waiting in the inbox, as crm-api writes them from the website form.
  const anfrage = (id: string, stunden: number, felder: Record<string, string>) => {
    const eingegangen = new Date(Date.now() - stunden * 3600_000).toISOString();
    return new SheetStore(sheets).insert('eingang', [
      {
        id, eingegangen_am: eingegangen, quelle: 'velonify.de', sprache: 'de', shop: '', themen: '', nachricht: '',
        status: 'neu', firma_id: '', kontakt_id: '', erledigt_am: '', erledigt_von: '',
        erstellt_am: eingegangen, erstellt_von: 'Website', geaendert_am: eingegangen, geaendert_von: 'Website',
        name: '', email: '', ...felder,
      },
    ]);
  };
  await anfrage('EA-DEMO1', 3, {
    name: 'Mara Holm', email: 'mara.holm@nordlicht-outdoor.example', shop: 'https://nordlicht-outdoor.example',
    themen: 'Tracking, Ads', nachricht: 'Seit dem Shop-Umzug meldet GA4 deutlich weniger Umsatz als die Bestellungen hergeben.',
  });
  await anfrage('EA-DEMO2', 26, {
    name: 'Peer Lindqvist', email: 'peer@fjordlicht.example', shop: 'https://fjordlicht.example', sprache: 'en',
    themen: 'Shopify-Migration', nachricht: 'We are on Magento 2.4.4 and want to move before support ends.',
  });

  // Lead magnets: one live skill set with four sign-ups from LinkedIn, one still in preparation.
  const skills = await service.saveMagnet({
    slug: 'shopify-skills', titel: 'Shopify-Ops-Skillset', beschreibung: '8 Claude-Skills für E-Com-Manager in Shopify-Shops', stichwort: 'SKILLS',
    datei_url: 'https://drive.google.com/drive/folders/demo-skills', mail_betreff: '', mail_text: '', aktiv: true,
    untertitel: '8 Claude-Skills, die wir selbst jeden Tag im Shopify-Alltag nutzen – jeweils mit Anleitung.',
    inhalt: '## Was drin ist\n- Lieferantendaten rein, fertige Produkttexte raus\n- Matrixify-Import vorher auf Fehler prüfen\n- Retourengründe clustern\n\n## Für wen\nE-Com-Manager in Shopify-Shops.',
    knopf: 'Skillset anfordern', typ: 'datei', plaetze: null,
  });
  await service.saveMagnet({
    slug: 'umzug-checkliste', titel: 'Checkliste Shopify-Umzug', beschreibung: 'Livegang-Checkliste für Magento → Shopify', stichwort: 'UMZUG',
    datei_url: '', mail_betreff: '', mail_text: '', aktiv: false, untertitel: '', inhalt: '', knopf: '', typ: 'datei', plaetze: null,
  });
  const roast = await service.saveMagnet({
    slug: 'shop-roast', titel: 'Shop-Roast', beschreibung: 'Kommentiert ROAST → wir prüfen euren Shop', stichwort: 'ROAST',
    datei_url: '', mail_betreff: '', mail_text: '', aktiv: true, typ: 'audit', plaetze: 30,
    untertitel: 'Wir prüfen euren Shop in vier Bereichen – dazu drei Beobachtungen von unserem Team.',
    inhalt: '## Was wir prüfen\n- Plattform und Version\n- Geschwindigkeit\n- Tracking und E-Mail-Marketing\n- Shop-Basics und SEO',
    knopf: 'Shop prüfen lassen',
  });
  const magnetLead = (id: string, stunden: number, felder: Partial<Record<string, string | number | boolean>>) => {
    const eingegangen = new Date(Date.now() - stunden * 3600_000).toISOString();
    return new SheetStore(sheets).insert('magnet_leads', [
      {
        id, magnet: skills.slug, eingegangen_am: eingegangen, vorname: '', email: '', shop: '', shopsystem: '',
        utm_source: 'linkedin', utm_medium: 'social', utm_campaign: skills.slug, utm_content: 'dm', token: `demo-${id}`,
        mail_gesendet_am: eingegangen, download_am: '', downloads: 0, newsletter_einwilligung: false, newsletter_text: '',
        newsletter_bestaetigt_am: '', newsletter_abgemeldet_am: '', status: 'neu', firma_id: '', kontakt_id: '', erledigt_am: '', erledigt_von: '',
        warteliste: false, audit_id: '', report: '', report_von: '', report_freigegeben_am: '', report_gesendet_am: '', report_geoeffnet_am: '', report_aufrufe: null,
        erstellt_am: eingegangen, erstellt_von: 'Website', geaendert_am: eingegangen, geaendert_von: 'Website',
        ...felder,
      },
    ]);
  };
  const spaeter = (stunden: number) => new Date(Date.now() - stunden * 3600_000).toISOString();
  await magnetLead('ML-DEMO1', 2, { vorname: 'Svenja', email: 'svenja@hafenkontor-shop.example', shop: 'hafenkontor-shop.example', shopsystem: 'magento', download_am: spaeter(1), downloads: 2 });
  await magnetLead('ML-DEMO2', 5, {
    vorname: 'Tarek', email: 'tarek@kraeuterwerk.example', shop: 'https://kraeuterwerk.example', shopsystem: 'shopify', download_am: spaeter(4), downloads: 1,
    newsletter_einwilligung: true, newsletter_text: 'Ja, schickt mir auch den Velonify-Newsletter.', newsletter_bestaetigt_am: spaeter(4),
  });
  await magnetLead('ML-DEMO3', 20, { vorname: 'Jana', email: 'jana.lorenz@gmail.com', shopsystem: 'keins', newsletter_einwilligung: true, newsletter_text: 'Ja, schickt mir auch den Velonify-Newsletter.' });
  await magnetLead('ML-DEMO4', 30, { vorname: 'Ole', email: 'ole@nordwind-moebel.example', shop: 'nordwind-moebel.example', shopsystem: 'shopware', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '' });
  // Shop-Roast: one sign-up waiting for the check, one already checked with a first draft of the report.
  const roastLead = { magnet: roast.slug, utm_campaign: roast.slug, mail_gesendet_am: spaeter(3) };
  await magnetLead('ML-DEMO5', 3, { ...roastLead, vorname: 'Mira', email: 'mira@seifenwerk.example', shop: 'seifenwerk.example', shopsystem: 'shopware' });
  await magnetLead('ML-DEMO6', 26, { ...roastLead, vorname: 'Jonas', email: 'jonas@bergzeit-tee.example', shop: 'https://www.bergzeit-tee.example/', shopsystem: 'magento' });
  const roastAudit = await service.speichereAudit(await new DemoShopAudit(0).pruefe({ domain: 'bergzeit-tee.example', leistungen: [] }));
  await service.verknuepfeRoastAudit('ML-DEMO6', roastAudit);

  // Team plant: Johannes has already watered today.
  await service.giesseMonstera('Johannes');

  // Social media: the 90-day plan plus invented numbers for ten posts, so the thresholds have something to
  // compare. The dates run backwards from today – in real life the plan only starts on 22.09.
  await service.uebernimmSocialPlan();
  const social = await service.loadSocialDaten();
  const posts = social.inhalte.filter((i) => i.art !== 'story');
  const reichweiten = [820, 1240, 640, 1980, 910, 1460, 730, 2240, 1080, 560];
  const quoten = [0.031, 0.062, 0.018, 0.074, 0.028, 0.055, 0.015, 0.081, 0.039, 0.012];
  for (let i = 0; i < Math.min(posts.length, reichweiten.length); i++) {
    const reichweite = reichweiten[i];
    const gespeichert = Math.round(reichweite * quoten[i] * 0.7);
    await service.speichereWert({
      art: 'post',
      datum: addDays(heute, -(i * 2 + 1)),
      inhalt_id: posts[i].id,
      reichweite,
      speicherungen: gespeichert,
      geteilt: Math.round(reichweite * quoten[i] * 0.3),
      profilaufrufe: Math.round(reichweite * 0.04),
      link_klicks: Math.round(reichweite * 0.012),
      kommentare: i % 3,
      story_antworten: null,
      umfrage_antworten: null,
      neue_follower: null,
      follower_zielgruppe: null,
      sitzungen: null,
      formulare: null,
      erstgespraeche: null,
      angebote_wert_eur: null,
      notiz: '',
    });
  }
  const umzugsplan = posts.find((p) => p.kennung === 'K1');
  const datenleck = posts.find((p) => p.kennung === 'K2');
  if (umzugsplan) {
    await service.erfasseDm({
      datum: addDays(heute, -3), kanal: 'instagram', stichwort: 'UMZUG', inhalt_id: umzugsplan.id,
      name: 'shop.nordlicht', shop: 'nordlicht-outdoor.example', nachricht: 'Checkliste bitte. Wir sitzen auf Magento 2.4.4.',
      qualifiziert: true, beantwortet_von: 'Lugge', notiz: '',
    });
  }
  if (datenleck) {
    await service.erfasseDm({
      datum: addDays(heute, -6), kanal: 'instagram', stichwort: 'DATEN', inhalt_id: datenleck.id,
      name: 'kleinod.schmuck', shop: '', nachricht: 'Bei uns weicht GA4 um gut 20 % ab.',
      qualifiziert: false, beantwortet_von: 'Julian', notiz: '',
    });
  }

  seeding = false;
  // Client hub: links and news for the one client, a company-wide note and a fresh file in the client share.
  const link = (art: 'tool' | 'ressource', titel: string, url: string, beschreibung = '', angeheftet = false, sichtbar_kunde = false) =>
    service.saveKundenLink(alpenglanz.id, { art, titel, url, beschreibung, angeheftet, sichtbar_kunde });
  await link('tool', 'Shopify-Admin', 'https://admin.shopify.com/store/alpenglanz-demo', 'Live-Shop', true);
  await link('tool', 'Staging-Shop', 'https://alpenglanz-staging.example', 'Passwort im Passwortmanager', true);
  await link('tool', 'GA4', 'https://analytics.google.com/', 'Property „Alpenglanz Webshop“');
  await link('tool', 'Klaviyo', 'https://www.klaviyo.com/dashboard');
  await link('ressource', 'Brand-Guidelines', 'https://drive.google.com/drive/folders/demo-brand', 'Farben, Schriften, Bildsprache', true, true);
  await link('ressource', 'Relaunch-Briefing', 'https://docs.google.com/document/d/demo-briefing', '', false, true);
  const news = (titel: string, art: 'update' | 'meilenstein' | 'hinweis', tage: number, text = '', firmaId = alpenglanz.id, angeheftet = false) =>
    service.saveKundenNews({ firma_id: firmaId, art, titel, text, datum: addDays(heute, -tage), angeheftet, sichtbar_kunde: firmaId !== '' });
  await news('Go-live der neuen Produktseiten', 'meilenstein', 1, 'Alle 240 Produkte laufen auf dem neuen Template.', alpenglanz.id, true);
  await news('Klaviyo-Flows für Warenkorbabbruch überarbeitet', 'update', 4);
  await news('Black-Week-Freeze ab 24.11.: keine Deployments bis 02.12.', 'hinweis', 2, 'Gilt für alle Kundenshops.', '');
  const kundenordner = (await service.legeLeadOrdnerAn(alpenglanz.id, 'AGK', undefined, 'clients')).drive_ordner_id;
  const share = (await drive.listChildren(kundenordner)).find((f) => f.name === '07_Client-Share');
  if (share) drive.add('Reporting September.pdf', share.id, 'application/pdf');

  // To-dos: the internal board and the client board with a few cards in different columns.
  const intern = await service.boardFuer('');
  const kundenBoard = await service.boardFuer(alpenglanz.id);
  const karte = (boardId: string, spalte_id: string, titel: string, felder: Partial<{ zustaendig: string; faellig_am: string; labels: string; beschreibung: string; checkliste: string; sichtbar_kunde: boolean }> = {}) =>
    service.saveKarte(boardId, { titel, beschreibung: '', zustaendig: '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false, spalte_id, ...felder });
  await karte(kundenBoard.id, 'woche', 'Black-Week-Banner einbauen', { zustaendig: 'Johannes', faellig_am: addDays(heute, 1), labels: 'Theme, Black Week', sichtbar_kunde: true });
  await karte(kundenBoard.id, 'arbeit', 'Klaviyo: Browse-Abandonment-Flow', { zustaendig: 'Julian', labels: 'E-Mail', checkliste: JSON.stringify([{ text: 'Segment anlegen', erledigt: true }, { text: 'Mails texten', erledigt: false }, { text: 'Testversand', erledigt: false }]) });
  await karte(kundenBoard.id, 'wartet', 'Produktfotos Winterkollektion', { beschreibung: 'Kunde liefert bis Ende der Woche in 07_Client-Share.', faellig_am: addDays(heute, -1) });
  await karte(kundenBoard.id, 'backlog', 'Core Web Vitals der Kategorieseiten prüfen', { labels: 'Performance' });
  await karte(kundenBoard.id, 'erledigt', 'Neue Produktseiten live', { zustaendig: 'Johannes', sichtbar_kunde: true });
  await karte(intern.id, 'woche', 'Angebot Nordlicht nachfassen', { zustaendig: 'Lugge', faellig_am: heute, labels: 'Sales' });
  const slackApp = await karte(intern.id, 'backlog', 'Slack-App für den To-Do-Agenten anlegen', { zustaendig: 'Lugge', labels: 'Intern' });
  const hero = await karte(kundenBoard.id, 'wartet', 'Startseiten-Hero Winterkollektion', { zustaendig: 'Julian', labels: 'Design', beschreibung: 'Entwurf liegt in 07_Client-Share.', faellig_am: addDays(heute, 2) });
  await service.freigabeAnfragen(hero.id, hero.geaendert_am);
  // @-mentions from the demo user, so the bell has something to show once you pick who you are (To-dos → Meine).
  seeding = true;
  await service.kommentiereKarte(slackApp.id, '@Lugge die App braucht chat:write und users:read.email. @Julian schaust du dir die Benachrichtigungen an?');
  seeding = false;

  // Client portal: one login, the UTM generator and a roadmap.
  await service.setPortalZugang(alpenglanz.id, ak.id, true);
  await service.setPortalWerkzeug(alpenglanz.id, 'utm', true);
  const etappe = (titel: string, status: 'offen' | 'aktiv' | 'erledigt', tage: number | null) =>
    service.saveMeilenstein(alpenglanz.id, { titel, status, datum: tage === null ? '' : addDays(heute, tage) });
  await etappe('Migration', 'erledigt', -60);
  await etappe('Tracking', 'erledigt', -1);
  await etappe('Design & Inhalte', 'aktiv', 17);
  await etappe('Black Week', 'offen', 37);
  await etappe('Go-live Phase 2', 'offen', 45);

  // Monthly report: switched on, last month's draft waiting for the team's comment.
  await service.saveTracking(alpenglanz.id, { ga4_property: '', gsc_site: '', pagespeed_url: '', sichtbar_kunde: false, monatsbericht: true });
  const monat = berichtsMonat(new Date());
  const z = monatsZeitraum(monat);
  const tage = Number(z.bis.slice(8, 10));
  const verlauf = Array.from({ length: tage }, (_, i) => ({ tag: `${monat}-${String(i + 1).padStart(2, '0')}`, welle: 1 + 0.25 * Math.sin(i / 2.2) + (i % 7 === 5 ? -0.2 : 0) + i / 90 }));
  const store = new SheetStore(sheets);
  const [portal, todos] = await Promise.all([store.loadPortalDaten(), store.loadTodoDaten()]);
  const daten: BerichtDaten = {
    zahlen: {
      ga4: {
        nutzer: 9840, sitzungen: 13120, umsatz: 48210, transaktionen: 312, conversion_rate: 312 / 13120,
        vorher: { nutzer: 8910, sitzungen: 12030, umsatz: 41980, transaktionen: 268, conversion_rate: 268 / 12030 },
        zeitraum: z, waehrung: 'EUR',
        kanaele: [
          { name: 'Organic Search', sitzungen: 4980, umsatz: 17400 }, { name: 'Paid Social', sitzungen: 3120, umsatz: 11900 }, { name: 'Direct', sitzungen: 2210, umsatz: 9800 },
          { name: 'Email', sitzungen: 1490, umsatz: 6700 }, { name: 'Referral', sitzungen: 1320, umsatz: 2410 },
        ],
        verlauf: verlauf.map((v) => ({ tag: v.tag, sitzungen: Math.round(420 * v.welle), umsatz: Math.round(1550 * v.welle) })),
      },
      gsc: {
        klicks: 5210, impressionen: 184300, ctr: 5210 / 184300, position: 14.2,
        vorher: { klicks: 4620, impressionen: 171900, ctr: 4620 / 171900, position: 15.8 },
        zeitraum: z,
        suchanfragen: [
          { suchanfrage: 'naturkosmetik set', klicks: 410, impressionen: 9800, position: 3.4 }, { suchanfrage: 'alpenglanz', klicks: 380, impressionen: 1200, position: 1.1 },
          { suchanfrage: 'gesichtsöl bio', klicks: 205, impressionen: 12400, position: 8.7 },
        ],
        seiten: [{ seite: 'https://alpenglanz.example/', klicks: 1820, impressionen: 40100 }],
        verlauf: verlauf.map((v) => ({ tag: v.tag, klicks: Math.round(165 * v.welle), impressionen: Math.round(5900 * v.welle) })),
      },
      pagespeed: { url: 'https://alpenglanz.example/', mobil: { score: 64, lcp_ms: 3100, cls: 0.04, inp_ms: 210, quelle: 'feld' }, desktop: { score: 92, lcp_ms: 1400, cls: 0.01, inp_ms: 90, quelle: 'feld' } },
    },
    ...berichtInhalt({ firmaId: alpenglanz.id, monat, todos, portal }),
    stand_am: new Date().toISOString(),
  };
  if (daten.erledigt.length === 0) daten.erledigt = [{ titel: 'Neue Produktseiten live', datum: `${monat}-14` }, { titel: 'Tracking auf GA4 umgestellt', datum: `${monat}-22` }];
  if (daten.meilensteine.length === 0) daten.meilensteine = [{ titel: 'Migration', datum: `${monat}-09` }];
  const jetzt = new Date().toISOString();
  await store.insert('kunden_berichte', [
    { id: 'MB-DEMO1', firma_id: alpenglanz.id, monat, status: 'entwurf', kommentar: '', daten: JSON.stringify(daten), freigegeben_am: '', freigegeben_von: '', erstellt_am: jetzt, erstellt_von: 'kundenportal', geaendert_am: jetzt, geaendert_von: 'kundenportal' },
  ]);

  // Feedback from the portal: praise with a quote, one criticism (reported in Slack), one free comment.
  const meilensteine = (await store.loadPortalDaten()).meilensteine;
  const fertigeKarte = (await store.loadTodoDaten()).aufgaben.find((a) => a.titel === 'Neue Produktseiten live');
  const fb = (tage: number, felder: Partial<KundenFeedback>): KundenFeedback => {
    const zeit = new Date(Date.now() - tage * 86_400_000).toISOString();
    return { id: `FB-DEMO${tage}`, firma_id: alpenglanz.id, kontakt_id: '', von: 'jonas@alpenglanz.example', anlass: 'frei', bezug_id: '', bezug_titel: '', sterne: null, text: '', zitat_ok: false, gemeldet_am: '', erstellt_am: zeit, erstellt_von: 'jonas@alpenglanz.example', geaendert_am: zeit, geaendert_von: 'jonas@alpenglanz.example', ...felder };
  };
  const tracking = meilensteine.find((m) => m.titel === 'Tracking');
  await store.insert('kunden_feedback', [
    ...(tracking ? [fb(1, { anlass: 'meilenstein', bezug_id: tracking.id, bezug_titel: tracking.titel, sterne: 5, text: 'Super schnell umgesetzt, die Zahlen stimmen endlich. Danke!', zitat_ok: true })] : []),
    ...(fertigeKarte ? [fb(6, { anlass: 'karte', bezug_id: fertigeKarte.id, bezug_titel: fertigeKarte.titel, sterne: 3, text: 'Ergebnis gut, hat aber eine Woche länger gedauert als geplant.', gemeldet_am: new Date(Date.now() - 6 * 86_400_000).toISOString() })] : []),
    fb(12, { text: 'Könnt ihr im Monatsbericht auch die Newsletter-Zahlen zeigen?' }),
  ]);

  if (optionen.schaufenster) {
    // The client view of the public demo shows a released report: the month before, a little weaker.
    const vormonat = naechsterMonat(monat, -1);
    const vz = monatsZeitraum(vormonat);
    const ga4 = daten.zahlen.ga4!;
    const gsc = daten.zahlen.gsc!;
    const frueher: BerichtDaten = {
      ...daten,
      zahlen: {
        ...daten.zahlen,
        ga4: { ...ga4, ...ga4.vorher, vorher: { nutzer: 8120, sitzungen: 11240, umsatz: 37460, transaktionen: 241, conversion_rate: 241 / 11240 }, zeitraum: vz, verlauf: [] },
        gsc: { ...gsc, ...gsc.vorher, vorher: { klicks: 4180, impressionen: 160200, ctr: 4180 / 160200, position: 17.1 }, zeitraum: vz, verlauf: [] },
      },
      erledigt: [{ titel: 'Migration abgeschlossen', datum: `${vormonat}-24` }],
      meilensteine: [{ titel: 'Migration', datum: `${vormonat}-24` }],
    };
    const freigegeben = new Date(Date.now() - 20 * 86_400_000).toISOString();
    await store.insert('kunden_berichte', [
      {
        id: 'MB-DEMO0', firma_id: alpenglanz.id, monat: vormonat, status: 'freigegeben', daten: JSON.stringify(frueher),
        kommentar: 'Die Migration ist geschafft: Der Umsatz liegt über dem Vormonat, obwohl der Shop zwei Tage im Wartungsmodus war. Als Nächstes nehmen wir uns die mobile Ladezeit vor.',
        freigegeben_am: freigegeben, freigegeben_von: 'johannes@velonify.de', erstellt_am: freigegeben, erstellt_von: 'kundenportal', geaendert_am: freigegeben, geaendert_von: 'johannes@velonify.de',
      },
    ]);

    const als = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      const vorher = alsEmail;
      alsEmail = teamEmail(name);
      try {
        return await fn();
      } finally {
        alsEmail = vorher;
      }
    };
    await fuelleSchaufenster({ service, sheets, calendar, heute, als });
  }

  return { service, sheets, drive, calendar };
}
