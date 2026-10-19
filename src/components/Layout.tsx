import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { kundenListe } from '../data/kunden';
import { useTheme } from '../lib/useTheme';
import { WERKZEUGE, seitentitel, werkzeugFuerPfad } from '../werkzeuge';
import { Glocke } from './Glocke';
import { GeradeOnline, PraesenzProvider } from './Praesenz';
import { Seitenrahmen } from './Seitenrahmen';
import { Suche } from './Suche';
import { WerkzeugIcon } from './Icons';

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
  useEffect(() => {
    document.title = seitentitel(werkzeug);
  }, [werkzeug]);

  return (
    <PraesenzProvider>
    <div className="app">
      {/* First stop for keyboard users: past the tool rail and page nav straight to the content. */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('inhalt')?.focus()}>
        Zum Inhalt springen
      </button>
      {/* Tool rail: always espresso, the brand's darkest surface; in dark mode it sinks one step further. */}
      <nav className="rail" data-theme={theme === 'dark' ? 'dark' : 'espresso'} aria-label="Werkzeuge">
        <Link to="/" className="rail-logo" aria-label="Velonify – Home">
          <img src="./zeichen-eisblau.png" alt="" />
        </Link>
        {WERKZEUGE.filter((w) => w.pfad).map((w) => (
          <Link key={w.id} to={w.pfad!} className={`rail-item${w.id === werkzeug.id ? ' is-active' : ''}`} aria-current={w.id === werkzeug.id ? 'page' : undefined} title={w.name}>
            <WerkzeugIcon id={w.id} />
            <span>{w.kurz}</span>
          </Link>
        ))}
        <NavLink to="/einrichtung" className={({ isActive }) => `rail-item rail-unten${isActive ? ' is-active' : ''}`} title="Einrichtung">
          <WerkzeugIcon id="einrichtung" />
          <span>Setup</span>
        </NavLink>
      </nav>
      <aside className="sidebar">
        <div className="brand">
          <span className="wordmark">Velonify</span>
          <h2 className="sidebar-titel">{werkzeug.name}</h2>
          {loading && db && <span className="sync-dot" title="Wird aktualisiert …" aria-label="Wird aktualisiert" />}
        </div>
        <Glocke />
        <Suche />
        <nav className="nav" aria-label={werkzeug.name}>
          {werkzeug.navigation.map((n) => (
            <NavLink key={n.pfad} to={n.pfad} end={n.end} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        {/* In the client hub: every client one click away, also from inside a client. */}
        {werkzeug.id === 'kunden' && db && kundenListe(db).length > 0 && (
          <nav className="nav nav-kunden" aria-label="Kunden">
            <span className="nav-abschnitt">Kunden</span>
            {kundenListe(db).map((f) => (
              <NavLink key={f.id} to={`/kunden/${f.id}`} className={navClass} title={f.name}>
                {f.kuerzel && <span className="nav-kuerzel">{f.kuerzel}</span>}
                <span className="nav-name">{f.name}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <div className="sidebar-footer">
          <GeradeOnline />
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
      <main className="main" id="inhalt" tabIndex={-1}>
        {isDemo && (
          <div className="demo-banner">
            <strong>Demo-Modus</strong> Erfundene Beispieldaten, Drive und Kalender sind simuliert. Änderungen gehen beim Neuladen verloren.
          </div>
        )}
        <Seitenrahmen schluessel={pathname}>
          <Outlet />
        </Seitenrahmen>
      </main>
    </div>
    </PraesenzProvider>
  );
}
