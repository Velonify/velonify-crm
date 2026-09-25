import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AngebotePage } from './angebote/AngebotePage';
import { AuditDetailPage } from './audit/AuditDetailPage';
import { AuditNeuPage } from './audit/AuditNeuPage';
import { AuditUebersichtPage } from './audit/AuditUebersichtPage';
import { AngebotPage } from './angebote/AngebotPage';
import { LeistungenPage } from './angebote/LeistungenPage';
import { BacklogPage } from './leads/BacklogPage';
import { LeadDetailPage } from './leads/LeadDetailPage';
import { ManuellPage } from './leads/ManuellPage';
import { SuchePage } from './leads/SuchePage';
import { useAuth } from './auth/AuthContext';
import { ContactGeneratorPage } from './contact/ContactGeneratorPage';
import { GesendetPage } from './contact/GesendetPage';
import { OutreachLeistungenPage } from './contact/OutreachLeistungenPage';
import { Layout } from './components/Layout';
import { ReauthDialog } from './components/ReauthDialog';
import { ToastProvider } from './components/Toasts';
import { CrmProvider } from './data/CrmContext';
import { AnfragenPage } from './eingang/AnfragenPage';
import { EinrichtungPage } from './pages/EinrichtungPage';
import { FirmaAktePage } from './pages/FirmaAktePage';
import { FirmaNeuPage } from './pages/FirmaNeuPage';
import { FirmenListePage } from './pages/FirmenListePage';
import { ImportPage } from './pages/ImportPage';
import { KalenderPage } from './pages/KalenderPage';
import { LinkedinLeadPage } from './pages/LinkedinLeadPage';
import { LoginPage } from './pages/LoginPage';
import { MeinTagPage } from './pages/MeinTagPage';
import { PipelinePage } from './pages/PipelinePage';
import { StartPage } from './pages/StartPage';
import { SocialAufgabenPage } from './social/AufgabenPage';
import { SocialInhaltDetailPage } from './social/InhaltDetailPage';
import { SocialInhaltePage } from './social/InhaltePage';
import { SocialMessungPage } from './social/MessungPage';
import { SocialPlanPage } from './social/PlanPage';
import { SocialStrategiePage } from './social/StrategiePage';
import { SocialUebersichtPage } from './social/UebersichtPage';
import { WordlePage } from './wordle/WordlePage';

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
              <Route path="anfragen" element={<AnfragenPage />} />
              <Route path="wort" element={<WordlePage />} />
              <Route path="crm">
                <Route index element={<MeinTagPage />} />
                <Route path="anfragen" element={<AnfragenPage />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="firmen" element={<FirmenListePage />} />
                <Route path="firmen/neu" element={<FirmaNeuPage />} />
                <Route path="firmen/:id" element={<FirmaAktePage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="linkedin" element={<LinkedinLeadPage />} />
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
              <Route path="audit">
                <Route index element={<AuditUebersichtPage />} />
                <Route path="neu" element={<AuditNeuPage />} />
                <Route path=":id" element={<AuditDetailPage />} />
              </Route>
              <Route path="social">
                <Route index element={<SocialUebersichtPage />} />
                <Route path="plan" element={<SocialPlanPage />} />
                <Route path="inhalte" element={<SocialInhaltePage />} />
                <Route path="inhalte/:id" element={<SocialInhaltDetailPage />} />
                <Route path="aufgaben" element={<SocialAufgabenPage />} />
                <Route path="messung" element={<SocialMessungPage />} />
                <Route path="strategie" element={<SocialStrategiePage />} />
              </Route>
              <Route path="leads">
                <Route index element={<BacklogPage />} />
                <Route path="manuell" element={<ManuellPage />} />
                <Route path="suche" element={<SuchePage />} />
                <Route path="shop/:domain" element={<LeadDetailPage />} />
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
