/**
 * What the portal sends to clients on its own: instant notifications (new file from us, milestone reached, approval
 * needed, the team answered, news) and summaries ("Updates") in the rhythm the contact chose. Each contact picks the
 * channel for both: e-mail, the client's Slack channel or both. Pure functions; the portal function loads, sends and
 * remembers what went out.
 */
import { ValidationError } from './errors';
import { nachrichtMailHtml, type MailAbschnitt } from './portalMail';
import { meilensteineVon } from './portal';
import { monatName } from './monatsbericht';
import { normalisiereEmail, sichtbareKarten, type Berechtigung, type Kundensicht, type PortalDatei } from './portalApi';
import type { KundenDaten, PortalDaten, PortalZugang, TodoDaten } from './types';

export const UPDATE_RHYTHMEN = ['taeglich', 'woechentlich', 'monatlich', 'aus'] as const;
export type UpdateRhythmus = (typeof UPDATE_RHYTHMEN)[number];
export const KANAELE = ['email', 'slack', 'beide'] as const;
export type Kanal = (typeof KANAELE)[number];

export const RHYTHMUS_LABEL: Record<UpdateRhythmus, string> = { taeglich: 'Täglich', woechentlich: 'Wöchentlich', monatlich: 'Monatlich', aus: 'Keine Updates' };
export const KANAL_LABEL: Record<Kanal, string> = { email: 'E-Mail', slack: 'Slack', beide: 'E-Mail und Slack' };

export interface PortalEinstellungen {
  updates: UpdateRhythmus;
  kanal_updates: Kanal;
  kanal_hinweise: Kanal;
}

/** What a contact gets without having chosen anything: a weekly summary and notifications, both by e-mail. */
export const STANDARD_EINSTELLUNGEN: PortalEinstellungen = { updates: 'woechentlich', kanal_updates: 'email', kanal_hinweise: 'email' };

/** Updates go out from this hour (Europe/Berlin) on their day: daily on workdays, weekly on Mondays, monthly on the 1st. */
export const UPDATE_STUNDE = 8;

const istRhythmus = (w: unknown): w is UpdateRhythmus => typeof w === 'string' && (UPDATE_RHYTHMEN as readonly string[]).includes(w);
const istKanal = (w: unknown): w is Kanal => typeof w === 'string' && (KANAELE as readonly string[]).includes(w);

/** The settings of a login, with defaults for anything not chosen (or no longer valid). */
export function einstellungenVon(z: Pick<PortalZugang, 'updates' | 'kanal_updates' | 'kanal_hinweise'>): PortalEinstellungen {
  return {
    updates: istRhythmus(z.updates) ? z.updates : STANDARD_EINSTELLUNGEN.updates,
    kanal_updates: istKanal(z.kanal_updates) ? z.kanal_updates : STANDARD_EINSTELLUNGEN.kanal_updates,
    kanal_hinweise: istKanal(z.kanal_hinweise) ? z.kanal_hinweise : STANDARD_EINSTELLUNGEN.kanal_hinweise,
  };
}

/** Checks settings from the portal or the hub. Slack only works when the client has a Slack channel. */
export function pruefeEinstellungen(eingabe: Record<string, unknown>, hatSlack: boolean): PortalEinstellungen {
  const { updates, kanal_updates, kanal_hinweise } = eingabe;
  if (!istRhythmus(updates)) throw new ValidationError('updates', 'Bitte wähl, wie oft du Updates bekommen möchtest.');
  if (!istKanal(kanal_updates) || !istKanal(kanal_hinweise)) throw new ValidationError('kanal', 'Bitte wähl E-Mail, Slack oder beides.');
  if (!hatSlack && (kanal_updates !== 'email' || kanal_hinweise !== 'email')) throw new ValidationError('kanal', 'Für euch ist noch kein Slack-Channel eingerichtet. Wähl bitte E-Mail.');
  return { updates, kanal_updates, kanal_hinweise };
}

/** Slack is used only when chosen and the client has a channel; e-mail whenever chosen, and as fallback without channel. */
export function wege(kanal: Kanal, hatSlack: boolean): { email: boolean; slack: boolean } {
  const slack = hatSlack && kanal !== 'email';
  return { slack, email: kanal !== 'slack' || !slack };
}

// ─── Instant notifications ──────────────────────────────────────────────────

export type EreignisArt = 'freigabe' | 'bericht' | 'meilenstein' | 'datei' | 'antwort' | 'neuigkeit';

export interface Ereignis {
  art: EreignisArt;
  titel: string;
  text: string;
  /** ISO time; sorts the message. */
  datum: string;
}

const ART_REIHENFOLGE: EreignisArt[] = ['freigabe', 'bericht', 'antwort', 'meilenstein', 'datei', 'neuigkeit'];
const ART_UEBERSCHRIFT: Record<EreignisArt, string> = {
  freigabe: 'Wartet auf deine Freigabe',
  bericht: 'Dein Monatsbericht ist da',
  antwort: 'Antworten vom Team',
  meilenstein: 'Meilenstein erreicht',
  datei: 'Neue Dateien von uns',
  neuigkeit: 'Neuigkeiten',
};
const AUSZUG_MAX = 280;
const auszug = (text: string) => (text.length > AUSZUG_MAX ? `${text.slice(0, AUSZUG_MAX - 1).trimEnd()}…` : text);

const imFenster = (zeit: string, seit: string, bis: string) => !!zeit && zeit > seit && zeit <= bis;

/**
 * Everything the contact should hear about that happened after `seit` up to `bis`: only what the portal shows them
 * (released cards, visible news, the client share), never their own actions.
 */
export function ereignisseSeit(args: {
  berechtigung: Berechtigung;
  kunden: Pick<KundenDaten, 'news'>;
  todos: Pick<TodoDaten, 'boards' | 'aufgaben' | 'kommentare'>;
  portal: Pick<PortalDaten, 'meilensteine'> & Partial<Pick<PortalDaten, 'berichte'>>;
  dateien: readonly PortalDatei[];
  teamDomain: string;
  seit: string;
  bis: string;
}): Ereignis[] {
  const { berechtigung, kunden, todos, portal, dateien, teamDomain, seit, bis } = args;
  const { firma } = berechtigung;
  const ich = normalisiereEmail(berechtigung.kontakt.email);
  const liste: Ereignis[] = [];

  for (const n of kunden.news) {
    if ((n.firma_id !== firma.id && n.firma_id !== '') || !n.sichtbar_kunde || n.archiviert || !imFenster(n.erstellt_am, seit, bis)) continue;
    // A milestone news says the same as the milestone itself; it counts as one.
    liste.push({ art: n.art === 'meilenstein' ? 'meilenstein' : 'neuigkeit', titel: n.titel, text: auszug(n.text), datum: n.erstellt_am });
  }
  for (const m of meilensteineVon(portal.meilensteine, firma.id)) {
    if (m.status !== 'erledigt' || !imFenster(m.geaendert_am, seit, bis)) continue;
    if (liste.some((e) => e.art === 'meilenstein' && e.titel.includes(m.titel))) continue;
    liste.push({ art: 'meilenstein', titel: m.titel, text: '', datum: m.geaendert_am });
  }
  for (const b of portal.berichte ?? []) {
    if (b.firma_id !== firma.id || b.status !== 'freigegeben' || !imFenster(b.freigegeben_am, seit, bis)) continue;
    liste.push({ art: 'bericht', titel: `Monatsbericht ${monatName(b.monat)}`, text: auszug(b.kommentar || 'Zahlen, Erledigtes und was als Nächstes kommt – im Kundenportal unter „Zahlen“.'), datum: b.freigegeben_am });
  }
  const karten = sichtbareKarten(todos, firma.id);
  for (const k of karten) {
    if (k.freigabe === 'offen' && imFenster(k.freigabe_am, seit, bis)) liste.push({ art: 'freigabe', titel: k.titel, text: auszug(k.beschreibung), datum: k.freigabe_am });
  }
  const sichtbar = new Map(karten.map((k) => [k.id, k]));
  const antworten = new Map<string, Ereignis>();
  for (const c of todos.kommentare) {
    const karte = sichtbar.get(c.aufgabe_id);
    const von = normalisiereEmail(c.von);
    if (!karte || !von.endsWith(`@${teamDomain}`) || von === ich || !imFenster(c.datum, seit, bis)) continue;
    // One entry per card with the newest answer.
    const alt = antworten.get(karte.id);
    if (!alt || c.datum > alt.datum) antworten.set(karte.id, { art: 'antwort', titel: karte.titel, text: auszug(c.text), datum: c.datum });
  }
  liste.push(...antworten.values());
  for (const d of dateien) {
    if (d.von === 'velonify' && imFenster(d.geaendert, seit, bis)) liste.push({ art: 'datei', titel: d.name, text: '', datum: d.geaendert });
  }
  return liste.sort((a, b) => ART_REIHENFOLGE.indexOf(a.art) - ART_REIHENFOLGE.indexOf(b.art) || a.datum.localeCompare(b.datum));
}

function nachEreignisArt(ereignisse: readonly Ereignis[]): MailAbschnitt[] {
  return ART_REIHENFOLGE.map((art) => ({
    ueberschrift: ART_UEBERSCHRIFT[art],
    punkte: ereignisse.filter((e) => e.art === art).map((e) => ({ titel: e.titel, text: e.text })),
  })).filter((a) => a.punkte.length > 0);
}

export interface Nachricht {
  betreff: string;
  text: string;
  html: string;
  /** The same as Slack mrkdwn, for the client's channel. */
  slack: string;
}

const sicherSlack = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function baueNachricht(args: { betreff: string; vorschau: string; vorname: string; einleitung: string; abschnitte: MailAbschnitt[]; portalUrl: string; fuss: string; slackKopf: string }): Nachricht {
  const { betreff, vorname, einleitung, abschnitte, portalUrl, fuss } = args;
  const text = [
    `Hallo${vorname ? ` ${vorname}` : ''},`,
    '',
    einleitung,
    ...abschnitte.flatMap((a) => ['', `${a.ueberschrift}:`, ...a.punkte.map((p) => `- ${p.titel}${p.text ? `\n  ${p.text.replace(/\n/g, '\n  ')}` : ''}`)]),
    '',
    `Im Kundenportal ansehen: ${portalUrl}`,
    '',
    'Viele Grüße',
    'dein Velonify-Team',
    '',
    fuss,
  ].join('\n');
  const slack = [
    args.slackKopf,
    ...abschnitte.flatMap((a) => [`*${sicherSlack(a.ueberschrift)}*`, ...a.punkte.map((p) => `• ${sicherSlack(p.titel)}`)]),
    `<${portalUrl}|Im Kundenportal ansehen>`,
  ].join('\n');
  return {
    betreff,
    text,
    html: nachrichtMailHtml({ titel: betreff, vorschau: args.vorschau, vorname, einleitung, abschnitte, knopf: { text: 'Im Kundenportal ansehen', href: portalUrl }, fuss }),
    slack,
  };
}

const FUSS = 'Wie oft und wo du von uns hörst, stellst du im Kundenportal unter „Einstellungen“ ein.';

/** The instant notification about one or more events (sent together when several happened since the last run). */
export function hinweisNachricht(args: { ereignisse: readonly Ereignis[]; vorname: string; firmaName: string; portalUrl: string }): Nachricht {
  const { ereignisse, vorname, firmaName, portalUrl } = args;
  const einzeln = ereignisse.length === 1 ? ereignisse[0] : null;
  const betreff = einzeln?.art === 'bericht'
    ? `Dein ${einzeln.titel} ist da`
    : einzeln
    ? `${{ freigabe: 'Bitte freigeben', bericht: 'Monatsbericht', antwort: 'Antwort vom Team', meilenstein: 'Meilenstein erreicht', datei: 'Neue Datei', neuigkeit: 'Neuigkeit' }[einzeln.art]}: ${einzeln.titel}`
    : `${ereignisse.length} Neuigkeiten in eurem Projekt bei Velonify`;
  return baueNachricht({
    betreff,
    vorschau: einzeln ? einzeln.titel : `Neues für ${firmaName}`,
    vorname,
    einleitung: einzeln ? `es gibt etwas Neues im Projekt von ${firmaName}.` : `seit unserer letzten Nachricht ist im Projekt von ${firmaName} einiges passiert.`,
    abschnitte: nachEreignisArt(ereignisse),
    portalUrl,
    fuss: FUSS,
    slackKopf: `:bell: *Neu im Kundenportal* · ${sicherSlack(firmaName)}`,
  });
}

// ─── Updates (summaries) ────────────────────────────────────────────────────

const berlin = (jetzt: Date) => {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(jetzt)
      .map((t) => [t.type, t.value]),
  );
  return { tag: `${teile.year}-${teile.month}-${teile.day}`, stunde: Number(teile.hour), wochentag: teile.weekday as string, monatstag: Number(teile.day) };
};

const PERIODE_TAGE: Record<Exclude<UpdateRhythmus, 'aus'>, number> = { taeglich: 1, woechentlich: 7, monatlich: 30 };

/**
 * Whether a summary is due now, and the time it covers. Due on its day from UPDATE_STUNDE on (daily: Monday to
 * Friday, weekly: Monday, monthly: the 1st), once per day. A first summary covers one period back.
 */
export function updateFaellig(rhythmus: UpdateRhythmus, letztes: string, jetzt: Date): { faellig: boolean; seit: string } {
  if (rhythmus === 'aus') return { faellig: false, seit: '' };
  const b = berlin(jetzt);
  const tagPasst = rhythmus === 'taeglich' ? !['Sat', 'Sun'].includes(b.wochentag) : rhythmus === 'woechentlich' ? b.wochentag === 'Mon' : b.monatstag === 1;
  const schonHeute = !!letztes && berlin(new Date(letztes)).tag === b.tag;
  // Friday's daily update covers the weekend too, so Monday's starts where it ended.
  const seit = letztes || new Date(jetzt.getTime() - PERIODE_TAGE[rhythmus] * 86_400_000).toISOString();
  return { faellig: tagPasst && b.stunde >= UPDATE_STUNDE && !schonHeute, seit };
}

const ZEITRAUM: Record<Exclude<UpdateRhythmus, 'aus'>, { betreff: string; seit: string }> = {
  taeglich: { betreff: 'Dein Tages-Update', seit: 'seit gestern' },
  woechentlich: { betreff: 'Dein Wochen-Update', seit: 'in der letzten Woche' },
  monatlich: { betreff: 'Dein Monats-Update', seit: 'im letzten Monat' },
};

/** The summary for a contact, or null when there is nothing at all to report (then nothing is sent). */
export function updateNachricht(args: { rhythmus: Exclude<UpdateRhythmus, 'aus'>; sicht: Kundensicht; ereignisse: readonly Ereignis[]; seit: string; portalUrl: string }): Nachricht | null {
  const { rhythmus, sicht, ereignisse, seit, portalUrl } = args;
  const seitTag = seit.slice(0, 10);
  const wartet = sicht.karten.filter((k) => k.phase === 'wartet');
  const erledigt = sicht.karten.filter((k) => k.phase === 'erledigt' && k.erledigt_am >= seitTag);
  const arbeit = sicht.karten.filter((k) => k.phase === 'arbeit');
  const naechster = sicht.fahrplan.find((m) => m.status !== 'erledigt');
  const sonst = ereignisse.filter((e) => e.art === 'meilenstein' || e.art === 'neuigkeit' || e.art === 'datei');
  if (wartet.length + erledigt.length + sonst.length === 0) return null;

  const abschnitte: MailAbschnitt[] = [
    { ueberschrift: 'Wartet auf deine Freigabe', punkte: wartet.map((k) => ({ titel: k.titel })) },
    { ueberschrift: `Erledigt ${ZEITRAUM[rhythmus].seit}`, punkte: erledigt.map((k) => ({ titel: k.titel })) },
    ...nachEreignisArt(sonst),
    { ueberschrift: 'Daran arbeiten wir gerade', punkte: arbeit.map((k) => ({ titel: k.titel })) },
    { ueberschrift: 'Nächster Meilenstein', punkte: naechster ? [{ titel: naechster.titel, text: naechster.datum ? `geplant bis ${naechster.datum.split('-').reverse().join('.')}` : '' }] : [] },
  ].filter((a) => a.punkte.length > 0);

  const teile = [erledigt.length ? `${erledigt.length} erledigt` : '', wartet.length ? `${wartet.length} wartet auf dich` : ''].filter(Boolean).join(', ');
  return baueNachricht({
    betreff: `${ZEITRAUM[rhythmus].betreff} · ${sicht.kunde.name}`,
    vorschau: teile || 'Was im Projekt passiert ist',
    vorname: sicht.ich.vorname,
    einleitung: `hier ist der Stand im Projekt von ${sicht.kunde.name}: was ${ZEITRAUM[rhythmus].seit} passiert ist und was gerade ansteht.`,
    abschnitte,
    portalUrl,
    fuss: FUSS,
    slackKopf: `:memo: *${ZEITRAUM[rhythmus].betreff}* · ${sicherSlack(sicht.kunde.name)}`,
  });
}
