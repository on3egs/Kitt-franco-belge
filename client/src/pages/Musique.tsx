import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";

import { getApiBase } from "@/lib/tunnel";

interface MusicEntry {
  id: string;
  url: string;
  titre: string;
  artiste: string;
  pseudo: string;
  message: string;
  ts: number;
  plays?: number;
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
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const kittBgRef = useRef<HTMLCanvasElement | null>(null);
  const kittAnimRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animRef = useRef<number>(0);
  const peaksRef = useRef<Float32Array | null>(null);
  const peakVelsRef = useRef<Float32Array | null>(null);
  const currentIdxRef = useRef<number | null>(null);
  const playGenRef = useRef(0); // Annule les lancements concurrents

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

  // Update gain when volume changes
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(isMuted ? 0 : volume, audioCtxRef.current.currentTime, 0.05);
    }
  }, [volume, isMuted]);

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

  // KITT animated background
  useEffect(() => {
    const canvas = kittBgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    if (!isPlaying) {
      cancelAnimationFrame(kittAnimRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      window.removeEventListener("resize", resize);
      return;
    }

    let t = 0;
    let scannerX = 0;
    let scannerDir = 1;

    const draw = () => {
      kittAnimRef.current = requestAnimationFrame(draw);
      t += 0.03;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // Frequency data
      const analyser = analyserRef.current;
      let freqData: Uint8Array | null = null;
      if (analyser) {
        freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
      }

      // Bass energy
      let bassEnergy = 0;
      if (freqData) {
        for (let i = 0; i < 8; i++) bassEnergy += freqData[i];
        bassEnergy = bassEnergy / (8 * 255);
      } else {
        bassEnergy = Math.sin(t * 1.5) * 0.5 + 0.5;
      }

      // Giant KITT watermark
      ctx.save();
      ctx.globalAlpha = 0.04 + bassEnergy * 0.05;
      const fontSize = Math.min(W * 0.38, 280);
      ctx.font = `900 ${fontSize}px Orbitron, monospace`;
      ctx.fillStyle = "#ff2200";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K.I.T.T.", W / 2, H / 2);
      ctx.restore();

      // Car dimensions
      const carCenterX = W / 2;
      const carBottomY = H * 0.82;
      const carW = Math.min(W * 0.72, 640);
      const carH = carW * 0.32;

      // Body silhouette
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(carCenterX - carW / 2, carBottomY);
      ctx.lineTo(carCenterX - carW * 0.44, carBottomY - carH * 0.35);
      ctx.lineTo(carCenterX - carW * 0.30, carBottomY - carH * 0.72);
      ctx.lineTo(carCenterX - carW * 0.14, carBottomY - carH);
      ctx.lineTo(carCenterX + carW * 0.14, carBottomY - carH);
      ctx.lineTo(carCenterX + carW * 0.30, carBottomY - carH * 0.72);
      ctx.lineTo(carCenterX + carW * 0.44, carBottomY - carH * 0.35);
      ctx.lineTo(carCenterX + carW / 2, carBottomY);
      ctx.closePath();
      ctx.fillStyle = "#880000";
      ctx.fill();
      ctx.restore();

      // Front grille strip
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#550000";
      ctx.fillRect(carCenterX - carW * 0.38, carBottomY - carH * 0.55, carW * 0.76, carH * 0.16);
      ctx.restore();

      // Headlights pulsing
      const hlPulse = 0.4 + bassEnergy * 0.6;
      const hlY = carBottomY - carH * 0.52;
      const hlR = carW * 0.08;
      [carCenterX - carW * 0.37, carCenterX + carW * 0.37].forEach(hlX => {
        ctx.save();
        ctx.globalAlpha = 0.12 + hlPulse * 0.28;
        const g = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR * 2.5);
        g.addColorStop(0, "rgba(255,210,160,1)");
        g.addColorStop(0.3, "rgba(255,100,0,0.6)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hlX, hlY, hlR * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Voice modulator bars (8 bars in front grille area)
      const numBars = 8;
      const barAreaW = carW * 0.52;
      const barSpacing = barAreaW / numBars;
      const barW = barSpacing * 0.55;
      const barMaxH = carH * 0.55;
      const barBaseY = carBottomY - carH * 0.27;
      const barStartX = carCenterX - barAreaW / 2 + barSpacing / 2;

      for (let i = 0; i < numBars; i++) {
        let bH: number;
        if (freqData) {
          const binIdx = Math.floor((i / numBars) * (freqData.length / 3));
          bH = (freqData[binIdx] / 255) * barMaxH;
        } else {
          bH = (Math.sin(t * 3.5 + i * 0.9) * 0.5 + 0.5) * barMaxH * 0.7;
        }
        bH = Math.max(bH, 4);

        const bx = barStartX + i * barSpacing;
        ctx.save();
        ctx.globalAlpha = 0.75;
        const grd = ctx.createLinearGradient(0, barBaseY, 0, barBaseY - bH);
        grd.addColorStop(0, "#aa0000");
        grd.addColorStop(1, "#ff5500");
        ctx.fillStyle = grd;
        ctx.fillRect(bx - barW / 2, barBaseY - bH, barW, bH);
        ctx.globalAlpha = 0.2;
        ctx.shadowColor = "#ff2200";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ff3300";
        ctx.fillRect(bx - barW / 2, barBaseY - bH, barW, bH);
        ctx.restore();
      }

      // Scanner bar
      const scanBarW = carW * 0.62;
      const scanStartX = carCenterX - scanBarW / 2;
      const scanY = carBottomY - carH * 0.63;
      const scanSpeed = 2.5 + bassEnergy * 4;
      scannerX += scannerDir * scanSpeed;
      if (scannerX > scanBarW) { scannerX = scanBarW; scannerDir = -1; }
      if (scannerX < 0) { scannerX = 0; scannerDir = 1; }

      const sx = scanStartX + scannerX;
      const sw = carW * 0.07;
      ctx.save();
      ctx.globalAlpha = 0.9;
      const sg = ctx.createLinearGradient(sx - sw, scanY, sx + sw, scanY);
      sg.addColorStop(0, "transparent");
      sg.addColorStop(0.35, "rgba(255,20,0,0.35)");
      sg.addColorStop(0.5, "rgba(255,60,0,1)");
      sg.addColorStop(0.65, "rgba(255,20,0,0.35)");
      sg.addColorStop(1, "transparent");
      ctx.fillStyle = sg;
      ctx.fillRect(sx - sw, scanY - 5, sw * 2, 10);
      ctx.shadowColor = "#ff2200";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255,50,0,0.7)";
      ctx.fillRect(sx - sw * 0.4, scanY - 3, sw * 0.8, 6);
      ctx.restore();
    };

    draw();
    return () => {
      cancelAnimationFrame(kittAnimRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [isPlaying]);

  // iOS Safari : getByteFrequencyData retourne toujours 0 (bug WebKit connu)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function initAudioCtxForElement(audio: HTMLAudioElement) {
    if (isIOS) return; // iOS Safari : visualiseur réel impossible (WebKit bug)

    // Déconnecter uniquement le source node précédent — NE PAS fermer le contexte.
    // Safari iOS limite à 4 AudioContext par page ; Chrome limite à 6.
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }

    // Créer l'AudioContext une seule fois pour toute la page
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.75;
        gainNodeRef.current = audioCtxRef.current.createGain();
        gainNodeRef.current.gain.value = isMuted ? 0 : volume;
        analyserRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioCtxRef.current.destination);
        const bufLen = analyserRef.current.frequencyBinCount;
        peaksRef.current = new Float32Array(bufLen).fill(0);
        peakVelsRef.current = new Float32Array(bufLen).fill(0);
      } catch { return; }
    }

    // Nouveau source node pour le nouvel élément audio (un seul par élément)
    try {
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current!);
    } catch { sourceRef.current = null; }
  }

  function startRealVisualizer() {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    // Si le contexte n'a pas pu se connecter, on va directement en fake
    if (!canvas || !analyser || !sourceRef.current) { startFakeVisualizer(); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    let zeroFrames = 0;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      // Si on reçoit que des zéros pendant 2s → CORS échoué → fake
      const total = data.reduce((s, v) => s + v, 0);
      if (total === 0) {
        if (++zeroFrames > 300) { startFakeVisualizer(); return; }
      } else { zeroFrames = 0; }
      ctx.fillStyle = "#030000";
      ctx.fillRect(0, 0, W, H);

      const count = bufLen;
      const bw = Math.max(2, Math.floor(W / count));

      for (let i = 0; i < count; i++) {
        const v = data[i];
        const bH = (v / 255) * H;
        const x = i * (bw + 1);
        const grd = ctx.createLinearGradient(0, H, 0, H - bH);
        grd.addColorStop(0, "#cc2200");
        grd.addColorStop(0.6, "#ff3300");
        grd.addColorStop(1, "#ff8800");
        ctx.fillStyle = grd;
        ctx.fillRect(x, H - bH, bw, bH);
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

  function startFakeVisualizer() {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    let t = 0;
    const barData = Array.from({ length: 64 }, () => ({
      phase: Math.random() * Math.PI * 2,
      freq: 0.8 + Math.random() * 3,
      amp: 0.5 + Math.random() * 0.5,
    }));

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      t += 0.07;
      ctx.fillStyle = "#030000";
      ctx.fillRect(0, 0, W, H);
      const bw = W / barData.length;
      barData.forEach((b, i) => {
        const h = (Math.sin(t * b.freq + b.phase) * 0.5 + 0.5) * H * b.amp + 3;
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
    if (!apiBase) return;
    const track = tracks[idx];

    // Incrémenter la génération — tout playTrack précédent encore en await sera ignoré
    const gen = ++playGenRef.current;

    setCurrentIdx(idx);
    currentIdxRef.current = idx;

    // Arrêter et déconnecter l'audio précédent
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onloadedmetadata = null;
    }

    // Créer un nouvel Audio synchroniquement (iOS exige que AudioContext
    // et createMediaElementSource soient créés avant tout await)
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = `${apiBase}/api/audio-proxy?url=${encodeURIComponent(track.url)}`;
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime || 0);
    audio.onloadedmetadata = () => setDuration(audio.duration || 0);
    audio.onended = () => {
      if (audioRef.current !== audio) return;
      const ci = currentIdxRef.current;
      if (tracks.length) playTrack(ci === null ? 0 : (ci + 1) % tracks.length);
    };
    audioRef.current = audio;

    // AudioContext créé synchroniquement sur le nouvel élément (avant tout await)
    initAudioCtxForElement(audio);
    audio.load();

    if (audioCtxRef.current?.state === 'suspended') {
      try { await audioCtxRef.current.resume(); } catch {}
    }

    // Un clic plus récent a pris la main → abandonner silencieusement
    if (gen !== playGenRef.current) { audio.pause(); return; }

    try {
      await audio.play();
      if (gen !== playGenRef.current) { audio.pause(); return; }
      setIsPlaying(true);
      sourceRef.current ? startRealVisualizer() : startFakeVisualizer();
    } catch {
      if (gen !== playGenRef.current) return;
      // Fallback : proxy hors ligne → URL directe sans CORS
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch {}
        sourceRef.current = null;
      }
      const audio2 = new Audio();
      audio2.src = track.url;
      audio2.ontimeupdate = () => setCurrentTime(audio2.currentTime || 0);
      audio2.onloadedmetadata = () => setDuration(audio2.duration || 0);
      audio2.onended = () => {
        if (audioRef.current !== audio2) return;
        const ci = currentIdxRef.current;
        if (tracks.length) playTrack(ci === null ? 0 : (ci + 1) % tracks.length);
      };
      audioRef.current = audio2;
      audio2.load();
      try {
        await audio2.play();
        if (gen !== playGenRef.current) { audio2.pause(); return; }
        setIsPlaying(true);
        startFakeVisualizer();
      } catch {}
    }

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
      const resume = audioCtxRef.current?.state === 'suspended'
        ? audioCtxRef.current.resume().catch(() => {})
        : Promise.resolve();
      resume.then(() => audioRef.current!.play()).then(() => {
        setIsPlaying(true);
        sourceRef.current ? startRealVisualizer() : startFakeVisualizer();
      }).catch(() => {});
    }
  }

  function next() {
    if (!tracks.length) return;
    playTrack(currentIdxRef.current === null ? 0 : (currentIdxRef.current + 1) % tracks.length);
  }
  function prev() {
    if (!tracks.length || currentIdxRef.current === null) return;
    playTrack((currentIdxRef.current - 1 + tracks.length) % tracks.length);
  }

  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null;
  const label: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  return (
    <div className="min-h-screen" style={{ background: "#0a0000", position: "relative" }}>

      {/* KITT animated background — visible quand la musique joue */}
      <canvas
        ref={kittBgRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          pointerEvents: "none",
          opacity: isPlaying ? 1 : 0,
          transition: "opacity 1.8s ease",
        }}
      />

      <div className="fixed inset-0 pointer-events-none" style={{
        zIndex: 1,
        backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative container py-16 max-w-5xl mx-auto px-4" style={{ zIndex: 2 }}>
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

        {!loading && !offline && (
          <div className="grid md:grid-cols-5 gap-6">
            <div className="md:col-span-3">
              <div style={{ background: "#0d0000", border: "1px solid rgba(255,34,34,0.35)" }}>
                <div style={{ background: "linear-gradient(90deg,#2a0000,#1a0000)", padding: "5px 12px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(255,34,34,0.25)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff2222", boxShadow: "0 0 6px #ff2222" }} />
                  <span style={{ ...label, color: "#ff5500", fontSize: "0.45rem" }}>KITT AUDIO SYSTEM v2.5 — KYRONEX</span>
                </div>

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

                <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,34,34,0.1)", display: "flex", alignItems: "center", gap: "14px" }}>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    style={{ ...ctrlBtn, padding: "4px 8px", fontSize: "0.7rem", minWidth: "40px" }}
                  >
                    {isMuted ? "🔇" : "🔊"}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#ff2222", cursor: "pointer", height: "4px" }}
                  />
                  <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "rgba(255,80,0,0.7)", minWidth: "25px" }}>
                    {Math.round(volume * 100)}%
                  </span>
                </div>

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
