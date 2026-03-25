import { useEffect, useRef, useState } from "react";
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

interface MusicEntry {
  id: string;
  url: string;
  titre: string;
  artiste: string;
  pseudo: string;
  message: string;
  ts: number;
}

const ctrlBtn: React.CSSProperties = {
  background: "rgba(255,34,34,0.06)",
  border: "1px solid rgba(255,34,34,0.25)",
  color: "rgba(255,80,0,0.9)",
  padding: "7px 14px",
  fontFamily: "Space Mono, monospace",
  fontSize: "0.85rem",
  cursor: "pointer",
};

function formatTime(s: number) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export default function Musique() {
  const [tracks, setTracks] = useState<MusicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animRef = useRef<number>(0);
  const peaksRef = useRef<Float32Array | null>(null);
  const peakVelsRef = useRef<Float32Array | null>(null);
  const corsErrorRef = useRef(false);

  // Fetch approved tracks
  useEffect(() => {
    getApiBase().then(base => {
      setApiBase(base);
      if (!base) { setOffline(true); setLoading(false); return; }
      fetch(`${base}/api/music/approved`)
        .then(r => r.json())
        .then(d => setTracks(d.approved || []))
        .catch(() => setOffline(true))
        .finally(() => setLoading(false));
    });
  }, []);

  // Idle visualizer (no track playing)
  useEffect(() => {
    if (isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    let t = 0;

    const idle = () => {
      animRef.current = requestAnimationFrame(idle);
      t += 0.025;
      ctx.fillStyle = "#030000";
      ctx.fillRect(0, 0, W, H);
      const count = 64;
      const bw = W / count;
      for (let i = 0; i < count; i++) {
        const h = (Math.sin(t * 0.8 + i * 0.25) * 0.5 + 0.5) * H * 0.14 + 1;
        ctx.fillStyle = "rgba(255,34,34,0.22)";
        ctx.fillRect(i * bw, H - h, bw - 1, h);
      }
    };
    idle();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  function initAudioCtx() {
    if (audioCtxRef.current || !audioRef.current) return;
    try {
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.75;
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
      const bufLen = analyserRef.current.frequencyBinCount;
      peaksRef.current = new Float32Array(bufLen).fill(0);
      peakVelsRef.current = new Float32Array(bufLen).fill(0);
    } catch { /* CORS or unsupported */ }
  }

  function startRealVisualizer() {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) { startFakeVisualizer(); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.fillStyle = "#030000";
      ctx.fillRect(0, 0, W, H);

      const count = bufLen;
      const bw = Math.max(2, Math.floor(W / count));

      for (let i = 0; i < count; i++) {
        const v = data[i];
        const bH = (v / 255) * H;
        const x = i * (bw + 1);
        // Gradient rouge → orange
        const grd = ctx.createLinearGradient(0, H, 0, H - bH);
        grd.addColorStop(0, "#cc2200");
        grd.addColorStop(0.6, "#ff3300");
        grd.addColorStop(1, "#ff8800");
        ctx.fillStyle = grd;
        ctx.fillRect(x, H - bH, bw, bH);
        // Peak dot
        const peaks = peaksRef.current!;
        const vels = peakVelsRef.current!;
        if (bH > peaks[i]) { peaks[i] = bH; vels[i] = 0; }
        else { vels[i] += 0.25; peaks[i] = Math.max(0, peaks[i] - vels[i]); }
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(x, H - peaks[i] - 2, bw, 2);
      }
    };
    draw();
  }

  // Fallback quand pas de Web Audio API (CORS)
  function startFakeVisualizer() {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    let t = 0;
    const barData = Array.from({ length: 64 }, (_, i) => ({
      phase: Math.random() * Math.PI * 2,
      freq: 0.5 + Math.random() * 2,
      amp: 0.3 + Math.random() * 0.7,
    }));

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      t += 0.04;
      ctx.fillStyle = "#030000";
      ctx.fillRect(0, 0, W, H);
      const bw = W / barData.length;
      barData.forEach((b, i) => {
        const h = (Math.sin(t * b.freq + b.phase) * 0.5 + 0.5) * H * b.amp * 0.85 + 2;
        const grd = ctx.createLinearGradient(0, H, 0, H - h);
        grd.addColorStop(0, "#cc2200");
        grd.addColorStop(1, "#ff8800");
        ctx.fillStyle = grd;
        ctx.fillRect(i * bw, H - h, bw - 1, h);
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(i * bw, H - h - 2, bw - 1, 2);
      });
    };
    draw();
  }

  async function playTrack(idx: number) {
    if (!audioRef.current || !apiBase) return;
    const track = tracks[idx];
    setCurrentIdx(idx);
    corsErrorRef.current = false;

    // Utilise le proxy Jetson pour contourner CORS
    const proxied = `${apiBase}/api/audio-proxy?url=${encodeURIComponent(track.url)}`;
    audioRef.current.src = proxied;
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.load();

    initAudioCtx();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
      startRealVisualizer();
    } catch {
      // Fallback sans proxy
      audioRef.current.src = track.url;
      audioRef.current.removeAttribute("crossorigin");
      audioRef.current.load();
      await audioRef.current.play();
      setIsPlaying(true);
      startFakeVisualizer();
    }
    // Track play count
    fetch(`${apiBase}/api/music/play/${track.id}`, { method: "POST" }).catch(() => {});
    setTracks(ts => ts.map((t, i) => i === idx ? { ...t, plays: (t.plays || 0) + 1 } : t));
  }

  function togglePlay() {
    if (!audioRef.current || currentIdx === null) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      cancelAnimationFrame(animRef.current);
    } else {
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        analyserRef.current ? startRealVisualizer() : startFakeVisualizer();
      }).catch(() => {});
    }
  }

  function next() {
    if (!tracks.length) return;
    playTrack(currentIdx === null ? 0 : (currentIdx + 1) % tracks.length);
  }
  function prev() {
    if (!tracks.length || currentIdx === null) return;
    playTrack((currentIdx - 1 + tracks.length) % tracks.length);
  }

  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null;
  const label: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={next}
      />

      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-16 max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="mb-2 text-center">
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "12px" }}>
            // SYSTÈME KITT FRANCO-BELGE — LECTEUR AUDIO
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "Orbitron, monospace" }}>
            MUSIQUE
          </h1>
          <h2 className="text-lg font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            SÉLECTIONNÉE PAR MANIX
          </h2>
        </div>

        <div className="mb-8"><KittScanner height={6} /></div>

        {loading && (
          <div className="text-center py-20">
            <div style={{ ...label, color: "rgba(255,34,34,0.5)" }}>// CHARGEMENT EN COURS...</div>
          </div>
        )}
        {!loading && offline && (
          <div className="p-6 text-center" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.2)" }}>
            <div style={{ ...label, color: "#ff4444" }}>[HORS LIGNE] Système KITT inaccessible.</div>
          </div>
        )}

        {!loading && !offline && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Player (3/5) */}
            <div className="md:col-span-3">
              <div style={{ background: "#0d0000", border: "1px solid rgba(255,34,34,0.35)" }}>
                {/* Barre de titre Winamp */}
                <div style={{ background: "linear-gradient(90deg,#2a0000,#1a0000)", padding: "5px 12px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(255,34,34,0.25)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff2222", boxShadow: "0 0 6px #ff2222" }} />
                  <span style={{ ...label, color: "#ff5500", fontSize: "0.45rem" }}>KITT AUDIO SYSTEM v2.0 — KYRONEX</span>
                </div>

                {/* Now playing */}
                <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,34,34,0.12)", minHeight: "46px" }}>
                  {currentTrack ? (
                    <>
                      <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {currentTrack.titre || "Sans titre"}
                      </div>
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.48rem", color: "rgba(255,120,0,0.85)", marginTop: "3px" }}>
                        {currentTrack.artiste || "Artiste inconnu"}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,34,34,0.35)" }}>
                      // CLIQUE SUR UNE PISTE POUR DÉMARRER
                    </div>
                  )}
                </div>

                {/* Canvas visualiseur */}
                <div style={{ background: "#030000", position: "relative" }}>
                  <canvas
                    ref={canvasRef}
                    width={512}
                    height={128}
                    style={{ width: "100%", height: "128px", display: "block" }}
                  />
                  <div style={{ position: "absolute", top: 4, right: 8, fontFamily: "Space Mono, monospace", fontSize: "0.38rem", color: "rgba(255,80,0,0.35)", letterSpacing: "0.15em" }}>
                    KYRONEX VIZ ■
                  </div>
                </div>

                {/* Barre de progression */}
                <div style={{ padding: "8px 14px 4px" }}>
                  <div
                    style={{ background: "#1a0000", height: 5, cursor: "pointer", borderRadius: 1 }}
                    onClick={e => {
                      if (!audioRef.current || !duration) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                    }}
                  >
                    <div style={{ background: "linear-gradient(90deg,#cc2200,#ff6600)", height: "100%", width: `${duration ? (currentTime / duration) * 100 : 0}%`, borderRadius: 1 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: "rgba(255,100,0,0.55)" }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Contrôles */}
                <div style={{ padding: "6px 14px 14px", display: "flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
                  <button onClick={prev} style={ctrlBtn} title="Précédent">⏮</button>
                  <button
                    onClick={togglePlay}
                    style={{ ...ctrlBtn, background: isPlaying ? "rgba(255,34,34,0.25)" : "rgba(255,34,34,0.15)", border: "1px solid #ff2222", padding: "8px 22px", color: "#ff2222", fontSize: "1rem" }}
                    title={isPlaying ? "Pause" : "Lecture"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <button onClick={next} style={ctrlBtn} title="Suivant">⏭</button>
                </div>
              </div>
            </div>

            {/* Playlist (2/5) */}
            <div className="md:col-span-2" style={{ background: "#0d0000", border: "1px solid rgba(255,34,34,0.2)", display: "flex", flexDirection: "column" }}>
              <div style={{ background: "#1a0000", padding: "5px 12px", borderBottom: "1px solid rgba(255,34,34,0.2)", flexShrink: 0 }}>
                <span style={{ ...label, color: "#ff4444", fontSize: "0.45rem" }}>
                  PLAYLIST — {tracks.length} PISTE{tracks.length !== 1 ? "S" : ""}
                </span>
              </div>

              {tracks.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.4)", fontSize: "0.85rem" }}>
                  Aucune musique.{" "}
                  <Link href="/soumettre-musique" style={{ color: "#ff2222" }}>Proposer ?</Link>
                </div>
              ) : (
                <div style={{ overflowY: "auto", flex: 1, maxHeight: "280px" }}>
                  {tracks.map((t, i) => (
                    <div
                      key={t.id}
                      onClick={() => playTrack(i)}
                      style={{
                        padding: "9px 12px",
                        borderBottom: "1px solid rgba(255,34,34,0.07)",
                        cursor: "pointer",
                        background: currentIdx === i ? "rgba(255,34,34,0.14)" : "transparent",
                        display: "flex", alignItems: "center", gap: "8px",
                        transition: "background 0.15s",
                      }}
                    >
                      <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: currentIdx === i ? "#ff4400" : "rgba(255,34,34,0.4)", minWidth: "16px" }}>
                        {currentIdx === i && isPlaying ? "▶" : `${i + 1}`}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.5rem", color: currentIdx === i ? "#fff" : "rgba(210,210,210,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.titre || "Sans titre"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
                          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.42rem", color: "rgba(255,100,0,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.artiste || "—"}
                          </span>
                          {t.plays !== undefined && t.plays > 0 && (
                            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.4rem", color: "rgba(255,100,0,0.45)", flexShrink: 0 }}>
                              ♪ {t.plays}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-12 flex flex-col md:flex-row gap-4 items-center justify-center">
          <Link href="/soumettre-musique" style={{
            fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.15em",
            color: "#ff2222", border: "1px solid rgba(255,34,34,0.4)", padding: "10px 24px",
            background: "rgba(255,34,34,0.08)",
          }}>
            ♪ PROPOSER UNE MUSIQUE
          </Link>
          <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.2em" }}>
            ← RETOUR AU SYSTÈME KITT
          </Link>
        </div>
      </div>
    </div>
  );
}
