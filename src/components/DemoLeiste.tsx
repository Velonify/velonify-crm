import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrm } from '../data/CrmContext';
import { AGENTUR, DEMO_TEAM } from '../data/demo/agentur';
import { DEMO_EINSTELLUNGEN, demoZuruecksetzen } from '../data/demo/speicher';
import { useIch } from '../lib/useIch';
import { beiKundenansicht, gemerkt, HAUPTKUNDE, merke, oeffneKundenansicht, rolleGewaehlt, ROLLEN, type DemoRolle, type KundenansichtZiel } from './demo/demo';
import { Kundenansicht } from './demo/Kundenansicht';
import { Rollenwahl } from './demo/Rollenwahl';
import { Tour } from './demo/Tour';
import { liesTourStand, TOUR_START, type TourStand } from './demo/tourSchritte';

/**
 * Bar on top of the public demo: whose hub this is (an invented agency), whose view you see, the guided tour,
 * the client's view of the portal and a way back to fresh sample data. Loaded only in demo mode.
 */
export function DemoLeiste() {
  const { db } = useCrm();
  const navigate = useNavigate();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);
  const [rolleDa, setRolleDa] = useState(rolleGewaehlt);
  const [tour, setTour] = useState<TourStand>(() => liesTourStand(gemerkt(DEMO_EINSTELLUNGEN.tour)) ?? { ...TOUR_START, sichtbar: false });
  const [ansicht, setAnsicht] = useState<KundenansichtZiel | null>(null);
  const kunde = db?.firmen.find((f) => f.name === HAUPTKUNDE && !f.archiviert)?.id ?? null;

  useEffect(() => beiKundenansicht(setAnsicht), []);

  const neueTour = useCallback((stand: TourStand) => {
    setTour(stand);
    merke(DEMO_EINSTELLUNGEN.tour, JSON.stringify(stand));
  }, []);

  const waehle = (rolle: DemoRolle) => {
    setIch(rolle.person.name);
    merke(DEMO_EINSTELLUNGEN.rolle, rolle.id);
    setRolleDa(true);
    navigate(rolle.start);
    neueTour(TOUR_START);
  };

  const wechsle = (name: string) => {
    setIch(name);
    merke(DEMO_EINSTELLUNGEN.rolle, ROLLEN.find((r) => r.person.name === name)?.id ?? name);
  };

  const zuruecksetzen = () => {
    if (window.confirm('Alles, was du in der Demo angelegt oder geändert hast, wird gelöscht und die Beispieldaten starten neu. Zurücksetzen?')) void demoZuruecksetzen();
  };

  const schliesseAnsicht = useCallback(() => setAnsicht(null), []);

  return (
    <>
      <div className="demo-banner demo-leiste" role="region" aria-label="Demo">
        <span>
          <strong>Demo</strong> · {AGENTUR.name} ist eine erfundene Agentur, alle Firmen und Zahlen sind Beispiele. Mails, Drive und Kalender sind simuliert. Dein Stand
          bleibt in diesem Browser.
        </span>
        <span className="demo-leiste-aktionen">
          {team.length > 0 && (
            <label>
              Rolle{' '}
              <select value={ich ?? ''} onChange={(e) => wechsle(e.target.value)}>
                {team.map((name) => {
                  const p = DEMO_TEAM.find((t) => t.name === name);
                  return (
                    <option key={name} value={name}>
                      {p ? `${p.rolle} · ${p.name} ${p.nachname}` : name}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {!tour.sichtbar && (
            <button type="button" className="link-button" onClick={() => neueTour({ ...tour, sichtbar: true })}>
              {tour.schritt >= 0 ? 'Tour fortsetzen' : 'Tour starten'}
            </button>
          )}
          <button type="button" className="link-button" onClick={() => oeffneKundenansicht()} disabled={!kunde}>
            Als Kunde ansehen
          </button>
          <button type="button" className="link-button" onClick={zuruecksetzen}>
            Demo zurücksetzen
          </button>
        </span>
      </div>

      {!rolleDa && <Rollenwahl onWahl={waehle} />}
      {rolleDa && tour.sichtbar && (
        <Tour
          stand={tour}
          kunde={kunde}
          kundenansichtOffen={!!ansicht}
          onStand={neueTour}
          onKundenansicht={(offen: boolean) => setAnsicht(offen ? { firmaId: kunde } : null)}
        />
      )}
      {ansicht && <Kundenansicht key={`${ansicht.firmaId}-${ansicht.reiter}`} firmaId={ansicht.firmaId} start={ansicht.reiter} onClose={schliesseAnsicht} />}
    </>
  );
}
