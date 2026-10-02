/**
 * Industries of shops and firms. The ids are shared with the lead finder (BRANCHEN in
 * functions/shop-audit/src/leads/branche.ts) and stored as they are in the firm column "branche" – change both sides.
 */
export const BRANCHEN: { id: string; label: string }[] = [
  { id: 'mode', label: 'Mode & Bekleidung' },
  { id: 'schmuck', label: 'Schmuck & Uhren' },
  { id: 'beauty', label: 'Beauty & Pflege' },
  { id: 'gesundheit', label: 'Gesundheit & Apotheke' },
  { id: 'lebensmittel', label: 'Lebensmittel & Getränke' },
  { id: 'wohnen', label: 'Möbel & Wohnen' },
  { id: 'garten', label: 'Haus, Garten & Baumarkt' },
  { id: 'technik', label: 'Elektronik & Technik' },
  { id: 'sport', label: 'Sport & Outdoor' },
  { id: 'fahrzeuge', label: 'Auto, Motorrad & Fahrrad' },
  { id: 'kinder', label: 'Baby, Kinder & Spielzeug' },
  { id: 'tiere', label: 'Tierbedarf' },
  { id: 'hobby', label: 'Hobby, Medien & Geschenke' },
  { id: 'b2b', label: 'Industrie & B2B' },
  { id: 'sonstige', label: 'Sonstiges' },
];

export const istBranche = (id: string) => BRANCHEN.some((b) => b.id === id);
export const brancheLabel = (id: string | null | undefined) => (id ? (BRANCHEN.find((b) => b.id === id)?.label ?? id) : '');

/** Filter state of the industry chips: several ids, either shown alone or hidden. */
export interface BranchenFilterWert {
  wahl: ReadonlySet<string>;
  ausblenden: boolean;
}

/** Whether an item with this industry passes the filter; without a choice everything does. */
export const passtBranche = (f: BranchenFilterWert, branche: string | null | undefined) =>
  f.wahl.size === 0 || f.wahl.has(branche ?? '') !== f.ausblenden;

/** How many items per industry, for the counts on the chips. */
export function zahlJeBranche(branchen: (string | null | undefined)[]): Record<string, number> {
  const je: Record<string, number> = {};
  for (const b of branchen) if (b) je[b] = (je[b] ?? 0) + 1;
  return je;
}
