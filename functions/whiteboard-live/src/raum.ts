/**
 * Rooms of the relay, one per board, without sockets so they can be tested: who is in, who gets which message. The relay
 * keeps nothing of the drawings; whoever joins gets the current state from the person who has been in the room longest
 * (like excalidraw.com), and from crm-api when the room is empty.
 */

export interface Person {
  /** One per connection (a person with two tabs is in the room twice). */
  id: string;
  email: string;
  name: string;
  farbe: string;
  seit: number;
}

export interface Teilnehmer extends Person {
  sende(nachricht: unknown): void;
}

/** What a client may send after logging in. Everything else is dropped. */
export type ClientNachricht =
  | { t: 'szene'; elemente: unknown[] }
  | { t: 'zeiger'; x: number; y: number; knopf?: string; auswahl?: string[]; werkzeug?: string }
  | { t: 'stand'; fuer: string; elemente: unknown[] }
  | { t: 'hinweis'; art: 'kommentare' | 'datei' | 'gespeichert'; wert?: string };

/** Colours of the cursors, readable on the white board and in dark mode. */
const FARBEN = ['#e8590c', '#1971c2', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#f08c00', '#5f3dc4'];
export const MAX_IM_RAUM = 25;

export function pruefeNachricht(roh: unknown): ClientNachricht | null {
  if (typeof roh !== 'object' || roh === null) return null;
  const n = roh as Record<string, unknown>;
  switch (n.t) {
    case 'szene':
      return Array.isArray(n.elemente) ? { t: 'szene', elemente: n.elemente } : null;
    case 'zeiger':
      if (typeof n.x !== 'number' || typeof n.y !== 'number' || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
      return {
        t: 'zeiger',
        x: n.x,
        y: n.y,
        knopf: n.knopf === 'down' ? 'down' : 'up',
        auswahl: Array.isArray(n.auswahl) ? n.auswahl.filter((a): a is string => typeof a === 'string').slice(0, 500) : undefined,
        werkzeug: typeof n.werkzeug === 'string' ? n.werkzeug.slice(0, 20) : undefined,
      };
    case 'stand':
      return typeof n.fuer === 'string' && Array.isArray(n.elemente) ? { t: 'stand', fuer: n.fuer, elemente: n.elemente } : null;
    case 'hinweis':
      return n.art === 'kommentare' || n.art === 'datei' || n.art === 'gespeichert'
        ? { t: 'hinweis', art: n.art, wert: typeof n.wert === 'string' ? n.wert.slice(0, 200) : undefined }
        : null;
    default:
      return null;
  }
}

const oeffentlich = ({ id, email, name, farbe }: Person) => ({ id, email, name, farbe });

export class Raum {
  private readonly teilnehmer = new Map<string, Teilnehmer>();

  get anzahl(): number {
    return this.teilnehmer.size;
  }

  /** A free colour for the next person, so two people rarely look alike. */
  naechsteFarbe(): string {
    const belegt = new Set([...this.teilnehmer.values()].map((t) => t.farbe));
    return FARBEN.find((f) => !belegt.has(f)) ?? FARBEN[this.teilnehmer.size % FARBEN.length];
  }

  /** Lets someone in: they get everyone present, the others hear about them, the longest present sends the state. */
  betrete(neu: Teilnehmer): boolean {
    if (this.teilnehmer.size >= MAX_IM_RAUM) return false;
    const andere = [...this.teilnehmer.values()].sort((a, b) => a.seit - b.seit);
    this.teilnehmer.set(neu.id, neu);
    neu.sende({ t: 'willkommen', ich: oeffentlich(neu), andere: andere.map(oeffentlich), standKommt: andere.length > 0 });
    for (const t of andere) t.sende({ t: 'betreten', person: oeffentlich(neu) });
    andere[0]?.sende({ t: 'stand-anfrage', fuer: neu.id });
    return true;
  }

  verlasse(id: string): void {
    if (!this.teilnehmer.delete(id)) return;
    for (const t of this.teilnehmer.values()) t.sende({ t: 'verlassen', id });
  }

  /** Passes a message on: the state only to whom asked for it, everything else to everyone but the sender. */
  leite(vonId: string, nachricht: ClientNachricht): void {
    const von = this.teilnehmer.get(vonId);
    if (!von) return;
    if (nachricht.t === 'stand') {
      this.teilnehmer.get(nachricht.fuer)?.sende({ t: 'stand', elemente: nachricht.elemente });
      return;
    }
    const raus = { ...nachricht, von: von.id };
    for (const t of this.teilnehmer.values()) if (t.id !== vonId) t.sende(raus);
  }
}

/** All rooms of the instance; empty rooms are removed right away. */
export class Raeume {
  private readonly raeume = new Map<string, Raum>();

  raum(board: string): Raum {
    let raum = this.raeume.get(board);
    if (!raum) this.raeume.set(board, (raum = new Raum()));
    return raum;
  }

  verlasse(board: string, id: string): void {
    const raum = this.raeume.get(board);
    if (!raum) return;
    raum.verlasse(id);
    if (raum.anzahl === 0) this.raeume.delete(board);
  }

  get anzahl(): number {
    return this.raeume.size;
  }

  get personen(): number {
    return [...this.raeume.values()].reduce((summe, r) => summe + r.anzahl, 0);
  }
}
