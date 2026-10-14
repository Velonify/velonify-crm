import { Link, useParams } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { BoardAnsicht } from './BoardAnsicht';
import { useTodoDaten } from './useTodoDaten';

export function BoardPage() {
  const { id = '' } = useParams();
  const { db } = useCrm();
  const { data, error, reload, setData, aendern } = useTodoDaten();
  const board = data?.boards.find((b) => b.id === id);
  const firma = board?.firma_id ? db?.firmen.find((f) => f.id === board.firma_id) : undefined;

  return (
    <div className="page full">
      <PageHeader
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/todo">To-Dos</Link>
          </nav>
        }
        title={board?.titel ?? 'Board'}
        actions={
          firma && (
            <Link to={`/kunden/${firma.id}`} className="button">
              Zum Kunden
            </Link>
          )
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
