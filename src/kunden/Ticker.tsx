import { NEWS_ART_LABEL, type TickerEintrag } from '../data/kunden';
import { formatDate } from '../lib/format';
import { MitErwaehnungen } from '../components/Erwaehnungen';
import { useCrm } from '../data/CrmContext';

const artLabel = (e: TickerEintrag) => (e.art === 'datei' ? 'Datei' : e.art === 'erledigt' ? 'Erledigt' : NEWS_ART_LABEL[e.art]);

/**
 * Running news strip at the top of a client page. The list is rendered twice so the loop has no gap; with
 * reduced motion it stays still and scrolls sideways. Pauses on hover and while focused.
 */
export function TickerBand({ eintraege }: { eintraege: TickerEintrag[] }) {
  if (eintraege.length === 0) return null;
  const items = eintraege.slice(0, 8);
  // Roughly constant reading speed, independent of how many messages there are.
  const dauer = Math.max(24, items.reduce((n, e) => n + e.titel.length, 0) / 6);
  const liste = (kopie: boolean) => (
    <ul className="ticker-liste" aria-hidden={kopie || undefined}>
      {items.map((e) => (
        <li key={e.id} className={`ticker-item art-${e.art}`}>
          <span className="ticker-art">{artLabel(e)}</span>
          {e.url ? (
            <a href={e.url} target="_blank" rel="noreferrer noopener" tabIndex={kopie ? -1 : undefined}>
              {e.titel}
            </a>
          ) : (
            <span>{e.titel}</span>
          )}
          <span className="ticker-datum">{formatDate(e.datum)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="ticker" aria-label="News">
      <span className="ticker-label">News</span>
      <div className="ticker-fenster">
        <div className="ticker-spur" style={{ animationDuration: `${dauer}s` }}>
          {liste(false)}
          {liste(true)}
        </div>
      </div>
    </section>
  );
}

/** The same entries as a plain list, for cards and the news page. */
export function TickerListe({ eintraege, onBearbeiten, zeigeKunde }: { eintraege: TickerEintrag[]; onBearbeiten?: (e: TickerEintrag) => void; zeigeKunde?: (e: TickerEintrag) => string }) {
  const { db } = useCrm();
  return (
    <ul className="news-liste">
      {eintraege.map((e) => (
        <li key={e.id} className={`art-${e.art}${e.news?.archiviert ? ' is-archived' : ''}`}>
          <div className="news-kopf">
            <span className="ticker-art">{artLabel(e)}</span>
            {e.angeheftet && <span className="badge subtle">Angeheftet</span>}
            {e.alleKunden && <span className="badge subtle">Alle Kunden</span>}
            {zeigeKunde && !e.alleKunden && <span className="kuerzel">{zeigeKunde(e)}</span>}
            {e.news?.sichtbar_kunde && <span className="badge ok">Für Kunde sichtbar</span>}
            <span className="ticker-datum">{formatDate(e.datum)}</span>
          </div>
          {onBearbeiten && e.news ? (
            <button type="button" className="link-button news-titel" onClick={() => onBearbeiten(e)}>
              {e.titel}
            </button>
          ) : e.url ? (
            <a className="news-titel" href={e.url} target="_blank" rel="noreferrer noopener">
              {e.titel} ↗
            </a>
          ) : (
            <span className="news-titel">{e.titel}</span>
          )}
          {e.text && (
            <p className="news-text">
              <MitErwaehnungen text={e.text} team={db?.listen.team ?? []} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
