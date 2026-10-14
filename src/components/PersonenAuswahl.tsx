import { personen, zustaendigWert } from '../data/zustaendig';

/**
 * Picks any number of team members as toggle chips; value in and out is the stored comma list. Names that are
 * no longer in the team list stay visible, so editing never silently drops them.
 */
export function PersonenAuswahl({ team, wert, onChange, label = 'Zuständig', disabled }: { team: readonly string[]; wert: string; onChange(wert: string): void; label?: string; disabled?: boolean }) {
  const gewaehlt = personen(wert);
  const alle = [...team, ...gewaehlt.filter((n) => !team.includes(n))];
  const umschalten = (name: string) => onChange(zustaendigWert(gewaehlt.includes(name) ? gewaehlt.filter((n) => n !== name) : [...gewaehlt, name]));
  return (
    <div className="chips personen-auswahl" role="group" aria-label={label}>
      {alle.map((name) => (
        <button key={name} type="button" className={`chip${gewaehlt.includes(name) ? ' is-active' : ''}`} aria-pressed={gewaehlt.includes(name)} onClick={() => umschalten(name)} disabled={disabled}>
          {name}
        </button>
      ))}
      {alle.length === 0 && <span className="muted small">Kein Team unter Einrichtung gepflegt.</span>}
    </div>
  );
}
