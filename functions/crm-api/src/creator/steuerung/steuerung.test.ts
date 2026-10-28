import { describe, expect, it } from 'vitest';
import { testDb } from '../../../../../db/test/testDb';
import type { InstanzRolleMitSupport } from '../../../../../src/data/instanz';
import type { InstanzNeuigkeit, InstanzStatus } from '../../../../../src/data/plattform';
import { InstanzStore } from '../../../../../src/data/postgres/instanzStore';
import type { RechtDaten, StartDaten } from '../../../../../src/creator/start/typen';
import { behandleInstanz, behandleOeffentlich, instanzRolle, type InstanzDienste } from '../../instanz';
import { speicherGeheimnisse } from '../geheimnisse';
import { testKi } from '../ki';
import { behandleSteuerung } from '../steuerung';
import { wocheVon } from './start';

const SUPPORT = ['lukas@velonify.de'];
// A Wednesday; the week runs from Monday 2026-11-02 to Sunday 2026-11-08.
const JETZT = new Date('2026-11-04T09:00:00Z');

async function aufbau(umgebung: Record<string, string> = {}) {
  const { pool } = await testDb();
  const instanz = new InstanzStore(pool);
  const dienste: InstanzDienste = {
    profil: 'creator',
    instanz,
    pool,
    ki: testKi(() => '{}'),
    geheimnisse: speicherGeheimnisse(),
    umgebung: { hubUrl: 'https://beispiel.velonify.de', apiUrl: 'https://api.example', wert: (name) => umgebung[name] },
    jetzt: () => JETZT,
  };
  const als = async (email: string) => {
    const rolle = (await instanzRolle(instanz, email, SUPPORT)) as InstanzRolleMitSupport;
    return (methode: string, pfad: string, body?: unknown) => behandleInstanz(methode, pfad, body, { ...dienste, email, rolle });
  };
  const steuer = (methode: string, pfad: string, body?: unknown) => behandleSteuerung(methode, pfad, body, dienste);
  const lukas = await als('lukas@velonify.de');
  await lukas('POST', '/instanz/einstellungen', { name: 'Beispiel' });
  await lukas('POST', '/instanz/zugang', { email: 'mara@beispiel.example', name: 'Mara Beispiel', rolle: 'admin' });
  await lukas('POST', '/instanz/zugang', { email: 'kim@beispiel.example', name: 'Kim Vorschau', rolle: 'team' });
  await lukas('POST', '/instanz/zugang', { email: 'jo@beispiel.example', name: 'Jo Schnitt', rolle: 'schnitt' });
  await lukas('POST', '/instanz/zugang', { email: 'alt@beispiel.example', name: 'Alt', rolle: 'team', aktiv: false });
  return { pool, dienste, als, steuer };
}

describe('Steuerung einer Instanz aus dem Velonify Hub', { timeout: 60_000 }, () => {
  it('reports version, blocks, logins, channels, KI use of the month and storage – metadata only', async () => {
    const { pool, steuer, als } = await aufbau({ HUB_VERSION: 'a'.repeat(40) });
    await (await als('mara@beispiel.example'))('GET', '/instanz/ich');
    await pool.query(`INSERT INTO kanal_konten (id, plattform, handle, status, letzte_abholung, fehler) VALUES ('K-1', 'youtube', '@geheim', 'fehler', '2026-11-04T04:00:00Z', 'Token abgelaufen')`);
    await pool.query(`INSERT INTO instanz_ki_nutzung (am, email, zweck, modell, tokens_ein, tokens_aus) VALUES
      ('2026-11-01T08:00:00Z', 'mara@beispiel.example', 'merkmale', 'claude-haiku-5-5', 100, 20),
      ('2026-11-03T08:00:00Z', NULL, 'wochenbericht', 'claude-sonnet-5-5', 1000, 400),
      ('2026-10-31T22:30:00Z', NULL, 'merkmale', 'claude-haiku-5-5', 50, 10),
      ('2026-10-20T08:00:00Z', NULL, 'merkmale', 'claude-haiku-5-5', 999, 999)`);
    await pool.query(`INSERT INTO inhalte (id, titel, kanal) VALUES ('I-1', 'Geheimer Videotitel', 'tiktok')`);

    const antwort = await steuer('GET', '/steuerung/status');
    expect(antwort.status).toBe(200);
    const s = antwort.daten as InstanzStatus;
    expect(s).toMatchObject({ version: 'a'.repeat(40), profil: 'creator', name: 'Beispiel', velonify_zugang: true, neuigkeiten: 0 });
    expect(s.bausteine).toContain('contentplan');
    expect(s.zugaenge).toMatchObject({ aktiv: 3, inaktiv: 1, rollen: { admin: 1, team: 1, schnitt: 1 }, aktiv_7_tage: 1 });
    expect(s.zugaenge.letzter_login).not.toBe('');
    expect(s.kanaele).toEqual([{ plattform: 'youtube', status: 'fehler', beispiel: false, verbunden_am: '', letzte_abholung: '2026-11-04T04:00:00.000Z', fehler: 'Abruf fehlgeschlagen. Details im Kanalbereich der Instanz.' }]);
    // November in Berlin starts at 2026-10-31 23:00 UTC: the call at 22:30 UTC still counts for October.
    expect(s.ki).toMatchObject({ monat: '2026-11', aufrufe: 2, tokens_ein: 1100, tokens_aus: 420 });
    expect(s.speicher.datenbank_bytes).toBeGreaterThan(0);
    // Nothing that identifies people or content leaves the instance.
    const roh = JSON.stringify(s);
    for (const geheim of ['mara@', 'Mara', 'Geheimer Videotitel', '@geheim']) expect(roh).not.toContain(geheim);
  });

  it('switches building blocks with the same check as the Einrichtung, also under the Bauplan name "funktionen"', async () => {
    const { steuer, als } = await aufbau();
    expect((await steuer('POST', '/steuerung/bausteine', { bausteine: { gibtsnicht: true } })).status).toBe(400);
    expect((await steuer('POST', '/steuerung/bausteine', { bausteine: { benchmarking: 'ja' } })).status).toBe(400);
    expect((await steuer('GET', '/steuerung/bausteine')).status).toBe(405);
    const an = await steuer('POST', '/steuerung/bausteine', { bausteine: { benchmarking: true, whiteboard: true } });
    expect(an.status).toBe(200);
    expect((an.daten as { bausteine: string[]; werkzeuge: string[] }).bausteine).toEqual(expect.arrayContaining(['benchmarking', 'whiteboard', 'contentplan']));
    expect((an.daten as { werkzeuge: string[] }).werkzeuge).toContain('whiteboard');
    const aus = await steuer('POST', '/steuerung/funktionen', { bausteine: { kooperationen: false } });
    expect((aus.daten as { bausteine: string[] }).bausteine).not.toContain('kooperationen');
    expect((aus.daten as { bausteine: string[] }).bausteine).toContain('benchmarking');
    const ich = (await (await als('kim@beispiel.example'))('GET', '/instanz/ich')).daten as { werkzeuge: string[] };
    expect(ich.werkzeuge).toContain('whiteboard');
    expect(ich.werkzeuge).not.toContain('kooperationen');
  });

  it('creates, lists and withdraws news for "Neu im Hub"', async () => {
    const { steuer } = await aufbau();
    expect((await steuer('POST', '/steuerung/neuigkeit', { titel: '', text: 'x' })).status).toBe(400);
    expect((await steuer('POST', '/steuerung/neuigkeit', { titel: 'x', text: 'y', link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await steuer('POST', '/steuerung/neuigkeit', { titel: 'x', text: 'y', werkzeug: 'crm' })).status).toBe(400);
    const neu = await steuer('POST', '/steuerung/neuigkeit', { titel: 'Berichte als PDF', text: 'Jeder Bericht lässt sich jetzt drucken.', link: '/analytics/berichte', werkzeug: 'analytics' });
    expect(neu.status).toBe(200);
    const { neuigkeit } = neu.daten as { neuigkeit: InstanzNeuigkeit };
    expect(neuigkeit).toMatchObject({ titel: 'Berichte als PDF', link: '/analytics/berichte', werkzeug: 'analytics', von: 'Velonify', archiviert: false });
    expect(((await steuer('GET', '/steuerung/status')).daten as InstanzStatus).neuigkeiten).toBe(1);
    expect((await steuer('POST', '/steuerung/neuigkeit/archivieren', { id: 'NH-GIBTSNICHT' })).status).toBe(404);
    expect((await steuer('POST', '/steuerung/neuigkeit/archivieren', { id: neuigkeit.id })).status).toBe(200);
    const liste = (await steuer('GET', '/steuerung/neuigkeiten')).daten as { neuigkeiten: InstanzNeuigkeit[] };
    expect(liste.neuigkeiten).toHaveLength(1);
    expect(liste.neuigkeiten[0].archiviert).toBe(true);
    expect((await steuer('GET', '/steuerung/unbekannt')).status).toBe(404);
  });
});

describe('Home einer Instanz', { timeout: 60_000 }, () => {
  it('knows the week from Monday to Sunday', () => {
    expect(wocheVon('2026-11-04')).toEqual({ von: '2026-11-02', bis: '2026-11-08' });
    expect(wocheVon('2026-11-02')).toEqual({ von: '2026-11-02', bis: '2026-11-08' });
    expect(wocheVon('2026-11-08')).toEqual({ von: '2026-11-02', bis: '2026-11-08' });
  });

  it('shows this week, deadlines, approvals for me, numbers, the newest report and news', async () => {
    const { pool, als, steuer } = await aufbau();
    await steuer('POST', '/steuerung/bausteine', { bausteine: { freigaben: true } });
    await pool.query(`INSERT INTO inhalte (id, titel, kanal, status, geplant_am, zustaendig) VALUES
      ('I-1', 'Vlog Herbst', 'youtube', 'schnitt', '2026-11-05', 'Kim'),
      ('I-2', 'Nächste Woche', 'tiktok', 'idee', '2026-11-12', NULL),
      ('I-3', 'Archiviert', 'tiktok', 'idee', '2026-11-05', NULL)`);
    await pool.query(`UPDATE inhalte SET archiviert = true WHERE id = 'I-3'`);
    await pool.query(`INSERT INTO fristen (id, titel, datum, art, quelle, bezug_id, erledigt) VALUES
      ('FR-1', 'Steuerfrist', '2026-11-06', 'gk', 'manuell', NULL, false),
      ('FR-2', 'Überfällig', '2026-10-20', 'abgabe', 'manuell', NULL, false),
      ('FR-3', 'Erledigt', '2026-11-06', 'abgabe', 'manuell', NULL, true),
      ('FR-4', 'Upload Vlog', '2026-11-05', 'upload', 'inhalt', 'I-1', false),
      ('FR-5', 'Nächsten Monat', '2026-12-01', 'dreh', 'manuell', NULL, false)`);
    await pool.query(`INSERT INTO freigaben (id, objekt_typ, objekt_id, titel, freigeber, angefragt_von) VALUES
      ('FG-1', 'skript', 'S-1', 'Skript Vlog', 'Kim', 'Mara'), ('FG-2', 'skript', 'S-2', 'Für Mara', 'Mara', 'Kim')`);
    await pool.query(`INSERT INTO kanal_konten (id, plattform, handle, status, beispiel) VALUES ('K-1', 'tiktok', '@beispiel', 'beispiel', true), ('K-2', 'youtube', '@beispiel', 'getrennt', false)`);
    await pool.query(`INSERT INTO kanal_werte (konto_id, datum, follower, aufrufe, beispiel) VALUES
      ('K-1', '2026-10-27', 1000, 50, true), ('K-1', '2026-11-02', 1100, 70, true), ('K-1', '2026-11-03', 1120, 30, true)`);
    await pool.query(`INSERT INTO berichte (id, typ, von, bis, status, beispiel) VALUES ('B-1', 'woche', '2026-10-19', '2026-10-25', 'freigegeben', true), ('B-2', 'woche', '2026-10-26', '2026-11-01', 'entwurf', true)`);
    await steuer('POST', '/steuerung/neuigkeit', { titel: 'Für alle', text: 'Neu' });
    await steuer('POST', '/steuerung/neuigkeit', { titel: 'Nur Whiteboard', text: 'Neu', werkzeug: 'whiteboard' });

    const antwort = await (await als('kim@beispiel.example'))('GET', '/c/start');
    expect(antwort.status).toBe(200);
    const d = antwort.daten as StartDaten;
    expect(d).toMatchObject({ heute: '2026-11-04', woche: { von: '2026-11-02', bis: '2026-11-08' }, person: 'Kim', rundgang: true });
    expect(d.kacheln).toEqual(['uploads', 'fristen', 'kooperationen', 'freigaben', 'zahlen', 'bericht']);
    expect(d.uploads.map((u) => u.id)).toEqual(['I-1']);
    // Upload deadlines are in the uploads tile already; overdue ones come along.
    expect(d.fristen.map((f) => f.id)).toEqual(['FR-2', 'FR-1']);
    expect(d.freigaben.map((f) => f.id)).toEqual(['FG-1']);
    expect(d.zahlen).toEqual([{ id: 'K-1', plattform: 'tiktok', handle: '@beispiel', status: 'beispiel', datum: '2026-11-03', follower: 1120, follower_plus: 120, aufrufe: 30, beispiel: true }]);
    expect(d.bericht).toMatchObject({ id: 'B-2', status: 'entwurf', beispiel: true });
    // Whiteboard is off in this instance: its news stays away.
    expect(d.neuigkeiten.map((n) => [n.titel, n.neu])).toEqual([['Für alle', true]]);
    expect(d.kooperationen).toEqual([]);
  });

  it('leaves out tiles of switched-off blocks and reads cooperations when the table exists, amounts only for those who see them', async () => {
    const { pool, als, steuer } = await aufbau();
    await steuer('POST', '/steuerung/bausteine', { bausteine: { contentplan: false, berichte: false } });
    await pool.query(`INSERT INTO kooperationen (id, partner, faellig_am, stand, zahlung, betrag, waehrung, archiviert) VALUES
      ('KO-1', 'Marke A', '2026-11-07', 'umsetzung', 'offen', 1500, 'EUR', false),
      ('KO-2', 'Marke B', '2026-11-03', 'rechnung', 'bezahlt', 900, 'EUR', false),
      ('KO-3', 'Marke C', '2026-11-20', 'vertrag', 'offen', 300000, 'JPY', false),
      ('KO-4', 'Marke D', '2026-11-05', 'umsetzung', 'offen', 100, 'EUR', true)`);

    const admin = (await (await als('mara@beispiel.example'))('GET', '/c/start')).daten as StartDaten;
    expect(admin.kacheln).toEqual(['fristen', 'kooperationen', 'zahlen']);
    expect(admin.uploads).toEqual([]);
    expect(admin.bericht).toBeNull();
    expect(admin.kooperationen).toEqual([{ id: 'KO-1', partner: 'Marke A', faellig_am: '2026-11-07', stand: 'umsetzung', zahlung: 'offen', betrag: 1500, waehrung: 'EUR' }]);

    const schnitt = (await (await als('jo@beispiel.example'))('GET', '/c/start')).daten as StartDaten;
    expect(schnitt.kooperationen[0]).toMatchObject({ partner: 'Marke A', betrag: null, waehrung: '' });
  });

  it('remembers the tour per person, restarts it on request and marks news as seen', async () => {
    const { als, steuer } = await aufbau();
    await steuer('POST', '/steuerung/neuigkeit', { titel: 'Erste', text: 'x' });
    const kim = await als('kim@beispiel.example');
    expect((await kim('POST', '/c/start/rundgang', {})).status).toBe(400);
    expect((await kim('POST', '/c/start/rundgang', { gesehen: true })).daten).toEqual({ rundgang: false });
    expect(((await kim('GET', '/c/start')).daten as StartDaten).rundgang).toBe(false);
    // Another person still gets it.
    expect(((await (await als('mara@beispiel.example'))('GET', '/c/start')).daten as StartDaten).rundgang).toBe(true);
    expect((await kim('POST', '/c/start/rundgang', { neu_starten: true })).daten).toEqual({ rundgang: true });
    expect(((await kim('GET', '/c/start')).daten as StartDaten).rundgang).toBe(true);

    expect(((await kim('GET', '/c/start')).daten as StartDaten).neuigkeiten[0].neu).toBe(true);
    expect((await kim('POST', '/c/start/neuigkeiten/gesehen', {})).status).toBe(200);
    expect(((await kim('GET', '/c/start')).daten as StartDaten).neuigkeiten[0].neu).toBe(false);
  });

  it('keeps the legal details: admins write, everyone reads, the public pages too', async () => {
    const { als, dienste } = await aufbau();
    const angaben = { verantwortlicher: 'Beispiel Media GK', anschrift: '1-2-3 Beispielstraße\n100-0001 Tokio\nJapan', email: 'kontakt@beispiel.example' };
    expect((await (await als('kim@beispiel.example'))('POST', '/c/start/recht', { angaben })).status).toBe(403);
    const admin = await als('mara@beispiel.example');
    expect((await admin('POST', '/c/start/recht', { angaben: { gibtsnicht: 'x' } })).status).toBe(400);
    expect((await admin('POST', '/c/start/recht', { angaben: { email: 'keine-adresse' } })).status).toBe(400);
    expect((await admin('POST', '/c/start/recht', { angaben: { anschrift: 'x'.repeat(401) } })).status).toBe(400);
    const gespeichert = await admin('POST', '/c/start/recht', { angaben });
    expect(gespeichert.status).toBe(200);
    expect(gespeichert.daten as RechtDaten).toMatchObject({ name: 'Beispiel', hub_url: 'https://beispiel.velonify.de', stand: '2026-11-04', angaben: { ...angaben, telefon: '' } });

    const oeffentlich = await behandleOeffentlich('GET', '/oeffentlich/start/recht', undefined, {}, dienste, '127.0.0.1');
    expect(oeffentlich.status).toBe(200);
    expect((oeffentlich.daten as RechtDaten).angaben.verantwortlicher).toBe('Beispiel Media GK');
    expect((await behandleOeffentlich('POST', '/oeffentlich/start/recht', {}, {}, dienste, '127.0.0.1')).status).toBe(405);
    expect((await behandleOeffentlich('GET', '/oeffentlich/start/sonstwas', undefined, {}, dienste, '127.0.0.1')).status).toBe(404);
    // The settings route of the hub cannot overwrite them.
    expect((await admin('POST', '/einstellungen', { values: { instanz_recht_email: 'boese@example.com' } })).status).not.toBe(200);
  });
});
