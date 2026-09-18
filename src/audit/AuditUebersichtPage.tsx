import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader, TierBadge } from '../components/ui';
import { AUDIT_FRISCH_TAGE, istVeraltet, neuesteAudits, plattformLabel } from '../data/audit';
import { EOL_LABEL } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { SchemaError } from '../data/errors';
import type { Audit, Firma } from '../data/types';
import { formatDateTime, shortUser } from '../lib/format';
import { BefundZahlen, Score } from './AuditTeile';
import { useAudits, useAuditPruefen, useStapelPruefung } from './useAudits';

type Zustand = '' | 'nie' | 'veraltet' | 'geprueft' | 'hoch';

const ZUSTAENDE: { wert: Zustand; label: string }[] = [
  { wert: '', label: 'Alle Firmen' },
  { wert: 'nie', label: 'Nie geprüft' },
  { wert: 'veraltet', label: `Älter als ${AUDIT_FRISCH_TAGE} Tage` },
  { wert: 'geprueft', label: 'Geprüft' },
  { wert: 'hoch', label: 'Mit Befunden „hoch“' },
];

interface Zeile {
  firma: Firma;
  audit?: Audit;
  veraltet: boolean;
}

export function AuditUebersichtPage() {
  const { db, error: dbError, refresh } = useCrm();
  const audits = useAudits();
  const { bereit } = useAuditPruefen();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  const filter = { q: params.get('q') ?? '', zustand: (params.get('zustand') ?? '') as Zustand, tier: params.get('tier') ?? '', zustaendig: params.get('zustaendig') ?? '' };
  const setFilter = (key: keyof typeof filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert && f.domain), [db]);
  const { reload } = audits;
  const stapel = useStapelPruefung(firmen, useCallback(() => reload(), [reload]));

  const neueste = useMemo(() => neuesteAudits(audits.data ?? []), [audits.data]);
  const zeilen = useMemo<Zeile[]>(() => {
    const jetzt = new Date();
    return firmen
      .map((firma) => {
        const audit = neueste.get(firma.id);
        return { firma, audit, veraltet: audit ? istVeraltet(audit, jetzt) : false };
      })
      .sort((a, b) => a.firma.name.localeCompare(b.firma.name, 'de'));
  }, [firmen, neueste]);

  const sichtbar = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return zeilen.filter(
      ({ firma: f, audit, veraltet }) =>
        (!q || `${f.name} ${f.domain}`.toLowerCase().includes(q)) &&
        (!filter.tier || f.tier === filter.tier) &&
        (!filter.zustaendig || f.zustaendig === filter.zustaendig) &&
        (filter.zustand === '' ||
          (filter.zustand === 'nie' && !audit) ||
          (filter.zustand === 'veraltet' && veraltet) ||
          (filter.zustand === 'geprueft' && audit) ||
          (filter.zustand === 'hoch' && audit && audit.befunde.includes('"schwere":"hoch"'))),
    );
  }, [zeilen, filter.q, filter.tier, filter.zustaendig, filter.zustand]);

  // Audits of domains that are not in the CRM (yet).
  const ohneFirma = useMemo(() => [...neueste.entries()].filter(([k]) => k.startsWith('domain:')).map(([, a]) => a), [neueste]);

  const faellig = sichtbar.filter((z) => !z.audit || z.veraltet).map((z) => z.firma.id);
  const alleGewaehlt = sichtbar.length > 0 && sichtbar.every((z) => auswahl.has(z.firma.id));
  const umschalten = (id: string) =>
    setAuswahl((s) => {
      const neu = new Set(s);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  const starten = (ids: string[]) => {
    setAuswahl(new Set());
    void stapel.starte(ids);
  };

  const nichtEingerichtet = audits.error instanceof SchemaError;
  if (!db) return <div className="page">{dbError ? <ErrorBox error={dbError} onRetry={refresh} /> : <Loading />}</div>;

  const { stand } = stapel;
  const geprueft = zeilen.filter((z) => z.audit).length;

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Shop-Audit"
        title="Übersicht"
        subtitle={`${geprueft} von ${zeilen.length} Firmen mit Domain geprüft. Ein Audit dauert 20–60 Sekunden.`}
        actions={
          <>
            <Link to="/audit/neu" className="button">
              Domain prüfen
            </Link>
            {auswahl.size > 0 ? (
              <button type="button" className="button primary" disabled={stapel.laeuft || !bereit || nichtEingerichtet} onClick={() => starten([...auswahl])}>
                Auswahl prüfen ({auswahl.size})
              </button>
            ) : (
              <button type="button" className="button primary" disabled={stapel.laeuft || !bereit || nichtEingerichtet || faellig.length === 0} onClick={() => starten(faellig)} title="Alle angezeigten Firmen, die nie oder vor mehr als 30 Tagen geprüft wurden">
                Fällige prüfen ({faellig.length})
              </button>
            )}
          </>
        }
      />

      {nichtEingerichtet && (
        <div className="hint-box warn">
          Das Shop-Audit ist noch nicht eingerichtet. Unter <Link to="/einrichtung">Einrichtung</Link> auf „Einrichten“ klicken, dann entsteht das Tabellenblatt „audits“.
        </div>
      )}
      {!nichtEingerichtet && audits.error && <ErrorBox error={audits.error} onRetry={audits.reload} />}
      {!bereit && <div className="hint-box warn">Die Adresse des Shop-Audits fehlt noch (Repo-Variable SHOP_AUDIT_URL). Prüfen ist erst danach möglich.</div>}

      {stand.gesamt > 0 && (
        <div className={`hint-box ${stapel.laeuft ? '' : stand.fehler.length ? 'warn' : 'success'}`} role="status" aria-live="polite">
          <div className="audit-fortschritt">
            <span>
              {stapel.laeuft ? 'Prüfung läuft: ' : 'Prüfung beendet: '}
              <strong>{stand.erledigt}</strong> von {stand.gesamt} fertig
              {stand.fehler.length > 0 && `, ${stand.fehler.length} fehlgeschlagen`}
              {stapel.laeuft && '. Bitte diesen Tab geöffnet lassen.'}
            </span>
            {stapel.laeuft && (
              <button type="button" className="button small" onClick={stapel.stoppe}>
                Anhalten
              </button>
            )}
          </div>
          <progress max={stand.gesamt} value={stand.erledigt + stand.fehler.length} />
          {stand.fehler.length > 0 && (
            <ul className="small audit-fehler">
              {stand.fehler.map((f) => (
                <li key={f.firmaId}>
                  {firmen.find((x) => x.id === f.firmaId)?.name ?? f.firmaId}: {f.meldung}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="filters" role="search">
        <input type="search" value={filter.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Firma oder Domain" aria-label="Suche" />
        <select value={filter.zustand} onChange={(e) => setFilter('zustand', e.target.value)} aria-label="Stand">
          {ZUSTAENDE.map((z) => (
            <option key={z.wert} value={z.wert}>
              {z.label}
            </option>
          ))}
        </select>
        <select value={filter.tier} onChange={(e) => setFilter('tier', e.target.value)} aria-label="Tier">
          <option value="">Alle Tiers</option>
          {['A', 'B', 'C', 'D'].map((t) => (
            <option key={t} value={t}>
              Tier {t}
            </option>
          ))}
        </select>
        <select value={filter.zustaendig} onChange={(e) => setFilter('zustaendig', e.target.value)} aria-label="Zuständig">
          <option value="">Alle Zuständigen</option>
          {db.listen.team.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {audits.loading && !audits.data && !audits.error && <Loading label="Audits werden geladen …" />}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="auswahl-spalte">
                <input
                  type="checkbox"
                  aria-label="Alle angezeigten auswählen"
                  checked={alleGewaehlt}
                  disabled={stapel.laeuft}
                  onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(sichtbar.map((z) => z.firma.id)))}
                />
              </th>
              <th>Firma</th>
              <th>Plattform</th>
              <th className="hide-sm">Mobil</th>
              <th>Befunde</th>
              <th className="hide-md">Geprüft</th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map(({ firma: f, audit, veraltet }) => {
              const laeuft = stand.laufend.includes(f.id);
              const wartet = stand.warteschlange.includes(f.id);
              return (
                <tr key={f.id} onClick={() => (audit ? navigate(`/audit/${audit.id}`) : umschalten(f.id))}>
                  <td className="auswahl-spalte" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`${f.name} auswählen`} checked={auswahl.has(f.id)} disabled={stapel.laeuft} onChange={() => umschalten(f.id)} />
                  </td>
                  <td>
                    {audit ? (
                      <Link to={`/audit/${audit.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                        {f.name}
                      </Link>
                    ) : (
                      <span className="row-title">{f.name}</span>
                    )}
                    <div className="row-sub">
                      {f.tier && <TierBadge tier={f.tier} />}
                      {f.domain}
                    </div>
                  </td>
                  <td>
                    {audit ? (
                      <>
                        {plattformLabel(audit.plattform)} {audit.version !== '1' && audit.version}
                        {audit.eol && audit.eol !== 'unknown' && <div className={`row-sub ${audit.eol === 'eol' ? 'warn-text' : ''}`}>{EOL_LABEL[audit.eol] ?? audit.eol}</div>}
                      </>
                    ) : (
                      <span className="muted">{plattformLabel(f.plattform)}</span>
                    )}
                  </td>
                  <td className="hide-sm">{audit ? <Score wert={audit.score_mobil} /> : <span className="muted">–</span>}</td>
                  <td>{laeuft ? <span className="muted">wird geprüft …</span> : wartet ? <span className="muted">wartet</span> : audit ? <BefundZahlen audit={audit} /> : <span className="muted">nie geprüft</span>}</td>
                  <td className="hide-md">
                    {audit ? (
                      <>
                        <span className={veraltet ? 'warn-text' : undefined}>{formatDateTime(audit.geprueft_am)}</span>
                        <div className="row-sub">{shortUser(audit.von)}</div>
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sichtbar.length === 0 && <div className="empty">{zeilen.length === 0 ? <p>Noch keine Firma mit Domain im CRM.</p> : <p>Keine Firma passt zu den Filtern.</p>}</div>}
      </div>

      {ohneFirma.length > 0 && (
        <>
          <h2 className="subheading">Weitere geprüfte Domains</h2>
          <p className="muted small">Shops, die noch nicht im CRM sind. In der Detailansicht lassen sie sich als Lead anlegen.</p>
          <ul className="link-list">
            {ohneFirma.map((a) => (
              <li key={a.id}>
                <Link to={`/audit/${a.id}`}>{a.domain}</Link> <span className="muted small">· {formatDateTime(a.geprueft_am)}</span> <BefundZahlen audit={a} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
