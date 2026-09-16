import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader, StatusBadge, TierBadge } from '../components/ui';
import { useRepository } from '../data/RepositoryContext';
import { LISTEN_DEFAULTS } from '../data/schema';
import type { Firma } from '../data/types';
import { statusLabel } from '../lib/format';
import { useLoad } from '../lib/useLoad';

type SortKey = 'name' | 'status' | 'tier' | 'score' | 'ort' | 'zustaendig' | 'geaendert_am';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Firma' },
  { key: 'status', label: 'Status' },
  { key: 'tier', label: 'Tier' },
  { key: 'score', label: 'Score', className: 'num hide-sm' },
  { key: 'ort', label: 'Ort', className: 'hide-sm' },
  { key: 'zustaendig', label: 'Zuständig', className: 'hide-sm' },
  { key: 'geaendert_am', label: 'Geändert', className: 'hide-md' },
];

function compare(a: Firma, b: Firma, key: SortKey): number {
  if (key === 'score') return (a.score ?? -1) - (b.score ?? -1);
  return a[key].localeCompare(b[key], 'de', { sensitivity: 'base' });
}

const relativeDays = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return '–';
  return days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
};

export function FirmenListePage() {
  const { repository } = useRepository();
  const navigate = useNavigate();
  const firmen = useLoad(() => repository.listFirmen(), [repository]);
  const listen = useLoad(() => repository.getListen(), [repository]);
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
  };
  const setFilter = (key: keyof typeof filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const lists = listen.data ?? LISTEN_DEFAULTS;
  const plattformen = useMemo(
    () => [...new Set((firmen.data ?? []).map((f) => f.plattform).filter(Boolean))].sort(),
    [firmen.data],
  );

  const visible = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const rows = (firmen.data ?? []).filter(
      (f) =>
        (filter.archiv || !f.archiviert) &&
        (!filter.status || f.status === filter.status) &&
        (!filter.tier || f.tier === filter.tier) &&
        (!filter.plattform || f.plattform === filter.plattform) &&
        (!filter.zustaendig || f.zustaendig === filter.zustaendig) &&
        (!q || [f.name, f.domain, f.kuerzel, f.ort, f.quelle].some((v) => v.toLowerCase().includes(q))),
    );
    return rows.sort((a, b) => compare(a, b, sort.key) * (sort.desc ? -1 : 1));
  }, [firmen.data, filter.q, filter.status, filter.tier, filter.plattform, filter.zustaendig, filter.archiv, sort]);

  const activeCount = (firmen.data ?? []).filter((f) => !f.archiviert).length;
  const hasFilter = Boolean(filter.q || filter.status || filter.tier || filter.plattform || filter.zustaendig || filter.archiv);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'score' || key === 'geaendert_am' }));

  return (
    <div className="page">
      <PageHeader
        title="Firmen"
        subtitle={firmen.data ? `${visible.length} von ${activeCount} aktiven Firmen` : undefined}
        actions={
          <Link to="/firmen/neu" className="button primary">
            Neue Firma
          </Link>
        }
      />

      <div className="filters" role="search">
        <input
          type="search"
          className="search"
          placeholder="Suche nach Name, Domain, Kürzel, Ort …"
          value={filter.q}
          onChange={(e) => setFilter('q', e.target.value)}
          aria-label="Suche"
        />
        <select value={filter.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {(lists.status ?? []).map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select value={filter.tier} onChange={(e) => setFilter('tier', e.target.value)} aria-label="Tier">
          <option value="">Alle Tiers</option>
          {(lists.tier ?? []).map((t) => (
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
          {(lists.team ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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

      {firmen.loading && !firmen.data && <Loading label="Firmen werden geladen …" />}
      {firmen.error && <ErrorBox error={firmen.error} onRetry={firmen.reload} />}

      {firmen.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={column.className}
                    aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                  >
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
              {visible.map((f) => (
                <tr key={f.id} className={f.archiviert ? 'is-archived' : undefined} onClick={() => navigate(`/firmen/${f.id}`)}>
                  <td>
                    <Link to={`/firmen/${f.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                      {f.name}
                    </Link>
                    <div className="row-sub">
                      {f.kuerzel && <span className="kuerzel">{f.kuerzel}</span>}
                      {f.domain || <span className="muted">keine Domain</span>}
                      {f.archiviert && <span className="muted"> · archiviert</span>}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td>
                    <TierBadge tier={f.tier} />
                  </td>
                  <td className="num hide-sm">{f.score ?? <span className="muted">–</span>}</td>
                  <td className="hide-sm">{f.ort || <span className="muted">–</span>}</td>
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
                  <Link to="/firmen/neu" className="button primary">
                    Erste Firma anlegen
                  </Link>
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
