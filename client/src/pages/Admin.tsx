import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getApiBase } from "@/lib/tunnel";

const ADMIN_TOKEN = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3";
const EXPECTED_PWD = "Microsoft198@";

interface VideoEntry { id: string; url: string; pseudo: string; message: string; ts: number; views?: number; }
interface MusicEntry { id: string; url: string; titre: string; artiste: string; pseudo: string; message: string; ts: number; plays?: number; }
interface PdfEntry   { id: string; url: string; titre: string; description: string; categorie: string; pseudo: string; ts: number; views?: number; }

type Tab = "videos" | "musique" | "pdfs";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const [tab, setTab] = useState<Tab>("videos");

  const [apiBase, setApiBase] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const [pendingVideos, setPendingVideos] = useState<VideoEntry[]>([]);
  const [approvedVideos, setApprovedVideos] = useState<VideoEntry[]>([]);
  const [pendingMusic, setPendingMusic] = useState<MusicEntry[]>([]);
  const [approvedMusic, setApprovedMusic] = useState<MusicEntry[]>([]);
  const [pendingPdfs, setPendingPdfs] = useState<PdfEntry[]>([]);
  const [approvedPdfs, setApprovedPdfs] = useState<PdfEntry[]>([]);

  const [deciding, setDeciding] = useState<string | null>(null);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === EXPECTED_PWD) { setAuthed(true); setPwdError(false); }
    else setPwdError(true);
  }

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    getApiBase().then(async base => {
      setApiBase(base);
      if (!base) { setOffline(true); setLoading(false); return; }

      const headers = { "X-Admin-Token": ADMIN_TOKEN };
      try {
        const [vRes, mRes, pRes] = await Promise.all([
          fetch(`${base}/api/videos/pending`, { headers }).then(r => r.json()).catch(() => ({})),
          fetch(`${base}/api/music/pending`,  { headers }).then(r => r.json()).catch(() => ({})),
          fetch(`${base}/api/pdfs/pending`,   { headers }).then(r => r.json()).catch(() => ({})),
        ]);
        setPendingVideos(vRes.pending  || []);
        setApprovedVideos(vRes.approved || []);
        setPendingMusic(mRes.pending   || []);
        setApprovedMusic(mRes.approved || []);
        setPendingPdfs(pRes.pending    || []);
        setApprovedPdfs(pRes.approved  || []);
      } catch { setOffline(true); }
      setLoading(false);
    });
  }, [authed]);

  async function decide(type: "videos" | "music" | "pdfs", id: string, action: "approve" | "reject") {
    if (!apiBase) return;
    setDeciding(id);
    const endpoint = type === "videos" ? "videos" : type === "music" ? "music" : "pdfs";
    try {
      await fetch(`${apiBase}/api/${endpoint}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
        body: JSON.stringify({ id, action }),
      });
      if (type === "videos") {
        const entry = pendingVideos.find(v => v.id === id);
        setPendingVideos(p => p.filter(v => v.id !== id));
        if (action === "approve" && entry) setApprovedVideos(a => [...a, entry]);
      } else if (type === "music") {
        const entry = pendingMusic.find(m => m.id === id);
        setPendingMusic(p => p.filter(m => m.id !== id));
        if (action === "approve" && entry) setApprovedMusic(a => [...a, entry]);
      } else {
        const entry = pendingPdfs.find(p => p.id === id);
        setPendingPdfs(p => p.filter(x => x.id !== id));
        if (action === "approve" && entry) setApprovedPdfs(a => [...a, entry]);
      }
    } catch {}
    setDeciding(null);
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const label: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };
  const card: React.CSSProperties  = { background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)", marginBottom: "12px", padding: "16px" };
  const approveBtn: React.CSSProperties = { padding: "7px 18px", background: "rgba(0,200,80,0.1)", border: "1px solid rgba(0,200,80,0.4)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#00cc55", cursor: "pointer" };
  const rejectBtn: React.CSSProperties  = { padding: "7px 18px", background: "rgba(255,34,34,0.08)", border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#ff4444", cursor: "pointer" };

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0000" }}>
        <div className="w-full max-w-sm p-8" style={{ background: "#1a0000", border: "2px solid #ff2222", boxShadow: "0 0 40px rgba(255,34,34,0.25)" }}>
          <div style={{ ...label, color: "#ff4444", marginBottom: "8px" }}>// PANNEAU ADMINISTRATEUR</div>
          <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "Orbitron, monospace", color: "#ffffff" }}>KITT ADMIN</h1>
          <p className="mb-8" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(192,192,192,0.5)" }}>
            Vidéos · Musique · Documents
          </p>
          <form onSubmit={login} className="space-y-4">
            <input
              type="password" value={pwd} onChange={e => setPwd(e.target.value)}
              placeholder="Mot de passe" autoFocus
              style={{ width: "100%", background: "#0d0000", border: `1px solid ${pwdError ? "#ff2222" : "#660000"}`, padding: "14px 16px", color: "#ffffff", fontFamily: "Space Mono, monospace", fontSize: "0.8rem", outline: "none" }}
            />
            {pwdError && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[ERREUR] Mot de passe incorrect</p>}
            <button type="submit" className="w-full py-4"
              style={{ background: "#ff2222", border: "none", fontFamily: "Orbitron, monospace", fontSize: "0.75rem", letterSpacing: "0.2em", color: "#ffffff", cursor: "pointer" }}>
              ▶ ACCÉDER
            </button>
          </form>
          <div className="mt-6 text-center">
            <Link href="/" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.1em" }}>← retour</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── PANEL ──────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; pending: number }[] = [
    { key: "videos",  label: "VIDÉOS",    pending: pendingVideos.length },
    { key: "musique", label: "MUSIQUE",   pending: pendingMusic.length },
    { key: "pdfs",    label: "DOCUMENTS", pending: pendingPdfs.length },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <div className="container py-12 max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "8px" }}>// PANNEAU ADMINISTRATEUR KITT</div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: "Orbitron, monospace" }}>MODÉRATION</h1>
        </div>

        {loading && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.5)" }}>Chargement...</p>}
        {!loading && offline && (
          <div className="p-4 mb-6" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.2)" }}>
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[HORS LIGNE] Jetson inaccessible.</p>
          </div>
        )}

        {/* Onglets */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
                padding: "9px 20px", cursor: "pointer",
                background: tab === t.key ? "#ff2222" : "rgba(255,34,34,0.08)",
                border: `1px solid ${tab === t.key ? "#ff2222" : "rgba(255,34,34,0.3)"}`,
                color: tab === t.key ? "#fff" : "rgba(255,34,34,0.7)",
                position: "relative",
              }}>
              {t.label}
              {t.pending > 0 && (
                <span style={{ marginLeft: "8px", background: "#ff4400", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "0.5rem" }}>
                  {t.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── VIDÉOS ── */}
        {tab === "videos" && (
          <>
            <div style={{ ...label, color: "rgba(255,34,34,0.6)", marginBottom: "12px" }}>
              // EN ATTENTE — {pendingVideos.length} vidéo{pendingVideos.length !== 1 ? "s" : ""}
            </div>
            {pendingVideos.length === 0 && <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", marginBottom: "24px" }}>Aucune soumission en attente.</p>}
            {pendingVideos.map(v => (
              <div key={v.id} style={card}>
                <div className="flex gap-4">
                  {v.url.includes("facebook.com") || v.url.includes("fb.watch") ? (
                    <div style={{ width: "140px", height: "79px", flexShrink: 0, background: "#1a0000", border: "1px solid rgba(100,150,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "1.8rem" }}>📘</span>
                    </div>
                  ) : (
                    <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt="thumb"
                      style={{ width: "140px", height: "79px", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,34,34,0.2)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div style={{ ...label, color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>{formatDate(v.ts)} — {v.pseudo}</div>
                    <a href={v.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff2222", display: "block", marginBottom: "6px", wordBreak: "break-all" }}>{v.url}</a>
                    {v.message && <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.65)", fontStyle: "italic" }}>"{v.message}"</p>}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => decide("videos", v.id, "approve")} disabled={deciding === v.id} style={approveBtn}>✓ APPROUVER</button>
                  <button onClick={() => decide("videos", v.id, "reject")}  disabled={deciding === v.id} style={rejectBtn}>✗ REFUSER</button>
                </div>
              </div>
            ))}
            <div style={{ ...label, color: "rgba(0,200,80,0.5)", marginBottom: "12px", marginTop: "32px" }}>
              // APPROUVÉES — {approvedVideos.length}
            </div>
            {approvedVideos.map(v => (
              <div key={v.id} style={{ ...card, borderColor: "rgba(0,200,80,0.15)" }}>
                <div className="flex gap-4 items-center">
                  <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt="" style={{ width: "80px", height: "45px", objectFit: "cover", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(192,192,192,0.4)" }}>{v.pseudo} — {formatDate(v.ts)}</div>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(0,200,80,0.7)" }}>{v.url}</a>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── MUSIQUE ── */}
        {tab === "musique" && (
          <>
            <div style={{ ...label, color: "rgba(255,34,34,0.6)", marginBottom: "12px" }}>
              // EN ATTENTE — {pendingMusic.length} piste{pendingMusic.length !== 1 ? "s" : ""}
            </div>
            {pendingMusic.length === 0 && <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", marginBottom: "24px" }}>Aucune soumission en attente.</p>}
            {pendingMusic.map(m => (
              <div key={m.id} style={card}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#fff", marginBottom: "2px" }}>{m.titre}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,100,0,0.8)", marginBottom: "6px" }}>{m.artiste}</div>
                <div style={{ ...label, color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>{formatDate(m.ts)} — {m.pseudo}</div>
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", display: "block", marginBottom: "6px", wordBreak: "break-all" }}>{m.url}</a>
                {m.message && <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.65)", fontStyle: "italic", marginBottom: "8px" }}>"{m.message}"</p>}
                <div className="flex gap-3 mt-3">
                  <button onClick={() => decide("music", m.id, "approve")} disabled={deciding === m.id} style={approveBtn}>✓ APPROUVER</button>
                  <button onClick={() => decide("music", m.id, "reject")}  disabled={deciding === m.id} style={rejectBtn}>✗ REFUSER</button>
                </div>
              </div>
            ))}
            <div style={{ ...label, color: "rgba(0,200,80,0.5)", marginBottom: "12px", marginTop: "32px" }}>
              // APPROUVÉES — {approvedMusic.length}
            </div>
            {approvedMusic.map(m => (
              <div key={m.id} style={{ ...card, borderColor: "rgba(0,200,80,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.55rem", color: "#fff" }}>{m.titre}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "rgba(255,100,0,0.7)" }}>{m.artiste} — {m.pseudo} — {formatDate(m.ts)} {m.plays ? `— ♪ ${m.plays}` : ""}</div>
              </div>
            ))}
          </>
        )}

        {/* ── PDF ── */}
        {tab === "pdfs" && (
          <>
            <div style={{ ...label, color: "rgba(255,34,34,0.6)", marginBottom: "12px" }}>
              // EN ATTENTE — {pendingPdfs.length} document{pendingPdfs.length !== 1 ? "s" : ""}
            </div>
            {pendingPdfs.length === 0 && <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", marginBottom: "24px" }}>Aucune soumission en attente.</p>}
            {pendingPdfs.map(p => (
              <div key={p.id} style={card}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#fff", marginBottom: "2px" }}>{p.titre}</div>
                {p.categorie && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "rgba(255,100,0,0.8)", marginBottom: "6px" }}>{p.categorie}</div>}
                <div style={{ ...label, color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>{formatDate(p.ts)} — {p.pseudo}</div>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", display: "block", marginBottom: "6px", wordBreak: "break-all" }}>{p.url}</a>
                {p.description && <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.65)", fontStyle: "italic", marginBottom: "8px" }}>"{p.description}"</p>}
                <div className="flex gap-3 mt-3">
                  <button onClick={() => decide("pdfs", p.id, "approve")} disabled={deciding === p.id} style={approveBtn}>✓ APPROUVER</button>
                  <button onClick={() => decide("pdfs", p.id, "reject")}  disabled={deciding === p.id} style={rejectBtn}>✗ REFUSER</button>
                </div>
              </div>
            ))}
            <div style={{ ...label, color: "rgba(0,200,80,0.5)", marginBottom: "12px", marginTop: "32px" }}>
              // APPROUVÉS — {approvedPdfs.length}
            </div>
            {approvedPdfs.map(p => (
              <div key={p.id} style={{ ...card, borderColor: "rgba(0,200,80,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.55rem", color: "#fff" }}>{p.titre}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "rgba(192,192,192,0.4)" }}>{p.categorie} — {p.pseudo} — {formatDate(p.ts)} {p.views ? `— 👁 ${p.views}` : ""}</div>
              </div>
            ))}
          </>
        )}

        <div className="mt-12 text-center">
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.2em" }}>
            ← RETOUR AU SYSTÈME KITT
          </Link>
        </div>
      </div>
    </div>
  );
}
