import { boardKurz, faelligkeit, type KanbanSpalte } from '../data/todos';
import type { Aufgabe, Board, Firma } from '../data/types';
import { useOffenBei } from '../components/Praesenz';
import { KarteInhalt, KartenPlatz, SchnellAnlegen } from './BoardAnsicht';
import { useKanbanDrag, type DragZiel } from './useKanbanDrag';

/**
 * The overview as a board: the open cards in the current filter plus those done in the last seven days. With one board
 * the columns are that board's and cards can be reordered; with several, columns are merged by title and a drop only
 * changes the column.
 */
export function UebersichtKanban({
  spalten,
  einzeln,
  boards,
  firmen,
  heute,
  kommentarZahl,
  onAblegen,
  onOeffnen,
  onAnlegen,
}: {
  spalten: KanbanSpalte[];
  einzeln: boolean;
  boards: Map<string, Board>;
  firmen: readonly Firma[];
  heute: string;
  kommentarZahl: Map<string, number>;
  onAblegen(aufgabe: Aufgabe, ziel: DragZiel, spalte: KanbanSpalte): void;
  onOeffnen(aufgabe: Aufgabe): void;
  /** Single board only: quick add at the end of a column. */
  onAnlegen?: (spalteKey: string, titel: string) => Promise<void>;
}) {
  const offenBei = useOffenBei('karte');
  const alle = spalten.flatMap((s) => s.karten);
  const ablegen = (id: string, ziel: DragZiel) => {
    const karte = alle.find((a) => a.id === id);
    const spalte = spalten.find((s) => s.key === ziel.spalteId);
    if (karte && spalte) onAblegen(karte, ziel, spalte);
  };
  const { drag, griff, spalteRef, scroller, istKlickNachDrag } = useKanbanDrag(ablegen);
  const gezogen = drag ? alle.find((a) => a.id === drag.id) : undefined;
  const kuerzel = (a: Aufgabe) => {
    const b = boards.get(a.board_id);
    return !einzeln && b ? boardKurz(b, firmen) : undefined;
  };

  return (
    <>
      <div className="kanban uebersicht-kanban" ref={(el) => {
          scroller.current = el;
        }}>
        {spalten.map((spalte) => {
          const ohneGezogen = spalte.karten.filter((a) => a.id !== drag?.id);
          // Merged columns have no order of their own: the placeholder only marks the column.
          const platzhalter = drag?.ziel?.spalteId === spalte.key ? (einzeln ? drag.ziel.index : ohneGezogen.length) : -1;
          const nurBei = spalte.nurBei?.map((b) => boardKurz(b, firmen)).join(', ');
          return (
            <section key={spalte.key} className={`kanban-spalte${spalte.erledigt ? ' is-erledigt' : ''}${platzhalter >= 0 ? ' is-ziel' : ''}`} aria-label={spalte.titel}>
              <header className="kanban-kopf">
                <h2>{spalte.titel}</h2>
                {nurBei && <span className="kanban-nur-bei" title={`Diese Spalte gibt es nur auf: ${nurBei}`}>nur {nurBei}</span>}
                <span className="count">{spalte.karten.length}</span>
              </header>
              {spalte.erledigt && <p className="kanban-hinweis muted">letzte 7 Tage</p>}
              <ul className="kanban-karten" ref={spalteRef(spalte.key)}>
                {ohneGezogen.map((a, i) => (
                  <KartenPlatz key={a.id} zeigePlatzhalter={platzhalter === i}>
                    <li
                      className={`karte is-${faelligkeit(a, heute)}`}
                      data-karte-id={a.id}
                      tabIndex={0}
                      role="button"
                      onPointerDown={griff(a.id)}
                      onClick={() => !istKlickNachDrag() && onOeffnen(a)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOeffnen(a);
                        }
                      }}
                    >
                      <KarteInhalt aufgabe={a} heute={heute} kommentare={kommentarZahl.get(a.id) ?? 0} offenBei={offenBei.get(a.id)} board={kuerzel(a)} />
                    </li>
                  </KartenPlatz>
                ))}
                {platzhalter >= ohneGezogen.length && <li className="karte-platzhalter" aria-hidden="true" />}
                {spalte.karten.length === 0 && platzhalter < 0 && <li className="kanban-leer">Keine Karten</li>}
              </ul>
              {onAnlegen && !spalte.erledigt && <SchnellAnlegen onAnlegen={(titel) => onAnlegen(spalte.key, titel)} />}
            </section>
          );
        })}
      </div>
        {drag && gezogen && (
          <div className="karte is-fliegend" style={{ left: drag.x - drag.griffX, top: drag.y - drag.griffY, width: drag.breite }} aria-hidden="true">
            <KarteInhalt aufgabe={gezogen} heute={heute} kommentare={kommentarZahl.get(gezogen.id) ?? 0} board={kuerzel(gezogen)} />
          </div>
        )}
    </>
  );
}
