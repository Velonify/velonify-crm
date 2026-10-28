import { ImBau } from '../ImBau';

/** Public pages of the module Kooperationen (no login): request form, live media kit, report for a partner. */
export function AnfrageSeite() {
  return <ImBau titel="Kooperationsanfrage" punkt="Anfrageformular (Punkt 23)" />;
}

export function MediakitSeite() {
  return <ImBau titel="Mediakit" punkt="Live-Mediakit (Punkt 24)" />;
}

export function BerichtSeite({ schluessel }: { schluessel: string }) {
  return <ImBau titel="Kampagnenbericht" punkt={`Partner-Reporting (Punkt 25), Link ${schluessel}`} />;
}
