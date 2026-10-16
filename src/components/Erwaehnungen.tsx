import { Fragment, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { offeneErwaehnung, textTeile, vorschlaege } from '../data/erwaehnungen';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

const ZEILE = 38;

/**
 * Fixed position right under the field, or above it when the viewport has no room below. Fixed, so a scrolling dialog
 * around the field cannot cut the list off.
 */
function lageUnter(feld: HTMLElement, eintraege: number): CSSProperties {
  const r = feld.getBoundingClientRect();
  const hoehe = Math.min(eintraege, 6) * ZEILE + 10;
  const oben = r.bottom + 4 + hoehe > window.innerHeight && r.top - 4 - hoehe > 0;
  return oben ? { left: r.left, bottom: window.innerHeight - r.top + 4 } : { left: r.left, top: r.bottom + 4 };
}

/**
 * Textarea that offers the team after "@": arrow keys or the mouse pick a name, Enter or Tab inserts "@Name ".
 * Everything else behaves like the plain textarea it replaces.
 */
export function ErwaehnungsFeld({ value, onChange, team, onKeyDown, ...rest }: TextareaProps & { value: string; onChange(wert: string): void; team: readonly string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [offen, setOffen] = useState<{ start: number; ende: number; namen: string[]; lage: CSSProperties } | null>(null);
  const [aktiv, setAktiv] = useState(0);

  const pruefe = (text: string, cursor: number) => {
    const treffer = offeneErwaehnung(text, cursor);
    const namen = treffer ? vorschlaege(team, treffer.suche) : [];
    setOffen(treffer && namen.length > 0 && ref.current ? { start: treffer.start, ende: cursor, namen, lage: lageUnter(ref.current, namen.length) } : null);
    setAktiv(0);
  };

  const einfuegen = (name: string) => {
    if (!offen) return;
    const neu = `${value.slice(0, offen.start)}@${name} ${value.slice(offen.ende)}`;
    const cursor = offen.start + name.length + 2;
    onChange(neu);
    setOffen(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(cursor, cursor);
    });
  };

  const taste = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (offen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const schritt = e.key === 'ArrowDown' ? 1 : -1;
        setAktiv((a) => (a + schritt + offen.namen.length) % offen.namen.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        einfuegen(offen.namen[aktiv]);
        return;
      }
      if (e.key === 'Escape') {
        // Closes the list only, not the dialog around the field.
        e.preventDefault();
        e.stopPropagation();
        setOffen(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="erwaehnungs-feld">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          pruefe(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={taste}
        onClick={(e) => pruefe(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={(e) => {
          setOffen(null);
          rest.onBlur?.(e);
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={Boolean(offen)}
        aria-controls={offen ? listId : undefined}
        aria-activedescendant={offen ? `${listId}-${aktiv}` : undefined}
      />
      {offen && (
        <ul className="erwaehnungs-liste" id={listId} role="listbox" aria-label="Person erwähnen" style={offen.lage}>
          {offen.namen.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === aktiv}
              className={i === aktiv ? 'is-active' : undefined}
              // mousedown, so the textarea keeps focus and the blur does not close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                einfuegen(name);
              }}
              onMouseEnter={() => setAktiv(i)}
            >
              <span className="erwaehnungs-avatar" aria-hidden="true">
                {name.slice(0, 1)}
              </span>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text with every "@Name" of the team highlighted; line breaks stay as typed (the surrounding element keeps pre-wrap). */
export function MitErwaehnungen({ text, team, darstellen }: { text: string; team: readonly string[]; darstellen?: (text: string) => ReactNode }) {
  return (
    <>
      {textTeile(text, team).map((teil, i) =>
        teil.person ? (
          <span key={i} className="erwaehnung" title={`${teil.person} erwähnt`}>
            {teil.text}
          </span>
        ) : (
          <Fragment key={i}>{darstellen ? darstellen(teil.text) : teil.text}</Fragment>
        ),
      )}
    </>
  );
}
