import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { kundenListe } from '../data/kunden';
import { boardVon, faelligkeit, INTERNES_BOARD_TITEL, istErledigt } from '../data/todos';
import type { Aufgabe, Board, Firma } from '../data/types';
import { errorMessage } from '../lib/errors';
import { useTodoDaten } from './useTodoDaten';

function Zahlen({ karten, heute }: { karten: Aufgabe[]; heute: string }) {
  const offen = karten.filter((a) => !istErledigt(a));
  const ueber = offen.filter((a) => faelligkeit(a, heute) === 'ueberfaellig').length;
  const bald = offen.filter((a) => ['heute', 'bald'].includes(faelligkeit(a, heute))).length;
  return (
    <span className="tool-figures board-zahlen">
      <span>
        <strong>{offen.length}</strong> offen
      </span>
      {bald > 0 && (
        <span>
          <strong>{bald}</strong> bald fällig
        </span>
      )}
      {ueber > 0 && (
        <span className="is-ueberfaellig">
          <strong>{ueber}</strong> überfällig
        </span>
      )}
    </span>
  );
}

/** The internal board and one per client; boards that do not exist yet are created with one click. */
export function BoardsPage() {
  const { db, error: dbError, refresh } = useCrm();
  const { data, error, reload, aendern } = useTodoDaten();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const heute = isoDate(new Date());

  if (!db) return <div className="page">{dbError ? <ErrorBox error={dbError} onRetry={refresh} /> : <Loading />}</div>;

  const anlegen = async (firmaId: string) => {
    setBusy(firmaId || 'intern');
    try {
      const board = await aendern((s) => s.boardFuer(firmaId));
      navigate(`/todo/${board.id}`);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      setBusy('');
    }
  };

  const aktiveBoards = new Set((data?.boards ?? []).filter((b) => !b.archiviert).map((b) => b.id));
  const offen = (data?.aufgaben ?? []).filter((x) => aktiveBoards.has(x.board_id) && !x.archiviert && !istErledigt(x));

  const eintraege: { firma: Firma | null; board?: Board }[] = [
    { firma: null, board: data && boardVon(data.boards, '') },
    ...kundenListe(db).map((firma) => ({ firma, board: data && boardVon(data.boards, firma.id) })),
  ];

  return (
    <div className="page wide">
      <PageHeader
        title="To-Dos"
        subtitle="Ein Board für Velonify und eins pro Kunde"
        zahlen={
          data
            ? [
                { wert: offen.length, label: 'offene Karten' },
                { wert: offen.filter((x) => faelligkeit(x, heute) === 'ueberfaellig').length, label: 'überfällig', warn: offen.some((x) => faelligkeit(x, heute) === 'ueberfaellig') },
                { wert: offen.filter((x) => ['heute', 'bald'].includes(faelligkeit(x, heute))).length, label: 'bald fällig' },
                { wert: data.boards.filter((b) => !b.archiviert).length, label: 'Boards' },
              ]
            : undefined
        }
        ueberlappen
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <ul className="kunden-karten">
          {eintraege.map(({ firma, board }) => {
            const schluessel = firma?.id ?? 'intern';
            const titel = firma ? firma.name : INTERNES_BOARD_TITEL;
            return (
              <li key={schluessel} className={`kunden-karte${firma ? '' : ' is-intern'}`}>
                {board ? (
                  <Link to={`/todo/${board.id}`} className="kunden-karte-kopf">
                    {firma?.kuerzel && <span className="kuerzel">{firma.kuerzel}</span>}
                    <span className="kunden-karte-name">{titel}</span>
                  </Link>
                ) : (
                  <span className="kunden-karte-kopf">
                    {firma?.kuerzel && <span className="kuerzel">{firma.kuerzel}</span>}
                    <span className="kunden-karte-name">{titel}</span>
                  </span>
                )}
                {board ? (
                  <Zahlen karten={data.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert)} heute={heute} />
                ) : (
                  <button type="button" className="button small board-anlegen" onClick={() => void anlegen(firma?.id ?? '')} disabled={busy !== ''}>
                    {busy === schluessel ? 'Legt an …' : 'Board anlegen'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
