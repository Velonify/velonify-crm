import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { addDays, isoDate } from '../data/ids';
import { boardKurz, faelligkeit, istErledigt, kuerzlichErledigt, sortiereBoards } from '../data/todos';
import { BoardAnsicht } from './BoardAnsicht';
import { useTodoDaten } from './useTodoDaten';

export function BoardPage() {
  const { id = '' } = useParams();
  const { db } = useCrm();
  const navigate = useNavigate();
  const { data, error, reload, setData, aendern } = useTodoDaten();
  const board = data?.boards.find((b) => b.id === id);
  const heute = isoDate(new Date());
  const firma = board?.firma_id ? db?.firmen.find((f) => f.id === board.firma_id) : undefined;

  return (
    <div className="page full">
      <PageHeader
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/todo">To-Dos · Übersicht</Link>
          </nav>
        }
        title={board?.titel ?? 'Board'}
        zahlen={
          board && data
            ? (() => {
                const karten = data.aufgaben.filter((x) => x.board_id === board.id && !x.archiviert);
                const offen = karten.filter((x) => !istErledigt(x));
                const ueber = offen.filter((x) => faelligkeit(x, heute) === 'ueberfaellig').length;
                return [
                  { wert: offen.length, label: 'offen' },
                  { wert: ueber, label: 'überfällig', warn: ueber > 0 },
                  { wert: kuerzlichErledigt(data.aufgaben, board.id, addDays(heute, -7)).length, label: 'erledigt in 7 Tagen' },
                ];
              })()
            : undefined
        }
        actions={
          <>
            {data && db && data.boards.filter((b) => !b.archiviert).length > 1 && (
              <label className="ich-auswahl">
                Board
                <select value={board?.id ?? ''} onChange={(e) => navigate(`/todo/${e.target.value}`)}>
                  {sortiereBoards(data.boards, db.firmen).map((b) => (
                    <option key={b.id} value={b.id}>
                      {boardKurz(b, db.firmen)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {firma && (
              <Link to={`/kunden/${firma.id}`} className="button">
                Zum Kunden
              </Link>
            )}
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !board && (
        <p>
          Dieses Board gibt es nicht (mehr). <Link to="/todo">Zu allen Boards</Link>
        </p>
      )}
      {data && board && db && <BoardAnsicht board={board} daten={data} setDaten={setData} team={db.listen.team ?? []} aendern={aendern} />}
    </div>
  );
}
