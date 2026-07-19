import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUser } from "@/contexts/UserContext";
import { useTrophies } from "@/contexts/TrophyContext";
import { useFolders } from "@/contexts/FolderContext";
import UserLoginModal from "@/components/UserLoginModal";
import FolderPanel from "@/components/FolderPanel";
import TrophyPanel from "@/components/TrophyPanel";

import { getApiBase } from "@/lib/tunnel";

interface VideoEntry {
  id: string;
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

/** Simple heuristic: détecte si un texte est probablement anglais */
function detectLang(text: string): "fr" | "en" {
  const enWords = /\b(the|and|is|are|was|were|this|that|with|have|from|your|you|for|can|will|would|should|they|them|their|here|there)\b/gi;
  const frWords = /\b(le|la|les|un|une|des|est|sont|avec|pour|dans|sur|que|qui|mais|donc|car|alors|aussi|cette|mon|ma|mes|ce|se)\b/gi;
  const enCount = (text.match(enWords) || []).length;
  const frCount = (text.match(frWords) || []).length;
  return enCount > frCount ? "en" : "fr";
}

// ── Bouton flottant CTA — scanner KITT animé ─────────────────────────────────
function FloatingCTA() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const posRef = useRef(0);
  const dirRef = useRef(1);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const x = posRef.current;
      const grad = ctx.createRadialGradient(x, H / 2, 0, x, H / 2, 30);
      grad.addColorStop(0, "rgba(255,34,34,0.9)");
      grad.addColorStop(0.4, "rgba(255,34,34,0.4)");
      grad.addColorStop(1, "rgba(255,34,34,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      posRef.current += dirRef.current * 2.2;
      if (posRef.current >= W) dirRef.current = -1;
      if (posRef.current <= 0) dirRef.current = 1;

      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <Link
      href="/soumettre"
      title="Partage ta création avec la communauté"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: "28px",
        right: "24px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textDecoration: "none",
        filter: hovered ? "drop-shadow(0 0 14px rgba(255,34,34,0.9))" : "drop-shadow(0 0 6px rgba(255,34,34,0.5))",
        transition: "filter 0.2s ease, transform 0.2s ease",
        transform: hovered ? "scale(1.06) translateY(-2px)" : "scale(1)",
      }}
    >
      {/* Scanner canvas sous le bouton */}
      <canvas
        ref={canvasRef}
        width={160}
        height={4}
        style={{ display: "block", opacity: 0.8, marginBottom: "2px" }}
      />
      <div style={{
        background: hovered ? "#cc1111" : "#0a0000",
        border: "2px solid #ff2222",
        padding: "12px 20px",
        fontFamily: "Orbitron, monospace",
        fontSize: "0.6rem",
        letterSpacing: "0.15em",
        color: "#ff2222",
        whiteSpace: "nowrap",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.2s ease",
      }}>
        {hovered && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
            animation: "shimmer-btn 0.6s ease",
          }} />
        )}
        🚗 PROPOSE TA VIDÉO
      </div>
      <canvas
        width={160}
        height={4}
        style={{ display: "block", opacity: 0.5, marginTop: "2px", transform: "scaleX(-1)" }}
      />
    </Link>
  );
}

// ── Bandeau éducatif dismissable ─────────────────────────────────────────────
function EducationBanner({ count }: { count: number }) {
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem("kitt-banner-dismissed") === "1"
  );
  const [visible, setVisible] = useState(false);
  const [scanPos, setScanPos] = useState(0);
  const [scanDir, setScanDir] = useState(1);

  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, [dismissed]);

  // Animation scanner dans le bandeau
  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => {
      setScanPos(p => {
        const next = p + scanDir * 1.5;
        if (next >= 100) setScanDir(-1);
        if (next <= 0) setScanDir(1);
        return Math.max(0, Math.min(100, next));
      });
    }, 16);
    return () => clearInterval(id);
  }, [dismissed, scanDir]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      sessionStorage.setItem("kitt-banner-dismissed", "1");
    }, 400);
  };

  if (dismissed) return null;

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      background: "rgba(255,34,34,0.10)",
      border: "1px solid rgba(255,34,34,0.5)",
      borderLeft: "4px solid #ff2222",
      padding: "14px 48px 14px 20px",
      marginBottom: "28px",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(-12px)",
      transition: "all 0.4s ease",
    }}>
      {/* Ligne scanner animée */}
      <div style={{
        position: "absolute",
        top: 0,
        left: `${scanPos}%`,
        width: "60px",
        height: "100%",
        background: "linear-gradient(90deg, transparent, rgba(255,34,34,0.15), transparent)",
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        {/* Indicateur ON-AIR */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <span style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#ff2222",
            boxShadow: "0 0 8px rgba(255,34,34,0.8)",
            animation: "blink-red 1s ease-in-out infinite",
          }} />
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#ff2222", letterSpacing: "0.2em" }}>
            LIVE
          </span>
        </div>

        <p style={{
          fontFamily: "Rajdhani, sans-serif",
          fontSize: "1rem",
          fontWeight: 700,
          color: "rgba(255,255,255,0.95)",
          flex: 1,
          lineHeight: 1.4,
        }}>
          🔥 VOUS POUVEZ PARTAGER VOS PROPRES VIDÉOS —{" "}
          <span style={{ color: "#ff6666" }}>
            {count > 0 ? `${count} contributeur${count > 1 ? "s" : ""} déjà dans la galerie !` : "Soyez le premier à contribuer !"}
          </span>
        </p>

        <Link
          href="/soumettre"
          style={{
            fontFamily: "Orbitron, monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.12em",
            color: "white",
            background: "#ff2222",
            padding: "7px 16px",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#cc1111")}
          onMouseLeave={e => (e.currentTarget.style.background = "#ff2222")}
        >
          ▶ PROPOSER MA VIDÉO
        </Link>
      </div>

      {/* Bouton fermer */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: "50%",
          right: "14px",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: "rgba(255,34,34,0.6)",
          cursor: "pointer",
          fontFamily: "Space Mono, monospace",
          fontSize: "0.7rem",
          lineHeight: 1,
          padding: "4px",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Badge composant ───────────────────────────────────────────────────────────
function Badge({ label, color = "#ff2222", bg = "rgba(255,34,34,0.15)" }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontFamily: "Space Mono, monospace",
      fontSize: "0.42rem",
      letterSpacing: "0.1em",
      color,
      background: bg,
      border: `1px solid ${color}`,
      padding: "2px 7px",
      borderRadius: "2px",
      boxShadow: `0 0 6px ${color}40`,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ── Filtre de langue ──────────────────────────────────────────────────────────
type LangFilter = "all" | "fr" | "en";

function LangFilter({ value, onChange }: { value: LangFilter; onChange: (v: LangFilter) => void }) {
  const opts: { v: LangFilter; label: string }[] = [
    { v: "all", label: "TOUS" },
    { v: "fr", label: "FR 🇫🇷" },
    { v: "en", label: "EN 🇬🇧" },
  ];
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.15em", marginRight: "4px" }}>
        LANGUE :
      </span>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            fontFamily: "Space Mono, monospace",
            fontSize: "0.5rem",
            letterSpacing: "0.1em",
            padding: "4px 10px",
            border: `1px solid ${value === o.v ? "#ff2222" : "rgba(255,34,34,0.25)"}`,
            background: value === o.v ? "rgba(255,34,34,0.2)" : "rgba(255,34,34,0.04)",
            color: value === o.v ? "#ff2222" : "rgba(192,192,192,0.5)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: value === o.v ? "0 0 8px rgba(255,34,34,0.3)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Compteur stat ─────────────────────────────────────────────────────────────
function StatChip({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 18px",
      background: "rgba(255,34,34,0.05)",
      border: "1px solid rgba(255,34,34,0.2)",
      gap: "2px",
    }}>
      <span style={{ fontSize: "1rem" }}>{icon}</span>
      <span style={{ fontFamily: "Orbitron, monospace", fontSize: "1rem", color: "#ff2222", fontWeight: 900, lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.4rem", color: "rgba(192,192,192,0.45)", letterSpacing: "0.15em" }}>{label}</span>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Videos() {
  const { t } = useLanguage();
  const { pseudo, isLoggedIn } = useUser();
  const { trophies, totalPoints, level, incrementView } = useTrophies();
  const { folders, createFolder, deleteFolder, renameFolder, addVideoToFolder, removeVideoFromFolder, toggleFolderPublic, isVideoInFolder } = useFolders();
  const [showLogin, setShowLogin] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [showTrophies, setShowTrophies] = useState(false);
  const [folderTargetVideo, setFolderTargetVideo] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<LangFilter>("all");

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
    incrementView(id); // trophées + compteur perso
  }

  const label = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  // ── Stats dérivées ────────────────────────────────────────────────────────
  const uniqueContributors = new Set(videos.map(v => v.pseudo.toLowerCase())).size;
  const totalViews = videos.reduce((acc, v) => acc + (v.views || 0), 0);

  // Top fan : pseudo avec le plus de vues cumulées
  const viewsByPseudo: Record<string, number> = {};
  for (const v of videos) {
    const p = v.pseudo.toLowerCase();
    viewsByPseudo[p] = (viewsByPseudo[p] || 0) + (v.views || 0);
  }
  const topFan = Object.entries(viewsByPseudo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Premier contributeur (ts le plus ancien)
  const firstContributorId = videos.length > 0
    ? [...videos].sort((a, b) => a.ts - b.ts)[0].id
    : null;

  // Filtrage par langue
  const filteredVideos = langFilter === "all"
    ? videos
    : videos.filter(v => detectLang(v.message + " " + v.pseudo) === langFilter);

  const btnStyle: React.CSSProperties = {
    fontFamily: "Courier New, monospace", fontSize: "0.7em", letterSpacing: "3px",
    padding: "9px 20px", background: "transparent", border: "1px solid #440000",
    color: "#cc3300", cursor: "pointer", transition: "all 0.2s",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      {/* Modales */}
      {showLogin && <UserLoginModal onClose={() => setShowLogin(false)} />}
      {showFolders && (
        <FolderPanel
          pseudo={pseudo ?? ""}
          folders={folders}
          currentVideoId={folderTargetVideo ?? undefined}
          onCreateFolder={(name) => { createFolder(name); }}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onAddVideo={(fid, vid) => addVideoToFolder(fid, vid)}
          onRemoveVideo={(fid, vid) => removeVideoFromFolder(fid, vid)}
          onTogglePublic={toggleFolderPublic}
          onClose={() => { setShowFolders(false); setFolderTargetVideo(null); }}
        />
      )}
      {showTrophies && (
        <TrophyPanel
          pseudo={pseudo ?? ""}
          trophies={trophies}
          totalPoints={totalPoints}
          level={level}
          onClose={() => setShowTrophies(false)}
        />
      )}
      <style>{`
        @keyframes blink-red {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; box-shadow: 0 0 12px rgba(255,34,34,1); }
        }
        @keyframes shimmer-btn {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pulse-red {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 10px rgba(255,34,34,0.8); }
        }
        @keyframes kitt-scan-hover {
          0% { left: -30%; }
          100% { left: 130%; }
        }
        .video-card {
          background: rgba(255,34,34,0.04);
          border: 1px solid rgba(255,34,34,0.15);
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .video-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -30%;
          width: 30%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,34,34,0.08), transparent);
          transition: none;
          pointer-events: none;
          z-index: 0;
        }
        .video-card:hover {
          transform: scale(1.025) translateY(-3px);
          border-color: rgba(255,34,34,0.75);
          box-shadow: 0 0 25px rgba(255,34,34,0.25), 0 6px 24px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,34,34,0.1);
        }
        .video-card:hover::before {
          animation: kitt-scan-hover 0.6s ease-out;
        }
        .platform-badge-yt {
          position: absolute; top: 8px; right: 8px;
          background: #ff0000; color: white;
          font-family: 'Orbitron', monospace; font-size: 0.5rem;
          font-weight: 700; letter-spacing: 0.05em; padding: 3px 7px; border-radius: 3px;
          z-index: 2; box-shadow: 0 1px 6px rgba(0,0,0,0.6);
        }
        .platform-badge-fb {
          position: absolute; top: 8px; right: 8px;
          background: #1877f2; color: white;
          font-family: 'Orbitron', monospace; font-size: 0.5rem;
          font-weight: 700; letter-spacing: 0.05em; padding: 3px 7px; border-radius: 3px;
          z-index: 2; box-shadow: 0 1px 6px rgba(0,0,0,0.6);
        }
        .corner-accent {
          position: absolute;
          width: 12px; height: 12px;
          border-color: #ff2222;
          border-style: solid;
        }
      `}</style>

      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Bouton flottant toujours visible */}
      <FloatingCTA />

      <div className="relative container py-24 max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="mb-2 text-center">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "12px" }}>
            {t("videospage.sys")}
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>
            {t("videospage.title")}
          </h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            {t("videospage.subtitle")}
          </h2>
        </div>

        <div className="mb-6">
          <KittScanner height={6} />
        </div>

        {/* ── Barre utilisateur KITT ── */}
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
          {!isLoggedIn ? (
            <button style={btnStyle} onClick={() => setShowLogin(true)}>[ CONNEXION ]</button>
          ) : (
            <>
              <span style={{ ...btnStyle, cursor: "default", color: "#886644", borderColor: "#332200" }}>
                ● {pseudo}  {totalPoints}pts  Niv.{level}
              </span>
              <button style={{ ...btnStyle, color: "#884400", borderColor: "#441100" }}
                onClick={() => setShowLogin(true)}>[ COMPTE ]</button>
            </>
          )}
          {isLoggedIn && (
            <button style={{ ...btnStyle, color: "#cc5500", borderColor: "#441100" }}
              onClick={() => { setFolderTargetVideo(null); setShowFolders(true); }}>
              [ 📁 MES DOSSIERS ({folders.length}) ]
            </button>
          )}
          <button style={{ ...btnStyle, color: "#cc8800", borderColor: "#553300" }}
            onClick={() => setShowTrophies(true)}>
            [ 🏆 TROPHÉES{isLoggedIn ? ` (${trophies.filter(t => t.unlocked).length})` : ""} ]
          </button>
        </div>

        {/* Bandeau éducatif */}
        <EducationBanner count={uniqueContributors} />

        {/* Stats rapides */}
        {videos.length > 0 && (
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "28px" }}>
            <StatChip icon="🎬" value={videos.length} label="VIDÉOS" />
            <StatChip icon="👥" value={uniqueContributors} label="CONTRIBUTEURS" />
            <StatChip icon="▶" value={totalViews > 0 ? `${totalViews}` : "—"} label="VUES" />
            {topFan && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 18px",
                background: "rgba(255,200,0,0.07)",
                border: "1px solid rgba(255,200,0,0.3)",
                boxShadow: "0 0 12px rgba(255,200,0,0.1)",
              }}>
                <span style={{ fontSize: "1.1rem" }}>🏆</span>
                <div>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.4rem", color: "rgba(255,200,0,0.6)", letterSpacing: "0.15em", marginBottom: "2px" }}>TOP FAN</div>
                  <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "#ffc800", fontWeight: 700, letterSpacing: "0.05em" }}>
                    {topFan}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center mb-8" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.65)", lineHeight: 1.9 }}>
          {t("videospage.desc")} <Link href="/soumettre" style={{ color: "#ff2222", textDecoration: "none" }}>{t("videospage.submit.link")}</Link> {t("videospage.desc2")}
        </p>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#ff2222", animation: "pulse-red 1.2s ease-in-out infinite" }} />
              <span style={{ ...label, color: "rgba(255,34,34,0.6)" }}>{t("videospage.loading")}</span>
              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#ff2222", animation: "pulse-red 1.2s ease-in-out infinite 0.4s" }} />
            </div>
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

        {/* Empty state */}
        {!loading && !offline && videos.length === 0 && (
          <div className="py-16 text-center flex flex-col items-center gap-6" style={{ background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)" }}>
            <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "4px" }}>{t("videospage.empty")}</div>
            <div style={{ width: "280px" }}>
              <KittScanner height={5} />
            </div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.5)", maxWidth: "380px", lineHeight: 1.8 }}>
              {t("videospage.empty.msg")}{" "}
              <Link href="/soumettre" style={{ color: "#ff2222", textDecoration: "none" }}>{t("videospage.empty.first")}</Link>
            </p>
          </div>
        )}

        {/* Galerie vidéo */}
        {!loading && videos.length > 0 && (
          <>
            {/* Filtre langue + compteur résultats */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
              <LangFilter value={langFilter} onChange={setLangFilter} />
              <span style={{ ...label, color: "rgba(255,34,34,0.35)", fontSize: "0.44rem" }}>
                {filteredVideos.length} / {videos.length} VIDÉOS
              </span>
            </div>

            {filteredVideos.length === 0 && (
              <div className="p-8 text-center" style={{ border: "1px solid rgba(255,34,34,0.15)" }}>
                <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.5)" }}>
                  Aucune vidéo dans cette langue pour le moment.{" "}
                  <button onClick={() => setLangFilter("all")} style={{ color: "#ff2222", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>
                    Voir toutes les vidéos →
                  </button>
                </p>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredVideos.map(v => {
                const isHovered = hoveredId === v.id;
                const fb = isFacebook(v.url);
                const isFirst = v.id === firstContributorId;
                const isTopFan = topFan !== null && v.pseudo.toLowerCase() === topFan;

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
                    {/* Coins décoratifs style HUD */}
                    <div className="corner-accent" style={{ top: 0, left: 0, borderWidth: "2px 0 0 2px" }} />
                    <div className="corner-accent" style={{ top: 0, right: 0, borderWidth: "2px 2px 0 0" }} />
                    <div className="corner-accent" style={{ bottom: 0, left: 0, borderWidth: "0 0 2px 2px" }} />
                    <div className="corner-accent" style={{ bottom: 0, right: 0, borderWidth: "0 2px 2px 0" }} />

                    {selected === v.id ? (
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
                      <div style={{ position: "relative" }}>
                        {fb ? (
                          <span className="platform-badge-fb">FB</span>
                        ) : (
                          <span className="platform-badge-yt">YT</span>
                        )}

                        {fb ? (
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
                          background: isHovered ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.3)",
                          transition: "background 0.25s ease",
                        }}>
                          <div style={{
                            width: 54, height: 54, borderRadius: "50%",
                            background: isHovered ? "rgba(255,34,34,1)" : "rgba(255,34,34,0.85)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: isHovered ? "0 0 28px rgba(255,34,34,0.8), 0 0 60px rgba(255,34,34,0.3)" : "0 0 8px rgba(255,34,34,0.4)",
                            transition: "background 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease",
                            transform: isHovered ? "scale(1.12)" : "scale(1)",
                          }}>
                            <span style={{ color: "white", fontSize: "1.4rem", marginLeft: "4px" }}>▶</span>
                          </div>
                        </div>

                        {/* Barre scanner au bas de la thumbnail au hover */}
                        {isHovered && (
                          <div style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: "3px",
                            background: "linear-gradient(90deg, transparent, #ff2222, #ff6666, #ff2222, transparent)",
                            backgroundSize: "200% 100%",
                            animation: "kitt-scan-hover 0.8s ease-in-out infinite",
                          }} />
                        )}
                      </div>
                    )}

                    {/* Footer carte */}
                    <div style={{ padding: "12px 14px", position: "relative", zIndex: 1 }}>
                      {v.message && (
                        <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.7)", fontStyle: "italic", marginBottom: "8px", lineHeight: 1.4 }}>
                          "{v.message}"
                        </p>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                        {/* Pseudo + badges */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "Orbitron, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.08em" }}>
                              {v.pseudo}
                            </span>
                            {isFirst && <Badge label="⭐ FONDATEUR" color="#ffc800" bg="rgba(255,200,0,0.1)" />}
                            {isTopFan && !isFirst && <Badge label="🏆 TOP FAN" color="#ffc800" bg="rgba(255,200,0,0.1)" />}
                          </div>
                          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.4rem", color: "rgba(192,192,192,0.3)", letterSpacing: "0.1em" }}>
                            {new Date(v.ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </div>
                        </div>

                        {/* Vues */}
                        {v.views !== undefined && v.views > 0 && (
                          <div style={{
                            fontFamily: "Space Mono, monospace", fontSize: "0.45rem",
                            color: "white", background: "#ff2222",
                            borderRadius: "999px", padding: "3px 9px",
                            letterSpacing: "0.05em",
                            boxShadow: "0 0 8px rgba(255,34,34,0.5)",
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

            {/* Encart CTA communautaire — après la grille */}
            <div style={{
              marginTop: "48px",
              border: "1px solid rgba(255,34,34,0.45)",
              background: "rgba(255,34,34,0.06)",
              padding: "32px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Scanner décoratif */}
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: "3px", height: "100%",
                background: "linear-gradient(180deg, #ff2222 0%, rgba(255,34,34,0.1) 100%)",
              }} />
              <div style={{
                position: "absolute", bottom: 0, right: 0,
                width: "40%", height: "2px",
                background: "linear-gradient(270deg, #ff2222 0%, transparent 100%)",
              }} />

              <div style={{ paddingLeft: "16px" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em", marginBottom: "8px" }}>
                  // REJOINDRE LA GALERIE OFFICIELLE
                </div>
                <h3 style={{ fontFamily: "Orbitron, monospace", fontSize: "1.2rem", color: "white", marginBottom: "12px", fontWeight: 700 }}>
                  VOUS AVEZ UNE VIDÉO LIÉE AU PROJET ?
                </h3>
                <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.85, marginBottom: "22px", maxWidth: "620px" }}>
                  Soumettez-la en 30 secondes. Elle sera examinée par Manix et pourra rejoindre cette galerie officielle.
                  YouTube, Facebook — toutes plateformes acceptées.
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <Link
                    href="/soumettre"
                    style={{
                      fontFamily: "Orbitron, monospace", fontSize: "0.65rem", letterSpacing: "0.15em",
                      color: "white", background: "#ff2222", border: "none",
                      padding: "12px 28px", display: "inline-block", textDecoration: "none",
                      boxShadow: "0 0 20px rgba(255,34,34,0.4)",
                      transition: "background 0.2s ease, box-shadow 0.2s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#cc1111"; e.currentTarget.style.boxShadow = "0 0 28px rgba(255,34,34,0.7)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#ff2222"; e.currentTarget.style.boxShadow = "0 0 20px rgba(255,34,34,0.4)"; }}
                  >
                    🚗 SOUMETTRE MA VIDÉO
                  </Link>
                  <Link
                    href="/videos"
                    style={{
                      fontFamily: "Orbitron, monospace", fontSize: "0.65rem", letterSpacing: "0.15em",
                      color: "rgba(192,192,192,0.6)", border: "1px solid rgba(255,34,34,0.2)",
                      padding: "12px 28px", display: "inline-block", textDecoration: "none",
                    }}
                  >
                    VOIR LA GALERIE
                  </Link>
                </div>
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
            {t("videospage.cta.submit")}
          </Link>
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.2em" }}>
            {t("videospage.cta.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
