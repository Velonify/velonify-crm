import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import type { WordleErgebnis } from '../data/types';
import { MAX_VERSUCHE, raetselNummer, rangliste } from '../data/wordle';
import { MiniMuster } from './Spielbrett';

/** Start page teaser: who has played today and a button into the game. The data comes with the plant, in one request. */
export function WordleKarte({ ergebnisse, team, ich, heute }: { ergebnisse: readonly WordleErgebnis[]; team: readonly string[]; ich: string | null; heute: string }) {
  const stand = useMemo(() => rangliste(ergebnisse, team, heute), [ergebnisse, team, heute]);
  const meins = stand.find((s) => s.spieler === ich)?.heute;
  const gespielt = stand.filter((s) => s.heute).length;

  return (
    <Card
      title={
        <>
          Wort des Tages <span className="count">Nr. {raetselNummer(heute)}</span>
        </>
      }
      actions={
        <Link to="/wort" className={`button small${meins ? '' : ' primary'}`}>
          {meins ? 'Ansehen' : 'Spielen'}
        </Link>
      }
    >
      <>
          <p className="muted small">
            {gespielt === 0 ? 'Heute hat noch niemand gespielt – sei die erste Person.' : `${gespielt} von ${stand.length} haben heute gespielt.`}
          </p>
          <ul className="wordle-karte-liste">
            {stand.map((s) => (
              <li key={s.spieler}>
                <span className="wordle-karte-name">{s.spieler}</span>
                {s.serie > 1 && <span className="badge subtle" title="Gelöste Werktage in Folge">Serie {s.serie}</span>}
                {s.heute ? (
                  <span className="wordle-heute">
                    <MiniMuster muster={s.heute.muster} />
                    <span>{s.heute.geloest ? `${s.heute.versuche}/${MAX_VERSUCHE}` : 'X'}</span>
                  </span>
                ) : (
                  <span className="muted small">offen</span>
                )}
              </li>
            ))}
          </ul>
      </>
    </Card>
  );
}
