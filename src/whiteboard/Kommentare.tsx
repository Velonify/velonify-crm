import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ErwaehnungsFeld, MitErwaehnungen } from '../components/Erwaehnungen';
import { findeTeamMitglied } from '../data/selectors';
import type { WhiteboardKommentar } from '../data/types';
import { formatDateTime, shortUser } from '../lib/format';

/**
 * Comment pins over the canvas. A pin sits at the top right corner of its element (and moves with it) or at a free spot;
 * it is redrawn on every scroll, zoom and change of the scene. "Kommentieren" turns the next click on the canvas into a
 * new pin there.
 */

export interface NeuerKommentar {
  text: string;
  antwort_auf?: string;
  element_id?: string;
  x?: number | null;
  y?: number | null;
}

interface Props {
  api: ExcalidrawImperativeAPI;
  kommentare: readonly WhiteboardKommentar[];
  team: readonly string[];
  setzen: boolean;
  onSetzenEnde(): void;
  offen: string | null;
  onOeffne(id: string | null): void;
  onSpeichere(kommentar: NeuerKommentar): Promise<void>;
  onErledigt(kommentar: WhiteboardKommentar, erledigt: boolean): Promise<void>;
}

/** Name of a writer: the team name when the address belongs to one, otherwise the start of the address. */
export const autorName = (email: string, team: readonly string[]) => findeTeamMitglied(team, '', email) ?? shortUser(email);

/** Where a pin is in scene coordinates: at its element if it still exists, else where it was set. */
function pinOrt(api: ExcalidrawImperativeAPI, k: WhiteboardKommentar): { x: number; y: number } | null {
  if (k.element_id) {
    const e = api.getSceneElements().find((el) => el.id === k.element_id);
    if (e) return { x: e.x + e.width, y: e.y };
  }
  return k.x === null || k.y === null ? null : { x: k.x, y: k.y };
}

/** Moves the view so a pin is in the middle. */
export function zeigePin(api: ExcalidrawImperativeAPI, k: WhiteboardKommentar): void {
  const e = k.element_id ? api.getSceneElements().find((el) => el.id === k.element_id) : undefined;
  if (e) return api.scrollToContent(e, { fitToViewport: false, animate: true });
  if (k.x === null || k.y === null) return;
  const s = api.getAppState();
  api.updateScene({ appState: { scrollX: s.width / 2 / s.zoom.value - k.x, scrollY: s.height / 2 / s.zoom.value - k.y } });
}

/** Re-renders on every scroll, zoom and scene change, at most once per frame. */
function useNeuZeichnen(api: ExcalidrawImperativeAPI): number {
  const [takt, setTakt] = useState(0);
  useEffect(() => {
    let frame = 0;
    const neu = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTakt((t) => t + 1);
      });
    };
    const ab = [api.onScrollChange(neu), api.onChange(neu)];
    window.addEventListener('resize', neu);
    return () => {
      ab.forEach((f) => f());
      window.removeEventListener('resize', neu);
      cancelAnimationFrame(frame);
    };
  }, [api]);
  return takt;
}

export function KommentarEbene({ api, kommentare, team, setzen, onSetzenEnde, offen, onOeffne, onSpeichere, onErledigt }: Props) {
  useNeuZeichnen(api);
  const [entwurf, setEntwurf] = useState<{ x: number; y: number; element_id: string } | null>(null);
  const pins = useMemo(() => kommentare.filter((k) => !k.antwort_auf && !k.erledigt), [kommentare]);
  const appState = api.getAppState();
  const aufBildschirm = (ort: { x: number; y: number }) => {
    const p = sceneCoordsToViewportCoords({ sceneX: ort.x, sceneY: ort.y }, appState);
    return { left: p.x - appState.offsetLeft, top: p.y - appState.offsetTop };
  };

  const setze = (event: ReactMouseEvent<HTMLDivElement>) => {
    const { x, y } = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, appState);
    // The topmost element under the click, frames only when nothing else is there.
    const treffer = [...api.getSceneElements()]
      .reverse()
      .filter((e) => x >= e.x && x <= e.x + e.width && y >= e.y && y <= e.y + e.height)
      .sort((a, b) => Number(a.type === 'frame') - Number(b.type === 'frame'))[0];
    setEntwurf({ x, y, element_id: treffer?.id ?? '' });
    onOeffne(null);
    onSetzenEnde();
  };

  const offenerPin = offen ? pins.find((p) => p.id === offen) ?? kommentare.find((k) => k.id === offen && !k.antwort_auf) : undefined;
  const offenerOrt = offenerPin ? pinOrt(api, offenerPin) : null;

  return (
    <div className="wb-kommentare">
      {setzen && <div className="wb-setzen" onClick={setze} title="Klicke an die Stelle, die du kommentieren willst" />}
      {pins.map((k, i) => {
        const ort = pinOrt(api, k);
        if (!ort) return null;
        return (
          <button
            key={k.id}
            type="button"
            className={`wb-pin${offen === k.id ? ' is-offen' : ''}`}
            style={aufBildschirm(ort)}
            onClick={() => onOeffne(offen === k.id ? null : k.id)}
            aria-label={`Kommentar ${i + 1} von ${autorName(k.von, team)}`}
          >
            {i + 1}
          </button>
        );
      })}
      {entwurf && (
        <Blase lage={aufBildschirm(entwurf)} onSchliessen={() => setEntwurf(null)}>
          <Eingabe
            team={team}
            platzhalter="Kommentar, @Name markiert jemanden"
            knopf="Kommentieren"
            onAbbrechen={() => setEntwurf(null)}
            onSenden={async (text) => {
              await onSpeichere({ text, element_id: entwurf.element_id, x: entwurf.x, y: entwurf.y });
              setEntwurf(null);
            }}
          />
        </Blase>
      )}
      {offenerPin && offenerOrt && (
        <Blase lage={aufBildschirm(offenerOrt)} onSchliessen={() => onOeffne(null)}>
          <Faden pin={offenerPin} kommentare={kommentare} team={team} onSpeichere={onSpeichere} onErledigt={onErledigt} />
        </Blase>
      )}
    </div>
  );
}

function Blase({ lage, children, onSchliessen }: { lage: { left: number; top: number }; children: React.ReactNode; onSchliessen(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onSchliessen();
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [onSchliessen]);
  return (
    <div ref={ref} className="wb-blase" style={{ left: lage.left + 18, top: lage.top - 8 }} role="dialog" aria-label="Kommentar">
      {children}
    </div>
  );
}

function Eingabe({ team, platzhalter, knopf, onSenden, onAbbrechen }: { team: readonly string[]; platzhalter: string; knopf: string; onSenden(text: string): Promise<void>; onAbbrechen?: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const senden = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFehler('');
    try {
      await onSenden(text);
      setText('');
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="wb-eingabe"
      onSubmit={(e) => {
        e.preventDefault();
        void senden();
      }}
    >
      <ErwaehnungsFeld
        value={text}
        onChange={setText}
        team={team}
        rows={2}
        autoFocus
        placeholder={platzhalter}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void senden();
        }}
      />
      {fehler && <p className="form-error">{fehler}</p>}
      <div className="wb-eingabe-knoepfe">
        {onAbbrechen && (
          <button type="button" className="button small subtle" onClick={onAbbrechen}>
            Abbrechen
          </button>
        )}
        <button type="submit" className="button small primary" disabled={!text.trim() || busy}>
          {busy ? 'Speichert …' : knopf}
        </button>
      </div>
    </form>
  );
}

function Faden({ pin, kommentare, team, onSpeichere, onErledigt }: { pin: WhiteboardKommentar; kommentare: readonly WhiteboardKommentar[]; team: readonly string[]; onSpeichere: Props['onSpeichere']; onErledigt: Props['onErledigt'] }) {
  const antworten = kommentare.filter((k) => k.antwort_auf === pin.id).sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am));
  return (
    <div className="wb-faden">
      {[pin, ...antworten].map((k) => (
        <div key={k.id} className="wb-beitrag">
          <div className="wb-beitrag-kopf">
            <strong>{autorName(k.von, team)}</strong>
            <span>{formatDateTime(k.erstellt_am)}</span>
          </div>
          <p>
            <MitErwaehnungen text={k.text} team={team} />
          </p>
        </div>
      ))}
      <Eingabe team={team} platzhalter="Antworten …" knopf="Antworten" onSenden={(text) => onSpeichere({ text, antwort_auf: pin.id })} />
      <button type="button" className="button small subtle wb-erledigt" onClick={() => void onErledigt(pin, !pin.erledigt)}>
        {pin.erledigt ? 'Wieder öffnen' : 'Erledigt'}
      </button>
    </div>
  );
}

/** List of all threads beside the canvas: open ones first, done ones folded away. */
export function KommentarListe({ kommentare, team, onWaehle, onSchliessen }: { kommentare: readonly WhiteboardKommentar[]; team: readonly string[]; onWaehle(k: WhiteboardKommentar): void; onSchliessen(): void }) {
  const [mitErledigten, setMitErledigten] = useState(false);
  const pins = kommentare.filter((k) => !k.antwort_auf).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  const offen = pins.filter((k) => !k.erledigt);
  const erledigt = pins.filter((k) => k.erledigt);
  const zeile = (k: WhiteboardKommentar) => {
    const antworten = kommentare.filter((a) => a.antwort_auf === k.id).length;
    return (
      <li key={k.id}>
        <button type="button" onClick={() => onWaehle(k)}>
          <span className="wb-liste-kopf">
            <strong>{autorName(k.von, team)}</strong> · {formatDateTime(k.erstellt_am)}
          </span>
          <span className="wb-liste-text">{k.text}</span>
          {antworten > 0 && <span className="wb-liste-antworten">{antworten === 1 ? '1 Antwort' : `${antworten} Antworten`}</span>}
        </button>
      </li>
    );
  };
  return (
    <aside className="wb-liste" aria-label="Kommentare">
      <div className="wb-liste-titel">
        <h2>Kommentare</h2>
        <button type="button" className="button small subtle" onClick={onSchliessen} aria-label="Kommentare schließen">
          ✕
        </button>
      </div>
      {offen.length === 0 && <p className="muted">Keine offenen Kommentare. Mit „Kommentieren“ setzt du einen Pin aufs Board.</p>}
      <ul>{offen.map(zeile)}</ul>
      {erledigt.length > 0 && (
        <button type="button" className="button small subtle" onClick={() => setMitErledigten(!mitErledigten)}>
          {mitErledigten ? 'Erledigte ausblenden' : `${erledigt.length} erledigt anzeigen`}
        </button>
      )}
      {mitErledigten && <ul className="wb-liste-erledigt">{erledigt.map(zeile)}</ul>}
    </aside>
  );
}
