import { useEffect, useState } from "react";
import { Link } from "wouter";

const TUNNEL_URL = "https://raw.githubusercontent.com/on3egs/Kitt-franco-belge/main/tunnel.json";
const ADMIN_TOKEN = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3";
const EXPECTED_PWD = "Microsoft198@";

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
}

export default function AdminVideos() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  const [pending, setPending] = useState<VideoEntry[]>([]);
  const [approved, setApproved] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === EXPECTED_PWD) {
      setAuthed(true);
      setPwdError(false);
    } else {
      setPwdError(true);
    }
  }

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    getApiBase().then(base => {
      setApiBase(base);
      if (!base) { setLoading(false); return; }
      fetch(`${base}/api/videos/pending`, {
        headers: { "X-Admin-Token": ADMIN_TOKEN }
      })
        .then(r => r.json())
        .then(d => {
          setPending(d.pending || []);
          setApproved(d.approved || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [authed]);

  async function decide(id: string, action: "approve" | "reject") {
    if (!apiBase) return;
    setDeciding(id);
    try {
      await fetch(`${apiBase}/api/videos/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
        body: JSON.stringify({ id, action }),
      });
      setPending(p => p.filter(v => v.id !== id));
      if (action === "approve") {
        const entry = pending.find(v => v.id === id);
        if (entry) setApproved(a => [...a, entry]);
      }
    } catch {}
    setDeciding(null);
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const label = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };
  const cardStyle = { background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)", marginBottom: "12px", padding: "16px" };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0000" }}>
        <div className="w-full max-w-sm p-8" style={{ background: "#1a0000", border: "2px solid #ff2222", boxShadow: "0 0 30px rgba(255,34,34,0.2)" }}>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em", color: "#ff4444", marginBottom: "12px" }}>// ACCÈS ADMIN</div>
          <h1 className="text-2xl font-black mb-8" style={{ fontFamily: "Orbitron, monospace", color: "#ffffff" }}>MODÉRATION VIDÉOS</h1>
          <form onSubmit={login} className="space-y-4">
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="Mot de passe"
              autoFocus
              style={{
                width: "100%", background: "#0d0000", border: `1px solid ${pwdError ? "#ff2222" : "#660000"}`,
                padding: "12px 16px", color: "#ffffff", fontFamily: "Space Mono, monospace",
                fontSize: "0.75rem", outline: "none",
              }}
            />
            {pwdError && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[ERREUR] Mot de passe incorrect</p>}
            <button type="submit" className="w-full py-3" style={{ background: "#ff2222", border: "none", fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.15em", color: "#ffffff", cursor: "pointer" }}>
              ACCÉDER
            </button>
          </form>
          <div className="mt-6 text-center">
            <Link href="/" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.5)", letterSpacing: "0.1em" }}>← retour</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <div className="container py-16 max-w-3xl mx-auto">
        <div className="mb-8">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "8px" }}>// PANNEAU ADMIN — MODÉRATION VIDÉOS</div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: "Orbitron, monospace" }}>VIDÉOS SOUMISES</h1>
        </div>

        {loading && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.5)" }}>Chargement...</p>}
        {!loading && !apiBase && (
          <div className="p-4" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.2)" }}>
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[HORS LIGNE] Jetson inaccessible — réessaie plus tard.</p>
          </div>
        )}

        {/* EN ATTENTE */}
        {!loading && apiBase && (
          <>
            <div style={{ ...label, color: "rgba(255,34,34,0.6)", marginBottom: "12px", marginTop: "24px" }}>
              // EN ATTENTE — {pending.length} vidéo{pending.length !== 1 ? "s" : ""}
            </div>
            {pending.length === 0 && (
              <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", fontSize: "0.9rem", marginBottom: "24px" }}>Aucune soumission en attente.</p>
            )}
            {pending.map(v => (
              <div key={v.id} style={cardStyle}>
                <div className="flex gap-4">
                  <img
                    src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                    alt="thumb"
                    style={{ width: "140px", height: "79px", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,34,34,0.2)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>
                      {formatDate(v.ts)} — {v.pseudo}
                    </div>
                    <a href={v.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff2222", display: "block", marginBottom: "6px", wordBreak: "break-all" }}>
                      {v.url}
                    </a>
                    {v.message && (
                      <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.65)", fontStyle: "italic" }}>
                        "{v.message}"
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => decide(v.id, "approve")}
                    disabled={deciding === v.id}
                    style={{ padding: "8px 20px", background: "rgba(0,200,80,0.1)", border: "1px solid rgba(0,200,80,0.4)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#00cc55", cursor: "pointer" }}
                  >
                    ✓ APPROUVER
                  </button>
                  <button
                    onClick={() => decide(v.id, "reject")}
                    disabled={deciding === v.id}
                    style={{ padding: "8px 20px", background: "rgba(255,34,34,0.08)", border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#ff4444", cursor: "pointer" }}
                  >
                    ✗ REFUSER
                  </button>
                </div>
              </div>
            ))}

            {/* APPROUVÉES */}
            <div style={{ ...label, color: "rgba(0,200,80,0.5)", marginBottom: "12px", marginTop: "32px" }}>
              // APPROUVÉES — {approved.length} vidéo{approved.length !== 1 ? "s" : ""}
            </div>
            {approved.length === 0 && (
              <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", fontSize: "0.9rem" }}>Aucune vidéo approuvée.</p>
            )}
            {approved.map(v => (
              <div key={v.id} style={{ ...cardStyle, borderColor: "rgba(0,200,80,0.15)" }}>
                <div className="flex gap-4 items-center">
                  <img
                    src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                    alt="thumb"
                    style={{ width: "100px", height: "56px", objectFit: "cover", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.4)", marginBottom: "4px" }}>
                      {v.pseudo} — {formatDate(v.ts)}
                    </div>
                    <a href={v.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(0,200,80,0.7)" }}>
                      {v.url}
                    </a>
                  </div>
                </div>
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
