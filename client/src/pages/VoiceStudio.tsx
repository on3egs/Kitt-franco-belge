import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  AudioLines,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileAudio,
  Headphones,
  LoaderCircle,
  Mic,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import "./VoiceStudio.css";

// Keep one origin for the website and the future Windows client.
export const VOICE_STUDIO_API_ORIGIN = "https://kitt.kitt-franco-belge.be";
const API = `${VOICE_STUDIO_API_ORIGIN}/api/voice-studio`;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_SECONDS = 30;
const JOB_STORAGE_KEY = "manix.voice-studio.job.v1";
const INPUT_AUDIO_TYPES = "audio/*,.wav,.mp3,.m4a,.ogg,.webm,.mp4,.flac";
type Mode = "audio" | "text";
type InputAudio = { file: File; duration: number };
type Health = {
  ok: boolean;
  ready: boolean;
  engine?: string;
  queue?: number;
  limits?: Record<string, unknown>;
};
type Job = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  stage?: string;
  error?: string;
  duration_seconds?: number;
  queue_position?: number;
  audio_url?: string;
  expires_at?: string;
};
const IDLE_BARS = Array.from({ length: 24 }, () => 7);

function durationLabel(seconds: number) {
  return `${seconds.toFixed(1).replace(".", ",")} s`;
}
function audioFilename(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
}
function storedJobId() {
  try {
    const id = sessionStorage.getItem(JOB_STORAGE_KEY);
    return id && /^[a-zA-Z0-9_-]{8,100}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
function storeJobId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(JOB_STORAGE_KEY, id);
    else sessionStorage.removeItem(JOB_STORAGE_KEY);
  } catch {
    /* Browser storage is optional. */
  }
}
function useAudioPreview(input: InputAudio | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!input) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(input.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [input]);
  return url;
}
async function readAudioDuration(file: File) {
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass)
    throw new Error(
      "La lecture audio nécessaire au contrôle du fichier n’est pas disponible. Essaie Edge, Chrome ou Firefox à jour."
    );
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0)
      throw new Error("Le fichier ne contient pas d’audio lisible.");
    return decoded.duration;
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("ne contient"))
      throw cause;
    throw new Error(
      "Ce fichier audio n’a pas pu être lu. Essaie une copie en WAV, MP3 ou M4A."
    );
  } finally {
    void context.close().catch(() => undefined);
  }
}
async function responseError(response: Response) {
  try {
    const body = await response.json();
    const value = body.error ?? body.message ?? body.detail;
    return typeof value === "string"
      ? value
      : `Le studio a renvoyé une erreur (${response.status}).`;
  } catch {
    return `Le studio a renvoyé une erreur (${response.status}).`;
  }
}
function validJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    /^[a-zA-Z0-9_-]{8,100}$/.test(record.id) &&
    ["queued", "processing", "completed", "failed"].includes(
      String(record.status)
    )
  );
}

export default function VoiceStudio() {
  const [mode, setMode] = useState<Mode>("audio");
  const [reference, setReference] = useState<InputAudio | null>(null);
  const [source, setSource] = useState<InputAudio | null>(null);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthBusy, setHealthBusy] = useState(true);
  const [healthError, setHealthError] = useState("");
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [inputError, setInputError] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [bars, setBars] = useState(IDLE_BARS);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [jobId, setJobId] = useState<string | null>(storedJobId);
  const [pollError, setPollError] = useState("");
  const [pollNonce, setPollNonce] = useState(0);
  const [downloadBusy, setDownloadBusy] = useState("");
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureStartRef = useRef(0);
  const validationVersion = useRef({ reference: 0, source: 0 });
  const submitController = useRef<AbortController | null>(null);
  const healthController = useRef<AbortController | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const referenceUrl = useAudioPreview(reference);
  const sourceUrl = useAudioPreview(source);
  const processing = Boolean(
    jobId && (!job || job.status === "queued" || job.status === "processing")
  );
  const active = submitting || processing || deleting;
  const ready = Boolean(health?.ok && health.ready);
  const progress =
    typeof job?.progress === "number" && Number.isFinite(job.progress)
      ? Math.max(0, Math.min(100, job.progress))
      : undefined;
  const resultAudioUrl =
    job?.status === "completed" && jobId
      ? `${API}/jobs/${encodeURIComponent(jobId)}/audio?format=mp3`
      : "";

  const stopCaptureResources = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (micContextRef.current) {
      void micContextRef.current.close().catch(() => undefined);
      micContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        recorderRef.current.ondataavailable = null;
        if (recorderRef.current.state !== "inactive")
          recorderRef.current.stop();
      }
      stopCaptureResources();
      submitController.current?.abort();
      healthController.current?.abort();
      downloadController.current?.abort();
    };
  }, [stopCaptureResources]);

  const checkHealth = useCallback(async () => {
    healthController.current?.abort();
    const controller = new AbortController();
    healthController.current = controller;
    setHealthBusy(true);
    setHealthError("");
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${API}/health`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json();
      if (
        !body ||
        typeof body.ok !== "boolean" ||
        typeof body.ready !== "boolean"
      )
        throw new Error("Réponse du moteur non reconnue.");
      if (mounted.current && healthController.current === controller) {
        setHealth(body);
        setHealthError("");
      }
    } catch {
      if (mounted.current && healthController.current === controller) {
        setHealth(null);
        setHealthError(
          "Le moteur AGX n’est pas joignable pour le moment. Tu peux préparer tes extraits puis réessayer."
        );
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current && healthController.current === controller)
        setHealthBusy(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(() => {
      if (!document.hidden) void checkHealth();
    }, 45000);
    return () => {
      clearInterval(timer);
      healthController.current?.abort();
    };
  }, [checkHealth]);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 15000);
      let nextDelay = 4500;
      try {
        const response = await fetch(
          `${API}/jobs/${encodeURIComponent(jobId)}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (response.status === 404 || response.status === 410) {
          if (!stopped && mounted.current) {
            setJob(null);
            setJobId(null);
            storeJobId(null);
            setPollError(
              "Cet essai a expiré ou a été supprimé. Tu peux en créer un nouveau."
            );
          }
          return;
        }
        if (!response.ok) throw new Error(await responseError(response));
        const body = await response.json();
        if (!validJob(body) || body.id !== jobId)
          throw new Error("État du traitement non reconnu.");
        if (stopped || !mounted.current) return;
        setJob(body);
        setPollError("");
        if (body.status === "completed" || body.status === "failed") {
          void checkHealth();
          return;
        }
      } catch {
        if (!stopped && mounted.current)
          setPollError(
            "Connexion interrompue. La reprise du suivi est automatique; ton traitement peut continuer sur l’AGX."
          );
        nextDelay = 10000;
      } finally {
        clearTimeout(timeout);
      }
      if (!stopped) timer = setTimeout(() => void poll(), nextDelay);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [jobId, pollNonce, checkHealth]);

  async function chooseAudio(
    file: File | undefined,
    target: "reference" | "source"
  ) {
    if (!file) return;
    const version = ++validationVersion.current[target];
    setInputError("");
    setMessage("");
    if (file.size > MAX_BYTES) {
      setInputError(
        "Ce fichier dépasse 20 Mo. Choisis un extrait plus court ou une copie compressée."
      );
      return;
    }
    if (
      !file.type.startsWith("audio/") &&
      !file.type.startsWith("video/") &&
      !/\.(wav|mp3|m4a|ogg|oga|opus|webm|mp4|flac|aac)$/i.test(file.name)
    ) {
      setInputError("Choisis un fichier audio : WAV, MP3, M4A, OGG ou WebM.");
      return;
    }
    if (target === "reference") setReferenceBusy(true);
    else setSourceBusy(true);
    try {
      const duration = await readAudioDuration(file);
      if (!mounted.current || version !== validationVersion.current[target])
        return;
      if (target === "reference" && (duration < 5 || duration > 30.5))
        throw new Error(
          "La référence doit durer entre 5 et 30 secondes. Une voix seule, naturelle et bien distincte donne un meilleur résultat."
        );
      if (target === "source" && (duration < 1 || duration > 30.5))
        throw new Error(
          "Cette version bêta traite des extraits de 1 à 30 secondes. Découpe d’abord ton passage dans les outils audio."
        );
      const value = { file, duration };
      if (target === "reference") setReference(value);
      else setSource(value);
      setMessage(
        target === "reference"
          ? "Référence prête. Écoute-la pour vérifier que ta voix est claire et sans musique."
          : "Extrait prêt. Écoute le passage avant de lancer la conversion."
      );
    } catch (cause) {
      if (mounted.current && version === validationVersion.current[target])
        setInputError(
          cause instanceof Error
            ? cause.message
            : "Impossible d’ouvrir ce fichier audio."
        );
    } finally {
      if (mounted.current && version === validationVersion.current[target]) {
        if (target === "reference") setReferenceBusy(false);
        else setSourceBusy(false);
      }
    }
  }

  async function startRecording() {
    if (recording || microphoneBusy || active) return;
    setInputError("");
    setMessage("");
    setMicrophoneBusy(true);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setInputError(
        "L’enregistrement du microphone n’est pas disponible ici. Ouvre cette page en HTTPS ou importe une référence audio."
      );
      setMicrophoneBusy(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      if (!mounted.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const duration = (performance.now() - captureStartRef.current) / 1000;
        stopCaptureResources();
        recorderRef.current = null;
        if (!mounted.current) return;
        setRecording(false);
        setBars(IDLE_BARS);
        setRecordingSeconds(Math.min(30, duration));
        if (duration < 5) {
          setInputError(
            "Enregistrement trop court. Parle pendant au moins 5 secondes puis arrête le micro."
          );
          return;
        }
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        const blob = new Blob(chunks, { type });
        void chooseAudio(
          new File([blob], `ma-reference-manix.${extension}`, { type }),
          "reference"
        );
      };
      recorder.onerror = () => {
        stopCaptureResources();
        recorderRef.current = null;
        if (mounted.current) {
          setRecording(false);
          setBars(IDLE_BARS);
          setInputError(
            "L’enregistrement a été interrompu. Vérifie ton microphone puis réessaie."
          );
        }
      };
      try {
        const context = new AudioContext();
        micContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let previousFrame = 0;
        const update = (timestamp: number) => {
          if (!mounted.current) return;
          if (timestamp - previousFrame >= 70) {
            analyser.getByteFrequencyData(data);
            setBars(
              Array.from({ length: 24 }, (_, index) =>
                Math.max(
                  7,
                  Math.min(100, ((data[index * 3 + 2] ?? 0) / 255) * 100)
                )
              )
            );
            previousFrame = timestamp;
          }
          animationRef.current = requestAnimationFrame(update);
        };
        animationRef.current = requestAnimationFrame(update);
      } catch {
        /* A level meter is optional; the recording still works. */
      }
      captureStartRef.current = performance.now();
      setRecordingSeconds(0);
      setRecording(true);
      recorder.start(250);
      timerRef.current = setInterval(() => {
        const elapsed = Math.min(
          30,
          (performance.now() - captureStartRef.current) / 1000
        );
        if (mounted.current) setRecordingSeconds(elapsed);
        if (elapsed >= MAX_REFERENCE_SECONDS && recorder.state === "recording")
          recorder.stop();
      }, 100);
    } catch (cause) {
      stopCaptureResources();
      if (mounted.current) {
        setRecording(false);
        setInputError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Le microphone n’a pas été autorisé. Autorise-le dans ton navigateur ou importe un fichier audio."
            : "Le microphone n’a pas pu démarrer. Vérifie son branchement et sa disponibilité."
        );
      }
    } finally {
      if (mounted.current) setMicrophoneBusy(false);
    }
  }
  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submit() {
    if (
      !reference ||
      active ||
      recording ||
      !consent ||
      !ready ||
      (mode === "audio" ? !source : !text.trim())
    )
      return;
    setSubmitting(true);
    setInputError("");
    setMessage("");
    setPollError("");
    const controller = new AbortController();
    submitController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    const form = new FormData();
    form.append("reference", reference.file);
    form.append("mode", mode);
    form.append("consent", "true");
    if (mode === "audio" && source) form.append("source", source.file);
    else form.append("text", text.trim());
    try {
      const response = await fetch(`${API}/jobs`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json();
      if (!validJob(body))
        throw new Error(
          "Le moteur n’a pas fourni d’identifiant de suivi valide. Réessaie plus tard."
        );
      if (!mounted.current) return;
      setJob(body);
      setJobId(body.id);
      storeJobId(body.id);
      setPollNonce(value => value + 1);
      void checkHealth();
    } catch (cause) {
      if (mounted.current)
        setInputError(
          cause instanceof Error && cause.name !== "AbortError"
            ? cause.message
            : "L’envoi a été interrompu ou a pris trop de temps. Vérifie la connexion avant de réessayer."
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setSubmitting(false);
    }
  }
  async function deleteJob() {
    if (!jobId || deleting) return;
    setDeleting(true);
    setPollError("");
    try {
      const response = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status !== 404 && response.status !== 410)
        throw new Error(await responseError(response));
      if (!mounted.current) return;
      setJobId(null);
      storeJobId(null);
      setJob(null);
      setMessage(
        "L’essai et ses fichiers ont été supprimés du moteur. Tu peux préparer une nouvelle création."
      );
      void checkHealth();
    } catch (cause) {
      if (mounted.current)
        setPollError(
          cause instanceof Error && cause.name !== "TimeoutError"
            ? cause.message
            : "Suppression non confirmée. Réessaie lorsque le moteur est joignable."
        );
    } finally {
      if (mounted.current) setDeleting(false);
    }
  }
  async function download(format: "wav" | "mp3") {
    if (!jobId || downloadBusy || job?.status !== "completed") return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloadBusy(format);
    setPollError("");
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(
        `${API}/jobs/${encodeURIComponent(jobId)}/audio?format=${format}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (!blob.size)
        throw new Error(
          "Le moteur a renvoyé un fichier vide. Réessaie le téléchargement."
        );
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${source && mode === "audio" ? audioFilename(source.file) : "ma-voix"}-manix-voice-studio.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage(
        `Copie ${format.toUpperCase()} téléchargée · ${(blob.size / 1048576).toFixed(2)} Mo.`
      );
    } catch (cause) {
      if (mounted.current)
        setPollError(
          cause instanceof Error && cause.name !== "AbortError"
            ? cause.message
            : "Le téléchargement a été interrompu. Tu peux réessayer."
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setDownloadBusy("");
    }
  }

  const canSubmit =
    ready &&
    reference &&
    consent &&
    !active &&
    !recording &&
    !microphoneBusy &&
    !referenceBusy &&
    !sourceBusy &&
    (mode === "audio" ? source : text.trim());
  const missing = !reference
    ? "Ajoute d’abord une référence de ta voix."
    : mode === "audio" && !source
      ? "Ajoute le passage audio à transformer."
      : mode === "text" && !text.trim()
        ? "Écris la phrase à faire prononcer."
        : !consent
          ? "Confirme l’autorisation d’utiliser cette voix."
          : !ready
            ? "Le moteur doit être disponible pour lancer la création."
            : "Ta création est prête à être envoyée au moteur AGX.";
  const expiration = job?.expires_at ? new Date(job.expires_at) : null;
  const validExpiration =
    expiration && !Number.isNaN(expiration.getTime())
      ? expiration.toLocaleString("fr-BE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <main className="voice-studio">
      <header className="vs-topbar">
        <a href="/outils">
          <ArrowLeft size={16} /> Tous les outils
        </a>
        <span>
          MANIX <i>//</i> VOICE STUDIO
        </span>
        <a
          href="https://www.facebook.com/groups/757797724622219/"
          target="_blank"
          rel="noreferrer"
        >
          KITT-FRANCO-BELGE ↗
        </a>
      </header>
      <section className="vs-hero">
        <div className="vs-hero-copy">
          <span className="vs-eyebrow">
            <Sparkles size={14} /> NOUVEL ATELIER VOCAL · BY MANIX
          </span>
          <h1>
            Fais entendre
            <br />
            <em>ta propre voix.</em>
          </h1>
          <p>
            Un passage chanté, une phrase, une idée. Fournis une référence de ta
            voix et crée un premier extrait avec le moteur du studio.
          </p>
          <div className="vs-hero-badges">
            <span>
              <AudioLines size={14} /> Chant & parole
            </span>
            <span>
              <Clock3 size={14} /> Extraits de 30 secondes
            </span>
            <span>
              <ShieldCheck size={14} /> Voix personnelle ou autorisée
            </span>
          </div>
          <a className="vs-hero-action" href="#voice-workspace">
            Créer mon extrait <ChevronRight size={16} />
          </a>
          <a
            className="vs-windows-download"
            href="/downloads/ManixVoiceStudioSetup.exe"
            download
          >
            Télécharger l’application Windows 11
          </a>
        </div>
        <div className="vs-voicebox" aria-hidden="true">
          <div className="vs-device-top">
            <span>KNIGHT INDUSTRIES</span>
            <b>MANIX</b>
          </div>
          <div className="vs-device-display">
            <div className="vs-device-bars">
              {[0, 1, 2].map(column => (
                <div key={column}>
                  {Array.from({ length: 17 }, (_, row) => (
                    <i
                      key={row}
                      className={
                        row > (column === 1 ? 2 : 6) &&
                        row < (column === 1 ? 16 : 13)
                          ? "lit"
                          : ""
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
            <span>VOICE RECONSTRUCTION SYSTEM</span>
          </div>
          <div className="vs-device-controls">
            <i />
            <span>PERSONAL VOICE / AGX ENGINE</span>
            <b>01</b>
          </div>
        </div>
      </section>
      <div className="vs-intro-strip">
        <span className="vs-beta">BÊTA PUBLIQUE</span>
        <p>
          Cette première version transforme des extraits courts. En mode audio,
          elle adapte le timbre à ta référence; en mode texte, elle produit une
          voix parlée.
        </p>
        <a href="#voice-how-it-works">Comment ça marche ?</a>
      </div>
      <section className="vs-engine" aria-label="État du moteur">
        <span
          className={`vs-engine-led ${healthBusy ? "checking" : ready ? "ready" : "offline"}`}
        />
        <div>
          <strong>
            {healthBusy
              ? "Vérification du moteur…"
              : ready
                ? "Le moteur vocal est disponible"
                : healthError
                  ? "Moteur momentanément inaccessible"
                  : "Le moteur se prépare"}
          </strong>
          <p>
            {healthError ||
              (health
                ? `${health.engine || "Moteur vocal AGX"}${typeof health.queue === "number" ? ` · ${health.queue} essai${health.queue > 1 ? "s" : ""} en attente` : ""}`
                : "Connexion sécurisée au studio AGX.")}
          </p>
        </div>
        <button disabled={healthBusy} onClick={() => void checkHealth()}>
          <RefreshCw size={14} className={healthBusy ? "vs-spin" : ""} />{" "}
          Réessayer
        </button>
      </section>
      <section
        className="vs-workspace"
        id="voice-workspace"
        aria-label="Créer un extrait avec sa voix"
      >
        <div className="vs-section-heading">
          <div>
            <span className="vs-eyebrow">TA VOIX AUX COMMANDES</span>
            <h2>Prépare ton premier extrait.</h2>
          </div>
          <span className="vs-step-count">
            2 fichiers maximum · sans installation
          </span>
        </div>
        <div className="vs-form-grid">
          <section className="vs-card vs-reference">
            <div className="vs-card-heading">
              <b>01</b>
              <div>
                <h3>Ta référence vocale</h3>
                <p>
                  Une voix seule, claire et naturelle. Entre 5 et 30 secondes.
                </p>
              </div>
              <Mic size={21} />
            </div>
            <div className={`vs-recorder ${recording ? "recording" : ""}`}>
              <div className="vs-recorder-header">
                <span>{recording ? "MICRO EN COURS" : "CAPTURE VOCALE"}</span>
                <strong>
                  {recordingSeconds.toFixed(1).replace(".", ",")}{" "}
                  <small>/ 30 s</small>
                </strong>
              </div>
              <div className="vs-live-wave" aria-hidden="true">
                {bars.map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="vs-recorder-controls">
                {recording ? (
                  <button className="vs-record-stop" onClick={stopRecording}>
                    <Square size={14} fill="currentColor" /> Arrêter
                    l’enregistrement
                  </button>
                ) : (
                  <button
                    className="vs-record-start"
                    disabled={active || microphoneBusy || referenceBusy}
                    onClick={() => void startRecording()}
                  >
                    {microphoneBusy ? (
                      <LoaderCircle size={16} className="vs-spin" />
                    ) : (
                      <Mic size={16} />
                    )}{" "}
                    {microphoneBusy
                      ? "Autorisation du micro…"
                      : "Enregistrer ma voix"}
                  </button>
                )}
                <small>
                  {recording
                    ? recordingSeconds < 5
                      ? "Continue encore un peu : 5 secondes minimum."
                      : "Tu peux arrêter. Arrêt automatique à 30 secondes."
                    : "Le micro reste éteint tant que tu ne l’actives pas."}
                </small>
              </div>
            </div>
            <div className="vs-or">
              <span>ou importe un enregistrement</span>
            </div>
            <label
              className={`vs-file-picker ${recording || active ? "disabled" : ""}`}
            >
              <Upload size={18} />
              <span>
                <strong>
                  {referenceBusy
                    ? "Vérification de la référence…"
                    : "Choisir ma référence audio"}
                </strong>
                <small>WAV, MP3, M4A, OGG, WebM · 20 Mo maximum</small>
              </span>
              <input
                aria-label="Choisir la référence de ma voix"
                type="file"
                accept={INPUT_AUDIO_TYPES}
                disabled={
                  recording || active || microphoneBusy || referenceBusy
                }
                onChange={event => {
                  void chooseAudio(event.currentTarget.files?.[0], "reference");
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {reference && (
              <div className="vs-audio-selection">
                <div>
                  <Check size={15} />
                  <strong>{reference.file.name}</strong>
                  <span>{durationLabel(reference.duration)}</span>
                  <button
                    aria-label="Retirer ma référence"
                    title="Retirer ma référence"
                    disabled={active || recording}
                    onClick={() => {
                      validationVersion.current.reference++;
                      setReference(null);
                      setReferenceBusy(false);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {referenceUrl && (
                  <audio
                    key={referenceUrl}
                    controls
                    preload="metadata"
                    src={referenceUrl}
                    aria-label="Écouter ma référence vocale"
                  />
                )}
              </div>
            )}
            <div className="vs-record-tip">
              <Headphones size={16} />
              <p>
                Parle dans une pièce calme, sans musique derrière. Pour le
                chant, une référence chantée propre peut aider. Évite la
                réverbération et les micros saturés.
              </p>
            </div>
          </section>
          <section className="vs-card vs-source">
            <div className="vs-card-heading">
              <b>02</b>
              <div>
                <h3>Ce que tu veux créer</h3>
                <p>Choisis le contenu à faire interpréter par ta voix.</p>
              </div>
              <WandSparkles size={21} />
            </div>
            <div className="vs-mode-tabs" aria-label="Type de création">
              <button
                disabled={active}
                aria-pressed={mode === "audio"}
                className={mode === "audio" ? "active" : ""}
                onClick={() => setMode("audio")}
              >
                <AudioLines size={16} /> Chant ou parole
              </button>
              <button
                disabled={active}
                aria-pressed={mode === "text"}
                className={mode === "text" ? "active" : ""}
                onClick={() => setMode("text")}
              >
                <FileAudio size={16} /> Texte à prononcer
              </button>
            </div>
            {mode === "audio" ? (
              <div className="vs-source-mode">
                <div className="vs-mode-explanation">
                  <span>ADAPTER UNE INTERPRÉTATION</span>
                  <h4>Garde le passage. Change le timbre.</h4>
                  <p>
                    Importe un extrait chanté ou parlé de 30 secondes maximum.
                    Une piste vocale isolée est préférable à un morceau complet
                    avec instruments.
                  </p>
                </div>
                <label
                  className={`vs-source-upload ${active ? "disabled" : ""}`}
                >
                  <span>
                    <Upload size={25} />
                  </span>
                  <strong>
                    {sourceBusy
                      ? "Vérification de l’extrait…"
                      : source
                        ? "Remplacer le passage audio"
                        : "Choisir le passage à transformer"}
                  </strong>
                  <small>1 à 30 secondes · maximum 20 Mo</small>
                  <input
                    aria-label="Choisir le passage audio à transformer"
                    type="file"
                    accept={INPUT_AUDIO_TYPES}
                    disabled={active || sourceBusy}
                    onChange={event => {
                      void chooseAudio(
                        event.currentTarget.files?.[0],
                        "source"
                      );
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {source && (
                  <div className="vs-audio-selection">
                    <div>
                      <FileAudio size={15} />
                      <strong>{source.file.name}</strong>
                      <span>{durationLabel(source.duration)}</span>
                      <button
                        aria-label="Retirer le passage audio"
                        disabled={active}
                        onClick={() => {
                          validationVersion.current.source++;
                          setSource(null);
                          setSourceBusy(false);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {sourceUrl && (
                      <audio
                        key={sourceUrl}
                        controls
                        preload="metadata"
                        src={sourceUrl}
                        aria-label="Écouter le passage à transformer"
                      />
                    )}
                  </div>
                )}
                <a className="vs-inline-link" href="/outils#tool-audio-trim">
                  Besoin d’un extrait ? Ouvrir les outils audio{" "}
                  <ChevronRight size={13} />
                </a>
              </div>
            ) : (
              <div className="vs-text-mode">
                <div className="vs-mode-explanation">
                  <span>FAIRE PARLER TA VOIX</span>
                  <h4>Une phrase, à ta façon.</h4>
                  <p>
                    Écris un court texte. Le studio crée une voix parlée à
                    partir de ta référence; il ne compose pas de chanson à
                    partir du texte.
                  </p>
                </div>
                <label htmlFor="vs-text">Le texte à prononcer</label>
                <textarea
                  id="vs-text"
                  value={text}
                  maxLength={400}
                  disabled={active}
                  placeholder="Bonjour, ici Manix. Bienvenue dans notre atelier de création vocale."
                  onChange={event => setText(event.target.value)}
                />
                <div className="vs-text-footer">
                  <button
                    disabled={active}
                    onClick={() =>
                      setText(
                        "Bonjour, ici le studio Manix. Ta voix prend les commandes. Ensemble, donnons vie à ta prochaine création."
                      )
                    }
                  >
                    Insérer un exemple
                  </button>
                  <span>{text.length} / 400 caractères</span>
                </div>
              </div>
            )}
            <div className="vs-mode-limit">
              <CircleAlert size={15} />
              <p>
                Le résultat dépend de la qualité des deux enregistrements. La
                conversion de timbre ne corrige pas automatiquement les paroles,
                les fausses notes ou un mixage dégradé.
              </p>
            </div>
          </section>
        </div>
        <div className="vs-launch">
          <div>
            <label className="vs-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={active}
                onChange={event => setConsent(event.target.checked)}
              />
              <span>
                J’utilise ma propre voix ou une voix pour laquelle j’ai
                l’autorisation, ainsi qu’un contenu audio que je peux
                transformer.
              </span>
            </label>
            <p>
              <ShieldCheck size={13} /> Les fichiers sont envoyés à l’AGX pour
              le traitement. Conservation maximale : 24 h; tu peux supprimer ton
              essai.
            </p>
          </div>
          <div className="vs-launch-action">
            <button
              className="vs-create"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {submitting ? (
                <LoaderCircle size={18} className="vs-spin" />
              ) : (
                <WandSparkles size={18} />
              )}
              {submitting
                ? "Envoi au studio…"
                : processing
                  ? "Création en cours…"
                  : "Créer mon extrait"}
            </button>
            <span>
              {submitting
                ? "L’envoi dépend du poids des fichiers et de ta connexion."
                : processing
                  ? "Le suivi du traitement est affiché ci-dessous."
                  : missing}
            </span>
          </div>
        </div>
        {(inputError || message) && (
          <div
            className={`vs-feedback ${inputError ? "error" : ""}`}
            role={inputError ? "alert" : "status"}
          >
            {inputError ? <CircleAlert size={17} /> : <Check size={17} />}
            <p>{inputError || message}</p>
          </div>
        )}
      </section>
      {(jobId || pollError) && (
        <section
          className={`vs-job ${job?.status === "completed" ? "completed" : ""}`}
          aria-label="Résultat et suivi de la création"
        >
          <div className="vs-job-heading">
            <div>
              <span className="vs-eyebrow">TON ESSAI VOCAL</span>
              <h2>
                {job?.status === "completed"
                  ? "Ton extrait est prêt."
                  : job?.status === "failed"
                    ? "Le traitement s’est arrêté."
                    : job?.status === "queued"
                      ? "Ton extrait attend son tour."
                      : "Le studio travaille sur ta voix."}
              </h2>
            </div>
            {jobId && (
              <button
                className="vs-delete-job"
                disabled={deleting || submitting}
                onClick={() => void deleteJob()}
              >
                {deleting ? (
                  <LoaderCircle size={15} className="vs-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                {deleting
                  ? "Suppression…"
                  : processing
                    ? "Annuler et supprimer"
                    : "Supprimer cet essai"}
              </button>
            )}
          </div>
          {pollError && (
            <div className="vs-feedback error" role="status">
              <CircleAlert size={17} />
              <p>{pollError}</p>
              {jobId && (
                <button
                  onClick={() => {
                    setPollNonce(value => value + 1);
                    void checkHealth();
                  }}
                >
                  Réessayer le suivi
                </button>
              )}
            </div>
          )}
          {processing && (
            <div className="vs-processing">
              <div className="vs-job-stage">
                <LoaderCircle size={18} className="vs-spin" />
                <strong>
                  {job?.stage ||
                    (job?.status === "queued"
                      ? "En attente du moteur"
                      : "Récupération du suivi…")}
                </strong>
                {typeof job?.queue_position === "number" &&
                  job.queue_position > 0 && (
                    <span>Position {job.queue_position}</span>
                  )}
                {progress !== undefined && <b>{Math.round(progress)}%</b>}
              </div>
              <progress
                aria-label="Progression communiquée par le moteur"
                max={100}
                value={progress}
              />
              <p>
                La conversion est calculée sur l’AGX. Le temps varie selon
                l’extrait et la file d’attente. Tu peux revenir dans cet onglet
                pour retrouver le suivi.
              </p>
            </div>
          )}
          {job?.status === "failed" && (
            <div className="vs-feedback error" role="alert">
              <CircleAlert size={18} />
              <p>
                {job.error ||
                  "Le moteur n’a pas pu terminer cet extrait. Supprime cet essai puis recommence avec une référence plus claire."}
              </p>
            </div>
          )}
          {job?.status === "completed" && (
            <div className="vs-result">
              <div className="vs-result-art" aria-hidden="true">
                <AudioLines size={40} />
                <span>
                  MANIX
                  <br />
                  VOICE STUDIO
                </span>
              </div>
              <div className="vs-result-main">
                <div>
                  <span className="vs-result-ready">
                    <Check size={13} /> CRÉATION TERMINÉE
                  </span>
                  <strong>
                    {job.duration_seconds
                      ? `Ton extrait · ${durationLabel(job.duration_seconds)}`
                      : "Écoute ta nouvelle interprétation"}
                  </strong>
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={resultAudioUrl}
                  aria-label="Écouter le résultat avec ma voix"
                  onError={() =>
                    setPollError(
                      "L’aperçu audio n’a pas pu être lu. Essaie le téléchargement WAV ou réessaie le suivi."
                    )
                  }
                />
                <div className="vs-result-actions">
                  <button
                    disabled={Boolean(downloadBusy)}
                    onClick={() => void download("mp3")}
                  >
                    {downloadBusy === "mp3" ? (
                      <LoaderCircle size={15} className="vs-spin" />
                    ) : (
                      <ArrowDownToLine size={15} />
                    )}{" "}
                    Télécharger MP3
                  </button>
                  <button
                    disabled={Boolean(downloadBusy)}
                    onClick={() => void download("wav")}
                  >
                    {downloadBusy === "wav" ? (
                      <LoaderCircle size={15} className="vs-spin" />
                    ) : (
                      <ArrowDownToLine size={15} />
                    )}{" "}
                    WAV pour le montage
                  </button>
                </div>
                <p>
                  {validExpiration
                    ? `Disponible jusqu’au ${validExpiration}. Télécharge ta copie pour la conserver.`
                    : "Télécharge ta copie avant la suppression automatique, au plus tard 24 h après la création."}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      <section className="vs-how" id="voice-how-it-works">
        <div className="vs-section-heading">
          <div>
            <span className="vs-eyebrow">UN BON EXTRAIT COMMENCE ICI</span>
            <h2>Trois gestes. Une vraie voix.</h2>
          </div>
        </div>
        <div className="vs-how-grid">
          <article>
            <b>01 / RÉFÉRENCE</b>
            <Mic size={22} />
            <h3>Fais connaître ta voix.</h3>
            <p>
              Enregistre 5 à 30 secondes ou importe un fichier propre. Parle ou
              chante naturellement, près du micro, avec une seule voix et peu de
              bruit.
            </p>
          </article>
          <article>
            <b>02 / CONTENU</b>
            <AudioLines size={22} />
            <h3>Choisis ton interprétation.</h3>
            <p>
              Pour une reprise, utilise un passage vocal que tu as le droit de
              transformer. Pour une phrase, passe en mode texte. Cette bêta ne
              traite pas encore un morceau complet.
            </p>
          </article>
          <article>
            <b>03 / CRÉATION</b>
            <Headphones size={22} />
            <h3>Écoute, compare, garde.</h3>
            <p>
              Le moteur adapte le timbre à ta référence. Écoute le résultat puis
              télécharge un MP3 pour le partage ou un WAV pour ton logiciel de
              montage.
            </p>
          </article>
        </div>
        <div className="vs-faq">
          <details>
            <summary>
              Est-ce que mes fichiers restent dans mon navigateur ?
            </summary>
            <p>
              Non. Contrairement aux outils de conversion locaux du site, cet
              atelier envoie la référence, le passage audio ou le texte au
              moteur AGX. Le traitement y est effectué et les fichiers sont
              conservés au maximum 24 heures. Le bouton « Supprimer cet essai »
              permet de les effacer plus tôt. L’identifiant du dernier essai
              reste dans cet onglet pour reprendre le suivi.
            </p>
          </details>
          <details>
            <summary>Puis-je transformer une chanson complète ?</summary>
            <p>
              Cette première version est limitée à des extraits de 30 secondes.
              Commence par une courte piste vocale pour vérifier le rendu de ta
              voix. Le mode texte génère de la parole; il n’écrit pas une
              chanson et ne crée pas de mélodie automatiquement.
            </p>
          </details>
          <details>
            <summary>
              Pourquoi le résultat peut-il sembler différent de ma voix ?
            </summary>
            <p>
              Le moteur reconstruit le timbre à partir de ton enregistrement.
              Une référence trop courte, bruitée, accompagnée de musique ou très
              réverbérée peut réduire la ressemblance. Essaie plusieurs phrases
              naturelles, sans chuchoter ni forcer la voix, et une source au
              rythme proche.
            </p>
          </details>
          <details>
            <summary>Le moteur est hors ligne : que puis-je faire ?</summary>
            <p>
              Tu peux préparer et écouter tes fichiers sur cette page. Le
              lancement nécessite la disponibilité du moteur AGX. Utilise «
              Réessayer » lorsque le moteur revient; si une création était en
              cours, le suivi tente de reprendre automatiquement.
            </p>
          </details>
        </div>
      </section>
      <footer className="vs-footer">
        <a href="/outils">
          <ArrowLeft size={14} /> RETOUR AUX OUTILS
        </a>
        <span>MANIX VOICE STUDIO · BY MANIX</span>
        <a
          href="https://www.facebook.com/groups/757797724622219/"
          target="_blank"
          rel="noreferrer"
        >
          AVEC LE GROUPE KITT-FRANCO-BELGE ↗
        </a>
      </footer>
    </main>
  );
}
