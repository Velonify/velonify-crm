/**
 * Satisfaction and feedback of clients: 1–5 stars and an optional comment on a monthly report, a finished milestone,
 * a done card, or at any time. Criticism (1–3 stars) goes to the people looking after the client in Slack; at
 * 5 stars the portal asks for a Google review and whether we may quote the comment.
 */
import { EINSTELLUNG } from './constants';
import { ID_PREFIX, newId } from './ids';
import { monatName } from './monatsbericht';
import { meilensteineVon } from './portal';
import { PortalFehler } from './portalAktionen';
import { kundenBoard, normalisiereEmail, sichtbareKarten, type Berechtigung } from './portalApi';
import { erledigtSpalte, spaltenVon } from './todos';
import type { FeedbackAnlass, KundenFeedback, PortalDaten, TodoDaten } from './types';

export const FEEDBACK_ANLAESSE: readonly FeedbackAnlass[] = ['bericht', 'meilenstein', 'karte', 'frei'];
export const ANLASS_LABEL: Record<FeedbackAnlass, string> = { bericht: 'Monatsbericht', meilenstein: 'Meilenstein', karte: 'Aufgabe', frei: 'Feedback' };

/** Milestones finished within this many days are offered for a rating on the start page. */
export const MEILENSTEIN_FRAGE_TAGE = 30;
export const TEXT_MAX = 3000;
/** Up to this many stars counts as criticism and is reported in Slack. */
export const KRITIK_BIS = 3;

/** "bericht:2026-10", the key the portal uses to know what was rated already. */
export const feedbackSchluessel = (anlass: FeedbackAnlass, bezugId: string) => `${anlass}:${bezugId}`;

export const istKritik = (f: Pick<KundenFeedback, 'sterne'>) => f.sterne !== null && f.sterne <= KRITIK_BIS;

/**
 * Checks feedback from the portal against what the contact may see and returns the row to store. One rating per
 * contact and report, milestone or card; free feedback any time.
 */
export function pruefeFeedback(args: {
  berechtigung: Berechtigung;
  eingabe: Record<string, unknown>;
  todos: Pick<TodoDaten, 'boards' | 'aufgaben'>;
  portal: Pick<PortalDaten, 'meilensteine' | 'berichte' | 'feedback'>;
  jetzt: Date;
}): KundenFeedback {
  const { berechtigung, eingabe, todos, portal, jetzt } = args;
  const { firma, kontakt } = berechtigung;
  const anlass = eingabe.anlass as FeedbackAnlass;
  if (!FEEDBACK_ANLAESSE.includes(anlass)) throw new PortalFehler(400, 'Unbekannter Anlass.');
  const text = typeof eingabe.text === 'string' ? eingabe.text.trim() : '';
  if (text.length > TEXT_MAX) throw new PortalFehler(400, `Bitte höchstens ${TEXT_MAX} Zeichen.`);
  const roh = eingabe.sterne;
  const sterne = roh === null || roh === undefined || roh === '' ? null : Number(roh);
  if (sterne !== null && !(Number.isInteger(sterne) && sterne >= 1 && sterne <= 5)) throw new PortalFehler(400, 'Bitte 1 bis 5 Sterne vergeben.');
  if (anlass !== 'frei' && sterne === null) throw new PortalFehler(400, 'Bitte 1 bis 5 Sterne vergeben.');
  if (anlass === 'frei' && !text) throw new PortalFehler(400, 'Schreib uns bitte ein paar Worte.');

  const bezugId = anlass === 'frei' ? '' : String(eingabe.bezug_id ?? '').trim();
  const bezugTitel = ((): string => {
    if (anlass === 'frei') return '';
    if (anlass === 'bericht') {
      const b = (portal.berichte ?? []).find((x) => x.firma_id === firma.id && x.monat === bezugId && x.status === 'freigegeben');
      if (b) return `Monatsbericht ${monatName(b.monat)}`;
    }
    if (anlass === 'meilenstein') {
      const m = meilensteineVon(portal.meilensteine, firma.id).find((x) => x.id === bezugId && x.status === 'erledigt');
      if (m) return m.titel;
    }
    if (anlass === 'karte') {
      const board = kundenBoard(todos.boards, firma.id);
      const fertig = board ? erledigtSpalte(spaltenVon(board))?.id : undefined;
      const k = sichtbareKarten(todos, firma.id).find((x) => x.id === bezugId && x.spalte_id === fertig);
      if (k) return k.titel;
    }
    throw new PortalFehler(404, 'Das gibt es hier nicht (mehr).');
  })();

  const ich = normalisiereEmail(kontakt.email);
  if (anlass !== 'frei' && (portal.feedback ?? []).some((f) => f.firma_id === firma.id && f.anlass === anlass && f.bezug_id === bezugId && normalisiereEmail(f.von) === ich)) {
    throw new PortalFehler(409, 'Dazu hast du schon eine Bewertung abgegeben. Danke!');
  }

  const zeit = jetzt.toISOString();
  return {
    id: newId(ID_PREFIX.kunden_feedback),
    firma_id: firma.id,
    kontakt_id: kontakt.id,
    von: kontakt.email.trim(),
    anlass,
    bezug_id: bezugId,
    bezug_titel: bezugTitel,
    sterne,
    text,
    zitat_ok: sterne === 5 && !!text && eingabe.zitat_ok === true,
    gemeldet_am: '',
    erstellt_am: zeit,
    erstellt_von: kontakt.email.trim(),
    geaendert_am: zeit,
    geaendert_von: kontakt.email.trim(),
  };
}

/** What the portal needs: what this contact rated already, finished milestones still to rate, the Google review link. */
export function feedbackSicht(args: {
  berechtigung: Berechtigung;
  portal: Pick<PortalDaten, 'meilensteine' | 'feedback'>;
  einstellungen: Record<string, string>;
  jetzt: Date;
}): { gegeben: string[]; offen: { anlass: 'meilenstein'; bezug_id: string; titel: string }[]; bewertung_url: string } {
  const { berechtigung, portal, einstellungen, jetzt } = args;
  const ich = normalisiereEmail(berechtigung.kontakt.email);
  const gegeben = (portal.feedback ?? [])
    .filter((f) => f.firma_id === berechtigung.firma.id && f.anlass !== 'frei' && normalisiereEmail(f.von) === ich)
    .map((f) => feedbackSchluessel(f.anlass, f.bezug_id));
  const seit = new Date(jetzt.getTime() - MEILENSTEIN_FRAGE_TAGE * 86_400_000).toISOString();
  const offen = meilensteineVon(portal.meilensteine, berechtigung.firma.id)
    .filter((m) => m.status === 'erledigt' && m.geaendert_am >= seit && !gegeben.includes(feedbackSchluessel('meilenstein', m.id)))
    .map((m) => ({ anlass: 'meilenstein' as const, bezug_id: m.id, titel: m.titel }));
  const url = (einstellungen[EINSTELLUNG.googleBewertung] ?? '').trim();
  return { gegeben, offen, bewertung_url: /^https:\/\//.test(url) ? url : '' };
}

/** "★★★★☆" */
export const sterneText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

const sicher = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Slack message to the people looking after the client when feedback is critical. */
export function kritikNachricht(f: KundenFeedback, args: { firmaName: string; kontaktName: string; hub: string }): string {
  const link = `${args.hub.replace(/\/$/, '')}/#/kunden/${f.firma_id}/portal`;
  return [
    `:warning: *Kritisches Feedback von ${sicher(args.kontaktName)}* (${sicher(args.firmaName)})`,
    `${sterneText(f.sterne ?? 0)}  ${ANLASS_LABEL[f.anlass]}${f.bezug_titel ? `: *${sicher(f.bezug_titel)}*` : ''}`,
    ...(f.text ? [`> ${sicher(f.text).replace(/\n/g, '\n> ')}`] : []),
    `<${link}|Im Velonify Hub ansehen> · am besten heute noch melden.`,
  ].join('\n');
}

export type FeedbackAmpel = 'gut' | 'mittel' | 'kritisch';
export const AMPEL_LABEL: Record<FeedbackAmpel, string> = { gut: 'zufrieden', mittel: 'gemischt', kritisch: 'unzufrieden' };

/** Average stars of a client (optionally since a time), with a traffic light: from 4 good, from 3 mixed, below critical. */
export function zufriedenheit(liste: readonly KundenFeedback[], firmaId: string, seit = ''): { schnitt: number; anzahl: number; ampel: FeedbackAmpel } | null {
  const sterne = liste.filter((f) => f.firma_id === firmaId && f.sterne !== null && f.erstellt_am >= seit).map((f) => f.sterne!);
  if (sterne.length === 0) return null;
  const schnitt = Math.round((sterne.reduce((a, b) => a + b, 0) / sterne.length) * 10) / 10;
  return { schnitt, anzahl: sterne.length, ampel: schnitt >= 4 ? 'gut' : schnitt >= 3 ? 'mittel' : 'kritisch' };
}

export const feedbackVon = (liste: readonly KundenFeedback[], firmaId: string) => liste.filter((f) => f.firma_id === firmaId).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
