import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { instanzModus, isDemo, mandantenModus, offenerLogin } from '../config';
import { darfEinrichten } from '../data/instanz';
import { Gesperrt, MandantLeiste } from '../plattform/MandantLeiste';
import { useMandant, useMarke } from '../plattform/MandantContext';
import { useRolle } from '../lib/useRolle';
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

// The demo's bar, tour and client view only reach the browser in demo mode.
const DemoLeiste = lazy(() => import('./DemoLeiste').then((m) => ({ default: m.DemoLeiste })));

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
  const { api, sicht, instanz } = useMandant();
  const { erlaubt } = useRolle();
  const marke = useMarke();
  useEffect(() => {
    document.title = seitentitel(werkzeug, offenerLogin ? marke : undefined);
  }, [werkzeug, marke]);
  // Tenants: which tool was opened, once per tool and session, for the usage in the admin tool.
  useEffect(() => {
    if (!sicht || !gefunden) return;
    const schluessel = `velonify-hub.genutzt.${gefunden.id}`;
    try {
      if (sessionStorage.getItem(schluessel)) return;
      sessionStorage.setItem(schluessel, '1');
    } catch {
      return;
    }
    void api.nutzung(gefunden.id).catch(() => undefined);
  }, [sicht, gefunden, api]);
  // Pages of a tool that is off (tenant package, admin tool) and Velonify-only pages are closed, not just hidden.
  const gesperrt =
    (gefunden && !erlaubt(gefunden.id)) ||
    (offenerLogin && (pathname === '/kalender' || pathname.startsWith('/crm/linkedin') || pathname.startsWith('/kunden'))) ||
    (pathname.startsWith('/einrichtung') && (mandantenModus || (instanzModus && !darfEinrichten(instanz?.rolle))));
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
  const reiter = gefunden ? gefunden.navigation.filter((n) => !n.versteckt && !(offenerLogin && ['/kalender', '/crm/anfragen'].includes(n.pfad)) && (n.pfad !== '/wort' || zeigeStart(ansicht, 'wort') || pathname === '/wort')) : [];

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
              <span className="brand-text">
                <span className="brand-wort">{marke}</span>
                {instanzModus && <span className="brand-by">by Velonify</span>}
              </span>
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
                <Suspense fallback={null}>
                  <DemoLeiste />
                </Suspense>
              )}
              {mandantenModus && <MandantLeiste />}
              <Seitenrahmen schluessel={pathname}>{gesperrt ? <Gesperrt titel={gefunden?.name ?? 'Nicht verfügbar'} /> : <Outlet />}</Seitenrahmen>
            </main>
          </div>

          <HubInsel />
          <Tastatur />
        </div>
      </BlattProvider>
    </PraesenzProvider>
  );
}
