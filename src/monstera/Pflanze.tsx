import { useId, type CSSProperties } from 'react';
import type { Zustand } from '../data/monstera';

/*
 * The plant, drawn from its state. Older leaves stand low and wide, the newest rise from the centre. A leaf gets
 * the typical monstera slits and holes as it ages. Thirst lets the leaves hang and fade towards yellow.
 */

const BREITE = 320;
const HOEHE = 320;
const TOPF_OBEN = 246;
const MITTE = BREITE / 2;

/** Deterministic noise per leaf, so the plant looks the same on every visit. */
function zufall(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Heart-shaped leaf with a notch at the stalk, pointing up from the origin. */
const BLATT =
  'M0 -0.05 C-0.18 -0.03 -0.42 0.02 -0.56 -0.18 C-0.76 -0.46 -0.5 -0.9 0 -1 C0.5 -0.9 0.76 -0.46 0.56 -0.18 C0.42 0.02 0.18 -0.03 0 -0.05 Z';

const HAENGEN: Record<Zustand, number> = { praechtig: 0, durstig: 14, welk: 32, sehr_welk: 52 };
const VERBLASSEN: Record<Zustand, number> = { praechtig: 0, durstig: 12, welk: 38, sehr_welk: 62 };

interface BlattLage {
  stiel: string;
  x: number;
  y: number;
  basisX: number;
  winkel: number;
  groesse: number;
  schlitze: number;
  loecher: boolean;
  seite: number;
}

function lagen(anzahl: number): BlattLage[] {
  const pflanze = 40 + Math.min(anzahl, 24) * 0.8;
  const reife = Math.min(anzahl, 16) / 16;
  return Array.from({ length: anzahl }, (_, i) => {
    // i = 0 is the oldest leaf.
    const rang = anzahl === 1 ? 1 : i / (anzahl - 1);
    const alter = anzahl - 1 - i;
    const seite = i % 2 === 0 ? -1 : 1;
    // Spread: 0 = upright in the centre, 1 = wide and low. Older leaves lean further out, with scatter so they fill a dome.
    const spreizung = Math.max(0, Math.min(1, (1 - rang) * 0.75 + zufall(i) * 0.4 - 0.1));
    const winkel = seite * (4 + 66 * spreizung) * (Math.PI / 180);
    const laenge = (40 + 120 * reife) * (0.45 + 0.55 * (1 - spreizung * 0.55)) * (0.8 + 0.35 * zufall(i + 50));
    const basisX = MITTE + seite * (2 + zufall(i + 90) * 8);
    const x = basisX + Math.sin(winkel) * laenge;
    const y = TOPF_OBEN - Math.cos(winkel) * laenge;
    // The stem rises first and bends outwards towards the leaf.
    const kx = basisX + Math.sin(winkel) * laenge * 0.2;
    const ky = TOPF_OBEN - laenge * 0.75;
    return {
      stiel: `M${basisX} ${TOPF_OBEN} Q${kx} ${ky} ${x} ${y}`,
      x,
      y,
      basisX,
      // Leaves face the viewer rather than turning fully sideways.
      winkel: Math.max(-62, Math.min(62, (Math.atan2(x - kx, ky - y) * 180) / Math.PI)),
      groesse: pflanze * Math.min(1, 0.55 + alter * 0.09),
      schlitze: Math.max(0, Math.min(5, Math.floor((alter - 1) / 1.5) + 1)),
      loecher: alter >= 5,
      seite,
    };
  });
}

/** The cuts that make a monstera a monstera: wedges from the edge almost to the midrib, plus holes. */
function Schlitze({ anzahl, loecher }: { anzahl: number; loecher: boolean }) {
  const teile = [];
  for (let k = 0; k < anzahl; k++) {
    const y = -0.2 - k * 0.16;
    for (const s of [-1, 1]) {
      teile.push(<path key={`s${k}${s}`} d={`M${s * 0.95} ${y + 0.03} L${s * 0.13} ${y - 0.035} L${s * 0.95} ${y - 0.17} Z`} fill="black" />);
      if (loecher && k < 3) teile.push(<ellipse key={`l${k}${s}`} cx={s * 0.3} cy={y - 0.11} rx={0.07} ry={0.035} fill="black" transform={`rotate(${s * -12} ${s * 0.3} ${y - 0.11})`} />);
    }
  }
  return <>{teile}</>;
}

export function Pflanze({ blaetter, zustand, neuesBlatt, gegossen }: { blaetter: number; zustand: Zustand; neuesBlatt: boolean; gegossen: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const liste = lagen(blaetter);
  const welk = VERBLASSEN[zustand];
  // Crop to the plant, so a young one does not float in an empty frame.
  const rand = 10;
  const minX = Math.min(MITTE - 62, ...liste.map((b) => b.x - b.groesse * 0.9)) - rand;
  const maxX = Math.max(MITTE + 62, ...liste.map((b) => b.x + b.groesse * 0.9)) + rand;
  const minY = Math.min(TOPF_OBEN - 20, ...liste.map((b) => b.y - b.groesse * 1.05)) - rand;
  const sicht = `${minX} ${minY} ${maxX - minX} ${HOEHE - minY}`;
  const farbe = `color-mix(in srgb, var(--blatt) ${100 - welk}%, var(--blatt-welk))`;

  return (
    <svg className={`pflanze zustand-${zustand}`} viewBox={sicht} role="img" aria-label={`Monstera mit ${blaetter} ${blaetter === 1 ? 'Blatt' : 'Blättern'}`}>
      {/* Higher leaves first, so the older, lower ones with their slits stand in front. */}
      {[...liste.keys()].sort((x, y) => liste[x].y - liste[y].y).map((i) => {
        const b = liste[i];
        const neu = neuesBlatt && i === liste.length - 1;
        // Thirsty leaves hang outwards and down.
        const winkel = b.winkel + b.seite * HAENGEN[zustand] * (0.6 + zufall(i + 7) * 0.6);
        return (
          <g key={i} className="pflanze-trieb" style={{ transformOrigin: `${b.basisX}px ${TOPF_OBEN}px`, '--verzoegerung': `${-zufall(i + 3) * 6}s` } as CSSProperties}>
            <path d={b.stiel} className="pflanze-stiel" />
            <g className={neu ? 'pflanze-blatt is-neu' : 'pflanze-blatt'} style={{ transformOrigin: `${b.x}px ${b.y}px` }}>
              <g style={{ transform: `translate(${b.x}px, ${b.y}px) rotate(${winkel}deg) scale(${b.groesse})` }} className="pflanze-lage">
                <mask id={`${id}-${i}`} maskUnits="userSpaceOnUse" x={-1} y={-1.2} width={2} height={1.4}>
                  <rect x={-1} y={-1.2} width={2} height={1.4} fill="white" />
                  <Schlitze anzahl={b.schlitze} loecher={b.loecher} />
                </mask>
                <path d={BLATT} fill={farbe} mask={`url(#${id}-${i})`} className="pflanze-spreite" />
                <path d="M0 0 L0 -0.9" className="pflanze-ader" />
              </g>
            </g>
          </g>
        );
      })}
      {/* Pot in bordeaux with a rim and soil. */}
      <path d={`M${MITTE - 54} ${TOPF_OBEN + 8} L${MITTE - 42} ${HOEHE - 6} L${MITTE + 42} ${HOEHE - 6} L${MITTE + 54} ${TOPF_OBEN + 8} Z`} className="pflanze-topf" />
      <rect x={MITTE - 60} y={TOPF_OBEN - 4} width={120} height={16} className="pflanze-rand" />
      <rect x={MITTE - 54} y={TOPF_OBEN - 4} width={108} height={4} className="pflanze-erde" />
      {gegossen > 0 && (
        <g key={gegossen} className="pflanze-tropfen" aria-hidden="true">
          {[-30, -14, 0, 14, 30].map((dx, i) => (
            <g key={dx} transform={`translate(${MITTE + dx} ${TOPF_OBEN - 40 - (i % 2) * 14})`}>
              <path d="M0 -6 C3 -1 4 2 0 4 C-4 2 -3 -1 0 -6 Z" style={{ animationDelay: `${i * 90}ms` }} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
