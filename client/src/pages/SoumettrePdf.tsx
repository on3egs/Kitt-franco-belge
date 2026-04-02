import { useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getApiBase } from "@/lib/tunnel";

const CATEGORIES = ["Knight Rider", "Technique", "Histoire", "Électronique", "Autre"];

export default function SoumettrePdf() {
  const [url, setUrl] = useState("");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [categorie, setCategorie] = useState("Autre");
  const [pseudo, setPseudo] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { t } = useLanguage();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const base = await getApiBase();
      if (!base) throw new Error("KITT hors ligne — réessaie plus tard.");
      const res = await fetch(`${base}/api/pdf-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(), titre: titre.trim(), description: description.trim(),
          categorie, pseudo: pseudo.trim() || "Anonyme",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("ok");
        setUrl(""); setTitre(""); setDescription(""); setCategorie("Autre"); setPseudo("");
      } else {
        throw new Error(data.error || "Erreur inconnue");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Erreur de connexion");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.2)",
    padding: "11px 14px", color: "rgba(220,220,220,0.9)", fontFamily: "Space Mono, monospace",
    fontSize: "0.7rem", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "Space Mono, monospace", fontSize: "0.52rem", color: "rgba(255,34,34,0.6)",
    letterSpacing: "0.15em", display: "block", marginBottom: "7px",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-24 max-w-2xl mx-auto px-4">
        <div className="mb-2 text-center">
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.3em", marginBottom: "12px" }}>
            {t("soumettrepdf.sys")}
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>{t("soumettrepdf.title")}</h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>{t("soumettrepdf.subtitle")}</h2>
        </div>

        <div className="mb-10"><KittScanner height={6} /></div>

        <p className="text-center mb-10" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.65)", lineHeight: 1.9 }}>
          {t("soumettrepdf.desc")}
        </p>

        {status === "ok" ? (
          <div className="p-8 text-center" style={{ background: "rgba(255,34,34,0.05)", border: "1px solid rgba(255,34,34,0.3)" }}>
            <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em", marginBottom: "12px" }}>{t("soumettrepdf.success.label")}</div>
            <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(220,220,220,0.9)" }}>
              {t("soumettrepdf.success.msg")}
            </p>
            <button onClick={() => setStatus("idle")} className="mt-6 px-6 py-3"
              style={{ background: "rgba(255,34,34,0.1)", border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#ff2222" }}>
              {t("soumettrepdf.success.btn")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label style={labelStyle}>{t("soumettrepdf.url.label")}</label>
              <input type="url" required value={url} onChange={e => setUrl(e.target.value)}
                placeholder={t("soumettrepdf.url.ph")} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t("soumettrepdf.titre.label")}</label>
              <input type="text" required value={titre} onChange={e => setTitre(e.target.value)}
                placeholder={t("soumettrepdf.titre.ph")} maxLength={120} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t("soumettrepdf.categorie.label")}</label>
              <select value={categorie} onChange={e => setCategorie(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t("soumettrepdf.desc2.label")}</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder={t("soumettrepdf.desc2.ph")} maxLength={300} rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem" }} />
            </div>
            <div>
              <label style={labelStyle}>{t("soumettrepdf.pseudo.label")}</label>
              <input type="text" value={pseudo} onChange={e => setPseudo(e.target.value)}
                placeholder={t("soumettrepdf.pseudo.ph")} maxLength={50} style={{ ...inputStyle, border: "1px solid rgba(255,34,34,0.15)" }} />
            </div>

            {status === "error" && (
              <div className="px-4 py-3" style={{ background: "rgba(255,34,34,0.08)", border: "1px solid rgba(255,34,34,0.3)" }}>
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[ERREUR] {errorMsg}</span>
              </div>
            )}

            <button type="submit" disabled={status === "loading"} className="w-full py-4 transition-all"
              style={{
                background: status === "loading" ? "rgba(255,34,34,0.08)" : "rgba(255,34,34,0.15)",
                border: "1px solid #ff2222", fontFamily: "Orbitron, monospace", fontSize: "0.7rem",
                letterSpacing: "0.2em", color: "#ff2222", cursor: status === "loading" ? "wait" : "pointer",
              }}>
              {status === "loading" ? t("soumettrepdf.sending") : <>📄 {t("soumettrepdf.send")}</>}
            </button>
          </form>
        )}

        <div className="mt-12 text-center">
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.2em" }}>
            {t("soumettrepdf.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
