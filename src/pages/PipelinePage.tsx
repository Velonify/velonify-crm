import { useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useBlatt } from '../components/Blatt';
import { FilterKlappe } from '../components/FilterKlappe';
import { BranchenFilter, useBranchenFilter } from '../components/BranchenFilter';
import { BranchenNachtrag } from '../components/BranchenNachtrag';
import { TagFilter, TagListe, useTagFilter } from '../components/TagFilter';
import { DealDialog } from '../components/dialogs/DealDialog';
import { usePhaseChange } from '../components/dialogs/PhaseChange';
import { VernetzungKnoepfe } from '../components/dialogs/Vernetzung';
import { useOffenBei } from '../components/Praesenz';
import { ErrorBox, Loading, PageHeader, TierBadge } from '../components/ui';
import { isAbgeschlossen, PHASEN, phaseLabel, STANDARD_WAHRSCHEINLICHKEIT } from '../data/constants';
import { brancheLabel, passtBranche, zahlJeBranche } from '../data/branchen';
import { useCrm } from '../data/CrmContext';
import { addDays, isoDate } from '../data/ids';
import { RUHT_AB_TAGE, ruhtSeit, wahrscheinlichkeit } from '../data/selectors';
import { passtTags, zahlJeTag } from '../data/tags';
import type { Deal } from '../data/types';
import { domainLabel, formatDayShort, formatEuro, websiteUrl } from '../lib/format';
import { useIch } from '../lib/useIch';
import { istZustaendig, kuerzelVon } from '../data/zustaendig';
import { useRolle } from '../lib/useRolle';

const ABGESCHLOSSEN_TAGE = 30;

export function PipelinePage() {
  const { db, loading, error, refresh } = useCrm();
  const { siehtGeld } = useRolle();
  const [ich] = useIch(db?.listen.team ?? []);
  const [zustaendig, setZustaendig] = useState('');
  const [dialog, setDialog] = useState<{ deal?: Deal } | null>(null);
  const [ziehend, setZiehend] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const branchen = useBranchenFilter();
  const tags = useTagFilter();
  const phaseChange = usePhaseChange();
  const blatt = useBlatt();
  const offenBei = useOffenBei('firma');
  const heute = isoDate(new Date());
  // Plain click opens the side sheet; with a modifier key the link opens the full record as usual.
  const imBlatt = (e: MouseEvent, firmaId: string, dealId: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    blatt.oeffne(firmaId, dealId);
  };

  // Deals on the board before the industry filter, so the chips count what the other filters leave.
  const sichtbareDeals = useMemo(() => {
    if (!db) return [];
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    const grenze = addDays(heute, -ABGESCHLOSSEN_TAGE);
    return db.deals.flatMap((d) => {
      const firma = firmen.get(d.firma_id);
      if (!firma || firma.archiviert || d.archiviert) return [];
      if (zustaendig && !istZustaendig(d.zustaendig, zustaendig)) return [];
      // Won/lost columns only show the last month, so they don't grow forever.
      return !isAbgeschlossen(d.phase) || d.abgeschlossen_am >= grenze ? [{ deal: d, firma }] : [];
    });
  }, [db, zustaendig, heute]);
  const zahlenJeBranche = useMemo(() => zahlJeBranche(sichtbareDeals.map((x) => x.firma.branche)), [sichtbareDeals]);
  const zahlenJeTag = useMemo(() => zahlJeTag(sichtbareDeals.map((x) => x.firma.tags)), [sichtbareDeals]);

  const spalten = useMemo(() => {
    const deals = sichtbareDeals.filter((x) => passtBranche(branchen.wert, x.firma.branche) && passtTags(tags.wert, x.firma.tags));
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
  }, [sichtbareDeals, branchen.wert, tags.wert]);

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
  const ueberfaelligeSchritte = offen.reduce((n, sp) => n + sp.deals.filter((x) => x.deal.naechster_schritt_am && x.deal.naechster_schritt_am < heute).length, 0);

  return (
    <div className="page full">
      <PageHeader
        eyebrow="Vertrieb"
        title="Pipeline"
        zahlen={[
          ...(siehtGeld
            ? [
                { wert: formatEuro(offenSumme), label: 'offen' },
                { wert: formatEuro(offenGewichtet), label: 'gewichtet' },
              ]
            : []),
          { wert: offen.reduce((n, sp) => n + sp.deals.length, 0), label: 'offene Deals' },
          { wert: ueberfaelligeSchritte, label: 'Schritte überfällig', warn: ueberfaelligeSchritte > 0 },
        ]}
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
            <button type="button" className="button primary" onClick={() => setDialog({})}>
              Deal anlegen
            </button>
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={refresh} />}
      <FilterKlappe aktiv={tags.wert.wahl.size + branchen.wert.wahl.size}>
        <TagFilter wert={tags.wert} setze={tags.setze} zahlen={zahlenJeTag} />
        <BranchenFilter wert={branchen.wert} setze={branchen.setze} zahlen={zahlenJeBranche}>
          <BranchenNachtrag />
        </BranchenFilter>
      </FilterKlappe>
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
              {siehtGeld && <span className="board-column-sum">{formatEuro(spalte.summe)}</span>}
              {siehtGeld && !isAbgeschlossen(spalte.phase) && (
                <div className="spalte-gewichtet" title={`Abschlusswahrscheinlichkeit ${STANDARD_WAHRSCHEINLICHKEIT[spalte.phase]} %`}>
                  <span className="wbalken" aria-hidden="true">
                    <i style={{ width: `${STANDARD_WAHRSCHEINLICHKEIT[spalte.phase]}%` }} />
                  </span>
                  <span className="muted small">
                    {STANDARD_WAHRSCHEINLICHKEIT[spalte.phase]} % · gewichtet {formatEuro(Math.round(spalte.gewichtet))}
                  </span>
                </div>
              )}
            </header>
            <ul className="board-cards">
              {spalte.deals.map(({ deal, firma }) => {
                const ueberfaellig = deal.naechster_schritt_am && deal.naechster_schritt_am < heute && !isAbgeschlossen(deal.phase);
                const ruht = db ? ruhtSeit(deal, db.aktivitaeten, heute) : null;
                const ruhend = ruht !== null && ruht >= RUHT_AB_TAGE;
                const schauen = offenBei.get(firma.id) ?? [];
                return (
                  <li
                    key={deal.id}
                    className={`board-card${ziehend === deal.id ? ' is-dragging' : ''}${ruhend ? ' is-ruhend' : ''}`}
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
                    {schauen.length > 0 && (
                      <span className="schaut" title={`${schauen.join(', ')} ${schauen.length === 1 ? 'hat' : 'haben'} die Firma gerade offen`}>
                        <span className="schaut-punkt" aria-hidden="true" />
                        {schauen[0]}
                        {schauen.length > 1 ? ` +${schauen.length - 1}` : ''}
                      </span>
                    )}
                    <div className="board-card-top">
                      <Link to={`/crm/firmen/${firma.id}`} className="row-title" onClick={(e) => imBlatt(e, firma.id, deal.id)}>
                        {firma.name}
                      </Link>
                      {firma.tier && <TierBadge tier={firma.tier} />}
                    </div>
                    {firma.domain && (
                      <a
                        className="board-card-website"
                        href={websiteUrl(firma.domain)}
                        target="_blank"
                        rel="noreferrer noopener"
                        draggable={false}
                        title="Website in neuem Tab öffnen"
                      >
                        {domainLabel(firma.domain)} ↗
                      </a>
                    )}
                    <button type="button" className="link-button board-card-title" onClick={() => setDialog({ deal })}>
                      {deal.titel}
                    </button>
                    {firma.branche && <div className="row-sub">{brancheLabel(firma.branche)}</div>}
                    {firma.tags && (
                      <div className="row-tags">
                        <TagListe tags={firma.tags} max={3} />
                      </div>
                    )}
                    <div className="board-card-meta">
                      {siehtGeld && <span>{formatEuro(deal.wert_eur)}</span>}
                      {deal.zustaendig && (
                        <span className="board-card-personen" title={deal.zustaendig}>
                          {kuerzelVon(deal.zustaendig).map((k, i) => (
                            <span key={i} className="avatar small">
                              {k}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {!isAbgeschlossen(deal.phase) && (deal.naechster_schritt || deal.naechster_schritt_am) && (
                      <div className={`next-step${ueberfaellig ? ' overdue' : ''}`}>
                        {deal.naechster_schritt_am && <strong>{deal.naechster_schritt_am === heute ? 'Heute' : formatDayShort(deal.naechster_schritt_am)}</strong>} {deal.naechster_schritt}
                      </div>
                    )}
                    {ruhend && <div className="ruht-hinweis">Ruht seit {ruht} Tagen</div>}
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
