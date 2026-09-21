import { isIsoDate } from './ids';
import { ValidationError } from './errors';
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
  SocialSlide,
  SocialText,
  SocialTextInput,
  SocialWert,
  SocialWertInput,
} from './types';

/*
 * Social media: fixed vocabularies and the maths behind the plan. Everything a person may change – texts,
 * dates, numbers – lives in the sheet; only what business logic depends on is written down here.
 */

export interface Saeule {
  nr: number;
  name: string;
  kurz: string;
  /** Share of all posts, in percent */
  anteil: number;
  zweck: string;
}

export const SAEULEN: readonly Saeule[] = [
  { nr: 1, name: 'Umzug ohne Verlust', kurz: 'UMZUG', anteil: 35, zweck: 'Umzügler abholen, Angst vor dem Umzug in einen Plan verwandeln' },
  { nr: 2, name: 'Daten, die stimmen', kurz: 'DATEN', anteil: 25, zweck: 'Shopify-Bestand abholen, zeigen, dass wir Fehler finden, die andere übersehen' },
  { nr: 3, name: 'Mehr aus dem Shop', kurz: 'SHOP', anteil: 20, zweck: 'Zeigen, dass wir nach dem Livegang weiterarbeiten' },
  { nr: 4, name: 'Kein Umweg', kurz: 'UMWEG', anteil: 20, zweck: 'Den Unterschied zu anderen Agenturen greifbar machen' },
];

export const saeule = (nr: number | null) => SAEULEN.find((s) => s.nr === nr) ?? null;
export const saeuleLabel = (nr: number | null) => (nr === null ? '–' : `${nr} · ${saeule(nr)?.name ?? 'Unbekannt'}`);

export const KANAELE = [
  { wert: 'instagram', label: 'Instagram' },
  { wert: 'ig_story', label: 'IG Story' },
  { wert: 'linkedin', label: 'LinkedIn' },
  { wert: 'intern', label: 'Intern' },
] as const;

export const FORMATE = [
  { wert: 'karussell', label: 'Karussell' },
  { wert: 'reel', label: 'Reel' },
  { wert: 'einzelbild', label: 'Einzelbild' },
  { wert: 'story', label: 'Story' },
  { wert: 'textpost', label: 'Textpost' },
  { wert: 'pdf', label: 'PDF-Karussell' },
  { wert: 'auswertung', label: 'Auswertung' },
] as const;

/** Kinds of content in the library. The plan knows more formats, because LinkedIn re-uses what exists. */
export const INHALT_ARTEN = [
  { wert: 'karussell', label: 'Karussell' },
  { wert: 'reel', label: 'Reel' },
  { wert: 'einzelbild', label: 'Einzelbild' },
  { wert: 'story', label: 'Story' },
] as const;

export const PLAN_STATUS = [
  { wert: 'geplant', label: 'Geplant' },
  { wert: 'in_arbeit', label: 'In Arbeit' },
  { wert: 'bereit', label: 'Bereit' },
  { wert: 'veroeffentlicht', label: 'Veröffentlicht' },
] as const;

export const INHALT_STATUS = [
  { wert: 'idee', label: 'Idee' },
  { wert: 'text', label: 'Text fertig' },
  { wert: 'gestaltung', label: 'In Gestaltung' },
  { wert: 'bereit', label: 'Fertig' },
  { wert: 'veroeffentlicht', label: 'Veröffentlicht' },
  { wert: 'wartet', label: 'Wartet auf Freigabe' },
] as const;

export const AUFGABEN_BEREICHE = [
  { wert: 'woche1', label: 'Erste Woche' },
  { wert: 'fehlt', label: 'Was fehlt' },
  { wert: 'ritual', label: 'Immer wieder' },
] as const;

export const DRINGLICHKEITEN = [
  { wert: 'sofort', label: 'Sofort' },
  { wert: 'diese_woche', label: 'Diese Woche' },
  { wert: 'vor_0110', label: 'Vor 01.10.' },
  { wert: 'vor_1310', label: 'Vor 13.10.' },
  { wert: 'spaeter', label: 'Später' },
] as const;

/** Keywords people send by DM. Free text is allowed too – these are the ones the plan asks for. */
export const STICHWORTE = ['UMZUG', 'DATEN', 'FLOWS'] as const;

const label = (liste: readonly { wert: string; label: string }[], wert: string) => liste.find((e) => e.wert === wert)?.label ?? (wert || '–');

export const kanalLabel = (wert: string) => label(KANAELE, wert);
export const formatLabel = (wert: string) => label(FORMATE, wert);
export const planStatusLabel = (wert: string) => label(PLAN_STATUS, wert);
export const inhaltStatusLabel = (wert: string) => label(INHALT_STATUS, wert);
export const bereichLabel = (wert: string) => label(AUFGABEN_BEREICHE, wert);
export const dringlichkeitLabel = (wert: string) => label(DRINGLICHKEITEN, wert);

// ─── Inhalte ─────────────────────────────────────────────────────────────────

export const LEERE_SLIDE: SocialSlide = { label: '', text: '', gestaltung: '', sprecher: '' };

/** Reads the stored slides; anything unreadable counts as none instead of breaking the page. */
export function parseSlides(json: string): SocialSlide[] {
  if (!json.trim()) return [];
  try {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data.map((slide) => ({ ...LEERE_SLIDE, ...(slide as Partial<SocialSlide>) }));
  } catch {
    return [];
  }
}

/** Empty slides at the end are dropped, so a half-filled form does not leave blanks in the sheet. */
export function slidesAlsJson(slides: readonly SocialSlide[]): string {
  const gefuellt = [...slides];
  const leer = (s: SocialSlide) => !s.label.trim() && !s.text.trim() && !s.gestaltung.trim() && !s.sprecher.trim();
  while (gefuellt.length > 0 && leer(gefuellt[gefuellt.length - 1])) gefuellt.pop();
  return gefuellt.length === 0 ? '' : JSON.stringify(gefuellt);
}

const nachSortierung = <T extends { sortierung: number | null }>(a: T, b: T) =>
  (a.sortierung ?? Number.MAX_SAFE_INTEGER) - (b.sortierung ?? Number.MAX_SAFE_INTEGER);

const sichtbar = <T extends { archiviert: boolean }>(items: readonly T[], mitArchivierten: boolean) =>
  mitArchivierten ? [...items] : items.filter((i) => !i.archiviert);

/** Content in library order: by position, then by handle, so K1 stays in front of K2. */
export function sortiereInhalte(inhalte: readonly SocialInhalt[], mitArchivierten = false): SocialInhalt[] {
  return sichtbar(inhalte, mitArchivierten).sort((a, b) => nachSortierung(a, b) || a.kennung.localeCompare(b.kennung, 'de'));
}

export const inhaltById = (inhalte: readonly SocialInhalt[], id: string) => inhalte.find((i) => i.id === id) ?? null;

/** Handle plus title, for lists and dropdowns. */
export const inhaltName = (inhalt: SocialInhalt) => [inhalt.kennung, inhalt.titel].filter(Boolean).join(' · ');

/** Which series a post belongs to, otherwise its kind – the unit the thresholds judge. */
export const gruppeVon = (inhalt: SocialInhalt) => inhalt.serie.replace(/\s*#\d+\s*$/, '').trim() || label(INHALT_ARTEN, inhalt.art);

// ─── Redaktionsplan ──────────────────────────────────────────────────────────

export const istVeroeffentlicht = (eintrag: SocialPlanEintrag) => Boolean(eintrag.erledigt_am);

/** By date, and within a day by time, so the morning post comes before the story. */
export function sortierePlan(plan: readonly SocialPlanEintrag[], mitArchivierten = false): SocialPlanEintrag[] {
  return sichtbar(plan, mitArchivierten).sort(
    (a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit || '99:99').localeCompare(b.uhrzeit || '99:99') || nachSortierung(a, b),
  );
}

/** Monday of the week a day falls into, as YYYY-MM-DD. */
export function montag(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDay;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface PlanWoche {
  /** Monday, YYYY-MM-DD */
  start: string;
  eintraege: SocialPlanEintrag[];
}

/** The plan in calendar weeks, each week in order. */
export function planNachWochen(plan: readonly SocialPlanEintrag[], mitArchivierten = false): PlanWoche[] {
  const wochen = new Map<string, SocialPlanEintrag[]>();
  for (const eintrag of sortierePlan(plan, mitArchivierten)) {
    const start = montag(eintrag.datum);
    let woche = wochen.get(start);
    if (!woche) wochen.set(start, (woche = []));
    woche.push(eintrag);
  }
  return [...wochen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, eintraege]) => ({ start, eintraege }));
}

/** What is coming up: unpublished entries from today on, earliest first. */
export function naechsteEintraege(plan: readonly SocialPlanEintrag[], heute: string, anzahl = 5): SocialPlanEintrag[] {
  return sortierePlan(plan)
    .filter((e) => !istVeroeffentlicht(e) && e.datum >= heute)
    .slice(0, anzahl);
}

/** Entries whose day has passed without anyone ticking them off. */
export function ueberfaelligeEintraege(plan: readonly SocialPlanEintrag[], heute: string): SocialPlanEintrag[] {
  return sortierePlan(plan).filter((e) => !istVeroeffentlicht(e) && e.datum < heute);
}

// ─── Aufgaben ────────────────────────────────────────────────────────────────

export const istErledigt = (aufgabe: SocialAufgabe) => Boolean(aufgabe.erledigt_am);

const DRINGLICHKEIT_RANG = new Map<string, number>(DRINGLICHKEITEN.map((d, i) => [d.wert, i]));

/** Open first, then by urgency and position; done tasks sink to the bottom. */
export function sortiereAufgaben(aufgaben: readonly SocialAufgabe[], mitArchivierten = false): SocialAufgabe[] {
  const rang = (a: SocialAufgabe) => DRINGLICHKEIT_RANG.get(a.dringlichkeit) ?? DRINGLICHKEITEN.length;
  return sichtbar(aufgaben, mitArchivierten).sort(
    (a, b) => Number(istErledigt(a)) - Number(istErledigt(b)) || rang(a) - rang(b) || nachSortierung(a, b),
  );
}

export const offeneAufgaben = (aufgaben: readonly SocialAufgabe[]) => sortiereAufgaben(aufgaben).filter((a) => !istErledigt(a));

export function aufgabenNachBereich(aufgaben: readonly SocialAufgabe[], bereich: string, mitArchivierten = false): SocialAufgabe[] {
  return sortiereAufgaben(aufgaben, mitArchivierten).filter((a) => a.bereich === bereich);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function sortiereHooks(hooks: readonly SocialHook[], mitArchivierten = false): SocialHook[] {
  return sichtbar(hooks, mitArchivierten).sort((a, b) => (a.saeule ?? 9) - (b.saeule ?? 9) || nachSortierung(a, b));
}

// ─── Strategietexte ──────────────────────────────────────────────────────────

export function sortiereTexte(texte: readonly SocialText[], mitArchivierten = false): SocialText[] {
  return sichtbar(texte, mitArchivierten).sort((a, b) => nachSortierung(a, b) || a.titel.localeCompare(b.titel, 'de'));
}

// ─── Messung ─────────────────────────────────────────────────────────────────

export const WERT_ARTEN = [
  { wert: 'post', label: 'Post' },
  { wert: 'woche', label: 'Woche' },
  { wert: 'monat', label: 'Monat' },
] as const;

/** How many posts the comparison needs before it says anything – section 10: "ab dem 9. Post". */
export const MINDEST_POSTS = 9;
/** Posts the median looks back over. */
export const MEDIAN_FENSTER = 8;
/** "Deutlich über dem Median", as a factor. */
export const VERDOPPELN_FAKTOR = 1.5;

/**
 * Saves plus shares per reach – the number section 10 compares. Null while reach is missing, so an
 * unfilled row does not count as a weak post.
 */
export function kennwert(wert: Pick<SocialWert, 'reichweite' | 'speicherungen' | 'geteilt'>): number | null {
  if (!wert.reichweite) return null;
  const speicherungen = wert.speicherungen ?? 0;
  const geteilt = wert.geteilt ?? 0;
  return (speicherungen + geteilt) / wert.reichweite;
}

export function median(werte: readonly number[]): number | null {
  if (werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}

export interface PostKennwert {
  wert: SocialWert;
  inhalt: SocialInhalt | null;
  datum: string;
  kennwert: number;
}

/** Every measured post, newest first. Rows without reach are left out – they say nothing. */
export function postKennwerte(werte: readonly SocialWert[], inhalte: readonly SocialInhalt[]): PostKennwert[] {
  return werte
    .filter((w) => w.art === 'post')
    .map((wert) => ({ wert, inhalt: inhaltById(inhalte, wert.inhalt_id), datum: wert.datum, kennwert: kennwert(wert) }))
    .filter((p): p is PostKennwert => p.kennwert !== null)
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

/** The team's own median over the last eight measured posts; null while there are none. */
export function eigenerMedian(posts: readonly PostKennwert[]): number | null {
  return median(posts.slice(0, MEDIAN_FENSTER).map((p) => p.kennwert));
}

export type Urteil = 'verdoppeln' | 'aussortieren' | 'beobachten' | 'zu_frueh';

export interface Bewertung {
  gruppe: string;
  posts: PostKennwert[];
  dms: number;
  qualifizierteDms: number;
  urteil: Urteil;
  begruendung: string;
}

/**
 * Judges every series and format against the team's own median, following the thresholds of section 10:
 * three times below the median without a single DM means sorting it out, twice clearly above or one
 * qualified DM means doing it twice as often. Below nine measured posts nothing is judged.
 */
export function bewerteGruppen(werte: readonly SocialWert[], inhalte: readonly SocialInhalt[], dms: readonly SocialDm[]): Bewertung[] {
  const posts = postKennwerte(werte, inhalte);
  const mittelwert = eigenerMedian(posts);
  const gruppen = new Map<string, PostKennwert[]>();
  for (const post of posts) {
    if (!post.inhalt) continue;
    const gruppe = gruppeVon(post.inhalt);
    let liste = gruppen.get(gruppe);
    if (!liste) gruppen.set(gruppe, (liste = []));
    liste.push(post);
  }

  return [...gruppen.entries()]
    .map(([gruppe, gruppenPosts]) => {
      const inhaltIds = new Set(gruppenPosts.map((p) => p.inhalt!.id));
      const eigeneDms = dms.filter((dm) => inhaltIds.has(dm.inhalt_id));
      const qualifizierteDms = eigeneDms.filter((dm) => dm.qualifiziert).length;
      const bewertung: Bewertung = {
        gruppe,
        posts: gruppenPosts,
        dms: eigeneDms.length,
        qualifizierteDms,
        urteil: 'zu_frueh',
        begruendung: `Erst ab ${MINDEST_POSTS} gemessenen Posts vergleichbar – bisher ${posts.length}.`,
      };
      if (posts.length < MINDEST_POSTS || mittelwert === null) return bewertung;

      const letzte = (n: number) => gruppenPosts.slice(0, n);
      if (qualifizierteDms > 0) {
        return { ...bewertung, urteil: 'verdoppeln' as const, begruendung: `${qualifizierteDms} qualifizierte DM ausgelöst. Eine DM mit Projektbezug zählt mehr als Reichweite.` };
      }
      if (gruppenPosts.length >= 2 && letzte(2).every((p) => p.kennwert >= mittelwert * VERDOPPELN_FAKTOR)) {
        return { ...bewertung, urteil: 'verdoppeln' as const, begruendung: `Zweimal hintereinander über dem ${VERDOPPELN_FAKTOR}-Fachen des Medians.` };
      }
      if (gruppenPosts.length >= 3 && letzte(3).every((p) => p.kennwert < mittelwert) && eigeneDms.length === 0) {
        return { ...bewertung, urteil: 'aussortieren' as const, begruendung: 'Dreimal hintereinander unter dem Median und keine DM ausgelöst.' };
      }
      return { ...bewertung, urteil: 'beobachten' as const, begruendung: 'Weder über der oberen noch unter der unteren Schwelle.' };
    })
    .sort((a, b) => b.posts.length - a.posts.length || a.gruppe.localeCompare(b.gruppe, 'de'));
}

export const URTEIL_LABEL: Record<Urteil, string> = {
  verdoppeln: 'Verdoppeln',
  aussortieren: 'Aussortieren',
  beobachten: 'Beobachten',
  zu_frueh: 'Zu früh',
};

/** DMs of a week, counted per keyword – the weekly number of section 10. */
export function dmsJeStichwort(dms: readonly SocialDm[], von: string, bis: string): { stichwort: string; anzahl: number; qualifiziert: number }[] {
  const imZeitraum = dms.filter((dm) => dm.datum >= von && dm.datum <= bis);
  const zaehler = new Map<string, { anzahl: number; qualifiziert: number }>();
  for (const dm of imZeitraum) {
    const stichwort = dm.stichwort.trim().toUpperCase() || 'OHNE STICHWORT';
    let eintrag = zaehler.get(stichwort);
    if (!eintrag) zaehler.set(stichwort, (eintrag = { anzahl: 0, qualifiziert: 0 }));
    eintrag.anzahl += 1;
    if (dm.qualifiziert) eintrag.qualifiziert += 1;
  }
  return [...zaehler.entries()].map(([stichwort, z]) => ({ stichwort, ...z })).sort((a, b) => b.anzahl - a.anzahl || a.stichwort.localeCompare(b.stichwort));
}

/** One row per kind and day: the metric entry updates it instead of piling up duplicates. */
export const wertSchluessel = (wert: Pick<SocialWert, 'art' | 'datum' | 'inhalt_id'>) => `${wert.art}|${wert.datum}|${wert.inhalt_id}`;

export function findeWert(werte: readonly SocialWert[], schluessel: Pick<SocialWert, 'art' | 'datum' | 'inhalt_id'>): SocialWert | null {
  const gesucht = wertSchluessel(schluessel);
  return werte.find((w) => wertSchluessel(w) === gesucht) ?? null;
}

// ─── UTM-Links ───────────────────────────────────────────────────────────────

/** Where every link from social leads: the contact section with the booking link. */
export const SOCIAL_ZIEL_STANDARD = 'https://velonify.de/#kontakt';

export interface UtmEingabe {
  quelle: 'instagram' | 'linkedin';
  kampagne: string;
  inhalt?: string;
}

/**
 * Builds a link after the scheme of section 10: parameters before the fragment, everything lower case,
 * so Instagram and LinkedIn end up in the same GA4 report.
 */
export function utmLink(ziel: string, eingabe: UtmEingabe): string {
  const [basis, fragment = ''] = (ziel.trim() || SOCIAL_ZIEL_STANDARD).split('#');
  const params = new URLSearchParams(basis.includes('?') ? basis.slice(basis.indexOf('?') + 1) : '');
  params.set('utm_source', eingabe.quelle);
  params.set('utm_medium', 'social');
  params.set('utm_campaign', eingabe.kampagne.trim().toLowerCase() || 'profil');
  const inhalt = (eingabe.inhalt ?? '').trim().toLowerCase();
  if (inhalt) params.set('utm_content', inhalt);
  else params.delete('utm_content');
  const pfad = basis.includes('?') ? basis.slice(0, basis.indexOf('?')) : basis;
  return `${pfad}?${params.toString()}${fragment ? `#${fragment}` : ''}`;
}

// ─── Prüfen vor dem Speichern ────────────────────────────────────────────────

const pflichtDatum = (feld: string, wert: string) => {
  const datum = wert.trim();
  if (!isIsoDate(datum)) throw new ValidationError(feld, 'Bitte ein Datum angeben.');
  return datum;
};

const pflichtText = (feld: string, wert: string, meldung: string) => {
  const text = wert.trim();
  if (!text) throw new ValidationError(feld, meldung);
  return text;
};

export function preparePlan(input: SocialPlanInput): SocialPlanInput {
  const uhrzeit = input.uhrzeit.trim();
  if (uhrzeit && !/^\d{2}:\d{2}$/.test(uhrzeit)) throw new ValidationError('uhrzeit', 'Uhrzeit bitte als HH:MM angeben, z. B. 07:30.');
  return {
    datum: pflichtDatum('datum', input.datum),
    uhrzeit,
    kanal: input.kanal.trim() || 'instagram',
    format: input.format.trim(),
    saeule: input.saeule,
    thema: pflichtText('thema', input.thema, 'Bitte ein Thema angeben.'),
    inhalt_id: input.inhalt_id.trim(),
    status: input.status.trim() || 'geplant',
    hinweis: input.hinweis.trim(),
    zustaendig: input.zustaendig.trim(),
  };
}

export function prepareInhalt(input: SocialInhaltInput): Omit<SocialInhaltInput, 'slides'> & { slides: string } {
  return {
    kennung: input.kennung.trim(),
    art: input.art.trim() || 'karussell',
    serie: input.serie.trim(),
    saeule: input.saeule,
    titel: pflichtText('titel', input.titel, 'Bitte einen Titel angeben.'),
    ziel: input.ziel.trim(),
    hook: input.hook.trim(),
    slides: slidesAlsJson(input.slides),
    caption: input.caption.trim(),
    cta: input.cta.trim(),
    hashtags: input.hashtags.trim(),
    alt_text: input.alt_text.trim(),
    ton: input.ton.trim(),
    material: input.material.trim(),
    hinweis: input.hinweis.trim(),
    status: input.status.trim() || 'idee',
  };
}

export function prepareHook(input: SocialHookInput): SocialHookInput {
  return {
    saeule: input.saeule,
    text: pflichtText('text', input.text, 'Bitte den Hook eintragen.'),
    status: input.status.trim() || 'frei',
    inhalt_id: input.inhalt_id.trim(),
  };
}

export function prepareAufgabe(input: SocialAufgabeInput): SocialAufgabeInput {
  const faellig = input.faellig_am.trim();
  if (faellig && !isIsoDate(faellig)) throw new ValidationError('faellig_am', 'Ungültiges Datum.');
  return {
    bereich: input.bereich.trim() || 'fehlt',
    titel: pflichtText('titel', input.titel, 'Bitte einen Titel angeben.'),
    beschreibung: input.beschreibung.trim(),
    dringlichkeit: input.dringlichkeit.trim(),
    faellig_am: faellig,
    zustaendig: input.zustaendig.trim(),
  };
}

export function prepareText(input: SocialTextInput): SocialTextInput {
  return {
    schluessel: input.schluessel.trim(),
    titel: pflichtText('titel', input.titel, 'Bitte eine Überschrift angeben.'),
    text: input.text.trim(),
  };
}

export function prepareWert(input: SocialWertInput): SocialWertInput {
  const art = input.art.trim() || 'post';
  if (art === 'post' && !input.inhalt_id.trim()) throw new ValidationError('inhalt_id', 'Bitte den Post auswählen, zu dem die Zahlen gehören.');
  return { ...input, art, datum: pflichtDatum('datum', input.datum), inhalt_id: input.inhalt_id.trim(), notiz: input.notiz.trim() };
}

export function prepareDm(input: SocialDmInput): SocialDmInput {
  return {
    datum: pflichtDatum('datum', input.datum),
    kanal: input.kanal.trim() || 'instagram',
    stichwort: input.stichwort.trim().toUpperCase(),
    inhalt_id: input.inhalt_id.trim(),
    name: input.name.trim(),
    shop: input.shop.trim(),
    nachricht: input.nachricht.trim(),
    qualifiziert: input.qualifiziert,
    beantwortet_von: input.beantwortet_von.trim(),
    notiz: input.notiz.trim(),
  };
}

/** What the inbox shows for a DM that was passed on to the CRM. */
export function dmAlsAnfrage(dm: SocialDmInput, inhalt: SocialInhalt | null): { quelle: string; nachricht: string } {
  const quelle = dm.kanal === 'linkedin' ? 'LinkedIn DM' : 'Instagram DM';
  const teile = [dm.stichwort ? `Stichwort: ${dm.stichwort}` : '', inhalt ? `Ausgelöst durch: ${inhaltName(inhalt)}` : '', dm.nachricht];
  return { quelle, nachricht: teile.filter(Boolean).join('\n') };
}
