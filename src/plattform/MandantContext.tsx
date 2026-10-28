import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, instanzModus, instanzName, isDemo, mandantenModus, offenerLogin } from '../config';
import type { InstanzSicht } from '../data/instanz';
import type { MandantSicht } from '../data/plattform';
import { InstanzApi, MandantApi } from './api';

interface MandantContextValue {
  /** Set in the tenants' hub once /ich answered; null in Velonify's own hub. */
  sicht: MandantSicht | null;
  api: MandantApi;
  /** Set in an own instance once /instanz/ich answered: name, role and tools. */
  instanz: InstanzSicht | null;
  instanzApi: InstanzApi;
  /** Takes the answer of a settings change without another round trip. */
  setzeInstanz(sicht: InstanzSicht): void;
  neuLaden(): Promise<void>;
  /** Whether a tool shows up: tenants get what their package and switches allow, Velonify everything but the Lead-Markt. */
  erlaubt(werkzeug: string): boolean;
  istAdmin: boolean;
  /** The trial terms dialog: open on arrival, closable with "Später", reopened when someone unlocks a lead. */
  bedingungenOffen: boolean;
  zeigeBedingungen(offen: boolean): void;
}

const MandantContext = createContext<MandantContextValue | null>(null);

/** Tools only Velonify's admins see, and tools only tenants see. */
const NUR_ADMINS = ['plattform'];
const NUR_MANDANTEN = ['leadmarkt'];
/** Tools of the creator profile: only in own instances (src/data/instanz.ts). */
const NUR_INSTANZEN = ['kalender', 'content', 'analytics', 'kooperationen', 'einnahmen', 'ablage'];

export function MandantProvider({ children }: { children: ReactNode }) {
  const { getToken, userEmail, signOut } = useAuth();
  const api = useMemo(() => new MandantApi(getToken), [getToken]);
  const instanzApi = useMemo(() => new InstanzApi(getToken), [getToken]);
  const [sicht, setSicht] = useState<MandantSicht | null>(null);
  const [instanz, setInstanz] = useState<InstanzSicht | null>(null);
  const [fehler, setFehler] = useState<{ text: string; status?: number } | null>(null);
  const [bedingungenOffen, zeigeBedingungen] = useState(true);

  const neuLaden = useCallback(async () => {
    if (!offenerLogin) return;
    try {
      if (instanzModus) setInstanz(await instanzApi.ich());
      else setSicht(await api.ich());
      setFehler(null);
    } catch (err) {
      setFehler({ text: err instanceof Error ? err.message : String(err), status: (err as { status?: number }).status });
    }
  }, [api, instanzApi]);

  useEffect(() => {
    void neuLaden();
    if (!offenerLogin) return;
    // Days left and quota stay current while the tab is open.
    const takt = window.setInterval(() => void neuLaden(), 10 * 60 * 1000);
    return () => window.clearInterval(takt);
  }, [neuLaden]);

  const istAdmin = !offenerLogin && !isDemo && config.admins.includes(userEmail().toLowerCase());
  const erlaubt = useCallback(
    (werkzeug: string) => {
      if (instanzModus) return instanz?.werkzeuge.includes(werkzeug) ?? false;
      if (mandantenModus) return sicht?.werkzeuge.includes(werkzeug) ?? false;
      if (NUR_MANDANTEN.includes(werkzeug) || NUR_INSTANZEN.includes(werkzeug)) return false;
      if (NUR_ADMINS.includes(werkzeug)) return istAdmin;
      return true;
    },
    [sicht, instanz, istAdmin],
  );
  const value = useMemo(
    () => ({ sicht, api, instanz, instanzApi, setzeInstanz: setInstanz, neuLaden, erlaubt, istAdmin, bedingungenOffen, zeigeBedingungen }),
    [sicht, api, instanz, instanzApi, neuLaden, erlaubt, istAdmin, bedingungenOffen],
  );

  if ((mandantenModus && !sicht) || (instanzModus && !instanz)) {
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

/** Brand at the top left: "Velonify" in our hub, "<tenant> Hub" in a tenant's, "<name> HUB" (by Velonify) in an own instance. */
export function useMarke(): string {
  const { sicht, instanz } = useMandant();
  if (instanzModus) return `${instanz?.name || instanzName || 'Velonify'} HUB`;
  return mandantenModus ? `${sicht?.mandant.name ?? 'Velonify'} Hub` : 'Velonify';
}

export function useMandant(): MandantContextValue {
  const context = useContext(MandantContext);
  if (!context) throw new Error('useMandant must be used inside MandantProvider');
  return context;
}
