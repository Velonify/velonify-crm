import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { istLeadArt, parseTags, sortiereTags, type TagFilterWert } from '../data/tags';

/** Chips shown before "Alle Tags"; chosen tags always show. */
const SICHTBAR = 12;

/** Tag filter in the URL (`tag=SEO-Lead,Gebiet Dortmund`, `tag_modus=ohne`), so a filtered view can be shared. */
export function useTagFilter(onChange?: () => void) {
  const [params, setParams] = useSearchParams();
  const roh = params.get('tag') ?? '';
  const ausblenden = params.get('tag_modus') === 'ohne';
  const wert = useMemo<TagFilterWert>(() => ({ wahl: new Set(parseTags(roh)), ausblenden }), [roh, ausblenden]);
  const setze = (neu: TagFilterWert) => {
    setParams(
      (alt) => {
        const next = new URLSearchParams(alt);
        if (neu.wahl.size) next.set('tag', [...neu.wahl].join(','));
        else next.delete('tag');
        if (neu.ausblenden) next.set('tag_modus', 'ohne');
        else next.delete('tag_modus');
        return next;
      },
      { replace: true },
    );
    onChange?.();
  };
  return { wert, setze };
}

interface Props {
  wert: TagFilterWert;
  setze(wert: TagFilterWert): void;
  /** Items per tag; chips only show for tags that occur (or are chosen). */
  zahlen: Record<string, number>;
}

/** Chips for the firms' tags: several chosen tags must all match, or are hidden together. */
export function TagFilter({ wert, setze, zahlen }: Props) {
  const [alle, setAlle] = useState(false);
  const gewaehlt = (tag: string) => [...wert.wahl].some((t) => t.toLocaleLowerCase('de') === tag.toLocaleLowerCase('de'));
  const umschalten = (tag: string) => {
    const wahl = new Set([...wert.wahl].filter((t) => t.toLocaleLowerCase('de') !== tag.toLocaleLowerCase('de')));
    if (!gewaehlt(tag)) wahl.add(tag);
    setze({ ...wert, wahl });
  };
  const tags = sortiereTags(zahlen);
  const fehlend = [...wert.wahl].filter((t) => !tags.some((x) => x.toLocaleLowerCase('de') === t.toLocaleLowerCase('de')));
  const reihe = [...tags, ...fehlend];
  if (reihe.length === 0) return null;
  const sichtbar = alle ? reihe : reihe.filter((t, i) => i < SICHTBAR || gewaehlt(t));

  return (
    <div className="branchen-filter tag-filter" role="group" aria-label="Tags">
      <select value={wert.ausblenden ? 'ohne' : ''} onChange={(e) => setze({ ...wert, ausblenden: e.target.value === 'ohne' })} aria-label="Gewählte Tags verlangen oder ausblenden">
        <option value="">Mit allen diesen Tags</option>
        <option value="ohne">Ohne diese Tags</option>
      </select>
      <div className="chips">
        {sichtbar.map((tag) => {
          const aktiv = gewaehlt(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={aktiv}
              className={`chip${istLeadArt(tag) ? ' is-lead-art' : ''}${aktiv ? ' is-active' : ''}${aktiv && wert.ausblenden ? ' is-aus' : ''}`}
              onClick={() => umschalten(tag)}
            >
              #{tag} ({(zahlen[tag] ?? 0).toLocaleString('de-DE')})
            </button>
          );
        })}
        {reihe.length > SICHTBAR && (
          <button type="button" className="link-button small" onClick={() => setAlle((a) => !a)}>
            {alle ? 'Weniger Tags' : `Alle ${reihe.length.toLocaleString('de-DE')} Tags`}
          </button>
        )}
        {wert.wahl.size > 0 && (
          <button type="button" className="link-button small" onClick={() => setze({ wahl: new Set(), ausblenden: false })}>
            Tags zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}

/** A firm's tags as small labels, lead kinds first. */
export function TagListe({ tags, max }: { tags: string; max?: number }) {
  const liste = parseTags(tags).sort((a, b) => Number(istLeadArt(b)) - Number(istLeadArt(a)));
  if (liste.length === 0) return null;
  const zeigen = max ? liste.slice(0, max) : liste;
  return (
    <span className="firmen-tags">
      {zeigen.map((t) => (
        <span key={t} className={`firmen-tag${istLeadArt(t) ? ' is-lead-art' : ''}`}>
          {t}
        </span>
      ))}
      {liste.length > zeigen.length && <span className="firmen-tag muted">+{liste.length - zeigen.length}</span>}
    </span>
  );
}
