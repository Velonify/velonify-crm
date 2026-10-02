import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { BranchenFilter, useBranchenFilter } from '../components/BranchenFilter';
import { BranchenNachtrag } from '../components/BranchenNachtrag';
import { DealDialog } from '../components/dialogs/DealDialog';
import { usePhaseChange } from '../components/dialogs/PhaseChange';
import { VernetzungKnoepfe } from '../components/dialogs/Vernetzung';
import { ErrorBox, Loading, PageHeader, TierBadge } from '../components/ui';
import { isAbgeschlossen, PHASEN, phaseLabel } from '../data/constants';
import { brancheLabel, passtBranche, zahlJeBranche } from '../data/branchen';
import { useCrm } from '../data/CrmContext';
import { addDays, isoDate } from '../data/ids';
import { wahrscheinlichkeit } from '../data/selectors';
import type { Deal } from '../data/types';
import { formatDayShort, formatEuro } from '../lib/format';
import { useIch } from '../lib/useIch';

const ABGESCHLOSSEN_TAGE = 30;

export function PipelinePage() {
  const { db, loading, error, refresh } = useCrm();
  const [ich] = useIch(db?.listen.team ?? []);
  const [zustaendig, setZustaendig] = useState('');
  const [dialog, setDialog] = useState<{ deal?: Deal } | null>(null);
  const [ziehend, setZiehend] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const branchen = useBranchenFilter();
  const phaseChange = usePhaseChange();
  const heute = isoDate(new Date());

  // Deals on the board before the industry filter, so the chips count what the other filters leave.
  const sichtbareDeals = useMemo(() => {
    if (!db) return [];
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    const grenze = addDays(heute, -ABGESCHLOSSEN_TAGE);
    return db.deals.flatMap((d) => {
      const firma = firmen.get(d.firma_id);
      if (!firma || firma.archiviert || d.archiviert) return [];
      if (zustaendig && d.zustaendig !== zustaendig) return [];
      // Won/lost columns only show the last month, so they don't grow forever.
      return !isAbgeschlossen(d.phase) || d.abgeschlossen_am >= grenze ? [{ deal: d, firma }] : [];
    });
  }, [db, zustaendig, heute]);
  const zahlenJeBranche = useMemo(() => zahlJeBranche(sichtbareDeals.map((x) => x.firma.branche)), [sichtbareDeals]);

  const spalten = useMemo(() => {
    const deals = sichtbareDeals.filter((x) => passtBranche(branchen.wert, x.firma.branche));
    return PHASEN.map((phase) => {
      const inPhase = deals
        .filter((x) => x.deal.phase === phase)
        .sort((a, b) => (a.deal.naechster_schritt_am || '9999').localeCompare(b.deal.naechster_schritt_am || '9999') || (b.deal.wert_eur ?? 0) - (a.deal.wert_eur ?? 0));
      return {
        phase,
        deals: inPhase,
        summe: inPhase.reduce((sum, x) => sum + (x.deal.wert_eur ?? 0), 0),
        gewichtet: inPhase.reduce((sum, x) => sum + ((x.deal.wert_eur ?? 0) * wahrscheinlichkeit(x.deal)) / 100, 0),
      };
    });
  }, [sichtbareDeals, branchen.wert]);

  if (!db) return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const drop = (event: DragEvent, phase: string) => {
    event.preventDefault();
    setUeber(null);
    const deal = db.deals.find((d) => d.id === event.dataTransfer.getData('text/plain'));
    setZiehend(null);
    if (deal) void phaseChange.request(deal, phase);
  };

  const offen = spalten.filter((s) => !isAbgeschlossen(s.phase));
  const offenSumme = offen.reduce((sum, s) => sum + s.summe, 0);
  const offenGewichtet = offen.reduce((sum, s) => sum + s.gewichtet, 0);

  return (
    <div className="page full">
      <PageHeader
        eyebrow="Vertrieb"
        title="Pipeline"
        subtitle={`Offen: ${formatEuro(offenSumme)} · gewichtet ${formatEuro(offenGewichtet)}`}
        actions={
          <>
            <select value={zustaendig} onChange={(e) => setZustaendig(e.target.value)} aria-label="Zuständig">
              <option value="">Alle Zuständigen</option>
              {db.listen.team.map((t) => (
                <option key={t} value={t}>
                  {t}
                  {t === ich ? ' (ich)' : ''}
                </option>
              ))}
            </select>
            <Link to="/crm/linkedin" className="button">
              Lead aus LinkedIn
            </Link>
            <button type="button" className="button primary" onClick={() => setDialog({})}>
              Deal anlegen
            </button>
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={refresh} />}
      <BranchenFilter wert={branchen.wert} setze={branchen.setze} zahlen={zahlenJeBranche}>
        <BranchenNachtrag />
      </BranchenFilter>
      <p className="muted small pipeline-hint">
        Karten zwischen Spalten ziehen oder die Phase auf der Karte wählen. Gewonnen und Verloren zeigen die letzten {ABGESCHLOSSEN_TAGE} Tage.
      </p>

      <div className="board">
        {spalten.map((spalte) => (
          <section
            key={spalte.phase}
            className={`board-column phase-${spalte.phase}${ueber === spalte.phase ? ' is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (ueber !== spalte.phase) setUeber(spalte.phase);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUeber(null);
            }}
            onDrop={(e) => drop(e, spalte.phase)}
            aria-label={phaseLabel(spalte.phase)}
          >
            <header className="board-column-header">
              <h2>
                {phaseLabel(spalte.phase)} <span className="count">{spalte.deals.length}</span>
              </h2>
              <span className="board-column-sum">{formatEuro(spalte.summe)}</span>
            </header>
            <ul className="board-cards">
              {spalte.deals.map(({ deal, firma }) => {
                const ueberfaellig = deal.naechster_schritt_am && deal.naechster_schritt_am < heute && !isAbgeschlossen(deal.phase);
                return (
                  <li
                    key={deal.id}
                    className={`board-card${ziehend === deal.id ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', deal.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setZiehend(deal.id);
                    }}
                    onDragEnd={() => {
                      setZiehend(null);
                      setUeber(null);
                    }}
                  >
                    <div className="board-card-top">
                      <Link to={`/crm/firmen/${firma.id}`} className="row-title">
                        {firma.name}
                      </Link>
                      {firma.tier && <TierBadge tier={firma.tier} />}
                    </div>
                    <button type="button" className="link-button board-card-title" onClick={() => setDialog({ deal })}>
                      {deal.titel}
                    </button>
                    {firma.branche && <div className="row-sub">{brancheLabel(firma.branche)}</div>}
                    <div className="board-card-meta">
                      <span>{formatEuro(deal.wert_eur)}</span>
                      {deal.zustaendig && <span className="avatar small" title={deal.zustaendig}>{deal.zustaendig.slice(0, 1)}</span>}
                    </div>
                    {!isAbgeschlossen(deal.phase) && (deal.naechster_schritt || deal.naechster_schritt_am) && (
                      <div className={`next-step${ueberfaellig ? ' overdue' : ''}`}>
                        {deal.naechster_schritt_am && <strong>{deal.naechster_schritt_am === heute ? 'Heute' : formatDayShort(deal.naechster_schritt_am)}</strong>} {deal.naechster_schritt}
                      </div>
                    )}
                    {deal.phase === 'vernetzung' && <VernetzungKnoepfe deal={deal} firma={firma} />}
                    {deal.phase === 'verloren' && deal.verlustgrund && <div className="row-sub">{deal.verlustgrund}</div>}
                    <select
                      className="phase-select compact"
                      value={deal.phase}
                      onChange={(e) => void phaseChange.request(deal, e.target.value)}
                      aria-label={`Phase von ${deal.titel} bei ${firma.name}`}
                    >
                      {PHASEN.map((p) => (
                        <option key={p} value={p}>
                          {phaseLabel(p)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {dialog && <DealDialog deal={dialog.deal} ich={ich} onClose={() => setDialog(null)} />}
      {phaseChange.element}
    </div>
  );
}
