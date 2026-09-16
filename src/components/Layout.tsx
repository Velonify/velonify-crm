import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { Suche } from './Suche';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' is-active' : ''}`;

export function Layout() {
  const { state, signOut } = useAuth();
  const { loading, db } = useCrm();
  const user = state.status === 'signedOut' ? null : state.user;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={26} height={26} />
          <span>Velonify CRM</span>
          {loading && db && <span className="sync-dot" title="Wird aktualisiert …" aria-label="Wird aktualisiert" />}
        </div>
        <Suche />
        <nav className="nav">
          <NavLink to="/" end className={navClass}>
            Mein Tag
          </NavLink>
          <NavLink to="/pipeline" className={navClass}>
            Pipeline
          </NavLink>
          <NavLink to="/firmen" className={navClass}>
            Firmen
          </NavLink>
          <NavLink to="/import" className={navClass}>
            Import
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/einrichtung" className={navClass}>
            Einrichtung
          </NavLink>
          {user && (
            <div className="user">
              {user.picture ? (
                <img src={user.picture} alt="" className="avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="avatar">{user.name.slice(0, 1)}</span>
              )}
              <div className="user-text">
                <span className="user-name">{user.name}</span>
                {!isDemo && (
                  <button type="button" className="link-button" onClick={signOut}>
                    Abmelden
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {isDemo && (
          <div className="demo-banner">
            <strong>Demo-Modus</strong> – erfundene Beispieldaten, Drive und Kalender sind simuliert. Änderungen gehen beim Neuladen verloren.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
