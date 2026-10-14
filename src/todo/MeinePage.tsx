import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { faelligkeit, meineAufgaben, type Faelligkeit } from '../data/todos';
import type { Aufgabe } from '../data/types';
import { errorMessage } from '../lib/errors';
import { faelligText } from '../lib/format';
import { useIch } from '../lib/useIch';
import { KarteDialog } from './Dialoge';
import { useTodoDaten } from './useTodoDaten';

const GRUPPEN: { wert: Faelligkeit; titel: string }[] = [
  { wert: 'ueberfaellig', titel: 'Überfällig' },
  { wert: 'heute', titel: 'Heute' },
  { wert: 'bald', titel: 'Nächste Tage' },
  { wert: 'spaeter', titel: 'Später' },
  { wert: 'ohne', titel: 'Ohne Datum' },
];

/** All open cards of one person across boards, grouped by due date. */
export function MeinePage() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);
  const { data, error, reload, aendern } = useTodoDaten();
  const toast = useToast();
  const [offen, setOffen] = useState<Aufgabe | null>(null);
  const heute = isoDate(new Date());
  const karten = useMemo(() => (data && ich ? meineAufgaben(data.aufgaben, data.boards, ich) : []), [data, ich]);

  const abhaken = (a: Aufgabe) => aendern((s) => s.setKarteErledigt(a.id, true)).then(() => toast.show(`„${a.titel}“ erledigt`), (err) => toast.show(errorMessage(err), 'error'));
  const board = (a: Aufgabe) => data?.boards.find((b) => b.id === a.board_id);

  return (
    <div className="page">
      <PageHeader
        title="Meine Aufgaben"
        zahlen={[
          { wert: karten.length, label: 'offen über alle Boards' },
          { wert: karten.filter((x) => faelligkeit(x, heute) === 'ueberfaellig').length, label: 'überfällig', warn: karten.some((x) => faelligkeit(x, heute) === 'ueberfaellig') },
          { wert: karten.filter((x) => faelligkeit(x, heute) === 'heute').length, label: 'heute' },
        ]}
        // Only cards may lie over the band; a plain hint would end up on bordeaux.
        ueberlappen={karten.length > 0}
        actions={
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
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !ich && <p className="muted">Oben auswählen, wer du bist.</p>}
      {data && ich && karten.length === 0 && <p className="muted">Nichts offen. Schön.</p>}
      {GRUPPEN.map((g) => {
        const liste = karten.filter((a) => faelligkeit(a, heute) === g.wert);
        if (liste.length === 0) return null;
        return (
          <Card key={g.wert} title={<>{g.titel} <span className="count">{liste.length}</span></>} className={g.wert === 'ueberfaellig' ? 'task-card overdue' : 'task-card'}>
            <ul className="task-list">
              {liste.map((a) => (
                <li key={a.id} className={g.wert === 'ueberfaellig' ? 'overdue' : g.wert === 'heute' ? 'today' : ''}>
                  <input type="checkbox" onChange={() => void abhaken(a)} aria-label={`„${a.titel}“ erledigt`} />
                  <div className="task-body">
                    <button type="button" className="link-button" onClick={() => setOffen(a)}>
                      {a.titel}
                    </button>
                    <div className="row-sub">
                      <Link to={`/todo/${a.board_id}`}>{board(a)?.titel}</Link>
                      {a.faellig_am && <> · {faelligText(a.faellig_am, heute)}</>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {offen && data && board(offen) && (
        <KarteDialog board={board(offen)!} aufgabe={offen} kommentare={data.kommentare} team={team} istKundenBoard={Boolean(board(offen)!.firma_id)} aendern={aendern} onClose={() => setOffen(null)} />
      )}
    </div>
  );
}
