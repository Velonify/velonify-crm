import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, instanzModus, instanzName, mandantenModus, offenerLogin } from '../config';
import { useTheme } from '../lib/useTheme';

/** What the tenants' hub does, on the left of its login. Velonify's own hub keeps the agency claim. */
const HUB_PUNKTE = [
  { titel: 'Lead-Markt', text: 'Geprüfte Shopify-Shops mit Helpdesk, Technik und Kontakt. Jeder Lead geht nur an ein Team.' },
  { titel: 'Anschreiben mit KI', text: 'Shop prüfen, Aufhänger finden, erste Nachricht schreiben lassen.' },
  { titel: 'Pipeline und To-Dos', text: 'Deals, Wiedervorlagen, Angebote und Boards für das ganze Team.' },
];

export function LoginPage() {
  const { state, googleReady, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  useTheme();
  useEffect(() => {
    if (offenerLogin) document.title = instanzModus ? `${instanzName || 'Velonify'} HUB` : 'Velonify Hub';
  }, []);
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
          {instanzModus ? (
            <span className="brand-text">
              <span className="wordmark">{instanzName || 'Velonify'} HUB</span>
              <span className="brand-by">by Velonify</span>
            </span>
          ) : (
            <span className="wordmark">{offenerLogin ? 'Velonify Hub' : 'Velonify'}</span>
          )}
        </div>
        {mandantenModus ? (
          <div className="login-hub">
            <p className="login-claim">Leads, die passen. Vertrieb, der läuft.</p>
            <ul className="login-punkte">
              {HUB_PUNKTE.map((p) => (
                <li key={p.titel}>
                  <strong>{p.titel}</strong>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : instanzModus ? (
          <p className="login-claim">Aufgaben, Inhalte und Zahlen an einem Ort.</p>
        ) : (
          <p className="login-claim">Klein im Team. Groß im Anspruch.</p>
        )}
        {offenerLogin ? (
          <p className="login-note login-recht">
            Ein Produkt von Velonify ·{' '}
            <a href="https://velonify.de/impressum/" target="_blank" rel="noreferrer">
              Impressum
            </a>{' '}
            ·{' '}
            <a href="https://velonify.de/datenschutz/" target="_blank" rel="noreferrer">
              Datenschutz
            </a>
          </p>
        ) : (
          <p className="login-note">Intern · Nur für das Velonify-Team</p>
        )}
      </section>
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow-mark">Anmeldung</div>
          <h1>{offenerLogin ? 'Willkommen' : 'Velonify intern'}</h1>
          <p className="lead-text">
            {offenerLogin ? 'Meldet euch mit dem Google-Konto an, für das ihr eingeladen wurdet.' : 'CRM, Kunden und interne Werkzeuge an einem Ort.'}
          </p>
          <button type="button" className="button primary large" onClick={handleClick} disabled={!googleReady || busy}>
            {busy ? 'Anmeldung läuft …' : googleReady ? 'Mit Google anmelden' : 'Google-Anmeldung wird geladen …'}
          </button>
          {mandantenModus ? (
            <p className="hint">
              Noch kein Zugang? <a href="mailto:hallo@velonify.de?subject=Velonify%20Hub%20testen">Test anfragen</a>
            </p>
          ) : instanzModus ? (
            <p className="hint">Noch kein Zugang? Fragt einen Admin eures Teams nach einer Einladung.</p>
          ) : (
            <p className="hint">Nur für Konten mit @{config.allowedDomain}</p>
          )}
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
