import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import type { Database, Whiteboard } from '../data/types';
import { relativeDays } from '../lib/format';
import { legeBoardAn } from './anlegen';
import { NeuesBoardDialog } from './Dialoge';
import { inhaltApi } from './inhalt';
import { useWhiteboardDaten } from './useWhiteboardDaten';
import './whiteboard.css';

type Filter = 'alle' | 'intern' | 'kunden' | 'archiv';

/** Small pictures of the boards, loaded once per visit of the overview. */
function useVorschauen(): Record<string, string> {
  const { getToken } = useAuth();
  const [vorschauen, setVorschauen] = useState<Record<string, string>>({});
  useEffect(() => {
    let weg = false;
    inhaltApi(getToken)
      .vorschauen()
      .then((v) => !weg && setVorschauen(v), () => undefined);
    return () => {
      weg = true;
    };
  }, [getToken]);
  return vorschauen;
}

export function BoardKachel({ board, db, vorschau }: { board: Whiteboard; db: Database; vorschau?: string }) {
  const firma = board.firma_id ? db.firmen.find((f) => f.id === board.firma_id) : undefined;
  return (
    <Link to={`/whiteboard/${board.id}`} className="wb-kachel">
      <span className="wb-kachel-bild">{vorschau ? <img src={vorschau} alt="" loading="lazy" /> : <span aria-hidden="true" className="wb-kachel-leer" />}</span>
      <span className="wb-kachel-text">
        <strong>{board.titel}</strong>
        <span>
          {firma?.name ?? 'Velonify intern'}
          {board.sichtbar_kunde ? ' · im Portal' : ''} · {relativeDays(board.geaendert_am)}
        </span>
      </span>
    </Link>
  );
}

export function WhiteboardUebersichtPage() {
  const { db, service } = useCrm();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useWhiteboardDaten();
  const vorschauen = useVorschauen();
  const [filter, setFilter] = useState<Filter>('alle');
  const [suche, setSuche] = useState('');
  const [neu, setNeu] = useState(false);

  const boards = useMemo(() => {
    if (!data || !db) return [];
    const text = suche.trim().toLowerCase();
    const name = (b: Whiteboard) => `${b.titel} ${db.firmen.find((f) => f.id === b.firma_id)?.name ?? ''}`.toLowerCase();
    return data.boards
      .filter((b) => (filter === 'archiv' ? b.archiviert : !b.archiviert))
      .filter((b) => (filter === 'intern' ? !b.firma_id : filter === 'kunden' ? Boolean(b.firma_id) : true))
      .filter((b) => !text || name(b).includes(text))
      .sort((a, b) => b.geaendert_am.localeCompare(a.geaendert_am));
  }, [data, db, filter, suche]);

  const aktiv = data?.boards.filter((b) => !b.archiviert) ?? [];
  const offen = data ? data.kommentare.filter((k) => !k.antwort_auf && !k.erledigt && aktiv.some((b) => b.id === k.board_id)).length : 0;

  return (
    <div className="page wide">
      <PageHeader
        title="Whiteboard"
        subtitle="Gemeinsam skizzieren: Sitemaps, User Flows, Workshops, live mit dem Team"
        zahlen={data ? [{ wert: aktiv.length, label: aktiv.length === 1 ? 'Board' : 'Boards' }, { wert: aktiv.filter((b) => b.firma_id).length, label: 'bei Kunden' }, { wert: offen, label: 'offene Kommentare' }] : undefined}
        actions={
          <button type="button" className="button primary" onClick={() => setNeu(true)} disabled={!db}>
            Neues Whiteboard
          </button>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {(!data || !db) && !error && <Loading />}
      {data && db && (
        <>
          <div className="wb-filter">
            <div className="segmented" role="tablist" aria-label="Filter">
              {(
                [
                  ['alle', 'Alle'],
                  ['intern', 'Velonify'],
                  ['kunden', 'Kunden'],
                  ['archiv', 'Archiv'],
                ] as const
              ).map(([wert, label]) => (
                <button key={wert} type="button" role="tab" aria-selected={filter === wert} className={filter === wert ? 'is-active' : undefined} onClick={() => setFilter(wert)}>
                  {label}
                </button>
              ))}
            </div>
            <input type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Board oder Kunde suchen" aria-label="Suchen" />
          </div>
          {boards.length === 0 ? (
            <p className="muted wb-leer">{filter === 'archiv' ? 'Keine archivierten Whiteboards.' : 'Noch kein Whiteboard. Leg eins an, leer oder mit einer Vorlage.'}</p>
          ) : (
            <div className="wb-kacheln">
              {boards.map((b) => (
                <BoardKachel key={b.id} board={b} db={db} vorschau={vorschauen[b.id]} />
              ))}
            </div>
          )}
        </>
      )}
      {neu && db && service && (
        <NeuesBoardDialog
          db={db}
          onClose={() => setNeu(false)}
          onAnlegen={async (input) => {
            const board = await legeBoardAn(service, inhaltApi(getToken), input);
            reload();
            navigate(`/whiteboard/${board.id}`);
          }}
        />
      )}
    </div>
  );
}

/** The boards of one firm, for its file in the CRM and the client hub. */
export function WhiteboardsDerFirma({ firmaId }: { firmaId: string }) {
  const { db, service } = useCrm();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { data, reload } = useWhiteboardDaten();
  const [neu, setNeu] = useState(false);
  const boards = (data?.boards ?? []).filter((b) => b.firma_id === firmaId && !b.archiviert).sort((a, b) => b.geaendert_am.localeCompare(a.geaendert_am));
  if (!db) return null;
  return (
    <section className="card wb-firma">
      <div className="card-header">
        <h2>Whiteboards</h2>
        <div className="card-actions">
          <button type="button" className="button small" onClick={() => setNeu(true)}>
            Neues Whiteboard
          </button>
        </div>
      </div>
      {boards.length === 0 ? (
        <p className="muted">Noch kein Whiteboard für diese Firma.</p>
      ) : (
        <ul className="wb-firma-liste">
          {boards.map((b) => (
            <li key={b.id}>
              <Link to={`/whiteboard/${b.id}`}>{b.titel}</Link>
              <span className="muted">
                {b.sichtbar_kunde ? 'im Portal · ' : ''}
                {relativeDays(b.geaendert_am)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {neu && service && (
        <NeuesBoardDialog
          db={db}
          firmaId={firmaId}
          onClose={() => setNeu(false)}
          onAnlegen={async (input) => {
            const board = await legeBoardAn(service, inhaltApi(getToken), input);
            reload();
            navigate(`/whiteboard/${board.id}`);
          }}
        />
      )}
    </section>
  );
}
