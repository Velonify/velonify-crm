/**
 * The connection to whiteboard-live: logs in with the first message, reconnects with growing pauses, and hangs up while
 * the tab has been hidden for a while (a forgotten tab must not keep the Cloud Run instance busy all night).
 */

export interface LivePerson {
  id: string;
  email: string;
  name: string;
  farbe: string;
}

export type ServerNachricht =
  | { t: 'willkommen'; ich: LivePerson; andere: LivePerson[]; standKommt: boolean }
  | { t: 'betreten'; person: LivePerson }
  | { t: 'verlassen'; id: string }
  | { t: 'szene'; von: string; elemente: unknown[] }
  | { t: 'zeiger'; von: string; x: number; y: number; knopf?: 'up' | 'down'; auswahl?: string[]; werkzeug?: string }
  | { t: 'stand-anfrage'; fuer: string }
  | { t: 'stand'; elemente: unknown[] }
  | { t: 'hinweis'; von: string; art: 'kommentare' | 'datei' | 'gespeichert'; wert?: string }
  | { t: 'fehler'; meldung: string };

export type LiveStatus = 'aus' | 'verbinde' | 'live' | 'getrennt';

export interface LiveOptionen {
  url: string;
  board: string;
  name: string;
  email: string;
  /** Google token; empty in the demo, where the local relay runs without login. */
  token: () => Promise<string>;
  empfange(nachricht: ServerNachricht): void;
  status(status: LiveStatus, meldung?: string): void;
}

const VERSTECKT_TRENNEN_MS = 5 * 60_000;

export class LiveVerbindung {
  private ws: WebSocket | null = null;
  private versuche = 0;
  private wiederTimer: number | undefined;
  private verstecktTimer: number | undefined;
  private beendet = false;
  private pausiert = false;
  private readonly o: LiveOptionen;

  constructor(optionen: LiveOptionen) {
    this.o = optionen;
    document.addEventListener('visibilitychange', this.sichtbarkeit);
    void this.verbinde();
  }

  get offen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sende(nachricht: object): void {
    if (this.offen) this.ws!.send(JSON.stringify(nachricht));
  }

  beende(): void {
    this.beendet = true;
    document.removeEventListener('visibilitychange', this.sichtbarkeit);
    window.clearTimeout(this.wiederTimer);
    window.clearTimeout(this.verstecktTimer);
    this.ws?.close(1000);
    this.ws = null;
  }

  private readonly sichtbarkeit = () => {
    window.clearTimeout(this.verstecktTimer);
    if (document.visibilityState === 'hidden') {
      this.verstecktTimer = window.setTimeout(() => {
        this.pausiert = true;
        this.ws?.close(1000);
        this.o.status('aus', 'Pausiert, solange der Tab im Hintergrund ist.');
      }, VERSTECKT_TRENNEN_MS);
    } else if (this.pausiert) {
      this.pausiert = false;
      this.versuche = 0;
      void this.verbinde();
    }
  };

  private async verbinde(): Promise<void> {
    if (this.beendet || this.pausiert) return;
    this.o.status('verbinde');
    let token = '';
    try {
      token = await this.o.token();
    } catch {
      // Without a token the relay refuses; the board still works alone and the next attempt tries again.
    }
    if (this.beendet) return;
    const ws = new WebSocket(`${this.o.url}/live`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hallo', board: this.o.board, name: this.o.name, email: this.o.email, token }));
    ws.onmessage = (e) => {
      let nachricht: ServerNachricht;
      try {
        nachricht = JSON.parse(String(e.data)) as ServerNachricht;
      } catch {
        return;
      }
      if (nachricht.t === 'willkommen') {
        this.versuche = 0;
        this.o.status('live');
      }
      if (nachricht.t === 'fehler') this.o.status('getrennt', nachricht.meldung);
      this.o.empfange(nachricht);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.beendet || this.pausiert) return;
      // 4001/4003: login refused – retrying with the same token only fails again, so wait longer.
      const abgelehnt = e.code === 4001 || e.code === 4003 || e.code === 4029;
      this.versuche += 1;
      const pause = Math.min(30_000, (abgelehnt ? 10_000 : 1000) * 2 ** Math.min(this.versuche - 1, 4));
      this.o.status('getrennt', abgelehnt ? e.reason || 'Live-Verbindung abgelehnt.' : undefined);
      this.wiederTimer = window.setTimeout(() => void this.verbinde(), pause);
    };
  }
}
