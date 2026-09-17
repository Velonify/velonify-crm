import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCrm } from '../data/CrmContext';
import { suche, type Treffer, type TrefferArt } from '../data/suche';

const ART_LABEL: Record<TrefferArt, string> = { firma: 'Firmen', kontakt: 'Kontakte', deal: 'Deals' };
const REIHENFOLGE: TrefferArt[] = ['firma', 'kontakt', 'deal'];

export const istMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Search button for the sidebar plus the ⌘K / Ctrl+K dialog. */
export function Suche() {
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOffen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOffen(true)} aria-label="Suchen" title={`Suchen (${istMac ? '⌘K' : 'Strg+K'})`}>
        <span aria-hidden="true">⌕</span>
        <span className="search-trigger-label">Suchen</span>
        <kbd>{istMac ? '⌘K' : 'Strg K'}</kbd>
      </button>
      {/* Rendered at body level, so it follows the page theme, not the sidebar. */}
      {offen && createPortal(<SuchDialog onClose={() => setOffen(false)} />, document.body)}
    </>
  );
}

function SuchDialog({ onClose }: { onClose(): void }) {
  const { db } = useCrm();
  const navigate = useNavigate();
  const [eingabe, setEingabe] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Grouped for display, flat for keyboard navigation.
  const gruppen = useMemo(() => {
    const treffer = db ? suche(db, eingabe) : [];
    return REIHENFOLGE.map((art) => ({ art, treffer: treffer.filter((t) => t.art === art) })).filter((g) => g.treffer.length > 0);
  }, [db, eingabe]);
  const flach = gruppen.flatMap((g) => g.treffer);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => setAktiv(0), [eingabe]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [aktiv]);

  const oeffne = (t: Treffer) => {
    onClose();
    navigate(`/firmen/${t.firmaId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAktiv((i) => Math.min(i + 1, flach.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAktiv((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && flach[aktiv]) {
      event.preventDefault();
      oeffne(flach[aktiv]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let index = -1;
  return (
    <div className="overlay search-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Suche">
        <div className="search-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Firma, Kontakt, Deal, Domain, Kürzel, E-Mail …"
            role="combobox"
            aria-expanded={flach.length > 0}
            aria-controls={listId}
            aria-activedescendant={flach[aktiv] ? `${listId}-${aktiv}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        {!db && <p className="search-empty">Daten werden geladen …</p>}
        {db && eingabe.trim() === '' && <p className="search-empty">Tippen zum Suchen. ↑ ↓ zum Auswählen, Enter zum Öffnen.</p>}
        {db && eingabe.trim() !== '' && flach.length === 0 && <p className="search-empty">Nichts gefunden für „{eingabe}“.</p>}

        {flach.length > 0 && (
          <ul ref={listRef} id={listId} role="listbox" className="search-results" aria-label="Suchergebnisse">
            {gruppen.map((gruppe) => (
              <li key={gruppe.art} role="presentation">
                <div className="search-group" role="presentation">
                  {ART_LABEL[gruppe.art]}
                </div>
                <ul role="presentation">
                  {gruppe.treffer.map((t) => {
                    index++;
                    const i = index;
                    return (
                      <li
                        key={`${t.art}-${t.id}`}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === aktiv}
                        className={`search-result${i === aktiv ? ' is-active' : ''}${t.archiviert ? ' is-archived' : ''}`}
                        onMouseMove={() => aktiv !== i && setAktiv(i)}
                        onClick={() => oeffne(t)}
                      >
                        <span className="search-text">
                          <span className="search-title">{t.titel}</span>
                          <span className="search-details">
                            {t.details}
                            {t.archiviert && ' · archiviert'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
