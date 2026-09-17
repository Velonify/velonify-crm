import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader, PhaseBadge, StatusBadge, TierBadge } from '../components/ui';
import { phaseIndex, STATUS, statusLabel, TIERS } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { dublettenIndex } from '../data/dubletten';
import { kontaktName } from '../data/rules';
import { fortschritt } from '../data/selectors';
import type { Firma } from '../data/types';
import { relativeDays } from '../lib/format';

type SortKey = 'name' | 'status' | 'phase' | 'tier' | 'score' | 'ort' | 'zustaendig' | 'geaendert_am';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Firma' },
  { key: 'status', label: 'Status' },
  { key: 'phase', label: 'Deal-Phase', className: 'hide-sm' },
  { key: 'tier', label: 'Tier' },
  { key: 'score', label: 'Score', className: 'num hide-sm' },
  { key: 'ort', label: 'Ort', className: 'hide-md' },
  { key: 'zustaendig', label: 'Zuständig', className: 'hide-sm' },
  { key: 'geaendert_am', label: 'Geändert', className: 'hide-md' },
];

interface Zeile {
  firma: Firma;
  phase: string;
  suchtext: string;
}

function compare(a: Zeile, b: Zeile, key: SortKey): number {
  if (key === 'score') return (a.firma.score ?? -1) - (b.firma.score ?? -1);
  if (key === 'phase') return phaseIndex(a.phase) - phaseIndex(b.phase);
  return a.firma[key].localeCompare(b.firma[key], 'de', { sensitivity: 'base' });
}

export function FirmenListePage() {
  const { db, loading, error, refresh } = useCrm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });

  // Filters live in the URL, so a filtered view can be bookmarked or sent to a colleague.
  const filter = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    tier: params.get('tier') ?? '',
    plattform: params.get('plattform') ?? '',
    zustaendig: params.get('zustaendig') ?? '',
    archiv: params.get('archiv') === '1',
    dubletten: params.get('dubletten') === '1',
  };
  const setFilter = (key: keyof typeof filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const zeilen = useMemo<Zeile[]>(() => {
    if (!db) return [];
    const kontakte = new Map<string, string[]>();
    for (const k of db.kontakte) {
      if (!k.archiviert) (kontakte.get(k.firma_id) ?? kontakte.set(k.firma_id, []).get(k.firma_id)!).push(kontaktName(k), k.email);
    }
    const deals = new Map<string, typeof db.deals>();
    for (const d of db.deals) (deals.get(d.firma_id) ?? deals.set(d.firma_id, []).get(d.firma_id)!).push(d);
    return db.firmen.map((firma) => ({
      firma,
      phase: fortschritt(deals.get(firma.id) ?? []),
      // Search also finds a firm by its contacts' names and e-mail addresses.
      suchtext: [firma.name, firma.domain, firma.kuerzel, firma.ort, firma.quelle, ...(kontakte.get(firma.id) ?? [])].join(' ').toLowerCase(),
    }));
  }, [db]);

  const dubletten = useMemo(() => dublettenIndex(db?.firmen ?? []), [db]);

  const plattformen = useMemo(() => [...new Set(zeilen.map((z) => z.firma.plattform).filter(Boolean))].sort(), [zeilen]);

  const visible = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return zeilen
      .filter(
        ({ firma: f, suchtext }) =>
          (filter.archiv || !f.archiviert) &&
          (!filter.status || f.status === filter.status) &&
          (!filter.tier || f.tier === filter.tier) &&
          (!filter.plattform || f.plattform === filter.plattform) &&
          (!filter.zustaendig || f.zustaendig === filter.zustaendig) &&
          (!filter.dubletten || dubletten.has(f.id)) &&
          (!q || suchtext.includes(q)),
      )
      .sort((a, b) => compare(a, b, sort.key) * (sort.desc ? -1 : 1));
  }, [zeilen, filter.q, filter.status, filter.tier, filter.plattform, filter.zustaendig, filter.archiv, filter.dubletten, dubletten, sort]);

  const activeCount = zeilen.filter((z) => !z.firma.archiviert).length;
  const hasFilter = Boolean(filter.q || filter.status || filter.tier || filter.plattform || filter.zustaendig || filter.archiv || filter.dubletten);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'score' || key === 'geaendert_am' || key === 'phase' }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Leads & Kunden"
        title="Firmen"
        subtitle={db ? `${visible.length} von ${activeCount} aktiven Firmen` : undefined}
        actions={
          <>
            <Link to="/import" className="button">
              CSV importieren
            </Link>
            <Link to="/firmen/neu" className="button primary">
              Firma anlegen
            </Link>
          </>
        }
      />

      <div className="filters" role="search">
        <input
          type="search"
          className="search"
          placeholder="Suche nach Firma, Domain, Kürzel, Ort, Kontakt …"
          value={filter.q}
          onChange={(e) => setFilter('q', e.target.value)}
          aria-label="Suche"
        />
        <select value={filter.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select value={filter.tier} onChange={(e) => setFilter('tier', e.target.value)} aria-label="Tier">
          <option value="">Alle Tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              Tier {t}
            </option>
          ))}
        </select>
        <select value={filter.plattform} onChange={(e) => setFilter('plattform', e.target.value)} aria-label="Plattform">
          <option value="">Alle Plattformen</option>
          {plattformen.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={filter.zustaendig} onChange={(e) => setFilter('zustaendig', e.target.value)} aria-label="Zuständig">
          <option value="">Alle Zuständigen</option>
          {(db?.listen.team ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(dubletten.size > 0 || filter.dubletten) && (
          <label className="checkbox warn-text">
            <input type="checkbox" checked={filter.dubletten} onChange={(e) => setFilter('dubletten', e.target.checked ? '1' : '')} />
            Mögliche Dubletten ({dubletten.size})
          </label>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={filter.archiv} onChange={(e) => setFilter('archiv', e.target.checked ? '1' : '')} />
          Archivierte zeigen
        </label>
        {hasFilter && (
          <button type="button" className="link-button" onClick={() => setParams({}, { replace: true })}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {!db && loading && <Loading label="Firmen werden geladen …" />}
      {error && <ErrorBox error={error} onRetry={refresh} />}

      {db && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key} className={column.className} aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="sort-button" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span className="sort-indicator" aria-hidden="true">
                        {sort.key === column.key ? (sort.desc ? '↓' : '↑') : ''}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ firma: f, phase }) => (
                <tr key={f.id} className={f.archiviert ? 'is-archived' : undefined} onClick={() => navigate(`/firmen/${f.id}`)}>
                  <td>
                    <Link to={`/firmen/${f.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                      {f.name}
                    </Link>
                    <div className="row-sub">
                      {f.kuerzel && <span className="kuerzel">{f.kuerzel}</span>}
                      {f.domain || <span className="muted">keine Domain</span>}
                      {f.archiviert && <span className="muted"> · archiviert</span>}
                      {dubletten.has(f.id) && (
                        <span className="badge dublette" title={dubletten.get(f.id)!.map((t) => `${t.firma.name}: ${t.gruende.join(', ')}`).join('\n')}>
                          Dublette?
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="hide-sm">
                    <PhaseBadge phase={phase} />
                  </td>
                  <td>
                    <TierBadge tier={f.tier} />
                  </td>
                  <td className="num hide-sm">{f.score ?? <span className="muted">–</span>}</td>
                  <td className="hide-md">{f.ort || <span className="muted">–</span>}</td>
                  <td className="hide-sm">{f.zustaendig || <span className="muted">–</span>}</td>
                  <td className="hide-md muted">{relativeDays(f.geaendert_am)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className="empty">
              {activeCount === 0 && !hasFilter ? (
                <>
                  <p>Noch keine Firmen angelegt.</p>
                  <div className="empty-actions">
                    <Link to="/import" className="button">
                      Leads aus CSV importieren
                    </Link>
                    <Link to="/firmen/neu" className="button primary">
                      Erste Firma anlegen
                    </Link>
                  </div>
                </>
              ) : (
                <p>Keine Firma passt zu den Filtern.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
