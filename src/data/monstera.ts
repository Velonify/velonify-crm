import { addDays } from './ids';
import type { Deal, Firma, MonsteraEintrag } from './types';

/*
 * Team plant on the start page. Watering keeps her alive: everyone may water once a day, and every workday nobody
 * waters she gets thirstier. Real work makes her grow: new leads, won deals and every day she was watered.
 */

/** The day the plant moved in; she arrives freshly watered. */
export const MONSTERA_START = '2026-09-19';
export const PUNKTE = { lead: 1, deal: 10, giesstag: 1 } as const;
export const PUNKTE_JE_BLATT = 4;
/** More leaves do not fit into the pot; points above keep counting. */
export const MAX_BLAETTER = 24;
export const NAME_SCHLUESSEL = 'monstera_name';

export type Zustand = 'praechtig' | 'durstig' | 'welk' | 'sehr_welk';

export interface MonsteraStand {
  blaetter: number;
  punkte: number;
  /** Points still missing for the next leaf. */
  bisBlatt: number;
  /** Workdays in a row nobody watered, not counting today. */
  durst: number;
  zustand: Zustand;
  letzterGiesstag: string;
  heuteGegossen: string[];
  quellen: { leads: number; deals: number; giesstage: number };
}

const istWerktag = (tag: string) => {
  const [y, m, d] = tag.split('-').map(Number);
  const wochentag = new Date(y, m - 1, d).getDay();
  return wochentag !== 0 && wochentag !== 6;
};

/** Workdays strictly between two days: the days nobody watered. */
export function verpassteWerktage(letzter: string, heute: string): number {
  let anzahl = 0;
  for (let tag = addDays(letzter, 1); tag < heute; tag = addDays(tag, 1)) if (istWerktag(tag)) anzahl++;
  return anzahl;
}

export function zustandBei(durst: number): Zustand {
  if (durst === 0) return 'praechtig';
  if (durst === 1) return 'durstig';
  return durst <= 3 ? 'welk' : 'sehr_welk';
}

export function monsteraStand(eintraege: readonly MonsteraEintrag[], firmen: readonly Firma[], deals: readonly Deal[], heute: string): MonsteraStand {
  const imZeitraum = (tag: string) => tag >= MONSTERA_START && tag <= heute;
  const giesstage = [...new Set(eintraege.map((e) => e.datum).filter(imZeitraum))].sort();
  const leads = firmen.filter((f) => imZeitraum(f.erstellt_am.slice(0, 10))).length;
  const gewonnen = deals.filter((d) => d.phase === 'gewonnen' && imZeitraum(d.abgeschlossen_am.slice(0, 10))).length;
  const punkte = leads * PUNKTE.lead + gewonnen * PUNKTE.deal + giesstage.length * PUNKTE.giesstag;
  const letzterGiesstag = giesstage.at(-1) ?? MONSTERA_START;
  const durst = verpassteWerktage(letzterGiesstag, heute);
  return {
    blaetter: Math.min(MAX_BLAETTER, 1 + Math.floor(punkte / PUNKTE_JE_BLATT)),
    punkte,
    bisBlatt: PUNKTE_JE_BLATT - (punkte % PUNKTE_JE_BLATT),
    durst,
    zustand: zustandBei(durst),
    letzterGiesstag,
    heuteGegossen: [...new Set(eintraege.filter((e) => e.datum === heute).map((e) => e.von))],
    quellen: { leads, deals: gewonnen, giesstage: giesstage.length },
  };
}

/** Growth stage for the card title, by number of leaves. */
export function wuchsform(blaetter: number): string {
  if (blaetter <= 3) return 'Steckling';
  if (blaetter <= 8) return 'Jungpflanze';
  if (blaetter <= 16) return 'Mit Schlitzen';
  return blaetter >= MAX_BLAETTER ? 'Prachtexemplar' : 'Ausgewachsen';
}
