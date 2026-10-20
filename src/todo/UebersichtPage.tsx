import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { addDays, isoDate } from '../data/ids';
import { kundenListe } from '../data/kunden';
import { FREIGABE_LABEL, freigabeVon } from '../data/portal';
import {
  ALLE, boardKurz, boardVon, brauchtAufmerksamkeit, checklisteVon, faelligkeit, gruppiereKarten, istErledigt, kanbanSpalten, kartenNachSpalte, labelsVon,
  NIEMAND, offeneKarten, passtUebersicht, sortiereBoards, sortierungFuerPosition, spalteDerKarte, spalteFuerKey, spaltenVon, type Gruppierung, type KanbanSpalte,
} from '../data/todos';
import type { Aufgabe, Board, Firma } from '../data/types';
import { kuerzelVon } from '../data/zustaendig';
import { errorMessage } from '../lib/errors';
import { faelligText } from '../lib/format';
import { useIch } from '../lib/useIch';
import { KarteDialog } from './Dialoge';
import { UebersichtKanban } from './UebersichtKanban';
import type { DragZiel } from './useKanbanDrag';
import { useTodoDaten } from './useTodoDaten';

const ANSICHTEN: { wert: Gruppierung; label: string }[] = [
  { wert: 'status', label: 'Status' },
  { wert: 'faelligkeit', label: 'Fälligkeit' },
  { wert: 'board', label: 'Board' },
  { wert: 'person', label: 'Person' },
];

const ANSICHT_KEY = 'velonify-crm.todo-ansicht';

function gemerkteAnsicht(): Gruppierung {
  try {
    const wert = localStorage.getItem(ANSICHT_KEY);
    return ANSICHTEN.some((a) => a.wert === wert) ? (wert as Gruppierung) : 'status';
  } catch {
    return 'status';
  }
}

type Darstellung = 'liste' | 'board';
const DARSTELLUNG_KEY = 'velonify-crm.todo-darstellung';

function gemerkteDarstellung(): Darstellung {
  try {
    return localStorage.getItem(DARSTELLUNG_KEY) === 'board' ? 'board' : 'liste';
  } catch {
    return 'liste';
  }
}

function merke(key: string, wert: string) {
  try {
    localStorage.setItem(key, wert);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

interface Kontext {
  boards: Map<string, Board>;
  firmen: readonly Firma[];
  heute: string;
  kommentarZahl: Map<string, number>;
  /** Hidden in the row when the group or filter already says it. */
  ohneBoard: boolean;
  ohneSpalte: boolean;
  abhaken(a: Aufgabe): void;
  verschieben(a: Aufgabe, spalteId: string): void;
  oeffnen(a: Aufgabe): void;
}

function KartenZeile({ aufgabe: a, k }: { aufgabe: Aufgabe; k: Kontext }) {
  const board = k.boards.get(a.board_id)!;
  const spalten = spaltenVon(board);
  const spalte = spalteDerKarte(a, board);
  const faellig = faelligkeit(a, k.heute);
  const punkte = checklisteVon(a);
  const fertig = punkte.filter((p) => p.erledigt).length;
  const kommentare = k.kommentarZahl.get(a.id) ?? 0;
  const freigabe = freigabeVon(a);
  return (
    <li className={`uebersicht-zeile is-${faellig}`}>
      <input type="checkbox" checked={false} onChange={() => k.abhaken(a)} aria-label={`„${a.titel}“ erledigt`} />
      <div className="uebersicht-inhalt">
        <button type="button" className="uebersicht-titel" onClick={() => k.oeffnen(a)}>
          {a.titel}
        </button>
        <div className="uebersicht-meta">
          {!k.ohneBoard && (
            <Link to={`/todo/${board.id}`} className="kuerzel" title={board.titel}>
              {boardKurz(board, k.firmen)}
            </Link>
          )}
          {a.faellig_am && <span className={`karte-faellig is-${faellig}`}>{faelligText(a.faellig_am, k.heute)}</span>}
          {freigabe && <span className={`badge freigabe-${freigabe}`}>{FREIGABE_LABEL[freigabe]}</span>}
          {labelsVon(a).map((l) => (
            <span key={l} className="karte-label">
              {l}
            </span>
          ))}
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
          {a.quelle_link && (
            <a href={a.quelle_link} target="_blank" rel="noreferrer" className="uebersicht-quelle">
              {a.quelle === 'agent' || /slack\.com/.test(a.quelle_link) ? 'Slack' : 'Quelle'}
            </a>
          )}
        </div>
      </div>
      <select className={`uebersicht-spalte${k.ohneSpalte ? ' is-leise' : ''}`} value={spalte.id} onChange={(e) => k.verschieben(a, e.target.value)} aria-label={`Spalte von „${a.titel}“`}>
        {spalten.map((s) => (
          <option key={s.id} value={s.id}>
            {s.titel}
          </option>
        ))}
      </select>
      <span className="karte-personen" title={a.zustaendig || 'Niemand zuständig'}>
        {a.zustaendig ? (
          kuerzelVon(a.zustaendig).map((x, i) => (
            <span key={i} className="karte-person">
              {x}
            </span>
          ))
        ) : (
          <span className="karte-person is-leer">–</span>
        )}
      </span>
    </li>
  );
}

function SchnellErfassen({
  boards,
  firmen,
  boardId,
  person,
  onAnlegen,
}: {
  boards: Board[];
  firmen: readonly Firma[];
  boardId: string;
  person: string;
  onAnlegen(boardId: string, titel: string): Promise<void>;
}) {
  const [titel, setTitel] = useState('');
  const [ziel, setZiel] = useState('');
  const [busy, setBusy] = useState(false);
  const gewaehlt = boardId || ziel || boards[0]?.id || '';
  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (!titel.trim() || !gewaehlt) return;
    setBusy(true);
    try {
      await onAnlegen(gewaehlt, titel);
      setTitel('');
    } catch {
      // The toast already says what went wrong; the title stays for another try.
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="uebersicht-erfassen" onSubmit={(e) => void absenden(e)}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Neue Karte – Enter legt an" aria-label="Titel der neuen Karte" disabled={busy} maxLength={200} />
      <select value={gewaehlt} onChange={(e) => setZiel(e.target.value)} disabled={busy || Boolean(boardId)} aria-label="Board der neuen Karte">
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {boardKurz(b, firmen)}
          </option>
        ))}
      </select>
      <button type="submit" className="button small primary" disabled={busy || !titel.trim()}>
        {busy ? 'Legt an …' : 'Anlegen'}
      </button>
      {person && person !== NIEMAND && <span className="muted uebersicht-erfassen-hinweis">für {person}, im Backlog</span>}
    </form>
  );
}

/**
 * All open cards of every board on one page: grouped by status, due date, board or person, filtered by person, board
 * and text. Status and done can be changed right in the row; the board list on the side leads to the kanban boards.
 * On /todo/meine the person is fixed to whoever is signed in.
 */
export function UebersichtPage({ nurIch = false }: { nurIch?: boolean }) {
  const { db, error: dbError, refresh } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);
  const { data, error, reload, setData, aendern } = useTodoDaten();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [offen, setOffen] = useState<Aufgabe | null>(null);
  const [busy, setBusy] = useState('');
  const heute = isoDate(new Date());

  const ansichten = nurIch ? ANSICHTEN.filter((a) => a.wert !== 'person') : ANSICHTEN;
  const gewuenscht = ansichten.find((a) => a.wert === params.get('ansicht'))?.wert ?? gemerkteAnsicht();
  const ansicht: Gruppierung = ansichten.some((a) => a.wert === gewuenscht) ? gewuenscht : 'status';
  const person = nurIch ? ich ?? '' : params.get('person') ?? ALLE;
  const boardId = params.get('board') ?? '';
  const darstellungParam = params.get('darstellung');
  const darstellung: Darstellung = darstellungParam === 'board' || darstellungParam === 'liste' ? darstellungParam : gemerkteDarstellung();
  const suche = params.get('q') ?? '';

  const setParam = (name: string, wert: string) =>
    setParams(
      (p) => {
        const neu = new URLSearchParams(p);
        if (wert) neu.set(name, wert);
        else neu.delete(name);
        return neu;
      },
      { replace: true },
    );

  const firmen = db?.firmen ?? [];
  const boards = useMemo(() => (data ? sortiereBoards(data.boards, firmen) : []), [data, firmen]);
  const boardMap = useMemo(() => new Map((data?.boards ?? []).map((b) => [b.id, b])), [data]);
  const alleOffenen = useMemo(() => (data ? offeneKarten(data.aufgaben, data.boards) : []), [data]);
  const filter = { person, boardId, suche };
  // On „Meine Aufgaben“ nobody chosen means nothing to show, not everything.
  const niemandGewaehlt = nurIch && !ich;
  const sichtbar = niemandGewaehlt ? [] : alleOffenen.filter((a) => passtUebersicht(a, filter));
  const gruppen = gruppiereKarten(sichtbar, ansicht, { boards: data?.boards ?? [], firmen, team, heute });
  const dringend = ansicht === 'faelligkeit' ? [] : sichtbar.filter((a) => brauchtAufmerksamkeit(a, heute)).sort((a, b) => (a.faellig_am || '9999').localeCompare(b.faellig_am || '9999'));
  const kommentarZahl = useMemo(() => {
    const zahl = new Map<string, number>();
    for (const k of data?.kommentare ?? []) zahl.set(k.aufgabe_id, (zahl.get(k.aufgabe_id) ?? 0) + 1);
    return zahl;
  }, [data]);
  const erledigt = useMemo(() => {
    if (!data || (nurIch && !ich)) return [];
    const seit = addDays(heute, -7);
    return data.aufgaben
      .filter((a) => boardMap.has(a.board_id) && !boardMap.get(a.board_id)!.archiviert && !a.archiviert && istErledigt(a) && a.erledigt_am.slice(0, 10) >= seit)
      .filter((a) => passtUebersicht(a, filter))
      .sort((a, b) => b.erledigt_am.localeCompare(a.erledigt_am));
  }, [data, boardMap, heute, person, boardId, suche, nurIch, ich]);

  if (!db) return <div className="page">{dbError ? <ErrorBox error={dbError} onRetry={refresh} /> : <Loading />}</div>;

  /** Optimistic change in the list, then the write; on failure the reload in `aendern` puts the truth back. */
  const lokal = (id: string, changes: Partial<Aufgabe>) => data && setData({ ...data, aufgaben: data.aufgaben.map((a) => (a.id === id ? { ...a, ...changes } : a)) });

  const abhaken = (a: Aufgabe) => {
    lokal(a.id, { erledigt_am: new Date().toISOString() });
    aendern((s) => s.setKarteErledigt(a.id, true)).then(
      () => toast.show(`„${a.titel}“ erledigt`),
      (err) => toast.show(errorMessage(err), 'error'),
    );
  };
  const zurueckholen = (a: Aufgabe) =>
    aendern((s) => s.setKarteErledigt(a.id, false)).then(
      () => toast.show(`„${a.titel}“ wieder offen`),
      (err) => toast.show(errorMessage(err), 'error'),
    );
  const verschieben = (a: Aufgabe, spalteId: string) => {
    const board = boardMap.get(a.board_id);
    const ziel = board && spaltenVon(board).find((s) => s.id === spalteId);
    lokal(a.id, { spalte_id: spalteId, ...(ziel?.erledigt ? { erledigt_am: new Date().toISOString() } : {}) });
    aendern((s) => s.verschiebeKarte(a.id, spalteId, Infinity)).then(
      () => toast.show(`„${a.titel}“ → ${ziel?.titel ?? 'verschoben'}`),
      (err) => toast.show(errorMessage(err), 'error'),
    );
  };
  const anlegen = async (zielBoard: string, titel: string, spalteId?: string) => {
    try {
      await aendern((s) =>
        s.saveKarte(zielBoard, {
          titel, beschreibung: '', zustaendig: person && person !== NIEMAND ? person : '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false,
          ...(spalteId ? { spalte_id: spalteId } : {}),
        }),
      );
      toast.show('Karte angelegt');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      throw err;
    }
  };
  const einzelBoard = boardId ? boardMap.get(boardId) : undefined;
  /** Drop on the overview board: on one board at the exact place, across boards only into the column of the same name. */
  const ablegen = (a: Aufgabe, ziel: DragZiel, zielSpalte: KanbanSpalte) => {
    const board = boardMap.get(a.board_id);
    if (!board || !data) return;
    const spalte = spalteFuerKey(board, ziel.spalteId, Boolean(einzelBoard));
    if (!spalte) {
      toast.show(`${boardKurz(board, firmen)} hat keine Spalte „${zielSpalte.titel}“ – Karte bleibt, wo sie ist.`, 'error');
      return;
    }
    const vorher = spalteDerKarte(a, board);
    let index = Infinity;
    let sortierung: number | undefined;
    if (einzelBoard) {
      // The index counts the visible cards; translate it to the full column, as on the board page.
      const ganz = (kartenNachSpalte(data.aufgaben, board).get(spalte.id) ?? []).filter((x) => x.id !== a.id);
      const nachbar = zielSpalte.karten.filter((x) => x.id !== a.id)[ziel.index];
      index = nachbar ? ganz.indexOf(nachbar) : ganz.length;
      if (vorher.id === spalte.id && (kartenNachSpalte(data.aufgaben, board).get(spalte.id) ?? []).indexOf(a) === index) return;
      sortierung = sortierungFuerPosition(ganz, a.id, index);
    } else if (vorher.id === spalte.id) return;
    lokal(a.id, {
      spalte_id: spalte.id,
      ...(sortierung !== undefined ? { sortierung } : {}),
      erledigt_am: spalte.erledigt ? a.erledigt_am || new Date().toISOString() : '',
    });
    aendern((s) => s.verschiebeKarte(a.id, spalte.id, index)).then(
      () => vorher.id !== spalte.id && toast.show(`„${a.titel}“ → ${spalte.titel}`),
      (err) => toast.show(errorMessage(err), 'error'),
    );
  };
  const boardAnlegen = async (firmaId: string) => {
    setBusy(firmaId || 'intern');
    try {
      const board = await aendern((s) => s.boardFuer(firmaId));
      navigate(`/todo/${board.id}`);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      setBusy('');
    }
  };

  const k: Kontext | null = data ? {
    boards: boardMap,
    firmen,
    heute,
    kommentarZahl,
    ohneBoard: Boolean(boardId) || ansicht === 'board',
    ohneSpalte: ansicht === 'status',
    abhaken,
    verschieben,
    oeffnen: setOffen,
  } : null;

  const ueber = sichtbar.filter((a) => faelligkeit(a, heute) === 'ueberfaellig').length;
  const ohneBoard = [{ firma: null as Firma | null }, ...kundenListe(db).map((firma) => ({ firma }))].filter(({ firma }) => data && !boardVon(data.boards, firma?.id ?? ''));
  const gefiltert = Boolean(boardId || suche || (!nurIch && person));
  const offenesBoard = offen && boardMap.get(offen.board_id);

  return (
    <div className="page wide">
      <PageHeader
        title={nurIch ? 'Meine Aufgaben' : 'To-Dos'}
        subtitle={nurIch ? 'Alles, wofür du zuständig bist – über alle Boards' : 'Alle offenen Karten, intern und von allen Kunden, auf einen Blick'}
        zahlen={
          data
            ? [
                { wert: sichtbar.length, label: gefiltert || nurIch ? 'offen im Filter' : 'offen' },
                { wert: ueber, label: 'überfällig', warn: ueber > 0 },
                { wert: sichtbar.filter((a) => faelligkeit(a, heute) === 'heute').length, label: 'heute fällig' },
                { wert: sichtbar.filter((a) => a.freigabe === 'offen').length, label: 'beim Kunden zur Freigabe' },
                { wert: erledigt.length, label: 'erledigt in 7 Tagen' },
              ]
            : undefined
        }
        actions={
          nurIch && (
            <label className="ich-auswahl">
              Ich bin
              <select value={ich ?? ''} onChange={(e) => setIch(e.target.value)}>
                <option value="">–</option>
                {team.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && k && (
        <div className={`uebersicht${darstellung === 'board' ? ' is-board' : ''}`}>
          <div className="uebersicht-haupt">
            <div className="uebersicht-filter">
              <div className="uebersicht-filter-zeile">
                <div className="segmented" role="group" aria-label="Darstellung">
                  {(['liste', 'board'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={darstellung === d ? 'is-active' : ''}
                      aria-pressed={darstellung === d}
                      onClick={() => {
                        merke(DARSTELLUNG_KEY, d);
                        setParam('darstellung', d);
                      }}
                    >
                      {d === 'liste' ? 'Liste' : 'Board'}
                    </button>
                  ))}
                </div>
                {darstellung === 'liste' && (
                  <div className="segmented" role="group" aria-label="Gruppieren nach">
                    {ansichten.map((a) => (
                      <button
                        key={a.wert}
                        type="button"
                        className={ansicht === a.wert ? 'is-active' : ''}
                        aria-pressed={ansicht === a.wert}
                        onClick={() => {
                          merke(ANSICHT_KEY, a.wert);
                          setParam('ansicht', a.wert);
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
                <input type="search" className="uebersicht-suche" value={suche} onChange={(e) => setParam('q', e.target.value)} placeholder="Karten durchsuchen" aria-label="Karten durchsuchen" />
              </div>
              {!nurIch && (
                <div className="chips" role="group" aria-label="Person">
                  <button type="button" className={`chip${person === ALLE ? ' is-active' : ''}`} onClick={() => setParam('person', '')}>
                    Alle
                  </button>
                  {team.map((t) => (
                    <button key={t} type="button" className={`chip${person === t ? ' is-active' : ''}`} onClick={() => setParam('person', person === t ? '' : t)}>
                      {t}
                      {t === ich ? ' (ich)' : ''}
                    </button>
                  ))}
                  <button type="button" className={`chip${person === NIEMAND ? ' is-active' : ''}`} onClick={() => setParam('person', person === NIEMAND ? '' : NIEMAND)}>
                    Niemand
                  </button>
                </div>
              )}
              <div className="chips" role="group" aria-label="Board">
                <button type="button" className={`chip${!boardId ? ' is-active' : ''}`} onClick={() => setParam('board', '')}>
                  Alle Boards
                </button>
                {boards.map((b) => (
                  <button key={b.id} type="button" className={`chip${boardId === b.id ? ' is-active' : ''}`} onClick={() => setParam('board', boardId === b.id ? '' : b.id)} title={b.titel}>
                    {boardKurz(b, firmen)}
                  </button>
                ))}
              </div>
              {boards.length > 0 && <SchnellErfassen boards={boards} firmen={firmen} boardId={boardId} person={person} onAnlegen={anlegen} />}
            </div>

            {nurIch && !ich && <p className="muted">Oben auswählen, wer du bist.</p>}

            {darstellung === 'board' && (!nurIch || ich) && (
              <>
                {einzelBoard ? (
                  <p className="muted uebersicht-board-hinweis">
                    Spalten von {einzelBoard.titel}. <Link to={`/todo/${einzelBoard.id}`}>Board öffnen</Link> für Spalten und Labels.
                  </p>
                ) : (
                  <p className="muted uebersicht-board-hinweis">Spalten aller Boards nach Namen zusammengefasst. Für die Reihenfolge innerhalb einer Spalte oben ein Board wählen.</p>
                )}
                <UebersichtKanban
                  spalten={kanbanSpalten([...sichtbar, ...erledigt], data.boards, einzelBoard)}
                  einzeln={Boolean(einzelBoard)}
                  boards={boardMap}
                  firmen={firmen}
                  heute={heute}
                  kommentarZahl={kommentarZahl}
                  onAblegen={ablegen}
                  onOeffnen={setOffen}
                  onAnlegen={einzelBoard ? (spalteId, titel) => anlegen(einzelBoard.id, titel, spalteId) : undefined}
                />
              </>
            )}

            {darstellung === 'liste' && dringend.length > 0 && (
              <section className="uebersicht-gruppe is-dringend" aria-label="Braucht Aufmerksamkeit">
                <header className="uebersicht-gruppe-kopf">
                  <h2>Braucht Aufmerksamkeit</h2>
                  <span className="count">{dringend.length}</span>
                  <span className="muted uebersicht-gruppe-hinweis">überfällig, heute fällig oder vom Kunden zurückgegeben</span>
                </header>
                <ul className="uebersicht-liste">
                  {dringend.map((a) => (
                    <KartenZeile key={a.id} aufgabe={a} k={{ ...k, ohneSpalte: false }} />
                  ))}
                </ul>
              </section>
            )}

            {darstellung === 'liste' && gruppen.map((g) => (
              <section key={g.id} className={`uebersicht-gruppe is-${ansicht}-${g.id}`} aria-label={g.titel}>
                <header className="uebersicht-gruppe-kopf">
                  <h2>{g.board ? <Link to={`/todo/${g.board.id}`}>{g.titel}</Link> : g.titel}</h2>
                  <span className="count">{g.karten.length}</span>
                  {g.board && (
                    <Link to={`/todo/${g.board.id}`} className="button small subtle uebersicht-gruppe-aktion">
                      Board öffnen
                    </Link>
                  )}
                </header>
                <ul className="uebersicht-liste">
                  {g.karten.map((a) => (
                    <KartenZeile key={a.id} aufgabe={a} k={k} />
                  ))}
                </ul>
              </section>
            ))}

            {darstellung === 'liste' && (!nurIch || ich) && sichtbar.length === 0 && (
              <div className="uebersicht-leer">
                {alleOffenen.length === 0 ? 'Nichts offen. Schön.' : 'Nichts für diesen Filter.'}
                {gefiltert && (
                  <button type="button" className="button small" onClick={() => setParams(new URLSearchParams({ ansicht, darstellung }), { replace: true })}>
                    Filter zurücksetzen
                  </button>
                )}
              </div>
            )}
          </div>

          {darstellung === 'liste' && (
            <aside className="uebersicht-seite">
              <section className="card uebersicht-boards">
                <header className="card-header">
                  <h2>Boards</h2>
                </header>
                <ul>
                  {boards.map((b) => {
                    const karten = alleOffenen.filter((a) => a.board_id === b.id);
                    const zuViel = karten.filter((a) => faelligkeit(a, heute) === 'ueberfaellig').length;
                    const spalten = spaltenVon(b).filter((s) => !s.erledigt);
                    return (
                      <li key={b.id}>
                        <Link to={`/todo/${b.id}`} className="uebersicht-board">
                          <span className="kuerzel">{boardKurz(b, firmen)}</span>
                          <span className="uebersicht-board-name">{b.firma_id ? firmen.find((f) => f.id === b.firma_id)?.name ?? b.titel : b.titel}</span>
                          <span className="uebersicht-board-zahl">
                            {zuViel > 0 && <span className="is-ueberfaellig">{zuViel} überfällig · </span>}
                            {karten.length} offen
                          </span>
                        </Link>
                        {karten.length > 0 && (
                          <span className="uebersicht-verteilung" aria-hidden="true">
                            {spalten.map((s, i) => {
                              const n = karten.filter((a) => spalteDerKarte(a, b).id === s.id).length;
                              return n > 0 ? <span key={s.id} className={`stufe-${Math.min(i, 4)}`} style={{ flexGrow: n }} title={`${s.titel}: ${n}`} /> : null;
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {ohneBoard.length > 0 && (
                  <div className="uebersicht-ohne-board">
                    <p className="muted">Noch ohne Board</p>
                    {ohneBoard.map(({ firma }) => (
                      <button key={firma?.id ?? 'intern'} type="button" className="button small" onClick={() => void boardAnlegen(firma?.id ?? '')} disabled={busy !== ''}>
                        {busy === (firma?.id ?? 'intern') ? 'Legt an …' : `${firma ? firma.kuerzel || firma.name : 'Velonify intern'} anlegen`}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {erledigt.length > 0 && (
                <section className="card uebersicht-erledigt">
                  <header className="card-header">
                    <h2>
                      Erledigt <span className="count">{erledigt.length}</span>
                    </h2>
                  </header>
                  <p className="muted">Letzte 7 Tage</p>
                  <ul>
                    {erledigt.slice(0, 12).map((a) => {
                      const b = boardMap.get(a.board_id)!;
                      return (
                        <li key={a.id}>
                          <input type="checkbox" checked onChange={() => void zurueckholen(a)} aria-label={`„${a.titel}“ wieder öffnen`} />
                          <span>
                            <button type="button" className="link-button" onClick={() => setOffen(a)}>
                              {a.titel}
                            </button>
                            <span className="row-sub">
                              {boardKurz(b, firmen)}
                              {a.erledigt_von && <> · {a.erledigt_von.split('@')[0]}</>}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </aside>
          )}
        </div>
      )}
      {offen && data && offenesBoard && (
        <KarteDialog board={offenesBoard} aufgabe={offen} kommentare={data.kommentare} team={team} istKundenBoard={Boolean(offenesBoard.firma_id)} aendern={aendern} onClose={() => setOffen(null)} />
      )}
    </div>
  );
}
