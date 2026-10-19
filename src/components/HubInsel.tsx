import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrm } from '../data/CrmContext';
import { ortLink, ortText } from '../data/praesenz';
import { kuerzelVon } from '../data/zustaendig';
import { WerkzeugIcon } from './Icons';
import { nameVon, useAnwesende } from './Praesenz';
import { useInselToasts, type Toast } from './Toasts';

const tippt = (ziel: EventTarget | null) =>
  ziel instanceof HTMLElement && (ziel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName));

/**
 * The glass island at the bottom: quiet it shows the sync state and who else is online (click for where they are);
 * a message (toast) makes it grow, with its action button – usually "Rückgängig", also on the Z key.
 */
export function HubInsel() {
  const { toasts, dismiss } = useInselToasts();
  const { loading, db } = useCrm();
  const anwesende = useAnwesende();
  const team = db?.listen.team ?? [];
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);
  const aktuell: Toast | undefined = toasts.at(-1);

  const ausfuehren = (t: Toast) => {
    dismiss(t.id);
    void t.aktion?.run();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || tippt(e.target)) return;
      if (e.key.toLowerCase() !== 'z') return;
      const mitAktion = [...toasts].reverse().find((t) => t.aktion);
      if (!mitAktion) return;
      e.preventDefault();
      ausfuehren(mitAktion);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, [offen]);

  const leise = loading && db ? 'Wird aktualisiert …' : anwesende.length > 0
    ? `${anwesende.map((a) => nameVon(a, team)).join(', ')} ${anwesende.length === 1 ? 'ist' : 'sind'} online`
    : 'Alles synchron';

  return (
    <div className="insel-huelle" ref={huelle}>
      {offen && anwesende.length > 0 && !aktuell && (
        <div className="insel-panel glass" role="dialog" aria-label="Gerade online">
          <span className="eyebrow-klein">Gerade online</span>
          {anwesende.map((a) => {
            const name = nameVon(a, team);
            return (
              <Link key={a.email} to={ortLink(a)} className="insel-person" onClick={() => setOffen(false)}>
                <span className="insel-avatar" aria-hidden="true">{kuerzelVon(name)[0] ?? name.slice(0, 2)}</span>
                <span>
                  <strong>{name}</strong>
                  <span className="muted">{ortText(a)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <div className={`insel glass${aktuell ? ' is-laut' : ''}${aktuell?.kind === 'error' ? ' is-fehler' : ''}`} role="status" aria-live="polite">
        {aktuell ? (
          <>
            <span className="insel-icon" aria-hidden="true">
              {aktuell.kind === 'error' ? '!' : <WerkzeugIcon id={aktuell.aktion ? 'rueckgaengig' : 'haken'} />}
            </span>
            <span className="insel-text">{aktuell.message}</span>
            {aktuell.aktion && (
              <button type="button" className="insel-aktion" onClick={() => ausfuehren(aktuell)}>
                {aktuell.aktion.label}
                {aktuell.aktion.label === 'Rückgängig' && <kbd>Z</kbd>}
              </button>
            )}
            <button type="button" className="insel-zu" onClick={() => dismiss(aktuell.id)} aria-label="Meldung schließen">
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            className="insel-leise"
            onClick={() => setOffen((o) => !o)}
            aria-expanded={anwesende.length > 0 ? offen : undefined}
            disabled={anwesende.length === 0}
          >
            <span className={`insel-punkt${loading && db ? ' is-sync' : ''}`} aria-hidden="true" />
            {anwesende.length > 0 && (
              <span className="insel-avatare" aria-hidden="true">
                {anwesende.slice(0, 3).map((a) => {
                  const name = nameVon(a, team);
                  return <span key={a.email} className="insel-avatar">{kuerzelVon(name)[0] ?? name.slice(0, 2)}</span>;
                })}
              </span>
            )}
            <span className="insel-leise-text">{leise}</span>
          </button>
        )}
      </div>
    </div>
  );
}
