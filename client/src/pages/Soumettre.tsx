import { useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getApiBase } from "@/lib/tunnel";

export default function Soumettre() {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const base = await getApiBase();
      if (!base) throw new Error("KITT hors ligne — réessaie plus tard.");
      const res = await fetch(`${base}/api/video-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), pseudo: pseudo.trim() || "Anonyme", message: message.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("ok");
        setUrl(""); setPseudo(""); setMessage("");
      } else {
        throw new Error(data.error || "Erreur inconnue");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Erreur de connexion");
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-24 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-2 text-center">
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.3em", marginBottom: "12px" }}>
            {t("soumettre.sys")}
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>
            {t("soumettre.title")}
          </h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            {t("soumettre.subtitle")}
          </h2>
        </div>

        <div className="mb-10">
          <KittScanner height={6} />
        </div>

        <p className="text-center mb-10" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.65)", lineHeight: 1.9 }}>
          {t("soumettre.desc")}
        </p>

        {status === "ok" ? (
          <div style={{
            position: "relative",
            overflow: "hidden",
            background: "rgba(255,34,34,0.06)",
            border: "1px solid rgba(255,34,34,0.4)",
            padding: "40px 32px",
            textAlign: "center",
          }}>
            <style>{`
              @keyframes kitt-confirm-scan {
                0% { left: -100%; }
                100% { left: 200%; }
              }
              @keyframes kitt-confirm-glow {
                0%, 100% { opacity: 0.3; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1); box-shadow: 0 0 40px rgba(255,34,34,0.6), 0 0 80px rgba(255,34,34,0.2); }
              }
              @keyframes kitt-confirm-in {
                0% { opacity: 0; transform: translateY(20px) scale(0.95); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>

            {/* Scanner animé de confirmation */}
            <div style={{
              position: "absolute", top: 0, left: "-100%", width: "60%", height: "100%",
              background: "linear-gradient(90deg, transparent, rgba(255,34,34,0.12), transparent)",
              animation: "kitt-confirm-scan 1.8s ease-in-out infinite",
              pointerEvents: "none",
            }} />

            {/* Coins décoratifs */}
            <div style={{ position: "absolute", top: 0, left: 0, width: "16px", height: "16px", borderTop: "2px solid #ff2222", borderLeft: "2px solid #ff2222" }} />
            <div style={{ position: "absolute", top: 0, right: 0, width: "16px", height: "16px", borderTop: "2px solid #ff2222", borderRight: "2px solid #ff2222" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, width: "16px", height: "16px", borderBottom: "2px solid #ff2222", borderLeft: "2px solid #ff2222" }} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: "16px", height: "16px", borderBottom: "2px solid #ff2222", borderRight: "2px solid #ff2222" }} />

            <div style={{ animation: "kitt-confirm-in 0.5s ease-out both" }}>
              {/* Icône LED KITT */}
              <div style={{
                width: "56px", height: "56px", borderRadius: "50%", margin: "0 auto 20px",
                background: "#ff2222",
                animation: "kitt-confirm-glow 1.5s ease-in-out infinite",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "white", fontSize: "1.6rem" }}>✓</span>
              </div>

              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.3em", marginBottom: "12px" }}>
                // TRANSMISSION REÇUE
              </div>
              <h3 style={{ fontFamily: "Orbitron, monospace", fontSize: "1.3rem", color: "white", marginBottom: "12px", fontWeight: 700 }}>
                VIDÉO SOUMISE !
              </h3>
              <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.05rem", color: "rgba(220,220,220,0.8)", lineHeight: 1.7, maxWidth: "380px", margin: "0 auto 28px" }}>
                {t("soumettre.success.msg")}
              </p>

              {/* Scanner de réception */}
              <KittScanner height={4} />

              <div style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => setStatus("idle")}
                  style={{
                    background: "rgba(255,34,34,0.12)", border: "1px solid rgba(255,34,34,0.4)",
                    fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
                    color: "#ff2222", padding: "10px 22px", cursor: "pointer",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,34,34,0.25)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,34,34,0.12)")}
                >
                  {t("soumettre.success.btn")}
                </button>
                <Link
                  href="/videos"
                  style={{
                    fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
                    color: "rgba(192,192,192,0.6)", border: "1px solid rgba(255,34,34,0.2)",
                    padding: "10px 22px", display: "inline-block", textDecoration: "none",
                  }}
                >
                  VOIR LA GALERIE →
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* URL */}
            <div>
              <label style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.15em", display: "block", marginBottom: "8px" }}>
                {t("soumettre.url.label")}
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={t("soumettre.url.ph")}
                style={{
                  width: "100%", background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.25)",
                  padding: "12px 16px", color: "rgba(220,220,220,0.9)", fontFamily: "Space Mono, monospace",
                  fontSize: "0.7rem", outline: "none",
                }}
              />
            </div>

            {/* Pseudo */}
            <div>
              <label style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.15em", display: "block", marginBottom: "8px" }}>
                {t("soumettre.pseudo.label")}
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={e => setPseudo(e.target.value)}
                placeholder={t("soumettre.pseudo.ph")}
                maxLength={50}
                style={{
                  width: "100%", background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)",
                  padding: "12px 16px", color: "rgba(220,220,220,0.9)", fontFamily: "Space Mono, monospace",
                  fontSize: "0.7rem", outline: "none",
                }}
              />
            </div>

            {/* Message */}
            <div>
              <label style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.15em", display: "block", marginBottom: "8px" }}>
                {t("soumettre.msg.label")}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t("soumettre.msg.ph")}
                maxLength={300}
                rows={3}
                style={{
                  width: "100%", background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)",
                  padding: "12px 16px", color: "rgba(220,220,220,0.9)", fontFamily: "Rajdhani, sans-serif",
                  fontSize: "0.9rem", outline: "none", resize: "vertical",
                }}
              />
            </div>

            {status === "error" && (
              <div className="px-4 py-3" style={{ background: "rgba(255,34,34,0.08)", border: "1px solid rgba(255,34,34,0.3)" }}>
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>
                  [ERREUR] {errorMsg}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full py-4 transition-all"
              style={{
                background: status === "loading" ? "rgba(255,34,34,0.08)" : "rgba(255,34,34,0.15)",
                border: "1px solid #ff2222",
                fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.2em",
                color: "#ff2222", cursor: status === "loading" ? "wait" : "pointer",
              }}
            >
              {status === "loading" ? t("soumettre.sending") : t("soumettre.send")}
            </button>
          </form>
        )}

        {/* Retour */}
        <div className="mt-12 text-center">
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.2em" }}>
            {t("soumettre.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
