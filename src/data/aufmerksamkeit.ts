import { kundenListe } from './kunden';
import { meinTag } from './selectors';
import { boardVon, faelligkeit, istErledigt } from './todos';
import type { Database, TodoDaten } from './types';

export interface Aufmerksamkeit {
  firmaId: string;
  name: string;
  /** Short reason under the name, e.g. "2 Karten überfällig". */
  grund: string;
  pfad: string;
}

const HOECHSTENS = 6;

/**
 * Firms that need someone now, for the sidebar: clients with overdue cards first, then leads whose follow-up or
 * next step is overdue for me. One line per firm, at most six.
 */
export function brauchtAufmerksamkeit(db: Database, todo: Pick<TodoDaten, 'boards' | 'aufgaben'> | undefined, ich: string | null, heute: string): Aufmerksamkeit[] {
  const liste: Aufmerksamkeit[] = [];
  const schon = new Set<string>();

  if (todo) {
    for (const kunde of kundenListe(db)) {
      const board = boardVon(todo.boards, kunde.id);
      if (!board) continue;
      const ueber = todo.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert && !istErledigt(a) && faelligkeit(a, heute) === 'ueberfaellig').length;
      if (ueber === 0) continue;
      schon.add(kunde.id);
      liste.push({ firmaId: kunde.id, name: kunde.name, grund: `${ueber} ${ueber === 1 ? 'Karte' : 'Karten'} überfällig`, pfad: `/kunden/${kunde.id}` });
    }
  }

  for (const a of meinTag(db, ich, heute).ueberfaellig) {
    if (!a.firma || schon.has(a.firma.id)) continue;
    schon.add(a.firma.id);
    liste.push({ firmaId: a.firma.id, name: a.firma.name, grund: a.art === 'wiedervorlage' ? 'Wiedervorlage überfällig' : 'Schritt überfällig', pfad: `/crm/firmen/${a.firma.id}` });
  }

  return liste.slice(0, HOECHSTENS);
}
