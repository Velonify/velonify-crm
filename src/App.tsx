import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ReauthDialog } from './components/ReauthDialog';
import { RepositoryProvider } from './data/RepositoryContext';
import { EinrichtungPage } from './pages/EinrichtungPage';
import { FirmaAktePage } from './pages/FirmaAktePage';
import { FirmaNeuPage } from './pages/FirmaNeuPage';
import { FirmenListePage } from './pages/FirmenListePage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const { state } = useAuth();
  if (state.status === 'signedOut') return <LoginPage />;

  // HashRouter: GitHub Pages has no server-side rewrites, so /#/firmen/123 survives a reload.
  return (
    <RepositoryProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/firmen" replace />} />
            <Route path="firmen" element={<FirmenListePage />} />
            <Route path="firmen/neu" element={<FirmaNeuPage />} />
            <Route path="firmen/:id" element={<FirmaAktePage />} />
            <Route path="einrichtung" element={<EinrichtungPage />} />
            <Route path="*" element={<Navigate to="/firmen" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <ReauthDialog />
    </RepositoryProvider>
  );
}
