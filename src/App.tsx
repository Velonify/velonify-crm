import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ReauthDialog } from './components/ReauthDialog';
import { ToastProvider } from './components/Toasts';
import { CrmProvider } from './data/CrmContext';
import { EinrichtungPage } from './pages/EinrichtungPage';
import { FirmaAktePage } from './pages/FirmaAktePage';
import { FirmaNeuPage } from './pages/FirmaNeuPage';
import { FirmenListePage } from './pages/FirmenListePage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { MeinTagPage } from './pages/MeinTagPage';
import { PipelinePage } from './pages/PipelinePage';

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
              <Route index element={<MeinTagPage />} />
              <Route path="pipeline" element={<PipelinePage />} />
              <Route path="firmen" element={<FirmenListePage />} />
              <Route path="firmen/neu" element={<FirmaNeuPage />} />
              <Route path="firmen/:id" element={<FirmaAktePage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="einrichtung" element={<EinrichtungPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
        <ReauthDialog />
      </CrmProvider>
    </ToastProvider>
  );
}
