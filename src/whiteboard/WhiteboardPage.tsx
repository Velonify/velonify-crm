import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loading } from '../components/ui';
import { useToast } from '../components/Toasts';
import { useCrm } from '../data/CrmContext';
import { errorMessage } from '../lib/errors';
import { BoardEinstellungenDialog } from './Dialoge';
import { Leinwand } from './Leinwand';
import { useWhiteboardDaten } from './useWhiteboardDaten';
import './whiteboard.css';

/** One whiteboard: a slim bar with name, client and settings, below it the canvas over the full width. */
export function WhiteboardPage() {
  const { id = '' } = useParams();
  const [suche] = useSearchParams();
  const { db } = useCrm();
  const toast = useToast();
  const { data, error, reload, aendern } = useWhiteboardDaten();
  const [einstellungen, setEinstellungen] = useState(false);
  const board = data?.boards.find((b) => b.id === id);
  const firma = board?.firma_id ? db?.firmen.find((f) => f.id === board.firma_id) : undefined;
  const team = db?.listen.team ?? [];

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data || !db) return <div className="page"><Loading /></div>;
  if (!board) {
    return (
      <div className="page">
        <p>
          Dieses Whiteboard gibt es nicht (mehr). <Link to="/whiteboard">Zu allen Whiteboards</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page full wb-seite">
      <div className="wb-kopf">
        <nav aria-label="Pfad" className="wb-pfad">
          <Link to="/whiteboard">Whiteboards</Link>
          {firma && (
            <>
              {' · '}
              <Link to={firma.status === 'kunde' ? `/kunden/${firma.id}` : `/crm/firmen/${firma.id}`}>{firma.name}</Link>
            </>
          )}
        </nav>
        <h1>{board.titel}</h1>
        {board.archiviert && <span className="badge">archiviert</span>}
        {board.sichtbar_kunde && <span className="badge" title="Kunden sehen dieses Board im Portal (nur ansehen)">im Portal</span>}
        <button type="button" className="button small subtle" onClick={() => setEinstellungen(true)}>
          Einstellungen
        </button>
      </div>
      <Leinwand
        key={board.id}
        board={board}
        kommentare={data.kommentare.filter((k) => k.board_id === board.id)}
        team={team}
        startKommentar={suche.get('kommentar')}
        onKommentieren={async (k) => {
          await aendern((s) => s.whiteboardKommentieren(board, k, team));
        }}
        onErledigt={async (k, erledigt) => {
          await aendern((s) => s.whiteboardKommentarErledigt(k, erledigt)).catch((err) => toast.show(errorMessage(err), 'error'));
        }}
        onKommentareGeaendert={reload}
      />
      {einstellungen && (
        <BoardEinstellungenDialog
          db={db}
          board={board}
          onClose={() => setEinstellungen(false)}
          onSpeichern={async (changes) => {
            await aendern((s) => s.whiteboardAendern(board, changes));
            setEinstellungen(false);
            if (changes.archiviert !== undefined) toast.show(changes.archiviert ? 'Whiteboard archiviert.' : 'Whiteboard wiederhergestellt.');
          }}
        />
      )}
    </div>
  );
}
