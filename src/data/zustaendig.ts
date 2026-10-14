/**
 * Several people can be responsible for a firm, deal, follow-up or card. They are stored comma-separated in the
 * existing `zustaendig` columns ("Lugge, Julian"), so old single names stay valid and the sheet stays readable.
 */

export const TRENNER = ', ';

/** The names in a `zustaendig` value, without blanks and duplicates. */
export function personen(wert: string | null | undefined): string[] {
  return [...new Set((wert ?? '').split(/[,;]/).map((n) => n.trim()).filter(Boolean))];
}

export const zustaendigWert = (namen: readonly string[]) => personen(namen.join(',')).join(TRENNER);

/** Cleans a value typed or picked in a form. */
export const normalisiereZustaendig = (wert: string) => zustaendigWert(personen(wert));

export const istZustaendig = (wert: string | null | undefined, name: string | null | undefined) => Boolean(name) && personen(wert).includes(name!.trim());

/** Adds a person, keeping everyone already responsible. */
export const mitPerson = (wert: string, name: string) => zustaendigWert([...personen(wert), name]);

export const ohnePerson = (wert: string, name: string) => zustaendigWert(personen(wert).filter((n) => n !== name));

/** Short form for tight spots: initials of every person, e.g. "LU JU". */
export const kuerzelVon = (wert: string) => personen(wert).map((n) => n.slice(0, 2));
