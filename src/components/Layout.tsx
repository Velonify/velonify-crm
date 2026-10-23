import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDemo } from '../config';
import { DemoLeiste } from './DemoLeiste';
import { useCrm } from '../data/CrmContext';
import { kundenListe } from '../data/kunden';
import { useTheme } from '../lib/useTheme';
import { WERKZEUGE, seitentitel, werkzeugFuerPfad } from '../werkzeuge';
import { BlattProvider } from './Blatt';
import { Glocke } from './Glocke';
import { HubInsel } from './HubInsel';
import { WerkzeugIcon } from './Icons';
import { PraesenzProvider } from './Praesenz';
import { Seitenrahmen } from './Seitenrahmen';
import { Suche } from './Suche';
import { Tastatur, useHilfe } from './Tastatur';

const navClass = ({ isActive }: { isActive: boolean }) => `subnav-item${isActive ? ' is-active' : ''}`;

/** Moves the dark pill under the active page link; it slides when the page changes. */
function useGleiter(pathname: string) {
  const leiste = useRef<HTMLElement>(null);
  const gleiter = useRef<HTMLSpanElement>(null);
  const erstes = useRef(true);
  useLayoutEffect(() => {
    const setzen = () => {
      const nav = leiste.current;
      const pill = gleiter.current;
      if (!nav || !pill) return;
      const aktiv = nav.querySelector<HTMLElement>('.subnav-item.is-active');
      if (!aktiv) {
        pill.style.opacity = '0';
        return;
      }
      if (erstes.current) pill.style.transition = 'none';
      pill.style.opacity = '1';
      pill.style.width = `${aktiv.offsetWidth}px`;
      pill.style.transform = `translateX(${aktiv.offsetLeft}px)`;
      if (erstes.current) {
        erstes.current = false;
        requestAnimationFrame(() => requestAnimationFrame(() => (pill.style.transition = '')));
      }
      aktiv.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    setzen();
    window.addEventListener('resize', setzen);
    void document.fonts?.ready.then(setzen);
    return () => window.removeEventListener('resize', setzen);
  });
  return { leiste, gleiter, pathname };
}

export function Layout() {
  const { state, signOut } = useAuth();
  const { db } = useCrm();
  const [theme, setTheme] = useTheme();
  const [, setHilfe] = useHilfe();
  const user = state.status === 'signedOut' ? null : state.user;
  const { pathname } = useLocation();
  // Shared pages like Einrichtung belong to no tool: the page links stay on the tool that was open before.
  const gefunden = werkzeugFuerPfad(pathname);
  const [zuletzt, setZuletzt] = useState(gefunden ?? WERKZEUGE[0]);
  useEffect(() => {
    if (gefunden) setZuletzt(gefunden);
  }, [gefunden]);
  const werkzeug = gefunden ?? zuletzt;
  useEffect(() => {
    document.title = seitentitel(werkzeug);
  }, [werkzeug]);
  const { leiste, gleiter } = useGleiter(pathname);
  // The soft styles also reach what renders outside the frame: side sheet, dialogs and portals on body.
  useEffect(() => {
    document.documentElement.classList.add('soft');
    return () => document.documentElement.classList.remove('soft');
  }, []);
  const kunden = werkzeug.id === 'kunden' && db ? kundenListe(db) : [];

  return (
    <PraesenzProvider>
      <BlattProvider>
      <div className="app soft">
        {/* First stop for keyboard users: past the bars straight to the content. */}
        <button type="button" className="skip-link" onClick={() => document.getElementById('inhalt')?.focus()}>
          Zum Inhalt springen
        </button>

        <header className="topbar">
          <Link to="/" className="pill glass brand-pill" aria-label="Velonify Hub – Home">
            <span className="brand-zeichen">
              <img src="./zeichen-eisblau.png" alt="" />
            </span>
            <span className="brand-wort">Velonify</span>
            <span className="brand-werkzeug">{werkzeug.name}</span>
          </Link>

          <nav className="pill glass subnav" aria-label={werkzeug.name} ref={leiste}>
            <span className="subnav-gleiter" ref={gleiter} aria-hidden="true" />
            {werkzeug.navigation.map((n) => (
              <NavLink key={n.pfad} to={n.pfad} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            ))}
            {kunden.map((f) => (
              <NavLink key={f.id} to={`/kunden/${f.id}`} className={navClass} title={f.name}>
                {f.kuerzel || f.name}
              </NavLink>
            ))}
          </nav>

          <div className="pill glass werkzeugpill">
            <Suche />
            <Glocke />
            {user && (
              <div className="ich">
                {user.picture ? (
                  <img src={user.picture} alt="" className="ich-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <span className="ich-avatar">{user.name.slice(0, 1)}</span>
                )}
                <span className="ich-text">
                  <span className="ich-name">{user.name}</span>
                  <span className="ich-mail">{user.email}</span>
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="shell">
          <nav className="kapseln" aria-label="Werkzeuge">
            <div className="kapsel glass" role="radiogroup" aria-label="Darstellung">
              <button type="button" role="radio" className="kapsel-knopf" aria-checked={theme === 'light'} data-tipp="Hell" aria-label="Helles Design" onClick={() => setTheme('light')}>
                <WerkzeugIcon id="hell" />
              </button>
              <button type="button" role="radio" className="kapsel-knopf" aria-checked={theme === 'dark'} data-tipp="Dunkel" aria-label="Dunkles Design" onClick={() => setTheme('dark')}>
                <WerkzeugIcon id="dunkel" />
              </button>
            </div>
            <div className="kapsel glass">
              {WERKZEUGE.filter((w) => w.pfad).map((w) => (
                <Link
                  key={w.id}
                  to={w.pfad!}
                  className={`kapsel-knopf${w.id === werkzeug.id ? ' is-active' : ''}`}
                  aria-current={w.id === werkzeug.id ? 'page' : undefined}
                  aria-label={w.name}
                  data-tipp={w.name}
                >
                  <WerkzeugIcon id={w.id} />
                </Link>
              ))}
            </div>
            <div className="kapsel glass kapsel-unten">
              <NavLink to="/einrichtung" className={({ isActive }) => `kapsel-knopf${isActive ? ' is-active' : ''}`} aria-label="Einrichtung" data-tipp="Einrichtung">
                <WerkzeugIcon id="einrichtung" />
              </NavLink>
              <button type="button" className="kapsel-knopf" aria-label="Tastenkürzel" data-tipp="Tastenkürzel (?)" onClick={() => setHilfe(true)}>
                <WerkzeugIcon id="hilfe" />
              </button>
              {user && !isDemo && (
                <button type="button" className="kapsel-knopf" aria-label="Abmelden" data-tipp="Abmelden" onClick={signOut}>
                  <WerkzeugIcon id="abmelden" />
                </button>
              )}
            </div>
          </nav>

          <main className="main" id="inhalt" tabIndex={-1}>
            {isDemo && <DemoLeiste />}
            <Seitenrahmen schluessel={pathname}>
              <Outlet />
            </Seitenrahmen>
          </main>
        </div>

        <HubInsel />
        <Tastatur />
      </div>
      </BlattProvider>
    </PraesenzProvider>
  );
}
