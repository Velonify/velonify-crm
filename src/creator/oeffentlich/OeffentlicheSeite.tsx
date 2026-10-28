import { useEffect, useState } from 'react';
import { VerbundenSeite } from '../analytics/oeffentlich';
import { AnfrageSeite, BerichtSeite, MediakitSeite } from '../kooperationen/oeffentlich';
import { DatenschutzSeite, ImpressumSeite, NutzungsbedingungenSeite } from '../start/recht';

/** Hash of a public page of an instance: #/oeffentlich/<seite>[/<schluessel>]. */
export const oeffentlicherPfad = () => /^#\/oeffentlich\/([a-z-]+)(?:\/([^/?#]+))?/.exec(window.location.hash);

/**
 * Pages of an instance that work without login (App.tsx renders them before the login check): the request form for brands,
 * the live media kit, a campaign report for a partner, and the page after connecting a channel.
 */
export function OeffentlicheSeite() {
  const [treffer, setTreffer] = useState(oeffentlicherPfad);
  useEffect(() => {
    const neu = () => setTreffer(oeffentlicherPfad());
    window.addEventListener('hashchange', neu);
    return () => window.removeEventListener('hashchange', neu);
  }, []);
  switch (treffer?.[1]) {
    case 'anfrage':
      return <AnfrageSeite />;
    case 'mediakit':
      return <MediakitSeite />;
    case 'bericht':
      return <BerichtSeite schluessel={treffer[2] ?? ''} />;
    case 'kanal-verbunden':
      return <VerbundenSeite />;
    case 'datenschutz':
      return <DatenschutzSeite />;
    case 'impressum':
      return <ImpressumSeite />;
    case 'nutzungsbedingungen':
      return <NutzungsbedingungenSeite />;
    default:
      return (
        <div className="page narrow">
          <p className="lead-text">Diese Seite gibt es nicht.</p>
        </div>
      );
  }
}
