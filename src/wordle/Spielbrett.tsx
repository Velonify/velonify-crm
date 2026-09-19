import type { CSSProperties } from 'react';
import { bewerte, MAX_VERSUCHE, musterZeilen, WORT_LAENGE, type Feld } from '../data/wordle';

const FELD_LABEL: Record<Feld, string> = { g: 'richtig', y: 'woanders im Wort', x: 'nicht im Wort' };

interface Zeile {
  buchstaben: string;
  felder: Feld[] | null;
}

/**
 * The 6 × 5 board. Rows come from the attempts in this browser; a game finished on another device has only its
 * colour pattern, then the rows show colours without letters.
 */
export function Spielbrett({
  versuche,
  loesung,
  eingabe,
  fertig,
  fremdesMuster,
  aufgedeckt,
  wackelt,
}: {
  versuche: readonly string[];
  loesung: string;
  eingabe: string;
  fertig: boolean;
  /** Pattern from the sheet when this browser does not know the attempts. */
  fremdesMuster?: string;
  /** Index of the row that was just submitted and flips open. */
  aufgedeckt: number | null;
  wackelt: boolean;
}) {
  const zeilen: Zeile[] = fremdesMuster
    ? musterZeilen(fremdesMuster).map((felder) => ({ buchstaben: '', felder }))
    : versuche.map((v) => ({ buchstaben: v, felder: bewerte(v, loesung) }));
  if (!fertig && zeilen.length < MAX_VERSUCHE) zeilen.push({ buchstaben: eingabe, felder: null });
  while (zeilen.length < MAX_VERSUCHE) zeilen.push({ buchstaben: '', felder: null });
  const aktuelle = fertig ? -1 : versuche.length;

  return (
    <div className="wordle-brett" role="grid" aria-label="Spielfeld">
      {zeilen.map((zeile, z) => (
        <div key={z} role="row" className={`wordle-zeile${z === aktuelle && wackelt ? ' wackelt' : ''}`}>
          {Array.from({ length: WORT_LAENGE }, (_, i) => {
            const buchstabe = zeile.buchstaben[i] ?? '';
            const feld = zeile.felder?.[i];
            const klasse = ['wordle-feld', feld ? `feld-${feld}` : buchstabe ? 'is-voll' : '', z === aufgedeckt ? 'is-neu' : ''].filter(Boolean).join(' ');
            return (
              <div
                key={i}
                role="gridcell"
                className={klasse}
                style={{ '--i': i } as CSSProperties}
                aria-label={feld ? `${buchstabe || 'Buchstabe'} ${FELD_LABEL[feld]}` : buchstabe || 'leer'}
              >
                {buchstabe}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const TASTEN = ['QWERTZUIOP', 'ASDFGHJKL', '+YXCVBNM-'];

export function Tastatur({ farben, onTaste, gesperrt }: { farben: Map<string, Feld>; onTaste: (taste: string) => void; gesperrt: boolean }) {
  return (
    <div className="wordle-tastatur" aria-label="Tastatur">
      {TASTEN.map((reihe) => (
        <div key={reihe} className="wordle-tastenreihe">
          {[...reihe].map((t) => {
            if (t === '+')
              return (
                <button key={t} type="button" className="wordle-taste breit" onClick={() => onTaste('ENTER')} disabled={gesperrt}>
                  Enter
                </button>
              );
            if (t === '-')
              return (
                <button key={t} type="button" className="wordle-taste breit" onClick={() => onTaste('BACKSPACE')} disabled={gesperrt} aria-label="Löschen">
                  ⌫
                </button>
              );
            const feld = farben.get(t);
            return (
              <button key={t} type="button" className={`wordle-taste${feld ? ` feld-${feld}` : ''}`} onClick={() => onTaste(t)} disabled={gesperrt}>
                {t}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Colour pattern of a finished game in small squares, for team lists. */
export function MiniMuster({ muster }: { muster: string }) {
  const zeilen = musterZeilen(muster);
  return (
    <span className="wordle-mini" aria-hidden="true">
      {zeilen.map((zeile, z) => (
        <span key={z} className="wordle-mini-zeile">
          {zeile.map((feld, i) => (
            <span key={i} className={`feld-${feld}`} />
          ))}
        </span>
      ))}
    </span>
  );
}
