import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { useTheme } from '../lib/useTheme';
import { WERKZEUGE, werkzeugFuerPfad } from '../werkzeuge';
import { Suche } from './Suche';
import { WerkzeugWechsler } from './WerkzeugWechsler';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' is-active' : ''}`;

export function Layout() {
  const { state, signOut } = useAuth();
  const { loading, db } = useCrm();
  const [theme, setTheme] = useTheme();
  const user = state.status === 'signedOut' ? null : state.user;
  const { pathname } = useLocation();
  // Shared pages like Einrichtung belong to no tool: the sidebar stays on the tool that was open before.
  const gefunden = werkzeugFuerPfad(pathname);
  const [zuletzt, setZuletzt] = useState(gefunden ?? WERKZEUGE[0]);
  useEffect(() => {
    if (gefunden) setZuletzt(gefunden);
  }, [gefunden]);
  const werkzeug = gefunden ?? zuletzt;

  return (
    <div className="app">
      {/* In light mode the sidebar is brand espresso; in dark mode it joins the dark theme. */}
      <aside className="sidebar" data-theme={theme === 'dark' ? 'dark' : 'espresso'}>
        <div className="brand">
          <Link to="/" className="lockup" aria-label="Velonify – Home">
            <img src="./zeichen-eisblau.png" alt="" />
            <span className="wordmark">Velonify</span>
          </Link>
          <div className="brand-sub">
            <WerkzeugWechsler aktuell={werkzeug} />
          </div>
          {loading && db && <span className="sync-dot" title="Wird aktualisiert …" aria-label="Wird aktualisiert" />}
        </div>
        <Suche />
        <nav className="nav" aria-label={werkzeug.name}>
          {werkzeug.navigation.map((n) => (
            <NavLink key={n.pfad} to={n.pfad} end={n.end} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/einrichtung" className={navClass}>
            Einrichtung
          </NavLink>
          <div className="segmented theme-switch" role="radiogroup" aria-label="Darstellung">
            <button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')}>
              Hell
            </button>
            <button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')}>
              Dunkel
            </button>
          </div>
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
            <strong>Demo-Modus</strong> Erfundene Beispieldaten, Drive und Kalender sind simuliert. Änderungen gehen beim Neuladen verloren.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
