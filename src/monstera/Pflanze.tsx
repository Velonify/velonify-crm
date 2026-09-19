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

/**
 * A monstera leaf, drawn like the hand-drawn reference: a heart-shaped blade whose edge is cut by narrow,
 * curved notches, plus the teardrop holes along the midrib. `reife` 0 = young and whole, 1 = old and deeply cut.
 */
const BLATT =
  'M0 -0.04 C-0.08 0.06 -0.26 0.10 -0.38 0.00 C-0.52 -0.14 -0.50 -0.52 -0.34 -0.80 C-0.24 -0.98 -0.12 -1.06 0 -1.14 C0.12 -1.06 0.24 -0.98 0.34 -0.80 C0.50 -0.52 0.52 -0.14 0.38 0.00 C0.26 0.10 0.08 0.06 0 -0.04 Z';

/** Height along the midrib where a notch cuts in, from the base upwards. */
const SCHNITT_HOEHEN = [0.1, 0.32, 0.54, 0.74, 0.9];

interface Punkt {
  x: number;
  y: number;
}

const zwischen = (a: Punkt, b: Punkt, t: number): Punkt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The outer part of a quadratic curve, so a second, wider stroke can widen the notch towards the edge. */
function aussenStueck(a: Punkt, steuer: Punkt, e: Punkt, t: number): string {
  const p1 = zwischen(a, steuer, t);
  const p2 = zwischen(steuer, e, t);
  const ende = zwischen(p1, p2, t);
  return `M${a.x} ${a.y} Q${p1.x} ${p1.y} ${ende.x} ${ende.y}`;
}

function Schnitte({ reife, seed }: { reife: number; seed: number }) {
  if (reife <= 0) return null;
  const anzahl = Math.round(1 + reife * (SCHNITT_HOEHEN.length - 1));
  // Young leaves are only notched at the edge; with age the notches reach almost to the midrib.
  const innen = 0.28 - 0.21 * reife;
  const teile = [];
  for (let k = 0; k < anzahl; k++) {
    for (const s of [-1, 1]) {
      const streuung = 0.94 + 0.12 * zufall(seed + k * 5 + (s + 1) * 3);
      const t = SCHNITT_HOEHEN[k] * streuung;
      const ix = s * innen;
      const iy = -t;
      // Curved notch, wider where it opens at the edge and with a round end near the midrib.
      const aussen = { x: s * 0.85, y: -(t + 0.34) };
      const steuer = { x: s * 0.5, y: -(t + 0.16) };
      const ende = { x: ix, y: iy };
      teile.push(
        <path key={`s${k}${s}`} d={`M${aussen.x} ${aussen.y} Q${steuer.x} ${steuer.y} ${ende.x} ${ende.y}`} fill="none" stroke="black" strokeWidth={0.055} strokeLinecap="round" />,
        <path key={`b${k}${s}`} d={aussenStueck(aussen, steuer, ende, 0.55)} fill="none" stroke="black" strokeWidth={0.095} strokeLinecap="round" />,
      );
      // Teardrop holes between notch and midrib, the older the leaf the more of them.
      if (reife > 0.45 && k < anzahl - 1 && zufall(seed + k * 3 + s) > 0.3) {
        const th = (t + SCHNITT_HOEHEN[k + 1] * streuung) / 2;
        teile.push(
          <ellipse key={`l${k}${s}`} cx={s * 0.16} cy={-th - 0.05} rx={0.115} ry={0.045} fill="black" transform={`rotate(${s * -28} ${s * 0.16} ${-th - 0.05})`} />,
        );
      }
    }
  }
  return <>{teile}</>;
}

/** Midrib plus a vein into every finger. */
function adern(reife: number): string {
  const anzahl = Math.round(1 + reife * (SCHNITT_HOEHEN.length - 1));
  const teile = ['M0 -0.06 L0 -1.02'];
  for (let k = 0; k < anzahl; k++) {
    const t = SCHNITT_HOEHEN[k] + 0.1;
    for (const s of [-1, 1]) teile.push(`M0 ${-t + 0.08} Q${s * 0.2} ${-(t + 0.04)} ${s * 0.36} ${-(t + 0.2)}`);
  }
  return teile.join(' ');
}

const HAENGEN: Record<Zustand, number> = { praechtig: 0, durstig: 14, welk: 32, sehr_welk: 52 };
const VERBLASSEN: Record<Zustand, number> = { praechtig: 0, durstig: 12, welk: 38, sehr_welk: 62 };

interface BlattLage {
  stiel: string;
  x: number;
  y: number;
  basisX: number;
  winkel: number;
  groesse: number;
  reife: number;
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
      // A young leaf is still whole; the cuts deepen as it matures.
      reife: Math.max(0, Math.min(1, (alter - 1) / 6)),
      seite,
    };
  });
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
                  <Schnitte reife={b.reife} seed={i} />
                </mask>
                <clipPath id={`${id}-c${i}`}>
                  <path d={BLATT} />
                </clipPath>
                <path d={BLATT} fill={farbe} mask={`url(#${id}-${i})`} className="pflanze-spreite" />
                {/* Veins stay inside the blade and stop at the cuts. */}
                <path d={adern(b.reife)} className="pflanze-ader" clipPath={`url(#${id}-c${i})`} mask={`url(#${id}-${i})`} />
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
