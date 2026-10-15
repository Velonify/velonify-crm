import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { findeBerechtigung, kundensicht, loginMail, pruefeBerechtigung } from './portalApi';

async function demo() {
  const { service } = await createDemoBackend(() => 'lukas@velonify.de');
  const db = await service.load();
  const firma = db.firmen.find((f) => f.name === 'Alpenglanz Kosmetik AG')!;
  return { service, db, firma };
}

describe('portal API', () => {
  it('finds a login only for active logins of active clients, case-insensitive', async () => {
    const { service, db, firma } = await demo();
    let portal = await service.loadPortalDaten();
    const sophie = findeBerechtigung(db, portal, '  SOPHIE@alpenglanz.example ');
    expect(sophie?.kontakt.vorname).toBe('Sophie');
    expect(findeBerechtigung(db, portal, 'tobias@alpenglanz.example')).toBeNull();
    expect(findeBerechtigung(db, portal, '')).toBeNull();
    expect(findeBerechtigung(db, portal, 'unbekannt@example.com')).toBeNull();

    // Switched off in the hub: the session check fails right away.
    await service.setPortalZugang(firma.id, sophie!.kontakt.id, false);
    portal = await service.loadPortalDaten();
    expect(pruefeBerechtigung(db, portal, sophie!.kontakt.id, firma.id)).toBeNull();
    // A forged firm id never matches.
    await service.setPortalZugang(firma.id, sophie!.kontakt.id, true);
    portal = await service.loadPortalDaten();
    expect(pruefeBerechtigung(db, portal, sophie!.kontakt.id, 'F-ANDERE')).toBeNull();
    // A firm that is no client any more loses the portal.
    const ehemalig = { ...db, firmen: db.firmen.map((f) => (f.id === firma.id ? { ...f, status: 'ehemalig' } : f)) };
    expect(pruefeBerechtigung(ehemalig, portal, sophie!.kontakt.id, firma.id)).toBeNull();
  });

  it('shows only released records of the own client, with whitelisted fields', async () => {
    const { service, db, firma } = await demo();
    const [kunden, todos, portal] = await Promise.all([service.loadKundenDaten(), service.loadTodoDaten(), service.loadPortalDaten()]);
    const hero = todos.aufgaben.find((a) => a.titel === 'Startseiten-Hero Winterkollektion')!;
    await service.kommentiereKarte(hero.id, 'Entwurf ist fertig.');
    const sicht = kundensicht({
      berechtigung: findeBerechtigung(db, portal, 'sophie@alpenglanz.example')!,
      db,
      kunden,
      todos: await service.loadTodoDaten(),
      portal,
      dateien: [],
      teamDomain: 'velonify.de',
    });

    expect(sicht.kunde.name).toBe('Alpenglanz Kosmetik AG');
    expect(sicht.ich.vorname).toBe('Sophie');
    const titel = sicht.karten.map((k) => k.titel);
    expect(titel).toContain('Black-Week-Banner einbauen');
    expect(titel).not.toContain('Core Web Vitals der Kategorieseiten prüfen');
    expect(titel).not.toContain('Angebot Nordlicht nachfassen');
    const heroSicht = sicht.karten.find((k) => k.id === hero.id)!;
    expect(heroSicht.phase).toBe('wartet');
    expect(heroSicht.kommentare).toEqual([expect.objectContaining({ von: 'Lukas', team: true, text: 'Entwurf ist fertig.' })]);
    expect(sicht.karten.find((k) => k.titel === 'Neue Produktseiten live')!.phase).toBe('erledigt');
    expect(Object.keys(heroSicht).sort()).toEqual(['anfrage', 'beschreibung', 'checkliste', 'erledigt_am', 'faellig_am', 'freigabe', 'freigabe_am', 'id', 'kommentare', 'phase', 'titel', 'zustaendig']);

    // Released news of the client plus released company-wide news; internal links stay out.
    expect(sicht.news.every((n) => kunden.news.find((x) => x.id === n.id)!.sichtbar_kunde)).toBe(true);
    expect(sicht.links.map((l) => l.titel).sort()).toEqual(['Brand-Guidelines', 'Relaunch-Briefing']);
    expect(sicht.werkzeuge).toEqual(['utm']);
    expect(sicht.fahrplan.map((m) => m.titel)).toEqual(['Migration', 'Tracking', 'Design & Inhalte', 'Black Week', 'Go-live Phase 2']);
    expect(JSON.stringify(sicht)).not.toMatch(/Nordlicht|Kleinod|labels|geaendert_von|erstellt_von/);
    expect(firma.id).toBeTruthy();
  });

  it('writes the login mail in du-form with the link', () => {
    const mail = loginMail('Sophie', 'https://kunden.velonify.de/#/anmelden/abc');
    expect(mail.text).toContain('Hallo Sophie,');
    expect(mail.text).toContain('https://kunden.velonify.de/#/anmelden/abc');
    expect(loginMail('', 'x').text.startsWith('Hallo,')).toBe(true);
  });
});
