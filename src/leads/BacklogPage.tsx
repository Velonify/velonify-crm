import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { ANLASS_LABEL, reichweiteLabel, systemLabel, tierVon, type ListenZeile } from '../data/leadFinder';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges, EntscheidungsLeiste } from './LeadTeile';
import { NICHT_EINGERICHTET, useLeadFinderApi } from './useLeadFinder';

const REICHWEITEN = [10_000, 50_000, 100_000, 500_000];
const SEITE = 100;

export function BacklogPage() {
  const api = useLeadFinderApi();
  const navigate = useNavigate();
  const liste = useLoad(() => (api ? api.backlog() : Promise.reject(new Error(NICHT_EINGERICHTET))), [api]);
  const [params, setParams] = useSearchParams();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [anzahl, setAnzahl] = useState(SEITE);

  const filter = { q: params.get('q') ?? '', system: params.get('system') ?? '', anlass: params.get('anlass') ?? '', reichweite: params.get('reichweite') ?? '', plz: params.get('plz') ?? '' };
  const setFilter = (key: keyof typeof filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setAnzahl(SEITE);
  };

  const zeilen = useMemo(() => (liste.data ?? []).filter((z) => !erledigt.has(z.domain)), [liste.data, erledigt]);
  const systeme = useMemo(() => [...new Set(zeilen.map((z) => z.system))].sort(), [zeilen]);
  const sichtbar = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const max = Number(filter.reichweite) || 0;
    return zeilen.filter(
      (z: ListenZeile) =>
        (!q || `${z.firma} ${z.domain} ${z.ort}`.toLowerCase().includes(q)) &&
        (!filter.system || z.system === filter.system) &&
        (!filter.anlass || z.anlaesse.includes(filter.anlass)) &&
        (!max || (z.rang_de !== null && z.rang_de <= max)) &&
        (!filter.plz || z.plz.startsWith(filter.plz)),
    );
  }, [zeilen, filter.q, filter.system, filter.anlass, filter.reichweite, filter.plz]);

  const gezeigt = sichtbar.slice(0, anzahl);
  const gewaehlt = [...auswahl].filter((d) => sichtbar.some((z) => z.domain === d));
  const alleGewaehlt = gezeigt.length > 0 && gezeigt.every((z) => auswahl.has(z.domain));
  const umschalten = (domain: string) =>
    setAuswahl((s) => {
      const neu = new Set(s);
      if (neu.has(domain)) neu.delete(domain);
      else neu.add(domain);
      return neu;
    });

  const entschieden = (domains: string[]) => {
    setErledigt((s) => new Set([...s, ...domains]));
    setAuswahl(new Set());
  };

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Lead-Finder"
        title="Backlog"
        subtitle={
          liste.data
            ? `${zeilen.length.toLocaleString('de-DE')} geprüfte Shops mit Anlass. Ins CRM kommt nur, was ihr übernehmt.`
            : 'Geprüfte Shops mit Anlass. Ins CRM kommt nur, was ihr übernehmt.'
        }
        actions={
          <Link to="/leads/suche" className="button">
            Weitere Shops prüfen
          </Link>
        }
      />

      {liste.error && <ErrorBox error={liste.error} onRetry={liste.reload} />}
      {liste.loading && !liste.data && <Loading label="Backlog wird geladen …" />}

      {liste.data && (
        <>
          <div className="filters" role="search">
            <input type="search" value={filter.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Firma, Domain oder Ort" aria-label="Suche" />
            <select value={filter.system} onChange={(e) => setFilter('system', e.target.value)} aria-label="System">
              <option value="">Alle Systeme</option>
              {systeme.map((s) => (
                <option key={s} value={s}>
                  {systemLabel(s)}
                </option>
              ))}
            </select>
            <select value={filter.anlass} onChange={(e) => setFilter('anlass', e.target.value)} aria-label="Anlass">
              <option value="">Alle Anlässe</option>
              {Object.entries(ANLASS_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select value={filter.reichweite} onChange={(e) => setFilter('reichweite', e.target.value)} aria-label="Reichweite">
              <option value="">Jede Reichweite</option>
              {REICHWEITEN.map((r) => (
                <option key={r} value={r}>
                  {reichweiteLabel(r)} in DE
                </option>
              ))}
            </select>
            <select value={filter.plz} onChange={(e) => setFilter('plz', e.target.value)} aria-label="PLZ-Bereich">
              <option value="">Alle PLZ</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={String(i)}>
                  PLZ {i}…
                </option>
              ))}
            </select>
          </div>

          <div className="lead-leiste">
            <span className="muted small">{gewaehlt.length > 0 ? `${gewaehlt.length} ausgewählt` : 'Shops auswählen, dann entscheiden.'}</span>
            <EntscheidungsLeiste api={api} domains={gewaehlt} onErledigt={entschieden} />
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="auswahl-spalte">
                    <input type="checkbox" aria-label="Alle angezeigten auswählen" checked={alleGewaehlt} onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(gezeigt.map((z) => z.domain)))} />
                  </th>
                  <th>Firma</th>
                  <th>System</th>
                  <th>Anlass</th>
                  <th className="hide-sm">Reichweite</th>
                  <th className="hide-md">Ort</th>
                  <th className="zahl">Score</th>
                </tr>
              </thead>
              <tbody>
                {gezeigt.map((z) => (
                  <tr key={z.domain} onClick={() => navigate(`/leads/shop/${z.domain}`)}>
                    <td className="auswahl-spalte" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`${z.firma || z.domain} auswählen`} checked={auswahl.has(z.domain)} onChange={() => umschalten(z.domain)} />
                    </td>
                    <td>
                      <Link to={`/leads/shop/${z.domain}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                        {z.firma || z.domain}
                      </Link>
                      <div className="row-sub">{z.domain}</div>
                    </td>
                    <td>{systemLabel(z.system, z.version)}</td>
                    <td>
                      <AnlassBadges anlaesse={z.anlaesse} />
                      <div className="row-sub">{z.anlass_texte[0]}</div>
                    </td>
                    <td className="hide-sm">{reichweiteLabel(z.rang_de)}</td>
                    <td className="hide-md">{z.ort ? `${z.plz} ${z.ort}` : <span className="muted">–</span>}</td>
                    <td className="zahl">
                      {z.score}
                      <div className="row-sub">Tier {tierVon(z.score)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sichtbar.length === 0 && (
              <div className="empty">
                {zeilen.length === 0 ? (
                  <p>
                    Der Backlog ist leer. Unter <Link to="/leads/suche">Suche</Link> weitere Shops prüfen lassen.
                  </p>
                ) : (
                  <p>Kein Shop passt zu den Filtern.</p>
                )}
              </div>
            )}
          </div>
          {sichtbar.length > anzahl && (
            <button type="button" className="button" onClick={() => setAnzahl((a) => a + SEITE)}>
              Weitere {Math.min(SEITE, sichtbar.length - anzahl)} von {sichtbar.length - anzahl} zeigen
            </button>
          )}
        </>
      )}
    </div>
  );
}
