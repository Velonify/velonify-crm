import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { isoDate } from '../data/ids';
import { FREIGABE_LABEL, freigabeVon } from '../data/portal';
import { checklisteVon, faelligkeit, kartenNachSpalte, labelsVon, passtFilter, sortierungFuerPosition, spaltenVon, type KartenFilter } from '../data/todos';
import type { Aufgabe, Board, TodoDaten } from '../data/types';
import { errorMessage } from '../lib/errors';
import { faelligText } from '../lib/format';
import { useIch } from '../lib/useIch';
import { KarteDialog, SpaltenDialog, type Aendern } from './Dialoge';
import { useKanbanDrag, type DragZiel } from './useKanbanDrag';
import { kuerzelVon } from '../data/zustaendig';

const FILTER: { wert: KartenFilter; label: string }[] = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'meine', label: 'Meine' },
  { wert: 'faellig', label: 'Fällig' },
];

function KarteInhalt({ aufgabe, heute, kommentare }: { aufgabe: Aufgabe; heute: string; kommentare: number }) {
  const labels = labelsVon(aufgabe);
  const punkte = checklisteVon(aufgabe);
  const fertig = punkte.filter((p) => p.erledigt).length;
  const faellig = faelligkeit(aufgabe, heute);
  const freigabe = freigabeVon(aufgabe);
  return (
    <>
      {labels.length > 0 && (
        <span className="karte-labels">
          {labels.map((l) => (
            <span key={l} className="karte-label">
              {l}
            </span>
          ))}
        </span>
      )}
      <span className="karte-titel">{aufgabe.titel}</span>
      <span className="karte-meta">
        {aufgabe.faellig_am && <span className={`karte-faellig is-${faellig}`}>{faelligText(aufgabe.faellig_am, heute)}</span>}
        {punkte.length > 0 && (
          <span className={`karte-zahl${fertig === punkte.length ? ' is-komplett' : ''}`} title="Checkliste">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2z M5 8l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            {fertig}/{punkte.length}
          </span>
        )}
        {kommentare > 0 && (
          <span className="karte-zahl" title="Kommentare">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v8H7l-3 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            {kommentare}
          </span>
        )}
        {aufgabe.quelle === 'agent' && <span className="badge subtle">Slack</span>}
        {aufgabe.quelle === 'kunde' && <span className="badge subtle" title="Anfrage aus dem Kundenportal">Anfrage</span>}
        {freigabe ? <span className={`badge freigabe-${freigabe}`}>{FREIGABE_LABEL[freigabe]}</span> : aufgabe.sichtbar_kunde && <span className="badge ok" title="Für den Kunden sichtbar">Kunde</span>}
        {aufgabe.zustaendig && (
          <span className="karte-personen" title={aufgabe.zustaendig}>
            {kuerzelVon(aufgabe.zustaendig).map((k, i) => (
              <span key={i} className="karte-person">
                {k}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
}

function SchnellAnlegen({ onAnlegen }: { onAnlegen(titel: string): Promise<void> }) {
  const [offen, setOffen] = useState(false);
  const [titel, setTitel] = useState('');
  const [busy, setBusy] = useState(false);
  if (!offen) {
    return (
      <button type="button" className="kanban-neu" onClick={() => setOffen(true)}>
        + Karte
      </button>
    );
  }
  const anlegen = async () => {
    if (!titel.trim()) return;
    setBusy(true);
    try {
      await onAnlegen(titel);
      setTitel('');
    } finally {
      setBusy(false);
    }
  };
  const taste = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void anlegen();
    }
    if (e.key === 'Escape') setOffen(false);
  };
  return (
    <div className="kanban-schnell">
      <textarea rows={2} value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={taste} placeholder="Titel – Enter legt an" autoFocus disabled={busy} />
      <div className="card-actions">
        <button type="button" className="button small primary" onClick={() => void anlegen()} disabled={busy || !titel.trim()}>
          Anlegen
        </button>
        <button type="button" className="button small subtle" onClick={() => setOffen(false)}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Kanban board with filters, quick add, drag & drop and the card dialog. Used on the board page and in the client hub. */
export function BoardAnsicht({
  board,
  daten,
  setDaten,
  team,
  aendern,
}: {
  board: Board;
  daten: TodoDaten;
  /** Optimistic update while the move is written to the sheet. */
  setDaten(daten: TodoDaten): void;
  team: readonly string[];
  aendern: Aendern;
}) {
  const toast = useToast();
  const [ich] = useIch(team);
  const [filter, setFilter] = useState<KartenFilter>('alle');
  const [label, setLabel] = useState('');
  const [dialog, setDialog] = useState<{ aufgabe?: Aufgabe; spalteId?: string; kommentarId?: string } | null>(null);
  const [spaltenDialog, setSpaltenDialog] = useState(false);
  // "?karte=<id>&kommentar=<id>" (from the bell or a shared link) opens that card once, scrolled to the comment.
  const [suchParameter, setSuchParameter] = useSearchParams();
  const karteAusLink = suchParameter.get('karte');
  const kommentarAusLink = suchParameter.get('kommentar') ?? undefined;
  useEffect(() => {
    if (!karteAusLink) return;
    const aufgabe = daten.aufgaben.find((a) => a.id === karteAusLink && a.board_id === board.id);
    if (aufgabe) setDialog({ aufgabe, kommentarId: kommentarAusLink });
    setSuchParameter(
      (p) => {
        p.delete('karte');
        p.delete('kommentar');
        return p;
      },
      { replace: true },
    );
  }, [karteAusLink, kommentarAusLink, daten.aufgaben, board.id, setSuchParameter]);
  const heute = isoDate(new Date());
  const spalten = spaltenVon(board);
  const gruppen = useMemo(() => kartenNachSpalte(daten.aufgaben, board), [daten.aufgaben, board]);
  const alleLabels = useMemo(() => [...new Set([...gruppen.values()].flat().flatMap(labelsVon))].sort((a, b) => a.localeCompare(b, 'de')), [gruppen]);
  const kommentarZahl = useMemo(() => {
    const zahl = new Map<string, number>();
    for (const k of daten.kommentare) zahl.set(k.aufgabe_id, (zahl.get(k.aufgabe_id) ?? 0) + 1);
    return zahl;
  }, [daten.kommentare]);

  const sichtbar = (a: Aufgabe) => passtFilter(a, filter, ich, heute) && (!label || labelsVon(a).includes(label));

  const ablegen = (id: string, ziel: DragZiel) => {
    const karte = daten.aufgaben.find((a) => a.id === id);
    if (!karte) return;
    // The index counts the visible cards; with a filter on, translate it to the full column.
    const spalte = gruppen.get(ziel.spalteId) ?? [];
    const sichtbare = spalte.filter((a) => a.id !== id && sichtbar(a));
    const nachbar = sichtbare[ziel.index];
    const index = nachbar ? spalte.filter((a) => a.id !== id).indexOf(nachbar) : spalte.filter((a) => a.id !== id).length;
    // Dropped where it already was: nothing to write.
    if (karte.spalte_id === ziel.spalteId && spalte.indexOf(karte) === index) return;
    const sortierung = sortierungFuerPosition(spalte, id, index);
    setDaten({ ...daten, aufgaben: daten.aufgaben.map((a) => (a.id === id ? { ...a, spalte_id: ziel.spalteId, sortierung } : a)) });
    aendern((s) => s.verschiebeKarte(id, ziel.spalteId, index)).catch((err) => toast.show(errorMessage(err), 'error'));
  };

  const { drag, griff, spalteRef, scroller, istKlickNachDrag } = useKanbanDrag(ablegen);
  const gezogen = drag ? daten.aufgaben.find((a) => a.id === drag.id) : undefined;

  const anlegen = (spalteId: string) => async (titel: string) => {
    try {
      await aendern((s) => s.saveKarte(board.id, { titel, beschreibung: '', zustaendig: '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false, spalte_id: spalteId }));
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      throw err;
    }
  };

  const oeffnen = (aufgabe: Aufgabe) => {
    if (!istKlickNachDrag()) setDialog({ aufgabe });
  };

  return (
    <div className="kanban-rahmen">
      <div className="kanban-werkzeuge">
        <div className="segmented" role="group" aria-label="Filter">
          {FILTER.map((f) => (
            <button key={f.wert} type="button" className={filter === f.wert ? 'is-active' : ''} onClick={() => setFilter(f.wert)} disabled={f.wert === 'meine' && !ich} title={f.wert === 'meine' && !ich ? 'Unter „Mein Tag“ auswählen, wer du bist' : undefined}>
              {f.label}
            </button>
          ))}
        </div>
        {alleLabels.length > 0 && (
          <div className="chips" aria-label="Labels">
            {alleLabels.map((l) => (
              <button key={l} type="button" className={`chip${label === l ? ' is-active' : ''}`} onClick={() => setLabel(label === l ? '' : l)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="button small kanban-einstellungen" onClick={() => setSpaltenDialog(true)}>
          Spalten bearbeiten
        </button>
      </div>

      <div className="kanban" ref={(el) => {
          scroller.current = el;
        }}>
        {spalten.map((spalte) => {
          const karten = (gruppen.get(spalte.id) ?? []).filter(sichtbar);
          const ohneGezogen = karten.filter((a) => a.id !== drag?.id);
          const platzhalter = drag?.ziel?.spalteId === spalte.id ? drag.ziel.index : -1;
          return (
            <section key={spalte.id} className={`kanban-spalte${spalte.erledigt ? ' is-erledigt' : ''}${platzhalter >= 0 ? ' is-ziel' : ''}`} aria-label={spalte.titel}>
              <header className="kanban-kopf">
                <h2>{spalte.titel}</h2>
                <span className="count">{(gruppen.get(spalte.id) ?? []).length}</span>
              </header>
              <ul className="kanban-karten" ref={spalteRef(spalte.id)}>
                {ohneGezogen.map((a, i) => (
                  <KartenPlatz key={a.id} zeigePlatzhalter={platzhalter === i}>
                    <li
                      className={`karte is-${faelligkeit(a, heute)}`}
                      data-karte-id={a.id}
                      tabIndex={0}
                      role="button"
                      onPointerDown={griff(a.id)}
                      onClick={() => oeffnen(a)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDialog({ aufgabe: a });
                        }
                      }}
                    >
                      <KarteInhalt aufgabe={a} heute={heute} kommentare={kommentarZahl.get(a.id) ?? 0} />
                    </li>
                  </KartenPlatz>
                ))}
                {platzhalter >= ohneGezogen.length && <li className="karte-platzhalter" aria-hidden="true" />}
                {karten.length === 0 && platzhalter < 0 && <li className="kanban-leer">{filter === 'alle' && !label ? 'Keine Karten' : 'Nichts für diesen Filter'}</li>}
              </ul>
              <SchnellAnlegen onAnlegen={anlegen(spalte.id)} />
            </section>
          );
        })}
      </div>

      {drag && gezogen && (
        <div className="karte is-fliegend" style={{ left: drag.x - drag.griffX, top: drag.y - drag.griffY, width: drag.breite }} aria-hidden="true">
          <KarteInhalt aufgabe={gezogen} heute={heute} kommentare={kommentarZahl.get(gezogen.id) ?? 0} />
        </div>
      )}

      {dialog && (
        <KarteDialog
          board={board}
          aufgabe={dialog.aufgabe}
          spalteId={dialog.spalteId}
          kommentarId={dialog.kommentarId}
          kommentare={daten.kommentare}
          team={team}
          istKundenBoard={Boolean(board.firma_id)}
          aendern={aendern}
          onClose={() => setDialog(null)}
        />
      )}
      {spaltenDialog && <SpaltenDialog board={board} aendern={aendern} onClose={() => setSpaltenDialog(false)} />}
    </div>
  );
}

function KartenPlatz({ zeigePlatzhalter, children }: { zeigePlatzhalter: boolean; children: ReactNode }) {
  return (
    <>
      {zeigePlatzhalter && <li className="karte-platzhalter" aria-hidden="true" />}
      {children}
    </>
  );
}
