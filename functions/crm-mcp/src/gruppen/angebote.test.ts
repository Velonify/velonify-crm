import { beforeEach, describe, expect, it } from 'vitest';
import { baueAuditAnfrage } from '../../../../src/data/audit';
import { DemoShopAudit } from '../../../../src/data/shopAudit';
import { demoDienste, verbinde, type Verbunden } from '../testhilfe';

let v: Verbunden;
const jahr = new Date().getFullYear();

const firmaId = async (name: string) => (await v.service.load()).firmen.find((f) => f.name.startsWith(name))!.id;
const katalog = async () => (await v.rufe('leistungskatalog')).daten.kategorien;
const outreach = async () => (await v.rufe('outreach_leistungen')).daten.leistungen as { leistung_id: string; titel: string }[];

describe('Angebots-Rechner und Contact Generator', () => {
  beforeEach(async () => {
    v = await verbinde();
  });

  it('bietet alle Werkzeuge an, lesende als readOnly markiert', async () => {
    const { tools } = await v.client.listTools();
    const namen = tools.map((t) => t.name);
    expect(namen).toEqual(
      expect.arrayContaining([
        'angebote', 'angebot_anzeigen', 'leistungskatalog', 'angebot_speichern', 'kalkulation_anlegen', 'angebot_archivieren',
        'katalog_kategorie_speichern', 'katalog_leistung_speichern', 'katalog_archivieren', 'katalog_verschieben', 'startkatalog_uebernehmen',
        'outreach_leistungen', 'outreach_leistung_speichern', 'outreach_leistung_archivieren', 'outreach_startliste_uebernehmen',
        'anschreiben_erzeugen', 'anschreiben_gesendet', 'anschreiben_liste', 'anschreiben_status', 'signatur_speichern',
      ]),
    );
    const annot = (name: string) => tools.find((t) => t.name === name)?.annotations;
    expect(annot('leistungskatalog')?.readOnlyHint).toBe(true);
    expect(annot('anschreiben_erzeugen')?.readOnlyHint).toBe(true);
    expect(annot('anschreiben_erzeugen')?.openWorldHint).toBe(true);
    expect(annot('angebot_speichern')?.readOnlyHint).toBe(false);
    expect(annot('anschreiben_gesendet')?.readOnlyHint).toBe(false);
  });

  it('liest den Leistungskatalog zweisprachig und übernimmt den Startkatalog nur in einen leeren', async () => {
    const kategorien = await katalog();
    expect(kategorien.length).toBeGreaterThan(2);
    expect(kategorien[0].kategorie_id).toBeTruthy();
    expect(kategorien[0].titel_de).toBeTruthy();
    expect(kategorien[0].titel_en).toBeTruthy();
    expect(kategorien[0].leistungen[0].leistung_id).toBeTruthy();

    const start = await v.rufe('startkatalog_uebernehmen');
    expect(start.fehler).toBe(true);
    expect(start.text).toContain('schon Hauptkategorien');
  });

  it('legt ein Angebot an wie der Hub: Nummer, Deal, Titel und Auswahl aus Katalog und manuellen Posten', async () => {
    const [erste, zweite] = await katalog();
    const id = await firmaId('Bergwerk');
    const { fehler, daten } = await v.rufe('angebot_speichern', {
      firma_id: id,
      kategorien_waehlen: [erste.kategorie_id],
      leistungen_waehlen: [zweite.leistungen[0].leistung_id],
      manuell: [{ titel: 'Migration Blog-Artikel', neue_kategorie: 'Extras', abrechnung: 'monatlich' }],
    });
    expect(fehler).toBe(false);
    const a = daten.angebot;
    expect(daten.neu).toBe(true);
    expect(a.nummer).toBe(`${jahr}/01`);
    expect(a.status).toBe('Entwurf');
    expect(a.titel).toBe('Shopify-Migration');
    expect(a.deal_id).toBeTruthy();
    expect(a.hub).toBe(`https://crm.velonify.de/#/angebote/${a.angebot_id}`);
    expect(a.leistungen).toBe(erste.leistungen.length + 2);
    expect(a.auswahl.map((k: { titel: string }) => k.titel)).toEqual([erste.titel_de, zweite.titel_de, 'Extras']);
    const extras = a.auswahl[2];
    expect(extras).toMatchObject({ herkunft: 'eigene Hauptkategorie', abrechnung: 'monatlich' });
    expect(extras.posten[0]).toMatchObject({ titel: 'Migration Blog-Artikel', herkunft: 'manuell' });

    // The next one gets the next number.
    const zweitesAngebot = await v.rufe('angebot_speichern', { firma_id: id, titel: 'Klaviyo', leistungen_waehlen: [zweite.leistungen[0].leistung_id] });
    expect(zweitesAngebot.daten.angebot.nummer).toBe(`${jahr}/02`);

    const verlauf = (await v.service.load()).aktivitaeten.filter((x) => x.firma_id === id && x.text.startsWith(`Angebot ${jahr}/01 angelegt`));
    expect(verlauf).toHaveLength(1);
  });

  it('ändert ein Angebot schrittweise und behält die übrigen Felder', async () => {
    const [erste, zweite] = await katalog();
    const id = await firmaId('Bergwerk');
    const neu = (await v.rufe('angebot_speichern', { firma_id: id, titel: 'Relaunch', kategorien_waehlen: [erste.kategorie_id, zweite.kategorie_id] })).daten.angebot;

    const { daten } = await v.rufe('angebot_speichern', {
      angebot_id: neu.angebot_id,
      sprache: 'en',
      leistungen_abwaehlen: [erste.leistungen[0].leistung_id],
      manuell: [{ titel: 'Zusatzsprache FR', kategorie: erste.kategorie_id }],
      notizen: [{ kategorie: erste.kategorie_id, posten: erste.leistungen[1].leistung_id, notiz: '4 Sprachen' }],
      optional: [{ kategorie: zweite.kategorie_id, optional: true }],
    });
    const a = daten.angebot;
    expect(a).toMatchObject({ titel: 'Relaunch', nummer: neu.nummer, sprache: 'Englisch', deal_id: neu.deal_id });
    const [k1, k2] = a.auswahl;
    expect(k1.titel).toBe(erste.titel_en);
    expect(k1.posten.some((p: { posten: string }) => p.posten === erste.leistungen[0].leistung_id)).toBe(false);
    expect(k1.posten.find((p: { posten: string }) => p.posten === erste.leistungen[1].leistung_id)).toMatchObject({ titel: erste.leistungen[1].titel_en, notiz: '4 Sprachen' });
    expect(k1.posten.at(-1)).toMatchObject({ titel: 'Zusatzsprache FR', herkunft: 'manuell' });
    expect(k2.optional).toBe(true);

    // Removing the catalogue items of a category keeps its manual item; removing that one empties the category.
    const manuell = k1.posten.at(-1).posten;
    const ohne = (await v.rufe('angebot_speichern', { angebot_id: neu.angebot_id, kategorien_abwaehlen: [erste.kategorie_id] })).daten.angebot;
    expect(ohne.auswahl[0].posten.map((p: { titel: string }) => p.titel)).toEqual(['Zusatzsprache FR']);
    const leer = (await v.rufe('angebot_speichern', { angebot_id: neu.angebot_id, posten_entfernen: [{ kategorie: erste.kategorie_id, posten: manuell }] })).daten.angebot;
    expect(leer.auswahl.map((k: { kategorie: string }) => k.kategorie)).toEqual([zweite.kategorie_id]);

    const falsch = await v.rufe('angebot_speichern', { angebot_id: neu.angebot_id, leistungen_waehlen: ['LS-GIBTSNICHT'] });
    expect(falsch.fehler).toBe(true);
    expect(falsch.text).toContain('leistungskatalog');
    const ohneFirma = await v.rufe('angebot_speichern', { titel: 'X' });
    expect(ohneFirma.text).toContain('firma_id');
  });

  it('listet und zeigt Angebote, legt das Kalkulations-Sheet an und archiviert', async () => {
    const [erste] = await katalog();
    const id = await firmaId('Nordlicht');
    const neu = (await v.rufe('angebot_speichern', { firma_id: id, kategorien_waehlen: [erste.kategorie_id] })).daten.angebot;

    const liste = (await v.rufe('angebote', { status: 'entwurf' })).daten;
    expect(liste.angebote.map((a: { angebot_id: string }) => a.angebot_id)).toContain(neu.angebot_id);
    expect(liste.naechste_nummer).toBe(`${jahr}/02`);

    const kalk = await v.rufe('kalkulation_anlegen', { angebot_id: neu.angebot_id });
    expect(kalk.fehler).toBe(false);
    expect(kalk.daten.status).toBe('In Kalkulation');
    expect(kalk.daten.kalkulation).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
    expect(kalk.daten.ablage).toBe('Drive-Ordner der Firma');
    expect((await v.rufe('kalkulation_anlegen', { angebot_id: neu.angebot_id })).daten.hinweis).toContain('schon ein Kalkulations-Sheet');

    const anzeige = (await v.rufe('angebot_anzeigen', { angebot_id: neu.angebot_id })).daten;
    expect(anzeige).toMatchObject({ status: 'In Kalkulation', firma: 'Nordlicht Outdoor GmbH', kalkulation: kalk.daten.kalkulation });
    expect(anzeige.auswahl[0].posten.length).toBe(erste.leistungen.length);

    const nachAenderung = await v.rufe('angebot_speichern', { angebot_id: neu.angebot_id, kategorien_abwaehlen: [erste.kategorie_id], manuell: [{ titel: 'Nur noch das', neue_kategorie: 'Rest' }] });
    expect(nachAenderung.daten.hinweis).toContain('nicht ins bestehende Kalkulations-Sheet');

    const archiv = await v.rufe('angebot_archivieren', { angebot_id: neu.angebot_id });
    expect(archiv.daten.archiviert).toBe(true);
    expect((await v.rufe('angebote')).daten.anzahl).toBe(0);
    expect((await v.rufe('angebote', { archivierte_zeigen: true })).daten.anzahl).toBe(1);
  });

  it('pflegt den Katalog: anlegen, teilweise ändern, verschieben, archivieren', async () => {
    const kat = (await v.rufe('katalog_kategorie_speichern', { titel_de: 'Schulung', umfang_de: 'Workshops fürs Team', abrechnung: 'einmalig' })).daten;
    expect(kat.neu).toBe(true);
    expect(kat.kategorie.englisch_fehlt).toBe(true);
    const geaendert = (await v.rufe('katalog_kategorie_speichern', { kategorie_id: kat.kategorie.kategorie_id, titel_en: 'Training' })).daten.kategorie;
    expect(geaendert).toMatchObject({ titel_de: 'Schulung', titel_en: 'Training', umfang_de: 'Workshops fürs Team' });

    const eins = (await v.rufe('katalog_leistung_speichern', { kategorie_id: kat.kategorie.kategorie_id, titel_de: 'Shopify-Grundlagen', text_de: 'Halbtägiger Workshop' })).daten.leistung;
    const zwei = (await v.rufe('katalog_leistung_speichern', { kategorie_id: kat.kategorie.kategorie_id, titel_de: 'Klaviyo-Grundlagen' })).daten.leistung;
    const teil = (await v.rufe('katalog_leistung_speichern', { leistung_id: eins.leistung_id, titel_en: 'Shopify basics' })).daten.leistung;
    expect(teil).toMatchObject({ titel_de: 'Shopify-Grundlagen', text_de: 'Halbtägiger Workshop', titel_en: 'Shopify basics' });

    const runter = await v.rufe('katalog_verschieben', { id: eins.leistung_id, richtung: 'runter' });
    expect(runter.daten.reihenfolge).toEqual(['Klaviyo-Grundlagen', 'Shopify-Grundlagen']);
    const hoch = await v.rufe('katalog_verschieben', { id: kat.kategorie.kategorie_id, richtung: 'hoch' });
    expect(hoch.daten.reihenfolge.at(-2)).toBe('Schulung');

    expect((await v.rufe('katalog_archivieren', { id: zwei.leistung_id })).daten).toEqual({ unterpunkt: 'Klaviyo-Grundlagen', archiviert: true });
    expect((await v.rufe('katalog_archivieren', { id: kat.kategorie.kategorie_id })).daten.archiviert).toBe(true);
    const sichtbar = await katalog();
    expect(sichtbar.some((k: { titel_de: string }) => k.titel_de === 'Schulung')).toBe(false);
    expect((await v.rufe('katalog_archivieren', { id: kat.kategorie.kategorie_id, archiviert: false })).daten.archiviert).toBe(false);

    const ohneTitel = await v.rufe('katalog_kategorie_speichern', { titel_en: 'Only English' });
    expect(ohneTitel.fehler).toBe(true);
    expect(ohneTitel.text).toContain('deutschen Titel');
  });

  it('pflegt die Outreach-Leistungen und übernimmt die Startliste nur in eine leere Liste', async () => {
    const liste = await outreach();
    expect(liste.length).toBeGreaterThan(3);
    const neu = (await v.rufe('outreach_leistung_speichern', { titel: 'Shop-Audit', nutzen: 'Klarheit in einer Stunde' })).daten.leistung;
    const teil = (await v.rufe('outreach_leistung_speichern', { leistung_id: neu.leistung_id, anlass: 'Langsamer Shop' })).daten.leistung;
    expect(teil).toMatchObject({ titel: 'Shop-Audit', nutzen: 'Klarheit in einer Stunde', anlass: 'Langsamer Shop' });
    expect((await outreach()).at(-1)?.titel).toBe('Shop-Audit');

    expect((await v.rufe('outreach_leistung_archivieren', { leistung_id: neu.leistung_id })).daten.archiviert).toBe(true);
    expect((await outreach()).some((l) => l.titel === 'Shop-Audit')).toBe(false);

    const start = await v.rufe('outreach_startliste_uebernehmen');
    expect(start.fehler).toBe(true);
    expect(start.text).toContain('schon Leistungen');
  });

  it('erzeugt Varianten aus den CRM-Daten wie die Hub-Seite', async () => {
    const [migration, klaviyo] = await outreach();
    const id = await firmaId('Alpenglanz');
    const { fehler, daten } = await v.rufe('anschreiben_erzeugen', {
      firma_id: id,
      kanal: 'email',
      leistung_ids: [klaviyo.leistung_id, migration.leistung_id],
      aufhaenger: 'Neue Herbstkollektion',
      offer: 'erster_monat',
    });
    expect(fehler).toBe(false);
    expect(daten.varianten).toHaveLength(3);
    // Main contact, "Sie" for e-mail, services in list order.
    expect(daten.varianten[0].text).toContain('Hallo Sophie Lindner');
    expect(daten.varianten[0].betreff).toContain(`${migration.titel} und ${klaviyo.titel}`);
    expect(daten.hinweise).toEqual(expect.arrayContaining([expect.stringContaining('signatur_speichern')]));
    expect(daten.fuer_anschreiben_gesendet).toMatchObject({ firma_id: id, kanal: 'email', anrede: 'sie', aufhaenger: 'Neue Herbstkollektion', leistung_ids: [migration.leistung_id, klaviyo.leistung_id] });
    expect(daten.fuer_anschreiben_gesendet.kontakt_id).toBeTruthy();

    const notiz = await v.rufe('anschreiben_erzeugen', { firma_id: id, kontakt_id: '', leistung_ids: [migration.leistung_id] });
    expect(notiz.daten.kanal).toBe('LinkedIn-Notiz');
    expect(notiz.daten.zeichen_limit).toBe(300);
    expect(notiz.daten.varianten[0].text).toContain('Guten Tag');
    expect(notiz.daten.varianten.every((x: { zeichen: number }) => x.zeichen <= 300)).toBe(true);

    expect((await v.rufe('anschreiben_erzeugen', { firma_id: id })).text).toContain('mindestens eine Leistung');
    expect((await v.rufe('anschreiben_erzeugen', { firma_id: id, leistung_ids: [migration.leistung_id], offer: 'manuell' })).text).toContain('offer_text');
  });

  it('nimmt Aufhänger aus dem neuesten Shop-Audit, standardmäßig den ersten je Leistung', async () => {
    const leistungen = (await v.service.loadContactDaten()).leistungen;
    const tracking = leistungen.find((l) => /tracking/i.test(l.titel))!;
    const id = await firmaId('Nordlicht');
    await v.service.speichereAudit(await new DemoShopAudit(0).pruefe(baueAuditAnfrage('nordlicht-outdoor.example', leistungen)), id);

    const mit = (await v.rufe('anschreiben_erzeugen', { firma_id: id, leistung_ids: [tracking.id], aufhaenger: 'Messe' })).daten;
    expect(mit.audit.aufhaenger[0]).toMatchObject({ gewaehlt: true });
    expect(mit.fuer_anschreiben_gesendet.aufhaenger).toBe(`${mit.audit.aufhaenger[0].text}\nMesse`);

    const ohne = (await v.rufe('anschreiben_erzeugen', { firma_id: id, leistung_ids: [tracking.id], audit_aufhaenger: [] })).daten;
    expect(ohne.fuer_anschreiben_gesendet.aufhaenger).toBeUndefined();
    expect((await v.rufe('anschreiben_erzeugen', { firma_id: id, leistung_ids: [tracking.id], audit_aufhaenger: ['erfunden'] })).fehler).toBe(true);
  });

  it('meldet einen fehlenden Generator verständlich', async () => {
    const ohne = await verbinde('lugge@velonify.de', 'Lugge Muster', { dienste: { ...demoDienste(), generator: undefined } });
    const id = (await ohne.service.load()).firmen[0].id;
    const { fehler, text } = await ohne.rufe('anschreiben_erzeugen', { firma_id: id, manuelle_leistung: { titel: 'Test' } });
    expect(fehler).toBe(true);
    expect(text).toContain('CONTACT_GENERATOR_URL');
  });

  it('markiert als gesendet: Verlauf, Phase „kontaktiert“, Zuteilung und Gesendet-Liste', async () => {
    const [migration] = await outreach();
    const id = await firmaId('Bergwerk');
    const { fehler, daten } = await v.rufe('anschreiben_gesendet', {
      firma_id: id,
      kanal: 'linkedin_nachricht',
      leistung_ids: [migration.leistung_id],
      text: 'Hallo, kurze Frage zum Shop.',
    });
    expect(fehler).toBe(false);
    expect(daten.erledigt).toEqual(expect.arrayContaining(['Phase: Qualifiziert → Kontaktiert', 'zugeteilt an Johannes, Lugge']));
    const db = await v.service.load();
    const deal = db.deals.find((d) => d.id === daten.deal_id)!;
    expect(deal.phase).toBe('kontaktiert');
    expect(db.aktivitaeten.some((x) => x.firma_id === id && x.text.startsWith(`LinkedIn-Nachricht gesendet (Contact Generator, ${migration.titel})`))).toBe(true);

    const liste = (await v.rufe('anschreiben_liste', { firma_id: id, mit_text: true })).daten;
    expect(liste.treffer).toBe(1);
    expect(liste.anschreiben[0]).toMatchObject({ kanal: 'LinkedIn-Nachricht', status: 'Gesendet', leistung: migration.titel, text: 'Hallo, kurze Frage zum Shop.' });

    const status = await v.rufe('anschreiben_status', { anschreiben_id: daten.anschreiben_id, status: 'antwort' });
    expect(status.daten.status).toBe('Antwort erhalten');
    const nachStatus = (await v.rufe('anschreiben_liste', { status: 'antwort' })).daten;
    expect(nachStatus).toMatchObject({ gesamt: 1, antworten: 1, antwortquote: '100 %', treffer: 1 });
  });

  it('legt ohne offenen Deal einen an und hängt bei E-Mails die Signatur an', async () => {
    expect((await v.rufe('signatur_speichern', { signatur: 'Lugge\nVelonify' })).daten.gespeichert).toBe(true);
    const id = await firmaId('Feldmann');
    const ohneBetreff = await v.rufe('anschreiben_gesendet', { firma_id: id, kanal: 'email', manuelle_leistung: 'Shop-Audit', text: 'Hallo' });
    expect(ohneBetreff.text).toContain('Betreff');

    const { daten } = await v.rufe('anschreiben_gesendet', { firma_id: id, kanal: 'email', manuelle_leistung: 'Shop-Audit', betreff: 'Ihr Shop', text: 'Hallo' });
    expect(daten.erledigt).toEqual(expect.arrayContaining(['Signatur angehängt', 'Deal angelegt: Shop-Audit', 'Phase: Neu → Kontaktiert']));
    const { anschreiben } = await v.service.loadContactDaten();
    expect(anschreiben.find((a) => a.id === daten.anschreiben_id)!.text).toBe('Hallo\n\nLugge\nVelonify');

    // Without new deal and without signature on request.
    const zweite = (await v.rufe('anschreiben_gesendet', { firma_id: await firmaId('Alpenglanz'), kanal: 'email', manuelle_leistung: 'Audit', betreff: 'B', text: 'T', neuer_deal: false, signatur_anhaengen: false })).daten;
    expect(zweite.deal_id).toBeUndefined();
    expect(zweite.erledigt).not.toContain('Signatur angehängt');
  });
});
