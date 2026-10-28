import { PLATTFORM_LABEL } from './typen';

/** Page after a channel's OAuth consent: crm-api redirects here with ?kanal=…&ergebnis=… (no login needed). */
export function VerbundenSeite() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const kanal = PLATTFORM_LABEL[params.get('kanal') ?? ''] ?? 'Der Kanal';
  const ok = params.get('ergebnis') === 'verbunden';
  return (
    <div className="login">
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow-mark">Kanal-Anbindung</div>
          <h1>{ok ? `${kanal} ist verbunden` : 'Verbindung nicht abgeschlossen'}</h1>
          <p className="lead-text">
            {ok
              ? 'Der Hub holt die Zahlen ab jetzt jeden Tag ab. Die Beispielzahlen dieses Kanals werden beim ersten Abruf ersetzt.'
              : 'Bitte die Verbindung im Hub unter Analytics → Kanäle erneut starten.'}
          </p>
          <a className="button primary" href="#/analytics/kanaele">
            Zurück zu den Kanälen
          </a>
        </div>
      </main>
    </div>
  );
}
