import type { Zustand } from '../data/monstera';
import gesund1 from './bilder/gesund-1.webp';
import gesund10 from './bilder/gesund-10.webp';
import gesund16 from './bilder/gesund-16.webp';
import gesund3 from './bilder/gesund-3.webp';
import gesund6 from './bilder/gesund-6.webp';
import welk1 from './bilder/welk-1.webp';
import welk10 from './bilder/welk-10.webp';
import welk16 from './bilder/welk-16.webp';
import welk3 from './bilder/welk-3.webp';
import welk6 from './bilder/welk-6.webp';

/*
 * The plant as an illustration: one picture per growth stage, each in a healthy and a wilted version.
 * Being thirsty only takes the colour down a little, wilting switches to the drooping picture.
 */

const STUFEN = [
  { abBlatt: 16, gesund: gesund16, welk: welk16, name: 'ein Prachtexemplar' },
  { abBlatt: 10, gesund: gesund10, welk: welk10, name: 'eine große Pflanze' },
  { abBlatt: 6, gesund: gesund6, welk: welk6, name: 'eine kräftige Pflanze' },
  { abBlatt: 3, gesund: gesund3, welk: welk3, name: 'eine Jungpflanze' },
  { abBlatt: 0, gesund: gesund1, welk: welk1, name: 'ein Steckling' },
];

export const stufeFuer = (blaetter: number) => STUFEN.find((s) => blaetter >= s.abBlatt) ?? STUFEN[STUFEN.length - 1];

const ZUSTAND_TEXT: Record<Zustand, string> = {
  praechtig: 'kerngesund',
  durstig: 'durstig',
  welk: 'mit hängenden Blättern',
  sehr_welk: 'ganz verwelkt',
};

export function Pflanze({ blaetter, zustand, gegossen }: { blaetter: number; zustand: Zustand; gegossen: number }) {
  const stufe = stufeFuer(blaetter);
  const welk = zustand === 'welk' || zustand === 'sehr_welk';

  return (
    <div className={`pflanze zustand-${zustand}`}>
      <img src={welk ? stufe.welk : stufe.gesund} alt={`Monstera: ${stufe.name}, ${ZUSTAND_TEXT[zustand]}`} />
      {gegossen > 0 && (
        <svg key={gegossen} className="pflanze-tropfen" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          {[24, 38, 50, 62, 76].map((x, i) => (
            <g key={x} transform={`translate(${x} ${6 + (i % 2) * 5})`}>
              <path d="M0 -3 C1.6 -0.6 2 0.8 0 1.8 C-2 0.8 -1.6 -0.6 0 -3 Z" style={{ animationDelay: `${i * 90}ms` }} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
