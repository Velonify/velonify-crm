import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useToast } from '../components/Toasts';
import { AUSSCHLUSS_LABEL, systemLabel } from '../data/leadFinder';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges } from './LeadTeile';
import { NICHT_EINGERICHTET, useLeadFinderApi, useLeadStapel } from './useLeadFinder';

const MENGEN = [50, 100, 200, 500];
const zahl = (n: number | undefined) => (n ?? 0).toLocaleString('de-DE');
const monat = (yyyymm: number) => (yyyymm ? `${String(yyyymm).slice(4)}/${String(yyyymm).slice(0, 4)}` : '–');

export function SuchePage() {
  const api = useLeadFinderApi();
  const toast = useToast();
  const statistik = useLoad(() => (api ? api.statistik() : Promise.reject(new Error(NICHT_EINGERICHTET))), [api]);
  const { reload } = statistik;
  const stapel = useLeadStapel(api, useCallback(() => reload(), [reload]));
  const [menge, setMenge] = useState(200);
  const [importOffen, setImportOffen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importFehler, setImportFehler] = useState('');

  const importieren = async () => {
    if (!api) return;
    setImportBusy(true);
    setImportFehler('');
    try {
      const q = await api.importiere();
      toast.show(`Pool aktualisiert: Crawl vom ${q.crawl_datum}, Chrome-Daten ${monat(q.crux_monat)}`);
      setImportOffen(false);
      reload();
    } catch (err) {
      setImportFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  };

  const s = statistik.data;
  const { stand } = stapel;
  const fertig = stand.erledigt + stand.fehler.length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Lead-Finder"
        title="Suche"
        subtitle="Der Pool enthält alle deutschen Shops, die HTTP Archive monatlich erfasst und die Chrome-Nutzer in Deutschland besuchen, ohne Shopify. Geprüft wird in der Reihenfolge der Vorab-Priorität: erst Systeme ohne Support mit viel Reichweite."
      />

      {statistik.error && <ErrorBox error={statistik.error} onRetry={reload} />}
      {statistik.loading && !s && <Loading />}

      {s && (
        <div className="kpis">
          <div className="kpi panel">
            <span className="kpi-label">Im Backlog</span>
            <span className="kpi-value">{zahl(s.backlog)}</span>
            <span className="kpi-sub">
              <Link to="/leads">ansehen</Link>
              {s.manuell > 0 && (
                <>
                  {' '}
                  · <Link to="/leads/manuell">{zahl(s.manuell)} manuell prüfen</Link>
                </>
              )}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Geprüft</span>
            <span className="kpi-value">{zahl(s.geprueft)}</span>
            <span className="kpi-sub">{zahl(s.qualifiziert)} qualifiziert</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Übernommen</span>
            <span className="kpi-value">{zahl(s.uebernommen)}</span>
            <span className="kpi-sub">{zahl(s.abgelehnt)} abgelehnt</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Pool</span>
            <span className="kpi-value">{zahl(s.pool)}</span>
            <span className="kpi-sub">{zahl(s.offen_ab_25)} aussichtsreiche noch ungeprüft</span>
          </div>
        </div>
      )}

      <Card title="Shops prüfen">
        <p>
          Prüft die nächsten Shops live: Shopsystem, Impressum, Kontakt, Sortiment, Zahlarten. Etwa 3 Sekunden je Shop, sechs gleichzeitig; 200 Shops dauern rund zwei Minuten.
          Qualifizierte landen im Backlog, <strong>nicht</strong> im CRM.
        </p>
        <div className="lead-leiste">
          <label className="field inline">
            <span className="field-label">Anzahl</span>
            <select value={menge} onChange={(e) => setMenge(Number(e.target.value))} disabled={stapel.laeuft}>
              {MENGEN.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {stapel.laeuft ? (
            <button type="button" className="button" onClick={stapel.stoppe}>
              Anhalten
            </button>
          ) : (
            <button type="button" className="button primary" disabled={!api} onClick={() => void stapel.starte(menge)}>
              Nächste {menge} prüfen
            </button>
          )}
        </div>

        {stand.gesamt > 0 && (
          <div className={`hint-box ${stapel.laeuft ? '' : stand.fehler.length ? 'warn' : 'success'}`} role="status" aria-live="polite">
            <div>
              {stapel.laeuft ? 'Prüfung läuft: ' : 'Prüfung beendet: '}
              <strong>{fertig}</strong> von {stand.gesamt} geprüft, <strong>{stand.qualifiziert}</strong> qualifiziert
              {stand.manuell > 0 && `, ${stand.manuell} für „manuell prüfen“`}
              {stand.fehler.length > 0 && `, ${stand.fehler.length} fehlgeschlagen`}
              {stapel.laeuft && '. Bitte diesen Tab geöffnet lassen.'}
            </div>
            <progress max={stand.gesamt} value={fertig} />
            {stand.zuletzt.length > 0 && (
              <ul className="lead-live small">
                {stand.zuletzt.map((k) => (
                  <li key={k.domain + k.geprueft_am}>
                    <span className={k.qualifiziert ? 'ok-text' : 'muted'}>{k.qualifiziert ? '✓' : '–'}</span>{' '}
                    {k.qualifiziert ? <Link to={`/leads/shop/${k.domain}`}>{k.firma.name || k.domain}</Link> : k.domain} · {systemLabel(k.system, k.version)}{' '}
                    {k.qualifiziert ? <AnlassBadges anlaesse={k.anlaesse.map((a) => a.id)} /> : <span className="muted">{k.ausschluss.map((a) => AUSSCHLUSS_LABEL[a.id] ?? a.id).join(', ')}</span>}
                  </li>
                ))}
              </ul>
            )}
            {stand.fehler.length > 0 && (
              <details className="small">
                <summary>Fehler</summary>
                <ul>
                  {stand.fehler.map((f, i) => (
                    <li key={i}>
                      {f.domain && `${f.domain}: `}
                      {f.meldung}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      <Card title="Datenquelle">
        <dl className="items">
          <div className="item">
            <dt>HTTP-Archive-Crawl</dt>
            <dd>{s?.crawl_datum ?? '–'}</dd>
          </div>
          <div className="item">
            <dt>Chrome-Daten (Reichweite, Ladezeit)</dt>
            <dd>{s ? monat(s.crux_monat) : '–'}</dd>
          </div>
          <div className="item">
            <dt>Aussichtsreich (Vorab-Priorität)</dt>
            <dd>{s ? `${zahl(s.pool_hoch)} hoch, ${zahl(s.pool_mittel)} mittel` : '–'}</dd>
          </div>
        </dl>
        <p className="small muted">Beide Quellen erscheinen monatlich neu. Einmal im Monat aktualisieren reicht; neue Shops und neue Anlässe kommen dann in den Pool.</p>
        <button type="button" className="button" disabled={!api} onClick={() => setImportOffen(true)}>
          Pool aktualisieren
        </button>
      </Card>

      {importOffen && (
        <Dialog title="Pool aktualisieren" onClose={() => setImportOffen(false)} onSubmit={importieren} submitLabel="Aktualisieren" busy={importBusy}>
          <p>
            Lädt den neuesten vollständigen HTTP-Archive-Crawl und die Chrome-Daten für Deutschland in den Pool. Das dauert ein bis zwei Minuten und bleibt im kostenlosen BigQuery-Kontingent (rund
            9 GB von 1 TB im Monat). Bereits geprüfte Shops und Entscheidungen bleiben erhalten.
          </p>
          {importFehler && <p className="alert error">{importFehler}</p>}
        </Dialog>
      )}
    </div>
  );
}
