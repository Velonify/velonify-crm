import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR, type TourStand } from './tourSchritte';

interface Props {
  stand: TourStand;
  /** Id of the demo's main client, for the client steps. */
  kunde: string | null;
  kundenansichtOffen: boolean;
  onStand(stand: TourStand): void;
  onKundenansicht(offen: boolean): void;
}

/** „Ein Tag in der Agentur“: a small card that walks through the hub page by page; hidden with one click. */
export function Tour({ stand, kunde, kundenansichtOffen, onStand, onKundenansicht }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const titelId = useId();
  const karte = useRef<HTMLElement>(null);
  const schritt = stand.schritt >= 0 ? TOUR[stand.schritt] : null;

  const geheZu = (index: number) => {
    const ziel = TOUR[index];
    onStand({ schritt: index, sichtbar: true });
    navigate(ziel.pfad(kunde));
    onKundenansicht(!!ziel.kundenansicht);
  };

  // Keyboard users land on the new step.
  useEffect(() => {
    karte.current?.querySelector<HTMLElement>('.demo-tour-weiter')?.focus({ preventScroll: true });
  }, [stand.schritt]);

  const ausblenden = () => {
    onStand({ ...stand, sichtbar: false });
  };

  const hierNicht = schritt && !schritt.kundenansicht && pathname !== schritt.pfad(kunde);

  return createPortal(
    <aside ref={karte} className="demo-tour glass" aria-labelledby={titelId}>
      <header className="demo-tour-kopf">
        <span className="demo-tour-marke">Ein Tag in der Agentur{schritt && ` · ${stand.schritt + 1} von ${TOUR.length}`}</span>
        <button type="button" className="demo-tour-zu" onClick={ausblenden} aria-label="Tour ausblenden" title="Ausblenden (über die Demo-Leiste wieder öffnen)">
          ×
        </button>
      </header>
      {schritt ? (
        <>
          <ol className="demo-tour-punkte" aria-hidden="true">
            {TOUR.map((s, i) => (
              <li key={s.titel} className={i < stand.schritt ? 'is-fertig' : i === stand.schritt ? 'is-jetzt' : ''} />
            ))}
          </ol>
          <h2 id={titelId}>{schritt.titel}</h2>
          <p>{schritt.text}</p>
          <p className="demo-tour-tipp">
            <strong>Probier’s aus:</strong> {schritt.tipp}
          </p>
          <footer className="demo-tour-fuss">
            {stand.schritt > 0 && (
              <button type="button" className="button small" onClick={() => geheZu(stand.schritt - 1)}>
                Zurück
              </button>
            )}
            {hierNicht && (
              <button type="button" className="button small" onClick={() => geheZu(stand.schritt)}>
                Zur Seite
              </button>
            )}
            {schritt.kundenansicht && !kundenansichtOffen && (
              <button type="button" className="button small" onClick={() => onKundenansicht(true)}>
                Portal öffnen
              </button>
            )}
            <span className="demo-tour-luecke" />
            {stand.schritt < TOUR.length - 1 ? (
              <button type="button" className="button small primary demo-tour-weiter" onClick={() => geheZu(stand.schritt + 1)}>
                Weiter: {TOUR[stand.schritt + 1].titel}
              </button>
            ) : (
              <button
                type="button"
                className="button small primary demo-tour-weiter"
                onClick={() => {
                  onKundenansicht(false);
                  onStand({ schritt: -1, sichtbar: false });
                }}
              >
                Tour beenden
              </button>
            )}
          </footer>
        </>
      ) : (
        <>
          <h2 id={titelId}>Vom ersten Lead bis ins Kundenportal</h2>
          <p>In sieben Schritten durch einen Tag der Agentur, etwa drei Minuten. Du kannst unterwegs alles anklicken und ausprobieren.</p>
          <footer className="demo-tour-fuss">
            <button type="button" className="button small" onClick={ausblenden}>
              Selbst umsehen
            </button>
            <span className="demo-tour-luecke" />
            <button type="button" className="button small primary demo-tour-weiter" onClick={() => geheZu(0)}>
              Tour starten
            </button>
          </footer>
        </>
      )}
    </aside>,
    document.body,
  );
}
