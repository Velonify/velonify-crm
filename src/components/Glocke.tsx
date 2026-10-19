import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrm } from '../data/CrmContext';
import { ART_LABEL, meine, ungelesene } from '../data/erwaehnungen';
import { findeTeamMitglied } from '../data/selectors';
import type { Erwaehnung } from '../data/types';
import { alsAppInstalliert, setzeAppBadge } from '../lib/appBadge';
import { formatDateTime, shortUser } from '../lib/format';
import { useIch } from '../lib/useIch';
import { MitErwaehnungen } from './Erwaehnungen';

// Mentions should arrive quickly, but one small table read per minute is plenty.
const NEU_LADEN_MS = 60_000;
const ANZAHL = 20;

/**
 * Bell with the @-mentions of the signed-in person: a counter of the unread ones and a list of the latest.
 * Clicking one opens the place it was written and marks it as read.
 * In the installed desktop app the unread count also sits on the Dock icon.
 */
export function Glocke() {
  const { service, db } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const navigate = useNavigate();
  const [alle, setAlle] = useState<Erwaehnung[] | null>(null);
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);

  const laden = useCallback(async () => {
    if (!service) return;
    try {
      setAlle(await service.loadErwaehnungen());
    } catch {
      // Not set up yet (migration missing) or offline: the bell simply stays away.
      setAlle(null);
    }
  }, [service]);

  useEffect(() => {
    if (ich) void laden();
  }, [ich, laden]);

  useEffect(() => {
    // Background tabs do not poll; coming back to the tab reads once right away.
    // The installed app keeps polling while hidden, so the Dock badge stays current.
    const sichtbar = () => (document.visibilityState === 'visible' || alsAppInstalliert()) && void laden();
    const timer = window.setInterval(sichtbar, NEU_LADEN_MS);
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [laden]);

  useEffect(() => {
    if (!offen) return;
    const draussen = (e: MouseEvent) => !huelle.current?.contains(e.target as Node) && setOffen(false);
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && setOffen(false);
    document.addEventListener('mousedown', draussen);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('mousedown', draussen);
      document.removeEventListener('keydown', taste);
    };
  }, [offen]);

  const ungelesen = alle && ich ? ungelesene(alle, ich).length : 0;
  useEffect(() => setzeAppBadge(ungelesen), [ungelesen]);
  useEffect(() => () => setzeAppBadge(0), []);

  if (!alle || !ich) return null;
  const liste = meine(alle, ich).slice(0, ANZAHL);
  const neu = ungelesene(alle, ich);

  const gelesen = async (ids: string[]) => {
    if (!service || ids.length === 0) return;
    const jetzt = new Date().toISOString();
    setAlle((a) => a && a.map((e) => (ids.includes(e.id) && !e.gelesen_am ? { ...e, gelesen_am: jetzt } : e)));
    try {
      await service.markiereGelesen(ids);
    } catch {
      void laden();
    }
  };

  const oeffnen = (e: Erwaehnung) => {
    setOffen(false);
    void gelesen([e.id]);
    navigate(e.link);
  };

  const autor = (von: string) => findeTeamMitglied(team, '', von) ?? shortUser(von);

  return (
    <div className="glocke" ref={huelle}>
      <button
        type="button"
        className={`glocke-knopf${neu.length > 0 ? ' hat-neue' : ''}`}
        onClick={() => {
          setOffen((o) => !o);
          if (!offen) void laden();
        }}
        aria-expanded={offen}
        aria-haspopup="dialog"
        aria-label={neu.length > 0 ? `Erwähnungen, ${neu.length} ungelesen` : 'Erwähnungen'}
        title="Erwähnungen"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
          <path d="M5 8a5 5 0 0 1 10 0v4l2 3H3l2-3zM8 17.5h4" />
        </svg>
        {neu.length > 0 && <span className="glocke-zahl">{neu.length > 9 ? '9+' : neu.length}</span>}
      </button>
      {offen && (
        <div className="glocke-panel" role="dialog" aria-label="Erwähnungen">
          <div className="glocke-kopf">
            <strong>Erwähnungen</strong>
            {neu.length > 0 && (
              <button type="button" className="link-button" onClick={() => void gelesen(neu.map((e) => e.id))}>
                Alle als gelesen markieren
              </button>
            )}
          </div>
          {liste.length === 0 ? (
            <p className="glocke-leer">
              Noch keine Erwähnungen. Schreib <strong>@Name</strong> in einen Kommentar, eine Karte oder eine Notiz, um jemanden aus dem Team zu markieren.
            </p>
          ) : (
            <ul className="glocke-liste">
              {liste.map((e) => (
                <li key={e.id}>
                  <button type="button" className={`glocke-eintrag${e.gelesen_am ? '' : ' is-neu'}`} onClick={() => oeffnen(e)}>
                    <span className="glocke-meta">
                      <strong>{autor(e.von)}</strong> · {ART_LABEL[e.art] ?? e.art} · {formatDateTime(e.datum)}
                    </span>
                    <span className="glocke-titel">{e.titel}</span>
                    <span className="glocke-auszug">
                      <MitErwaehnungen text={e.auszug} team={team} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
