import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DealDialog } from '../components/dialogs/DealDialog';
import { WiedervorlageDialog } from '../components/dialogs/WiedervorlageDialog';
import { ErrorBox, Loading, PageHeader, PhaseBadge } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { kennzahlen, meinTag, type Aufgabe } from '../data/selectors';
import type { Deal } from '../data/types';
import { faelligText, formatDayShort, formatEuro } from '../lib/format';
import { useIch } from '../lib/useIch';

function AufgabenListe({ titel, aufgaben, heute, leer, onDeal, klasse = '' }: {
  titel: string;
  aufgaben: Aufgabe[];
  heute: string;
  leer?: string;
  onDeal(deal: Deal): void;
  klasse?: string;
}) {
  const { perform } = useCrm();
  if (aufgaben.length === 0 && !leer) return null;
  return (
    <section className={`card task-card ${klasse}`}>
      <header className="card-header">
        <h2>
          {titel} <span className="count">{aufgaben.length}</span>
        </h2>
      </header>
      {aufgaben.length === 0 && <p className="muted">{leer}</p>}
      <ul className="task-list">
        {aufgaben.map((a) => (
          <li key={a.key}>
            {a.art === 'wiedervorlage' ? (
              <input
                type="checkbox"
                aria-label={`${a.titel} erledigt`}
                onChange={() => perform((s) => s.setWiedervorlageErledigt(a.wiedervorlage!.id, true), `Erledigt: ${a.titel}`)}
              />
            ) : (
              <span className="task-kind" title="Nächster Schritt eines Deals" aria-hidden="true">
                ➜
              </span>
            )}
            <div className="task-body">
              {a.art === 'deal' ? (
                <button type="button" className="link-button" onClick={() => onDeal(a.deal!)}>
                  {a.titel}
                </button>
              ) : (
                <span>{a.titel}</span>
              )}
              <div className="row-sub">
                {a.firma && <Link to={`/firmen/${a.firma.id}`}>{a.firma.name}</Link>}
                {a.deal && <> · {a.deal.titel}</>}
                {a.deal && a.art === 'deal' && (
                  <>
                    {' '}
                    <PhaseBadge phase={a.deal.phase} />
                  </>
                )}
                {a.zustaendig && <> · {a.zustaendig}</>}
              </div>
            </div>
            <span className="task-due" title={a.faellig}>
              {a.faellig === heute ? 'heute' : a.faellig < heute ? faelligText(a.faellig, heute) : formatDayShort(a.faellig)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MeinTagPage() {
  const { db, loading, error, refresh } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);
  const [nurMeine, setNurMeine] = useState(true);
  const [dealDialog, setDealDialog] = useState<Deal | null>(null);
  const [neueWiedervorlage, setNeueWiedervorlage] = useState(false);
  const heute = isoDate(new Date());
  const filter = nurMeine ? ich : null;

  const tag = useMemo(() => (db ? meinTag(db, filter, heute) : null), [db, filter, heute]);
  const zahlen = useMemo(() => {
    if (!db) return null;
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    const deals = db.deals.filter((d) => !firmen.get(d.firma_id)?.archiviert && (!filter || d.zustaendig === filter));
    return kennzahlen(deals, heute);
  }, [db, filter, heute]);

  if (!db || !tag || !zahlen) return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const offen = tag.ueberfaellig.length + tag.heute.length;
  const begruessung = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Hallo' : 'Guten Abend';

  return (
    <div className="page">
      <PageHeader
        title={`${begruessung}${ich ? `, ${ich}` : ''}`}
        subtitle={offen === 0 ? 'Für heute ist nichts offen.' : `${offen} ${offen === 1 ? 'Sache ist' : 'Sachen sind'} heute dran.`}
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="Ansicht">
              <button type="button" role="radio" aria-checked={nurMeine} className={nurMeine ? 'is-active' : ''} onClick={() => setNurMeine(true)} disabled={!ich}>
                Meine
              </button>
              <button type="button" role="radio" aria-checked={!nurMeine} className={!nurMeine ? 'is-active' : ''} onClick={() => setNurMeine(false)}>
                Alle
              </button>
            </div>
            <button type="button" className="button primary" onClick={() => setNeueWiedervorlage(true)}>
              + Wiedervorlage
            </button>
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={refresh} />}

      {!ich && team.length > 0 && (
        <div className="hint-box ich-auswahl">
          <span>Wer bist du? Dann zeigt „Mein Tag“ nur deine Aufgaben.</span>
          <select value="" onChange={(e) => setIch(e.target.value)} aria-label="Teammitglied auswählen">
            <option value="">Bitte wählen …</option>
            {team.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Offene Deals</span>
          <span className="kpi-value">{zahlen.offen}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Pipeline-Wert</span>
          <span className="kpi-value">{formatEuro(zahlen.pipelineWert)}</span>
          <span className="kpi-sub">gewichtet {formatEuro(zahlen.gewichtet)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">In Phase „Angebot“</span>
          <span className="kpi-value">{formatEuro(zahlen.angebotWert)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Gewonnen diesen Monat</span>
          <span className="kpi-value">{formatEuro(zahlen.gewonnenMonatWert)}</span>
          <span className="kpi-sub">{zahlen.gewonnenMonat} Deals</span>
        </div>
      </div>

      <div className="tag-grid">
        <div>
          <AufgabenListe titel="Überfällig" aufgaben={tag.ueberfaellig} heute={heute} onDeal={setDealDialog} klasse="overdue" />
          <AufgabenListe titel="Heute" aufgaben={tag.heute} heute={heute} onDeal={setDealDialog} leer="Heute steht nichts an." />
          <AufgabenListe titel="Nächste 7 Tage" aufgaben={tag.naechsteTage} heute={heute} onDeal={setDealDialog} leer="Nichts geplant." />
        </div>
        <div>
          <section className="card task-card">
            <header className="card-header">
              <h2>
                Deals ohne nächsten Schritt <span className="count">{tag.ohneNaechstenSchritt.length}</span>
              </h2>
            </header>
            {tag.ohneNaechstenSchritt.length === 0 ? (
              <p className="muted">Jeder offene Deal hat einen geplanten nächsten Schritt.</p>
            ) : (
              <ul className="task-list">
                {tag.ohneNaechstenSchritt.map((d) => {
                  const firma = db.firmen.find((f) => f.id === d.firma_id);
                  return (
                    <li key={d.id}>
                      <span className="task-kind" aria-hidden="true">
                        ?
                      </span>
                      <div className="task-body">
                        <button type="button" className="link-button" onClick={() => setDealDialog(d)}>
                          {d.titel}
                        </button>
                        <div className="row-sub">
                          {firma && <Link to={`/firmen/${firma.id}`}>{firma.name}</Link>} <PhaseBadge phase={d.phase} />
                          {d.zustaendig && <> · {d.zustaendig}</>}
                        </div>
                      </div>
                      <span className="task-due">{formatEuro(d.wert_eur)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {dealDialog && <DealDialog deal={dealDialog} ich={ich} onClose={() => setDealDialog(null)} />}
      {neueWiedervorlage && <WiedervorlageDialog ich={ich} onClose={() => setNeueWiedervorlage(false)} />}
    </div>
  );
}
