import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { useTheme } from '../lib/useTheme';

export function LoginPage() {
  const { state, googleReady, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  useTheme();
  const error = state.status === 'signedOut' ? state.error : undefined;

  const handleClick = () => {
    setBusy(true);
    // signIn opens the popup synchronously – no await before it, or the browser blocks the popup.
    signIn().finally(() => setBusy(false));
  };

  return (
    <div className="login">
      <section className="login-panel">
        <div className="lockup">
          <img src="./zeichen-eisblau.png" alt="" />
          <span className="wordmark">Velonify</span>
        </div>
        <p className="login-claim">Klein im Team. Groß im Anspruch.</p>
        <p className="login-note">Intern · Nur für das Velonify-Team</p>
      </section>
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow-mark">Anmeldung</div>
          <h1>Velonify CRM</h1>
          <p className="lead-text">Leads, Vertrieb und Kundenakte an einem Ort.</p>
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
      </main>
    </div>
  );
}
