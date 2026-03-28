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
import Privacy from "./pages/Privacy";
import DataDeletion from "./pages/DataDeletion";
import Karr from "./pages/Karr";
import Manix from "./pages/Manix";
import Soumettre from "./pages/Soumettre";
import AdminVideos from "./pages/AdminVideos";
import Videos from "./pages/Videos";
import Musique from "./pages/Musique";
import SoumettreMusique from "./pages/SoumettreMusique";
import AdminMusique from "./pages/AdminMusique";
import Pdfs from "./pages/Pdfs";
import SoumettrePdf from "./pages/SoumettrePdf";
import AdminPdfs from "./pages/AdminPdfs";
import Admin from "./pages/Admin";

function AppRouter() {
  return (
    <Router base={import.meta.env.BASE_URL}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/privacy"} component={Privacy} />
        <Route path={"/data-deletion"} component={DataDeletion} />
        <Route path={"/karr"} component={Karr} />
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
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
