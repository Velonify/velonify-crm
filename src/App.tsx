import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AngebotePage } from './angebote/AngebotePage';
import { AngebotPage } from './angebote/AngebotPage';
import { LeistungenPage } from './angebote/LeistungenPage';
import { useAuth } from './auth/AuthContext';
import { ContactGeneratorPage } from './contact/ContactGeneratorPage';
import { GesendetPage } from './contact/GesendetPage';
import { OutreachLeistungenPage } from './contact/OutreachLeistungenPage';
import { Layout } from './components/Layout';
import { ReauthDialog } from './components/ReauthDialog';
import { ToastProvider } from './components/Toasts';
import { CrmProvider } from './data/CrmContext';
import { EinrichtungPage } from './pages/EinrichtungPage';
import { FirmaAktePage } from './pages/FirmaAktePage';
import { FirmaNeuPage } from './pages/FirmaNeuPage';
import { FirmenListePage } from './pages/FirmenListePage';
import { ImportPage } from './pages/ImportPage';
import { KalenderPage } from './pages/KalenderPage';
import { LoginPage } from './pages/LoginPage';
import { MeinTagPage } from './pages/MeinTagPage';
import { PipelinePage } from './pages/PipelinePage';
import { StartPage } from './pages/StartPage';

/** Links from before the start page (/#/firmen/…) now live under /crm. */
function AlteCrmAdresse() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/crm${pathname}${search}`} replace />;
}

export function App() {
  const { state } = useAuth();
  if (state.status === 'signedOut') return <LoginPage />;

  // HashRouter: GitHub Pages has no server-side rewrites, so /#/firmen/123 survives a reload.
  return (
    <ToastProvider>
      <CrmProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<StartPage />} />
              <Route path="kalender" element={<KalenderPage />} />
              <Route path="crm">
                <Route index element={<MeinTagPage />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="firmen" element={<FirmenListePage />} />
                <Route path="firmen/neu" element={<FirmaNeuPage />} />
                <Route path="firmen/:id" element={<FirmaAktePage />} />
                <Route path="import" element={<ImportPage />} />
              </Route>
              <Route path="angebote">
                <Route index element={<AngebotePage />} />
                <Route path="neu" element={<AngebotPage />} />
                <Route path="leistungen" element={<LeistungenPage />} />
                <Route path=":id" element={<AngebotPage />} />
              </Route>
              <Route path="contact">
                <Route index element={<ContactGeneratorPage />} />
                <Route path="gesendet" element={<GesendetPage />} />
                <Route path="leistungen" element={<OutreachLeistungenPage />} />
              </Route>
              <Route path="einrichtung" element={<EinrichtungPage />} />
              <Route path="pipeline" element={<AlteCrmAdresse />} />
              <Route path="firmen/*" element={<AlteCrmAdresse />} />
              <Route path="import" element={<AlteCrmAdresse />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
        <ReauthDialog />
      </CrmProvider>
    </ToastProvider>
  );
}
