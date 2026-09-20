import { CrmService } from '../crm';
import { EINSTELLUNG } from '../constants';
import { addDays, isoDate } from '../ids';
import { SheetStore } from '../sheets/sheetStore';
import { runSetup } from '../sheets/setup';
import { EMPTY_DEAL_INPUT, EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT } from '../types';
import { MemoryCalendar, MemoryDrive } from './memoryGoogle';
import { MemorySheets } from './memorySheets';

export interface DemoBackend {
  service: CrmService;
  sheets: MemorySheets;
}

/**
 * Builds demo mode: an in-memory sheet, drive and calendar driven by the real CrmService,
 * filled with invented companies on the reserved .example TLD. This repo is public – never real leads here.
 */
export async function createDemoBackend(currentUser: () => string): Promise<DemoBackend> {
  const sheets = new MemorySheets();
  await runSetup(sheets);

  const drive = new MemoryDrive();
  const shared = drive.add('Velonify', null);
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
  const calendar = new MemoryCalendar();
  const service = new CrmService({
    store: new SheetStore(sheets),
    drive,
    calendar,
    currentUser: () => (seeding ? 'demo@velonify.de' : currentUser()),
    // Calculation sheets live in memory too; their links lead nowhere.
    tabelle: () => new MemorySheets('Kalkulation (Demo)'),
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

  const nordlicht = await firma({ name: 'Nordlicht Outdoor GmbH', domain: 'nordlicht-outdoor.example', tier: 'A', score: 92, plattform: 'magento2', version: '2.4.6', eol: 'eol', ort: 'Hamburg', register: 'HRB 000001 (AG Hamburg)', email_allgemein: 'info@nordlicht-outdoor.example', telefon_allgemein: '040 000000', tech_info: 'ga4, meta_pixel, trustedshops · 812 Katalog-URLs', zustaendig: 'Lugge' });
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

  const alpenglanz = await firma({ name: 'Alpenglanz Kosmetik AG', domain: 'alpenglanz.example', kuerzel: 'AGK', status: 'kunde', plattform: 'shopify_plus', ort: 'Innsbruck', quelle: 'Empfehlung', zustaendig: 'Johannes', slack_channel: 'client-agk-general' });
  const ad = await deal(alpenglanz.id, { titel: 'Shopify-Plus-Relaunch', wert_eur: 65000, zustaendig: 'Johannes' });
  await phase(ad.id, 'gewonnen');
  await service.saveWiedervorlage({ firma_id: alpenglanz.id, deal_id: '', titel: 'Quartalsreport schicken', faellig_am: addDays(heute, -3), zustaendig: 'Johannes' });

  const feldmann = await firma({ name: 'Feldmann Werkzeuge', domain: 'feldmann-werkzeuge.example', tier: 'C', score: 38, plattform: 'magento2', version: '2.4.4', eol: 'eol', ort: 'Stuttgart' });
  const fd = await deal(feldmann.id, { wert_eur: 12000 });
  await phase(fd.id, 'verloren', 'Kein Budget');

  await firma({ name: 'Seeblick Heimtextil', domain: 'seeblick-heimtextil.example', tier: 'B', score: 58, plattform: 'magento2', version: '2.4.5', eol: 'eol', ort: 'Konstanz', zustaendig: 'Lugge' });

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

  // Two inquiries waiting in the inbox, as the Apps Script behind the website form would write them.
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

  // Team plant: Johannes has already watered today.
  await service.giesseMonstera('Johannes');

  seeding = false;
  return { service, sheets };
}
