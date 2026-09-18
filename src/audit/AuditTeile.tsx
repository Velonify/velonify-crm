import { SCHWERE, zaehleBefunde, type Schwere } from '../data/audit';
import type { Audit } from '../data/types';

export function SchwereBadge({ schwere }: { schwere: Schwere }) {
  return <span className={`badge schwere-${schwere}`}>{SCHWERE.find((s) => s.wert === schwere)?.label ?? schwere}</span>;
}

/** "2 hoch · 3 mittel" as small badges; hints only count in the title. */
export function BefundZahlen({ audit }: { audit: Audit }) {
  const z = zaehleBefunde(audit);
  if (z.hoch + z.mittel + z.hinweis === 0) return <span className="muted">keine</span>;
  return (
    <span className="badges" title={`${z.hoch} hoch, ${z.mittel} mittel, ${z.hinweis} Hinweise`}>
      {z.hoch > 0 && <span className="badge schwere-hoch">{z.hoch} hoch</span>}
      {z.mittel > 0 && <span className="badge schwere-mittel">{z.mittel} mittel</span>}
      {z.hoch + z.mittel === 0 && <span className="badge schwere-hinweis">{z.hinweis} Hinweise</span>}
    </span>
  );
}

/** PageSpeed score with the traffic-light colour Google uses (90+ good, 50+ needs work). */
export function Score({ wert }: { wert: number | null }) {
  if (wert === null) return <span className="muted">–</span>;
  const klasse = wert >= 90 ? 'ok' : wert >= 50 ? 'warn' : 'aktion-fehler';
  return <span className={`badge ${klasse}`}>{wert}</span>;
}
