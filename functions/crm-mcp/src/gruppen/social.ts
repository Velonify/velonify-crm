import { z } from 'zod';
import { EINSTELLUNG } from '../../../../src/data/constants';
import {
  AUFGABEN_BEREICHE,
  DRINGLICHKEITEN,
  FORMATE,
  INHALT_ARTEN,
  INHALT_STATUS,
  KANAELE,
  MEDIAN_FENSTER,
  MINDEST_POSTS,
  PLAN_STATUS,
  SAEULEN,
  SOCIAL_ZIEL_STANDARD,
  STICHWORTE,
  URTEIL_LABEL,
  WERT_ARTEN,
  bereichLabel,
  bewerteGruppen,
  dmsJeStichwort,
  eigenerMedian,
  findeWert,
  inhaltById,
  inhaltName,
  istErledigt,
  istVeroeffentlicht,
  montag,
  naechsteEintraege,
  offeneAufgaben,
  parseSlides,
  postKennwerte,
  saeuleLabel,
  sortiereAufgaben,
  sortiereHooks,
  sortiereInhalte,
  sortierePlan,
  sortiereTexte,
  ueberfaelligeEintraege,
  utmLink,
} from '../../../../src/data/social';
import type {
  SocialAufgabe,
  SocialAufgabeInput,
  SocialDm,
  SocialDmInput,
  SocialHook,
  SocialHookInput,
  SocialInhalt,
  SocialInhaltInput,
  SocialPlanEintrag,
  SocialPlanInput,
  SocialText,
  SocialTextInput,
  SocialWert,
  SocialWertInput,
} from '../../../../src/data/types';
import { antwort, datum, fehler, finde, HUB, kompakt, klein, ohneUndefined, pruefeTeam, type Werkzeugkasten } from '../hilfen';

/*
 * Social media (/social in the hub): overview, editorial calendar, content library, tasks, measurement and
 * strategy. Reading tools mirror the hub pages, writing tools take partial changes and keep the rest.
 */

const SOCIAL = `${HUB}/#/social`;
const inhaltLink = (id: string) => `${SOCIAL}/inhalte/${id}`;
const MAX_ZEILEN = 6;

type Liste = readonly { wert: string; label: string }[];
/** The values of a vocabulary as a zod enum. */
const auswahl = <T extends Liste>(liste: T) => z.enum(liste.map((e) => e.wert) as unknown as [T[number]['wert'], ...T[number]['wert'][]]);
const erklaere = (liste: Liste) => liste.map((e) => (e.wert === e.label.toLowerCase() ? e.wert : `${e.wert} = ${e.label}`)).join(', ');

const saeuleFeld = z
  .number()
  .int()
  .min(1)
  .max(4)
  .nullable()
  .optional()
  .describe(`Content-Säule: ${SAEULEN.map((s) => `${s.nr} = ${s.name}`).join(', ')}; null = keine (intern)`);
const inhaltFeld = (wofuer: string) => z.string().optional().describe(`${wofuer}: inhalt_id oder Kennung (z. B. K1); "" löst die Verknüpfung`);
const zahl = z.number().nonnegative().nullable().optional();
const prozent = (wert: number | null) => (wert === null ? '' : `${(wert * 100).toFixed(1).replace('.', ',')} %`);
const tag = (zeitpunkt: string) => zeitpunkt.slice(0, 10);

/** A piece of content by id or handle ("K1"); handles are compared without case. */
function findeInhalt(inhalte: readonly SocialInhalt[], angabe: string): SocialInhalt {
  const wert = angabe.trim();
  const treffer = inhalte.find((i) => i.id === wert) ?? inhalte.find((i) => !i.archiviert && i.kennung && klein(i.kennung) === klein(wert));
  if (!treffer) throw new Error(`Inhalt „${angabe}“ nicht gefunden. IDs und Kennungen über \`social_inhalte\` holen.`);
  return treffer;
}

const inhaltIdAus = (inhalte: readonly SocialInhalt[], angabe: string | undefined) =>
  angabe === undefined ? undefined : angabe.trim() === '' ? '' : findeInhalt(inhalte, angabe).id;

// ─── Ausgabe ────────────────────────────────────────────────────────────────

function planZeile(e: SocialPlanEintrag, inhalte: readonly SocialInhalt[], heute: string) {
  const inhalt = inhaltById(inhalte, e.inhalt_id);
  return kompakt({
    plan_id: e.id,
    datum: e.datum,
    uhrzeit: e.uhrzeit,
    kanal: e.kanal,
    format: e.format,
    saeule: e.saeule === null ? '' : saeuleLabel(e.saeule),
    thema: e.thema,
    inhalt: inhalt ? inhaltName(inhalt) : '',
    inhalt_id: e.inhalt_id,
    status: e.status,
    hinweis: e.hinweis,
    zustaendig: e.zustaendig,
    veroeffentlicht_am: tag(e.erledigt_am),
    veroeffentlicht_von: e.erledigt_von,
    ueberfaellig: !istVeroeffentlicht(e) && e.datum < heute ? true : '',
    im_archiv: e.archiviert ? true : '',
  });
}

function inhaltZeile(i: SocialInhalt) {
  return kompakt({
    inhalt_id: i.id,
    kennung: i.kennung,
    titel: i.titel,
    art: i.art,
    serie: i.serie,
    saeule: i.saeule === null ? '' : saeuleLabel(i.saeule),
    status: i.status,
    hook: i.hook,
    slides: parseSlides(i.slides).length || '',
    hinweis: i.hinweis,
    im_archiv: i.archiviert ? true : '',
  });
}

function aufgabeZeile(a: SocialAufgabe, heute: string) {
  return kompakt({
    aufgabe_id: a.id,
    bereich: a.bereich,
    titel: a.titel,
    beschreibung: a.beschreibung,
    dringlichkeit: a.dringlichkeit,
    faellig: a.faellig_am,
    ueberfaellig: !istErledigt(a) && a.faellig_am && a.faellig_am < heute ? true : '',
    zustaendig: a.zustaendig,
    erledigt_am: tag(a.erledigt_am),
    erledigt_von: a.erledigt_von,
    im_archiv: a.archiviert ? true : '',
  });
}

function hookZeile(h: SocialHook, inhalte: readonly SocialInhalt[]) {
  const inhalt = inhaltById(inhalte, h.inhalt_id);
  return kompakt({
    hook_id: h.id,
    saeule: h.saeule === null ? '' : saeuleLabel(h.saeule),
    text: h.text,
    status: h.status,
    inhalt: inhalt ? inhaltName(inhalt) : '',
    inhalt_id: h.inhalt_id,
    im_archiv: h.archiviert ? true : '',
  });
}

const textZeile = (t: SocialText) =>
  kompakt({ text_id: t.id, schluessel: t.schluessel, titel: t.titel, text: t.text, im_archiv: t.archiviert ? true : '' });

function dmZeile(d: SocialDm, inhalte: readonly SocialInhalt[]) {
  const inhalt = inhaltById(inhalte, d.inhalt_id);
  return kompakt({
    dm_id: d.id,
    datum: d.datum,
    kanal: d.kanal,
    stichwort: d.stichwort,
    ausgeloest_durch: inhalt ? inhaltName(inhalt) : '',
    name: d.name,
    shop: d.shop,
    nachricht: d.nachricht,
    qualifiziert: d.qualifiziert ? true : '',
    beantwortet_von: d.beantwortet_von,
    anfrage_id: d.eingang_id,
    notiz: d.notiz,
  });
}

const ZAHLEN = [
  'reichweite',
  'speicherungen',
  'geteilt',
  'profilaufrufe',
  'link_klicks',
  'kommentare',
  'story_antworten',
  'umfrage_antworten',
  'neue_follower',
  'follower_zielgruppe',
  'sitzungen',
  'formulare',
  'erstgespraeche',
  'angebote_wert_eur',
] as const;
type Zahlen = Pick<SocialWert, (typeof ZAHLEN)[number]>;
const zahlenVon = (w: Zahlen) => Object.fromEntries(ZAHLEN.map((feld) => [feld, w[feld]])) as Zahlen;

function wertZeile(w: SocialWert, inhalte: readonly SocialInhalt[]) {
  const inhalt = inhaltById(inhalte, w.inhalt_id);
  return kompakt({ wert_id: w.id, art: w.art, datum: w.datum, inhalt: inhalt ? inhaltName(inhalt) : '', ...zahlenVon(w), notiz: w.notiz });
}

// ─── Eingaben der Service-Methoden aus bestehenden Einträgen ────────────────

const planInput = (e: SocialPlanEintrag): SocialPlanInput => ({
  datum: e.datum, uhrzeit: e.uhrzeit, kanal: e.kanal, format: e.format, saeule: e.saeule, thema: e.thema, inhalt_id: e.inhalt_id, status: e.status, hinweis: e.hinweis, zustaendig: e.zustaendig,
});
/** What the hub's "Termin anlegen" starts with. */
const leererPlan = (heute: string): SocialPlanInput => ({
  datum: heute, uhrzeit: '07:30', kanal: 'instagram', format: 'karussell', saeule: 1, thema: '', inhalt_id: '', status: 'geplant', hinweis: '', zustaendig: '',
});

const inhaltInput = (i: SocialInhalt): SocialInhaltInput => ({
  kennung: i.kennung, art: i.art, serie: i.serie, saeule: i.saeule, titel: i.titel, ziel: i.ziel, hook: i.hook, slides: parseSlides(i.slides), caption: i.caption,
  cta: i.cta, hashtags: i.hashtags, alt_text: i.alt_text, ton: i.ton, material: i.material, hinweis: i.hinweis, status: i.status,
});
const LEERER_INHALT: SocialInhaltInput = {
  kennung: '', art: 'karussell', serie: '', saeule: 1, titel: '', ziel: '', hook: '', slides: [], caption: '', cta: '', hashtags: '', alt_text: '', ton: '', material: '', hinweis: '', status: 'idee',
};

const hookInput = (h: SocialHook): SocialHookInput => ({ saeule: h.saeule, text: h.text, status: h.status, inhalt_id: h.inhalt_id });
const aufgabeInput = (a: SocialAufgabe): SocialAufgabeInput => ({
  bereich: a.bereich, titel: a.titel, beschreibung: a.beschreibung, dringlichkeit: a.dringlichkeit, faellig_am: a.faellig_am, zustaendig: a.zustaendig,
});
const textInput = (t: SocialText): SocialTextInput => ({ schluessel: t.schluessel, titel: t.titel, text: t.text });
const dmInput = (d: SocialDm): SocialDmInput => ({
  datum: d.datum, kanal: d.kanal, stichwort: d.stichwort, inhalt_id: d.inhalt_id, name: d.name, shop: d.shop, nachricht: d.nachricht, qualifiziert: d.qualifiziert,
  beantwortet_von: d.beantwortet_von, notiz: d.notiz,
});

interface Schalter<T> {
  wert: boolean | undefined;
  ist: (eintrag: T) => boolean;
  setze: (id: string, wert: boolean, geaendertAm: string) => Promise<T>;
  text: [an: string, aus: string];
}

/**
 * Saves the changed fields (or creates the entry), then flips the switches (published, done, archived)
 * one after the other, each with the fresh timestamp. Returns the entry and what happened.
 */
async function speichere<T extends { id: string; geaendert_am: string }, I extends object>(
  vorhanden: T | undefined,
  basis: I,
  aenderungen: Partial<I>,
  speichern: (input: I, existing?: { id: string; expectedGeaendertAm: string }) => Promise<T>,
  schalter: Schalter<T>[],
): Promise<{ eintrag: T; erledigt: string[] }> {
  const erledigt: string[] = [];
  let eintrag = vorhanden;
  if (!eintrag || Object.keys(aenderungen).length > 0) {
    eintrag = await speichern({ ...basis, ...aenderungen }, vorhanden && { id: vorhanden.id, expectedGeaendertAm: vorhanden.geaendert_am });
    erledigt.push(vorhanden ? `geändert: ${Object.keys(aenderungen).join(', ')}` : 'angelegt');
  }
  for (const s of schalter) {
    if (s.wert === undefined || s.wert === s.ist(eintrag)) continue;
    eintrag = await s.setze(eintrag.id, s.wert, eintrag.geaendert_am);
    erledigt.push(s.wert ? s.text[0] : s.text[1]);
  }
  if (erledigt.length === 0) erledigt.push('nichts geändert');
  return { eintrag, erledigt };
}

const archivSchalter = <T extends { archiviert: boolean }>(wert: boolean | undefined, setze: Schalter<T>['setze']): Schalter<T> => ({
  wert,
  ist: (e) => e.archiviert,
  setze,
  text: ['archiviert', 'wiederhergestellt'],
});

// ─── Werkzeuge ──────────────────────────────────────────────────────────────

export function registriereSocial(k: Werkzeugkasten): void {
  const { server, service, heute, meinName, sicher, lesen, schreiben } = k;
  /** Names must be in the team, like everywhere else in the hub. */
  const pruefe = async (name: string | undefined) => {
    if (name?.trim()) pruefeTeam(await service.load(), name);
  };

  server.registerTool(
    'social_ueberblick',
    {
      title: 'Social Media: Überblick',
      description:
        'Wie die Startseite des Social-Media-Werkzeugs (90-Tage-Plan): veröffentlicht/geplant, überfällige und nächste Termine, offene Aufgaben, DMs dieser Woche je Stichwort, Ist- und Soll-Anteil der Säulen, letzte DMs. Dazu die Wertelisten (Kanäle, Formate, Status). Guter Einstieg.',
      annotations: lesen,
    },
    sicher(async () => {
      const daten = await service.loadSocialDaten();
      const h = heute();
      const plan = sortierePlan(daten.plan);
      const ueberfaellig = ueberfaelligeEintraege(daten.plan, h);
      const offen = offeneAufgaben(daten.aufgaben);
      const dms = dmsJeStichwort(daten.dms, montag(h), h);
      return antwort({
        heute: h,
        kennzahlen: {
          veroeffentlicht: `${plan.filter(istVeroeffentlicht).length} von ${plan.length} Terminen`,
          ueberfaellig: ueberfaellig.length,
          offene_aufgaben: offen.length,
          dms_diese_woche: dms.reduce((n, d) => n + d.anzahl, 0),
          dms_je_stichwort: dms,
        },
        ueberfaellig: ueberfaellig.slice(0, MAX_ZEILEN).map((e) => planZeile(e, daten.inhalte, h)),
        weitere_ueberfaellige: Math.max(0, ueberfaellig.length - MAX_ZEILEN),
        als_naechstes: naechsteEintraege(daten.plan, h, MAX_ZEILEN).map((e) => planZeile(e, daten.inhalte, h)),
        offene_aufgaben: offen.slice(0, MAX_ZEILEN).map((a) => aufgabeZeile(a, h)),
        saeulen: SAEULEN.map((s) => {
          const anzahl = plan.filter((e) => e.saeule === s.nr).length;
          return { nr: s.nr, name: s.name, zweck: s.zweck, soll_prozent: s.anteil, ist_prozent: plan.length > 0 ? Math.round((anzahl / plan.length) * 100) : 0 };
        }),
        letzte_dms: [...daten.dms]
          .sort((a, b) => b.datum.localeCompare(a.datum))
          .slice(0, 5)
          .map((d) => dmZeile(d, daten.inhalte)),
        wertelisten: {
          kanaele: KANAELE,
          formate: FORMATE,
          plan_status: PLAN_STATUS,
          inhalt_arten: INHALT_ARTEN,
          inhalt_status: INHALT_STATUS,
          aufgaben_bereiche: AUFGABEN_BEREICHE,
          dringlichkeiten: DRINGLICHKEITEN,
          stichworte: STICHWORTE,
        },
        leer: plan.length + daten.inhalte.length === 0 ? 'Noch leer: `social_startplan_uebernehmen` füllt den 90-Tage-Plan.' : '',
        hub: SOCIAL,
      });
    }),
  );

  server.registerTool(
    'social_startplan_uebernehmen',
    {
      title: 'Social Media: Startplan übernehmen',
      description:
        'Füllt das noch leere Social-Media-Werkzeug mit dem 90-Tage-Plan (Inhalte, Redaktionsplan, Hooks, Aufgaben, Strategie-Texte), wie der Knopf im Hub. Geht nur, solange dort nichts steht.',
      annotations: schreiben,
    },
    sicher(async () => {
      const anzahl = await service.uebernimmSocialPlan();
      return antwort({ erledigt: 'Startplan übernommen', ...anzahl, hub: SOCIAL });
    }),
  );

  server.registerTool(
    'social_plan',
    {
      title: 'Social Media: Redaktionsplan',
      description:
        'Termine des Redaktionsplans nach Kalenderwochen, je Woche veröffentlicht/gesamt. Standard: ab Montag dieser Woche. Liefert plan_id für `social_plan_speichern`.',
      inputSchema: {
        von: datum.optional().describe('Erster Tag, Standard: Montag dieser Woche'),
        bis: datum.optional().describe('Letzter Tag'),
        kanal: auswahl(KANAELE).optional(),
        saeule: z.number().int().min(1).max(4).optional(),
        status: auswahl(PLAN_STATUS).optional(),
        nur_offene: z.boolean().optional().describe('Nur noch nicht veröffentlichte'),
        archivierte_zeigen: z.boolean().optional(),
        limit: z.number().int().min(1).max(300).optional().describe('Höchstens so viele Termine, Standard 60'),
      },
      annotations: lesen,
    },
    sicher(async ({ von, bis, kanal, saeule, status, nur_offene, archivierte_zeigen, limit }) => {
      const daten = await service.loadSocialDaten();
      const h = heute();
      const start = von ?? montag(h);
      const treffer = sortierePlan(daten.plan, archivierte_zeigen).filter(
        (e) =>
          e.datum >= start &&
          (!bis || e.datum <= bis) &&
          (!kanal || e.kanal === kanal) &&
          (saeule === undefined || e.saeule === saeule) &&
          (!status || e.status === status) &&
          (!nur_offene || !istVeroeffentlicht(e)),
      );
      const gezeigt = treffer.slice(0, limit ?? 60);
      const wochen = new Map<string, SocialPlanEintrag[]>();
      for (const e of gezeigt) {
        const woche = montag(e.datum);
        wochen.set(woche, [...(wochen.get(woche) ?? []), e]);
      }
      return antwort({
        von: start,
        bis: bis ?? '',
        wochen: [...wochen.entries()].map(([woche, eintraege]) => ({
          woche_ab: woche,
          veroeffentlicht: `${eintraege.filter(istVeroeffentlicht).length} von ${eintraege.length}`,
          termine: eintraege.map((e) => planZeile(e, daten.inhalte, h)),
        })),
        mehr: Math.max(0, treffer.length - gezeigt.length),
        frueher_ueberfaellig: von ? undefined : ueberfaelligeEintraege(daten.plan, start).length || undefined,
        hub: `${SOCIAL}/plan`,
      });
    }),
  );

  server.registerTool(
    'social_plan_speichern',
    {
      title: 'Social Media: Termin anlegen oder ändern',
      description:
        'Legt einen Termin im Redaktionsplan an (ohne plan_id; thema ist Pflicht, sonst wie im Hub: heute, 07:30, instagram, karussell, Säule 1, geplant) oder ändert ihn – nur angegebene Felder. veroeffentlicht: true hakt ihn ab (Status „veroeffentlicht“), false nimmt das zurück (Status „bereit“). archiviert blendet ihn aus bzw. holt ihn zurück; vorher nachfragen.',
      inputSchema: {
        plan_id: z.string().optional().describe('Bestehender Termin aus `social_plan`'),
        datum: datum.optional(),
        uhrzeit: z.string().optional().describe('HH:MM, "" für live gepostete Stories'),
        kanal: auswahl(KANAELE).optional().describe(erklaere(KANAELE)),
        format: auswahl(FORMATE).optional().describe(erklaere(FORMATE)),
        saeule: saeuleFeld,
        thema: z.string().optional(),
        inhalt: inhaltFeld('Inhalt, den der Termin veröffentlicht'),
        status: auswahl(PLAN_STATUS).optional().describe(erklaere(PLAN_STATUS)),
        hinweis: z.string().optional().describe('Was noch fehlt, z. B. "Design offen"'),
        zustaendig: z.string().optional().describe('Vorname(n) aus dem Team, mit Komma getrennt'),
        veroeffentlicht: z.boolean().optional(),
        archiviert: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ plan_id, inhalt, veroeffentlicht, archiviert, ...felder }) => {
      const daten = await service.loadSocialDaten();
      const vorhanden = plan_id ? finde(daten.plan, plan_id, 'Termin', 'social_plan') : undefined;
      await pruefe(felder.zustaendig);
      const { eintrag, erledigt } = await speichere(
        vorhanden,
        vorhanden ? planInput(vorhanden) : leererPlan(heute()),
        ohneUndefined({ ...felder, inhalt_id: inhaltIdAus(daten.inhalte, inhalt) }) as Partial<SocialPlanInput>,
        (input, existing) => service.savePlanEintrag(input, existing),
        [
          { wert: veroeffentlicht, ist: istVeroeffentlicht, setze: (id, w, t) => service.setPlanErledigt(id, w, t), text: ['als veröffentlicht abgehakt', 'Haken entfernt'] },
          archivSchalter(archiviert, (id, w, t) => service.setPlanArchiviert(id, w, t)),
        ],
      );
      return antwort({ erledigt, termin: planZeile(eintrag, daten.inhalte, heute()), hub: `${SOCIAL}/plan` });
    }),
  );

  server.registerTool(
    'social_inhalte',
    {
      title: 'Social Media: Inhalte',
      description:
        'Ohne inhalt: die Inhalte-Bibliothek (Karussells, Reels, Einzelbilder, Stories) mit Kennung, Titel, Status. Mit inhalt (ID oder Kennung wie K1): alles zum Produzieren – Hook, Slides/Beats mit Text, Gestaltung und Sprechertext, Caption, CTA, Hashtags, Alt-Text – plus Termine im Plan, Hooks, Messwerte und ausgelöste DMs.',
      inputSchema: {
        inhalt: z.string().optional().describe('inhalt_id oder Kennung für die Detailansicht'),
        art: auswahl(INHALT_ARTEN).optional(),
        saeule: z.number().int().min(1).max(4).optional(),
        status: auswahl(INHALT_STATUS).optional().describe(erklaere(INHALT_STATUS)),
        archivierte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ inhalt, art, saeule, status, archivierte_zeigen }) => {
      const daten = await service.loadSocialDaten();
      const h = heute();
      if (inhalt) {
        const i = findeInhalt(daten.inhalte, inhalt);
        return antwort({
          ...inhaltZeile(i),
          ...kompakt({ ziel: i.ziel }),
          slides: parseSlides(i.slides).map((s, nr) => kompakt({ nr: nr + 1, ...s })),
          ...kompakt({ caption: i.caption, cta: i.cta, hashtags: i.hashtags, alt_text: i.alt_text, ton: i.ton, material: i.material }),
          termine: sortierePlan(daten.plan).filter((e) => e.inhalt_id === i.id).map((e) => planZeile(e, daten.inhalte, h)),
          hooks: sortiereHooks(daten.hooks).filter((hk) => hk.inhalt_id === i.id).map((hk) => hookZeile(hk, daten.inhalte)),
          messwerte: daten.werte.filter((w) => w.inhalt_id === i.id).map((w) => wertZeile(w, daten.inhalte)),
          dms: daten.dms.filter((d) => d.inhalt_id === i.id).map((d) => dmZeile(d, daten.inhalte)),
          hub: inhaltLink(i.id),
        });
      }
      const liste = sortiereInhalte(daten.inhalte, archivierte_zeigen).filter(
        (i) => (!art || i.art === art) && (saeule === undefined || i.saeule === saeule) && (!status || i.status === status),
      );
      return antwort({ anzahl: liste.length, inhalte: liste.map(inhaltZeile), hub: `${SOCIAL}/inhalte` });
    }),
  );

  const slideSchema = z.object({
    label: z.string().optional().describe('"1 (Hook)" bei Karussells, "0–2" bei Reel-Beats'),
    text: z.string().optional().describe('Text auf der Slide, wörtlich'),
    gestaltung: z.string().optional().describe('Layout bzw. Shotlist beim Reel'),
    sprecher: z.string().optional().describe('Sprechertext eines Reel-Beats'),
  });

  server.registerTool(
    'social_inhalt_speichern',
    {
      title: 'Social Media: Inhalt anlegen oder ändern',
      description:
        'Legt einen Inhalt an (ohne inhalt; titel ist Pflicht) oder ändert ihn – nur angegebene Felder. slides ersetzt alle Slides/Beats; vorher mit `social_inhalte` die aktuellen holen und vollständig zurückgeben. Texte für Instagram/LinkedIn per „du“. archiviert blendet ihn aus bzw. holt ihn zurück; vorher nachfragen.',
      inputSchema: {
        inhalt: z.string().optional().describe('Bestehender Inhalt: inhalt_id oder Kennung'),
        kennung: z.string().optional().describe('Kurzzeichen für den Plan, z. B. K4, R2, E3, S7'),
        art: auswahl(INHALT_ARTEN).optional(),
        serie: z.string().optional().describe('Wiederkehrende Serie, z. B. "UMZUGSPLAN #2"'),
        saeule: saeuleFeld,
        titel: z.string().optional(),
        ziel: z.string().optional().describe('Wofür der Post da ist'),
        hook: z.string().optional().describe('Überschrift auf Slide 1 bzw. die ersten zwei Sekunden'),
        slides: z.array(slideSchema).optional(),
        caption: z.string().optional(),
        cta: z.string().optional(),
        hashtags: z.string().optional(),
        alt_text: z.string().optional(),
        ton: z.string().optional().describe('Sound beim Reel, Interaktions-Sticker bei der Story'),
        material: z.string().optional().describe('Was vorher aufgenommen oder freigegeben werden muss'),
        hinweis: z.string().optional(),
        status: auswahl(INHALT_STATUS).optional().describe(erklaere(INHALT_STATUS)),
        archiviert: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ inhalt, archiviert, slides, ...felder }) => {
      const daten = await service.loadSocialDaten();
      const vorhanden = inhalt ? findeInhalt(daten.inhalte, inhalt) : undefined;
      const { eintrag, erledigt } = await speichere(
        vorhanden,
        vorhanden ? inhaltInput(vorhanden) : LEERER_INHALT,
        ohneUndefined({
          ...felder,
          slides: slides?.map((s) => ({ label: s.label ?? '', text: s.text ?? '', gestaltung: s.gestaltung ?? '', sprecher: s.sprecher ?? '' })),
        }) as Partial<SocialInhaltInput>,
        (input, existing) => service.saveInhalt(input, existing),
        [archivSchalter(archiviert, (id, w, t) => service.setInhaltArchiviert(id, w, t))],
      );
      return antwort({ erledigt, inhalt: inhaltZeile(eintrag), hub: inhaltLink(eintrag.id) });
    }),
  );

  server.registerTool(
    'social_aufgaben',
    {
      title: 'Social Media: Aufgaben',
      description:
        'Aufgaben rund um den Plan, nach Bereich (woche1 = Erste Woche, fehlt = Was fehlt, ritual = Immer wieder): offene zuerst, nach Dringlichkeit. Standard: nur offene. Liefert aufgabe_id für `social_aufgabe_speichern`.',
      inputSchema: {
        bereich: auswahl(AUFGABEN_BEREICHE).optional(),
        zustaendig: z.string().optional().describe('Nur Aufgaben dieser Person'),
        erledigte_zeigen: z.boolean().optional(),
        archivierte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ bereich, zustaendig, erledigte_zeigen, archivierte_zeigen }) => {
      const daten = await service.loadSocialDaten();
      const h = heute();
      const person = zustaendig ? klein(zustaendig) : '';
      const alle = sortiereAufgaben(daten.aufgaben, archivierte_zeigen).filter((a) => !person || klein(a.zustaendig).split(/\s*,\s*/).includes(person));
      return antwort({
        offen: daten.aufgaben.filter((a) => !a.archiviert && !istErledigt(a)).length,
        bereiche: AUFGABEN_BEREICHE.filter((b) => !bereich || b.wert === bereich).map((b) => {
          const eigene = alle.filter((a) => a.bereich === b.wert);
          return {
            bereich: b.wert,
            name: bereichLabel(b.wert),
            offen: eigene.filter((a) => !istErledigt(a)).length,
            aufgaben: (erledigte_zeigen ? eigene : eigene.filter((a) => !istErledigt(a))).map((a) => aufgabeZeile(a, h)),
          };
        }),
        hub: `${SOCIAL}/aufgaben`,
      });
    }),
  );

  server.registerTool(
    'social_aufgabe_speichern',
    {
      title: 'Social Media: Aufgabe anlegen oder ändern',
      description:
        'Legt eine Aufgabe an (ohne aufgabe_id; titel ist Pflicht, Bereich Standard „fehlt“) oder ändert sie – nur angegebene Felder. erledigt: true hakt sie ab, false öffnet sie wieder. archiviert blendet sie aus bzw. holt sie zurück; vorher nachfragen.',
      inputSchema: {
        aufgabe_id: z.string().optional().describe('Bestehende Aufgabe aus `social_aufgaben`'),
        bereich: auswahl(AUFGABEN_BEREICHE).optional().describe(erklaere(AUFGABEN_BEREICHE)),
        titel: z.string().optional(),
        beschreibung: z.string().optional(),
        dringlichkeit: z.union([auswahl(DRINGLICHKEITEN), z.literal('')]).optional().describe(`${erklaere(DRINGLICHKEITEN)}; nur im Bereich „fehlt“`),
        faellig_am: z.union([datum, z.literal('')]).optional(),
        zustaendig: z.string().optional().describe('Vorname(n) aus dem Team, mit Komma getrennt'),
        erledigt: z.boolean().optional(),
        archiviert: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ aufgabe_id, erledigt, archiviert, ...felder }) => {
      const daten = await service.loadSocialDaten();
      const vorhanden = aufgabe_id ? finde(daten.aufgaben, aufgabe_id, 'Aufgabe', 'social_aufgaben') : undefined;
      await pruefe(felder.zustaendig);
      const basis: SocialAufgabeInput = vorhanden
        ? aufgabeInput(vorhanden)
        : { bereich: 'fehlt', titel: '', beschreibung: '', dringlichkeit: felder.bereich && felder.bereich !== 'fehlt' ? '' : 'diese_woche', faellig_am: '', zustaendig: '' };
      const { eintrag, erledigt: gemacht } = await speichere(
        vorhanden,
        basis,
        ohneUndefined(felder) as Partial<SocialAufgabeInput>,
        (input, existing) => service.saveAufgabe(input, existing),
        [
          { wert: erledigt, ist: istErledigt, setze: (id, w, t) => service.setAufgabeErledigt(id, w, t), text: ['erledigt', 'wieder offen'] },
          archivSchalter(archiviert, (id, w, t) => service.setAufgabeArchiviert(id, w, t)),
        ],
      );
      return antwort({ erledigt: gemacht, aufgabe: aufgabeZeile(eintrag, heute()), hub: `${SOCIAL}/aufgaben` });
    }),
  );

  server.registerTool(
    'social_strategie',
    {
      title: 'Social Media: Strategie und Hooks',
      description:
        'Die Strategie-Texte (Fundament, Kanäle, Säulen, Formate, Messung, Rollen …) im Wortlaut, die vier Säulen und die Hook-Bibliothek (frei/benutzt). Liefert text_id und hook_id zum Ändern.',
      inputSchema: {
        abschnitt: z.string().optional().describe('Nur diesen Text: text_id, Schlüssel (z. B. fundament) oder Titel'),
        nur_freie_hooks: z.boolean().optional(),
        archivierte_zeigen: z.boolean().optional(),
      },
      annotations: lesen,
    },
    sicher(async ({ abschnitt, nur_freie_hooks, archivierte_zeigen }) => {
      const daten = await service.loadSocialDaten();
      const texte = sortiereTexte(daten.texte, archivierte_zeigen);
      if (abschnitt) {
        const wert = klein(abschnitt);
        const text = texte.find((t) => t.id === abschnitt.trim() || klein(t.schluessel) === wert || klein(t.titel) === wert);
        if (!text) return fehler(`Abschnitt „${abschnitt}“ nicht gefunden. Möglich: ${texte.map((t) => t.schluessel || t.titel).join(', ')}.`);
        return antwort({ ...textZeile(text), hub: `${SOCIAL}/strategie` });
      }
      const hooks = sortiereHooks(daten.hooks, archivierte_zeigen).filter((h) => !nur_freie_hooks || h.status !== 'benutzt');
      return antwort({
        saeulen: SAEULEN,
        texte: texte.map(textZeile),
        hooks_frei: daten.hooks.filter((h) => !h.archiviert && h.status !== 'benutzt').length,
        hooks: hooks.map((h) => hookZeile(h, daten.inhalte)),
        hub: `${SOCIAL}/strategie`,
      });
    }),
  );

  server.registerTool(
    'social_hook_speichern',
    {
      title: 'Social Media: Hook anlegen oder ändern',
      description:
        'Legt einen Hook in der Bibliothek an (ohne hook_id; text ist Pflicht) oder ändert ihn – nur angegebene Felder. status „benutzt“ markiert ihn als verwendet, am besten mit dem Inhalt, der ihn trägt. archiviert blendet ihn aus bzw. holt ihn zurück.',
      inputSchema: {
        hook_id: z.string().optional().describe('Bestehender Hook aus `social_strategie`'),
        saeule: saeuleFeld,
        text: z.string().optional(),
        status: z.enum(['frei', 'benutzt']).optional(),
        inhalt: inhaltFeld('Inhalt, der den Hook trägt'),
        archiviert: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ hook_id, inhalt, archiviert, ...felder }) => {
      const daten = await service.loadSocialDaten();
      const vorhanden = hook_id ? finde(daten.hooks, hook_id, 'Hook', 'social_strategie') : undefined;
      const { eintrag, erledigt } = await speichere(
        vorhanden,
        vorhanden ? hookInput(vorhanden) : { saeule: 1, text: '', status: 'frei', inhalt_id: '' },
        ohneUndefined({ ...felder, inhalt_id: inhaltIdAus(daten.inhalte, inhalt) }) as Partial<SocialHookInput>,
        (input, existing) => service.saveHook(input, existing),
        [archivSchalter(archiviert, (id, w, t) => service.setHookArchiviert(id, w, t))],
      );
      return antwort({ erledigt, hook: hookZeile(eintrag, daten.inhalte), hub: `${SOCIAL}/strategie` });
    }),
  );

  server.registerTool(
    'social_text_speichern',
    {
      title: 'Social Media: Strategie-Text anlegen oder ändern',
      description:
        'Legt einen Abschnitt der Strategie an (ohne abschnitt; titel ist Pflicht) oder ändert ihn – nur angegebene Felder. text ersetzt den ganzen Abschnitt; vorher mit `social_strategie` lesen. archiviert blendet ihn aus bzw. holt ihn zurück; vorher nachfragen.',
      inputSchema: {
        abschnitt: z.string().optional().describe('Bestehender Abschnitt: text_id oder Schlüssel (z. B. fundament)'),
        schluessel: z.string().optional().describe('Fester Schlüssel eines neuen Abschnitts, Kleinbuchstaben'),
        titel: z.string().optional(),
        text: z.string().optional(),
        archiviert: z.boolean().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ abschnitt, archiviert, ...felder }) => {
      const daten = await service.loadSocialDaten();
      let vorhanden: SocialText | undefined;
      if (abschnitt) {
        const wert = klein(abschnitt);
        vorhanden = daten.texte.find((t) => t.id === abschnitt.trim()) ?? daten.texte.find((t) => t.schluessel && klein(t.schluessel) === wert);
        if (!vorhanden) return fehler(`Abschnitt „${abschnitt}“ nicht gefunden. IDs und Schlüssel über \`social_strategie\` holen.`);
      }
      const { eintrag, erledigt } = await speichere(
        vorhanden,
        vorhanden ? textInput(vorhanden) : { schluessel: '', titel: '', text: '' },
        ohneUndefined(felder) as Partial<SocialTextInput>,
        (input, existing) => service.saveSocialText(input, existing),
        [archivSchalter(archiviert, (id, w, t) => service.setSocialTextArchiviert(id, w, t))],
      );
      return antwort({ erledigt, abschnitt: kompakt({ text_id: eintrag.id, schluessel: eintrag.schluessel, titel: eintrag.titel }), hub: `${SOCIAL}/strategie` });
    }),
  );

  server.registerTool(
    'social_messung',
    {
      title: 'Social Media: Messung',
      description: `Wie die Messungs-Seite: eigener Median (Speicherungen + Geteilt pro Reichweite, letzte ${MEDIAN_FENSTER} Posts), Urteil je Serie/Format (verdoppeln/aussortieren/beobachten, erst ab ${MINDEST_POSTS} gemessenen Posts), gemessene Posts, Wochen- und Monatszahlen, DMs (mit dm_id zum Ändern) und das Linkziel für UTM-Links.`,
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe('Höchstens so viele Posts, Perioden und DMs, Standard 20'),
      },
      annotations: lesen,
    },
    sicher(async ({ limit }) => {
      const [daten, db] = await Promise.all([service.loadSocialDaten(), service.load()]);
      const h = heute();
      const n = limit ?? 20;
      const posts = postKennwerte(daten.werte, daten.inhalte);
      const dmsWoche = dmsJeStichwort(daten.dms, montag(h), h);
      return antwort({
        kennzahlen: {
          eigener_median: prozent(eigenerMedian(posts)) || 'noch keiner',
          gemessene_posts: posts.length,
          vergleich: posts.length < MINDEST_POSTS ? `ab ${MINDEST_POSTS} gemessenen Posts` : 'läuft',
          dms_diese_woche: dmsWoche.reduce((s, d) => s + d.anzahl, 0),
          dms_je_stichwort: dmsWoche,
          qualifizierte_dms: daten.dms.filter((d) => d.qualifiziert).length,
        },
        bewertungen: bewerteGruppen(daten.werte, daten.inhalte, daten.dms).map((b) => ({
          gruppe: b.gruppe,
          urteil: URTEIL_LABEL[b.urteil],
          begruendung: b.begruendung,
          posts: b.posts.length,
          dms: b.dms,
          qualifizierte_dms: b.qualifizierteDms,
        })),
        posts: posts.slice(0, n).map((p) => ({ ...wertZeile(p.wert, daten.inhalte), kennwert: prozent(p.kennwert) })),
        perioden: daten.werte
          .filter((w) => w.art !== 'post')
          .sort((a, b) => b.datum.localeCompare(a.datum))
          .slice(0, n)
          .map((w) => wertZeile(w, daten.inhalte)),
        dms: [...daten.dms]
          .sort((a, b) => b.datum.localeCompare(a.datum))
          .slice(0, n)
          .map((d) => dmZeile(d, daten.inhalte)),
        linkziel: (db.einstellungen[EINSTELLUNG.socialZiel] ?? '').trim() || SOCIAL_ZIEL_STANDARD,
        hub: `${SOCIAL}/messung`,
      });
    }),
  );

  server.registerTool(
    'social_wert_erfassen',
    {
      title: 'Social Media: Zahlen erfassen',
      description:
        'Trägt Zahlen ein: art „post“ (Pflicht: inhalt; reichweite, speicherungen, geteilt, profilaufrufe, link_klicks, kommentare), „woche“ (story_antworten, umfrage_antworten, profilaufrufe, link_klicks) oder „monat“ (neue_follower, follower_zielgruppe, sitzungen aus Social, formulare, erstgespraeche, angebote_wert_eur). Das Datum wird bei „woche“ auf den Montag, bei „monat“ auf den Ersten gesetzt. Gibt es für Art, Datum und Post schon Zahlen, werden nur die angegebenen Felder überschrieben.',
      inputSchema: {
        art: auswahl(WERT_ARTEN),
        datum: datum.optional().describe('Tag des Posts bzw. ein Tag der Woche/des Monats; Standard heute'),
        inhalt: z.string().optional().describe('Nur bei post: inhalt_id oder Kennung'),
        reichweite: zahl,
        speicherungen: zahl,
        geteilt: zahl,
        profilaufrufe: zahl,
        link_klicks: zahl,
        kommentare: zahl,
        story_antworten: zahl,
        umfrage_antworten: zahl,
        neue_follower: zahl,
        follower_zielgruppe: zahl.describe('Stichprobe: wie viele der letzten 30 neuen Follower zur Zielgruppe gehören'),
        sitzungen: zahl.describe('GA4, utm_source=instagram oder linkedin'),
        formulare: zahl,
        erstgespraeche: zahl,
        angebote_wert_eur: zahl,
        notiz: z.string().optional(),
      },
      annotations: { ...schreiben, idempotentHint: true },
    },
    sicher(async ({ art, datum: tagAngabe, inhalt, notiz, ...zahlen }) => {
      const daten = await service.loadSocialDaten();
      const basisTag = tagAngabe ?? heute();
      const tagFuerArt = art === 'woche' ? montag(basisTag) : art === 'monat' ? `${basisTag.slice(0, 7)}-01` : basisTag;
      const inhaltId = art === 'post' && inhalt ? findeInhalt(daten.inhalte, inhalt).id : '';
      if (art === 'post' && !inhaltId) return fehler('Bei art „post“ bitte den Inhalt angeben (inhalt_id oder Kennung).');
      const schluessel = { art, datum: tagFuerArt, inhalt_id: inhaltId };
      const vorhanden = findeWert(daten.werte, schluessel);
      const leer = Object.fromEntries(ZAHLEN.map((feld) => [feld, null])) as Zahlen;
      const basis: SocialWertInput = { ...schluessel, ...(vorhanden ? zahlenVon(vorhanden) : leer), notiz: vorhanden?.notiz ?? '' };
      const wert = await service.speichereWert({ ...basis, ...ohneUndefined({ ...zahlen, notiz }) });
      return antwort({ erledigt: vorhanden ? 'Zahlen ergänzt' : 'Zahlen eingetragen', wert: wertZeile(wert, daten.inhalte), hub: `${SOCIAL}/messung` });
    }),
  );

  server.registerTool(
    'social_dm_erfassen',
    {
      title: 'Social Media: DM erfassen oder ändern',
      description:
        'Erfasst eine DM mit Stichwort (ohne dm_id) oder ändert eine erfasste – nur angegebene Felder. Neue DMs landen zusätzlich als Anfrage im Eingang des CRM, wie im Hub (anfrage_anlegen, Standard: ja, sobald ein Name angegeben ist). Qualifiziert heißt: Onlineshop im DACH-Raum, Entscheider, echter Bedarf in den nächsten sechs Monaten.',
      inputSchema: {
        dm_id: z.string().optional().describe('Bestehende DM aus `social_messung`'),
        datum: datum.optional().describe('Standard heute'),
        kanal: z.enum(['instagram', 'linkedin']).optional().describe('Standard instagram'),
        stichwort: z.string().optional().describe(`z. B. ${STICHWORTE.join(', ')}; frei wählbar`),
        inhalt: inhaltFeld('Post, der die DM ausgelöst hat'),
        name: z.string().optional().describe('Name oder Handle'),
        shop: z.string().optional(),
        nachricht: z.string().optional(),
        qualifiziert: z.boolean().optional(),
        beantwortet_von: z.string().optional().describe('Vorname aus dem Team; Standard: wer angemeldet ist'),
        notiz: z.string().optional(),
        anfrage_anlegen: z.boolean().optional().describe('Nur beim Erfassen: auch als Anfrage in den Eingang legen'),
      },
      annotations: schreiben,
    },
    sicher(async ({ dm_id, inhalt, anfrage_anlegen, ...felder }) => {
      const daten = await service.loadSocialDaten();
      await pruefe(felder.beantwortet_von);
      const aenderungen = ohneUndefined({ ...felder, inhalt_id: inhaltIdAus(daten.inhalte, inhalt) }) as Partial<SocialDmInput>;
      if (dm_id) {
        const vorhanden = finde(daten.dms, dm_id, 'DM', 'social_messung');
        if (anfrage_anlegen) return fehler('Eine Anfrage im Eingang entsteht nur beim Erfassen einer neuen DM.');
        const dm = await service.aendereDm(vorhanden.id, { ...dmInput(vorhanden), ...aenderungen }, vorhanden.geaendert_am);
        return antwort({ erledigt: `geändert: ${Object.keys(aenderungen).join(', ') || 'nichts'}`, dm: dmZeile(dm, daten.inhalte), hub: `${SOCIAL}/messung` });
      }
      const input: SocialDmInput = {
        datum: heute(), kanal: 'instagram', stichwort: '', inhalt_id: '', name: '', shop: '', nachricht: '', qualifiziert: false,
        beantwortet_von: meinName(await service.load()) ?? '', notiz: '',
        ...aenderungen,
      };
      const { dm, anfrage } = await service.erfasseDm(input, { anfrageAnlegen: anfrage_anlegen ?? Boolean(input.name.trim()) });
      return antwort({
        erledigt: anfrage ? 'DM erfasst und als Anfrage in den Eingang gelegt' : 'DM erfasst',
        dm: dmZeile(dm, daten.inhalte),
        hub: `${SOCIAL}/messung`,
      });
    }),
  );

  server.registerTool(
    'social_utm_link',
    {
      title: 'Social Media: UTM-Link bauen',
      description:
        'Baut einen Link mit UTM-Parametern nach dem Schema der Strategie (utm_medium=social, alles klein), damit Instagram und LinkedIn im selben GA4-Bericht landen. Ziel ist standardmäßig das gespeicherte Linkziel (Kontaktabschnitt mit Terminbuchung).',
      inputSchema: {
        quelle: z.enum(['instagram', 'linkedin']),
        kampagne: z.string().optional().describe('Standard "profil", z. B. die Kennung des Posts'),
        inhalt: z.string().optional().describe('utm_content, z. B. bio, story, dm'),
        ziel: z.string().optional().describe('Andere Ziel-URL als das gespeicherte Linkziel'),
      },
      annotations: lesen,
    },
    sicher(async ({ quelle, kampagne, inhalt, ziel }) => {
      const db = await service.load();
      const basis = ziel?.trim() || (db.einstellungen[EINSTELLUNG.socialZiel] ?? '').trim() || SOCIAL_ZIEL_STANDARD;
      return antwort({ link: utmLink(basis, { quelle, kampagne: kampagne ?? 'profil', inhalt }) });
    }),
  );
}
