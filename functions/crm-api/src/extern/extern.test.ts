import { describe, expect, it } from 'vitest';
import { PostgresStore } from '../../../../src/data/postgres/postgresStore';
import { testDb } from '../../../../db/test/testDb';
import { nimmAnfrage } from './eingang';
import { rohMail } from './gmail';
import { behandleMagnet, type Mail, type MagnetKonfig } from './magnete';
import { einfuegen } from './tabelle';

async function aufbau() {
  const { pool } = await testDb();
  const mails: Mail[] = [];
  const k: MagnetKonfig = { basis: 'https://velonify.example', signatur: 'Test', sende: async (m) => void mails.push(m) };
  await pool.transaktion(async (tx) => {
    await einfuegen(tx, 'magnete', { id: 'MG-1', slug: 'kit', titel: 'Kit', datei_url: 'https://drive.example/kit', aktiv: true, typ: 'datei' });
    await einfuegen(tx, 'magnete', { id: 'MG-2', slug: 'roast', titel: 'Roast', aktiv: true, typ: 'audit', plaetze: 1 });
  });
  const store = new PostgresStore(pool);
  return { pool, mails, k, leads: async () => (await store.loadMagnetDaten()).leads };
}

const eintrag = (data: Record<string, unknown>) => ({ aktion: 'eintrag', payload: { created_at: '2026-10-15T10:00:00.000Z', data } });

describe('Website: Anfragen', () => {
  it('stores an inquiry like the Apps Script and ignores bots', async () => {
    const { pool } = await testDb();
    expect(await nimmAnfrage(pool, { payload: { site_url: 'https://www.velonify.de', data: { email: 'a@shop.example', name: 'Anna', nachricht: 'x'.repeat(5000) } } })).toMatchObject({ status: 200 });
    expect(await nimmAnfrage(pool, { payload: { data: { email: 'bot@x.example', 'bot-field': 'ja' } } })).toMatchObject({ text: 'Ignoriert.' });
    expect(await nimmAnfrage(pool, { payload: { data: {} } })).toMatchObject({ status: 400 });
    const [anfrage, ...rest] = await new PostgresStore(pool).loadEingang();
    expect(rest).toHaveLength(0);
    expect(anfrage).toMatchObject({ quelle: 'velonify.de', name: 'Anna', status: 'neu', sprache: 'de', erstellt_von: 'Website' });
    expect(anfrage.nachricht.endsWith(' […]')).toBe(true);
  });
});

describe('Website: Lead-Magnete', () => {
  it('signs up once, mails the download and does not mail again within ten minutes', async () => {
    const { pool, mails, k, leads } = await aufbau();
    expect(await behandleMagnet(pool, k, eintrag({ email: 'Kim@Shop.example', magnet: 'kit', vorname: 'Kim', newsletter: 'on' }))).toMatchObject({ status: 200, text: 'Gespeichert, Mail gesendet.' });
    expect(await behandleMagnet(pool, k, eintrag({ email: 'kim@shop.example', magnet: 'kit' }))).toMatchObject({ text: 'Mail ging gerade erst raus – nicht noch einmal.' });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ an: 'kim@shop.example', betreff: 'Dein Download: Kit' });
    expect(mails[0].text).toContain('/m/d/');
    expect(mails[0].text).toContain('Newsletter');
    const [lead] = await leads();
    expect(lead).toMatchObject({ email: 'kim@shop.example', newsletter_einwilligung: true, downloads: 0, status: 'neu' });
    expect(lead.mail_gesendet_am).not.toBe('');
  });

  it('counts downloads, confirms and cancels the newsletter by token', async () => {
    const { pool, k, leads } = await aufbau();
    await behandleMagnet(pool, k, eintrag({ email: 'kim@shop.example', magnet: 'kit', newsletter: 'on' }));
    const { token } = (await leads())[0];
    expect(await behandleMagnet(pool, k, { aktion: 'download', token })).toMatchObject({ status: 200, ziel: 'https://drive.example/kit' });
    expect(await behandleMagnet(pool, k, { aktion: 'newsletter', token })).toMatchObject({ status: 200 });
    expect((await leads())[0]).toMatchObject({ downloads: 1 });
    expect((await leads())[0].newsletter_bestaetigt_am).not.toBe('');
    expect(await behandleMagnet(pool, k, { aktion: 'abmelden', token })).toMatchObject({ status: 200 });
    expect((await leads())[0].newsletter_abgemeldet_am).not.toBe('');
    expect(await behandleMagnet(pool, k, { aktion: 'download', token: 'f'.repeat(32) })).toMatchObject({ status: 404 });
    expect(await behandleMagnet(pool, k, { aktion: 'download', token: 'kaputt' })).toMatchObject({ status: 400 });
  });

  it('puts audit sign-ups on the waiting list once the places are taken and tells the page how many are free', async () => {
    const { pool, mails, k, leads } = await aufbau();
    expect(await behandleMagnet(pool, k, { aktion: 'inhalt', magnet: 'roast' })).toMatchObject({ status: 200, typ: 'audit', plaetze: 1, frei: 1 });
    await behandleMagnet(pool, k, eintrag({ email: 'eins@shop.example', magnet: 'roast', shop: 'https://www.eins.example/' }));
    await behandleMagnet(pool, k, eintrag({ email: 'zwei@shop.example', magnet: 'roast', shop: 'zwei.example' }));
    expect((await leads()).map((l) => l.warteliste)).toEqual([false, true]);
    expect(mails.map((m) => m.betreff)).toEqual(['Roast: wir schauen uns eins.example an', 'Roast: du stehst auf der Warteliste']);
    expect(await behandleMagnet(pool, k, { aktion: 'inhalt', magnet: 'roast' })).toMatchObject({ frei: 0 });
    expect(await behandleMagnet(pool, k, { aktion: 'inhalt', magnet: 'gibtsnicht' })).toMatchObject({ status: 404 });
  });

  it('shows a released report and counts views except previews', async () => {
    const { pool, k, leads } = await aufbau();
    await behandleMagnet(pool, k, eintrag({ email: 'eins@shop.example', magnet: 'roast', vorname: 'Eins' }));
    const lead = (await leads())[0];
    expect(await behandleMagnet(pool, k, { aktion: 'report', token: lead.token })).toMatchObject({ status: 404 });
    await pool.query(`UPDATE magnet_leads SET report = '{"fazit":"gut"}', report_freigegeben_am = '2026-10-15', report_von = 'Lugge' WHERE id = $1`, [lead.id]);
    expect(await behandleMagnet(pool, k, { aktion: 'report', token: lead.token, zaehlen: false })).toMatchObject({ status: 200, vorname: 'Eins', von: 'Lugge', report: { fazit: 'gut' } });
    await behandleMagnet(pool, k, { aktion: 'report', token: lead.token });
    expect((await leads())[0].report_aufrufe).toBe(1);
  });

  it('builds a multipart mail with encoded sender name and reply-to', () => {
    const roh = Buffer.from(
      rohMail({ absender: 'Lukas von Velonify <hallo@velonify.de>', antwortAn: 'lukas@velonify.de' }, { an: 'a@b.example', betreff: 'Größe', text: 't', html: '<p>h</p>' }, 'G'),
      'base64url',
    ).toString('utf8');
    expect(roh).toContain('From: =?UTF-8?B?');
    expect(roh).toContain('<hallo@velonify.de>');
    expect(roh).toContain('Reply-To: lukas@velonify.de');
    expect(roh).toContain('multipart/alternative; boundary="G"');
  });
});
