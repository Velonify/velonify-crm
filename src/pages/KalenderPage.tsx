import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { TerminDialog } from '../components/dialogs/TerminDialog';
import { TerminEintrag, useTermine } from '../components/Termine';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { addDays, isIsoDate, isoDate } from '../data/ids';
import type { CalendarEvent } from '../data/google/calendar';
import { bekannteKollegen, googleKalenderUrl, tagesBeginn, termineJeTag, wocheText, wochenStart, wochenTage } from '../data/kalender';

const wochentag = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const kurzDatum = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });

export function KalenderPage() {
  const { db, error: crmError, refresh } = useCrm();
  const [params, setParams] = useSearchParams();
  const heute = isoDate(new Date());
  const woche = params.get('woche');
  const start = wochenStart(woche && isIsoDate(woche) ? woche : heute);
  const tage = useMemo(() => wochenTage(start), [start]);
  const termine = useTermine(tagesBeginn(start), tagesBeginn(addDays(start, 7)));
  const [jetzt, setJetzt] = useState(() => new Date());
  const { userEmail } = useAuth();
  const [dialog, setDialog] = useState<{ termin?: CalendarEvent; tag?: string } | null>(null);

  // Keeps "past" markers and Meet links current while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setJetzt(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const jeTag = useMemo(() => termineJeTag(termine.data ?? [], tage), [termine.data, tage]);
  const kollegen = useMemo(() => (db ? bekannteKollegen(db, termine.data ?? [], userEmail()) : []), [db, termine.data, userEmail]);
  const zuWoche = (tag: string) => setParams(tag === wochenStart(heute) ? {} : { woche: tag });

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Home"
        title="Kalender"
        subtitle={`${wocheText(start)} · dein Google Kalender`}
        actions={
          <>
            <div className="segmented" role="group" aria-label="Woche wechseln">
              <button type="button" onClick={() => zuWoche(addDays(start, -7))} aria-label="Vorige Woche">
                ←
              </button>
              <button type="button" onClick={() => zuWoche(wochenStart(heute))} className={start === wochenStart(heute) ? 'is-active' : ''}>
                Heute
              </button>
              <button type="button" onClick={() => zuWoche(addDays(start, 7))} aria-label="Nächste Woche">
                →
              </button>
            </div>
            <button type="button" className="button small primary" onClick={() => setDialog({ tag: heute >= start && heute < addDays(start, 7) ? heute : start })}>
              Neuer Termin
            </button>
            <button type="button" className="button small" onClick={termine.reload} disabled={termine.loading}>
              {termine.loading ? 'Lädt …' : 'Aktualisieren'}
            </button>
            {!isDemo && (
              <a className="button small" href={googleKalenderUrl(start)} target="_blank" rel="noreferrer noopener">
                Google Kalender ↗
              </a>
            )}
          </>
        }
      />
      {crmError && <ErrorBox error={crmError} onRetry={refresh} />}
      {termine.error && <ErrorBox error={termine.error} onRetry={termine.reload} />}
      {!db || (termine.loading && !termine.data) ? (
        <Loading label="Termine werden geladen …" />
      ) : (
        <div className="kalender-woche">
          {tage.map((tag) => {
            const liste = jeTag.get(tag) ?? [];
            const datum = new Date(`${tag}T00:00:00`);
            return (
              <section key={tag} className={`kalender-tag${tag === heute ? ' is-heute' : ''}${tag < heute ? ' is-vergangen' : ''}${liste.length === 0 ? ' is-leer' : ''}`} aria-label={datum.toLocaleDateString('de-DE', { dateStyle: 'full' })}>
                <header className="kalender-tag-kopf">
                  <span>{wochentag.format(datum)}</span>
                  <strong>{kurzDatum.format(datum)}</strong>
                </header>
                {liste.length === 0 ? (
                  <p className="muted small kalender-leer">Keine Termine</p>
                ) : (
                  liste.map((event) => (
                    <TerminEintrag key={`${event.id}-${tag}`} event={event} tag={tag} db={db} jetzt={jetzt} onBearbeiten={(termin) => setDialog({ termin })} />
                  ))
                )}
                {/* The free space below the appointments adds a new one on this day. */}
                <button type="button" className="kalender-neu" onClick={() => setDialog({ tag })} aria-label={`Neuer Termin am ${datum.toLocaleDateString('de-DE', { dateStyle: 'long' })}`}>
                  + Termin
                </button>
              </section>
            );
          })}
        </div>
      )}
      {dialog && <TerminDialog termin={dialog.termin} tag={dialog.tag} kollegen={kollegen} onClose={() => setDialog(null)} onGespeichert={termine.reload} />}
    </div>
  );
}
