import { useMemo } from 'react';
import { instanzModus } from '../config';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { brauchtAufmerksamkeit } from '../data/aufmerksamkeit';
import { useCrm } from '../data/CrmContext';
import { sammleEingang } from '../data/eingangListe';
import { isoDate } from '../data/ids';
import { meinTag } from '../data/selectors';
import { faelligkeit, meineAufgaben } from '../data/todos';
import { leseSpaeter } from '../eingang/spaeter';
import { useEingang } from '../eingang/useEingang';
import { useAnsicht } from '../lib/useAnsicht';
import { useIch } from '../lib/useIch';
import { useTheme } from '../lib/useTheme';
import { useTodoDaten } from '../todo/useTodoDaten';
import { LEISTE, leistenEintragFuerPfad, type LeistenZahl } from '../werkzeuge';
import { useMarke } from '../plattform/MandantContext';
import { useRolle } from '../lib/useRolle';
import { Glocke } from './Glocke';
import { WerkzeugIcon } from './Icons';
import { Suche } from './Suche';

/** Counts next to the entries, so it is clear without a click where something waits. */
function useZahlen(): Partial<Record<LeistenZahl, number>> {
  const { db } = useCrm();
  const [ich] = useIch(db?.listen.team ?? []);
  const todo = useTodoDaten();
  const anfragen = useEingang();
  const heute = isoDate(new Date());
  return useMemo(() => {
    if (!db) return {};
    const tag = meinTag(db, ich, heute);
    const karten = todo.data && ich ? meineAufgaben(todo.data.aufgaben, todo.data.boards, ich).filter((k) => ['ueberfaellig', 'heute'].includes(faelligkeit(k, heute))).length : 0;
    const eingang = sammleEingang({ db, anfragen: anfragen.data, todo: todo.data }, ich, heute, new Set(Object.keys(leseSpaeter(heute)))).length;
    return { heute: tag.ueberfaellig.length + tag.heute.length, todo: karten, eingang };
  }, [db, ich, heute, todo.data, anfragen.data]);
}

function Aufmerksamkeit() {
  const { db } = useCrm();
  const [ich] = useIch(db?.listen.team ?? []);
  const todo = useTodoDaten();
  const heute = isoDate(new Date());
  const liste = useMemo(() => (db ? brauchtAufmerksamkeit(db, todo.data, ich, heute) : []), [db, todo.data, ich, heute]);
  if (liste.length === 0) return null;
  return (
    <section className="leiste-gruppe" aria-label="Braucht Aufmerksamkeit">
      <h2 className="leiste-titel">Braucht Aufmerksamkeit</h2>
      {liste.map((a) => (
        <NavLink key={a.firmaId} to={a.pfad} className={({ isActive }) => `leiste-eintrag is-firma${isActive ? ' is-active' : ''}`} title={a.grund}>
          <span className="leiste-punkt" aria-hidden="true" />
          <span className="leiste-text">{a.name}</span>
        </NavLink>
      ))}
    </section>
  );
}

/** The sidebar: tools with their names and counts, firms that need attention, and the person at the bottom. */
export function Seitenleiste({ offen }: { offen: boolean }) {
  const { state } = useAuth();
  const user = state.status === 'signedOut' ? null : state.user;
  const [theme, setTheme] = useTheme();
  const { ansicht } = useAnsicht();
  const { pathname } = useLocation();
  const zahlen = useZahlen();
  const aktiv = leistenEintragFuerPfad(pathname);
  const { erlaubt } = useRolle();
  const marke = useMarke();
  const gruppen = LEISTE.map((g) => ({ ...g, eintraege: g.eintraege.filter((e) => erlaubt(e.werkzeug) && !ansicht.ausgeblendet.includes(e.werkzeug)) })).filter((g) => g.eintraege.length > 0);

  return (
    <aside className={`seitenleiste glass${offen ? ' is-offen' : ''}`} aria-label="Navigation">
      <div className="leiste-kopf">
        <Link to="/" className="leiste-marke" aria-label={`${marke} – Home`}>
          <span className="brand-zeichen">
            <img src="./zeichen-eisblau.png" alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-wort">{marke}</span>
            {instanzModus && <span className="brand-by">by Velonify</span>}
          </span>
        </Link>
        <Glocke />
      </div>
      <Suche />

      <nav className="leiste-nav" aria-label="Werkzeuge">
        {gruppen.map((g, i) => (
          <section key={g.titel ?? i} className="leiste-gruppe">
            {g.titel && <h2 className="leiste-titel">{g.titel}</h2>}
            {g.eintraege.map((e) => {
              const istAktiv = aktiv?.pfad === e.pfad;
              const zahl = e.zahl ? zahlen[e.zahl] : undefined;
              return (
                <Link key={e.pfad} to={e.pfad} className={`leiste-eintrag${istAktiv ? ' is-active' : ''}`} aria-current={istAktiv ? 'page' : undefined}>
                  <WerkzeugIcon id={e.icon} />
                  <span className="leiste-text">{e.label}</span>
                  {zahl ? <span className={`leiste-zahl${e.zahl === 'heute' || e.zahl === 'todo' ? ' is-warn' : ''}`}>{zahl}</span> : null}
                </Link>
              );
            })}
          </section>
        ))}
        {ansicht.aufmerksamkeit && <Aufmerksamkeit />}
      </nav>

      <div className="leiste-fuss">
        {user && (
          <Link to="/einstellungen" className="leiste-ich" title={user.email}>
            {user.picture ? <img src={user.picture} alt="" className="ich-avatar" referrerPolicy="no-referrer" /> : <span className="ich-avatar">{user.name.slice(0, 1)}</span>}
            <span className="leiste-text">{user.name.split(' ')[0]}</span>
          </Link>
        )}
        <button
          type="button"
          className="leiste-knopf"
          aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
          title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <WerkzeugIcon id={theme === 'dark' ? 'hell' : 'dunkel'} />
        </button>
        <NavLink to="/einstellungen" className={({ isActive }) => `leiste-knopf${isActive ? ' is-active' : ''}`} aria-label="Einstellungen" title="Einstellungen">
          <WerkzeugIcon id="regler" />
        </NavLink>
      </div>
    </aside>
  );
}
