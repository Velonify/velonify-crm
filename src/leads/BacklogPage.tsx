import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { ANLASS_BEREICH, ANLASS_LABEL, anlaesseIn, BEREICHE, bereichVon, reichweiteLabel, scoreIn, systemLabel, tierVon, type ListenZeile } from '../data/leadFinder';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges, EntscheidungsLeiste, ToolBadges } from './LeadTeile';
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

  const ansicht = bereichVon(params.get('ansicht') ?? 'migration');
  const filter = { q: params.get('q') ?? '', system: params.get('system') ?? '', anlass: params.get('anlass') ?? '', reichweite: params.get('reichweite') ?? '', plz: params.get('plz') ?? '' };
  const setFilter = (key: keyof typeof filter | 'ansicht', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Reasons differ per view, so a reason filter does not carry over.
    if (key === 'ansicht') next.delete('anlass');
    setParams(next, { replace: true });
    setAnzahl(SEITE);
    if (key === 'ansicht') setAuswahl(new Set());
  };

  const alle = useMemo(() => (liste.data ?? []).filter((z) => !erledigt.has(z.domain)), [liste.data, erledigt]);
  const zeilen = useMemo(() => alle.filter((z) => z.bereiche.includes(ansicht)).sort((a, b) => scoreIn(b, ansicht) - scoreIn(a, ansicht) || a.domain.localeCompare(b.domain)), [alle, ansicht]);
  const zahlJe = useMemo(() => Object.fromEntries(BEREICHE.map((b) => [b.id, alle.filter((z) => z.bereiche.includes(b.id)).length])), [alle]);
  const systeme = useMemo(() => [...new Set(zeilen.map((z) => z.system))].sort(), [zeilen]);
  const sichtbar = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const max = Number(filter.reichweite) || 0;
    return zeilen.filter(
      (z: ListenZeile) =>
        (!q || `${z.firma} ${z.domain} ${z.ort} ${z.email ?? ''}`.toLowerCase().includes(q)) &&
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

  const anlassOptionen = Object.entries(ANLASS_LABEL).filter(([id]) => ANLASS_BEREICH[id] === ansicht);

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Lead-Finder"
        title="Backlog"
        subtitle={
          liste.data
            ? `${alle.length.toLocaleString('de-DE')} geprüfte Shops mit Anlass. Ins CRM kommt nur, was ihr übernehmt.`
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
          <div className="chips lead-ansicht" role="tablist" aria-label="Ansicht">
            {BEREICHE.map((b) => (
              <button key={b.id} type="button" role="tab" aria-selected={ansicht === b.id} className={`chip ${ansicht === b.id ? 'is-active' : ''}`} onClick={() => setFilter('ansicht', b.id === 'migration' ? '' : b.id)}>
                {b.label} ({(zahlJe[b.id] ?? 0).toLocaleString('de-DE')})
              </button>
            ))}
          </div>

          <div className="filters" role="search">
            <input type="search" value={filter.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Firma, Domain, Ort oder E-Mail" aria-label="Suche" />
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
              {anlassOptionen.map(([id, label]) => (
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
            <EntscheidungsLeiste api={api} domains={gewaehlt} bereich={ansicht} onErledigt={entschieden} />
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="auswahl-spalte">
                    <input type="checkbox" aria-label="Alle angezeigten auswählen" checked={alleGewaehlt} onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(gezeigt.map((z) => z.domain)))} />
                  </th>
                  <th>Firma</th>
                  <th>{ansicht === 'ads' ? 'Pixel & GTM' : ansicht === 'klaviyo' ? 'E-Mail-Tool' : 'System'}</th>
                  <th>Anlass</th>
                  <th className="hide-sm">Reichweite</th>
                  <th className="hide-md">Ort</th>
                  <th className="zahl">Score</th>
                </tr>
              </thead>
              <tbody>
                {gezeigt.map((z) => {
                  const anlaesse = anlaesseIn(z, ansicht);
                  const score = scoreIn(z, ansicht);
                  return (
                    <tr key={z.domain} onClick={() => navigate(`/leads/shop/${z.domain}?ansicht=${ansicht}`)}>
                      <td className="auswahl-spalte" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`${z.firma || z.domain} auswählen`} checked={auswahl.has(z.domain)} onChange={() => umschalten(z.domain)} />
                      </td>
                      <td>
                        <Link to={`/leads/shop/${z.domain}?ansicht=${ansicht}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                          {z.firma || z.domain}
                        </Link>
                        <div className="row-sub">
                          <a href={`https://${z.domain}/`} target="_blank" rel="noreferrer" className="lead-website" onClick={(e) => e.stopPropagation()} title="Website in neuem Tab öffnen">
                            {z.domain} ↗
                          </a>
                        </div>
                        {z.email && (
                          <div className="row-sub">
                            <a href={`mailto:${z.email}`} onClick={(e) => e.stopPropagation()}>
                              {z.email}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        {ansicht === 'ads' ? (
                          <ToolBadges tools={z.werbung} gtm={z.gtm} />
                        ) : ansicht === 'klaviyo' ? (
                          <ToolBadges tools={z.email_tools} />
                        ) : (
                          systemLabel(z.system, z.version)
                        )}
                        {ansicht !== 'migration' && <div className="row-sub">{systemLabel(z.system, z.version)}</div>}
                      </td>
                      <td>
                        <AnlassBadges anlaesse={anlaesse.map((a) => a.id)} />
                        <div className="row-sub">{anlaesse[0]?.text}</div>
                      </td>
                      <td className="hide-sm">{reichweiteLabel(z.rang_de)}</td>
                      <td className="hide-md">{z.ort ? `${z.plz} ${z.ort}` : <span className="muted">–</span>}</td>
                      <td className="zahl">
                        {score}
                        <div className="row-sub">Tier {tierVon(score)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sichtbar.length === 0 && (
              <div className="empty">
                {zeilen.length === 0 ? (
                  <p>
                    In dieser Ansicht ist der Backlog leer. Unter <Link to="/leads/suche">Suche</Link> weitere Shops prüfen lassen.
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
