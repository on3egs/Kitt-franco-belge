import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <main id="main-content" className="min-h-screen w-full flex items-center justify-center bg-[#0a0000]">
      <Card className="w-full max-w-lg mx-4 shadow-lg border border-red-900/40 bg-[#140d15]">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-red-400 mb-2">404</h1>

          <h2 className="text-xl font-semibold text-white mb-4">
            Cette route n’existe plus.
          </h2>

          <p className="text-slate-300 mb-8 leading-relaxed">
            Revenez au centre de commande ou utilisez la recherche pour retrouver votre rubrique.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="bg-red-700 hover:bg-red-600 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Retour à l’accueil
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
