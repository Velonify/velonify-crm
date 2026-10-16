import { describe, expect, it } from 'vitest';
import { GoogleApiError } from '../../../../src/data/errors';
import { addDays, isoDate } from '../../../../src/data/ids';
import { wortDesTages } from '../../../../src/data/wordle';
import { verbinde } from '../testhilfe';
import { KALENDER_NEU_VERBINDEN } from './audit';

const heute = () => isoDate(new Date());

describe('Shop-Audit', () => {
  it('prüft eine Firma, vermerkt es im Verlauf und listet das Audit', async () => {
    const { service, rufe } = await verbinde();
    const firma = (await service.load()).firmen.find((f) => !f.archiviert && f.domain)!;

    const geprueft = await rufe('shop_pruefen', { firma_id: firma.id });
    expect(geprueft.fehler).toBe(false);
    expect(geprueft.daten.firma_id).toBe(firma.id);
    expect(geprueft.daten.audit_id).toMatch(/^SA-/);
    const db = await service.load();
    expect(db.aktivitaeten.some((a) => a.firma_id === firma.id && a.text.startsWith('Shop-Audit'))).toBe(true);

    const liste = await rufe('audits', { zustand: 'geprueft', suchbegriff: firma.name });
    expect(liste.daten.firmen[0]).toMatchObject({ firma_id: firma.id, audit_id: geprueft.daten.audit_id });

    const detail = await rufe('audit_anzeigen', { firma_id: firma.id });
    expect(detail.daten.befunde.length).toBeGreaterThan(0);
    expect(detail.daten.speed.mobil.pagespeed).toBeTypeOf('number');
    expect(detail.daten.hub).toContain('/#/audit/');
  });

  it('ordnet ein Audit ohne Firma als neuen Lead zu', async () => {
    const { service, rufe } = await verbinde();
    const { daten } = await rufe('shop_pruefen', { domain: 'https://www.neuer-testshop.example/' });
    expect(daten.firma_id).toBeUndefined();
    expect(daten.hinweis).toContain('audit_zuordnen');

    const ohne = await rufe('audit_zuordnen', { audit_id: daten.audit_id });
    expect(ohne.fehler).toBe(true);

    const neu = await rufe('audit_zuordnen', { audit_id: daten.audit_id, als_lead_anlegen: true });
    expect(neu.daten.erledigt).toContain('als Lead angelegt');
    const firma = (await service.load()).firmen.find((f) => f.id === neu.daten.firma_id)!;
    expect(firma).toMatchObject({ name: 'neuer-testshop.example', quelle: 'Shop-Audit', status: 'lead' });
    expect((await service.loadAudits()).find((a) => a.id === daten.audit_id)?.firma_id).toBe(firma.id);

    const umhaengen = await rufe('audit_zuordnen', { audit_id: daten.audit_id, als_lead_anlegen: true });
    expect(umhaengen.fehler).toBe(true);
    expect(umhaengen.text).toContain('gehört schon zu');
  });

  it('meldet, wenn das Shop-Audit nicht eingerichtet ist', async () => {
    const { rufe } = await verbinde(undefined, undefined, { dienste: {} });
    const { fehler, text } = await rufe('shop_pruefen', { domain: 'beispiel.example' });
    expect(fehler).toBe(true);
    expect(text).toContain('SHOP_AUDIT_URL');
  });
});

describe('Shop-Roast-Reports', () => {
  it('führt einen Report von der Prüfung bis zum Versand', async () => {
    const { service, rufe } = await verbinde();
    const offen = await rufe('roast_reports');
    expect(offen.daten.eintraege.map((e: { lead_id: string }) => e.lead_id)).toEqual(expect.arrayContaining(['ML-DEMO5', 'ML-DEMO6']));

    const geprueft = await rufe('roast_shop_pruefen', { lead_id: 'ML-DEMO5' });
    expect(geprueft.daten.erledigt).toContain('seifenwerk.example geprüft');
    expect((await rufe('roast_shop_pruefen', { lead_id: 'ML-DEMO5' })).text).toContain('neu_pruefen');

    const texte = await rufe('roast_texte_schreiben', { lead_id: 'ML-DEMO5' });
    expect(texte.daten.report.einleitung).toContain('Demo-Modus');
    expect(texte.daten.fehlt_fuer_freigabe).toContain('Beobachtungen');
    expect((await rufe('roast_texte_schreiben', { lead_id: 'ML-DEMO5' })).text).toContain('ueberschreiben');

    const ohneFreigabe = await rufe('roast_report_freigeben', { lead_id: 'ML-DEMO5' });
    expect(ohneFreigabe.fehler).toBe(true);

    const punkt = texte.daten.report.punkte[0];
    const bearbeitet = await rufe('roast_report_bearbeiten', {
      lead_id: 'ML-DEMO5',
      punkte: [{ befund_id: punkt.befund_id, titel: 'Neue Überschrift' }, { befund_id: texte.daten.report.punkte.at(-1).befund_id, entfernen: true }],
      beobachtungen: [1, 2, 3].map((n) => ({ titel: `Beobachtung ${n}`, text: `Text ${n}` })),
      geprueft_von: 'Lukas',
    });
    expect(bearbeitet.daten.schritt).toBe('Bereit zur Freigabe');
    expect(bearbeitet.daten.report.punkte[0].titel).toBe('Neue Überschrift');
    expect(bearbeitet.daten.report.entfernte_befunde).toHaveLength(1);

    expect((await rufe('roast_report_mail', { lead_id: 'ML-DEMO5' })).fehler).toBe(true);
    const frei = await rufe('roast_report_freigeben', { lead_id: 'ML-DEMO5' });
    expect(frei.daten.report_link).toMatch(/^https:\/\/velonify\.de\/roast\//);
    expect((await rufe('roast_report_bearbeiten', { lead_id: 'ML-DEMO5', fazit: 'x' })).fehler).toBe(true);

    const mail = await rufe('roast_report_mail', { lead_id: 'ML-DEMO5' });
    expect(mail.daten).toMatchObject({ an: 'mira@seifenwerk.example', betreff: 'Euer Shop-Roast: seifenwerk.example' });
    expect(mail.daten.text).toContain(frei.daten.report_link);
    expect(mail.daten.gmail_entwurf).toContain('mail.google.com');

    const gesendet = await rufe('roast_report_gesendet', { lead_id: 'ML-DEMO5' });
    expect(gesendet.daten.erledigt).toBe('als gesendet markiert');
    expect((await rufe('roast_report_freigeben', { lead_id: 'ML-DEMO5', freigegeben: false })).fehler).toBe(true);
    const lead = (await service.loadMagnetDaten()).leads.find((l) => l.id === 'ML-DEMO5')!;
    expect(lead.report_gesendet_am).not.toBe('');
    expect(lead.report_von).toBe('Lukas');
  });

  it('zeigt den Report-Entwurf eines geprüften Eintrags und lehnt fremde Magnete ab', async () => {
    const { rufe } = await verbinde();
    const { daten } = await rufe('roast_reports', { lead_id: 'ML-DEMO6' });
    expect(daten.schritt).toBe('Report in Arbeit');
    expect(daten.report.punkte.length).toBeGreaterThan(0);
    expect(daten.fehlt_fuer_freigabe).toBeTruthy();
    expect((await rufe('roast_reports', { lead_id: 'ML-DEMO1' })).text).toContain('kein Shop-Roast');
  });
});

describe('Kalender', () => {
  it('liest Termine der Woche mit Gästen', async () => {
    const { rufe } = await verbinde();
    const { daten } = await rufe('termine');
    const sync = daten.termine.find((t: { titel: string }) => t.titel === 'Team-Sync');
    expect(sync.meet).toContain('meet.google.com');
    expect(sync.gaeste).toContain('johannes@velonify.de (zugesagt)');
    expect(daten.termine.find((t: { titel: string }) => t.titel === 'Abgelehnter Termin').nur_lesen).toBeTruthy();
  });

  it('plant einen Termin mit Firma und Kollegen, ändert und löscht ihn', async () => {
    const { service, rufe } = await verbinde();
    const db = await service.load();
    const kontakt = db.kontakte.find((k) => k.hauptkontakt && k.email && !k.archiviert)!;
    const morgen = addDays(heute(), 1);

    const geplant = await rufe('termin_planen', { datum: morgen, von: '14:00', firma_id: kontakt.firma_id, kollegen: ['Julian'] });
    expect(geplant.fehler).toBe(false);
    expect(geplant.daten.erledigt).toContain('im Verlauf vermerkt');
    expect(geplant.daten.wann).toBe(`${morgen} 14:00–14:30`);
    expect(geplant.daten.gaeste).toEqual(expect.arrayContaining([kontakt.email.toLowerCase(), 'julian@velonify.de']));
    expect(geplant.daten.meet).toContain('meet.google.com');
    expect((await service.load()).aktivitaeten.some((a) => a.firma_id === kontakt.firma_id && a.typ === 'meeting')).toBe(true);

    const geaendert = await rufe('termin_aendern', { termin_id: geplant.daten.termin_id, von: '15:00', gaeste_entfernen: ['Julian'] });
    expect(geaendert.daten.wann).toBe(`${morgen} 15:00–15:30`);
    expect(geaendert.daten.gaeste).not.toContain('julian@velonify.de');

    const geloescht = await rufe('termin_loeschen', { termin_id: geplant.daten.termin_id });
    expect(geloescht.daten.erledigt).toContain('gelöscht');
    expect((await rufe('termine', { von: morgen, bis: morgen })).daten.termine.some((t: { termin_id: string }) => t.termin_id === geplant.daten.termin_id)).toBe(false);
  });

  it('ändert fremde Termine nicht und kennt unbekannte Kollegen nicht', async () => {
    const { rufe } = await verbinde();
    const fremd = (await rufe('termine')).daten.termine.find((t: { titel: string }) => t.titel === 'Abgelehnter Termin');
    expect((await rufe('termin_loeschen', { termin_id: fremd.termin_id })).text).toContain('nur die Person');
    expect((await rufe('termin_planen', { datum: addDays(heute(), 2), titel: 'Test', kollegen: ['Niemand'] })).text).toContain('noch im Team');
  });

  it('bittet bei fehlender Kalender-Berechtigung ums Neuverbinden', async () => {
    const { service, rufe } = await verbinde();
    (service as unknown as { calendar: { listEvents: () => Promise<never> } }).calendar.listEvents = async () => {
      throw new GoogleApiError(403, 'Kein Zugriff', 'Request had insufficient authentication scopes.');
    };
    const { fehler, text } = await rufe('termine');
    expect(fehler).toBe(true);
    expect(text).toBe(KALENDER_NEU_VERBINDEN);
  });
});

describe('Erwähnungen', () => {
  it('zeigt ungelesene Erwähnungen mit Link und markiert sie als gelesen', async () => {
    const { rufe } = await verbinde();
    const { daten } = await rufe('erwaehnungen');
    expect(daten.ungelesen).toBe(1);
    expect(daten.erwaehnungen[0]).toMatchObject({ gelesen: false, art: 'Kommentar' });
    expect(daten.erwaehnungen[0].auszug).toContain('@Lugge');
    expect(daten.erwaehnungen[0].link).toMatch(/^https:\/\/crm\.velonify\.de\/#\/todo\//);

    expect((await rufe('erwaehnungen_gelesen', { erwaehnung_ids: ['ER-FREMD'] })).fehler).toBe(true);
    const gelesen = await rufe('erwaehnungen_gelesen', { alle: true });
    expect(gelesen.daten).toEqual({ erledigt: '1 als gelesen markiert', noch_ungelesen: 0 });
    expect((await rufe('erwaehnungen', { nur_ungelesene: true })).daten.erwaehnungen).toEqual([]);
  });
});

describe('Einrichtung', () => {
  it('liest Listen und speichert Links, Dealtitel und Monstera-Namen', async () => {
    const { service, rufe } = await verbinde();
    const vorher = await rufe('einstellungen');
    expect(vorher.daten.listen.team).toContain('Johannes');

    expect((await rufe('einstellungen_aendern', { link_notion: 'http://unsicher.example' })).fehler).toBe(true);
    const gespeichert = await rufe('einstellungen_aendern', { link_notion: 'https://notion.example/velonify', deal_titel_standard: 'Migration', monstera_name: 'Frida' });
    expect(gespeichert.fehler).toBe(false);
    const db = await service.load();
    expect(db.einstellungen).toMatchObject({ link_notion: 'https://notion.example/velonify', deal_titel_standard: 'Migration', monstera_name: 'Frida' });
    expect((await rufe('einstellungen')).daten.links.link_notion).toBe('https://notion.example/velonify');
  });

  it('prüft Drive-Ordner vor dem Speichern', async () => {
    const { service, rufe } = await verbinde();
    expect((await rufe('einstellungen_aendern', { drive_leads: 'gibt-es-nicht' })).fehler).toBe(true);
    const leads = (await service.load()).einstellungen.drive_leads_ordner_id;
    const ok = await rufe('einstellungen_aendern', { drive_leads: `https://drive.google.com/drive/folders/${leads}` });
    expect(ok.daten.geaendert).toEqual({ drive_leads_ordner_id: leads });
  });
});

describe('Spiele', () => {
  it('zeigt die Bestenliste und speichert ein gelöstes Wort des Tages', async () => {
    const { service, rufe } = await verbinde();
    const stand = await rufe('wort_des_tages');
    expect(stand.daten.du).toBe('heute noch nicht gespielt');
    expect(stand.daten.bestenliste[0].spieler).toBe('Johannes');

    expect((await rufe('wort_des_tages_raten', { versuche: ['ZU'] })).fehler).toBe(true);
    const zwischen = await rufe('wort_des_tages_raten', { versuche: ['QQQQQ'] });
    expect(zwischen.daten).toMatchObject({ uebrig: 5 });
    expect(zwischen.daten.wort).toBeUndefined();

    const loesung = wortDesTages(heute());
    const fertig = await rufe('wort_des_tages_raten', { versuche: ['qqqqq', loesung.toLowerCase()] });
    expect(fertig.daten).toMatchObject({ ergebnis: 'gelöst in 2/6', wort: loesung, gespeichert: true });
    expect((await service.loadWordle()).find((e) => e.spieler === 'Lugge' && e.datum === heute())).toMatchObject({ versuche: 2, geloest: true, muster: 'xxxxx/ggggg' });
    expect((await rufe('wort_des_tages_raten', { versuche: [loesung] })).text).toContain('schon gespielt');
  });

  it('gießt die Monstera einmal am Tag', async () => {
    const { rufe } = await verbinde();
    const vorher = await rufe('monstera');
    expect(vorher.daten.heute_gegossen).toEqual(['Johannes']);
    expect(vorher.daten.du_kannst_giessen).toBe(true);

    const gegossen = await rufe('monstera_giessen');
    expect(gegossen.daten.erledigt).toBe('gegossen');
    expect(gegossen.daten.heute_gegossen).toEqual(expect.arrayContaining(['Johannes', 'Lugge']));
    expect((await rufe('monstera_giessen')).daten.erledigt).toContain('schon');
    expect((await rufe('monstera')).daten.du_kannst_giessen).toBe(false);
  });

  it('lässt nur Teammitglieder mitspielen', async () => {
    const { rufe } = await verbinde('gast@extern.example', 'Gast Person');
    expect((await rufe('monstera_giessen')).text).toContain('Team-Liste');
    expect((await rufe('erwaehnungen')).fehler).toBe(true);
  });
});

describe('Auswahllisten', () => {
  it('ersetzt eine Liste ohne Dubletten und leere Werte', async () => {
    const gesetzt: [string, string[]][] = [];
    const { rufe } = await verbinde('lugge@velonify.de', 'Lugge Muster', { setzeListe: async (liste, werte) => void gesetzt.push([liste, werte]) });
    const ok = await rufe('liste_aendern', { liste: 'verlustgrund', werte: ['Kein Budget', ' Timing ', '', 'Timing'] });
    expect(ok.fehler).toBe(false);
    expect(gesetzt).toEqual([['verlustgrund', ['Kein Budget', 'Timing']]]);
    expect(ok.daten.vorher.length).toBeGreaterThan(0);
  });

  it('sagt Bescheid, wenn das CRM nicht in Postgres liegt', async () => {
    const { rufe } = await verbinde();
    const antwort = await rufe('liste_aendern', { liste: 'team', werte: ['Lugge'] });
    expect(antwort.fehler).toBe(true);
    expect(antwort.text).toContain('Postgres');
  });
});
