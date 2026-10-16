import { beforeEach, describe, expect, it } from 'vitest';
import { isoDate } from '../../../../src/data/ids';
import { montag } from '../../../../src/data/social';
import { verbinde, type Verbunden } from '../testhilfe';

let v: Verbunden;
const heute = () => isoDate(new Date());

/** The demo backend already holds the 90-day plan plus ten measured posts and two DMs. */
describe('Social-Media-Werkzeuge', () => {
  beforeEach(async () => {
    v = await verbinde();
  });

  it('bietet alle Werkzeuge an, lesende als readOnly markiert', async () => {
    const { tools } = await v.client.listTools();
    const namen = tools.map((t) => t.name);
    for (const name of [
      'social_ueberblick', 'social_startplan_uebernehmen', 'social_plan', 'social_plan_speichern', 'social_inhalte', 'social_inhalt_speichern',
      'social_aufgaben', 'social_aufgabe_speichern', 'social_strategie', 'social_hook_speichern', 'social_text_speichern', 'social_messung',
      'social_wert_erfassen', 'social_dm_erfassen', 'social_utm_link',
    ]) {
      expect(namen).toContain(name);
    }
    expect(tools.find((t) => t.name === 'social_plan')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'social_plan_speichern')?.annotations?.readOnlyHint).toBe(false);
  });

  it('zeigt den Überblick wie die Startseite', async () => {
    const { daten } = await v.rufe('social_ueberblick');
    expect(daten.heute).toBe(heute());
    expect(daten.kennzahlen.veroeffentlicht).toMatch(/^0 von \d+ Terminen$/);
    expect(daten.saeulen).toHaveLength(4);
    expect(daten.letzte_dms.map((d: { stichwort: string }) => d.stichwort)).toEqual(['UMZUG', 'DATEN']);
    expect(daten.wertelisten.kanaele.map((k: { wert: string }) => k.wert)).toContain('ig_story');
    expect(daten.hub).toBe('https://crm.velonify.de/#/social');
  });

  it('übernimmt den Startplan nur in ein leeres Werkzeug', async () => {
    const { fehler, text } = await v.rufe('social_startplan_uebernehmen');
    expect(fehler).toBe(true);
    expect(text).toContain('schon Einträge');
  });

  it('liest den Redaktionsplan nach Wochen und filtert', async () => {
    const { daten } = await v.rufe('social_plan', { von: '2000-01-01', kanal: 'linkedin' });
    const termine = daten.wochen.flatMap((w: { termine: unknown[] }) => w.termine);
    expect(termine.length).toBeGreaterThan(0);
    expect(termine.every((t: { kanal: string }) => t.kanal === 'linkedin')).toBe(true);
    expect(daten.wochen[0].woche_ab).toBe(montag(daten.wochen[0].termine[0].datum));
  });

  it('legt einen Termin an, ändert ihn teilweise, hakt ihn ab und archiviert ihn', async () => {
    const neu = await v.rufe('social_plan_speichern', { thema: 'Testpost Umzug', datum: '2026-12-01', inhalt: 'k1', zustaendig: 'Lugge' });
    expect(neu.fehler).toBe(false);
    expect(neu.daten.erledigt).toEqual(['angelegt']);
    const id = neu.daten.termin.plan_id;
    expect(neu.daten.termin).toMatchObject({ uhrzeit: '07:30', kanal: 'instagram', status: 'geplant', zustaendig: 'Lugge' });
    expect(neu.daten.termin.inhalt).toMatch(/^K1 · /);

    const geaendert = await v.rufe('social_plan_speichern', { plan_id: id, hinweis: 'Design offen', veroeffentlicht: true });
    expect(geaendert.daten.erledigt).toEqual(['geändert: hinweis', 'als veröffentlicht abgehakt']);
    expect(geaendert.daten.termin).toMatchObject({ thema: 'Testpost Umzug', hinweis: 'Design offen', status: 'veroeffentlicht', veroeffentlicht_am: heute() });

    await v.rufe('social_plan_speichern', { plan_id: id, archiviert: true });
    const eintrag = (await v.service.loadSocialDaten()).plan.find((e) => e.id === id)!;
    expect(eintrag.archiviert).toBe(true);
    expect(eintrag.datum).toBe('2026-12-01');
  });

  it('lehnt fremde Namen und fehlende Themen ab', async () => {
    expect((await v.rufe('social_plan_speichern', { thema: 'X', zustaendig: 'Niemand' })).text).toContain('nicht im Team');
    expect((await v.rufe('social_plan_speichern', { datum: '2026-12-01' })).text).toContain('Thema');
  });

  it('zeigt Inhalte als Liste und im Detail mit Slides, Terminen und Zahlen', async () => {
    const liste = await v.rufe('social_inhalte', { art: 'reel' });
    expect(liste.daten.inhalte.length).toBeGreaterThan(0);
    expect(liste.daten.inhalte.every((i: { art: string }) => i.art === 'reel')).toBe(true);

    const { daten } = await v.rufe('social_inhalte', { inhalt: 'K1' });
    expect(daten.kennung).toBe('K1');
    expect(daten.slides.length).toBeGreaterThan(0);
    expect(daten.slides[0].nr).toBe(1);
    expect(daten.dms[0].stichwort).toBe('UMZUG');
    expect(daten.messwerte.length).toBe(1);
    expect(daten.hub).toBe(`https://crm.velonify.de/#/social/inhalte/${daten.inhalt_id}`);
  });

  it('legt einen Inhalt an und ändert ihn, ohne andere Felder zu verlieren', async () => {
    const neu = await v.rufe('social_inhalt_speichern', {
      titel: 'Dein Shop nach dem Umzug',
      kennung: 'K99',
      caption: 'Was du nach dem Livegang prüfen solltest.',
      slides: [{ label: '1 (Hook)', text: 'Drei Dinge nach dem Umzug' }, { label: '2', text: 'Weiterleitungen' }],
    });
    expect(neu.daten.inhalt).toMatchObject({ kennung: 'K99', art: 'karussell', status: 'idee', slides: 2 });

    const geaendert = await v.rufe('social_inhalt_speichern', { inhalt: 'K99', status: 'text' });
    expect(geaendert.daten.erledigt).toEqual(['geändert: status']);
    const inhalt = (await v.service.loadSocialDaten()).inhalte.find((i) => i.kennung === 'K99')!;
    expect(inhalt.caption).toBe('Was du nach dem Livegang prüfen solltest.');
    expect(JSON.parse(inhalt.slides)).toHaveLength(2);

    await v.rufe('social_inhalt_speichern', { inhalt: inhalt.id, archiviert: true });
    expect((await v.rufe('social_inhalte')).daten.inhalte.some((i: { kennung: string }) => i.kennung === 'K99')).toBe(false);
  });

  it('liest Aufgaben nach Bereich und legt eine an, erledigt und archiviert sie', async () => {
    const vorher = await v.rufe('social_aufgaben');
    expect(vorher.daten.bereiche.map((b: { bereich: string }) => b.bereich)).toEqual(['woche1', 'fehlt', 'ritual']);

    const neu = await v.rufe('social_aufgabe_speichern', { titel: 'Profilbild tauschen', faellig_am: '2026-12-05', zustaendig: 'Lugge' });
    expect(neu.daten.aufgabe).toMatchObject({ bereich: 'fehlt', dringlichkeit: 'diese_woche', faellig: '2026-12-05' });
    const id = neu.daten.aufgabe.aufgabe_id;

    const erledigt = await v.rufe('social_aufgabe_speichern', { aufgabe_id: id, erledigt: true });
    expect(erledigt.daten.erledigt).toEqual(['erledigt']);
    expect(erledigt.daten.aufgabe).toMatchObject({ titel: 'Profilbild tauschen', erledigt_am: heute() });

    const offen = await v.rufe('social_aufgaben', { bereich: 'fehlt' });
    expect(offen.daten.bereiche[0].aufgaben.some((a: { aufgabe_id: string }) => a.aufgabe_id === id)).toBe(false);
    const mitErledigten = await v.rufe('social_aufgaben', { bereich: 'fehlt', erledigte_zeigen: true, zustaendig: 'lugge' });
    expect(mitErledigten.daten.bereiche[0].aufgaben.some((a: { aufgabe_id: string }) => a.aufgabe_id === id)).toBe(true);

    await v.rufe('social_aufgabe_speichern', { aufgabe_id: id, archiviert: true });
    expect((await v.service.loadSocialDaten()).aufgaben.find((a) => a.id === id)?.archiviert).toBe(true);
  });

  it('liest Strategie und Hooks und ändert einen Hook und einen Text', async () => {
    const { daten } = await v.rufe('social_strategie');
    expect(daten.texte.some((t: { schluessel: string }) => t.schluessel === 'fundament')).toBe(true);
    expect(daten.hooks.length).toBeGreaterThan(0);

    const einzeln = await v.rufe('social_strategie', { abschnitt: 'fundament' });
    expect(einzeln.daten.text.length).toBeGreaterThan(0);

    const hook = daten.hooks[0];
    const benutzt = await v.rufe('social_hook_speichern', { hook_id: hook.hook_id, status: 'benutzt', inhalt: 'K2' });
    expect(benutzt.daten.hook).toMatchObject({ text: hook.text, status: 'benutzt' });
    expect(benutzt.daten.hook.inhalt).toMatch(/^K2 · /);
    const neuerHook = await v.rufe('social_hook_speichern', { text: 'Dein Umzug kostet dich Rankings?', saeule: 1 });
    expect(neuerHook.daten.hook.status).toBe('frei');

    const text = await v.rufe('social_text_speichern', { abschnitt: 'fundament', titel: 'Fundament (neu)' });
    expect(text.daten.erledigt).toEqual(['geändert: titel']);
    const gespeichert = (await v.service.loadSocialDaten()).texte.find((t) => t.schluessel === 'fundament')!;
    expect(gespeichert.titel).toBe('Fundament (neu)');
    expect(gespeichert.text).toBe(einzeln.daten.text);
  });

  it('zeigt die Messung mit Median, Bewertungen und DMs', async () => {
    const { daten } = await v.rufe('social_messung');
    expect(daten.kennzahlen.gemessene_posts).toBe(10);
    expect(daten.kennzahlen.eigener_median).toMatch(/%$/);
    expect(daten.bewertungen.length).toBeGreaterThan(0);
    expect(daten.posts[0].kennwert).toMatch(/%$/);
    expect(daten.dms).toHaveLength(2);
    expect(daten.linkziel).toBe('https://velonify.de/#kontakt');
  });

  it('erfasst Zahlen und ergänzt sie später, ohne andere zu löschen', async () => {
    const woche = await v.rufe('social_wert_erfassen', { art: 'woche', datum: '2026-11-12', story_antworten: 4 });
    expect(woche.daten.wert).toMatchObject({ art: 'woche', datum: '2026-11-09', story_antworten: 4 });

    const ergaenzt = await v.rufe('social_wert_erfassen', { art: 'woche', datum: '2026-11-10', link_klicks: 7 });
    expect(ergaenzt.daten.erledigt).toBe('Zahlen ergänzt');
    expect(ergaenzt.daten.wert).toMatchObject({ story_antworten: 4, link_klicks: 7 });
    expect((await v.service.loadSocialDaten()).werte.filter((w) => w.art === 'woche')).toHaveLength(1);

    const ohneInhalt = await v.rufe('social_wert_erfassen', { art: 'post', reichweite: 100 });
    expect(ohneInhalt.fehler).toBe(true);
    const post = await v.rufe('social_wert_erfassen', { art: 'post', inhalt: 'K1', datum: '2026-11-01', reichweite: 500, speicherungen: 20 });
    expect(post.daten.wert.inhalt).toMatch(/^K1 · /);
  });

  it('erfasst eine DM mit Anfrage im Eingang und ändert sie', async () => {
    const neu = await v.rufe('social_dm_erfassen', { stichwort: 'flows', inhalt: 'K1', name: 'shop.beispiel', nachricht: 'Bitte die Checkliste.' });
    expect(neu.daten.erledigt).toBe('DM erfasst und als Anfrage in den Eingang gelegt');
    expect(neu.daten.dm).toMatchObject({ stichwort: 'FLOWS', kanal: 'instagram', beantwortet_von: 'Lugge', datum: heute() });
    const anfrageId = neu.daten.dm.anfrage_id;
    const eingang = await v.service.loadEingang();
    expect(eingang.find((a) => a.id === anfrageId)?.quelle).toBe('Instagram DM');

    const geaendert = await v.rufe('social_dm_erfassen', { dm_id: neu.daten.dm.dm_id, qualifiziert: true });
    expect(geaendert.daten.dm).toMatchObject({ qualifiziert: true, name: 'shop.beispiel', nachricht: 'Bitte die Checkliste.' });

    const ohneName = await v.rufe('social_dm_erfassen', { stichwort: 'DATEN' });
    expect(ohneName.daten.erledigt).toBe('DM erfasst');
  });

  it('baut UTM-Links nach dem Schema der Strategie', async () => {
    const { daten } = await v.rufe('social_utm_link', { quelle: 'instagram', kampagne: 'K1', inhalt: 'Bio' });
    expect(daten.link).toBe('https://velonify.de/?utm_source=instagram&utm_medium=social&utm_campaign=k1&utm_content=bio#kontakt');
  });
});
