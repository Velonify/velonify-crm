import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { ValidationError } from './errors';
import {
  MINDEST_POSTS,
  bewerteGruppen,
  dmsJeStichwort,
  eigenerMedian,
  gruppeVon,
  kennwert,
  median,
  montag,
  naechsteEintraege,
  parseSlides,
  planNachWochen,
  postKennwerte,
  preparePlan,
  prepareWert,
  slidesAlsJson,
  sortiereAufgaben,
  ueberfaelligeEintraege,
  utmLink,
} from './social';
import { SOCIAL_START_INHALTE, SOCIAL_START_PLAN } from './socialStart';
import type { SocialAufgabe, SocialDm, SocialInhalt, SocialPlanEintrag, SocialWert } from './types';

const META = { erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' };

const inhalt = (teil: Partial<SocialInhalt>): SocialInhalt => ({
  id: 'SI-1', kennung: 'K1', art: 'karussell', serie: '', saeule: 1, titel: 'Titel', ziel: '', hook: '', slides: '',
  caption: '', cta: '', hashtags: '', alt_text: '', ton: '', material: '', hinweis: '', status: 'text',
  sortierung: 10, archiviert: false, ...META, ...teil,
});

const wert = (teil: Partial<SocialWert>): SocialWert => ({
  id: 'SW-1', art: 'post', datum: '2026-09-24', inhalt_id: 'SI-1', reichweite: 1000, speicherungen: 30, geteilt: 20,
  profilaufrufe: null, link_klicks: null, kommentare: null, story_antworten: null, umfrage_antworten: null,
  neue_follower: null, follower_zielgruppe: null, sitzungen: null, formulare: null, erstgespraeche: null,
  angebote_wert_eur: null, notiz: '', ...META, ...teil,
});

const dm = (teil: Partial<SocialDm>): SocialDm => ({
  id: 'SD-1', datum: '2026-09-25', kanal: 'instagram', stichwort: 'UMZUG', inhalt_id: 'SI-1', name: 'shop',
  shop: '', nachricht: '', qualifiziert: false, eingang_id: '', beantwortet_von: '', notiz: '', ...META, ...teil,
});

const eintrag = (teil: Partial<SocialPlanEintrag>): SocialPlanEintrag => ({
  id: 'SP-1', datum: '2026-09-24', uhrzeit: '07:30', kanal: 'instagram', format: 'karussell', saeule: 1,
  thema: 'Thema', inhalt_id: '', status: 'geplant', hinweis: '', zustaendig: '', erledigt_am: '', erledigt_von: '',
  sortierung: 10, archiviert: false, ...META, ...teil,
});

const aufgabe = (teil: Partial<SocialAufgabe>): SocialAufgabe => ({
  id: 'SU-1', bereich: 'fehlt', titel: 'Aufgabe', beschreibung: '', dringlichkeit: 'sofort', faellig_am: '',
  zustaendig: '', erledigt_am: '', erledigt_von: '', sortierung: 10, archiviert: false, ...META, ...teil,
});

describe('Startplan', () => {
  it('gives every plan entry a content handle that exists', () => {
    const kennungen = new Set(SOCIAL_START_INHALTE.map((i) => i.kennung));
    const fehlend = SOCIAL_START_PLAN.filter((p) => p.kennung && !kennungen.has(p.kennung)).map((p) => p.kennung);
    expect(fehlend).toEqual([]);
  });

  it('passes its own validation', () => {
    expect(() => SOCIAL_START_PLAN.forEach(({ kennung: _kennung, ...e }) => preparePlan({ ...e, inhalt_id: '' }))).not.toThrow();
  });

  it('leaves no client name in the public repo', () => {
    const text = JSON.stringify([SOCIAL_START_INHALTE, SOCIAL_START_PLAN]);
    expect(text).not.toMatch(/Blue Fire|Pretty Woman|Storz/i);
  });

  it('takes the plan over once and refuses a second time', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    await expect(service.uebernimmSocialPlan()).rejects.toThrow(ValidationError);
    const daten = await service.loadSocialDaten();
    expect(daten.inhalte).toHaveLength(SOCIAL_START_INHALTE.length);
    expect(daten.plan).toHaveLength(SOCIAL_START_PLAN.length);
    // Every entry that names a handle found its post.
    const mitKennung = SOCIAL_START_PLAN.filter((p) => p.kennung).length;
    expect(daten.plan.filter((p) => p.inhalt_id).length).toBe(mitKennung);
  });
});

describe('Slides', () => {
  it('reads and writes slides and drops empty ones at the end', () => {
    const slides = [
      { label: '1', text: 'Hook', gestaltung: 'Vorlage B', sprecher: '' },
      { label: '', text: '', gestaltung: '', sprecher: '' },
    ];
    const json = slidesAlsJson(slides);
    expect(parseSlides(json)).toHaveLength(1);
    expect(slidesAlsJson([])).toBe('');
  });

  it('treats unreadable JSON as no slides instead of breaking', () => {
    expect(parseSlides('kein json')).toEqual([]);
    expect(parseSlides('{"a":1}')).toEqual([]);
    expect(parseSlides('[{"text":"nur Text"}]')).toEqual([{ label: '', text: 'nur Text', gestaltung: '', sprecher: '' }]);
  });
});

describe('Redaktionsplan', () => {
  it('groups by calendar week, Monday first', () => {
    expect(montag('2026-09-24')).toBe('2026-09-21');
    expect(montag('2026-09-21')).toBe('2026-09-21');
    expect(montag('2026-09-20')).toBe('2026-09-14');
    const wochen = planNachWochen([eintrag({ id: 'a', datum: '2026-09-24' }), eintrag({ id: 'b', datum: '2026-10-01' }), eintrag({ id: 'c', datum: '2026-09-22' })]);
    expect(wochen.map((w) => w.start)).toEqual(['2026-09-21', '2026-09-28']);
    expect(wochen[0].eintraege.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('separates what is coming up from what was missed', () => {
    const plan = [
      eintrag({ id: 'alt', datum: '2026-09-20' }),
      eintrag({ id: 'erledigt', datum: '2026-09-21', erledigt_am: '2026-09-21T08:00:00.000Z' }),
      eintrag({ id: 'neu', datum: '2026-09-26' }),
    ];
    expect(naechsteEintraege(plan, '2026-09-22').map((e) => e.id)).toEqual(['neu']);
    expect(ueberfaelligeEintraege(plan, '2026-09-22').map((e) => e.id)).toEqual(['alt']);
  });

  it('refuses an entry without a date, topic or with a broken time', () => {
    const gut = { datum: '2026-09-24', uhrzeit: '07:30', kanal: 'instagram', format: 'karussell', saeule: 1, thema: 'Thema', inhalt_id: '', status: '', hinweis: '', zustaendig: '' };
    expect(preparePlan(gut).status).toBe('geplant');
    expect(() => preparePlan({ ...gut, datum: '' })).toThrow(ValidationError);
    expect(() => preparePlan({ ...gut, thema: '  ' })).toThrow(ValidationError);
    expect(() => preparePlan({ ...gut, uhrzeit: '7 Uhr' })).toThrow(ValidationError);
  });
});

describe('Aufgaben', () => {
  it('puts open tasks first and sorts them by urgency', () => {
    const liste = [
      aufgabe({ id: 'spaet', dringlichkeit: 'spaeter' }),
      aufgabe({ id: 'fertig', dringlichkeit: 'sofort', erledigt_am: '2026-09-21T08:00:00.000Z' }),
      aufgabe({ id: 'sofort', dringlichkeit: 'sofort' }),
    ];
    expect(sortiereAufgaben(liste).map((a) => a.id)).toEqual(['sofort', 'spaet', 'fertig']);
  });
});

describe('Messung', () => {
  it('computes saves plus shares per reach, and nothing without reach', () => {
    expect(kennwert({ reichweite: 1000, speicherungen: 30, geteilt: 20 })).toBe(0.05);
    expect(kennwert({ reichweite: null, speicherungen: 30, geteilt: 20 })).toBeNull();
    expect(kennwert({ reichweite: 0, speicherungen: 1, geteilt: 1 })).toBeNull();
    expect(kennwert({ reichweite: 100, speicherungen: null, geteilt: null })).toBe(0);
  });

  it('takes the median of an even and an odd list', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('looks back over the last eight posts only', () => {
    const werte = Array.from({ length: 12 }, (_, i) =>
      wert({ id: `SW-${i}`, datum: `2026-09-${String(i + 1).padStart(2, '0')}`, reichweite: 100, speicherungen: i, geteilt: 0 }),
    );
    const posts = postKennwerte(werte, [inhalt({})]);
    expect(posts[0].datum).toBe('2026-09-12');
    // Newest eight are the saves 11 down to 4, so the median sits between 7 and 8 per 100.
    expect(eigenerMedian(posts)).toBeCloseTo(0.075, 5);
  });

  it('names the series a post belongs to, otherwise its kind', () => {
    expect(gruppeVon(inhalt({ serie: 'UMZUGSPLAN #3' }))).toBe('UMZUGSPLAN');
    expect(gruppeVon(inhalt({ serie: '', art: 'reel' }))).toBe('Reel');
  });

  it('says nothing before the ninth measured post', () => {
    const inhalte = [inhalt({ id: 'SI-1', serie: 'UMZUGSPLAN #1' })];
    const werte = [wert({ id: 'a', datum: '2026-09-24' }), wert({ id: 'b', datum: '2026-09-26' })];
    expect(bewerteGruppen(werte, inhalte, []).map((b) => b.urteil)).toEqual(['zu_frueh']);
  });

  /** Nine posts, all on the median except the series under test. */
  const basis = (abweichung: number[], serie: string) => {
    const inhalte = [inhalt({ id: 'SI-1', serie })];
    const werte: SocialWert[] = [];
    for (let i = 0; i < MINDEST_POSTS; i++) {
      const eigen = i < abweichung.length;
      inhalte.push(inhalt({ id: `SI-rest-${i}`, kennung: `X${i}`, serie: '', art: 'einzelbild' }));
      werte.push(
        wert({
          id: `SW-${i}`,
          // Newest first: the series under test gets the most recent days.
          datum: `2026-09-${String(30 - i).padStart(2, '0')}`,
          inhalt_id: eigen ? 'SI-1' : `SI-rest-${i}`,
          reichweite: 1000,
          speicherungen: eigen ? abweichung[i] : 50,
          geteilt: 0,
        }),
      );
    }
    return { inhalte, werte };
  };

  it('doubles a series that beats 1.5× the median twice in a row', () => {
    const { inhalte, werte } = basis([100, 90], 'UMZUGSPLAN #1');
    const bewertung = bewerteGruppen(werte, inhalte, []).find((b) => b.gruppe === 'UMZUGSPLAN');
    expect(bewertung?.urteil).toBe('verdoppeln');
  });

  it('sorts out a series that stays below the median three times without a DM', () => {
    const { inhalte, werte } = basis([10, 12, 14], 'DATENLECK #1');
    const bewertung = bewerteGruppen(werte, inhalte, []).find((b) => b.gruppe === 'DATENLECK');
    expect(bewertung?.urteil).toBe('aussortieren');
  });

  it('keeps a weak series that triggered a DM, and doubles it on a qualified one', () => {
    const { inhalte, werte } = basis([10, 12, 14], 'DATENLECK #1');
    const mitDm = bewerteGruppen(werte, inhalte, [dm({ inhalt_id: 'SI-1' })]).find((b) => b.gruppe === 'DATENLECK');
    expect(mitDm?.urteil).toBe('beobachten');
    const qualifiziert = bewerteGruppen(werte, inhalte, [dm({ inhalt_id: 'SI-1', qualifiziert: true })]).find((b) => b.gruppe === 'DATENLECK');
    expect(qualifiziert?.urteil).toBe('verdoppeln');
  });

  it('counts DMs per keyword inside a period', () => {
    const dms = [
      dm({ id: '1', datum: '2026-09-21', stichwort: 'UMZUG', qualifiziert: true }),
      dm({ id: '2', datum: '2026-09-23', stichwort: 'umzug' }),
      dm({ id: '3', datum: '2026-09-23', stichwort: '' }),
      dm({ id: '4', datum: '2026-09-28', stichwort: 'DATEN' }),
    ];
    expect(dmsJeStichwort(dms, '2026-09-21', '2026-09-27')).toEqual([
      { stichwort: 'UMZUG', anzahl: 2, qualifiziert: 1 },
      { stichwort: 'OHNE STICHWORT', anzahl: 1, qualifiziert: 0 },
    ]);
  });

  it('wants a post for post numbers and a valid date everywhere', () => {
    const { id: _id, erstellt_am: _a, erstellt_von: _b, geaendert_am: _c, geaendert_von: _d, ...eingabe } = wert({});
    expect(prepareWert(eingabe).art).toBe('post');
    expect(() => prepareWert({ ...eingabe, inhalt_id: '' })).toThrow(ValidationError);
    expect(() => prepareWert({ ...eingabe, art: 'woche', inhalt_id: '', datum: 'irgendwann' })).toThrow(ValidationError);
    expect(prepareWert({ ...eingabe, art: 'woche', inhalt_id: '' }).inhalt_id).toBe('');
  });
});

describe('UTM-Links', () => {
  it('builds the scheme of section 10, parameters before the fragment', () => {
    expect(utmLink('https://velonify.de/#kontakt', { quelle: 'instagram', kampagne: 'profil' })).toBe(
      'https://velonify.de/?utm_source=instagram&utm_medium=social&utm_campaign=profil#kontakt',
    );
    expect(utmLink('https://velonify.de/#kontakt', { quelle: 'linkedin', kampagne: 'Profil', inhalt: 'Lukas' })).toBe(
      'https://velonify.de/?utm_source=linkedin&utm_medium=social&utm_campaign=profil&utm_content=lukas#kontakt',
    );
  });

  it('falls back to the standard target and replaces parameters that are already there', () => {
    expect(utmLink('', { quelle: 'instagram', kampagne: '' })).toContain('utm_campaign=profil');
    expect(utmLink('https://velonify.de/?utm_source=alt&ref=x#kontakt', { quelle: 'instagram', kampagne: 'story', inhalt: '2026-09-24' })).toBe(
      'https://velonify.de/?utm_source=instagram&ref=x&utm_medium=social&utm_campaign=story&utm_content=2026-09-24#kontakt',
    );
  });
});
