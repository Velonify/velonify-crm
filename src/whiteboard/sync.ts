import { CaptureUpdateAction, exportToBlob, reconcileElements, restoreElements } from '@excalidraw/excalidraw';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import { MAX_VORSCHAU_ZEICHEN, type WbElement } from '../data/whiteboard';
import type { InhaltApi } from './inhalt';
import { LiveVerbindung, type LiveOptionen, type LivePerson, type LiveStatus, type ServerNachricht } from './live';

/**
 * Keeps one board in step: loads it from crm-api, sends own changes to the others (live, within ~50 ms) and saves them
 * (a few seconds after the last change), mixes in the changes of the others, uploads and loads images, and draws the
 * cursors of the others. Excalidraw's element versions decide everything: an element counts as changed here when its
 * version is higher than the last one seen, whoever made it.
 */

export interface SyncRueckmeldung {
  personen(personen: LivePerson[]): void;
  live(status: LiveStatus, meldung?: string): void;
  /** Saving: 'speichert', 'gespeichert' or an error message. */
  speichern(zustand: 'ungespeichert' | 'speichert' | 'gespeichert' | { fehler: string }): void;
  kommentareGeaendert(): void;
  fehler(meldung: string): void;
}

const LIVE_TAKT_MS = 50;
const ZEIGER_TAKT_MS = 40;
const SPEICHERN_NACH_MS = 3000;
const SPEICHERN_SPAETESTENS_MS = 15_000;
const VORSCHAU_ALLE_MS = 60_000;
/** Above this a save on leaving the page cannot use keepalive (the browser limit is 64 KB). */
const KEEPALIVE_MAX = 60_000;

type Elemente = readonly OrderedExcalidrawElement[];

const alsDataUrl = (blob: Blob) =>
  new Promise<string>((ok, fehler) => {
    const leser = new FileReader();
    leser.onload = () => ok(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(blob);
  });

export class BoardSync {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly boardId: string;
  private readonly inhalt: InhaltApi;
  private readonly melde: SyncRueckmeldung;
  private live: LiveVerbindung | null = null;
  private bereit = false;
  private beendet = false;

  /** Highest version seen of every element (own and others'). */
  private readonly bekannt = new Map<string, number>();
  /** Own changes not yet sent live / not yet saved. */
  private readonly fuerLive = new Map<string, OrderedExcalidrawElement>();
  private readonly ungespeichert = new Map<string, OrderedExcalidrawElement>();
  private liveTimer: number | undefined;
  private speicherTimer: number | undefined;
  private ersteAenderung = 0;
  private speichertGerade: Promise<void> | null = null;
  private letzteVorschau = 0;
  private vorschauFaellig = false;

  /** Images present here (loaded or uploaded) and those on their way. */
  private readonly dateien = new Set<string>();
  private readonly dateienUnterwegs = new Set<string>();

  private readonly personen = new Map<string, LivePerson>();
  private readonly zeiger = new Map<string, Collaborator>();
  private zeigerTimer: number | undefined;
  private letzterZeiger: { x: number; y: number; knopf: 'up' | 'down'; werkzeug: string } | null = null;

  constructor(api: ExcalidrawImperativeAPI, boardId: string, inhalt: InhaltApi, melde: SyncRueckmeldung) {
    this.api = api;
    this.boardId = boardId;
    this.inhalt = inhalt;
    this.melde = melde;
  }

  /** Loads the board, then joins the live room. Template elements are added once on a board that is still empty. */
  async start(live: Omit<LiveOptionen, 'board' | 'empfange' | 'status'> | null, ersteElemente?: () => readonly OrderedExcalidrawElement[]): Promise<void> {
    const gespeichert = await this.inhalt.lade(this.boardId);
    if (this.beendet) return;
    let elemente = restoreElements(gespeichert.elemente as never, null);
    for (const e of elemente) this.bekannt.set(e.id, e.version);
    if (elemente.length === 0 && ersteElemente) {
      // Seen as own changes, so they are saved like a drawing.
      elemente = [...ersteElemente()] as typeof elemente;
    }
    this.api.updateScene({ elements: elemente, captureUpdate: CaptureUpdateAction.NEVER });
    this.api.history.clear();
    this.bereit = true;
    if (elemente.some((e) => !this.bekannt.has(e.id))) {
      this.beiAenderung(this.api.getSceneElementsIncludingDeleted(), this.api.getAppState(), this.api.getFiles());
    }
    if (elemente.some((e) => !e.isDeleted)) this.api.scrollToContent(undefined, { fitToContent: true, animate: false });
    void this.ladeFehlendeDateien();
    if (live) {
      this.live = new LiveVerbindung({ ...live, board: this.boardId, empfange: (n) => this.empfange(n), status: (s, m) => this.melde.live(s, m) });
    } else {
      this.melde.live('aus');
    }
  }

  /** Excalidraw's onChange: finds own changes (higher version than seen) and new images. */
  beiAenderung(elemente: Elemente, _appState: AppState, files: BinaryFiles): void {
    if (!this.bereit || this.beendet) return;
    let geaendert = false;
    for (const e of elemente) {
      if ((this.bekannt.get(e.id) ?? -1) >= e.version) continue;
      this.bekannt.set(e.id, e.version);
      this.fuerLive.set(e.id, e);
      this.ungespeichert.set(e.id, e);
      geaendert = true;
    }
    for (const id of Object.keys(files)) {
      if (!this.dateien.has(id) && !this.dateienUnterwegs.has(id)) void this.ladeHoch(files[id]);
    }
    if (!geaendert) return;
    this.vorschauFaellig = true;
    if (this.liveTimer === undefined) this.liveTimer = window.setTimeout(() => this.sendeLive(), LIVE_TAKT_MS);
    this.planeSpeichern();
  }

  /** Excalidraw's onPointerUpdate: the own cursor for the others, at most every 40 ms. */
  beiZeiger(payload: { pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'down' | 'up' }): void {
    if (!this.live?.offen) return;
    this.letzterZeiger = { x: payload.pointer.x, y: payload.pointer.y, knopf: payload.button, werkzeug: payload.pointer.tool };
    if (this.zeigerTimer !== undefined) return;
    this.zeigerTimer = window.setTimeout(() => {
      this.zeigerTimer = undefined;
      const z = this.letzterZeiger;
      if (!z) return;
      const auswahl = Object.keys(this.api.getAppState().selectedElementIds ?? {});
      this.live?.sende({ t: 'zeiger', x: z.x, y: z.y, knopf: z.knopf, werkzeug: z.werkzeug, auswahl });
    }, ZEIGER_TAKT_MS);
  }

  /** Tells the others that something outside the drawing changed (comments). */
  hinweis(art: 'kommentare'): void {
    this.live?.sende({ t: 'hinweis', art });
  }

  /** Saves what is left and leaves the room. With `seiteGeht` the save uses keepalive, so it survives the page closing. */
  async beende(seiteGeht = false): Promise<void> {
    if (this.beendet) return;
    if (!seiteGeht) {
      this.beendet = true;
      this.live?.beende();
    }
    window.clearTimeout(this.liveTimer);
    if (this.fuerLive.size) this.sendeLive();
    await this.speichere(seiteGeht);
    if (seiteGeht) return;
    window.clearTimeout(this.speicherTimer);
    window.clearTimeout(this.zeigerTimer);
  }

  private sendeLive(): void {
    this.liveTimer = undefined;
    if (this.fuerLive.size === 0) return;
    const elemente = [...this.fuerLive.values()];
    this.fuerLive.clear();
    this.live?.sende({ t: 'szene', elemente });
  }

  private planeSpeichern(): void {
    this.melde.speichern('ungespeichert');
    const jetzt = Date.now();
    if (!this.ersteAenderung) this.ersteAenderung = jetzt;
    window.clearTimeout(this.speicherTimer);
    const warten = Math.max(0, Math.min(SPEICHERN_NACH_MS, this.ersteAenderung + SPEICHERN_SPAETESTENS_MS - jetzt));
    this.speicherTimer = window.setTimeout(() => void this.speichere(), warten);
  }

  private async speichere(seiteGeht = false): Promise<void> {
    if (this.speichertGerade) await this.speichertGerade;
    if (this.ungespeichert.size === 0) return;
    const elemente = [...this.ungespeichert.values()];
    this.ungespeichert.clear();
    this.ersteAenderung = 0;
    const arbeit = (async () => {
      this.melde.speichern('speichert');
      try {
        const vorschau = seiteGeht ? undefined : await this.vorschau();
        if (seiteGeht && JSON.stringify(elemente).length < KEEPALIVE_MAX) {
          // Fire and forget: the page is going away, there is nobody left to tell.
          void this.inhalt.speichere(this.boardId, elemente as unknown as WbElement[]).catch(() => undefined);
          return;
        }
        await this.inhalt.speichere(this.boardId, elemente as unknown as WbElement[], vorschau);
        if (!this.beendet) this.melde.speichern(this.ungespeichert.size ? 'ungespeichert' : 'gespeichert');
      } catch (err) {
        // Back into the queue (unless something newer of the same element is already waiting), and try again later.
        for (const e of elemente) if (!this.ungespeichert.has(e.id)) this.ungespeichert.set(e.id, e);
        this.melde.speichern({ fehler: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.' });
        if (!this.beendet) this.speicherTimer = window.setTimeout(() => void this.speichere(), 10_000);
      }
    })();
    this.speichertGerade = arbeit.finally(() => (this.speichertGerade = null));
    await this.speichertGerade;
  }

  /** A small picture for the overview, at most once a minute. */
  private async vorschau(): Promise<string | undefined> {
    if (!this.vorschauFaellig || Date.now() - this.letzteVorschau < VORSCHAU_ALLE_MS) return undefined;
    const elemente = this.api.getSceneElements();
    if (elemente.length === 0) return undefined;
    try {
      for (const groesse of [480, 320]) {
        const blob = await exportToBlob({
          elements: elemente,
          files: this.api.getFiles(),
          mimeType: 'image/webp',
          quality: 0.7,
          maxWidthOrHeight: groesse,
          appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
        });
        const url = await alsDataUrl(blob);
        if (url.length <= MAX_VORSCHAU_ZEICHEN) {
          this.letzteVorschau = Date.now();
          this.vorschauFaellig = false;
          return url;
        }
      }
    } catch {
      // No preview this time; the drawing is what matters.
    }
    return undefined;
  }

  private mischeEin(roh: unknown[]): void {
    const fremd = restoreElements(roh as never, null) as unknown as RemoteExcalidrawElement[];
    const zusammen = reconcileElements(this.api.getSceneElementsIncludingDeleted(), fremd, this.api.getAppState());
    for (const e of fremd) if ((this.bekannt.get(e.id) ?? -1) < e.version) this.bekannt.set(e.id, e.version);
    this.api.updateScene({ elements: zusammen, captureUpdate: CaptureUpdateAction.NEVER });
    if (fremd.some((e) => e.type === 'image')) void this.ladeFehlendeDateien();
  }

  private empfange(n: ServerNachricht): void {
    if (this.beendet) return;
    switch (n.t) {
      case 'willkommen':
        this.personen.clear();
        this.zeiger.clear();
        for (const p of n.andere) this.personen.set(p.id, p);
        this.zeigePersonen();
        // Changes made while offline go out now; the others merge them like any change.
        this.sendeAlleEigenen();
        break;
      case 'betreten':
        this.personen.set(n.person.id, n.person);
        this.zeigePersonen();
        break;
      case 'verlassen':
        this.personen.delete(n.id);
        this.zeiger.delete(n.id);
        this.zeigePersonen();
        break;
      case 'szene':
      case 'stand':
        this.mischeEin(n.elemente);
        break;
      case 'stand-anfrage':
        this.live?.sende({ t: 'stand', fuer: n.fuer, elemente: this.api.getSceneElementsIncludingDeleted() });
        break;
      case 'zeiger': {
        const p = this.personen.get(n.von);
        if (!p) return;
        this.zeiger.set(n.von, {
          id: p.id,
          socketId: p.id as SocketId,
          username: p.name,
          color: { background: p.farbe, stroke: p.farbe },
          pointer: { x: n.x, y: n.y, tool: n.werkzeug === 'laser' ? 'laser' : 'pointer' },
          button: n.knopf === 'down' ? 'down' : 'up',
          selectedElementIds: Object.fromEntries((n.auswahl ?? []).map((id) => [id, true])),
        });
        this.api.updateScene({ collaborators: new Map(this.zeiger) as Map<SocketId, Collaborator> });
        break;
      }
      case 'hinweis':
        if (n.art === 'kommentare') this.melde.kommentareGeaendert();
        if (n.art === 'datei') void this.ladeFehlendeDateien();
        break;
      case 'fehler':
        break;
    }
  }

  private sendeAlleEigenen(): void {
    if (this.ungespeichert.size) this.live?.sende({ t: 'szene', elemente: [...this.ungespeichert.values()] });
  }

  private zeigePersonen(): void {
    this.melde.personen([...this.personen.values()]);
    const zeiger = new Map<SocketId, Collaborator>();
    for (const [id, c] of this.zeiger) if (this.personen.has(id)) zeiger.set(id as SocketId, c);
    // People without a cursor yet still show up in Excalidraw's avatar list.
    for (const p of this.personen.values()) {
      if (!zeiger.has(p.id as SocketId)) zeiger.set(p.id as SocketId, { id: p.id, socketId: p.id as SocketId, username: p.name, color: { background: p.farbe, stroke: p.farbe } });
    }
    this.api.updateScene({ collaborators: zeiger });
  }

  private async ladeHoch(datei: BinaryFileData): Promise<void> {
    this.dateienUnterwegs.add(datei.id);
    try {
      const blob = await (await fetch(datei.dataURL)).blob();
      await this.inhalt.dateiHoch(this.boardId, datei.id, blob.type ? blob : new Blob([blob], { type: datei.mimeType }));
      this.dateien.add(datei.id);
      this.live?.sende({ t: 'hinweis', art: 'datei', wert: datei.id });
    } catch (err) {
      this.melde.fehler(`Bild nicht hochgeladen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.dateienUnterwegs.delete(datei.id);
    }
  }

  /** Images used on the board that this tab does not have yet; one that is not uploaded yet comes with the next hint. */
  private async ladeFehlendeDateien(): Promise<void> {
    const vorhanden = this.api.getFiles();
    const fehlen = new Set<string>();
    for (const e of this.api.getSceneElements()) {
      if (e.type === 'image' && e.fileId && !vorhanden[e.fileId] && !this.dateienUnterwegs.has(e.fileId)) fehlen.add(e.fileId);
    }
    const geladen: BinaryFileData[] = [];
    await Promise.all(
      [...fehlen].map(async (id) => {
        this.dateienUnterwegs.add(id);
        try {
          const blob = await this.inhalt.dateiLaden(this.boardId, id);
          geladen.push({ id: id as BinaryFileData['id'], dataURL: (await alsDataUrl(blob)) as BinaryFileData['dataURL'], mimeType: (blob.type || 'image/png') as BinaryFileData['mimeType'], created: Date.now() });
          this.dateien.add(id);
        } catch {
          // Not there (yet): the uploader sends a hint when it is.
        } finally {
          this.dateienUnterwegs.delete(id);
        }
      }),
    );
    if (geladen.length && !this.beendet) this.api.addFiles(geladen);
  }
}
