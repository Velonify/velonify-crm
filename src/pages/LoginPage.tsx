import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';

export function LoginPage() {
  const { state, googleReady, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const error = state.status === 'signedOut' ? state.error : undefined;

  const handleClick = () => {
    setBusy(true);
    // signIn opens the popup synchronously – no await before it, or the browser blocks the popup.
    signIn().finally(() => setBusy(false));
  };

  return (
    <div className="login">
      <div className="login-card">
        <img src="./favicon.svg" alt="" width={44} height={44} />
        <h1>Velonify CRM</h1>
        <p className="muted">Leads, Vertrieb und Kundenakte an einem Ort.</p>
        <button type="button" className="button primary large" onClick={handleClick} disabled={!googleReady || busy}>
          {busy ? 'Anmeldung läuft …' : googleReady ? 'Mit Google anmelden' : 'Google-Anmeldung wird geladen …'}
        </button>
        <p className="hint">Nur für Konten mit @{config.allowedDomain}</p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
