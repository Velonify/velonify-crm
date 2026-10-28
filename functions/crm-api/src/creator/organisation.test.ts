import { describe, expect, it } from 'vitest';
import { testDb } from '../../../../db/test/testDb';
import { InstanzStore } from '../../../../src/data/postgres/instanzStore';
import type { InstanzRolleMitSupport } from '../../../../src/data/instanz';
import type { Frist, FristSerie, KalenderAbo } from '../../../../src/creator/kalender/typen';
import type { AblageOrdner, PasswortmanagerStand } from '../../../../src/creator/ablage/typen';
import { behandleInstanz, behandleOeffentlich, behandleTakt, instanzRolle, type InstanzDienste } from '../instanz';
import { speicherGeheimnisse } from './geheimnisse';
import { testKi } from './ki';
import { falte, kalenderDatei } from './organisation';

const SUPPORT = ['lukas@velonify.de'];
// 2026-11-10, 10:00 in Berlin.
const JETZT = new Date('2026-11-10T09:00:00Z');

async function aufbau() {
  const { pool } = await testDb();
  const instanz = new InstanzStore(pool);
  const dienste: InstanzDienste = {
    profil: 'creator',
    instanz,
    pool,
    ki: testKi(() => '{}'),
    geheimnisse: speicherGeheimnisse(),
    umgebung: { hubUrl: 'https://beispiel.velonify.de', apiUrl: 'https://api.example', wert: () => undefined },
    jetzt: () => JETZT,
  };
  const als = async (email: string) => {
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    return (methode: string, pfad: string, body?: unknown) => behandleInstanz(methode, pfad, body, { ...dienste, email, rolle: rolle as InstanzRolleMitSupport });
  };
  const lukas = await als('lukas@velonify.de');
  await lukas('POST', '/instanz/einstellungen', { name: 'Beispiel' });
  await lukas('POST', '/instanz/zugang', { email: 'mara@example.com', name: 'Mara Beispiel', rolle: 'admin' });
  await lukas('POST', '/instanz/zugang', { email: 'kim@example.com', name: 'Kim Test', rolle: 'team' });
  return { pool, instanz, dienste, als, lukas, mara: await als('mara@example.com'), kim: await als('kim@example.com') };
}

const fristen = (a: { daten: unknown }) => (a.daten as { fristen: Frist[] }).fristen;

describe('Modul Organisation: Kalender mit Fristen', { timeout: 60_000 }, () => {
  it('creates, edits, completes and archives deadlines and lists them by range, overdue ones always', async () => {
    const { kim, mara } = await aufbau();
    expect((await kim('POST', '/c/kalender/speichern', { titel: '', datum: '2026-11-12' })).status).toBe(400);
    expect((await kim('POST', '/c/kalender/speichern', { titel: 'Dreh', datum: '2026-11-31' })).status).toBe(400);
    expect((await kim('POST', '/c/kalender/speichern', { titel: 'Dreh', datum: '2026-11-12', uhrzeit: '25:00' })).status).toBe(400);
    expect((await kim('POST', '/c/kalender/speichern', { titel: 'Dreh', datum: '2026-11-12', art: 'party' })).status).toBe(400);

    const neu = await kim('POST', '/c/kalender/speichern', { titel: 'Drehtag Küche', datum: '2026-11-12', uhrzeit: '14:00', art: 'dreh', zustaendig: 'Kim, Mara, Kim', notiz: 'Licht mitnehmen', link: 'https://example.com/plan' });
    expect(neu.status).toBe(200);
    const frist = (neu.daten as { frist: Frist }).frist;
    expect(frist).toMatchObject({ titel: 'Drehtag Küche', datum: '2026-11-12', uhrzeit: '14:00', art: 'dreh', quelle: 'manuell', zustaendig: 'Kim, Mara', erledigt: false });
    await kim('POST', '/c/kalender/speichern', { titel: 'Alte Abgabe', datum: '2026-10-01', art: 'abgabe' });
    await kim('POST', '/c/kalender/speichern', { titel: 'Kampagne Start', datum: '2027-03-01', art: 'kampagne' });

    const liste = fristen(await mara('POST', '/c/kalender/liste', { von: '2026-11-01', bis: '2026-11-30' }));
    expect(liste.map((f) => f.titel)).toEqual(['Alte Abgabe', 'Drehtag Küche']);
    expect((await mara('POST', '/c/kalender/liste', { von: '2026-12-01', bis: '2026-11-01' })).status).toBe(400);

    const geaendert = await mara('POST', '/c/kalender/speichern', { id: frist.id, titel: 'Drehtag Küche', datum: '2026-11-13', art: 'dreh', zustaendig: 'Mara' });
    expect((geaendert.daten as { frist: Frist }).frist).toMatchObject({ datum: '2026-11-13', uhrzeit: '', zustaendig: 'Mara', geaendert_von: 'Mara' });
    expect(((await kim('POST', '/c/kalender/erledigt', { id: frist.id, erledigt: true })).daten as { frist: Frist }).frist.erledigt).toBe(true);
    expect((await kim('POST', '/c/kalender/archivieren', { id: frist.id, archiviert: true })).status).toBe(200);
    expect(fristen(await mara('POST', '/c/kalender/liste', { von: '2026-11-01', bis: '2026-11-30' })).map((f) => f.titel)).toEqual(['Alte Abgabe']);
    expect(fristen(await mara('POST', '/c/kalender/liste', { von: '2026-11-01', bis: '2026-11-30', archiv: true })).map((f) => f.titel)).toEqual(['Drehtag Küche']);
    expect(((await mara('POST', '/c/kalender/frist', { id: frist.id })).daten as { frist: Frist }).frist.archiviert).toBe(true);
    expect((await mara('POST', '/c/kalender/frist', { id: 'FR-NICHTDA' })).status).toBe(404);
  });

  it('shows deadlines of other modules but leaves editing to them', async () => {
    const { pool, kim } = await aufbau();
    await pool.query(`INSERT INTO fristen (id, titel, datum, art, quelle, bezug_id, link) VALUES ('FR-MODUL', 'Upload Beispielvideo', '2026-11-20', 'upload', 'inhalt', 'I-1', '/content?inhalt=I-1')`);
    const f = fristen(await kim('POST', '/c/kalender/liste', { von: '2026-11-01', bis: '2026-11-30' })).find((x) => x.id === 'FR-MODUL')!;
    expect(f).toMatchObject({ quelle: 'inhalt', link: '/content?inhalt=I-1' });
    expect((await kim('POST', '/c/kalender/speichern', { id: 'FR-MODUL', titel: 'X', datum: '2026-11-21' })).status).toBe(409);
    expect((await kim('POST', '/c/kalender/erledigt', { id: 'FR-MODUL', erledigt: true })).status).toBe(409);
    expect((await kim('POST', '/c/kalender/archivieren', { id: 'FR-MODUL', archiviert: true })).status).toBe(409);
  });

  it('writes series as single dates, keeps changed and done ones when the series changes, and archives with it', async () => {
    const { pool, kim, mara, dienste } = await aufbau();
    expect((await mara('POST', '/c/kalender/serie', { titel: 'Belege', start: '2026-11-30', rhythmus: 'woechentlich' })).status).toBe(400);
    expect((await mara('POST', '/c/kalender/serie', { titel: 'Belege', start: '2026-11-30', rhythmus: 'monatlich', ende: '2026-01-01' })).status).toBe(400);
    const angelegt = await mara('POST', '/c/kalender/serie', { titel: 'Belege an die Buchhaltung', start: '2026-10-31', rhythmus: 'monatlich', art: 'buchhaltung', zustaendig: 'Mara' });
    expect(angelegt.status).toBe(200);
    const serie = (angelegt.daten as { serie: FristSerie }).serie;
    // Past dates are not created; month ends fall on the last day.
    expect(serie.naechster).toBe('2026-11-30');
    const termine = fristen(await kim('POST', '/c/kalender/liste', { von: '2026-10-01', bis: '2027-03-31' })).filter((f) => f.serie_id === serie.id);
    expect(termine.map((f) => f.datum)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    expect(termine.every((f) => f.quelle === 'serie' && f.art === 'buchhaltung')).toBe(true);

    // One date done, one moved on its own, one skipped.
    await kim('POST', '/c/kalender/erledigt', { id: termine[0].id, erledigt: true });
    await kim('POST', '/c/kalender/speichern', { id: termine[1].id, titel: 'Belege vor Weihnachten', datum: '2026-12-22', art: 'buchhaltung' });
    await kim('POST', '/c/kalender/archivieren', { id: termine[2].id, archiviert: true });

    // Series changes: new title and quarterly; the done, moved and skipped dates stay as they are.
    await mara('POST', '/c/kalender/serie', { id: serie.id, titel: 'Belege', start: '2026-11-30', rhythmus: 'quartalsweise', art: 'buchhaltung', zustaendig: 'Kim' });
    const nachher = fristen(await kim('POST', '/c/kalender/liste', { von: '2026-10-01', bis: '2027-06-30' })).filter((f) => f.serie_id === serie.id);
    expect(nachher.map((f) => [f.datum, f.titel, f.erledigt, f.abweichend])).toEqual([
      ['2026-11-30', 'Belege an die Buchhaltung', true, false],
      ['2026-12-22', 'Belege vor Weihnachten', false, true],
      ['2027-02-28', 'Belege', false, false],
      ['2027-05-30', 'Belege', false, false],
    ]);
    // The monthly dates that left the series are archived, not deleted.
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM fristen WHERE quelle = 'serie' AND archiviert`);
    expect(rows[0].n).toBeGreaterThan(5);

    const liste = (await kim('GET', '/c/kalender/serien')).daten as { serien: FristSerie[] };
    expect(liste.serien[0]).toMatchObject({ titel: 'Belege', rhythmus: 'quartalsweise', naechster: '2026-12-22' });

    // Archiving the series takes all open future dates along; restoring brings them back.
    await mara('POST', '/c/kalender/serie/archivieren', { id: serie.id, archiviert: true });
    expect(fristen(await kim('POST', '/c/kalender/liste', { von: '2026-12-01', bis: '2027-12-31' })).filter((f) => f.serie_id === serie.id)).toEqual([]);
    await mara('POST', '/c/kalender/serie/archivieren', { id: serie.id, archiviert: false });
    expect(fristen(await kim('POST', '/c/kalender/liste', { von: '2027-01-01', bis: '2027-06-30' })).filter((f) => f.serie_id === serie.id).map((f) => f.datum)).toEqual(['2027-02-28', '2027-05-30']);

    // The timed job moves the horizon forward.
    const spaeter = { ...dienste, jetzt: () => new Date('2027-06-01T08:00:00Z') };
    const takt = await behandleTakt('kalender-serien', spaeter);
    expect(takt.daten).toMatchObject({ ok: true, ergebnis: { serien: 1 } });
    const { rows: weit } = await pool.query<{ max: string }>(`SELECT max(datum)::text AS max FROM fristen WHERE quelle = 'serie' AND NOT archiviert`);
    expect(weit[0].max >= '2028-05-30').toBe(true);
  });

  it('closes the calendar when its building block is off', async () => {
    const { lukas, kim } = await aufbau();
    await lukas('POST', '/instanz/einstellungen', { bausteine: { kalender: false } });
    expect((await kim('POST', '/c/kalender/liste', {})).status).toBe(403);
  });
});

describe('Modul Organisation: Kalender-Abo (ICS)', { timeout: 60_000 }, () => {
  it('hands out a secret link per person that serves all or only own deadlines and can be renewed or ended', async () => {
    const { kim, mara, dienste, lukas } = await aufbau();
    await mara('POST', '/c/kalender/speichern', { titel: 'Drehtag; Küche, Bad', datum: '2026-11-12', uhrzeit: '14:00', art: 'dreh', zustaendig: 'Kim' });
    await mara('POST', '/c/kalender/speichern', { titel: 'Abgabe Mediakit', datum: '2026-11-20', art: 'abgabe', zustaendig: 'Mara', link: '/kooperationen' });

    expect(((await kim('GET', '/c/kalender/abo')).daten as { abo: KalenderAbo | null }).abo).toBeNull();
    const erstes = ((await kim('POST', '/c/kalender/abo', { umfang: 'meine' })).daten as { abo: KalenderAbo; api_url: string });
    expect(erstes.api_url).toBe('https://api.example');
    expect(erstes.abo.token.length).toBeGreaterThanOrEqual(30);
    const abrufen = (token: string) => behandleOeffentlich('GET', `/oeffentlich/kalender/${token}.ics`, undefined, {}, dienste, '');

    const datei = await abrufen(erstes.abo.token);
    expect(datei.status).toBe(200);
    const { inhalt, typ } = datei.daten as { inhalt: string; typ: string };
    expect(typ).toBe('text/calendar; charset=utf-8');
    expect(inhalt).toContain('BEGIN:VCALENDAR');
    expect(inhalt).toContain('X-WR-CALNAME:Beispiel HUB · Fristen Kim');
    expect(inhalt).toContain('SUMMARY:Drehtag\\; Küche\\, Bad');
    expect(inhalt).toContain('DTSTART;TZID=Europe/Berlin:20261112T140000');
    expect(inhalt).not.toContain('Abgabe Mediakit');
    expect(inhalt.split('\r\n').every((z) => Buffer.byteLength(z, 'utf8') <= 75)).toBe(true);

    const alle = ((await kim('POST', '/c/kalender/abo', { umfang: 'alle' })).daten as { abo: KalenderAbo }).abo;
    expect(alle.token).toBe(erstes.abo.token);
    const alleDatei = (await abrufen(alle.token)).daten as { inhalt: string };
    expect(alleDatei.inhalt).toContain('DTSTART;VALUE=DATE:20261120');
    expect(alleDatei.inhalt).toContain('URL:https://beispiel.velonify.de/#/kooperationen');
    expect(((await kim('GET', '/c/kalender/abo')).daten as { abo: KalenderAbo }).abo.abgerufen_am).not.toBe('');

    // A new link makes the old one invalid.
    const neu = ((await kim('POST', '/c/kalender/abo', { neu: true })).daten as { abo: KalenderAbo }).abo;
    expect(neu.token).not.toBe(alle.token);
    expect((await abrufen(alle.token)).status).toBe(404);
    expect((await abrufen(neu.token)).status).toBe(200);
    expect((await abrufen('kurz')).status).toBe(404);

    // Removed logins and a switched-off calendar end the subscription.
    await lukas('POST', '/instanz/zugang', { email: 'kim@example.com', aktiv: false });
    expect((await abrufen(neu.token)).status).toBe(404);
    await lukas('POST', '/instanz/zugang', { email: 'kim@example.com', aktiv: true });
    expect((await abrufen(neu.token)).status).toBe(200);
    await lukas('POST', '/instanz/einstellungen', { bausteine: { kalender: false } });
    expect((await abrufen(neu.token)).status).toBe(404);
    await lukas('POST', '/instanz/einstellungen', { bausteine: { kalender: true } });

    await kim('POST', '/c/kalender/abo/beenden', {});
    expect((await abrufen(neu.token)).status).toBe(404);
    expect((await kim('POST', '/c/kalender/abo', { umfang: 'irgendwas' })).status).toBe(400);
  });

  it('folds long lines without splitting characters', () => {
    const lang = `DESCRIPTION:${'äöü'.repeat(40)}`;
    const gefaltet = falte(lang);
    expect(gefaltet.split('\r\n').every((z) => Buffer.byteLength(z, 'utf8') <= 75)).toBe(true);
    expect(gefaltet.replace(/\r\n /g, '')).toBe(lang);
    const datei = kalenderDatei([], { name: 'Test', hubUrl: 'https://x.example', host: 'x.example', jetzt: JETZT });
    expect(datei.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('Modul Organisation: Ablage und Passwortmanager', { timeout: 60_000 }, () => {
  it('lets admins set up the structure and everyone with the tool add subfolders once', async () => {
    const { kim, mara, lukas } = await aufbau();
    expect(((await kim('GET', '/c/ablage')).daten as { ordner: AblageOrdner[] }).ordner).toEqual([]);
    expect((await kim('POST', '/c/ablage/ordner', { schluessel: 'haupt', name: 'Beispiel HUB', drive_id: 'HAUPT_1234567890' })).status).toBe(403);
    expect((await mara('POST', '/c/ablage/ordner', { schluessel: 'content', name: 'Content', drive_id: 'CONTENT_1234567890' })).status).toBe(409);
    expect((await mara('POST', '/c/ablage/ordner', { schluessel: 'haupt', name: 'Beispiel HUB', drive_id: 'x' })).status).toBe(400);
    expect((await mara('POST', '/c/ablage/ordner', { schluessel: '../etc', name: 'X', drive_id: 'HAUPT_1234567890' })).status).toBe(400);
    expect((await mara('POST', '/c/ablage/ordner', { schluessel: 'haupt', name: 'Beispiel HUB', drive_id: 'HAUPT_1234567890' })).status).toBe(200);
    expect((await mara('POST', '/c/ablage/ordner', { schluessel: 'kooperationen', name: 'Kooperationen', drive_id: 'KOOP_1234567890' })).status).toBe(200);
    const verknuepft = await mara('POST', '/c/ablage/ordner', { schluessel: 'content', name: 'Material vom Schnitt', drive_id: 'SCHNITT_1234567890', art: 'verknuepft' });
    expect((verknuepft.daten as { ordner: AblageOrdner }).ordner).toMatchObject({ art: 'verknuepft', url: 'https://drive.google.com/drive/folders/SCHNITT_1234567890', erstellt_von: 'Mara' });

    const unter = await kim('POST', '/c/ablage/ordner', { schluessel: 'kooperationen/beispielmarke-2026', name: 'Beispielmarke 2026', drive_id: 'MARKE_1234567890' });
    expect(unter.daten).toMatchObject({ neu: true, ordner: { schluessel: 'kooperationen/beispielmarke-2026' } });
    const zweites = await kim('POST', '/c/ablage/ordner', { schluessel: 'kooperationen/beispielmarke-2026', name: 'Beispielmarke 2026', drive_id: 'ANDERER_1234567890' });
    expect(zweites.daten).toMatchObject({ neu: false, ordner: { drive_id: 'MARKE_1234567890' } });

    expect((await kim('POST', '/c/ablage/loesen', { schluessel: 'content' })).status).toBe(403);
    const geloest = (await mara('POST', '/c/ablage/loesen', { schluessel: 'content' })).daten as { ordner: AblageOrdner[] };
    expect(geloest.ordner.map((o) => o.schluessel)).toEqual(['haupt', 'kooperationen', 'kooperationen/beispielmarke-2026']);
    expect((await mara('POST', '/c/ablage/loesen', { schluessel: 'content' })).status).toBe(404);

    await lukas('POST', '/instanz/einstellungen', { bausteine: { ablage: false } });
    expect((await mara('GET', '/c/ablage')).status).toBe(403);
  });

  it('keeps the choice and the ticked steps of the password manager, set by admins, under both prefixes', async () => {
    const { kim, mara, lukas } = await aufbau();
    expect(((await kim('GET', '/c/ablage/passwortmanager')).daten as { stand: PasswortmanagerStand }).stand).toMatchObject({ wahl: null, haken: {} });
    expect((await kim('POST', '/c/ablage/passwortmanager', { wahl: 'bitwarden' })).status).toBe(403);
    expect((await mara('POST', '/c/ablage/passwortmanager', { wahl: 'zettel' })).status).toBe(400);
    expect((await mara('POST', '/c/ablage/passwortmanager', { schritt: 'gibt-es-nicht', erledigt: true })).status).toBe(400);
    await mara('POST', '/c/ablage/passwortmanager', { wahl: 'bitwarden' });
    await mara('POST', '/c/ablage/passwortmanager', { schritt: 'konto', erledigt: true });
    await mara('POST', '/c/kalender/passwortmanager', { schritt: '2fa-manager', erledigt: true });
    const stand = ((await mara('POST', '/c/kalender/passwortmanager', { schritt: 'konto', erledigt: false })).daten as { stand: PasswortmanagerStand }).stand;
    expect(stand.wahl).toBe('bitwarden');
    expect(Object.keys(stand.haken)).toEqual(['2fa-manager']);
    expect(stand.haken['2fa-manager'].von).toBe('Mara');
    expect(stand.geaendert_von).toBe('Mara');
    // Works while one of the two blocks is on.
    await lukas('POST', '/instanz/einstellungen', { bausteine: { ablage: false } });
    expect((await mara('GET', '/c/kalender/passwortmanager')).status).toBe(200);
  });
});
