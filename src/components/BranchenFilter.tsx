import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BRANCHEN, type BranchenFilterWert } from '../data/branchen';

/** Industry filter in the URL (`branche=mode,schmuck`, `branche_modus=ohne`), so a filtered view can be shared. */
export function useBranchenFilter(onChange?: () => void) {
  const [params, setParams] = useSearchParams();
  const roh = params.get('branche') ?? '';
  const ausblenden = params.get('branche_modus') === 'ohne';
  const wert = useMemo<BranchenFilterWert>(() => ({ wahl: new Set(roh.split(',').filter(Boolean)), ausblenden }), [roh, ausblenden]);
  const setze = (neu: BranchenFilterWert) => {
    setParams(
      (alt) => {
        const next = new URLSearchParams(alt);
        const wahl = BRANCHEN.map((b) => b.id).filter((id) => neu.wahl.has(id));
        if (wahl.length) next.set('branche', wahl.join(','));
        else next.delete('branche');
        if (neu.ausblenden) next.set('branche_modus', 'ohne');
        else next.delete('branche_modus');
        return next;
      },
      { replace: true },
    );
    onChange?.();
  };
  return { wert, setze };
}

interface Props {
  wert: BranchenFilterWert;
  setze(wert: BranchenFilterWert): void;
  /** Items per industry; chips only show for industries that occur (or are chosen). */
  zahlen: Record<string, number>;
  /** Status line below the chips, e.g. while industries are being classified. */
  children?: ReactNode;
}

/** Chips for several industries plus the switch between showing only them and hiding them. */
export function BranchenFilter({ wert, setze, zahlen, children }: Props) {
  const umschalten = (id: string) => {
    const wahl = new Set(wert.wahl);
    if (wahl.has(id)) wahl.delete(id);
    else wahl.add(id);
    setze({ ...wert, wahl });
  };
  const sichtbar = BRANCHEN.filter((b) => zahlen[b.id] || wert.wahl.has(b.id));
  if (sichtbar.length === 0 && !children) return null;

  return (
    <div className="branchen-filter" role="group" aria-label="Branche">
      {sichtbar.length > 0 && (
        <>
          <select value={wert.ausblenden ? 'ohne' : ''} onChange={(e) => setze({ ...wert, ausblenden: e.target.value === 'ohne' })} aria-label="Gewählte Branchen zeigen oder ausblenden">
            <option value="">Nur diese Branchen</option>
            <option value="ohne">Ohne diese Branchen</option>
          </select>
          <div className="chips">
            {sichtbar.map((b) => {
              const aktiv = wert.wahl.has(b.id);
              return (
                <button key={b.id} type="button" aria-pressed={aktiv} className={`chip${aktiv ? ' is-active' : ''}${aktiv && wert.ausblenden ? ' is-aus' : ''}`} onClick={() => umschalten(b.id)}>
                  {b.label} ({(zahlen[b.id] ?? 0).toLocaleString('de-DE')})
                </button>
              );
            })}
            {wert.wahl.size > 0 && (
              <button type="button" className="link-button small" onClick={() => setze({ wahl: new Set(), ausblenden: false })}>
                Branchen zurücksetzen
              </button>
            )}
          </div>
        </>
      )}
      {children && <div className="branchen-filter-stand muted small">{children}</div>}
    </div>
  );
}
