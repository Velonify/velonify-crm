import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawFrameLikeElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toasts';
import { frameReihenfolge } from '../data/whiteboard';
import type { Whiteboard, WhiteboardKommentar } from '../data/types';
import { useIch } from '../lib/useIch';
import { useTheme } from '../lib/useTheme';
import { inhaltApi, LIVE_URL } from './inhalt';
import { KommentarEbene, KommentarListe, zeigePin, type NeuerKommentar } from './Kommentare';
import type { LivePerson, LiveStatus } from './live';
import { BoardSync } from './sync';
import { STICKY_FARBEN, sticky, VORLAGEN, verschiebe } from './vorlagen';

// Fonts come from the hub itself (copied by scripts/excalidraw-schriften.mjs), not from a CDN.
(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`;

type Speichern = 'ungespeichert' | 'speichert' | 'gespeichert' | { fehler: string };

interface Props {
  board: Whiteboard;
  kommentare: readonly WhiteboardKommentar[];
  team: readonly string[];
  /** Comment to open on arrival (from a mention link). */
  startKommentar: string | null;
  onKommentieren(kommentar: NeuerKommentar): Promise<void>;
  onErledigt(kommentar: WhiteboardKommentar, erledigt: boolean): Promise<void>;
  /** The others changed comments: reload them. */
  onKommentareGeaendert(): void;
}

/** Middle of the visible area in scene coordinates. */
function sichtMitte(api: ExcalidrawImperativeAPI) {
  const s = api.getAppState();
  return { x: s.width / 2 / s.zoom.value - s.scrollX, y: s.height / 2 / s.zoom.value - s.scrollY };
}

export function Leinwand({ board, kommentare, team, startKommentar, onKommentieren, onErledigt, onKommentareGeaendert }: Props) {
  const { getToken, userEmail } = useAuth();
  const [ich] = useIch(team);
  const [theme] = useTheme();
  const toast = useToast();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const sync = useRef<BoardSync | null>(null);
  const [personen, setPersonen] = useState<LivePerson[]>([]);
  const [live, setLive] = useState<{ status: LiveStatus; meldung?: string }>({ status: 'aus' });
  const [speichern, setSpeichern] = useState<Speichern>('gespeichert');
  const [menue, setMenue] = useState<'vorlagen' | 'sticky' | null>(null);
  const [kommentarSetzen, setKommentarSetzen] = useState(false);
  const [listeOffen, setListeOffen] = useState(false);
  const [offenerKommentar, setOffenerKommentar] = useState<string | null>(null);
  const [praesentation, setPraesentation] = useState<{ frames: ExcalidrawFrameLikeElement[]; nr: number } | null>(null);
  const rueckmeldung = useRef({ onKommentareGeaendert, toast });
  rueckmeldung.current = { onKommentareGeaendert, toast };

  const email = userEmail();
  const name = ich ?? email.split('@')[0];

  useEffect(() => {
    if (!api) return;
    // For checks in the browser console of the dev server only.
    if (import.meta.env.DEV) (window as { wbApi?: ExcalidrawImperativeAPI }).wbApi = api;
    const s = new BoardSync(api, board.id, inhaltApi(getToken), {
      personen: setPersonen,
      live: (status, meldung) => setLive({ status, meldung }),
      speichern: setSpeichern,
      kommentareGeaendert: () => rueckmeldung.current.onKommentareGeaendert(),
      fehler: (meldung) => rueckmeldung.current.toast.show(meldung, 'error'),
    });
    sync.current = s;
    s.start(LIVE_URL ? { url: LIVE_URL, name, email, token: getToken } : null).catch((err: unknown) => {
      rueckmeldung.current.toast.show(err instanceof Error ? err.message : 'Das Whiteboard konnte nicht geladen werden.', 'error');
    });
    const weg = () => void s.beende(true);
    window.addEventListener('pagehide', weg);
    return () => {
      window.removeEventListener('pagehide', weg);
      void s.beende();
      sync.current = null;
    };
    // Name and token getter only matter when joining; a new board means a new sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, board.id]);

  // A mention link opens its thread once the scene is there.
  const gezeigt = useRef(false);
  useEffect(() => {
    if (!api || !startKommentar || gezeigt.current) return;
    const k = kommentare.find((x) => x.id === startKommentar);
    if (!k) return;
    const pin = k.antwort_auf ? kommentare.find((x) => x.id === k.antwort_auf) ?? k : k;
    gezeigt.current = true;
    window.setTimeout(() => {
      zeigePin(api, pin);
      setOffenerKommentar(pin.id);
    }, 400);
  }, [api, startKommentar, kommentare]);

  const fuegeEin = useCallback(
    (skelette: Parameters<typeof convertToExcalidrawElements>[0], auswaehlen = false) => {
      if (!api || !skelette) return;
      const mitte = sichtMitte(api);
      const neu = convertToExcalidrawElements(verschiebe(skelette, mitte.x, mitte.y), { regenerateIds: true });
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...neu],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        ...(auswaehlen ? { appState: { selectedElementIds: { [neu[0].id]: true } } } : {}),
      });
      if (!auswaehlen) api.scrollToContent(neu, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
      setMenue(null);
    },
    [api],
  );

  const neuerSticky = (farbe: string) => {
    // A little offset, so several new stickies do not lie exactly on top of each other.
    const versatz = () => Math.round((Math.random() - 0.5) * 80);
    fuegeEin([sticky(versatz(), versatz(), farbe)], true);
    api?.setActiveTool({ type: 'selection' });
  };

  const praesentiere = () => {
    if (!api) return;
    const frames = frameReihenfolge(api.getSceneElements()) as ExcalidrawFrameLikeElement[];
    if (frames.length === 0) {
      toast.show('Zum Präsentieren braucht das Board Frames: Werkzeug „Frame“ (Taste F) oder eine Vorlage.');
      return;
    }
    setKommentarSetzen(false);
    setOffenerKommentar(null);
    setPraesentation({ frames, nr: 0 });
  };

  useEffect(() => {
    if (!api || !praesentation) return;
    api.scrollToContent(praesentation.frames[praesentation.nr], { fitToViewport: true, viewportZoomFactor: 0.92, animate: true, duration: 450 });
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPraesentation(null);
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        setPraesentation((p) => (p ? { ...p, nr: Math.min(p.frames.length - 1, p.nr + 1) } : p));
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setPraesentation((p) => (p ? { ...p, nr: Math.max(0, p.nr - 1) } : p));
      }
    };
    document.addEventListener('keydown', taste, true);
    return () => document.removeEventListener('keydown', taste, true);
  }, [api, praesentation]);

  const kommentieren = useCallback(
    async (k: NeuerKommentar) => {
      await onKommentieren(k);
      sync.current?.hinweis('kommentare');
    },
    [onKommentieren],
  );
  const erledigt = useCallback(
    async (k: WhiteboardKommentar, wert: boolean) => {
      await onErledigt(k, wert);
      if (wert) setOffenerKommentar(null);
      sync.current?.hinweis('kommentare');
    },
    [onErledigt],
  );

  const offeneKommentare = kommentare.filter((k) => !k.antwort_auf && !k.erledigt).length;
  const speicherText = typeof speichern === 'object' ? 'Nicht gespeichert' : { ungespeichert: 'Ungespeichert', speichert: 'Speichert …', gespeichert: 'Gespeichert' }[speichern];
  const liveText = useMemo(() => {
    if (!LIVE_URL) return 'Nur hier';
    return { aus: live.meldung ?? 'Pausiert', verbinde: 'Verbindet …', live: 'Live', getrennt: live.meldung ?? 'Getrennt, verbindet neu …' }[live.status];
  }, [live]);

  return (
    <div className={`wb${praesentation ? ' wb-praesentiert' : ''}`}>
      {!praesentation && (
        <div className="wb-werkzeuge" role="toolbar" aria-label="Whiteboard">
          <div className="wb-gruppe">
            <div className="wb-menue">
              <button type="button" className="button small" aria-expanded={menue === 'sticky'} onClick={() => setMenue(menue === 'sticky' ? null : 'sticky')}>
                Sticky
              </button>
              {menue === 'sticky' && (
                <div className="wb-aufklapp wb-farben" role="menu">
                  {STICKY_FARBEN.map((f) => (
                    <button key={f.wert} type="button" role="menuitem" title={`${f.name} (danach Enter zum Schreiben)`} style={{ background: f.wert }} onClick={() => neuerSticky(f.wert)}>
                      <span className="wb-unsichtbar">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="wb-menue">
              <button type="button" className="button small" aria-expanded={menue === 'vorlagen'} onClick={() => setMenue(menue === 'vorlagen' ? null : 'vorlagen')}>
                Vorlage
              </button>
              {menue === 'vorlagen' && (
                <div className="wb-aufklapp" role="menu">
                  {VORLAGEN.map((v) => (
                    <button key={v.id} type="button" role="menuitem" onClick={() => fuegeEin(v.elemente())}>
                      <strong>{v.name}</strong>
                      <span>{v.beschreibung}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className={`button small${kommentarSetzen ? ' primary' : ''}`} aria-pressed={kommentarSetzen} onClick={() => setKommentarSetzen(!kommentarSetzen)}>
              Kommentieren
            </button>
            <button type="button" className={`button small${listeOffen ? ' primary' : ''}`} aria-pressed={listeOffen} onClick={() => setListeOffen(!listeOffen)}>
              Kommentare{offeneKommentare > 0 ? ` (${offeneKommentare})` : ''}
            </button>
            <button type="button" className="button small" onClick={praesentiere}>
              Präsentieren
            </button>
          </div>
          <div className="wb-gruppe wb-status">
            <span className={`wb-live is-${LIVE_URL ? live.status : 'aus'}`} title={live.meldung}>
              <i aria-hidden="true" />
              {liveText}
            </span>
            {personen.length > 0 && (
              <span className="wb-personen" aria-label={`Auch im Board: ${personen.map((p) => p.name).join(', ')}`}>
                {personen.slice(0, 5).map((p) => (
                  <span key={p.id} style={{ background: p.farbe }} title={p.name}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
                {personen.length > 5 && <span className="wb-mehr">+{personen.length - 5}</span>}
              </span>
            )}
            <span className={`wb-speichern${typeof speichern === 'object' ? ' is-fehler' : ''}`} title={typeof speichern === 'object' ? speichern.fehler : undefined}>
              {speicherText}
            </span>
          </div>
        </div>
      )}
      <div className="wb-flaeche">
        <div className="wb-excalidraw" onPointerDown={() => menue && setMenue(null)}>
          <Excalidraw
            excalidrawAPI={setApi}
            langCode="de-DE"
            theme={theme}
            name={board.titel}
            isCollaborating={Boolean(LIVE_URL) && live.status === 'live'}
            viewModeEnabled={Boolean(praesentation)}
            zenModeEnabled={Boolean(praesentation)}
            onChange={(elemente, appState, files) => sync.current?.beiAenderung(elemente, appState, files)}
            onPointerUpdate={(p) => sync.current?.beiZeiger(p)}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
          {api && !praesentation && (
            <KommentarEbene
              api={api}
              kommentare={kommentare}
              team={team}
              setzen={kommentarSetzen}
              onSetzenEnde={() => setKommentarSetzen(false)}
              offen={offenerKommentar}
              onOeffne={setOffenerKommentar}
              onSpeichere={kommentieren}
              onErledigt={erledigt}
            />
          )}
        </div>
        {listeOffen && api && !praesentation && (
          <KommentarListe
            kommentare={kommentare}
            team={team}
            onSchliessen={() => setListeOffen(false)}
            onWaehle={(k) => {
              zeigePin(api, k);
              setOffenerKommentar(k.id);
            }}
          />
        )}
      </div>
      {praesentation && (
        <div className="wb-praesentation" role="toolbar" aria-label="Präsentation">
          <button type="button" className="button small" disabled={praesentation.nr === 0} onClick={() => setPraesentation({ ...praesentation, nr: praesentation.nr - 1 })} aria-label="Vorheriger Frame">
            ‹
          </button>
          <span>
            {praesentation.frames[praesentation.nr].name || `Frame ${praesentation.nr + 1}`} · {praesentation.nr + 1}/{praesentation.frames.length}
          </span>
          <button type="button" className="button small" disabled={praesentation.nr === praesentation.frames.length - 1} onClick={() => setPraesentation({ ...praesentation, nr: praesentation.nr + 1 })} aria-label="Nächster Frame">
            ›
          </button>
          <button type="button" className="button small primary" onClick={() => setPraesentation(null)}>
            Beenden
          </button>
        </div>
      )}
    </div>
  );
}
