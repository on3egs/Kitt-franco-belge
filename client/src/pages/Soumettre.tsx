import { useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import { useLanguage } from "@/contexts/LanguageContext";

const JETSON_URL = "https://raw.githubusercontent.com/on3egs/Kitt-franco-belge/main/tunnel.json";

async function getApiBase(): Promise<string | null> {
  try {
    const r = await fetch(JETSON_URL, { cache: "no-store" });
    const d = await r.json();
    return d.url || null;
  } catch {
    return null;
  }
}

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
          <div className="p-8 text-center" style={{ background: "rgba(255,34,34,0.05)", border: "1px solid rgba(255,34,34,0.3)" }}>
            <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em", marginBottom: "12px" }}>
              {t("soumettre.success.label")}
            </div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(220,220,220,0.9)" }}>
              {t("soumettre.success.msg")}
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-6 px-6 py-3"
              style={{ background: "rgba(255,34,34,0.1)", border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#ff2222" }}
            >
              {t("soumettre.success.btn")}
            </button>
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
