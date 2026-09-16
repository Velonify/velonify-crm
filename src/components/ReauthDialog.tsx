import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/** Shown over the app when the Google token expires, so nothing typed so far is lost. */
export function ReauthDialog() {
  const { state, googleReady, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (state.status !== 'expired') return null;

  const handleClick = () => {
    setBusy(true);
    signIn().finally(() => setBusy(false));
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <div className="dialog">
        <h2 id="reauth-title">Anmeldung abgelaufen</h2>
        <p>
          Aus Sicherheitsgründen gilt die Google-Anmeldung nur eine Stunde. Melde dich kurz neu an – deine Eingaben bleiben
          erhalten. Danach den letzten Schritt (z. B. Speichern) einfach noch einmal ausführen.
        </p>
        {state.error && <p className="alert error">{state.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={signOut}>
            Abmelden
          </button>
          <button type="button" className="button primary" onClick={handleClick} disabled={!googleReady || busy}>
            {busy ? 'Anmeldung läuft …' : `Weiter als ${state.user.email}`}
          </button>
        </div>
      </div>
    </div>
  );
}
