import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { dealTitelListe, DemoLinkedin, istLinkedinLink, vermerkText, vorschlag, type LinkedinLead } from './linkedin';

const lead = (teil: Partial<LinkedinLead> = {}): LinkedinLead => ({
  art: 'job',
  url: 'https://www.linkedin.com/jobs/view/1234567/',
  firma: { name: 'Neue Spielwaren', domain: 'www.neue-spielwaren.example', ort: 'Köln', linkedin: '', mitarbeiter: 40, branche: '' },
  kontakt: null,
  stelle: { titel: 'Head of E-Commerce', ort: 'Köln', datum: '2026-09-15' },
  anlass: 'Neue Leitung für den Onlineshop.',
  ansprechpartner_tipp: '',
  passung: { stufe: 'gut', text: '' },
  deal_titel: 'Shopify-Migration',
  zusammenfassung: '',
  hinweis: '',
  modell: '',
  ...teil,
});

describe('LinkedIn links', () => {
  it('accepts job ads, profiles and company pages only', () => {
    expect(istLinkedinLink('https://www.linkedin.com/jobs/view/4466518902/?refId=x')).toBe(true);
    expect(istLinkedinLink('de.linkedin.com/in/erika-beispiel')).toBe(true);
    expect(istLinkedinLink('https://www.linkedin.com/company/beispiel/')).toBe(true);
    expect(istLinkedinLink('https://www.linkedin.com/feed/')).toBe(false);
    expect(istLinkedinLink('https://example.com/in/erika')).toBe(false);
    expect(istLinkedinLink('')).toBe(false);
  });
});

describe('vorschlag', () => {
  it('prefills a new firm from a job ad', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const v = vorschlag(lead(), db, 'Lugge');
    expect(v.firma).toMatchObject({ name: 'Neue Spielwaren', domain: 'neue-spielwaren.example', ort: 'Köln', quelle: 'LinkedIn-Stellenanzeige', zustaendig: 'Lugge', status: 'lead' });
    expect(v.kontakt).toBeNull();
    expect(v.treffer).toEqual([]);
    expect(v.dealTitel).toBe('Shopify-Migration');
  });

  it('finds the firm that is already in the CRM by domain', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const v = vorschlag(lead({ firma: { ...lead().firma, name: 'Ganz anders', domain: 'https://www.bergwerk-kaffee.example/' } }), db, '');
    expect(v.treffer[0]).toMatchObject({ firma: { name: 'Bergwerk Kaffeerösterei' }, gruende: ['gleiche Domain'] });
    expect(v.treffer).toHaveLength(1);
  });

  it('takes the person of a profile as contact', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const profil = lead({
      art: 'profil',
      url: 'https://www.linkedin.com/in/erika-beispiel',
      stelle: null,
      kontakt: { vorname: 'Erika', nachname: 'Beispiel', rolle: 'Leitung E-Commerce', email: 'erika@neue-spielwaren.example', email_qualitaet: 80, linkedin: 'https://www.linkedin.com/in/erika-beispiel' },
    });
    expect(vorschlag(profil, db, '').kontakt).toMatchObject({ vorname: 'Erika', nachname: 'Beispiel', rolle: 'Leitung E-Commerce', email: 'erika@neue-spielwaren.example' });
    expect(vorschlag({ ...profil, kontakt: null }, db, '').kontakt).toMatchObject({ vorname: 'Erika', nachname: 'Beispiel', linkedin: profil.url });
  });

  it('offers the team default and the lead finder titles', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    expect(dealTitelListe(await service.load())).toEqual(['Shopify-Migration', 'Media Buying & Ad Management', 'Klaviyo Migration & Management']);
  });
});

describe('vermerkText', () => {
  it('names the job ad, its date and the link', () => {
    expect(vermerkText(lead(), ' Neue Leitung. ')).toBe('Lead aus LinkedIn-Stellenanzeige „Head of E-Commerce“ vom 15.09.2026: https://www.linkedin.com/jobs/view/1234567/\nNeue Leitung.');
    expect(vermerkText(lead({ art: 'profil', stelle: null, url: 'u' }), '')).toBe('Lead aus LinkedIn-Profil: u');
  });
});

describe('legeLinkedinLeadAn', () => {
  it('creates firm, contact, a qualified deal and the timeline entry', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const v = vorschlag(lead({ kontakt: { vorname: 'Erika', nachname: 'Beispiel', rolle: 'CEO', email: '', email_qualitaet: null, linkedin: 'https://www.linkedin.com/in/erika-beispiel' } }), db, 'Lugge');
    const { firma, kontakt, deal } = await service.legeLinkedinLeadAn({
      firma: v.firma,
      kontakt: v.kontakt,
      deal: { titel: v.dealTitel, phase: 'qualifiziert', zustaendig: 'Lugge' },
      vermerk: 'Lead aus LinkedIn',
    });
    const danach = await service.load();
    expect(danach.firmen.find((f) => f.id === firma.id)).toMatchObject({ name: 'Neue Spielwaren', domain: 'neue-spielwaren.example', quelle: 'LinkedIn-Stellenanzeige' });
    expect(kontakt).toMatchObject({ firma_id: firma.id, vorname: 'Erika', hauptkontakt: true });
    expect(danach.deals.find((d) => d.id === deal!.id)).toMatchObject({ phase: 'qualifiziert', kontakt_id: kontakt!.id, zustaendig: 'Lugge', titel: 'Shopify-Migration' });
    expect(danach.aktivitaeten.filter((a) => a.firma_id === firma.id).map((a) => a.text)).toContain('Lead aus LinkedIn');
  });

  it('joins an existing firm and reuses a contact with the same LinkedIn profile', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    const seeblick = db.firmen.find((f) => f.name === 'Seeblick Heimtextil')!;
    const lea = db.kontakte.find((k) => k.firma_id === seeblick.id)!;
    const vorher = db.kontakte.length;
    const { firma, kontakt, deal } = await service.legeLinkedinLeadAn({
      firmaId: seeblick.id,
      firma: vorschlag(lead(), db, '').firma,
      kontakt: { vorname: 'Lea', nachname: 'Sommer', rolle: '', email: '', telefon: '', linkedin: 'https://www.linkedin.com/in/lea-sommer-demo/', hauptkontakt: false, notiz: '' },
      deal: null,
      vermerk: 'Profil gesehen',
    });
    const danach = await service.load();
    expect(firma.id).toBe(seeblick.id);
    expect(kontakt!.id).toBe(lea.id);
    expect(deal).toBeNull();
    expect(danach.kontakte).toHaveLength(vorher);
    expect(danach.firmen).toHaveLength(db.firmen.length);
  });
});

describe('DemoLinkedin', () => {
  it('invents a job ad or a profile depending on the link', async () => {
    const demo = new DemoLinkedin(0);
    expect((await demo.lies('https://www.linkedin.com/jobs/view/1234567/', ['X'])).stelle?.titel).toBeTruthy();
    expect((await demo.lies('https://www.linkedin.com/in/max-beispiel', ['X'])).kontakt).toMatchObject({ vorname: 'Max', nachname: 'Beispiel' });
    await expect(demo.lies('https://example.com', [])).rejects.toThrow();
  });
});
