import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import { SchemaError } from '../data/errors';
import { MAX_VERSUCHE, raetselNummer, rangliste } from '../data/wordle';
import { MiniMuster } from './Spielbrett';
import { useWordleErgebnisse } from './useWordle';

/** Start page teaser: who has played today and a button into the game. */
export function WordleKarte({ team, ich, heute }: { team: readonly string[]; ich: string | null; heute: string }) {
  const ergebnisse = useWordleErgebnisse();
  const stand = useMemo(() => rangliste(ergebnisse.data ?? [], team, heute), [ergebnisse.data, team, heute]);
  const meins = stand.find((s) => s.spieler === ich)?.heute;
  const gespielt = stand.filter((s) => s.heute).length;

  // Before setup the card stays away instead of showing an error on the start page.
  if (ergebnisse.error instanceof SchemaError) return null;

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
      {ergebnisse.error ? (
        <p className="muted">Die Ergebnisse konnten nicht geladen werden.</p>
      ) : (
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
      )}
    </Card>
  );
}
