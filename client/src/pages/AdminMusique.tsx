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
  } catch { return null; }
}

interface MusicEntry {
  id: string; url: string; titre: string; artiste: string;
  pseudo: string; message: string; ts: number; plays?: number;
}

export default function AdminMusique() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const [pending, setPending] = useState<MusicEntry[]>([]);
  const [approved, setApproved] = useState<MusicEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === EXPECTED_PWD) { setAuthed(true); setPwdError(false); }
    else setPwdError(true);
  }

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    getApiBase().then(base => {
      setApiBase(base);
      if (!base) { setLoading(false); return; }
      fetch(`${base}/api/music/pending`, { headers: { "X-Admin-Token": ADMIN_TOKEN } })
        .then(r => r.json())
        .then(d => { setPending(d.pending || []); setApproved(d.approved || []); })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [authed]);

  async function decide(id: string, action: "approve" | "reject") {
    if (!apiBase) return;
    setDeciding(id);
    try {
      await fetch(`${apiBase}/api/music/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
        body: JSON.stringify({ id, action }),
      });
      setPending(p => p.filter(m => m.id !== id));
      if (action === "approve") {
        const entry = pending.find(m => m.id === id);
        if (entry) setApproved(a => [...a, entry]);
      }
    } catch {}
    setDeciding(null);
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const label: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };
  const cardStyle: React.CSSProperties = { background: "rgba(255,34,34,0.04)", border: "1px solid rgba(255,34,34,0.15)", marginBottom: "12px", padding: "16px" };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0000" }}>
        <div className="w-full max-w-sm p-8" style={{ background: "#1a0000", border: "2px solid #ff2222", boxShadow: "0 0 30px rgba(255,34,34,0.2)" }}>
          <div style={{ ...label, color: "#ff4444", marginBottom: "12px" }}>// ACCÈS ADMIN</div>
          <h1 className="text-2xl font-black mb-8" style={{ fontFamily: "Orbitron, monospace", color: "#ffffff" }}>MODÉRATION MUSIQUE</h1>
          <form onSubmit={login} className="space-y-4">
            <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
              placeholder="Mot de passe" autoFocus
              style={{ width: "100%", background: "#0d0000", border: `1px solid ${pwdError ? "#ff2222" : "#660000"}`, padding: "12px 16px", color: "#fff", fontFamily: "Space Mono, monospace", fontSize: "0.75rem", outline: "none" }}
            />
            {pwdError && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[ERREUR] Mot de passe incorrect</p>}
            <button type="submit" className="w-full py-3"
              style={{ background: "#ff2222", border: "none", fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.15em", color: "#fff", cursor: "pointer" }}>
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
      <div className="container py-16 max-w-3xl mx-auto px-4">
        <div className="mb-8">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "8px" }}>// PANNEAU ADMIN — MODÉRATION MUSIQUE</div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: "Orbitron, monospace" }}>MUSIQUES SOUMISES</h1>
        </div>

        {loading && <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.5)" }}>Chargement...</p>}
        {!loading && !apiBase && (
          <div className="p-4" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.2)" }}>
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff4444" }}>[HORS LIGNE] Jetson inaccessible.</p>
          </div>
        )}

        {!loading && apiBase && (
          <>
            <div style={{ ...label, color: "rgba(255,34,34,0.6)", marginBottom: "12px", marginTop: "24px" }}>
              // EN ATTENTE — {pending.length} piste{pending.length !== 1 ? "s" : ""}
            </div>
            {pending.length === 0 && <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", marginBottom: "24px" }}>Aucune soumission en attente.</p>}
            {pending.map(m => (
              <div key={m.id} style={cardStyle}>
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "#fff", marginBottom: "2px" }}>{m.titre || "Sans titre"}</div>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,100,0,0.8)" }}>{m.artiste || "Artiste inconnu"}</div>
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>
                  {formatDate(m.ts)} — {m.pseudo}
                </div>
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", display: "block", marginBottom: "6px", wordBreak: "break-all" }}>
                  {m.url}
                </a>
                {m.message && (
                  <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.65)", fontStyle: "italic", marginBottom: "8px" }}>"{m.message}"</p>
                )}
                <div className="flex gap-3 mt-3">
                  <button onClick={() => decide(m.id, "approve")} disabled={deciding === m.id}
                    style={{ padding: "7px 18px", background: "rgba(0,200,80,0.1)", border: "1px solid rgba(0,200,80,0.4)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#00cc55", cursor: "pointer" }}>
                    ✓ APPROUVER
                  </button>
                  <button onClick={() => decide(m.id, "reject")} disabled={deciding === m.id}
                    style={{ padding: "7px 18px", background: "rgba(255,34,34,0.08)", border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "#ff4444", cursor: "pointer" }}>
                    ✗ REFUSER
                  </button>
                </div>
              </div>
            ))}

            <div style={{ ...label, color: "rgba(0,200,80,0.5)", marginBottom: "12px", marginTop: "32px" }}>
              // APPROUVÉES — {approved.length} piste{approved.length !== 1 ? "s" : ""}
            </div>
            {approved.length === 0 && <p style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)" }}>Aucune musique approuvée.</p>}
            {approved.map(m => (
              <div key={m.id} style={{ ...cardStyle, borderColor: "rgba(0,200,80,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.55rem", color: "#fff", marginBottom: "2px" }}>{m.titre || "Sans titre"}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "rgba(255,100,0,0.7)", marginBottom: "4px" }}>{m.artiste}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "rgba(192,192,192,0.4)" }}>
                  {m.pseudo} — {formatDate(m.ts)} {m.plays ? `— ${m.plays} écoute${m.plays > 1 ? "s" : ""}` : ""}
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
