import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { useToast } from '../components/Toasts';
import { AUSSCHLUSS_LABEL, systemLabel, type ListenZeile } from '../data/leadFinder';
import { isValidEmail } from '../data/rules';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges } from './LeadTeile';
import { NICHT_EINGERICHTET, useLeadFinderApi } from './useLeadFinder';

/**
 * Shops the automatic check could not judge: they block our requests, the Impressum address is unreadable or it
 * names no e-mail. A person opens the shop and decides; releasing one needs a contact e-mail, as every lead has one.
 */
export function ManuellPage() {
  const api = useLeadFinderApi();
  const toast = useToast();
  const liste = useLoad(() => (api ? api.manuell() : Promise.reject(new Error(NICHT_EINGERICHTET))), [api]);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [freigabe, setFreigabe] = useState<{ zeile: ListenZeile; email: string; fehler: string } | null>(null);
  const zeilen = useMemo(() => (liste.data ?? []).filter((z) => !erledigt.has(z.domain)), [liste.data, erledigt]);

  const entscheide = async (domain: string, freigeben: boolean, email = '') => {
    if (!api) return;
    setBusy(domain);
    try {
      await api.entscheide([{ domain, entscheidung: freigeben ? 'freigegeben' : 'abgelehnt', grund: freigeben ? 'manuell geprüft' : 'manuell verworfen', ...(freigeben ? { email } : {}) }]);
      setErledigt((s) => new Set([...s, domain]));
      toast.show(freigeben ? `${domain} ist jetzt im Backlog` : `${domain} verworfen`);
      setFreigabe(null);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (freigeben) setFreigabe((f) => f && { ...f, fehler: text });
      else toast.show(text);
    } finally {
      setBusy('');
    }
  };

  const freigeben = () => {
    if (!freigabe) return;
    const email = freigabe.email.trim().toLowerCase();
    if (!isValidEmail(email)) return setFreigabe({ ...freigabe, fehler: 'Bitte eine gültige E-Mail-Adresse eintragen.' });
    return entscheide(freigabe.zeile.domain, true, email);
  };

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Lead-Finder"
        title="Manuell prüfen"
        subtitle="Shops mit Anlass, die die automatische Prüfung nicht beurteilen konnte: Sie sperren automatische Abrufe, die Adresse im Impressum war nicht lesbar oder es steht keine E-Mail darin. Shop öffnen, dann entscheiden. In den Backlog kommt ein Shop nur mit Kontakt-E-Mail."
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
                  <td>{z.ausschluss.filter((a) => a !== 'kein_anlass').map((a) => AUSSCHLUSS_LABEL[a] ?? a).join(', ') || (!z.email && AUSSCHLUSS_LABEL.keine_email)}</td>
                  <td>{systemLabel(z.system, z.version)}</td>
                  <td className="hide-sm">{z.anlaesse.length > 0 ? <AnlassBadges anlaesse={z.anlaesse} /> : <span className="muted">Priorität {z.prioritaet}</span>}</td>
                  <td className="lead-zeilen-aktionen">
                    <button type="button" className="button small primary" disabled={busy === z.domain} onClick={() => setFreigabe({ zeile: z, email: z.email ?? '', fehler: '' })}>
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
      {freigabe && (
        <Dialog title={`${freigabe.zeile.domain} in den Backlog`} onClose={() => setFreigabe(null)} onSubmit={freigeben} submitLabel="In den Backlog" busy={busy === freigabe.zeile.domain}>
          <p>Jeder Lead braucht eine Kontakt-E-Mail. Steht keine im Impressum, bitte auf der Website (Kontakt, Impressum, Fußzeile) nachsehen.</p>
          <Field label="Kontakt-E-Mail" invalid={Boolean(freigabe.fehler)}>
            <input type="email" value={freigabe.email} onChange={(e) => setFreigabe({ ...freigabe, email: e.target.value, fehler: '' })} placeholder="info@…" autoFocus required />
          </Field>
          {freigabe.fehler && <FormError error={new Error(freigabe.fehler)} />}
        </Dialog>
      )}
    </div>
  );
}
