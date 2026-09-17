import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { ANSCHREIBEN_STATUS, KANAELE, kanalLabel } from '../data/anschreiben';
import { useCrm } from '../data/CrmContext';
import { kontaktName } from '../data/rules';
import type { Anschreiben } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDateTime, shortUser } from '../lib/format';
import { useContactDaten } from './useContactDaten';

export function GesendetPage() {
  const { data, error, loading, reload, aendern } = useContactDaten();
  const { db } = useCrm();
  const toast = useToast();
  const [kanal, setKanal] = useState('');
  const [status, setStatus] = useState('');
  const [offen, setOffen] = useState<string | null>(null);

  const zeilen = useMemo(() => {
    if (!data) return [];
    const firmen = new Map(db?.firmen.map((f) => [f.id, f]));
    const kontakte = new Map(db?.kontakte.map((k) => [k.id, k]));
    return data.anschreiben
      .filter((a) => !a.archiviert && (!kanal || a.kanal === kanal) && (!status || a.status === status))
      .sort((a, b) => b.gesendet_am.localeCompare(a.gesendet_am))
      .map((a) => ({ anschreiben: a, firma: firmen.get(a.firma_id), kontakt: kontakte.get(a.kontakt_id) }));
  }, [data, db, kanal, status]);

  if (!data) {
    return <div className="page">{error ? <ErrorBox error={error} onRetry={reload} /> : loading && <Loading label="Gesendete Nachrichten werden geladen …" />}</div>;
  }

  const setzeStatus = async (a: Anschreiben, neu: string) => {
    try {
      await aendern((s) => s.setAnschreibenStatus(a.id, neu, a.geaendert_am));
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };

  const alle = data.anschreiben.filter((a) => !a.archiviert);
  const antworten = alle.filter((a) => a.status === 'antwort').length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Contact Generator"
        title="Gesendet"
        subtitle={
          alle.length === 0
            ? 'Nachrichten erscheinen hier, sobald sie als gesendet markiert sind.'
            : `${alle.length} Nachrichten, ${antworten} mit Antwort. Den Status von Hand pflegen, dann sieht man, was ankommt.`
        }
        actions={
          <Link to="/contact" className="button primary">
            Neues Anschreiben
          </Link>
        }
      />

      <div className="filters">
        <select value={kanal} onChange={(e) => setKanal(e.target.value)} aria-label="Kanal">
          <option value="">Alle Kanäle</option>
          {KANAELE.map((k) => (
            <option key={k.wert} value={k.wert}>
              {k.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {ANSCHREIBEN_STATUS.map((s) => (
            <option key={s.wert} value={s.wert}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Kanal</th>
              <th className="hide-sm">Leistung</th>
              <th className="hide-md">Gesendet</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {kanal || status ? 'Keine Nachrichten mit diesem Filter.' : 'Noch keine Nachrichten als gesendet markiert.'}
                </td>
              </tr>
            )}
            {zeilen.map(({ anschreiben: a, firma, kontakt }) => (
              <Fragment key={a.id}>
                <tr onClick={() => setOffen((o) => (o === a.id ? null : a.id))} aria-expanded={offen === a.id}>
                  <td>
                    {firma ? (
                      <Link to={`/crm/firmen/${firma.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                        {firma.name}
                      </Link>
                    ) : (
                      <span className="muted">Firma nicht gefunden</span>
                    )}
                    <div className="row-sub">{kontakt ? kontaktName(kontakt) : 'ohne Ansprechpartner'}</div>
                  </td>
                  <td className="nowrap">{kanalLabel(a.kanal)}</td>
                  <td className="hide-sm">{a.leistung}</td>
                  <td className="hide-md">
                    {formatDateTime(a.gesendet_am)}
                    <div className="row-sub">{shortUser(a.von)}</div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={a.status} onChange={(e) => void setzeStatus(a, e.target.value)} aria-label={`Status für ${firma?.name ?? a.id}`} className={`status-select status-${a.status}`}>
                      {ANSCHREIBEN_STATUS.map((s) => (
                        <option key={s.wert} value={s.wert}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                {offen === a.id && (
                  <tr className="detail-row">
                    <td colSpan={5}>
                      {a.betreff && (
                        <p className="small">
                          <strong>Betreff:</strong> {a.betreff}
                        </p>
                      )}
                      <pre className="nachricht-vorschau">{a.text}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
