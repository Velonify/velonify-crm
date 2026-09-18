import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Loading } from '../components/ui';
import { useToast } from '../components/Toasts';
import { befundeVon, domainSchluessel, istVeraltet, neuestesAuditFuer } from '../data/audit';
import { SchemaError } from '../data/errors';
import type { Firma } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { SchwereBadge, Score } from './AuditTeile';
import { useAuditPruefen, useAudits } from './useAudits';

/** Card in the company file: newest audit with its severe findings, and a button to (re)check. */
export function AuditKarte({ firma }: { firma: Firma }) {
  const audits = useAudits();
  const { pruefe, bereit } = useAuditPruefen();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Before the tab exists the card stays out of the way.
  if (audits.error instanceof SchemaError) return null;

  const audit = audits.data ? neuestesAuditFuer(audits.data, firma.id) : undefined;
  const wichtig = audit ? befundeVon(audit).filter((b) => b.schwere === 'hoch').slice(0, 4) : [];

  const pruefen = async () => {
    setBusy(true);
    try {
      await pruefe(domainSchluessel(firma.domain), firma.id);
      audits.reload();
      toast.show('Shop geprüft');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Shop-Audit"
      actions={
        firma.domain &&
        !firma.archiviert && (
          <button type="button" className="button small" onClick={pruefen} disabled={busy || !bereit || !audits.data}>
            {busy ? 'Prüft …' : audit ? 'Neu prüfen' : 'Shop prüfen'}
          </button>
        )
      }
    >
      {!firma.domain && <p className="muted small">Ohne Domain kein Audit. Unter „Bearbeiten“ eintragen.</p>}
      {audits.loading && !audits.data && <Loading label="Audit wird geladen …" />}
      {busy && <p className="muted small">Die Prüfung dauert 20–60 Sekunden.</p>}
      {firma.domain && audits.data && !audit && !busy && <p className="muted small">Noch nicht geprüft.</p>}
      {audit && (
        <>
          <p className="small">{audit.zusammenfassung}</p>
          <dl className="items">
            <div className="item">
              <dt>PageSpeed mobil</dt>
              <dd>
                <Score wert={audit.score_mobil} />
              </dd>
            </div>
          </dl>
          {wichtig.length > 0 && (
            <ul className="befund-liste">
              {wichtig.map((b) => (
                <li key={b.id}>
                  <SchwereBadge schwere={b.schwere} /> {b.text}
                </li>
              ))}
            </ul>
          )}
          <p className="row-sub">
            <Link to={`/audit/${audit.id}`}>Details und Aufhänger</Link> ·{' '}
            <span className={istVeraltet(audit, new Date()) ? 'warn-text' : undefined}>geprüft {formatDateTime(audit.geprueft_am)}</span>
          </p>
        </>
      )}
    </Card>
  );
}
