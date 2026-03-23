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
  id: string;       // YouTube ID ou URL complète Facebook
  url: string;
  pseudo: string;
  message: string;
  ts: number;
  views?: number;
  platform?: "youtube" | "facebook" | "other";
}

function getYtId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isFacebook(url: string): boolean {
  return url.includes("facebook.com") || url.includes("fb.watch");
}

function getFbEmbedUrl(url: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
}

export default function Videos() {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

        {/* Loading state — pulsing dot */}
        {loading && (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#ff2222",
                animation: "pulse-red 1.2s ease-in-out infinite",
              }} />
              <span style={{ ...label, color: "rgba(255,34,34,0.6)" }}>// CHARGEMENT EN COURS...</span>
              <span style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#ff2222",
                animation: "pulse-red 1.2s ease-in-out infinite 0.4s",
              }} />
            </div>
            <style>{`
              @keyframes pulse-red {
                0%, 100% { opacity: 0.2; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 10px rgba(255,34,34,0.8); }
              }
            `}</style>
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

        {/* Empty state with scanner animation */}
        {!loading && !offline && videos.length === 0 && (
          <div className="py-16 text-center flex flex-col items-center gap-6" style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)" }}>
            <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "4px" }}>// AUCUNE VIDÉO EN BASE</div>
            <div style={{ width: "280px" }}>
              <KittScanner height={5} />
            </div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.5)", maxWidth: "380px", lineHeight: 1.8 }}>
              Aucune vidéo n'a encore été approuvée par Manix.{" "}
              <Link href="/soumettre" style={{ color: "#ff2222", textDecoration: "none" }}>Soumettre la première ?</Link>
            </p>
          </div>
        )}

        {/* Video grid */}
        {!loading && videos.length > 0 && (
          <>
            <style>{`
              .video-card {
                background: rgba(255,34,34,0.04);
                border: 1px solid rgba(255,34,34,0.15);
                cursor: pointer;
                transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
              }
              .video-card:hover {
                transform: scale(1.025);
                border-color: rgba(255,34,34,0.7);
                box-shadow: 0 0 18px rgba(255,34,34,0.25), 0 0 4px rgba(255,34,34,0.15);
              }
              .platform-badge-yt {
                position: absolute;
                top: 8px;
                right: 8px;
                background: #ff0000;
                color: white;
                font-family: 'Orbitron', monospace;
                font-size: 0.5rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                padding: 3px 7px;
                border-radius: 3px;
                z-index: 2;
                box-shadow: 0 1px 6px rgba(0,0,0,0.6);
              }
              .platform-badge-fb {
                position: absolute;
                top: 8px;
                right: 8px;
                background: #1877f2;
                color: white;
                font-family: 'Orbitron', monospace;
                font-size: 0.5rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                padding: 3px 7px;
                border-radius: 3px;
                z-index: 2;
                box-shadow: 0 1px 6px rgba(0,0,0,0.6);
              }
            `}</style>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {videos.map(v => {
                const isHovered = hoveredId === v.id;
                const fb = isFacebook(v.url);
                return (
                  <div
                    key={v.id}
                    className="video-card"
                    onMouseEnter={() => setHoveredId(v.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      const opening = selected !== v.id;
                      setSelected(opening ? v.id : null);
                      if (opening) trackView(v.id);
                    }}
                  >
                    {selected === v.id ? (
                      /* Embed */
                      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
                        {fb ? (
                          <iframe
                            src={getFbEmbedUrl(v.url)}
                            title="Facebook video"
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                            allowFullScreen
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                          />
                        ) : (
                          <iframe
                            src={`https://www.youtube.com/embed/${getYtId(v.url) || v.id}?autoplay=1`}
                            title="YouTube video"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                          />
                        )}
                      </div>
                    ) : (
                      /* Thumbnail */
                      <div style={{ position: "relative" }}>
                        {/* Platform badge */}
                        {fb ? (
                          <span className="platform-badge-fb">FB</span>
                        ) : (
                          <span className="platform-badge-yt">YT</span>
                        )}

                        {fb ? (
                          /* Facebook placeholder — gradient instead of emoji */
                          <div style={{ width: "100%", paddingBottom: "56.25%", position: "relative" }}>
                            <div style={{
                              position: "absolute", inset: 0,
                              background: "linear-gradient(135deg, #0d1b3e 0%, #1a3a6e 50%, #0d1b3e 100%)",
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px"
                            }}>
                              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ color: "white", fontFamily: "Georgia, serif", fontWeight: "bold", fontSize: "1.3rem", lineHeight: 1 }}>f</span>
                              </div>
                              <span style={{ fontFamily: "Orbitron, monospace", fontSize: "0.45rem", color: "rgba(100,150,255,0.9)", letterSpacing: "0.1em" }}>FACEBOOK VIDEO</span>
                            </div>
                          </div>
                        ) : (
                          <img
                            src={`https://img.youtube.com/vi/${getYtId(v.url) || v.id}/mqdefault.jpg`}
                            alt="thumbnail"
                            style={{ width: "100%", display: "block", border: "none" }}
                          />
                        )}

                        {/* Play button overlay */}
                        <div style={{
                          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: isHovered ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.3)",
                          transition: "background 0.2s ease",
                        }}>
                          <div style={{
                            width: 52, height: 52, borderRadius: "50%",
                            background: isHovered ? "rgba(255,34,34,1)" : "rgba(255,34,34,0.85)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: isHovered ? "0 0 20px rgba(255,34,34,0.6)" : "none",
                            transition: "background 0.2s ease, box-shadow 0.2s ease",
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
                          <div style={{
                            fontFamily: "Space Mono, monospace", fontSize: "0.45rem",
                            color: "white",
                            background: "#ff2222",
                            borderRadius: "999px",
                            padding: "2px 8px",
                            letterSpacing: "0.05em",
                          }}>
                            ▶ {v.views}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit CTA banner */}
            <div style={{
              marginTop: "48px",
              border: "1px solid rgba(255,34,34,0.45)",
              background: "rgba(255,34,34,0.06)",
              padding: "28px 32px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Corner accent */}
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: "3px", height: "100%",
                background: "linear-gradient(180deg, #ff2222 0%, rgba(255,34,34,0.1) 100%)",
              }} />
              <div style={{ paddingLeft: "12px" }}>
                <div style={{ ...label, color: "rgba(255,34,34,0.6)", fontSize: "0.55rem", marginBottom: "10px" }}>
                  // VOUS AVEZ UNE VIDÉO ?
                </div>
                <h3 style={{ fontFamily: "Orbitron, monospace", fontSize: "1.1rem", color: "white", marginBottom: "10px", fontWeight: 700 }}>
                  REJOIGNEZ LA GALERIE OFFICIELLE
                </h3>
                <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.85, marginBottom: "20px", maxWidth: "620px" }}>
                  Si vous avez filmé ou trouvé une vidéo liée au projet KITT Franco-Belge, soumettez-la !
                  Elle sera examinée par Manix et pourrait rejoindre la galerie officielle.
                </p>
                <Link
                  href="/soumettre"
                  style={{
                    fontFamily: "Orbitron, monospace", fontSize: "0.65rem", letterSpacing: "0.15em",
                    color: "white",
                    background: "#ff2222",
                    border: "none",
                    padding: "11px 26px",
                    display: "inline-block",
                    textDecoration: "none",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#cc1111")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#ff2222")}
                >
                  ▶ SOUMETTRE MA VIDÉO
                </Link>
              </div>
            </div>
          </>
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
