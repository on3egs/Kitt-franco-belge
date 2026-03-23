import { useEffect, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";

const TUNNEL_URL = "https://raw.githubusercontent.com/on3egs/Kitt-franco-belge/main/tunnel.json";

async function getApiBase(): Promise<string | null> {
  try {
    const r = await fetch(TUNNEL_URL, { cache: "no-store" });
    const d = await r.json();
    return d.url || null;
  } catch {
    return null;
  }
}

interface VideoEntry {
  id: string;
  url: string;
  pseudo: string;
  message: string;
  ts: number;
  views?: number;
}

export default function Videos() {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState<string | null>(null);

  useEffect(() => {
    getApiBase().then(base => {
      setApiBase(base);
      if (!base) { setOffline(true); setLoading(false); return; }
      fetch(`${base}/api/videos/approved`)
        .then(r => r.json())
        .then(d => { setVideos(d.approved || []); })
        .catch(() => setOffline(true))
        .finally(() => setLoading(false));
    });
  }, []);

  function trackView(id: string) {
    if (!apiBase) return;
    fetch(`${apiBase}/api/videos/view/${id}`, { method: "POST" }).catch(() => {});
    setVideos(vs => vs.map(v => v.id === id ? { ...v, views: (v.views || 0) + 1 } : v));
  }

  const label = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-24 max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="mb-2 text-center">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "12px" }}>
            // SYSTÈME KITT FRANCO-BELGE — GALERIE VIDÉO
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>
            VIDÉOS
          </h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            SÉLECTIONNÉES PAR MANIX
          </h2>
        </div>

        <div className="mb-10">
          <KittScanner height={6} />
        </div>

        <p className="text-center mb-12" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.65)", lineHeight: 1.9 }}>
          Vidéos liées au projet KITT Franco-Belge, sélectionnées et approuvées par Manix.
          Tu peux <Link href="/soumettre" style={{ color: "#ff2222", textDecoration: "none" }}>soumettre une vidéo</Link> si tu en as une.
        </p>

        {loading && (
          <div className="text-center py-20">
            <div style={{ ...label, color: "rgba(255,34,34,0.5)" }}>// CHARGEMENT EN COURS...</div>
          </div>
        )}

        {!loading && offline && (
          <div className="p-6 text-center" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.2)" }}>
            <div style={{ ...label, color: "#ff4444", marginBottom: "8px" }}>[HORS LIGNE]</div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.6)" }}>
              Le système KITT est temporairement hors ligne. Réessaie plus tard.
            </p>
          </div>
        )}

        {!loading && !offline && videos.length === 0 && (
          <div className="p-8 text-center" style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)" }}>
            <div style={{ ...label, color: "rgba(255,34,34,0.4)", marginBottom: "12px" }}>// AUCUNE VIDÉO</div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.5)" }}>
              Aucune vidéo n'a encore été approuvée.{" "}
              <Link href="/soumettre" style={{ color: "#ff2222" }}>Soumettre la première ?</Link>
            </p>
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {videos.map(v => (
              <div
                key={v.id}
                style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)", cursor: "pointer" }}
                onClick={() => {
                  const opening = selected !== v.id;
                  setSelected(opening ? v.id : null);
                  if (opening) trackView(v.id);
                }}
              >
                {selected === v.id ? (
                  /* YouTube embed */
                  <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${v.id}?autoplay=1`}
                      title="YouTube video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                ) : (
                  /* Thumbnail */
                  <div style={{ position: "relative" }}>
                    <img
                      src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                      alt="thumbnail"
                      style={{ width: "100%", display: "block", border: "none" }}
                    />
                    {/* Play button overlay */}
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.35)",
                    }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: "50%",
                        background: "rgba(255,34,34,0.85)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ color: "white", fontSize: "1.4rem", marginLeft: "4px" }}>▶</span>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ padding: "12px 14px" }}>
                  {v.message && (
                    <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.7)", fontStyle: "italic", marginBottom: "6px" }}>
                      "{v.message}"
                    </p>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ ...label, color: "rgba(255,34,34,0.4)", fontSize: "0.45rem" }}>
                      {v.pseudo} — {new Date(v.ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                    {v.views !== undefined && v.views > 0 && (
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "rgba(255,100,0,0.6)" }}>
                        ▶ {v.views}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-16 flex flex-col md:flex-row gap-4 items-center justify-center">
          <Link href="/soumettre" style={{
            fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
            color: "#ff2222", border: "1px solid rgba(255,34,34,0.4)", padding: "10px 24px",
            background: "rgba(255,34,34,0.08)",
          }}>
            ▶ SOUMETTRE UNE VIDÉO
          </Link>
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.2em" }}>
            ← RETOUR AU SYSTÈME KITT
          </Link>
        </div>
      </div>
    </div>
  );
}
