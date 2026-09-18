import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field, FormError, PageHeader } from '../components/ui';
import { domainSchluessel } from '../data/audit';
import { useCrm } from '../data/CrmContext';
import { useAuditPruefen } from './useAudits';

export function AuditNeuPage() {
  const { db } = useCrm();
  const { pruefe, bereit } = useAuditPruefen();
  const navigate = useNavigate();
  const [eingabe, setEingabe] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>();

  const domain = domainSchluessel(eingabe);
  const firma = domain ? db?.firmen.find((f) => !f.archiviert && f.domain && domainSchluessel(f.domain) === domain) : undefined;

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (!domain) return;
    setBusy(true);
    setFehler(undefined);
    try {
      const { audit } = await pruefe(domain, firma?.id ?? '');
      navigate(`/audit/${audit.id}`);
    } catch (err) {
      setFehler(err);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Shop-Audit" title="Domain prüfen" subtitle="Für einen einzelnen Shop, auch wenn er noch nicht im CRM ist. Die Prüfung dauert 20–60 Sekunden." />
      <form className="form" onSubmit={absenden}>
        <Field label="Domain" hint="z. B. muster-shop.de, ohne https:// und Pfad">
          <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} placeholder="muster-shop.de" autoFocus disabled={busy} inputMode="url" autoComplete="off" />
        </Field>
        {firma && (
          <p className="small">
            Gehört zu <Link to={`/crm/firmen/${firma.id}`}>{firma.name}</Link>. Das Audit wird dort im Verlauf vermerkt.
          </p>
        )}
        {domain && !firma && <p className="small muted">Nicht im CRM. Nach der Prüfung lässt sich der Shop als Lead anlegen.</p>}
        <FormError error={fehler} />
        {!bereit && <p className="warn-text small">Die Adresse des Shop-Audits fehlt noch (Repo-Variable SHOP_AUDIT_URL).</p>}
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={!domain || busy || !bereit}>
            {busy ? 'Prüft … (bis 60 s)' : 'Prüfen'}
          </button>
        </div>
      </form>
    </div>
  );
}
