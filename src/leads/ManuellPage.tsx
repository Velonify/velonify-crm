import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useToast } from '../components/Toasts';
import { AUSSCHLUSS_LABEL, systemLabel } from '../data/leadFinder';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges } from './LeadTeile';
import { NICHT_EINGERICHTET, useLeadFinderApi } from './useLeadFinder';

/**
 * Shops the automatic check could not judge: they block our requests or the Impressum address is unreadable.
 * A person opens the shop and decides.
 */
export function ManuellPage() {
  const api = useLeadFinderApi();
  const toast = useToast();
  const liste = useLoad(() => (api ? api.manuell() : Promise.reject(new Error(NICHT_EINGERICHTET))), [api]);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const zeilen = useMemo(() => (liste.data ?? []).filter((z) => !erledigt.has(z.domain)), [liste.data, erledigt]);

  const entscheide = async (domain: string, freigeben: boolean) => {
    if (!api) return;
    setBusy(domain);
    try {
      await api.entscheide([{ domain, entscheidung: freigeben ? 'freigegeben' : 'abgelehnt', grund: freigeben ? 'manuell geprüft' : 'manuell verworfen' }]);
      setErledigt((s) => new Set([...s, domain]));
      toast.show(freigeben ? `${domain} ist jetzt im Backlog` : `${domain} verworfen`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Lead-Finder"
        title="Manuell prüfen"
        subtitle="Shops mit Anlass, die die automatische Prüfung nicht beurteilen konnte: Sie sperren automatische Abrufe, oder die Adresse im Impressum war nicht lesbar. Shop öffnen, dann entscheiden."
      />
      {liste.error && <ErrorBox error={liste.error} onRetry={liste.reload} />}
      {liste.loading && !liste.data && <Loading />}
      {liste.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Warum manuell</th>
                <th>System</th>
                <th className="hide-sm">Vorab-Anlass</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.domain}>
                  <td>
                    <a href={`https://${z.domain}/`} target="_blank" rel="noreferrer" className="row-title">
                      {z.domain}
                    </a>
                    <div className="row-sub">
                      <Link to={`/leads/shop/${z.domain}`}>Prüfdaten</Link>
                      {z.firma && ` · ${z.firma}`}
                    </div>
                  </td>
                  <td>{z.ausschluss.filter((a) => a !== 'kein_anlass').map((a) => AUSSCHLUSS_LABEL[a] ?? a).join(', ')}</td>
                  <td>{systemLabel(z.system, z.version)}</td>
                  <td className="hide-sm">{z.anlaesse.length > 0 ? <AnlassBadges anlaesse={z.anlaesse} /> : <span className="muted">Priorität {z.prioritaet}</span>}</td>
                  <td className="lead-zeilen-aktionen">
                    <button type="button" className="button small primary" disabled={busy === z.domain} onClick={() => void entscheide(z.domain, true)}>
                      In den Backlog
                    </button>
                    <button type="button" className="button small" disabled={busy === z.domain} onClick={() => void entscheide(z.domain, false)}>
                      Verwerfen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {zeilen.length === 0 && (
            <div className="empty">
              <p>Nichts zu prüfen.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
