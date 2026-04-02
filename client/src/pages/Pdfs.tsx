import { useEffect, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getApiBase } from "@/lib/tunnel";

interface PdfEntry {
  id: string;
  url: string;
  titre: string;
  description: string;
  categorie: string;
  pseudo: string;
  ts: number;
  views?: number;
}

const CAT_COLORS: Record<string, string> = {
  "Knight Rider": "#ff2222",
  "Technique": "#ff6600",
  "Histoire": "#ffaa00",
  "Électronique": "#00aaff",
  "Autre": "rgba(192,192,192,0.6)",
};

export default function Pdfs() {
  const { t } = useLanguage();
  const [pdfs, setPdfs] = useState<PdfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("Tous");

  useEffect(() => {
    getApiBase().then(base => {
      setApiBase(base);
      if (!base) { setOffline(true); setLoading(false); return; }
      fetch(`${base}/api/pdfs/approved`)
        .then(r => r.json())
        .then(d => setPdfs(d.approved || []))
        .catch(() => setOffline(true))
        .finally(() => setLoading(false));
    });
  }, []);

  function openPdf(pdf: PdfEntry) {
    // Track view
    if (apiBase) {
      fetch(`${apiBase}/api/pdfs/view/${pdf.id}`, { method: "POST" }).catch(() => {});
    }
    window.open(pdf.url, "_blank", "noopener,noreferrer");
  }

  const categories = ["Tous", ...Array.from(new Set(pdfs.map(p => p.categorie).filter(Boolean)))];
  const filtered = filter === "Tous" ? pdfs : pdfs.filter(p => p.categorie === filter);
  const label: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-16 max-w-5xl mx-auto px-4">
        <div className="mb-2 text-center">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "12px" }}>
            {t("pdfs.sys")}
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>
            {t("pdfs.title")}
          </h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            {t("pdfs.subtitle")}
          </h2>
        </div>

        <div className="mb-8"><KittScanner height={6} /></div>

        <p className="text-center mb-8" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.65)", lineHeight: 1.9 }}>
          {t("pdfs.desc")} <Link href="/soumettre-pdf" style={{ color: "#ff2222", textDecoration: "none" }}>{t("pdfs.submit.link")}</Link>.
        </p>

        {/* Filtres catégories */}
        {!loading && pdfs.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)}
                style={{
                  fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.1em",
                  padding: "5px 14px", cursor: "pointer",
                  background: filter === cat ? "rgba(255,34,34,0.2)" : "transparent",
                  border: `1px solid ${filter === cat ? "#ff2222" : "rgba(255,34,34,0.25)"}`,
                  color: filter === cat ? "#ff2222" : "rgba(192,192,192,0.6)",
                }}>
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="text-center py-20">
            <div style={{ ...label, color: "rgba(255,34,34,0.5)" }}>{t("pdfs.loading")}</div>
          </div>
        )}
        {!loading && offline && (
          <div className="p-8 text-center" style={{ background: "rgba(20,4,0,0.85)", border: "1px solid rgba(220,60,0,0.5)", boxShadow: "0 0 32px rgba(180,40,0,0.15), inset 0 0 20px rgba(80,0,0,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "14px" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#ff4422", boxShadow: "0 0 10px #ff4422", animation: "kitt-blink 1.2s ease-in-out infinite" }} />
              <div style={{ ...label, color: "#ff5533", fontSize: "0.75rem", letterSpacing: "4px" }}>SYSTEME EN MAINTENANCE</div>
            </div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "#ddaa88", lineHeight: 2, letterSpacing: "1px" }}>
              KYRONEX EST TEMPORAIREMENT HORS LIGNE<br />
              <span style={{ color: "rgba(200,160,100,0.75)", fontSize: "0.9rem" }}>Retour prévu dans quelques minutes à quelques heures.<br />Rechargez la page pour vérifier l'état du système.</span>
            </div>
          </div>
        )}
        {!loading && !offline && filtered.length === 0 && (
          <div className="p-8 text-center" style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)" }}>
            <div style={{ ...label, color: "rgba(255,34,34,0.4)", marginBottom: "12px" }}>{t("pdfs.empty")}</div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.5)" }}>
              {t("pdfs.empty")}{" "}
              <Link href="/soumettre-pdf" style={{ color: "#ff2222" }}>{t("pdfs.submit.first")}</Link>
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(pdf => (
              <div
                key={pdf.id}
                onClick={() => openPdf(pdf)}
                style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)", padding: "18px", cursor: "pointer", transition: "border-color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,34,34,0.4)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,34,34,0.15)")}
              >
                {/* Icône PDF */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ fontSize: "2rem", flexShrink: 0, lineHeight: 1 }}>📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {pdf.categorie && (
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: CAT_COLORS[pdf.categorie] || "rgba(255,34,34,0.6)", letterSpacing: "0.15em", marginBottom: "4px" }}>
                        {pdf.categorie.toUpperCase()}
                      </div>
                    )}
                    <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "#fff", marginBottom: "6px", lineHeight: 1.4 }}>
                      {pdf.titre}
                    </div>
                    {pdf.description && (
                      <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.82rem", color: "rgba(192,192,192,0.65)", marginBottom: "8px", lineHeight: 1.5 }}>
                        {pdf.description.length > 80 ? pdf.description.slice(0, 80) + "…" : pdf.description}
                      </p>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: "rgba(255,34,34,0.4)" }}>
                        {new Date(pdf.ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </div>
                      {pdf.views !== undefined && pdf.views > 0 && (
                        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: "rgba(255,100,0,0.55)" }}>
                          👁 {pdf.views}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: "10px", fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "#ff2222", letterSpacing: "0.1em" }}>
                  {t("pdfs.open")} ↗
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 flex flex-col md:flex-row gap-4 items-center justify-center">
          <Link href="/soumettre-pdf" style={{
            fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
            color: "#ff2222", border: "1px solid rgba(255,34,34,0.4)", padding: "10px 24px",
            background: "rgba(255,34,34,0.08)",
          }}>
            📄 {t("pdfs.cta.submit")}
          </Link>
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.2em" }}>
            {t("pdfs.cta.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
