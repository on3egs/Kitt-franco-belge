import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Heart, LoaderCircle, Music2, Pause, Play, Repeat1, Search, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import KittScanner from "@/components/KittScanner";
import { getApiBase } from "@/lib/tunnel";
import "./music-pages.css";

interface MusicEntry {
  id: string; url: string; titre: string; artiste: string; pseudo: string; message: string; ts: number; plays?: number;
  theme?: string; creation_type?: "original" | "ai" | "licensed"; license_note?: string; theme_note?: string;
}

const FAVORITES_KEY = "kitt-music-favorites-v1";
const asMessage = (error: unknown) => error instanceof Error ? error.message : "La connexion à la bibliothèque a échoué.";
function formatTime(value: number) { if (!Number.isFinite(value) || value < 0) return "0:00"; return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`; }
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", onAbort); resolve(value); }, error => { signal.removeEventListener("abort", onAbort); reject(error); });
  });
}

export default function Musique() {
  const [tracks, setTracks] = useState<MusicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const [playError, setPlayError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const [visualizer, setVisualizer] = useState<"idle" | "live" | "unavailable">("idle");
  const [reducedMotion, setReducedMotion] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number>(0);
  const generationRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  const filteredRef = useRef<MusicEntry[]>([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);

  const currentTrack = tracks.find(track => track.id === currentId) ?? null;
  const visibleTracks = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return tracks.filter(track => (!favoritesOnly || favorites.includes(track.id)) && (!term || `${track.titre} ${track.artiste} ${track.pseudo}`.toLocaleLowerCase().includes(term)));
  }, [tracks, query, favoritesOnly, favorites]);
  filteredRef.current = visibleTracks;
  currentIdRef.current = currentId;
  shuffleRef.current = shuffle;
  repeatRef.current = repeatOne;

  const drawVisualizer = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || reducedMotion) { setVisualizer("unavailable"); return; }
    const context = canvas.getContext("2d");
    if (!context) { setVisualizer("unavailable"); return; }
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = bounds.width;
    const height = bounds.height;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let frames = 0;
    let nonzero = false;
    let announced = false;
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(samples);
      if (samples.some(value => value > 0)) nonzero = true;
      if (++frames > 240 && !nonzero) { cancelAnimationFrame(animationRef.current); setVisualizer("unavailable"); return; }
      context.clearRect(0, 0, width, height);
      const count = Math.min(samples.length, Math.floor(width / 5));
      const step = Math.max(1, Math.floor(samples.length / count));
      const barWidth = width / count;
      for (let index = 0; index < count; index++) {
        const level = samples[index * step] / 255;
        const barHeight = Math.max(2, level * (height - 6));
        const gradient = context.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, "#bd1e18"); gradient.addColorStop(1, "#ff9b42");
        context.fillStyle = gradient;
        context.fillRect(index * barWidth + 1, height - barHeight, Math.max(1, barWidth - 2), barHeight);
      }
      if (nonzero && !announced) { announced = true; setVisualizer("live"); }
    };
    draw();
  }, [reducedMotion]);

  const stopVisualizer = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setVisualizer("idle");
  }, []);

  const loadTracks = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setApiError("");
    try {
      const base = await withAbort(getApiBase(), signal);
      if (signal.aborted && signal.reason?.name !== "TimeoutError") return;
      if (!base) throw new Error("La bibliothèque KITT est momentanément injoignable.");
      setApiBase(base);
      const response = await fetch(`${base}/api/music/approved`, { signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`La bibliothèque répond avec l’erreur ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data?.approved)) throw new Error("La réponse de la bibliothèque est invalide.");
      if (!signal.aborted) setTracks(data.approved.filter((track: MusicEntry) => track && typeof track.id === "string" && typeof track.url === "string"));
    } catch (error) {
      const timedOut = signal.reason?.name === "TimeoutError";
      if (!signal.aborted || timedOut) {
        setApiBase(null);
        setApiError(timedOut ? "La connexion à la bibliothèque a dépassé le délai prévu. Réessayez." : asMessage(error));
        setLoading(false);
      }
    } finally { if (!signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort(new DOMException("Timeout", "TimeoutError"));
    }, 15000);
    void loadTracks(controller.signal);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [loadTracks, reload]);

  useEffect(() => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* Le navigateur peut désactiver le stockage local. */ }
  }, [favorites]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    if (visualizer !== "unavailable" || !isPlaying || reducedMotion || !sourceRef.current || !currentTrack) return;
    const oldAudio = audioRef.current;
    if (!oldAudio) return;
    const fallbackGeneration = generationRef.current;
    const resumeAt = oldAudio.currentTime;
    const fallback = new Audio(currentTrack.url);
    fallback.preload = "metadata";
    fallback.volume = isMuted ? 0 : volume;
    fallback.onloadedmetadata = () => {
      if (resumeAt > 0 && Number.isFinite(fallback.duration)) fallback.currentTime = Math.min(resumeAt, Math.max(0, fallback.duration - 0.2));
      setDuration(Number.isFinite(fallback.duration) ? fallback.duration : 0);
    };
    fallback.ontimeupdate = () => setCurrentTime(fallback.currentTime || 0);
    fallback.onended = () => {
      const list = filteredRef.current;
      if (repeatRef.current && currentIdRef.current) { void playById(currentIdRef.current); return; }
      const index = list.findIndex(track => track.id === currentIdRef.current);
      const nextIndex = shuffleRef.current && list.length > 1
        ? (() => { const candidates = list.map((_, i) => i).filter(i => i !== index); return candidates[Math.floor(Math.random() * candidates.length)]; })()
        : (index + 1) % list.length;
      if (list[nextIndex]) void playById(list[nextIndex].id); else setIsPlaying(false);
    };
    fallback.onerror = () => { if (audioRef.current === fallback) { setIsPlaying(false); setPlayError("Cette source empêche l’analyse audio et la lecture native a échoué."); } };
    try { sourceRef.current.disconnect(); } catch { /* déjà déconnecté */ }
    try { analyserRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
    sourceRef.current = null; analyserRef.current = null;
    oldAudio.pause(); audioRef.current = fallback;
    void fallback.play().then(() => {
      if (fallbackGeneration !== generationRef.current || audioRef.current !== fallback) { fallback.pause(); return; }
      setVisualizer("unavailable");
    }).catch(() => {
      if (fallbackGeneration === generationRef.current && audioRef.current === fallback) { setIsPlaying(false); setPlayError("La lecture de cette piste a échoué. Vérifiez que le lien audio est public."); }
    });
  }, [visualizer, isPlaying, reducedMotion, currentTrack, isMuted, volume]);

  useEffect(() => () => {
    generationRef.current++;
    cancelAnimationFrame(animationRef.current);
    audioRef.current?.pause();
    try { sourceRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
    try { analyserRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
    void audioCtxRef.current?.close().catch(() => undefined);
  }, []);

  const advanceTrack = (automatic: boolean) => {
    const list = filteredRef.current;
    if (!list.length) { setIsPlaying(false); return; }
    if (automatic && repeatRef.current && currentIdRef.current) { void playById(currentIdRef.current); return; }
    const currentIndex = list.findIndex(track => track.id === currentIdRef.current);
    const nextIndex = shuffleRef.current && list.length > 1
      ? (() => { const candidates = list.map((_, index) => index).filter(index => index !== currentIndex); return candidates[Math.floor(Math.random() * candidates.length)]; })()
      : (currentIndex + 1) % list.length;
    void playById(list[nextIndex].id);
  };

  async function playById(id: string) {
    const track = tracks.find(item => item.id === id);
    if (!track || !apiBase) return;
    const generation = ++generationRef.current;
    setCurrentId(id); currentIdRef.current = id;
    setCurrentTime(0); setDuration(0); setTrackLoading(true); setPlayError(""); setVisualizer("idle");
    audioRef.current?.pause();
    try { sourceRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
    try { analyserRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
    sourceRef.current = null;
    cancelAnimationFrame(animationRef.current);

    const createAudio = (src: string, cors = true) => {
      const audio = new Audio();
      if (cors) audio.crossOrigin = "anonymous";
      audio.preload = "metadata";
      audio.volume = isMuted ? 0 : volume;
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime || 0);
      audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onended = () => advanceTrack(true);
      audio.onerror = () => { if (audioRef.current === audio) { setTrackLoading(false); setIsPlaying(false); setPlayError("Cette piste ne peut pas être lue. Vérifiez le lien ou choisissez une autre création."); } };
      audio.src = src;
      return audio;
    };

    let audio = createAudio(`${apiBase}/api/audio-proxy?url=${encodeURIComponent(track.url)}`);
    audioRef.current = audio;
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current ??= new Ctx();
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.78;
        const source = audioCtxRef.current.createMediaElementSource(audio);
        source.connect(analyser); analyser.connect(audioCtxRef.current.destination);
        sourceRef.current = source; analyserRef.current = analyser;
        if (audioCtxRef.current.state === "suspended") await audioCtxRef.current.resume();
      }
      if (generation !== generationRef.current) { audio.pause(); return; }
      await audio.play();
      if (generation !== generationRef.current) { audio.pause(); return; }
      setIsPlaying(true); setTrackLoading(false);
      if (sourceRef.current) drawVisualizer(); else setVisualizer("unavailable");
    } catch {
      if (generation !== generationRef.current) { audio.pause(); return; }
      // Une source externe peut refuser CORS. On retente en lecture native, sans annoncer un spectre indisponible comme réel.
      try { sourceRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
      try { analyserRef.current?.disconnect(); } catch { /* déjà déconnecté */ }
      sourceRef.current = null; analyserRef.current = null;
      audio.pause();
      audio = createAudio(track.url, false); audioRef.current = audio;
      try {
        await audio.play();
        if (generation !== generationRef.current) { audio.pause(); return; }
        setIsPlaying(true); setTrackLoading(false); setVisualizer("unavailable");
      } catch {
        if (generation === generationRef.current) {
          setTrackLoading(false); setIsPlaying(false);
          setPlayError("Lecture impossible. Le lien doit pointer vers un fichier audio accessible sans connexion.");
        }
        return;
      }
    }
    void fetch(`${apiBase}/api/music/play/${encodeURIComponent(track.id)}`, { method: "POST" }).catch(() => undefined);
    setTracks(items => items.map(item => item.id === track.id ? { ...item, plays: (item.plays || 0) + 1 } : item));
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) { if (visibleTracks[0]) void playById(visibleTracks[0].id); return; }
    if (isPlaying) { generationRef.current++; audio.pause(); setIsPlaying(false); stopVisualizer(); }
    else {
      generationRef.current++;
      const playGeneration = generationRef.current;
      void audio.play().then(() => {
        if (playGeneration !== generationRef.current || audioRef.current !== audio) { audio.pause(); return; }
        setIsPlaying(true); if (sourceRef.current) drawVisualizer();
      }).catch(() => { if (playGeneration === generationRef.current && audioRef.current === audio) setPlayError("La lecture a été bloquée. Appuyez de nouveau sur Lecture."); });
    }
  }

  function seek(value: number) {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = value; setCurrentTime(value);
  }

  function toggleFavorite(id: string) {
    setFavorites(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
  }

  return <main className="music-page">
    <div className={`music-atmosphere ${isPlaying && !reducedMotion ? "is-active" : ""}`} aria-hidden="true"><span /></div>
    <div className="music-shell">
      <header className="music-heading">
        <div className="music-eyebrow"><Music2 size={15} /> KITT FRANCO-BELGE <span>·</span> LE GARAGE SONORE</div>
        <h1>La bande-son <em>de KITT</em></h1>
        <p>Des créations inspirées par l’univers Knight Rider, sélectionnées par Manix et partagées par la communauté.</p>
        <KittScanner height={5} />
      </header>

      {apiError && <section className="music-state music-error" role="alert"><AlertCircle size={24} /><div><strong>La bibliothèque ne répond pas pour le moment.</strong><p>{apiError} Vos favoris enregistrés sur cet appareil restent disponibles après le retour du service.</p></div><button className="music-button secondary" onClick={() => setReload(value => value + 1)}>Réessayer</button></section>}

      {!apiError && <div className="music-layout">
        <section className="music-player-card" aria-label="Lecteur audio">
          <div className="music-card-top"><span className="music-live-dot" /> COCKPIT AUDIO <span className="music-card-version">KNIGHT RIDER EDITION</span></div>
          <div className="music-now-playing">
            <div className="music-cover" aria-hidden="true"><div className="music-cover-scanner" /><Music2 size={34} /></div>
            <div className="music-track-meta"><span className="music-kicker">{isPlaying ? "EN COURS DE LECTURE" : "À L’ÉCOUTE"}</span><h2>{currentTrack?.titre || "Choisissez une piste"}</h2><p>{currentTrack?.artiste || "Les créations de la communauté KITT"}</p></div>
          </div>
          <div className="music-spectrum-wrap">
            <canvas ref={canvasRef} className="music-spectrum" aria-hidden="true" />
            <div className="music-spectrum-caption">{visualizer === "live" ? "SPECTRE AUDIO EN DIRECT" : visualizer === "unavailable" ? "SPECTRE INDISPONIBLE POUR CETTE SOURCE" : "SPECTRE EN ATTENTE"}</div>
          </div>
          {playError && <p className="music-inline-error" role="alert"><AlertCircle size={16} />{playError}</p>}
          <label className="music-seek-label" htmlFor="music-seek"><span>Position</span><span>{formatTime(currentTime)} / {formatTime(duration)}</span></label>
          <input id="music-seek" className="music-range" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={event => seek(Number(event.target.value))} disabled={!duration} aria-label="Position dans la piste" />
          <div className="music-transport">
            <button className={`music-icon-button ${shuffle ? "selected" : ""}`} type="button" onClick={() => setShuffle(value => !value)} aria-pressed={shuffle} aria-label={shuffle ? "Désactiver la lecture aléatoire" : "Activer la lecture aléatoire"} title="Lecture aléatoire"><Shuffle size={18} /></button>
            <button className="music-icon-button" type="button" onClick={() => { const list = filteredRef.current; const index = list.findIndex(track => track.id === currentIdRef.current); if (list.length) void playById(list[(index - 1 + list.length) % list.length].id); }} aria-label="Piste précédente"><SkipBack size={20} /></button>
            <button className="music-play-button" type="button" onClick={togglePlay} disabled={trackLoading || (!currentTrack && !visibleTracks.length)} aria-label={isPlaying ? "Mettre en pause" : "Lancer la lecture"}>{trackLoading ? <LoaderCircle className="music-spin" size={22} /> : isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
            <button className="music-icon-button" type="button" onClick={() => advanceTrack(false)} aria-label="Piste suivante"><SkipForward size={20} /></button>
            <button className={`music-icon-button ${repeatOne ? "selected" : ""}`} type="button" onClick={() => setRepeatOne(value => !value)} aria-pressed={repeatOne} aria-label={repeatOne ? "Désactiver la répétition" : "Répéter cette piste"} title="Répéter la piste"><Repeat1 size={18} /></button>
          </div>
          <div className="music-volume"><button className="music-icon-button compact" type="button" onClick={() => setIsMuted(value => !value)} aria-label={isMuted ? "Activer le son" : "Couper le son"}>{isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input className="music-range" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Volume"/><span>{Math.round((isMuted ? 0 : volume) * 100)}%</span></div>
          <p className="music-player-note">Lecture sur demande · le spectre s’anime uniquement lorsque le navigateur reçoit les fréquences du morceau.</p>
        </section>

        <section className="music-library-card" aria-label="Bibliothèque musicale">
          <div className="music-library-heading"><div><span className="music-kicker">TRANSMISSIONS APPROUVÉES</span><h2>La playlist</h2></div><span className="music-count">{tracks.length.toString().padStart(2, "0")} PISTES</span></div>
          <div className="music-search-row"><label className="music-search"><Search size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Titre ou artiste…" aria-label="Rechercher dans les pistes" /></label><button className={`music-icon-button favorite-filter ${favoritesOnly ? "selected" : ""}`} onClick={() => setFavoritesOnly(value => !value)} aria-pressed={favoritesOnly} aria-label={favoritesOnly ? "Afficher toutes les pistes" : "Afficher les favoris uniquement"}><Heart size={18} fill={favoritesOnly ? "currentColor" : "none"} /></button></div>
          <div className="music-track-list" aria-live="polite">
            {loading && <div className="music-state"><LoaderCircle className="music-spin" size={24} /><span>Connexion à la bibliothèque…</span></div>}
            {!loading && !tracks.length && <div className="music-empty"><Music2 size={26} /><strong>La playlist attend ses premières transmissions.</strong><p>Proposez une création originale, une piste générée par IA avec les droits nécessaires, ou un morceau sous licence compatible.</p><Link className="music-text-link" href="/soumettre-musique">Découvrir comment proposer une piste →</Link></div>}
            {!loading && tracks.length > 0 && !visibleTracks.length && <div className="music-empty"><Search size={24} /><strong>Aucune piste trouvée.</strong><p>Essayez un autre titre ou affichez toute la bibliothèque.</p><button className="music-text-link" onClick={() => { setQuery(""); setFavoritesOnly(false); }}>Effacer les filtres</button></div>}
            {visibleTracks.map((track, index) => <div className={`music-track-row ${currentId === track.id ? "is-current" : ""}`} key={track.id}>
              <button className="music-track-select" type="button" onClick={() => void playById(track.id)} aria-label={`Lire ${track.titre} par ${track.artiste}`}><span className="music-track-index">{currentId === track.id && isPlaying ? <span className="music-playing-bars" aria-hidden="true"><i /><i /><i /></span> : `${String(index + 1).padStart(2, "0")}`}</span><span className="music-track-title"><strong>{track.titre || "Sans titre"}</strong><small>{track.artiste || "Artiste non précisé"}{track.creation_type === "ai" ? " · Création IA" : track.creation_type === "licensed" ? " · Sous licence" : track.creation_type === "original" ? " · Originale" : " · Catalogue existant"}</small></span><span className="music-track-plays">{track.plays || 0} <small>écoutes</small></span></button>
              <button className={`music-favorite ${favorites.includes(track.id) ? "is-favorite" : ""}`} onClick={() => toggleFavorite(track.id)} type="button" aria-label={favorites.includes(track.id) ? `Retirer ${track.titre} des favoris` : `Ajouter ${track.titre} aux favoris`} aria-pressed={favorites.includes(track.id)}><Heart size={17} fill={favorites.includes(track.id) ? "currentColor" : "none"} /></button>
            </div>)}
          </div>
          <div className="music-list-foot"><span>Les nouvelles propositions sont examinées par Manix.</span><Link href="/soumettre-musique">Proposer une création <span aria-hidden="true">↗</span></Link></div>
        </section>
      </div>}

      <section className="music-howto"><div className="music-howto-heading"><span className="music-kicker">TRANSMISSION KITT</span><h2>Une piste à partager ?</h2><p>Créations faites maison bienvenues — musique inspirée de Knight Rider, dans le respect des droits de chacun.</p></div><div className="music-steps"><article><span>01</span><strong>Préparez un lien direct</strong><p>Hébergez votre fichier MP3 sur un service qui fournit un lien de lecture direct et public, sans connexion ni page de téléchargement.</p></article><article><span>02</span><strong>Décrivez la création</strong><p>Indiquez le titre, l’artiste, l’origine (originale, IA ou sous licence) et les informations de licence ou de génération nécessaires.</p></article><article><span>03</span><strong>Manix vérifie</strong><p>Votre proposition reste privée et en attente jusqu’à sa vérification et son approbation. L’envoi ne garantit pas la publication.</p></article></div><div className="music-howto-footer"><span>Le thème KITT / Knight Rider doit être expliqué. <a className="music-rights-link" href="https://economie.fgov.be/fr/themes/propriete-intellectuelle/droits-de-propriete/droits-dauteur-et-droits/droits-dauteur/le-droit-dauteur-sur-internet" target="_blank" rel="noreferrer">Guide officiel belge sur le droit d’auteur ↗</a></span><Link className="music-button primary" href="/soumettre-musique">Lire le guide et proposer <SkipForward size={16} /></Link></div></section>
      <footer className="music-footer"><Link href="/">← Retour au système KITT</Link><span>BY MANIX · KITT FRANCO-BELGE</span></footer>
    </div>
  </main>;
}
