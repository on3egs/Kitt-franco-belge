import { lazy, Suspense } from "react";
import SiteTools from "./components/SiteTools";
import "./site-polish.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { UserProvider, useUser } from "./contexts/UserContext";
import { TrophyProvider, useTrophies } from "./contexts/TrophyContext";
import { FolderProvider } from "./contexts/FolderContext";
import TrophyNotification from "./components/TrophyNotification";
import Home from "./pages/Home";
const Privacy = lazy(() => import("./pages/Privacy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const Karr = lazy(() => import("./pages/Karr"));
const Manix = lazy(() => import("./pages/Manix"));
const Soumettre = lazy(() => import("./pages/Soumettre"));
const AdminVideos = lazy(() => import("./pages/AdminVideos"));
const Videos = lazy(() => import("./pages/Videos"));
const Musique = lazy(() => import("./pages/Musique"));
const SoumettreMusique = lazy(() => import("./pages/SoumettreMusique"));
const AdminMusique = lazy(() => import("./pages/AdminMusique"));
const Pdfs = lazy(() => import("./pages/Pdfs"));
const SoumettrePdf = lazy(() => import("./pages/SoumettrePdf"));
const AdminPdfs = lazy(() => import("./pages/AdminPdfs"));
const Admin = lazy(() => import("./pages/Admin"));
const MentionsLegales = lazy(() => import("./pages/MentionsLegales"));
const KyronexDashboard = lazy(() => import("./pages/KyronexDashboard"));

function AppRouter() {
  return (
    <Router base={import.meta.env.BASE_URL}>
      <SiteTools />
      <Suspense fallback={<div role="status" className="route-loading">Chargement de l’interface…</div>}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/privacy"} component={Privacy} />
        <Route path={"/data-deletion"} component={DataDeletion} />
        <Route path={"/karr"} component={Karr} />
        <Route path={"/kyronex"} component={KyronexDashboard} />
        <Route path={"/manix"} component={Manix} />
        <Route path={"/soumettre"} component={Soumettre} />
        <Route path={"/videos"} component={Videos} />
        <Route path={"/admin-videos"} component={AdminVideos} />
        <Route path={"/musique"} component={Musique} />
        <Route path={"/soumettre-musique"} component={SoumettreMusique} />
        <Route path={"/admin-musique"} component={AdminMusique} />
        <Route path={"/documents"} component={Pdfs} />
        <Route path={"/soumettre-pdf"} component={SoumettrePdf} />
        <Route path={"/admin-pdfs"} component={AdminPdfs} />
        <Route path={"/admin"} component={Admin} />
        <Route path={"/mentions-legales"} component={MentionsLegales} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </Router>
  );
}

// Connecte TrophyNotification au TrophyContext
function TrophyNotificationConnected() {
  const { newTrophyNotification, dismissNotification } = useTrophies();
  return <TrophyNotification trophy={newTrophyNotification} onDismiss={dismissNotification} />;
}

// Bridge : lit pseudo depuis UserContext pour passer aux providers enfants
function KittSystemBridge({ children }: { children: React.ReactNode }) {
  const { pseudo } = useUser();
  return (
    <TrophyProvider pseudo={pseudo}>
      <FolderProvider pseudo={pseudo}>
        <TrophyNotificationConnected />
        {children}
      </FolderProvider>
    </TrophyProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <UserProvider>
              <KittSystemBridge>
                <Toaster />
                <AppRouter />
              </KittSystemBridge>
            </UserProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
