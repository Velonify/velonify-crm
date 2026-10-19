import { isAbgeschlossen, PHASEN, phaseLabel } from './constants';
import { AuthExpiredError } from './errors';
import { kontaktName } from './rules';
import { kennzahlen, meinTag, offeneDeals, ruhtSeit, wahrscheinlichkeit } from './selectors';
import { suche } from './suche';
import { faelligkeit, istErledigt, meineAufgaben } from './todos';
import type { Database, TodoDaten } from './types';
import { istZustaendig } from './zustaendig';

/**
 * "Frag den Hub": a question goes to the Cloud Function (Claude Haiku, fixed prompt and tools); when Claude wants data
 * it asks for a tool, which runs here in the browser on the hub data the person already sees. Read-only.
 */

export interface Block {
  type: string;
  [feld: string]: unknown;
}
export interface Nachricht {
  role: 'user' | 'assistant';
  content: string | Block[];
}
export interface Runde {
  content: Block[];
  stop_reason: string | null;
}

export interface FrageApi {
  runde(verlauf: Nachricht[], ich: string): Promise<Runde>;
}

export interface FrageKontext {
  db: Database;
  heute: string;
  ich: string | null;
  /** Loaded only when a question needs the to-do boards. */
  todo(): Promise<TodoDaten>;
}

export interface FrageErgebnis {
  text: string;
  /** Firms the tools returned and the answer names: shown as chips that open the side sheet. */
  firmen: { id: string; name: string }[];
  runden: number;
}

const MAX_RUNDEN = 6;
const euro = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString('de-DE')} €` : '–');

/** Runs one tool on the hub data; returns what Claude gets back (compact JSON) and the firms it mentions. */
export async function fuehreAus(name: string, eingabe: Record<string, unknown>, k: FrageKontext): Promise<{ text: string; firmen: Map<string, string> }> {
  const { db, heute } = k;
  const firmen = new Map<string, string>();
  const firmaVon = (id: string) => {
    const f = db.firmen.find((x) => x.id === id);
    if (f) firmen.set(f.id, f.name);
    return f;
  };
  const text = (v: unknown) => String(v ?? '').trim();
  let ergebnis: unknown;

  switch (name) {
    case 'suche': {
      ergebnis = suche(db, text(eingabe.text), 5).map((t) => {
        if (t.firmaId) firmaVon(t.firmaId);
        return { art: t.art, titel: t.titel, details: t.details, firma_id: t.firmaId || undefined, id: t.id };
      });
      break;
    }
    case 'firma': {
      const id = text(eingabe.id);
      const f = firmaVon(id) ?? db.firmen.find((x) => x.name.toLowerCase() === id.toLowerCase());
      if (!f) {
        ergebnis = { fehler: 'Keine Firma mit dieser id. Erst mit „suche“ die id holen.' };
        break;
      }
      firmen.set(f.id, f.name);
      ergebnis = {
        id: f.id, name: f.name, domain: f.domain, status: f.status, plattform: [f.plattform, f.version].filter(Boolean).join(' '), zustaendig: f.zustaendig, ort: f.ort,
        deals: db.deals.filter((d) => d.firma_id === f.id && !d.archiviert).map((d) => ({
          titel: d.titel, phase: phaseLabel(d.phase), wert: euro(d.wert_eur), naechster_schritt: d.naechster_schritt, faellig: d.naechster_schritt_am, zustaendig: d.zustaendig,
        })),
        kontakte: db.kontakte.filter((x) => x.firma_id === f.id && !x.archiviert).slice(0, 5).map((x) => ({ name: kontaktName(x), rolle: x.rolle })),
        wiedervorlagen: db.wiedervorlagen.filter((w) => w.firma_id === f.id && !w.erledigt_am).map((w) => ({ titel: w.titel, faellig: w.faellig_am })),
        verlauf: db.aktivitaeten.filter((a) => a.firma_id === f.id).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 5).map((a) => ({ datum: a.datum.slice(0, 10), text: a.text.slice(0, 200) })),
      };
      break;
    }
    case 'pipeline': {
      const phase = text(eingabe.phase).toLowerCase();
      const wer = text(eingabe.zustaendig);
      ergebnis = offeneDeals(db.deals)
        .filter((d) => (!phase || d.phase === phase) && (!wer || istZustaendig(d.zustaendig, wer)))
        .flatMap((d) => {
          const f = firmaVon(d.firma_id);
          if (!f || f.archiviert) return [];
          return [{
            firma: f.name, firma_id: f.id, deal: d.titel, phase: phaseLabel(d.phase), wert: euro(d.wert_eur), wahrscheinlichkeit: `${wahrscheinlichkeit(d)} %`,
            naechster_schritt: d.naechster_schritt, faellig: d.naechster_schritt_am, zustaendig: d.zustaendig, tage_ohne_aktivitaet: ruhtSeit(d, db.aktivitaeten, heute),
          }];
        });
      if (phase && !PHASEN.includes(phase as (typeof PHASEN)[number])) ergebnis = { fehler: `Unbekannte Phase. Möglich: ${PHASEN.filter((p) => !isAbgeschlossen(p)).join(', ')}` };
      break;
    }
    case 'faellig': {
      const person = text(eingabe.person) || null;
      const tag = meinTag(db, person, heute, 7);
      const zeile = (a: (typeof tag.heute)[number]) => {
        if (a.firma) firmen.set(a.firma.id, a.firma.name);
        return { art: a.art === 'deal' ? 'nächster Schritt' : 'Wiedervorlage', titel: a.titel, firma: a.firma?.name, faellig: a.faellig, zustaendig: a.zustaendig };
      };
      ergebnis = { heute, ueberfaellig: tag.ueberfaellig.map(zeile), heute_faellig: tag.heute.map(zeile), naechste_7_tage: tag.naechsteTage.map(zeile), deals_ohne_naechsten_schritt: tag.ohneNaechstenSchritt.length };
      break;
    }
    case 'kennzahlen': {
      const z = kennzahlen(db.deals, heute);
      const ueberfaellig = offeneDeals(db.deals).filter((d) => d.naechster_schritt_am && d.naechster_schritt_am < heute).length;
      ergebnis = { offene_deals: z.offen, pipeline_wert: euro(z.pipelineWert), gewichtet: euro(z.gewichtet), im_angebot: euro(z.angebotWert), gewonnen_diesen_monat: z.gewonnenMonat, gewonnen_wert_diesen_monat: euro(z.gewonnenMonatWert), ueberfaellige_schritte: ueberfaellig };
      break;
    }
    case 'todos': {
      const daten = await k.todo();
      const person = text(eingabe.person);
      const karten = person ? meineAufgaben(daten.aufgaben, daten.boards, person) : daten.aufgaben.filter((a) => !a.archiviert && !istErledigt(a));
      ergebnis = karten.slice(0, 40).map((a) => ({
        titel: a.titel, board: daten.boards.find((b) => b.id === a.board_id)?.titel ?? '', zustaendig: a.zustaendig, faellig: a.faellig_am, stand: faelligkeit(a, heute),
      }));
      break;
    }
    default:
      ergebnis = { fehler: `Unbekanntes Werkzeug ${name}.` };
  }
  return { text: JSON.stringify(ergebnis).slice(0, 12_000), firmen };
}

/** The whole question: rounds with Claude until it answers in text (at most MAX_RUNDEN). */
export async function frageHub(api: FrageApi, frage: string, k: FrageKontext): Promise<FrageErgebnis> {
  const verlauf: Nachricht[] = [{ role: 'user', content: frage.trim() }];
  const gefunden = new Map<string, string>();
  for (let runde = 1; runde <= MAX_RUNDEN; runde++) {
    const antwort = await api.runde(verlauf, k.ich ?? '');
    verlauf.push({ role: 'assistant', content: antwort.content });
    const aufrufe = antwort.content.filter((b) => b.type === 'tool_use');
    if (antwort.stop_reason !== 'tool_use' || aufrufe.length === 0) {
      const text = antwort.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('').trim();
      const firmen = [...gefunden].filter(([, name]) => text.includes(name)).map(([id, name]) => ({ id, name }));
      return { text: text || 'Dazu habe ich keine Antwort gefunden.', firmen, runden: runde };
    }
    const ergebnisse: Block[] = [];
    for (const aufruf of aufrufe) {
      try {
        const { text, firmen } = await fuehreAus(String(aufruf.name), (aufruf.input as Record<string, unknown>) ?? {}, k);
        firmen.forEach((name, id) => gefunden.set(id, name));
        ergebnisse.push({ type: 'tool_result', tool_use_id: aufruf.id, content: text });
      } catch (err) {
        ergebnisse.push({ type: 'tool_result', tool_use_id: aufruf.id, content: err instanceof Error ? err.message : 'Fehler', is_error: true });
      }
    }
    verlauf.push({ role: 'user', content: ergebnisse });
  }
  return { text: 'Die Frage war zu verzweigt. Bitte enger fassen, z. B. nach einer Firma oder Person.', firmen: [], runden: MAX_RUNDEN };
}

/** Questions read like "Wer …?", "Wie viele …", or end with a question mark: then asking comes first in ⌘K. */
export const istFrage = (text: string) => /\?\s*$/.test(text) || /^(wer|was|wie|welche[rsmn]?|wo|wann|warum|wieso|zeig|gib|liste|nenn)\b/i.test(text.trim());

export class CloudFrage implements FrageApi {
  constructor(
    private readonly url: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  async runde(verlauf: Nachricht[], ich: string): Promise<Runde> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(`${this.url.replace(/\/$/, '')}/frage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ich, verlauf }),
      });
    } catch {
      throw new Error('Frag den Hub ist gerade nicht erreichbar. Bitte Internetverbindung prüfen.');
    }
    const body = (await antwort.json().catch(() => null)) as (Runde & { fehler?: string }) | null;
    if (antwort.status === 401 && /abgelaufen|nicht angemeldet/i.test(body?.fehler ?? '')) throw new AuthExpiredError();
    if (!antwort.ok || !body?.content) throw new Error(body?.fehler ?? `Frag den Hub hat mit Fehler ${antwort.status} geantwortet.`);
    return { content: body.content, stop_reason: body.stop_reason };
  }
}

/** Demo mode: no call to Claude; picks the matching tool by keywords and writes the answer from its result. */
export class DemoFrage implements FrageApi {
  async runde(verlauf: Nachricht[]): Promise<Runde> {
    await new Promise((r) => setTimeout(r, 500));
    const frage = String(verlauf[0].content).toLowerCase();
    const letzte = verlauf.at(-1)!;
    if (verlauf.length === 1) {
      const werkzeug = /todo|karte|aufgabe/.test(frage) ? 'todos' : /zahl|umsatz|wert|pipeline wert|wie viel/.test(frage) ? 'kennzahlen' : /ruh|liegen|vergessen/.test(frage) ? 'pipeline' : 'faellig';
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'demo-1', name: werkzeug, input: {} }] };
    }
    const ergebnis = Array.isArray(letzte.content) ? String((letzte.content[0] as Block).content ?? '') : '';
    const daten = JSON.parse(ergebnis || '{}') as Record<string, unknown> | unknown[];
    let text: string;
    if (Array.isArray(daten)) {
      const ruhend = (daten as { firma?: string; tage_ohne_aktivitaet?: number; titel?: string }[]).filter((d) => (d.tage_ohne_aktivitaet ?? 0) >= 7);
      text = /ruh|liegen|vergessen/.test(frage)
        ? ruhend.length ? `Seit über einer Woche ohne Aktivität: ${ruhend.map((d) => `${d.firma} (${d.tage_ohne_aktivitaet} Tage)`).join(', ')}.` : 'Kein offener Deal ruht länger als eine Woche.'
        : `Offen sind ${daten.length} Karten, zum Beispiel: ${(daten as { titel: string }[]).slice(0, 3).map((d) => d.titel).join(', ')}.`;
    } else if ('pipeline_wert' in daten) {
      text = `In der Pipeline stehen ${daten.offene_deals} offene Deals über ${daten.pipeline_wert}, gewichtet ${daten.gewichtet}. Diesen Monat gewonnen: ${daten.gewonnen_diesen_monat}.`;
    } else {
      const d = daten as { ueberfaellig: { titel: string; firma?: string }[]; heute_faellig: { titel: string; firma?: string }[] };
      const alle = [...d.ueberfaellig, ...d.heute_faellig];
      text = alle.length
        ? `${alle.length} Dinge sind heute dran, davon ${d.ueberfaellig.length} überfällig. Am dringendsten: ${d.ueberfaellig.slice(0, 2).map((a) => `${a.firma ?? ''} (${a.titel})`).join(' und ') || alle[0].titel}.`
        : 'Heute ist nichts fällig.';
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: `${text} (Demo-Antwort)` }] };
  }
}
