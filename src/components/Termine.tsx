import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import type { CalendarEvent } from '../data/google/calendar';
import { firmaFuerTermin, istVorbei, zeitText } from '../data/kalender';
import type { Database } from '../data/types';
import { useLoad } from '../lib/useLoad';

/** Events of the signed-in person's primary calendar between two ISO timestamps. */
export function useTermine(von: string, bis: string) {
  const { service } = useCrm();
  return useLoad(() => (service ? service.termine(von, bis) : new Promise<CalendarEvent[]>(() => {})), [service, von, bis]);
}

export function TerminEintrag({ event, tag, db, jetzt, kompakt = false }: { event: CalendarEvent; tag: string; db: Database; jetzt: Date; kompakt?: boolean }) {
  const { userEmail } = useAuth();
  const firma = firmaFuerTermin(db, event, userEmail());
  const klassen = ['termin', event.ganztaegig && 'is-ganztaegig', istVorbei(event, jetzt) && 'is-vorbei', event.antwort === 'declined' && 'is-abgelehnt']
    .filter(Boolean)
    .join(' ');
  // Links into Google are simulated in demo mode.
  const link = isDemo ? undefined : event.link;

  return (
    <div className={klassen}>
      <div className="termin-zeit">
        {zeitText(event, tag)}
        {event.antwort === 'tentative' && ' · vielleicht'}
        {event.antwort === 'needsAction' && ' · offen'}
      </div>
      <div className="termin-titel">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer noopener">
            {event.titel}
          </a>
        ) : (
          event.titel
        )}
      </div>
      {(firma || event.meetLink || (event.ort && !kompakt)) && (
        <div className="termin-meta">
          {firma && <Link to={`/crm/firmen/${firma.id}`}>{firma.kuerzel || firma.name}</Link>}
          {event.meetLink && !istVorbei(event, jetzt) && (
            <a href={isDemo ? undefined : event.meetLink} target="_blank" rel="noreferrer noopener" className="termin-meet">
              Meet ↗
            </a>
          )}
          {event.ort && !kompakt && <span className="muted">{event.ort}</span>}
        </div>
      )}
    </div>
  );
}
