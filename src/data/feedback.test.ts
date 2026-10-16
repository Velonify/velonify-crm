import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { feedbackSicht, feedbackSchluessel, istKritik, kritikNachricht, pruefeFeedback, zufriedenheit } from './feedback';
import { PortalFehler } from './portalAktionen';
import { findeBerechtigung, kundensicht, vorschauBerechtigung } from './portalApi';
import type { KundenFeedback } from './types';

const JETZT = new Date('2026-10-20T10:00:00Z');

async function aufbau() {
  const { service } = await createDemoBackend(() => 'lukas@velonify.de');
  const db = await service.load();
  const portal = await service.loadPortalDaten();
  const todos = await service.loadTodoDaten();
  const berechtigung = findeBerechtigung(db, portal, 'sophie@alpenglanz.example')!;
  return { service, db, portal, todos, berechtigung };
}

describe('pruefeFeedback', () => {
  it('stores stars on a finished milestone and refuses a second rating of the same contact', async () => {
    const { portal, todos, berechtigung } = await aufbau();
    const etappe = portal.meilensteine.find((m) => m.status === 'erledigt')!;
    const neu = pruefeFeedback({ berechtigung, eingabe: { anlass: 'meilenstein', bezug_id: etappe.id, sterne: 4, text: ' Lief gut. ' }, todos, portal, jetzt: JETZT });
    expect(neu).toMatchObject({ anlass: 'meilenstein', bezug_titel: etappe.titel, sterne: 4, text: 'Lief gut.', von: 'sophie@alpenglanz.example', zitat_ok: false });
    expect(() => pruefeFeedback({ berechtigung, eingabe: { anlass: 'meilenstein', bezug_id: etappe.id, sterne: 5 }, todos, portal: { ...portal, feedback: [neu] }, jetzt: JETZT })).toThrow(/schon eine Bewertung/);
  });

  it('only accepts what the client can see, 1–5 stars, and text for free feedback', async () => {
    const { portal, todos, berechtigung } = await aufbau();
    const offen = portal.meilensteine.find((m) => m.status !== 'erledigt')!;
    const pruefe = (eingabe: Record<string, unknown>) => () => pruefeFeedback({ berechtigung, eingabe, todos, portal, jetzt: JETZT });
    expect(pruefe({ anlass: 'meilenstein', bezug_id: offen.id, sterne: 5 })).toThrow(PortalFehler);
    expect(pruefe({ anlass: 'bericht', bezug_id: portal.berichte[0].monat, sterne: 5 })).toThrow(/gibt es hier nicht/); // still a draft
    expect(pruefe({ anlass: 'karte', bezug_id: 'T-GIBTSNICHT', sterne: 5 })).toThrow(/gibt es hier nicht/);
    expect(pruefe({ anlass: 'frei', sterne: 6, text: 'x' })).toThrow(/1 bis 5/);
    expect(pruefe({ anlass: 'frei', text: '  ' })).toThrow(/ein paar Worte/);
    expect(pruefe({ anlass: 'quatsch', sterne: 3 })).toThrow(/Anlass/);
    const frei = pruefeFeedback({ berechtigung, eingabe: { anlass: 'frei', text: 'Ihr seid super!', sterne: 5, zitat_ok: true }, todos, portal, jetzt: JETZT });
    expect(frei).toMatchObject({ bezug_id: '', sterne: 5, zitat_ok: true });
  });

  it('rates a done card and a released report', async () => {
    const { service, portal, todos, berechtigung } = await aufbau();
    const fertig = todos.aufgaben.find((a) => a.titel === 'Neue Produktseiten live')!;
    expect(pruefeFeedback({ berechtigung, eingabe: { anlass: 'karte', bezug_id: fertig.id, sterne: 2, text: 'Hat zu lange gedauert' }, todos, portal, jetzt: JETZT }).bezug_titel).toBe('Neue Produktseiten live');
    await service.freigebenBericht(portal.berichte[0].id, true);
    const frei = await service.loadPortalDaten();
    expect(pruefeFeedback({ berechtigung, eingabe: { anlass: 'bericht', bezug_id: frei.berichte[0].monat, sterne: 5 }, todos, portal: frei, jetzt: JETZT }).bezug_titel).toMatch(/^Monatsbericht /);
  });
});

describe('Feedback im Portal und im Hub', () => {
  it('offers recently finished milestones once, with the Google link, also in the team access', async () => {
    const { db, portal, todos, berechtigung, service } = await aufbau();
    const etappen = portal.meilensteine.filter((m) => m.status === 'erledigt');
    const einstellungen = { google_bewertung_url: 'https://g.page/r/velonify/review' };
    const sicht = feedbackSicht({ berechtigung, portal, einstellungen, jetzt: new Date() });
    expect(sicht.offen.map((o) => o.bezug_id).sort()).toEqual(etappen.map((m) => m.id).sort());
    expect(sicht.bewertung_url).toBe('https://g.page/r/velonify/review');
    // Older than 30 days: no longer asked.
    expect(feedbackSicht({ berechtigung, portal, einstellungen, jetzt: new Date(Date.now() + 40 * 86_400_000) }).offen).toEqual([]);

    const bewertet = pruefeFeedback({ berechtigung, eingabe: { anlass: 'meilenstein', bezug_id: etappen[0].id, sterne: 5 }, todos, portal, jetzt: new Date() });
    const danach = feedbackSicht({ berechtigung, portal: { ...portal, feedback: [bewertet] }, einstellungen: {}, jetzt: new Date() });
    expect(danach.gegeben).toEqual([feedbackSchluessel('meilenstein', etappen[0].id)]);
    expect(danach.offen.some((o) => o.bezug_id === etappen[0].id)).toBe(false);
    expect(danach.bewertung_url).toBe('');

    const kunden = await service.loadKundenDaten();
    const team = kundensicht({ berechtigung: vorschauBerechtigung(db, berechtigung.firma.id, 'lukas@velonify.de')!, vorschau: 'lukas@velonify.de', db, kunden, todos, portal: { ...portal, feedback: [bewertet] }, dateien: [], teamDomain: 'velonify.de' });
    expect(team.feedback.offen.length).toBe(etappen.length);
  });

  it('reports criticism and averages per client with a traffic light', () => {
    const f = (sterne: number | null, erstellt_am = '2026-10-01') => ({ firma_id: 'F-1', sterne, erstellt_am }) as KundenFeedback;
    expect(istKritik(f(3))).toBe(true);
    expect(istKritik(f(4))).toBe(false);
    expect(istKritik(f(null))).toBe(false);
    expect(zufriedenheit([f(5), f(4), f(null)], 'F-1')).toEqual({ schnitt: 4.5, anzahl: 2, ampel: 'gut' });
    expect(zufriedenheit([f(2), f(3), f(5, '2026-01-01')], 'F-1', '2026-06-01')).toEqual({ schnitt: 2.5, anzahl: 2, ampel: 'kritisch' });
    expect(zufriedenheit([], 'F-1')).toBeNull();
    const text = kritikNachricht({ ...f(2), anlass: 'karte', bezug_titel: 'Banner <neu>', text: 'Zu spät' } as KundenFeedback, { firmaName: 'Alpenglanz', kontaktName: 'Sophie', hub: 'https://crm.velonify.de/' });
    expect(text).toContain('★★☆☆☆');
    expect(text).toContain('Banner &lt;neu&gt;');
    expect(text).toContain('https://crm.velonify.de/#/kunden/F-1/portal');
  });
});
