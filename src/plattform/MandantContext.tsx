import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo, mandantenModus } from '../config';
import type { MandantSicht } from '../data/plattform';
import { MandantApi } from './api';

interface MandantContextValue {
  /** Set in the tenants' hub once /ich answered; null in Velonify's own hub. */
  sicht: MandantSicht | null;
  api: MandantApi;
  neuLaden(): Promise<void>;
  /** Whether a tool shows up: tenants get what their package and switches allow, Velonify everything but the Lead-Markt. */
  erlaubt(werkzeug: string): boolean;
  istAdmin: boolean;
}

const MandantContext = createContext<MandantContextValue | null>(null);

/** Tools only Velonify's admins see, and tools only tenants see. */
const NUR_ADMINS = ['plattform'];
const NUR_MANDANTEN = ['leadmarkt'];

export function MandantProvider({ children }: { children: ReactNode }) {
  const { getToken, userEmail, signOut } = useAuth();
  const api = useMemo(() => new MandantApi(getToken), [getToken]);
  const [sicht, setSicht] = useState<MandantSicht | null>(null);
  const [fehler, setFehler] = useState<{ text: string; status?: number } | null>(null);

  const neuLaden = useCallback(async () => {
    if (!mandantenModus) return;
    try {
      setSicht(await api.ich());
      setFehler(null);
    } catch (err) {
      setFehler({ text: err instanceof Error ? err.message : String(err), status: (err as { status?: number }).status });
    }
  }, [api]);

  useEffect(() => {
    void neuLaden();
    if (!mandantenModus) return;
    // Days left and quota stay current while the tab is open.
    const takt = window.setInterval(() => void neuLaden(), 10 * 60 * 1000);
    return () => window.clearInterval(takt);
  }, [neuLaden]);

  const istAdmin = !mandantenModus && !isDemo && config.admins.includes(userEmail().toLowerCase());
  const erlaubt = useCallback(
    (werkzeug: string) => {
      if (mandantenModus) return sicht?.werkzeuge.includes(werkzeug) ?? false;
      if (NUR_MANDANTEN.includes(werkzeug)) return false;
      if (NUR_ADMINS.includes(werkzeug)) return istAdmin;
      return true;
    },
    [sicht, istAdmin],
  );
  const value = useMemo(() => ({ sicht, api, neuLaden, erlaubt, istAdmin }), [sicht, api, neuLaden, erlaubt, istAdmin]);

  if (mandantenModus && !sicht) {
    return (
      <div className="login">
        <main className="login-main">
          <div className="login-card">
            {fehler ? (
              <>
                <h1>{fehler.status === 403 ? 'Kein Zugang' : 'Der Hub ist gerade nicht erreichbar'}</h1>
                <p className="lead-text">{fehler.text}</p>
                <div className="form-actions">
                  <button type="button" className="button" onClick={() => void neuLaden()}>
                    Erneut versuchen
                  </button>
                  <button type="button" className="button primary" onClick={signOut}>
                    Mit anderem Konto anmelden
                  </button>
                </div>
              </>
            ) : (
              <p className="lead-text">Hub wird geladen …</p>
            )}
          </div>
        </main>
      </div>
    );
  }
  return <MandantContext.Provider value={value}>{children}</MandantContext.Provider>;
}

export function useMandant(): MandantContextValue {
  const context = useContext(MandantContext);
  if (!context) throw new Error('useMandant must be used inside MandantProvider');
  return context;
}
