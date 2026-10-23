import { useCrm } from '../data/CrmContext';
import { AGENTUR, DEMO_TEAM } from '../data/demo/agentur';
import { useIch } from '../lib/useIch';

const ICH_KEY = 'velonify-crm.ich';

/**
 * Bar on top of the public demo: whose hub this is (an invented agency), whose view you see, and a way back to the start.
 * The data lives in memory, so starting over is a reload.
 */
export function DemoLeiste() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);

  const zuruecksetzen = () => {
    try {
      localStorage.removeItem(ICH_KEY);
    } catch {
      // Storage blocked: the reload alone starts over.
    }
    window.location.reload();
  };

  return (
    <div className="demo-banner demo-leiste" role="region" aria-label="Demo">
      <span>
        <strong>Demo</strong> · {AGENTUR.name} ist eine erfundene Agentur, alle Firmen und Zahlen sind Beispiele. Mails, Drive und Kalender sind simuliert.
      </span>
      <span className="demo-leiste-aktionen">
        {team.length > 0 && (
          <label>
            Ansicht als{' '}
            <select value={ich ?? ''} onChange={(e) => setIch(e.target.value)}>
              {team.map((name) => {
                const p = DEMO_TEAM.find((t) => t.name === name);
                return (
                  <option key={name} value={name}>
                    {p ? `${p.name} ${p.nachname} · ${p.rolle}` : name}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <button type="button" className="link-button" onClick={zuruecksetzen}>
          Demo zurücksetzen
        </button>
      </span>
    </div>
  );
}
