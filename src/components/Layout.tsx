import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' is-active' : ''}`;

// Views from later steps are listed so the team sees where the app is heading.
const SOON = ['Mein Tag', 'Pipeline', 'Import'];

export function Layout() {
  const { state, signOut } = useAuth();
  const user = state.status === 'signedOut' ? null : state.user;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={26} height={26} />
          <span>Velonify CRM</span>
        </div>
        <nav className="nav">
          <NavLink to="/firmen" className={navClass}>
            Firmen
          </NavLink>
          {SOON.map((label) => (
            <span key={label} className="nav-item is-disabled" title="Kommt in einem der nächsten Schritte">
              {label} <small>bald</small>
            </span>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/einrichtung" className={navClass}>
            Einrichtung
          </NavLink>
          {user && (
            <div className="user">
              {user.picture ? <img src={user.picture} alt="" className="avatar" referrerPolicy="no-referrer" /> : <span className="avatar">{user.name.slice(0, 1)}</span>}
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
            <strong>Demo-Modus</strong> – Beispieldaten ohne Google-Anbindung. Änderungen gehen beim Neuladen verloren.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
