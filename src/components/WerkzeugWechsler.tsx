import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { istGeplant, WERKZEUGE, type Werkzeug } from '../werkzeuge';

/** Button under the logo that opens a menu for switching between the tools of the company page. */
export function WerkzeugWechsler({ aktuell }: { aktuell: Werkzeug }) {
  const [offen, setOffen] = useState(false);
  const bereich = useRef<HTMLDivElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const navigate = useNavigate();

  const eintraege = () => [...(bereich.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!offen) return;
    eintraege().find((e) => e.getAttribute('aria-current') === 'true')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!bereich.current?.contains(event.target as Node)) setOffen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOffen(false);
        knopf.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [offen]);

  const onMenuKey = (event: ReactKeyboardEvent) => {
    const alle = eintraege();
    const i = alle.indexOf(document.activeElement as HTMLElement);
    const ziel = { ArrowDown: (i + 1) % alle.length, ArrowUp: (i - 1 + alle.length) % alle.length, Home: 0, End: alle.length - 1 }[event.key];
    if (ziel === undefined) {
      if (event.key === 'Tab') setOffen(false);
      return;
    }
    event.preventDefault();
    alle[ziel]?.focus();
  };

  const waehlen = (w: Werkzeug) => {
    if (istGeplant(w)) return;
    setOffen(false);
    if (w.id !== aktuell.id) navigate(w.pfad!);
  };

  return (
    <div className="tool-switch" ref={bereich}>
      <button
        ref={knopf}
        type="button"
        className="tool-switch-button"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? menuId : undefined}
        aria-label={`Werkzeug wechseln, geöffnet: ${aktuell.name}`}
        onClick={() => setOffen((o) => !o)}
      >
        <span>{aktuell.name}</span>
        <span className="tool-switch-chevron" aria-hidden="true" />
      </button>
      {offen && (
        <div className="tool-menu" role="menu" id={menuId} aria-label="Werkzeuge" onKeyDown={onMenuKey}>
          {WERKZEUGE.map((w) => {
            const aktiv = w.id === aktuell.id;
            return (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`tool-menu-item${aktiv ? ' is-active' : ''}`}
                aria-current={aktiv || undefined}
                aria-disabled={istGeplant(w) || undefined}
                onClick={() => waehlen(w)}
              >
                <span className="tool-menu-name">
                  {w.name}
                  {istGeplant(w) && <span className="nav-tag">bald</span>}
                </span>
                <span className="tool-menu-text">{w.beschreibung}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
