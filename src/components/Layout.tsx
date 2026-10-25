import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { zeigeStart } from '../data/ansicht';
import { kundenListe } from '../data/kunden';
import { useAnsicht } from '../lib/useAnsicht';
import { WERKZEUGE, seitentitel, werkzeugFuerPfad } from '../werkzeuge';
import { BlattProvider } from './Blatt';
import { HubInsel } from './HubInsel';
import { PraesenzProvider } from './Praesenz';
import { Seitenleiste } from './Seitenleiste';
import { Seitenrahmen } from './Seitenrahmen';
import { Tastatur } from './Tastatur';

const reiterClass = ({ isActive }: { isActive: boolean }) => `reiter-eintrag${isActive ? ' is-active' : ''}`;

export function Layout() {
  const { db } = useCrm();
  const { ansicht } = useAnsicht();
  const { pathname } = useLocation();
  // Shared pages like Einrichtung belong to no tool: the browser tab keeps the tool that was open before.
  const gefunden = werkzeugFuerPfad(pathname);
  const [zuletzt, setZuletzt] = useState(gefunden ?? WERKZEUGE[0]);
  useEffect(() => {
    if (gefunden) setZuletzt(gefunden);
  }, [gefunden]);
  const werkzeug = gefunden ?? zuletzt;
  useEffect(() => {
    document.title = seitentitel(werkzeug);
  }, [werkzeug]);
  // The soft styles also reach what renders outside the frame: side sheet, dialogs and portals on body.
  useEffect(() => {
    document.documentElement.classList.add('soft');
    return () => document.documentElement.classList.remove('soft');
  }, []);
  // Page-wide switches from the view settings: key figures and explanatory lines are opt-in.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ohne-kennzahlen', !ansicht.kennzahlen);
    root.classList.toggle('ohne-erklaerungen', !ansicht.erklaerungen);
  }, [ansicht.kennzahlen, ansicht.erklaerungen]);
  // On the phone the sidebar is a drawer; it closes again with every page change.
  const [menue, setMenue] = useState(false);
  useEffect(() => setMenue(false), [pathname]);

  const kunden = gefunden?.id === 'kunden' && db ? kundenListe(db) : [];
  const reiter = gefunden ? gefunden.navigation.filter((n) => !n.versteckt && (n.pfad !== '/wort' || zeigeStart(ansicht, 'wort') || pathname === '/wort')) : [];

  return (
    <PraesenzProvider>
      <BlattProvider>
        <div className="app soft">
          {/* First stop for keyboard users: past the sidebar straight to the content. */}
          <button type="button" className="skip-link" onClick={() => document.getElementById('inhalt')?.focus()}>
            Zum Inhalt springen
          </button>

          <header className="mobilkopf glass">
            <button type="button" className="leiste-knopf" aria-label="Menü öffnen" aria-expanded={menue} onClick={() => setMenue(true)}>
              <span className="menue-icon" aria-hidden="true" />
            </button>
            <Link to="/" className="leiste-marke">
              <span className="brand-zeichen">
                <img src="./zeichen-eisblau.png" alt="" />
              </span>
              <span className="brand-wort">Velonify</span>
            </Link>
          </header>

          <Seitenleiste offen={menue} />
          {menue && <div className="leiste-schleier" onClick={() => setMenue(false)} aria-hidden="true" />}

          <div className="inhalt-spalte">
            {(reiter.length > 1 || kunden.length > 0) && (
              <nav className="reiter" aria-label={werkzeug.name}>
                {reiter.map((n) => (
                  <NavLink key={n.pfad} to={n.pfad} end={n.end} className={reiterClass}>
                    {n.label}
                  </NavLink>
                ))}
                {kunden.map((f) => (
                  <NavLink key={f.id} to={`/kunden/${f.id}`} className={reiterClass} title={f.name}>
                    {f.kuerzel || f.name}
                  </NavLink>
                ))}
              </nav>
            )}
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

          <HubInsel />
          <Tastatur />
        </div>
      </BlattProvider>
    </PraesenzProvider>
  );
}
