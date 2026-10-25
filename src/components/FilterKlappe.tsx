import { useState, type ReactNode } from 'react';

/**
 * Tag and industry chips behind one "Filter" button, so a page starts with its content instead of two rows of chips.
 * Opens by itself while a filter is set, so an active filter is never hidden.
 */
export function FilterKlappe({ aktiv, children }: { aktiv: number; children: ReactNode }) {
  const [offen, setOffen] = useState(aktiv > 0);
  const sichtbar = offen || aktiv > 0;
  return (
    <div className={`filter-klappe${sichtbar ? ' is-offen' : ''}`}>
      <button type="button" className="button small filter-klappe-knopf" aria-expanded={sichtbar} onClick={() => setOffen(!sichtbar)}>
        Filter{aktiv > 0 && <span className="count">{aktiv}</span>}
      </button>
      {sichtbar && <div className="filter-klappe-inhalt">{children}</div>}
    </div>
  );
}
