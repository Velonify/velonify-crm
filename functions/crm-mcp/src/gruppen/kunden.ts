import { z } from 'zod';
import { kartenLink, kundenLink } from '../../../../src/data/erwaehnungen';
import { driveFolderUrl, isFolder, type DriveFile } from '../../../../src/data/google/drive';
import { addDays } from '../../../../src/data/ids';
import {
  CLIENT_SHARE_ORDNER,
  erledigtAlsTicker,
  hubWerkzeuge,
  kundenListe,
  LINK_ART_LABEL,
  linksVon,
  ordnerReiter,
  sortiereTicker,
  ticker,
  type TickerEintrag,
} from '../../../../src/data/kunden';
import {
  fahrplanStand,
  kannPortalZugang,
  KUNDEN_WERKZEUGE,
  MEILENSTEIN_STATUS_LABEL,
  meilensteineVon,
  portalSicht,
  werkzeugAktiv,
  zugangVon,
} from '../../../../src/data/portal';
import { kontaktName } from '../../../../src/data/rules';
import { boardVon, checklisteVon, faelligkeit, istErledigt, kuerzlichErledigt, neueSpaltenId, spaltenVon } from '../../../../src/data/todos';
import type { Aufgabe, AufgabeInput, ChecklistenPunkt, Database, Firma, KundenLink, Meilenstein, Spalte } from '../../../../src/data/types';
import { zustaendigWert } from '../../../../src/data/zustaendig';
import {
  antwort,
  boardLink,
  datum,
  fehler,
  finde,
  findeBoard,
  findeKarte,
  HUB,
  karteZeile,
  klein,
  kompakt,
  ohneUndefined,
  pruefeTeam,
  spalteZeile,
  type Werkzeugkasten,
} from '../hilfen';

/** Finished cards of the client board stay in the ticker for a week, as in the hub. */
const ERLEDIGT_TAGE = 7;
const PORTAL = 'https://kunden.velonify.de';

const kundeAngabe = z.string().min(1).describe('Firmenname, Kürzel, firma_id oder Slack-Channel mit # (z. B. "#client-agk-general")');
const boardAngabe = z.string().min(1).describe('"intern" für „Velonify intern“, sonst Firmenname, Kürzel, firma_id, board_id oder ein Slack-Channel mit #');

const kundeHub = (firmaId: string, bereich = '') => `${HUB}/#${kundenLink(firmaId)}${bereich ? `/${bereich}` : ''}`;
const karteHub = (k: Pick<Aufgabe, 'board_id' | 'id'>) => `${HUB}/#${kartenLink(k.board_id, k.id)}`;
const zeit = (wert: string) => wert.slice(0, 16).replace('T', ' ');

/** The client a name points to, like `kunden_news_anlegen`: never the internal board. */
function findeKunde(db: Database, angabe: string): Firma {
  const { firmaId } = findeBoard(db, [], angabe);
  if (!firmaId) throw new Error('„Velonify intern“ ist kein Kunde. Firmenname, Kürzel, firma_id oder den Slack-Channel des Kunden angeben.');
  return finde(db.firmen, firmaId, 'Firma');
}

const linkZeile = (l: KundenLink) =>
  kompakt({
    link_id: l.id,
    art: LINK_ART_LABEL[l.art],
    titel: l.titel,
    url: l.url,
    beschreibung: l.beschreibung,
    angeheftet: l.angeheftet || '',
    sichtbar_kunde: l.sichtbar_kunde || '',
    archiviert_am: l.archiviert ? l.geaendert_am.slice(0, 10) : '',
  });

const meilensteinZeile = (m: Meilenstein) =>
  kompakt({ meilenstein_id: m.id, titel: m.titel, datum: m.datum, status: m.status, stand: MEILENSTEIN_STATUS_LABEL[m.status], archiviert_am: m.archiviert ? m.geaendert_am.slice(0, 10) : '' });

const tickerZeile = (e: TickerEintrag) =>
  kompakt({
    news_id: e.news?.id,
    karte_id: e.art === 'erledigt' ? e.id.replace(/^karte-/, '') : undefined,
    datum: e.datum,
    art: e.art,
    titel: e.titel,
    text: e.text,
    url: e.url,
    angeheftet: e.angeheftet || '',
    alle_kunden: e.alleKunden || '',
    sichtbar_kunde: e.news?.sichtbar_kunde || '',
    archiviert_am: e.news?.archiviert ? e.news.geaendert_am.slice(0, 10) : '',
  });

const dateiZeile = (d: DriveFile) =>
  kompakt({
    name: d.name,
    art: isFolder(d) ? 'ordner' : 'datei',
    ordner_id: isFolder(d) ? d.id : undefined,
    geaendert: isFolder(d) || !d.modifiedTime ? undefined : zeit(d.modifiedTime),
    link: d.webViewLink ?? (isFolder(d) ? driveFolderUrl(d.id) : undefined),
  });

interface ChecklistenAenderung {
  checkliste?: { text: string; erledigt?: boolean }[];
  punkte_hinzufuegen?: string[];
  punkte_abhaken?: string[];
  punkte_oeffnen?: string[];
  punkte_entfernen?: string[];
}

/** Applies the checklist instructions of `karte_bearbeiten`; points are named by number (1 = first) or text. */
function neueCheckliste(alt: ChecklistenPunkt[], aenderung: ChecklistenAenderung): ChecklistenPunkt[] {
  let punkte = aenderung.checkliste ? aenderung.checkliste.map((p) => ({ text: p.text, erledigt: p.erledigt ?? false })) : alt.map((p) => ({ ...p }));
  const index = (angabe: string) => {
    const wert = angabe.trim();
    const nummer = /^\d+$/.test(wert) ? Number(wert) - 1 : -1;
    let i = nummer >= 0 && nummer < punkte.length ? nummer : punkte.findIndex((p) => klein(p.text) === klein(wert));
    if (i < 0) {
      const teil = punkte.flatMap((p, n) => (klein(p.text).includes(klein(wert)) ? [n] : []));
      if (teil.length > 1) throw new Error(`„${angabe}“ passt auf mehrere Checklistenpunkte. Nummer angeben (siehe \`karte_anzeigen\`).`);
      i = teil[0] ?? -1;
    }
    if (i < 0) throw new Error(`Checklistenpunkt „${angabe}“ gibt es nicht. Vorhanden: ${punkte.map((p, n) => `${n + 1}. ${p.text}`).join('; ') || 'keine'}.`);
    return i;
  };
  for (const angabe of aenderung.punkte_abhaken ?? []) punkte[index(angabe)].erledigt = true;
  for (const angabe of aenderung.punkte_oeffnen ?? []) punkte[index(angabe)].erledigt = false;
  const weg = new Set((aenderung.punkte_entfernen ?? []).map(index));
  punkte = punkte.filter((_, i) => !weg.has(i));
  for (const text of aenderung.punkte_hinzufuegen ?? []) punkte.push({ text, erledigt: false });
  return punkte;
}

export function registriereKunden(k: Werkzeugkasten): void {
  const { server, service, heute, sicher, lesen, schreiben } = k;

  // ─── Client-Hub ───────────────────────────────────────────────────────────

  server.registerTool(
    'kunden',
    {
      title: 'Kunden im Client-Hub',
      description:
        'Alle aktiven Kunden (Firmen mit Status „kunde“) wie die Kundenliste im Hub: Kürzel, Zuständigkeit, Zahl der Links, neueste Meldung, offene Karten, Shop, Slack-Channel und Kundenordner.',
      annotations: lesen,
    },
    sicher(async () => {
      const [db, kunden, todos] = await Promise.all([service.load(), service.loadKundenDaten(), service.loadTodoDaten()]);
      const tag = heute();
      const liste = kundenListe(db);
      return antwort({
        anzahl: liste.length,
        kunden: liste.map((f) => {
          const board = boardVon(todos.boards, f.id);
          const neueste = ticker(kunden.news, f.id, tag).find((e) => !e.alleKunden);
          return kompakt({
            firma_id: f.id,
            name: f.name,
            kuerzel: f.kuerzel,
            zustaendig: f.zustaendig,
            links: linksVon(kunden.links, f.id).length,
            neueste_meldung: neueste ? `${neueste.datum}: ${neueste.titel}` : '',
            offene_karten: board ? todos.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert && !istErledigt(a)).length : '',
            shop: f.domain,
            slack: f.slack_channel ? `#${f.slack_channel.replace(/^#/, '')}` : '',
            drive: f.drive_ordner_id ? driveFolderUrl(f.drive_ordner_id) : '',
            hub: kundeHub(f.id),
          });
        }),
        hub: `${HUB}/#/kunden`,
      });
    }),
  );

  server.registerTool(
    'kunde_anzeigen',
    {
      title: 'Kundenseite im Client-Hub',
      description:
        `Die Seite eines Kunden im Client-Hub: Steckbrief, Kontakte mit Portal-Zugang, News-Ticker (eigene und kundenübergreifende Meldungen, in den letzten ${ERLEDIGT_TAGE} Tagen erledigte Karten, neue Dateien in ${CLIENT_SHARE_ORDNER}), Tools & Ressourcen, Fahrplan (Meilensteine), Portal-Werkzeuge, was der Kunde im Portal sieht, To-do-Stand und Hub-Werkzeuge. ` +
        'Die IDs (link_id, news_id, meilenstein_id, kontakt_id) für die übrigen Kunden-Werkzeuge kommen von hier.',
      inputSchema: { kunde: kundeAngabe, archivierte_zeigen: z.boolean().optional().describe('Auch archivierte Links, Meldungen und entfernte Meilensteine') },
      annotations: lesen,
    },
    sicher(async ({ kunde, archivierte_zeigen }) => {
      const [db, kunden, todos, portal] = await Promise.all([service.load(), service.loadKundenDaten(), service.loadTodoDaten(), service.loadPortalDaten()]);
      const firma = findeKunde(db, kunde);
      const tag = heute();
      const archiv = archivierte_zeigen ?? false;

      // Files in the client share feed the ticker like in the hub; a Drive hiccup must not hide the rest of the page.
      let shareDateien: DriveFile[] = [];
      let driveHinweis = '';
      if (firma.drive_ordner_id) {
        try {
          const share = (await service.ordnerDateien(firma.drive_ordner_id)).find((f) => isFolder(f) && f.name === CLIENT_SHARE_ORDNER);
          shareDateien = share ? (await service.ordnerDateien(share.id)).filter((f) => !isFolder(f)) : [];
        } catch (err) {
          driveHinweis = `Kundenordner nicht lesbar, neue Dateien fehlen im Ticker: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      const board = boardVon(todos.boards, firma.id);
      const erledigt = board ? erledigtAlsTicker(kuerzlichErledigt(todos.aufgaben, board.id, addDays(tag, -ERLEDIGT_TAGE))) : [];
      const eintraege = sortiereTicker([...ticker(kunden.news, firma.id, tag, shareDateien, archiv), ...erledigt]);
      const offen = board ? todos.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert && !istErledigt(a)) : [];
      const meilensteine = meilensteineVon(portal.meilensteine, firma.id);
      const stand = fahrplanStand(meilensteine);
      const sicht = portalSicht(firma.id, board?.id, kunden, todos, portal);
      const links = linksVon(kunden.links, firma.id, archiv);

      return antwort({
        kunde: kompakt({
          firma_id: firma.id,
          name: firma.name,
          kuerzel: firma.kuerzel,
          status: firma.status,
          hinweis: firma.status === 'kunde' ? '' : 'Nicht als Kunde markiert: steht nicht in der Kundenliste, im Portal anmelden geht erst mit Status „kunde“.',
          zustaendig: firma.zustaendig,
          shop: firma.domain,
          slack: firma.slack_channel ? `#${firma.slack_channel.replace(/^#/, '')}` : '',
          drive: firma.drive_ordner_id ? driveFolderUrl(firma.drive_ordner_id) : '',
        }),
        kontakte: db.kontakte
          .filter((c) => c.firma_id === firma.id && !c.archiviert)
          .sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt))
          .map((c) => {
            const zugang = zugangVon(portal.zugaenge, c.id);
            return kompakt({
              kontakt_id: c.id,
              name: kontaktName(c),
              rolle: c.rolle,
              email: c.email,
              hauptkontakt: c.hauptkontakt || '',
              portal: zugang?.aktiv
                ? zugang.zuletzt_am
                  ? `Zugang, zuletzt angemeldet ${zeit(zugang.zuletzt_am)}`
                  : 'Zugang, noch nicht angemeldet'
                : kannPortalZugang(c)
                  ? 'kein Zugang'
                  : 'kein Zugang möglich (keine E-Mail-Adresse)',
            });
          }),
        ticker: eintraege.map(tickerZeile),
        tools: links.filter((l) => l.art === 'tool').map(linkZeile),
        ressourcen: links.filter((l) => l.art === 'ressource').map(linkZeile),
        fahrplan: kompakt({
          jetzt_dran: stand.aktuell?.titel ?? (meilensteine.length ? 'alle Etappen erledigt' : ''),
          ziel: stand.ziel ? `${stand.ziel.titel} am ${stand.ziel.datum}` : '',
          meilensteine: meilensteineVon(portal.meilensteine, firma.id, archiv).map(meilensteinZeile),
        }),
        portal_werkzeuge: KUNDEN_WERKZEUGE.map((w) =>
          kompakt({ werkzeug: w.id, titel: w.titel, aktiv: werkzeugAktiv(portal.werkzeuge, firma.id, w.id), noch_nicht_fertig: 'bald' in w ? true : '' }),
        ),
        kunde_sieht: {
          zugaenge: sicht.zugaenge,
          karten: board ? `${sicht.karten} von ${sicht.kartenGesamt}` : 'noch kein Board',
          freigaben_offen: sicht.freigabenOffen,
          news: sicht.news,
          links: sicht.links,
          meilensteine: sicht.meilensteine,
          werkzeuge: sicht.werkzeuge,
          dateien: firma.drive_ordner_id ? `Ordner ${CLIENT_SHARE_ORDNER}` : 'kein Kundenordner',
        },
        todos: board
          ? { board_id: board.id, offen: offen.length, ueberfaellig: offen.filter((a) => faelligkeit(a, tag) === 'ueberfaellig').length, hub: boardLink(board.id) }
          : 'noch kein Board; `karte_anlegen` legt es an',
        hub_werkzeuge: hubWerkzeuge(firma).map((w) => ({ titel: w.label, link: `${HUB}/#${w.pfad}` })),
        ...(driveHinweis ? { hinweis: driveHinweis } : {}),
        hub: kundeHub(firma.id),
      });
    }),
  );

  server.registerTool(
    'kunde_dateien',
    {
      title: 'Dateien im Kundenordner',
      description: `Inhalt des Drive-Kundenordners wie der Reiter „Dateien“ im Hub. Ohne ordner: die Unterordner (00_Account … ${CLIENT_SHARE_ORDNER}) und lose Dateien. Was in ${CLIENT_SHARE_ORDNER} liegt, sieht der Kunde im Portal.`,
      inputSchema: {
        kunde: kundeAngabe,
        ordner: z.string().optional().describe(`Pfad unterhalb des Kundenordners, z. B. "${CLIENT_SHARE_ORDNER}" oder "03_Creative/04_Final", oder eine ordner_id aus einer früheren Antwort`),
      },
      annotations: lesen,
    },
    sicher(async ({ kunde, ordner }) => {
      const firma = findeKunde(await service.load(), kunde);
      if (!firma.drive_ordner_id) return fehler(`${firma.name} hat noch keinen Kundenordner. In der CRM-Akte anlegen oder verlinken.`);
      const wurzel = await service.ordnerDateien(firma.drive_ordner_id);
      const teile = (ordner ?? '').split('/').map((t) => t.trim()).filter(Boolean);
      if (teile.length === 0) {
        return antwort({
          kunde: firma.name,
          ordner: ordnerReiter(wurzel, isFolder).map(dateiZeile),
          dateien: wurzel.filter((f) => !isFolder(f)).map(dateiZeile),
          link: driveFolderUrl(firma.drive_ordner_id),
          hub: kundeHub(firma.id, 'dateien'),
        });
      }
      // A single segment that is no subfolder name may be a folder id from an earlier answer (also deeper down).
      if (teile.length === 1 && !wurzel.some((f) => isFolder(f) && (f.id === teile[0] || klein(f.name) === klein(teile[0])))) {
        const ordnerNachId = await service.getDriveOrdner(teile[0]).catch(() => null);
        if (ordnerNachId && isFolder(ordnerNachId)) {
          const inhalt = await service.ordnerDateien(ordnerNachId.id);
          return antwort({ kunde: firma.name, ordner: ordnerNachId.name, inhalt: inhalt.map(dateiZeile), link: driveFolderUrl(ordnerNachId.id) });
        }
      }
      let inhalt = wurzel;
      let aktuell: DriveFile | undefined;
      for (const teil of teile) {
        const treffer = inhalt.find((f) => isFolder(f) && (f.id === teil || klein(f.name) === klein(teil)));
        if (!treffer) {
          const moeglich = inhalt.filter(isFolder).map((f) => f.name);
          return fehler(`Ordner „${teil}“ gibt es hier nicht. Möglich: ${moeglich.join(', ') || 'keine Unterordner'}.`);
        }
        aktuell = treffer;
        inhalt = await service.ordnerDateien(treffer.id);
      }
      return antwort({
        kunde: firma.name,
        ordner: teile.join('/'),
        ...(aktuell?.name === CLIENT_SHARE_ORDNER ? { hinweis: 'Was hier liegt, sieht der Kunde im Portal.' } : {}),
        inhalt: inhalt.map(dateiZeile),
        link: aktuell ? driveFolderUrl(aktuell.id) : undefined,
      });
    }),
  );

  server.registerTool(
    'kunden_link_speichern',
    {
      title: 'Kunden-Link anlegen oder ändern',
      description:
        'Legt unter „Tools & Ressourcen“ eines Kunden einen Link an (ohne link_id: kunde, art, titel, url nötig) oder ändert einen (mit link_id; nur angegebene Felder ändern sich). Tools sind z. B. Shopify-Admin, GA4, Staging, Ressourcen Briefings, Brand-Guidelines. ' +
        'Nie Passwörter oder Zugangsdaten eintragen. Für den Kunden im Portal sichtbar nur mit sichtbar_kunde: true – vorher nachfragen.',
      inputSchema: {
        link_id: z.string().optional().describe('KL-… aus `kunde_anzeigen`; leer = neuer Link'),
        kunde: z.string().optional().describe('Nur für neue Links: Firmenname, Kürzel, firma_id oder Slack-Channel mit #'),
        art: z.enum(['tool', 'ressource']).optional(),
        titel: z.string().optional(),
        url: z.string().optional().describe('https://…'),
        beschreibung: z.string().optional().describe('Eine Zeile'),
        angeheftet: z.boolean().optional().describe('In der Übersicht des Kunden anheften'),
        sichtbar_kunde: z.boolean().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ link_id, kunde, ...felder }) => {
      if (link_id) {
        const alt = finde((await service.loadKundenDaten()).links, link_id, 'Link', 'kunde_anzeigen');
        const link = await service.saveKundenLink(
          alt.firma_id,
          { art: alt.art, titel: alt.titel, url: alt.url, beschreibung: alt.beschreibung, angeheftet: alt.angeheftet, sichtbar_kunde: alt.sichtbar_kunde, ...ohneUndefined(felder) },
          { id: alt.id, expectedGeaendertAm: alt.geaendert_am },
        );
        return antwort({ gespeichert: true, link: linkZeile(link), hub: kundeHub(link.firma_id, 'tools') });
      }
      if (!kunde) return fehler('Für einen neuen Link den kunde angeben (oder link_id zum Ändern).');
      if (!felder.art) return fehler('Für einen neuen Link art angeben: "tool" oder "ressource".');
      const firma = findeKunde(await service.load(), kunde);
      const link = await service.saveKundenLink(firma.id, {
        art: felder.art,
        titel: felder.titel ?? '',
        url: felder.url ?? '',
        beschreibung: felder.beschreibung ?? '',
        angeheftet: felder.angeheftet ?? false,
        sichtbar_kunde: felder.sichtbar_kunde ?? false,
      });
      return antwort({ angelegt: true, kunde: firma.name, link: linkZeile(link), hub: kundeHub(firma.id, 'tools') });
    }),
  );

  server.registerTool(
    'kunden_news_aendern',
    {
      title: 'Kunden-News ändern',
      description:
        'Ändert eine Meldung im News-Ticker (news_id aus `kunde_anzeigen`): Überschrift, Text, Art, Datum, anheften (steht dann vorne im Ticker) oder einem anderen Kunden bzw. "alle" zuordnen. Nur angegebene Felder ändern sich. ' +
        'Neue Meldungen mit `kunden_news_anlegen`, ausblenden mit `kunden_eintrag_archivieren`. sichtbar_kunde: true zeigt sie im Kundenportal – vorher nachfragen.',
      inputSchema: {
        news_id: z.string().min(1),
        titel: z.string().max(140).optional(),
        text: z.string().optional(),
        art: z.enum(['update', 'meilenstein', 'hinweis']).optional(),
        datum: datum.optional(),
        angeheftet: z.boolean().optional(),
        sichtbar_kunde: z.boolean().optional(),
        kunde: z.string().optional().describe('Anderer Kunde (Firmenname, Kürzel, firma_id, #Channel) oder "alle"'),
      },
      annotations: schreiben,
    },
    sicher(async ({ news_id, kunde, ...felder }) => {
      const [db, { news }] = await Promise.all([service.load(), service.loadKundenDaten()]);
      const alt = finde(news, news_id, 'Meldung', 'kunde_anzeigen');
      const firmaId = kunde === undefined ? alt.firma_id : klein(kunde) === 'alle' ? '' : findeKunde(db, kunde).id;
      // A visible message moved to another client (or to all) must not show up there unasked.
      const sichtbar = firmaId !== alt.firma_id ? false : alt.sichtbar_kunde;
      const neu = await service.saveKundenNews(
        { firma_id: firmaId, art: alt.art, titel: alt.titel, text: alt.text, datum: alt.datum, angeheftet: alt.angeheftet, sichtbar_kunde: sichtbar, ...ohneUndefined(felder) },
        { id: alt.id, expectedGeaendertAm: alt.geaendert_am },
      );
      const firma = db.firmen.find((f) => f.id === neu.firma_id);
      return antwort({
        gespeichert: true,
        kunde: firma?.name ?? 'alle Kunden',
        meldung: kompakt({ news_id: neu.id, datum: neu.datum, art: neu.art, titel: neu.titel, text: neu.text, angeheftet: neu.angeheftet || '', sichtbar_kunde: neu.sichtbar_kunde }),
        hub: firma ? kundeHub(firma.id, 'news') : `${HUB}/#/kunden`,
      });
    }),
  );

  server.registerTool(
    'meilenstein_speichern',
    {
      title: 'Meilenstein im Fahrplan anlegen oder ändern',
      description:
        'Etappen des Kunden-Fahrplans (z. B. Migration, Design & Inhalte, Go-live), die der Kunde im Portal als Fortschritt sieht. Ohne meilenstein_id neu anlegen (kunde und titel nötig, landet hinten), mit meilenstein_id ändern (nur angegebene Felder). ' +
        'Status: offen = geplant, aktiv = jetzt dran, erledigt. Für Kunden mit Portal-Zugang sofort sichtbar.',
      inputSchema: {
        meilenstein_id: z.string().optional().describe('KM-… aus `kunde_anzeigen`; leer = neue Etappe'),
        kunde: z.string().optional().describe('Nur für neue Etappen: Firmenname, Kürzel, firma_id oder Slack-Channel mit #'),
        titel: z.string().max(60).optional().describe('Kurz, so sieht es der Kunde'),
        datum: z.union([datum, z.literal('')]).optional().describe('Ende der Etappe; "" = ohne Datum'),
        status: z.enum(['offen', 'aktiv', 'erledigt']).optional().describe('Standard für neue: offen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ meilenstein_id, kunde, ...felder }) => {
      if (meilenstein_id) {
        const alt = finde((await service.loadPortalDaten()).meilensteine, meilenstein_id, 'Meilenstein', 'kunde_anzeigen');
        const neu = await service.saveMeilenstein(alt.firma_id, { titel: alt.titel, datum: alt.datum, status: alt.status, ...ohneUndefined(felder) }, { id: alt.id, expectedGeaendertAm: alt.geaendert_am });
        return antwort({ gespeichert: true, meilenstein: meilensteinZeile(neu), hub: kundeHub(neu.firma_id, 'portal') });
      }
      if (!kunde) return fehler('Für eine neue Etappe den kunde angeben (oder meilenstein_id zum Ändern).');
      const firma = findeKunde(await service.load(), kunde);
      const neu = await service.saveMeilenstein(firma.id, { titel: felder.titel ?? '', datum: felder.datum ?? '', status: felder.status ?? 'offen' });
      return antwort({ angelegt: true, kunde: firma.name, meilenstein: meilensteinZeile(neu), hub: kundeHub(firma.id, 'portal') });
    }),
  );

  server.registerTool(
    'kunden_eintrag_archivieren',
    {
      title: 'Kunden-Link, -News oder Meilenstein archivieren',
      description:
        'Nimmt einen Link (KL-…), eine Meldung (KN-…) oder einen Meilenstein (KM-…) aus dem Client-Hub und dem Kundenportal. Nichts wird gelöscht; mit archiviert: false wiederherstellen. Vorher nachfragen.',
      inputSchema: { id: z.string().min(1).describe('link_id, news_id oder meilenstein_id aus `kunde_anzeigen`'), archiviert: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ id, archiviert }) => {
      const ziel = archiviert ?? true;
      const [{ links, news }, { meilensteine }] = await Promise.all([service.loadKundenDaten(), service.loadPortalDaten()]);
      const link = links.find((l) => l.id === id);
      if (link) {
        const neu = await service.setKundenLinkArchiviert(id, ziel, link.geaendert_am);
        return antwort({ art: 'link', titel: neu.titel, archiviert: neu.archiviert, hub: kundeHub(neu.firma_id, 'tools') });
      }
      const meldung = news.find((n) => n.id === id);
      if (meldung) {
        const neu = await service.setKundenNewsArchiviert(id, ziel, meldung.geaendert_am);
        return antwort({ art: 'news', titel: neu.titel, archiviert: neu.archiviert, hub: neu.firma_id ? kundeHub(neu.firma_id, 'news') : `${HUB}/#/kunden` });
      }
      const etappe = meilensteine.find((m) => m.id === id);
      if (etappe) {
        const neu = await service.setMeilensteinArchiviert(id, ziel, etappe.geaendert_am);
        return antwort({ art: 'meilenstein', titel: neu.titel, archiviert: neu.archiviert, hub: kundeHub(neu.firma_id, 'portal') });
      }
      return fehler(`„${id}“ ist weder Link, Meldung noch Meilenstein. IDs über \`kunde_anzeigen\` holen.`);
    }),
  );

  server.registerTool(
    'kunden_eintrag_verschieben',
    {
      title: 'Kunden-Link oder Meilenstein umsortieren',
      description: 'Schiebt einen Link (KL-…) innerhalb seiner Liste (Tools bzw. Ressourcen) oder einen Meilenstein (KM-…) im Fahrplan um eine Stelle nach oben/vorne oder unten/hinten, wie die Pfeile im Hub.',
      inputSchema: { id: z.string().min(1).describe('link_id oder meilenstein_id aus `kunde_anzeigen`'), richtung: z.enum(['hoch', 'runter']).describe('hoch = nach oben bzw. früher im Fahrplan') },
      annotations: schreiben,
    },
    sicher(async ({ id, richtung }) => {
      const schritt = richtung === 'hoch' ? -1 : 1;
      const [{ links }, { meilensteine }] = await Promise.all([service.loadKundenDaten(), service.loadPortalDaten()]);

      const link = links.find((l) => l.id === id);
      if (link) {
        if (link.archiviert) return fehler(`„${link.titel}“ ist archiviert und hat keinen Platz in der Liste.`);
        // The service swaps within all links of the client, the hub shows them per kind: move until the neighbour of the same kind is passed.
        const reihe = (alle: readonly KundenLink[]) => linksVon(alle, link.firma_id).filter((l) => l.art === link.art).map((l) => l.id);
        const ziel = reihe(links).indexOf(id) + schritt;
        if (ziel < 0 || ziel >= reihe(links).length) return fehler(`„${link.titel}“ steht schon ganz ${schritt < 0 ? 'oben' : 'unten'}.`);
        let jetzt = links;
        for (let runde = 0; runde < 100 && reihe(jetzt).indexOf(id) !== ziel; runde++) {
          await service.verschiebeKundenLink(id, schritt);
          jetzt = (await service.loadKundenDaten()).links;
        }
        const liste = linksVon(jetzt, link.firma_id).filter((l) => l.art === link.art);
        return antwort({ verschoben: true, art: LINK_ART_LABEL[link.art], reihenfolge: liste.map((l) => l.titel), hub: kundeHub(link.firma_id, 'tools') });
      }

      const etappe = meilensteine.find((m) => m.id === id);
      if (etappe) {
        if (etappe.archiviert) return fehler(`„${etappe.titel}“ ist aus dem Fahrplan genommen.`);
        const reihe = meilensteineVon(meilensteine, etappe.firma_id);
        const ziel = reihe.findIndex((m) => m.id === id) + schritt;
        if (ziel < 0 || ziel >= reihe.length) return fehler(`„${etappe.titel}“ steht schon ganz ${schritt < 0 ? 'vorne' : 'hinten'}.`);
        await service.verschiebeMeilenstein(id, schritt);
        const neu = meilensteineVon((await service.loadPortalDaten()).meilensteine, etappe.firma_id);
        return antwort({ verschoben: true, fahrplan: neu.map((m) => m.titel), hub: kundeHub(etappe.firma_id, 'portal') });
      }
      return fehler(`„${id}“ ist weder Link noch Meilenstein. IDs über \`kunde_anzeigen\` holen.`);
    }),
  );

  // ─── Kundenportal ─────────────────────────────────────────────────────────

  server.registerTool(
    'portal_zugang',
    {
      title: 'Kundenportal-Zugang an/aus',
      description:
        `Schaltet den Zugang eines Kontakts zum Kundenportal (${PORTAL}) an oder aus, wie der Schalter im Reiter „Portal“. Dabei wird keine Mail verschickt: Der Kontakt gibt im Portal selbst seine E-Mail-Adresse ein und bekommt dann einen Anmeldelink. ` +
        'Mit Zugang sieht er alles, was für den Kunden sichtbar ist (Karten, News, Links, Fahrplan, Werkzeuge, 07_Client-Share). Braucht eine E-Mail-Adresse am Kontakt; anmelden geht nur, solange die Firma Status „kunde“ hat. Wirkt nach außen – vorher nachfragen.',
      inputSchema: { kontakt_id: z.string().min(1).describe('Aus `kunde_anzeigen` (kontakte)'), aktiv: z.boolean() },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ kontakt_id, aktiv }) => {
      const db = await service.load();
      const kontakt = finde(db.kontakte, kontakt_id, 'Kontakt', 'kunde_anzeigen');
      const firma = finde(db.firmen, kontakt.firma_id, 'Firma');
      const zugang = await service.setPortalZugang(firma.id, kontakt.id, aktiv);
      const hinweis = zugang.aktiv
        ? `Keine Mail verschickt. Anmelden unter ${PORTAL} mit ${kontakt.email.trim()}, der Link kommt dann per Mail.${firma.status === 'kunde' ? '' : ' Achtung: Die Firma hat nicht den Status „kunde“, die Anmeldung klappt erst danach.'}`
        : 'Gesperrt; eine laufende Sitzung endet bei der nächsten Anfrage.';
      return antwort({ kontakt: kontaktName(kontakt), email: kontakt.email, kunde: firma.name, portal_zugang: zugang.aktiv, hinweis, hub: kundeHub(firma.id, 'portal') });
    }),
  );

  server.registerTool(
    'portal_werkzeug',
    {
      title: 'Portal-Werkzeug an/aus',
      description: `Schaltet ein Werkzeug für einen Kunden im Kundenportal frei oder aus. Möglich: ${KUNDEN_WERKZEUGE.map((w) => `"${w.id}" (${w.titel}${'bald' in w ? ', noch nicht fertig' : ''})`).join(', ')}. Der Kunde sieht es sofort – vorher nachfragen.`,
      inputSchema: { kunde: kundeAngabe, werkzeug: z.enum(KUNDEN_WERKZEUGE.map((w) => w.id) as [string, ...string[]]), aktiv: z.boolean() },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ kunde, werkzeug, aktiv }) => {
      const firma = findeKunde(await service.load(), kunde);
      const eintrag = await service.setPortalWerkzeug(firma.id, werkzeug, aktiv);
      return antwort({ kunde: firma.name, werkzeug: KUNDEN_WERKZEUGE.find((w) => w.id === werkzeug)?.titel ?? werkzeug, aktiv: eintrag.aktiv, hub: kundeHub(firma.id, 'portal') });
    }),
  );

  // ─── To-dos ───────────────────────────────────────────────────────────────

  server.registerTool(
    'karte_anzeigen',
    {
      title: 'To-do-Karte mit Kommentaren',
      description: 'Eine Karte mit allen Details: Spalte, nummerierte Checkliste, Freigabe, Quelle und alle Kommentare (`karten` zeigt nur deren Anzahl). Auch archivierte Karten.',
      inputSchema: { karte_id: z.string().min(1) },
      annotations: lesen,
    },
    sicher(async ({ karte_id }) => {
      const daten = await service.loadTodoDaten();
      const karte = finde(daten.aufgaben, karte_id, 'Karte', 'karten');
      const board = daten.boards.find((b) => b.id === karte.board_id);
      const kommentare = daten.kommentare.filter((c) => c.aufgabe_id === karte.id).sort((a, b) => a.datum.localeCompare(b.datum));
      const { kommentare: _anzahl, ...zeile } = karteZeile(karte, board, daten, heute());
      return antwort({
        karte: {
          ...zeile,
          ...kompakt({
            board_id: karte.board_id,
            spalte_id: karte.spalte_id,
            checkliste: checklisteVon(karte).map((p, i) => `${i + 1}. ${p.erledigt ? '[x]' : '[ ]'} ${p.text}`),
            freigabe_am: karte.freigabe_am.slice(0, 10),
            quelle: karte.quelle,
            erstellt_am: karte.erstellt_am.slice(0, 10),
            erstellt_von: karte.erstellt_von,
            geaendert_am: zeit(karte.geaendert_am),
            archiviert_am: karte.archiviert ? karte.geaendert_am.slice(0, 10) : '',
          }),
        },
        kommentare: kommentare.map((c) => ({ kommentar_id: c.id, von: c.von, datum: zeit(c.datum), text: c.text })),
        hub: karteHub(karte),
      });
    }),
  );

  server.registerTool(
    'karte_bearbeiten',
    {
      title: 'To-do-Karte bearbeiten',
      description:
        'Ändert eine Karte wie der Karten-Dialog im Hub; nur angegebene Felder ändern sich. Checkliste: Punkte hinzufügen, abhaken, wieder öffnen oder entfernen (per Nummer aus `karte_anzeigen` oder Text) oder mit checkliste die ganze Liste ersetzen. ' +
        'Spalte wechseln mit `karte_verschieben`, erledigen mit `karte_erledigt`. sichtbar_kunde nur setzen, wenn ausdrücklich gewünscht (zeigt die Karte im Kundenportal); false zieht eine offene Freigabe-Anfrage zurück. „@Name“ in der Beschreibung markiert Teammitglieder.',
      inputSchema: {
        karte_id: z.string().min(1),
        titel: z.string().min(1).max(200).optional(),
        beschreibung: z.string().optional(),
        zustaendig: z.array(z.string()).optional().describe('Vornamen aus dem Team; [] = niemand'),
        faellig_am: z.union([datum, z.literal('')]).optional().describe('"" = ohne Fälligkeit'),
        labels: z.array(z.string()).optional().describe('Ersetzt die Labels; [] = keine'),
        checkliste: z.array(z.object({ text: z.string().min(1), erledigt: z.boolean().optional() })).optional().describe('Ersetzt die ganze Checkliste'),
        punkte_hinzufuegen: z.array(z.string().min(1)).optional(),
        punkte_abhaken: z.array(z.string()).optional().describe('Nummer (1 = erster Punkt) oder Text'),
        punkte_oeffnen: z.array(z.string()).optional().describe('Nummer oder Text'),
        punkte_entfernen: z.array(z.string()).optional().describe('Nummer oder Text'),
        sichtbar_kunde: z.boolean().optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ karte_id, titel, beschreibung, zustaendig, faellig_am, labels, sichtbar_kunde, ...liste }) => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const { karte, board } = findeKarte(daten, karte_id);
      if (sichtbar_kunde && !board.firma_id) return fehler('Karten auf „Velonify intern“ sind nie für Kunden sichtbar.');
      const wer = zustaendig ? zustaendigWert(zustaendig) : karte.zustaendig;
      if (zustaendig) pruefeTeam(db, wer);
      const checklisteNeu = Object.values(liste).some((v) => v !== undefined);
      const eingabe: AufgabeInput = {
        titel: titel ?? karte.titel,
        beschreibung: beschreibung ?? karte.beschreibung,
        zustaendig: wer,
        faellig_am: faellig_am ?? karte.faellig_am,
        labels: labels ? labels.join(',') : karte.labels,
        checkliste: checklisteNeu ? JSON.stringify(neueCheckliste(checklisteVon(karte), liste)) : karte.checkliste,
        sichtbar_kunde: sichtbar_kunde ?? karte.sichtbar_kunde,
        spalte_id: karte.spalte_id,
      };
      const neu = await service.saveKarte(board.id, eingabe, { id: karte.id, expectedGeaendertAm: karte.geaendert_am });
      return antwort({ gespeichert: true, karte: karteZeile(neu, board, await service.loadTodoDaten(), heute()), hub: karteHub(neu) });
    }),
  );

  server.registerTool(
    'karte_archivieren',
    {
      title: 'To-do-Karte archivieren',
      description: 'Nimmt eine Karte vom Board (und aus dem Kundenportal). Sie bleibt im Sheet; mit archiviert: false wiederherstellen. Für Erledigtes lieber `karte_erledigt`. Vorher nachfragen.',
      inputSchema: { karte_id: z.string().min(1), archiviert: z.boolean().optional().describe('Standard true') },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ karte_id, archiviert }) => {
      const daten = await service.loadTodoDaten();
      const karte = finde(daten.aufgaben, karte_id, 'Karte', 'karten');
      const neu = await service.setKarteArchiviert(karte.id, archiviert ?? true, karte.geaendert_am);
      const board = daten.boards.find((b) => b.id === neu.board_id);
      return antwort({ karte: neu.titel, board: board?.titel, archiviert: neu.archiviert, hub: boardLink(neu.board_id) });
    }),
  );

  server.registerTool(
    'board_bearbeiten',
    {
      title: 'To-do-Board bearbeiten',
      description:
        'Benennt ein Board um und/oder legt seine Spalten neu fest, wie „Board bearbeiten“ im Hub. spalten ist die vollständige neue Liste in Reihenfolge: vorhandene Spalten über spalte (ID oder Name) ansprechen und ggf. mit titel umbenennen, neue nur mit titel. ' +
        'Nicht aufgeführte Spalten werden entfernt; ihre Karten wandern in die erste Spalte, nichts geht verloren – Entfernen vorher nachfragen. Höchstens eine Spalte ist „Erledigt“: Karten darin gelten als erledigt, beim Wechsel wird das Erledigt-Datum gesetzt bzw. gelöscht. Aktuelle Spalten über `boards`.',
      inputSchema: {
        board: boardAngabe,
        titel: z.string().min(1).optional().describe('Neuer Name des Boards'),
        spalten: z
          .array(
            z.object({
              spalte: z.string().optional().describe('ID oder Name einer vorhandenen Spalte; leer = neue Spalte'),
              titel: z.string().optional().describe('Neuer Name; Pflicht für neue Spalten'),
              erledigt: z.boolean().optional().describe('true = diese ist die Erledigt-Spalte (die bisherige verliert die Markierung); false = nicht mehr Erledigt-Spalte'),
            }),
          )
          .min(1)
          .optional(),
      },
      annotations: schreiben,
    },
    sicher(async ({ board: angabe, titel, spalten: eingabe }) => {
      const [db, daten] = await Promise.all([service.load(), service.loadTodoDaten()]);
      const { board } = findeBoard(db, daten.boards, angabe);
      if (!board) return fehler('Für diese Firma gibt es noch kein Board; `karte_anlegen` legt es an.');
      if (!titel && !eingabe) return fehler('titel oder spalten angeben.');
      const alt = spaltenVon(board);

      let neu: Spalte[] = alt;
      if (eingabe) {
        if (eingabe.filter((e) => e.erledigt === true).length > 1) return fehler('Nur eine Spalte kann „Erledigt“ sein.');
        const markiert = eingabe.findIndex((e) => e.erledigt === true);
        neu = [];
        for (const [i, e] of eingabe.entries()) {
          const wert = e.spalte?.trim() ?? '';
          const vorhanden = wert ? (alt.find((s) => s.id === wert) ?? alt.find((s) => klein(s.titel) === klein(wert))) : undefined;
          if (wert && !vorhanden) return fehler(`Spalte „${wert}“ gibt es auf „${board.titel}“ nicht. Möglich: ${alt.map((s) => s.titel).join(', ')}. Neue Spalten nur mit titel angeben.`);
          if (vorhanden && neu.some((s) => s.id === vorhanden.id)) return fehler(`Spalte „${vorhanden.titel}“ ist doppelt aufgeführt.`);
          if (!vorhanden && !e.titel?.trim()) return fehler('Neue Spalten brauchen einen titel.');
          // Like the radio button in the hub: marking one column as done takes the mark from the others.
          const erledigt = markiert >= 0 ? i === markiert : e.erledigt === false ? false : Boolean(vorhanden?.erledigt);
          neu.push({
            id: vorhanden ? vorhanden.id : neueSpaltenId(e.titel!.trim(), [...alt, ...neu]),
            titel: e.titel?.trim() || vorhanden!.titel,
            ...(erledigt ? { erledigt: true } : {}),
          });
        }
      }

      const entfernt = alt.filter((s) => !neu.some((n) => n.id === s.id));
      const verschoben = daten.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert && entfernt.some((s) => s.id === a.spalte_id)).length;
      const gespeichert = await service.saveBoard(board.id, titel ?? board.titel, neu, board.geaendert_am);
      return antwort({
        gespeichert: true,
        board: gespeichert.titel,
        board_id: gespeichert.id,
        spalten: spaltenVon(gespeichert).map(spalteZeile),
        ...(entfernt.length ? { entfernt: entfernt.map((s) => s.titel), karten_verschoben: verschoben ? `${verschoben} nach „${neu[0].titel}“` : 0 } : {}),
        hub: boardLink(gespeichert.id),
      });
    }),
  );
}
