import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { instanzModus } from './config';
import { Layout } from './components/Layout';
import { ReauthDialog } from './components/ReauthDialog';
import { ToastProvider } from './components/Toasts';
import { CrmProvider } from './data/CrmContext';
import { LoginPage } from './pages/LoginPage';
import { MandantProvider } from './plattform/MandantContext';

// Every page is its own chunk: the first load only fetches the shell and the page that is opened.
const seite = <K extends string, M extends Record<K, ComponentType<any>>>(laden: () => Promise<M>, name: K) =>
  lazy(() => laden().then((modul) => ({ default: modul[name] })));

const AngebotePage = seite(() => import('./angebote/AngebotePage'), 'AngebotePage');
const AuditDetailPage = seite(() => import('./audit/AuditDetailPage'), 'AuditDetailPage');
const AuditNeuPage = seite(() => import('./audit/AuditNeuPage'), 'AuditNeuPage');
const AuditUebersichtPage = seite(() => import('./audit/AuditUebersichtPage'), 'AuditUebersichtPage');
const AngebotPage = seite(() => import('./angebote/AngebotPage'), 'AngebotPage');
const LeistungenPage = seite(() => import('./angebote/LeistungenPage'), 'LeistungenPage');
const BacklogPage = seite(() => import('./leads/BacklogPage'), 'BacklogPage');
const LeadDetailPage = seite(() => import('./leads/LeadDetailPage'), 'LeadDetailPage');
const ManuellPage = seite(() => import('./leads/ManuellPage'), 'ManuellPage');
const SuchePage = seite(() => import('./leads/SuchePage'), 'SuchePage');
const ContactGeneratorPage = seite(() => import('./contact/ContactGeneratorPage'), 'ContactGeneratorPage');
const GesendetPage = seite(() => import('./contact/GesendetPage'), 'GesendetPage');
const OutreachLeistungenPage = seite(() => import('./contact/OutreachLeistungenPage'), 'OutreachLeistungenPage');
const AnfragenPage = seite(() => import('./eingang/AnfragenPage'), 'AnfragenPage');
const EingangPage = seite(() => import('./eingang/EingangPage'), 'EingangPage');
const DatenPage = seite(() => import('./pages/DatenPage'), 'DatenPage');
const EinrichtungPage = seite(() => import('./pages/EinrichtungPage'), 'EinrichtungPage');
const InstanzEinrichtungPage = seite(() => import('./instanz/EinrichtungPage'), 'InstanzEinrichtungPage');
// Creator profile (own instances): one route tree per module, see src/creator/.
const FreigabenPage = seite(() => import('./creator/freigaben/FreigabenPage'), 'FreigabenPage');
const KalenderRouten = seite(() => import('./creator/kalender/Routen'), 'KalenderRouten');
const AblageRouten = seite(() => import('./creator/ablage/Routen'), 'AblageRouten');
const ContentRouten = seite(() => import('./creator/content/Routen'), 'ContentRouten');
const AnalyticsRouten = seite(() => import('./creator/analytics/Routen'), 'AnalyticsRouten');
const KooperationenRouten = seite(() => import('./creator/kooperationen/Routen'), 'KooperationenRouten');
const EinnahmenRouten = seite(() => import('./creator/einnahmen/Routen'), 'EinnahmenRouten');
const OeffentlicheSeite = seite(() => import('./creator/oeffentlich/OeffentlicheSeite'), 'OeffentlicheSeite');
const EinstellungenPage = seite(() => import('./pages/EinstellungenPage'), 'EinstellungenPage');
const FirmaAktePage = seite(() => import('./pages/FirmaAktePage'), 'FirmaAktePage');
const FirmaNeuPage = seite(() => import('./pages/FirmaNeuPage'), 'FirmaNeuPage');
const FirmenListePage = seite(() => import('./pages/FirmenListePage'), 'FirmenListePage');
const ImportPage = seite(() => import('./pages/ImportPage'), 'ImportPage');
const KalenderPage = seite(() => import('./pages/KalenderPage'), 'KalenderPage');
const LinkedinLeadPage = seite(() => import('./pages/LinkedinLeadPage'), 'LinkedinLeadPage');
const MeinTagPage = seite(() => import('./pages/MeinTagPage'), 'MeinTagPage');
const PipelinePage = seite(() => import('./pages/PipelinePage'), 'PipelinePage');
const StartPage = seite(() => import('./pages/StartPage'), 'StartPage');
const SocialAufgabenPage = seite(() => import('./social/AufgabenPage'), 'SocialAufgabenPage');
const SocialInhaltDetailPage = seite(() => import('./social/InhaltDetailPage'), 'SocialInhaltDetailPage');
const SocialInhaltePage = seite(() => import('./social/InhaltePage'), 'SocialInhaltePage');
const SocialMessungPage = seite(() => import('./social/MessungPage'), 'SocialMessungPage');
const SocialPlanPage = seite(() => import('./social/PlanPage'), 'SocialPlanPage');
const SocialStrategiePage = seite(() => import('./social/StrategiePage'), 'SocialStrategiePage');
const SocialUebersichtPage = seite(() => import('./social/UebersichtPage'), 'SocialUebersichtPage');
const KundePage = seite(() => import('./kunden/KundePage'), 'KundePage');
const KundenPage = seite(() => import('./kunden/KundenPage'), 'KundenPage');
const BoardPage = seite(() => import('./todo/BoardPage'), 'BoardPage');
const UebersichtPage = seite(() => import('./todo/UebersichtPage'), 'UebersichtPage');
const MagnetLeadsPage = seite(() => import('./magnete/LeadsPage'), 'MagnetLeadsPage');
const MagnetePage = seite(() => import('./magnete/MagnetePage'), 'MagnetePage');
const RoastPage = seite(() => import('./magnete/RoastPage'), 'RoastPage');
const WhiteboardPage = seite(() => import('./whiteboard/WhiteboardPage'), 'WhiteboardPage');
const WhiteboardUebersichtPage = seite(() => import('./whiteboard/WhiteboardUebersichtPage'), 'WhiteboardUebersichtPage');
const WordlePage = seite(() => import('./wordle/WordlePage'), 'WordlePage');
const LeadMarktPage = seite(() => import('./plattform/LeadMarktPage'), 'LeadMarktPage');
const PlattformPage = seite(() => import('./plattform/PlattformPage'), 'PlattformPage');
const MandantPage = seite(() => import('./plattform/MandantPage'), 'MandantPage');
const MarktVerwaltungPage = seite(() => import('./plattform/MarktVerwaltungPage'), 'MarktVerwaltungPage');

/** Links from before the start page (/#/firmen/…) now live under /crm. */
function AlteCrmAdresse() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/crm${pathname}${search}`} replace />;
}

export function App() {
  const { state } = useAuth();
  // Public pages of an instance (request form, media kit, partner report) need no login.
  if (instanzModus && window.location.hash.startsWith('#/oeffentlich/')) {
    return (
      <Suspense fallback={null}>
        <OeffentlicheSeite />
      </Suspense>
    );
  }
  if (state.status === 'signedOut') return <LoginPage />;

  // HashRouter: GitHub Pages has no server-side rewrites, so /#/firmen/123 survives a reload.
  return (
    <ToastProvider>
      <MandantProvider>
        <CrmProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<StartPage />} />
                <Route path="eingang" element={<EingangPage />} />
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
                <Route path="kunden">
                  <Route index element={<KundenPage />} />
                  <Route path=":id" element={<KundePage />} />
                  <Route path=":id/:bereich" element={<KundePage />} />
                </Route>
                <Route path="todo">
                  <Route index element={<UebersichtPage />} />
                  <Route path="meine" element={<UebersichtPage nurIch />} />
                  <Route path=":id" element={<BoardPage />} />
                </Route>
                <Route path="whiteboard">
                  <Route index element={<WhiteboardUebersichtPage />} />
                  <Route path=":id" element={<WhiteboardPage />} />
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
                <Route path="magnete">
                  <Route index element={<MagnetLeadsPage />} />
                  <Route path="liste" element={<MagnetePage />} />
                  <Route path="roast/:id" element={<RoastPage />} />
                </Route>
                <Route path="leadmarkt" element={<LeadMarktPage />} />
                <Route path="plattform">
                  <Route index element={<PlattformPage />} />
                  <Route path="markt" element={<MarktVerwaltungPage />} />
                  <Route path=":id" element={<MandantPage />} />
                </Route>
                <Route path="einstellungen" element={<EinstellungenPage />} />
                <Route path="einrichtung" element={instanzModus ? <InstanzEinrichtungPage /> : <EinrichtungPage />} />
                {instanzModus && (
                  <>
                    <Route path="freigaben" element={<FreigabenPage />} />
                    <Route path="fristen/*" element={<KalenderRouten />} />
                    <Route path="ablage/*" element={<AblageRouten />} />
                    <Route path="content/*" element={<ContentRouten />} />
                    <Route path="analytics/*" element={<AnalyticsRouten />} />
                    <Route path="kooperationen/*" element={<KooperationenRouten />} />
                    <Route path="einnahmen/*" element={<EinnahmenRouten />} />
                  </>
                )}
                <Route path="einrichtung/daten" element={<DatenPage />} />
                <Route path="einrichtung/daten/:tab" element={<DatenPage />} />
                <Route path="pipeline" element={<AlteCrmAdresse />} />
                <Route path="firmen/*" element={<AlteCrmAdresse />} />
                <Route path="import" element={<AlteCrmAdresse />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
          <ReauthDialog />
        </CrmProvider>
      </MandantProvider>
    </ToastProvider>
  );
}
