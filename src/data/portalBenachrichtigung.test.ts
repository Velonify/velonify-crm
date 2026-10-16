import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import { findeBerechtigung, kundensicht, sichtbareKarten } from './portalApi';
import { einstellungenVon, ereignisseSeit, hinweisNachricht, pruefeEinstellungen, STANDARD_EINSTELLUNGEN, updateFaellig, updateNachricht, wege } from './portalBenachrichtigung';
import type { AufgabenKommentar, KundenNews } from './types';

const SEIT = '2026-10-16T08:00:00.000Z';
const BIS = '2026-10-16T08:15:00.000Z';
const IM_FENSTER = '2026-10-16T08:05:00.000Z';

async function demo() {
  const { service } = await createDemoBackend(() => 'lukas@velonify.de');
  const db = await service.load();
  const portal = await service.loadPortalDaten();
  const berechtigung = findeBerechtigung(db, portal, 'sophie@alpenglanz.example')!;
  const todos = await service.loadTodoDaten();
  const kunden = await service.loadKundenDaten();
  return { db, portal, berechtigung, todos, kunden };
}

describe('Einstellungen', () => {
  it('fills in defaults and checks input', () => {
    expect(einstellungenVon({ updates: '', kanal_updates: 'quatsch', kanal_hinweise: 'slack' })).toEqual({ ...STANDARD_EINSTELLUNGEN, kanal_hinweise: 'slack' });
    expect(pruefeEinstellungen({ updates: 'taeglich', kanal_updates: 'beide', kanal_hinweise: 'slack' }, true)).toEqual({ updates: 'taeglich', kanal_updates: 'beide', kanal_hinweise: 'slack' });
    expect(() => pruefeEinstellungen({ updates: 'stuendlich', kanal_updates: 'email', kanal_hinweise: 'email' }, true)).toThrow(ValidationError);
    expect(() => pruefeEinstellungen({ updates: 'aus', kanal_updates: 'slack', kanal_hinweise: 'email' }, false)).toThrow(/Slack-Channel/);
  });

  it('lets the team change the settings of a login in the hub', async () => {
    const { service } = await createDemoBackend(() => 'lukas@velonify.de');
    const zugang = (await service.loadPortalDaten()).zugaenge.find((z) => z.aktiv)!;
    const neu = await service.setPortalEinstellungen(zugang.id, { updates: 'monatlich', kanal_updates: 'beide', kanal_hinweise: 'slack' });
    expect(neu).toMatchObject({ updates: 'monatlich', kanal_updates: 'beide', kanal_hinweise: 'slack', geaendert_von: 'lukas@velonify.de' });
    await expect(service.setPortalEinstellungen(zugang.id, { updates: 'jede Stunde' as 'aus', kanal_updates: 'email', kanal_hinweise: 'email' })).rejects.toThrow(ValidationError);
  });

  it('falls back to e-mail when Slack is chosen but there is no channel', () => {
    expect(wege('slack', true)).toEqual({ slack: true, email: false });
    expect(wege('beide', true)).toEqual({ slack: true, email: true });
    expect(wege('slack', false)).toEqual({ slack: false, email: true });
  });
});

describe('updateFaellig', () => {
  // 2026-10-19 is a Monday; 06:30 UTC is 08:30 in Berlin.
  const montag = new Date('2026-10-19T06:30:00Z');
  it('sends weekly updates on Monday from 8 o’clock, once', () => {
    expect(updateFaellig('woechentlich', '2026-10-12T06:20:00Z', montag)).toEqual({ faellig: true, seit: '2026-10-12T06:20:00Z' });
    expect(updateFaellig('woechentlich', '', new Date('2026-10-19T05:30:00Z')).faellig).toBe(false);
    expect(updateFaellig('woechentlich', '2026-10-19T06:15:00Z', montag).faellig).toBe(false);
    expect(updateFaellig('woechentlich', '', new Date('2026-10-20T06:30:00Z')).faellig).toBe(false);
  });

  it('sends daily updates on workdays and monthly ones on the 1st', () => {
    expect(updateFaellig('taeglich', '', new Date('2026-10-17T06:30:00Z')).faellig).toBe(false);
    const erstes = updateFaellig('taeglich', '', montag);
    expect(erstes.faellig).toBe(true);
    expect(erstes.seit).toBe('2026-10-18T06:30:00.000Z');
    expect(updateFaellig('monatlich', '', new Date('2026-11-01T07:30:00Z')).faellig).toBe(true);
    expect(updateFaellig('monatlich', '', montag).faellig).toBe(false);
    expect(updateFaellig('aus', '', montag).faellig).toBe(false);
  });
});

describe('ereignisseSeit', () => {
  it('collects what the client can see, without their own actions', async () => {
    const { berechtigung, todos, kunden, portal } = await demo();
    const karte = sichtbareKarten(todos, berechtigung.firma.id)[0];
    const intern = todos.aufgaben.find((a) => !a.sichtbar_kunde)!;
    const kommentar = (von: string, aufgabe_id = karte.id, text = 'Ist drin.'): AufgabenKommentar => ({ id: `C-${von}${aufgabe_id}`, aufgabe_id, text, von, datum: IM_FENSTER });
    const news = (titel: string, sichtbar_kunde: boolean, erstellt_am = IM_FENSTER): KundenNews =>
      ({ ...kunden.news[0], id: `N-${titel}`, firma_id: berechtigung.firma.id, titel, text: 'Text', art: 'update', sichtbar_kunde, archiviert: false, erstellt_am }) as KundenNews;

    const ereignisse = ereignisseSeit({
      berechtigung,
      kunden: { news: [news('Sichtbar', true), news('Intern', false), news('Alt', true, '2026-10-15T10:00:00Z')] },
      todos: {
        ...todos,
        aufgaben: todos.aufgaben.map((a) => (a.id === karte.id ? { ...a, freigabe: 'offen' as const, freigabe_am: IM_FENSTER } : a)),
        kommentare: [kommentar('julian@velonify.de'), kommentar('sophie@alpenglanz.example'), kommentar('julian@velonify.de', intern.id)],
      },
      portal,
      dateien: [
        { id: 'D1', name: 'Entwurf.pdf', mimeType: 'application/pdf', geaendert: IM_FENSTER, von: 'velonify' },
        { id: 'D2', name: 'Logo.svg', mimeType: 'image/svg+xml', geaendert: IM_FENSTER, von: 'kunde' },
      ],
      teamDomain: 'velonify.de',
      seit: SEIT,
      bis: BIS,
    });

    expect(ereignisse.map((e) => [e.art, e.titel])).toEqual([
      ['freigabe', karte.titel],
      ['antwort', karte.titel],
      ['datei', 'Entwurf.pdf'],
      ['neuigkeit', 'Sichtbar'],
    ]);
  });
});

describe('Nachrichten', () => {
  it('names a single event in the subject and escapes the HTML', () => {
    const n = hinweisNachricht({ ereignisse: [{ art: 'datei', titel: 'Angebot <final>.pdf', text: '', datum: IM_FENSTER }], vorname: 'Sophie', firmaName: 'Alpenglanz', portalUrl: 'https://kunden.velonify.de' });
    expect(n.betreff).toBe('Neue Datei: Angebot <final>.pdf');
    expect(n.html).toContain('Angebot &lt;final&gt;.pdf');
    expect(n.html).not.toContain('<final>');
    expect(n.slack).toContain('<https://kunden.velonify.de|Im Kundenportal ansehen>');
    expect(n.text).toContain('Hallo Sophie,');
  });

  it('builds an update only when there is something to report', async () => {
    const { db, berechtigung, todos, kunden, portal } = await demo();
    const sicht = kundensicht({ berechtigung, db, kunden, todos, portal, dateien: [], teamDomain: 'velonify.de' });
    const leer = { ...sicht, karten: sicht.karten.filter((k) => k.phase === 'arbeit' || k.phase === 'geplant') };
    expect(updateNachricht({ rhythmus: 'woechentlich', sicht: leer, ereignisse: [], seit: SEIT, portalUrl: 'https://kunden.velonify.de' })).toBeNull();

    const mitFreigabe = { ...sicht, karten: [...leer.karten, { ...leer.karten[0], id: 'X', titel: 'Banner prüfen', phase: 'wartet' as const }] };
    const update = updateNachricht({ rhythmus: 'woechentlich', sicht: mitFreigabe, ereignisse: [], seit: SEIT, portalUrl: 'https://kunden.velonify.de' })!;
    expect(update.betreff).toBe(`Dein Wochen-Update · ${sicht.kunde.name}`);
    expect(update.text).toContain('Wartet auf deine Freigabe:\n- Banner prüfen');
  });
});
