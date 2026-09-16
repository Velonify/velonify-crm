import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { config, isDemo, spreadsheetUrl } from '../config';
import { AuthExpiredError } from '../data/errors';
import { useRepository } from '../data/RepositoryContext';
import { checkSetup, runSetup } from '../data/sheets/setup';
import { useLoad } from '../lib/useLoad';

function DemoHinweis() {
  return (
    <div className="page narrow">
      <PageHeader title="Einrichtung" />
      <section className="card">
        <h2>Das CRM läuft im Demo-Modus</h2>
        <p>Es fehlen die Verbindungsdaten zu Google. Sobald sie hinterlegt sind, arbeitet das CRM mit dem echten Sheet.</p>
        <dl className="items">
          <div className="item">
            <dt>Google-Client-ID</dt>
            <dd>{config.googleClientId ? '✓ hinterlegt' : '✗ fehlt'}</dd>
          </div>
          <div className="item">
            <dt>Sheet-ID</dt>
            <dd>{config.spreadsheetId ? '✓ hinterlegt' : '✗ fehlt'}</dd>
          </div>
          <div className="item">
            <dt>Erlaubte Domain</dt>
            <dd>@{config.allowedDomain}</dd>
          </div>
        </dl>
        <p className="muted">Wie das geht, steht in der README des Repos unter „Einrichtung“.</p>
      </section>
    </div>
  );
}

export function EinrichtungPage() {
  const { sheets } = useRepository();
  const { expire } = useAuth();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>();
  const status = useLoad(() => (sheets ? checkSetup(sheets) : Promise.resolve(null)), [sheets]);

  if (isDemo || !sheets) return <DemoHinweis />;

  const handleSetup = async () => {
    setRunning(true);
    setRunError(undefined);
    try {
      await runSetup(sheets);
      status.reload();
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setRunError(err);
    } finally {
      setRunning(false);
    }
  };

  const s = status.data;
  return (
    <div className="page narrow">
      <PageHeader
        title="Einrichtung"
        subtitle={
          <a href={spreadsheetUrl(config.spreadsheetId)} target="_blank" rel="noreferrer noopener">
            {s?.spreadsheetTitle || 'CRM-Sheet'} in Google Sheets öffnen ↗
          </a>
        }
      />

      <section className="card">
        <h2>Aufbau des CRM-Sheets</h2>
        <p className="muted">
          Das CRM braucht bestimmte Tabellenblätter und Spalten. „Einrichten“ legt Fehlendes an, ohne vorhandene Daten oder
          eigene Spalten anzufassen, und kann gefahrlos mehrfach ausgeführt werden.
        </p>

        {status.loading && !s && <Loading label="Sheet wird geprüft …" />}
        {status.error && <ErrorBox error={status.error} onRetry={status.reload} />}

        {s && (
          <>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Tabellenblatt</th>
                  <th>Status</th>
                  <th className="hide-sm">Schutz</th>
                </tr>
              </thead>
              <tbody>
                {s.tabs.map((tab) => (
                  <tr key={tab.name}>
                    <td>
                      <code>{tab.name}</code>
                    </td>
                    <td>
                      {!tab.exists ? (
                        <span className="badge warn">fehlt</span>
                      ) : tab.missingColumns.length > 0 ? (
                        <span className="badge warn" title={tab.missingColumns.join(', ')}>
                          {tab.missingColumns.length} Spalten fehlen
                        </span>
                      ) : (
                        <span className="badge ok">vollständig</span>
                      )}
                    </td>
                    <td className="hide-sm">{tab.isProtected ? 'Warnhinweis aktiv' : <span className="muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Auswahllisten im Blatt „listen“: {s.listenRows} Einträge</p>
          </>
        )}

        {runError !== undefined && <ErrorBox error={runError} />}

        <div className="form-actions">
          <button type="button" className="button" onClick={status.reload} disabled={status.loading || running}>
            Erneut prüfen
          </button>
          <button type="button" className="button primary" onClick={handleSetup} disabled={!s || running || (s.ready && s.listenRows > 0 && s.tabs.every((t) => t.isProtected))}>
            {running ? 'Richtet ein …' : s?.ready ? 'Alles eingerichtet' : 'Einrichten'}
          </button>
        </div>
      </section>
    </div>
  );
}
