import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Berechtigung } from '../../../src/data/portalApi';
import { Begrenzer, erstelleLink, erstelleSitzung, linkNochGueltig, oeffneLink, oeffneSitzung } from './anmeldung';
import { rohMail } from './google';
import { Siegel } from './siegel';

const siegel = new Siegel(randomBytes(32).toString('base64'));
const b = (zuletzt = '') => ({ zugang: { id: 'PZ-1', zuletzt_am: zuletzt }, kontakt: { id: 'K-1' }, firma: { id: 'F-1' } }) as unknown as Berechtigung;

describe('login links and sessions', () => {
  it('opens a fresh link once: after the login it no longer matches', () => {
    const jetzt = Date.now();
    const link = erstelleLink(siegel, b(), jetzt);
    const inhalt = oeffneLink(siegel, link, jetzt + 60_000)!;
    expect(linkNochGueltig(inhalt, b())).toBe(true);
    expect(linkNochGueltig(inhalt, b('2026-10-14T18:00:00.000Z'))).toBe(false);
  });

  it('rejects expired, forged and swapped tokens', () => {
    const jetzt = Date.now();
    const link = erstelleLink(siegel, b(), jetzt);
    expect(oeffneLink(siegel, link, jetzt + 16 * 60_000)).toBeNull();
    expect(oeffneLink(siegel, link.slice(0, -3) + 'AAA', jetzt)).toBeNull();
    expect(oeffneLink(new Siegel(randomBytes(32).toString('base64')), link, jetzt)).toBeNull();
    // A link is no session and a session no link.
    expect(oeffneSitzung(siegel, link, jetzt)).toBeNull();
    const { sitzung, gueltig_bis } = erstelleSitzung(siegel, b(), jetzt);
    expect(oeffneLink(siegel, sitzung, jetzt)).toBeNull();
    expect(oeffneSitzung(siegel, sitzung, jetzt + 29 * 86_400_000)).toMatchObject({ k: 'K-1', f: 'F-1' });
    expect(oeffneSitzung(siegel, sitzung, jetzt + 31 * 86_400_000)).toBeNull();
    expect(new Date(gueltig_bis).getTime()).toBe(jetzt + 30 * 86_400_000);
  });

  it('limits per key within the window', () => {
    const grenze = new Begrenzer(2, 1000);
    expect(grenze.erlaubt('a', 0)).toBe(true);
    expect(grenze.erlaubt('a', 10)).toBe(true);
    expect(grenze.erlaubt('a', 20)).toBe(false);
    expect(grenze.erlaubt('b', 20)).toBe(true);
    expect(grenze.erlaubt('a', 1500)).toBe(true);
  });

  it('encodes the mail as UTF-8', () => {
    const roh = Buffer.from(rohMail('Velonify <hallo@velonify.de>', 'sophie@alpenglanz.example', 'Dein Anmeldelink für das Portal', 'Grüße'), 'base64url').toString('utf8');
    expect(roh).toContain('From: Velonify <hallo@velonify.de>');
    expect(roh).toContain(`Subject: =?UTF-8?B?${Buffer.from('Dein Anmeldelink für das Portal').toString('base64')}?=`);
    expect(roh.split('\r\n\r\n')[1]).toBe(Buffer.from('Grüße').toString('base64'));
  });
});
