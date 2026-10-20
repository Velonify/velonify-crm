/**
 * Free tags of a firm, stored comma-separated in the column "tags" (e.g. "SEO-Lead, Gebiet Dortmund, Zahnarzt").
 * Tags mark what kind of lead a firm is and where it belongs; the filter above firms and pipeline combines them.
 */
export const TAG_TRENNER = ',';

/** Tags of a firm in their saved order, trimmed, without empty or repeated ones (case does not matter). */
export function parseTags(roh: string | null | undefined): string[] {
  const gesehen = new Set<string>();
  const tags: string[] = [];
  for (const teil of (roh ?? '').split(TAG_TRENNER)) {
    const tag = teil.trim().replace(/\s+/g, ' ');
    const key = tag.toLocaleLowerCase('de');
    if (!tag || gesehen.has(key)) continue;
    gesehen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** The stored form: tags joined by ", ". */
export const formatTags = (tags: string[]) => parseTags(tags.join(TAG_TRENNER)).join(`${TAG_TRENNER} `);

/** Adds tags to the existing ones without duplicates; the order of the existing tags stays. */
export const mitTags = (roh: string | null | undefined, neu: string[]) => formatTags([...parseTags(roh), ...neu]);

/** A tag that names the kind of lead ("SEO-Lead", "Shop-Lead"); shown more prominently. */
export const istLeadArt = (tag: string) => /-lead$/i.test(tag.trim());

/** Filter state: chosen tags, either all required or all hidden. */
export interface TagFilterWert {
  wahl: ReadonlySet<string>;
  ausblenden: boolean;
}

/**
 * Whether a firm passes the filter. Without a choice everything does. "Nur diese" needs every chosen tag,
 * so "SEO-Lead" + "Gebiet Dortmund" + "Zahnarzt" narrows down to one territory; "Ohne diese" hides a firm with any of them.
 */
export function passtTags(f: TagFilterWert, roh: string | null | undefined): boolean {
  if (f.wahl.size === 0) return true;
  const eigene = new Set(parseTags(roh).map((t) => t.toLocaleLowerCase('de')));
  const gewaehlt = [...f.wahl].map((t) => t.toLocaleLowerCase('de'));
  return f.ausblenden ? !gewaehlt.some((t) => eigene.has(t)) : gewaehlt.every((t) => eigene.has(t));
}

/** How many items carry each tag, for the counts on the chips; the spelling of the first occurrence wins. */
export function zahlJeTag(alle: (string | null | undefined)[]): Record<string, number> {
  const je: Record<string, number> = {};
  const schreibweise = new Map<string, string>();
  for (const roh of alle) {
    for (const tag of parseTags(roh)) {
      const key = tag.toLocaleLowerCase('de');
      const name = schreibweise.get(key) ?? schreibweise.set(key, tag).get(key)!;
      je[name] = (je[name] ?? 0) + 1;
    }
  }
  return je;
}

/** Chips order: lead kinds first, then by count, then alphabetically. */
export function sortiereTags(zahlen: Record<string, number>): string[] {
  return Object.keys(zahlen).sort(
    (a, b) => Number(istLeadArt(b)) - Number(istLeadArt(a)) || zahlen[b] - zahlen[a] || a.localeCompare(b, 'de'),
  );
}
