import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { ANGEBOT_STATUS, anzahlPosten, parseAuswahl, statusLabel } from '../data/angebote';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { spreadsheetFileUrl } from '../data/google/drive';
import { relativeDays } from '../lib/format';
import { useAngebotsDaten } from './useAngebotsDaten';

export function AngebotePage() {
  const { data, error, loading, reload } = useAngebotsDaten();
  const { db } = useCrm();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');

  const zeilen = useMemo(() => {
    if (!data) return [];
    const firmen = new Map(db?.firmen.map((f) => [f.id, f]));
    return data.angebote
      .filter((a) => !a.archiviert && (!status || a.status === status))
      .sort((a, b) => b.nummer.localeCompare(a.nummer, 'de', { numeric: true }) || (b.version ?? 0) - (a.version ?? 0))
      .map((a) => ({ angebot: a, firma: firmen.get(a.firma_id), auswahl: parseAuswahl(a.auswahl) }));
  }, [data, db, status]);

  if (!data) {
    return <div className="page">{error ? <ErrorBox error={error} onRetry={reload} /> : loading && <Loading label="Angebote werden geladen …" />}</div>;
  }

  const katalogLeer = data.kategorien.every((k) => k.archiviert);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Angebots-Rechner"
        title="Angebote"
        subtitle="Leistungen ankreuzen, im Kalkulations-Sheet bepreisen, Angebot als PDF erzeugen."
        actions={
          <Link to="/angebote/neu" className={`button primary${katalogLeer ? ' is-disabled' : ''}`} aria-disabled={katalogLeer}>
            Neues Angebot
          </Link>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {katalogLeer && (
        <div className="hint-box">
          Der Leistungskatalog ist noch leer. <Link to="/angebote/leistungen">Zu den Leistungen</Link> und den Startkatalog übernehmen.
        </div>
      )}

      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {ANGEBOT_STATUS.map((s) => (
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
              <th>Nr.</th>
              <th>Angebot</th>
              <th className="hide-sm">Sprache</th>
              <th>Status</th>
              <th className="num hide-sm">Leistungen</th>
              <th className="hide-md">Geändert</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {status ? 'Keine Angebote mit diesem Status.' : 'Noch keine Angebote.'}
                </td>
              </tr>
            )}
            {zeilen.map(({ angebot: a, firma, auswahl }) => (
              <tr key={a.id} onClick={() => navigate(`/angebote/${a.id}`)}>
                <td className="nowrap strong">{a.nummer}</td>
                <td>
                  <Link to={`/angebote/${a.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                    {a.titel}
                  </Link>
                  <div className="row-sub">
                    {firma?.kuerzel && <span className="kuerzel">{firma.kuerzel}</span>} {firma?.name ?? 'Firma nicht gefunden'}
                    {a.sheet_id && !isDemo && (
                      <>
                        {' · '}
                        <a href={spreadsheetFileUrl(a.sheet_id)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
                          Sheet ↗
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="hide-sm">{a.sprache === 'en' ? 'Englisch' : 'Deutsch'}</td>
                <td>
                  <span className={`badge angebot-${a.status}`}>{statusLabel(a.status)}</span>
                </td>
                <td className="num hide-sm">{anzahlPosten(auswahl)}</td>
                <td className="hide-md muted">{relativeDays(a.geaendert_am)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
