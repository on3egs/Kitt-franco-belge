import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Bell, BellOff, CarFront, Check, CircleHelp, Download, FolderOpen, Link2, MessageCircle, Radio, Save, ShieldCheck, Smile, Trash2, Users, Volume2, Wifi, WifiOff, Zap } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./KittChat.css";

type Room = { id: string; label: string; topic: string };
type ChatLine = { id: string; name: string; text: string; timestamp: number; kind?: "system" | "message"; liveBot?: boolean };
type Member = { name: string; role?: string; admin?: boolean };
type PendingTurn = { speaker: "KITT" | "KARR"; expiresAt: number };
type BotStatus = "KITT" | "KARR";
type Owner = { id: string; name: string; car: string; year: string; photos: string[] };
type MemoryFrequency = "quiet" | "balanced" | "lively";
type MissionMemory = { notes: string; enabled: boolean; frequency: MemoryFrequency; voice: boolean };
type SpeechJob = { utterance: SpeechSynthesisUtterance; kind: "bot" | "arrival" };
const EMPTY_MISSION_MEMORY: MissionMemory = { notes: "", enabled: false, frequency: "balanced", voice: false };
type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};
type KittEmote = { code: string; label: string; src: string; aliases?: string[] };
const KNIGHT_RIDER_EMOTES: KittEmote[] = [
  { code: ":kitt:", label: "KITT", src: "/emotes/kitt.svg" },
  { code: ":karr:", label: "KARR", src: "/emotes/karr.svg" },
  { code: ":michael:", label: "Michael Knight", src: "/emotes/michael.svg" },
  { code: ":devon:", label: "Devon Miles", src: "/emotes/devon.svg" },
  { code: ":bonnie:", label: "Bonnie Barstow", src: "/emotes/bonnie.svg" },
  { code: ":rc3:", label: "RC3", src: "/emotes/rc3.svg" },
  { code: ":turbo:", label: "Turbo Boost", src: "/emotes/turbo-boost.svg" },
  { code: ":voicebox:", label: "Voicebox", src: "/emotes/voicebox.svg" },
  { code: ":flag:", label: "FLAG", src: "/emotes/flag.svg" },
  { code: ":transam:", label: "Pontiac Trans Am", src: "/emotes/trans-am.svg" },
  { code: ":)", label: "KITT sourit", src: "/emotes/kitt-smile.svg", aliases: [":-)"] },
  { code: ";)", label: "Clin d’œil de KITT", src: "/emotes/kitt-wink.svg", aliases: [";-)"] },
  { code: ":P", label: "KITT taquine", src: "/emotes/kitt-tongue.svg", aliases: [":-P", ":p", ":-p"] },
  { code: ":D", label: "KITT éclate de rire", src: "/emotes/kitt-laugh.svg", aliases: [":-D", ":d", ":-d"] },
  { code: ":(", label: "KITT déçu", src: "/emotes/kitt-sad.svg", aliases: [":-("] },
  { code: ":'(", label: "KITT ému", src: "/emotes/kitt-tear.svg" },
  { code: ":O", label: "KITT surpris", src: "/emotes/kitt-surprise.svg", aliases: [":-O", ":o", ":-o"] },
  { code: "<3", label: "Cœur de KITT", src: "/emotes/kitt-heart.svg", aliases: ["♥"] },
];
const EMOTES_BY_CODE = new Map(KNIGHT_RIDER_EMOTES.flatMap(emote =>
  [emote.code, ...(emote.aliases ?? [])].map(code => [code.toLowerCase(), emote] as const),
));

function renderChatText(text: string) {
  const emotePattern = /(?<![/@])(:[a-z0-9-]+:|:-?[)pPdDoO]|;\)|;-\)|:\(|:-\(|:'\(|<3|♥)(?![\w@])/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = emotePattern.exec(text)) !== null) {
    const start = match.index ?? 0;
    const part = match[0];
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const emote = EMOTES_BY_CODE.get(part.toLowerCase());
    const prefix = text.slice(0, start);
    const insideUrl = /(?:https?:\/\/|www\.)[^\s]*$/i.test(prefix);
    nodes.push(emote && !insideUrl
      ? <img key={`emote-${start}`} className="kc-inline-emote" src={emote.src} alt={`[${emote.label}]`} title={emote.label} loading="lazy" />
      : part);
    cursor = start + part.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
const FALLBACK_ROOMS: Room[] = [
  { id: "general", label: "Le grand salon", topic: "Le rendez-vous de toute la communauté" },
  { id: "atelier", label: "Garage & répliques", topic: "Pontiac, restauration et KITT" },
  { id: "electronique", label: "Électronique", topic: "LED, capteurs et projets maison" },
  { id: "radio", label: "Radio KITT", topic: "Musique et souvenirs de la série" },
];
const SESSION_KEY = "kitt-msn-chat-session-v1";
const COMMUNITY_ACCESS_CODE = "1982";
const ARRIVAL_VOICE_KEY = "kitt-msn-arrival-voice-v1";

function clockLabel(timestamp: number) {
  return new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function identityTone(name: string) {
  const normalized = name.trim().toLocaleLowerCase("fr-BE");
  if (normalized === "manix") return "manix";
  if (normalized === "kitt") return "kitt";
  if (normalized === "karr") return "karr";
  return "";
}

export default function KittChat() {
  const [apiBase, setApiBase] = useState("");
  const [service, setService] = useState<"checking" | "online" | "offline">("checking");
  const [socketState, setSocketState] = useState<"closed" | "connecting" | "online">("closed");
  const [rooms, setRooms] = useState<Room[]>(FALLBACK_ROOMS);
  const [room, setRoom] = useState(FALLBACK_ROOMS[0]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [member, setMember] = useState("");
  const [invite, setInvite] = useState(COMMUNITY_ACCESS_CODE);
  const [sessionToken, setSessionToken] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [typedBotText, setTypedBotText] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState(false);
  const [arrivalVoiceEnabled, setArrivalVoiceEnabled] = useState(false);
  const [arrivalVoiceVolume, setArrivalVoiceVolume] = useState(75);
  const [arrivalVoiceStatus, setArrivalVoiceStatus] = useState("");
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [roomToast, setRoomToast] = useState("");
  const [buzzActive, setBuzzActive] = useState(false);
  const [buzzIntensity, setBuzzIntensity] = useState<"normal" | "hyper">("normal");
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [turnRemaining, setTurnRemaining] = useState(0);
  const [buzzCooldown, setBuzzCooldown] = useState(0);
  const [missionMemory, setMissionMemory] = useState<MissionMemory>(EMPTY_MISSION_MEMORY);
  const [savedVoicePreference, setSavedVoicePreference] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryFeedback, setMemoryFeedback] = useState("");
  const [memoryFeedbackError, setMemoryFeedbackError] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const messageBox = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const roomToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const botStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceMessageIds = useRef<Set<string>>(new Set());
  const voiceEnabled = useRef(false);
  const arrivalVoiceEnabledRef = useRef(false);
  const arrivalVoiceVolumeRef = useRef(75);
  const speechQueue = useRef<SpeechJob[]>([]);
  const activeSpeech = useRef<SpeechJob | null>(null);
  const announcedJoinIds = useRef<string[]>([]);
  const memoryEditRevision = useRef(0);
  const voicePreferenceTouched = useRef(false);
  const isMember = Boolean(sessionToken);

  function showMemoryFeedback(text: string, isError = false) {
    setMemoryFeedback(text);
    setMemoryFeedbackError(isError);
  }

  useEffect(() => {
    const line = lines.find(item => item.liveBot && (typedBotText[item.id] ?? "").length < item.text.length);
    if (!line) return;
    const nextLength = (typedBotText[line.id] ?? "").length + 1;
    const latestChar = line.text[nextLength - 1];
    const delay = /[.!?…]/.test(latestChar) ? 260 : /[,;:]/.test(latestChar) ? 120 : 29;
    const timer = window.setTimeout(() => {
      if (nextLength >= line.text.length) {
        setTypedBotText(current => { const next = { ...current }; delete next[line.id]; return next; });
        setLines(current => current.map(item => item.id === line.id ? { ...item, liveBot: false } : item));
      } else {
        setTypedBotText(current => ({ ...current, [line.id]: line.text.slice(0, nextLength) }));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [lines, typedBotText]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const base = await getApiBase();
        if (!base) throw new Error("Relais communautaire introuvable.");
        const [statusResponse, ownersResponse] = await Promise.all([
          fetch(`${base}/api/kitt-chat/status`, { cache: "no-store" }),
          fetch(`${base}/api/pontiac-owners/approved`, { cache: "no-store" }),
        ]);
        if (!statusResponse.ok) throw new Error("Le salon n’est pas encore relié au serveur.");
        const statusData = await statusResponse.json();
        if (!Array.isArray(statusData.rooms)) throw new Error("Réponse invalide du salon.");
        const ownersData = ownersResponse.ok ? await ownersResponse.json() : { approved: [] };
        const approved = Array.isArray(ownersData.approved)
          ? (ownersData.approved as Owner[]).filter(owner => owner.id && owner.name && Array.isArray(owner.photos) && owner.photos.length > 0)
          : [];
        if (!active) return;
        const availableRooms = statusData.rooms as Room[];
        setApiBase(base);
        setRooms(availableRooms);
        setRoom(availableRooms[0] || FALLBACK_ROOMS[0]);
        setOwners(approved);
        setOwnerId(approved[0]?.id || "");
        setService("online");
        try {
          const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { token?: string; name?: string; ownerId?: string };
            if (parsed.token && parsed.name && parsed.ownerId && approved.some(owner => owner.id === parsed.ownerId)) {
              localStorage.setItem(SESSION_KEY, saved);
              sessionStorage.removeItem(SESSION_KEY);
              setSessionToken(parsed.token);
              setMember(parsed.name);
              setOwnerId(parsed.ownerId);
            } else if (saved) { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
          }
        } catch { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
      } catch {
        if (active) setService("offline");
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { soundEnabled.current = sound; }, [sound]);
  useEffect(() => { voiceEnabled.current = missionMemory.voice; }, [missionMemory.voice]);
  useEffect(() => {
    if (!member) return;
    let saved: { enabled?: boolean; volume?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(`${ARRIVAL_VOICE_KEY}:${member.toLocaleLowerCase("fr-BE")}`) || "null"); } catch { saved = null; }
    const enabled = typeof saved?.enabled === "boolean" ? saved.enabled : identityTone(member) === "manix";
    const volume = typeof saved?.volume === "number" ? Math.max(0, Math.min(100, Math.round(saved.volume))) : 75;
    setArrivalVoiceEnabled(enabled); arrivalVoiceEnabledRef.current = enabled;
    setArrivalVoiceVolume(volume); arrivalVoiceVolumeRef.current = volume;
    setArrivalVoiceStatus("");
  }, [member]);
  useEffect(() => { arrivalVoiceEnabledRef.current = arrivalVoiceEnabled; }, [arrivalVoiceEnabled]);
  useEffect(() => { arrivalVoiceVolumeRef.current = arrivalVoiceVolume; }, [arrivalVoiceVolume]);

  useEffect(() => {
    if (!apiBase || !sessionToken) return;
    const controller = new AbortController();
    const revisionAtStart = memoryEditRevision.current;
    voicePreferenceTouched.current = false;
    setMemoryBusy(true);
    showMemoryFeedback("Chargement du dossier...");
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/kitt-chat/memory`, {
          method: "GET",
          headers: { Authorization: `Bearer ${sessionToken}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Le dossier n'a pas pu etre charge.";
          throw new Error(detail);
        }
        if (controller.signal.aborted) return;
        const loaded = normalizeMissionMemory(data);
        setSavedVoicePreference(loaded.voice);
        loaded.voice = false; // Consentement vocal local a reactiver a chaque visite.
        if (memoryEditRevision.current === revisionAtStart) {
          setMissionMemory(loaded);
          showMemoryFeedback("Dossier charge. La voix reste desactivee jusqu'a son activation sur cet appareil.");
        } else {
          showMemoryFeedback("Le dossier a ete charge sans remplacer tes modifications en cours. Utilise Charger pour les remplacer volontairement.");
        }
      } catch (cause) {
        if (!controller.signal.aborted) showMemoryFeedback(cause instanceof Error ? cause.message : "Impossible de charger le dossier.", true);
      } finally {
        if (!controller.signal.aborted) setMemoryBusy(false);
      }
    })();
    return () => controller.abort();
  }, [apiBase, sessionToken]);

  function pumpSpeechQueue() {
    if (activeSpeech.current || !speechQueue.current.length) return;
    const job = speechQueue.current.shift();
    if (!job) return;
    activeSpeech.current = job;
    const originalEnd = job.utterance.onend;
    const originalError = job.utterance.onerror;
    const finish = () => {
      if (activeSpeech.current !== job) return;
      activeSpeech.current = null;
      window.setTimeout(pumpSpeechQueue, 40);
    };
    job.utterance.onend = event => { originalEnd?.call(job.utterance, event); finish(); };
    job.utterance.onerror = event => { originalError?.call(job.utterance, event); finish(); };
    try { window.speechSynthesis.speak(job.utterance); }
    catch {
      activeSpeech.current = null;
      if (job.kind === "arrival") setArrivalVoiceStatus("Le navigateur a bloqué la voix. Clique sur « Tester l’annonce » pour l’activer.");
      window.setTimeout(pumpSpeechQueue, 40);
    }
  }

  function enqueueSpeech(utterance: SpeechSynthesisUtterance, kind: SpeechJob["kind"]) {
    speechQueue.current.push({ utterance, kind });
    pumpSpeechQueue();
  }

  function cancelSpeechKind(kind: SpeechJob["kind"]) {
    speechQueue.current = speechQueue.current.filter(job => job.kind !== kind);
    if (activeSpeech.current?.kind === kind) {
      activeSpeech.current = null;
      try { window.speechSynthesis?.cancel(); } catch { /* Voix optionnelle selon le navigateur. */ }
      window.setTimeout(pumpSpeechQueue, 40);
    }
  }

  function cancelArrivalSpeech() { cancelSpeechKind("arrival"); }

  function stopRoomVoice() {
    voiceMessageIds.current.clear();
    speechQueue.current = [];
    activeSpeech.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* La voix reste facultative selon le navigateur. */ }
  }

  function saveArrivalVoicePreference(enabled: boolean, volume = arrivalVoiceVolumeRef.current) {
    const safeVolume = Math.max(0, Math.min(100, Math.round(volume)));
    setArrivalVoiceEnabled(enabled); arrivalVoiceEnabledRef.current = enabled;
    setArrivalVoiceVolume(safeVolume); arrivalVoiceVolumeRef.current = safeVolume;
    if (member) {
      try { localStorage.setItem(`${ARRIVAL_VOICE_KEY}:${member.toLocaleLowerCase("fr-BE")}`, JSON.stringify({ enabled, volume: safeVolume })); } catch { /* Le réglage reste actif pour cette visite. */ }
    }
    if (!enabled) {
      cancelArrivalSpeech();
      setArrivalVoiceStatus("Annonces vocales désactivées.");
    } else {
      setArrivalVoiceStatus("Annonces vocales activées pour les prochaines arrivées.");
    }
  }

  function announceMemberJoined(id: string, rawName: string) {
    const name = rawName.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!id || !name || name.toLocaleLowerCase("fr-BE") === member.trim().toLocaleLowerCase("fr-BE")) return false;
    if (announcedJoinIds.current.includes(id)) return false;
    announcedJoinIds.current.push(id);
    if (announcedJoinIds.current.length > 200) announcedJoinIds.current.splice(0, announcedJoinIds.current.length - 200);
    showRoomToast(`${name} vient de rejoindre le salon.`);
    playRoomSound("join");
    if (!arrivalVoiceEnabledRef.current) return true;
    if (typeof window.SpeechSynthesisUtterance !== "function" || !window.speechSynthesis) {
      setArrivalVoiceStatus("La synthèse vocale n’est pas disponible dans ce navigateur.");
      return true;
    }
    const synthesis = window.speechSynthesis;
    const waitingArrivals = speechQueue.current.filter(job => job.kind === "arrival").length + (activeSpeech.current?.kind === "arrival" ? 1 : 0);
    if (waitingArrivals >= 3) {
      setArrivalVoiceStatus("Plusieurs membres arrivent : les annonces vocales en attente sont limitées.");
      return true;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(`${name} vient de se connecter au chat Rider.`);
      const frenchVoice = synthesis.getVoices().find(voice => /^fr(?:-|$)/i.test(voice.lang));
      utterance.lang = frenchVoice?.lang || "fr-FR";
      if (frenchVoice) utterance.voice = frenchVoice;
      utterance.volume = arrivalVoiceVolumeRef.current / 100;
      utterance.rate = 0.96;
      utterance.onerror = event => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setArrivalVoiceStatus("Le navigateur a bloqué l’annonce. Clique sur « Tester l’annonce » pour activer la voix.");
        }
      };
      enqueueSpeech(utterance, "arrival");
    } catch {
      setArrivalVoiceStatus("La synthèse vocale n’est pas disponible dans ce navigateur.");
    }
    return true;
  }

  function clearBotStatus() {
    if (botStatusTimer.current) clearTimeout(botStatusTimer.current);
    botStatusTimer.current = null;
    setBotStatus(null);
  }

  function showBotStatus(speaker: BotStatus) {
    if (botStatusTimer.current) clearTimeout(botStatusTimer.current);
    setBotStatus(speaker);
    botStatusTimer.current = setTimeout(() => {
      botStatusTimer.current = null;
      setBotStatus(null);
    }, 30_000);
  }

  useEffect(() => {
    if (!missionMemory.voice) return;
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
    for (const line of lines) {
      if (line.liveBot || !voiceMessageIds.current.has(line.id)) continue;
      voiceMessageIds.current.delete(line.id);
      const text = line.text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        const frenchVoice = synthesis.getVoices().find(voice => /^fr(?:-|$)/i.test(voice.lang));
        utterance.lang = frenchVoice?.lang || "fr-FR";
        if (frenchVoice) utterance.voice = frenchVoice;
        utterance.rate = 0.96;
        utterance.pitch = identityTone(line.name) === "karr" ? 0.84 : 1;
        utterance.onerror = event => {
          if (event.error !== "canceled" && event.error !== "interrupted") {
            showMemoryFeedback("La voix du navigateur n’a pas pu lire ce message. Vérifie la sortie audio et les voix françaises installées.", true);
          }
        };
        enqueueSpeech(utterance, "bot");
      } catch {
        showMemoryFeedback("La synthèse vocale n’est pas disponible dans ce navigateur.", true);
      }
    }
  }, [lines, missionMemory.voice]);

  useEffect(() => {
    if (!pendingTurn) { setTurnRemaining(0); return; }
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((pendingTurn.expiresAt - Date.now()) / 1000));
      setTurnRemaining(remaining);
      if (remaining === 0) setPendingTurn(null);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [pendingTurn]);

  function playRoomSound(kind: "message" | "join" | "buzz" | "hyper-buzz" | "test") {
    if (!soundEnabled.current) return;
    try {
      audio.current ||= new AudioContext();
      const context = audio.current;
      if (context.state === "suspended") void context.resume();
      const notes = kind === "hyper-buzz" ? [330, 220, 294, 165] : kind === "buzz" ? [220, 165] : kind === "join" || kind === "test" ? [660, 880] : [700];
      const startAt = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const isBuzz = kind === "buzz" || kind === "hyper-buzz";
        const noteStart = startAt + index * (kind === "hyper-buzz" ? 0.12 : isBuzz ? 0.16 : 0.14);
        const noteLength = kind === "hyper-buzz" ? 0.18 : isBuzz ? 0.22 : kind === "test" || kind === "join" ? 0.16 : 0.11;
        const peak = kind === "hyper-buzz" ? 0.19 : kind === "buzz" ? 0.16 : kind === "test" ? 0.12 : kind === "join" ? 0.095 : 0.07;
        oscillator.type = isBuzz ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(peak, noteStart + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteLength);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + noteLength + 0.01);
      });
    } catch { /* Les sons restent facultatifs selon le navigateur. */ }
  }

  function showRoomToast(text: string) {
    setRoomToast(text);
    if (roomToastTimer.current) clearTimeout(roomToastTimer.current);
    roomToastTimer.current = setTimeout(() => setRoomToast(""), 4500);
  }

  function triggerBuzzEffect(intensity: "normal" | "hyper" = "normal") {
    setBuzzActive(false);
    setBuzzIntensity(intensity);
    window.requestAnimationFrame(() => setBuzzActive(true));
    if (buzzTimer.current) clearTimeout(buzzTimer.current);
    buzzTimer.current = setTimeout(() => setBuzzActive(false), 1600);
  }

  useEffect(() => {
    if (!apiBase || service !== "online") return;
    const endpoint = new URL("/api/kitt-chat/ws", apiBase);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    const client = new WebSocket(endpoint);
    socket.current = client;
    setSocketState("connecting");
    client.onopen = () => client.send(JSON.stringify(
      isMember
        ? { type: "auth", token: sessionToken, room: room.id }
        : { type: "guest", room: room.id },
    ));
    client.onmessage = event => {
      let packet: Record<string, unknown>;
      try { packet = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
      if (packet.type === "ready") {
        clearBotStatus();
        setSocketState("online");
        setTypedBotText({});
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []);
        return;
      }
      if (packet.type === "presence") { setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []); return; }
      if (packet.type === "member_joined") {
        if (typeof packet.id === "string" && typeof packet.name === "string") announceMemberJoined(packet.id, packet.name);
        return;
      }
      if (packet.type === "bot_status") {
        if (packet.active === true && (packet.speaker === "KITT" || packet.speaker === "KARR")) showBotStatus(packet.speaker);
        else if (packet.active === false) clearBotStatus();
        return;
      }
      if (packet.type === "buzz") {
        const sender = typeof packet.name === "string" ? packet.name : "Un membre";
        const hyper = packet.intensity === "hyper";
        if (sender !== member) {
          triggerBuzzEffect(hyper ? "hyper" : "normal");
          showRoomToast(hyper ? `BUZZ HYPER de ${sender} — secoue le salon !` : `${sender} vous fait signe avec un Buzz KITT !`);
          playRoomSound(hyper ? "hyper-buzz" : "buzz");
        }
        return;
      }
      if (packet.type === "show") {
        const participants = Array.isArray(packet.participants)
          ? packet.participants.filter((name): name is string => typeof name === "string" && ["KITT", "KARR"].includes(name.toUpperCase()))
          : [];
        const names = participants.map(name => name.toUpperCase()).filter((name, index, all) => all.indexOf(name) === index);
        if (names.length) showRoomToast(`Joute ${names.join("–")} en cours !`);
        return;
      }
      if (packet.type === "turn") {
        if (packet.active === true && (packet.speaker === "KITT" || packet.speaker === "KARR") && typeof packet.expiresAt === "number") {
          const expiresAt = packet.expiresAt < 10_000_000_000 ? packet.expiresAt * 1000 : packet.expiresAt;
          setPendingTurn(expiresAt > Date.now() ? { speaker: packet.speaker, expiresAt } : null);
        } else if (packet.active === false) {
          setPendingTurn(null);
        }
        return;
      }
      if (packet.type === "message" && packet.message && typeof packet.message === "object") {
        const incoming = packet.message as ChatLine;
        const line: ChatLine = { ...incoming, liveBot: incoming.kind !== "system" && ["kitt", "karr"].includes(identityTone(incoming.name)) };
        if (line.liveBot && voiceEnabled.current) voiceMessageIds.current.add(line.id);
        setLines(current => [...current.slice(-98), line]);
        if (line.kind === "system" && line.text.endsWith(" entre dans le salon.")) {
          const joinedName = line.text.slice(0, -" entre dans le salon.".length);
          announceMemberJoined(line.id, joinedName);
        } else if (line.name !== member && line.kind !== "system") {
          playRoomSound("message");
        }
        return;
      }
      if (packet.type === "room") {
        clearBotStatus();
        stopRoomVoice();
        setTypedBotText({});
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setPendingTurn(null);
        setRoom(rooms.find(item => item.id === packet.room) || FALLBACK_ROOMS[0]);
        return;
      }
      if (packet.type === "error") setError(typeof packet.message === "string" ? packet.message : "Message refusé.");
    };
    client.onerror = () => setError("Connexion interrompue. Vérifie le relais et réessaie.");
    client.onclose = event => {
      clearBotStatus();
      stopRoomVoice();
      if (socket.current === client) { socket.current = null; setSocketState("closed"); }
      if (event.code === 4001 && isMember) {
        setSessionToken(""); setMember("");
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        setError("La session ou le profil Pontiac n’est plus valide. Contacte Manix après l’approbation du profil.");
      } else if (event.code === 1013) setError("Le salon est momentanément complet. Réessaie dans un instant.");
    };
    return () => {
      clearBotStatus();
      stopRoomVoice();
      if (socket.current === client) socket.current = null;
      client.close(1000, "Navigation");
    };
    // The room changes through a switch packet so browsing channels does not reconnect the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, service, isMember, sessionToken, member, reconnectKey]);

  useEffect(() => {
    if (socketState === "online") socket.current?.send(JSON.stringify({ type: "switch", room: room.id }));
  }, [room.id, socketState]);
  useEffect(() => { if (messageBox.current) messageBox.current.scrollTop = messageBox.current.scrollHeight; }, [lines]);
  useEffect(() => () => {
    if (roomToastTimer.current) clearTimeout(roomToastTimer.current);
    if (buzzTimer.current) clearTimeout(buzzTimer.current);
    if (buzzCooldownTimer.current) clearInterval(buzzCooldownTimer.current);
    clearBotStatus();
    stopRoomVoice();
    void audio.current?.close();
  }, []);

  function disconnect() {
    clearBotStatus();
    stopRoomVoice();
    socket.current?.close(1000, "Déconnexion");
    socket.current = null;
    setSocketState("closed"); setLines([]); setMembers([]);
  }

  function forgetDevice() {
    clearBotStatus();
    stopRoomVoice();
    socket.current?.close(1000, "Oubli de cet appareil");
    socket.current = null;
    localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
    setSessionToken(""); setMember(""); setSocketState("closed"); setLines([]); setMembers([]);
    setMissionMemory(EMPTY_MISSION_MEMORY); setSavedVoicePreference(false); voicePreferenceTouched.current = false; showMemoryFeedback("");
  }

  async function enter(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiBase || !ownerId || !invite.trim()) {
      setError("Choisis ton profil Pontiac approuvé et utilise le code commun 1982.");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite: invite.trim(), ownerId }),
      });
      const data = await response.json();
      if (!response.ok || !data.token || !data.name || data.ownerId !== ownerId) {
        throw new Error(data.error || "Profil ou invitation refusé.");
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, name: data.name, ownerId: data.ownerId }));
      sessionStorage.removeItem(SESSION_KEY);
      setMember(data.name); setSessionToken(data.token); setNotice("Profil Pontiac vérifié. Bienvenue ! Ton accès au salon est permanent sur ce profil."); setInvite(COMMUNITY_ACCESS_CODE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de rejoindre le salon.");
    }
  }

  function normalizeMissionMemory(value: unknown): MissionMemory {
    const data = value && typeof value === "object" ? value as Partial<MissionMemory> : {};
    const frequency: MemoryFrequency = data.frequency === "quiet" || data.frequency === "lively" ? data.frequency : "balanced";
    return {
      notes: typeof data.notes === "string" ? data.notes.slice(0, 2000) : "",
      enabled: data.enabled === true,
      frequency,
      voice: data.voice === true,
    };
  }

  async function missionMemoryRequest(method: "GET" | "PUT" | "DELETE") {
    if (!apiBase || !sessionToken) {
      showMemoryFeedback("Reconnecte-toi au salon pour gérer ton dossier.", true);
      return;
    }
    const revisionAtStart = memoryEditRevision.current;
    const memoryToSave = method === "PUT"
      ? { ...missionMemory, voice: voicePreferenceTouched.current ? missionMemory.voice : savedVoicePreference }
      : missionMemory;
    setMemoryBusy(true);
    showMemoryFeedback(method === "GET" ? "Chargement du dossier…" : method === "PUT" ? "Enregistrement du dossier…" : "Effacement du dossier…");
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/memory`, {
        method,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "PUT" ? { body: JSON.stringify(memoryToSave) } : {}),
        cache: "no-store",
      });
      let data: unknown = null;
      if (response.status !== 204) {
        try { data = await response.json(); } catch { data = null; }
      }
      if (!response.ok) {
        const detail = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "La demande a été refusée par le serveur.";
        throw new Error(detail);
      }
      if (method === "DELETE") {
        stopRoomVoice();
        voicePreferenceTouched.current = false;
        memoryEditRevision.current += 1;
        setMissionMemory(EMPTY_MISSION_MEMORY);
        setSavedVoicePreference(false);
        showMemoryFeedback("Dossier effacé. Les notes et options sont revenues aux réglages par défaut.");
      } else if (method === "GET") {
        const loaded = normalizeMissionMemory(data);
        setSavedVoicePreference(loaded.voice);
        loaded.voice = false;
        if (memoryEditRevision.current !== revisionAtStart) {
          showMemoryFeedback("Le chargement n'a pas remplacÃ© tes modifications en cours.");
          return;
        }
        voicePreferenceTouched.current = false;
        if (loaded.voice && !speechVoiceAvailable()) {
          loaded.voice = false;
          showMemoryFeedback("Dossier chargé, mais la synthèse vocale n’est pas disponible dans ce navigateur. Désactive l’option Voix.", true);
        } else {
          showMemoryFeedback("Dossier chargé depuis le serveur.");
        }
        setMissionMemory(loaded);
      } else {
        const saved = normalizeMissionMemory(data ?? missionMemory);
        setSavedVoicePreference(saved.voice);
        if (saved.voice && !speechVoiceAvailable()) {
          saved.voice = false;
          showMemoryFeedback("Dossier enregistré. La voix reste désactivée : la synthèse vocale n’est pas disponible dans ce navigateur.", true);
        } else {
          showMemoryFeedback("Dossier enregistré. Tes notes ne sont utilisées que si tu actives explicitement la mémoire.");
        }
        if (memoryEditRevision.current === revisionAtStart) {
          setMissionMemory({ ...saved, voice: missionMemory.voice });
        } else {
          showMemoryFeedback("Le dossier a été enregistré. Les changements faits pendant l’enregistrement restent dans le formulaire.");
        }
      }
    } catch (cause) {
      showMemoryFeedback(cause instanceof Error ? cause.message : "Impossible de contacter le service mémoire.", true);
    } finally {
      setMemoryBusy(false);
    }
  }

  function speechVoiceAvailable() {
    try {
      return typeof window.SpeechSynthesisUtterance === "function"
        && typeof window.speechSynthesis?.speak === "function";
    } catch { return false; }
  }

  function editMissionMemory(update: (current: MissionMemory) => MissionMemory) {
    memoryEditRevision.current += 1;
    setMissionMemory(update);
  }

  function toggleMissionVoice(enabled: boolean) {
    if (enabled && !speechVoiceAvailable()) {
      showMemoryFeedback("La synthèse vocale n’est pas disponible dans ce navigateur.", true);
      return;
    }
    if (!enabled) {
      voiceMessageIds.current.clear();
      cancelSpeechKind("bot");
    }
    voicePreferenceTouched.current = true;
    editMissionMemory(current => ({ ...current, voice: enabled }));
    showMemoryFeedback(enabled ? "Voix activée pour les prochains messages KITT/KARR. Enregistre pour garder ce réglage." : "Voix coupée; la lecture en cours a été arrêtée.");
  }

  function insertQuickPrompt(prompt: string) {
    setMessage(current => current.trim() ? `${current.trim()} ${prompt}` : prompt);
    requestAnimationFrame(() => document.getElementById("kc-message")?.focus());
  }

  function testArrivalVoice() {
    if (typeof window.SpeechSynthesisUtterance !== "function" || !window.speechSynthesis) {
      setArrivalVoiceStatus("La synthèse vocale n’est pas disponible dans ce navigateur.");
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance("Annonce de test. Pascal K Industry vient de se connecter au chat Rider.");
      const frenchVoice = window.speechSynthesis.getVoices().find(voice => /^fr(?:-|$)/i.test(voice.lang));
      utterance.lang = frenchVoice?.lang || "fr-FR";
      if (frenchVoice) utterance.voice = frenchVoice;
      utterance.volume = arrivalVoiceVolumeRef.current / 100;
      utterance.rate = 0.96;
      utterance.onerror = event => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setArrivalVoiceStatus("Lecture bloquée. Vérifie la voix française et le volume, puis clique encore sur « Tester l’annonce ».");
        }
      };
      setArrivalVoiceStatus("Test vocal en cours…");
      utterance.onend = () => setArrivalVoiceStatus("Test terminé. Les annonces d’arrivée sont prêtes.");
      enqueueSpeech(utterance, "arrival");
    } catch {
      setArrivalVoiceStatus("Le navigateur ne peut pas lancer la synthèse vocale.");
    }
  }

  function eraseMissionMemory() {
    if (!window.confirm("Effacer les notes et réglages de ton dossier de mission ?")) return;
    void missionMemoryRequest("DELETE");
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim().slice(0, 500);
    if (!clean || !isMember || socketState !== "online") return;
    socket.current?.send(JSON.stringify({ type: "message", text: clean }));
    setMessage("");
  }

  function sendBuzz() {
    if (!isMember || socketState !== "online" || buzzCooldown > 0) return;
    socket.current?.send(JSON.stringify({ type: "buzz" }));
    triggerBuzzEffect();
    playRoomSound("buzz");
    setBuzzCooldown(20);
    if (buzzCooldownTimer.current) clearInterval(buzzCooldownTimer.current);
    buzzCooldownTimer.current = setInterval(() => {
      setBuzzCooldown(remaining => {
        if (remaining <= 1) {
          if (buzzCooldownTimer.current) clearInterval(buzzCooldownTimer.current);
          buzzCooldownTimer.current = null;
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    showRoomToast("Buzz KITT envoyé. Le salon va vibrer !");
  }

  function addEmote(value: string) {
    setMessage(current => `${current}${current && !current.endsWith(" ") ? " " : ""}${value} `.slice(0, 500));
    setEmotesOpen(false);
    document.getElementById("kc-message")?.focus();
  }

  async function createDesktopShortcut() {
    const address = `${window.location.origin}/salon-kitt`;
    const shortcut = new Blob([`[InternetShortcut]\r\nURL=${address}\r\n`], { type: "application/internet-shortcut" });
    const saveWindow = window as SavePickerWindow;
    if (saveWindow.showSaveFilePicker) {
      try {
        const handle = await saveWindow.showSaveFilePicker({
          suggestedName: "Salon KITT.url",
          types: [{ description: "Raccourci Internet Windows", accept: { "application/octet-stream": [".url"] } }],
        });
        const writer = await handle.createWritable();
        await writer.write(shortcut);
        await writer.close();
        setNotice("Raccourci enregistré. Choisis le Bureau comme emplacement dans la fenêtre Windows.");
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }
    const href = URL.createObjectURL(shortcut);
    const link = document.createElement("a");
    link.href = href;
    link.download = "Salon KITT.url";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    setNotice("Raccourci téléchargé. Déplace Salon KITT.url sur le Bureau pour l’y retrouver.");
  }

  function toggleSound() {
    const next = !soundEnabled.current;
    soundEnabled.current = next;
    setSound(next);
    if (next) {
      try {
        audio.current ||= new AudioContext();
        void audio.current.resume().then(() => playRoomSound("test"));
      } catch { /* Audio indisponible dans ce navigateur. */ }
      setNotice("Test sonore joué. Les sons de messages, d’arrivée et de Buzz sont activés.");
    }
  }

  const headingStatus = service === "checking" ? "RECHERCHE DU RELAIS" : service === "online" ? "RELAIS PRÊT" : "SALON HORS LIGNE";

  return <main className="kc-page">
    <header className="kc-sitebar">
      <a href="/" className="kc-brand"><span className="kc-brand-led"/>KITT <small>FRANCO-BELGE</small></a>
      <a className="kc-world-link" href="/communaute-pontiac"><CarFront size={16}/> Globe Pontiac <ArrowRight size={14}/></a>
      <button type="button" className="kc-shortcut" onClick={() => void createDesktopShortcut()} title="Télécharger un raccourci Windows vers le salon"><Link2 size={14}/> Bureau</button>
      <a className="kc-admin-link" href="/admin-pontiac"><ShieldCheck size={14}/> Administration</a>
    </header>
    {roomToast && <div className="kc-room-toast" role="status" aria-live="polite"><span className="kc-toast-led"/>{roomToast}</div>}
    <section className="kc-intro">
      <div><p className="kc-eyebrow">KNIGHT RIDER COMMUNITY · EST. 1998</p><h1>Le salon <em>KITT</em></h1>
        <p>Viens découvrir l’ambiance sans compte. Pour participer, il faut être propriétaire d’une Pontiac et faire valider son profil avec une photo de la voiture sur le globe.</p>
      </div>
      <div className="kc-status"><span className={service === "online" ? "is-online" : ""}/><strong>{headingStatus}</strong>
        <small>{service === "online" ? "Visite libre · écriture réservée aux propriétaires validés" : "Le salon sera disponible lorsque le service sera relié."}</small>
      </div>
    </section>
    <div className={`kc-window${buzzActive ? " kc-buzz-effect" : ""}${buzzActive && buzzIntensity === "hyper" ? " kc-buzz-hyper" : ""}`}>
      <div className="kc-titlebar"><span className="kc-app-icon"><MessageCircle size={15}/></span><strong>KITT-FRANCO-BELGE · DES CHEVALIERS</strong><div className="kc-window-buttons"><span>−</span><span>□</span><span>×</span></div></div>
      <div className="kc-toolbar"><span>Fichier</span><span>Salon</span><span>Affichage</span><span>Aide</span><span className="kc-toolbar-right">KITT Network v1.0</span></div>
      {(service === "online" || socketState === "connecting") && <div className="kc-room-tabs" role="tablist" aria-label="Salons de discussion">
        {rooms.map(item => <button key={item.id} role="tab" aria-selected={room.id === item.id} className={room.id === item.id ? "active" : ""} onClick={() => setRoom(item)}>{item.label}</button>)}
      </div>}
      {socketState !== "closed" ? <div className="kc-content">
        <section className="kc-conversation" aria-label={`Messages du salon ${room.label}`}>
          <div className="kc-room-topic"><strong>{room.label}</strong><span>{room.topic}</span></div>
          {botStatus ? <div className={`kc-bot-status kc-bot-${botStatus.toLowerCase()}`} role="status" aria-live="polite">
            <span className="kc-bot-scanner" aria-hidden="true"><i/><i/><i/><i/><i/></span>
            <strong>{botStatus} pr&#233;pare sa r&#233;ponse&#8230;</strong>
          </div> : pendingTurn && <div className={`kc-turn-indicator kc-turn-${pendingTurn.speaker.toLowerCase()}`} role="status" aria-live="polite">
            <span className="kc-turn-led" aria-hidden="true"/>
            <strong>{pendingTurn.speaker} attend une réponse</strong>
            <span className="kc-turn-countdown" aria-hidden="true">{turnRemaining}s</span>
          </div>}
          <div className="kc-messages" ref={messageBox} role="log" aria-live="polite" aria-relevant="additions text">
            {socketState === "connecting" && <p className="kc-empty">Le salon s’ouvre…</p>}
            {socketState === "online" && !lines.length && <p className="kc-empty">Le salon s’éveille… Lance la conversation quand ton profil sera validé.</p>}
          {lines.map(line => {
            const displayedText = line.liveBot ? typedBotText[line.id] ?? "" : line.text;
            const typing = Boolean(line.liveBot && displayedText.length < line.text.length);
            return <article className={`kc-line${line.kind === "system" ? " system" : ""}${identityTone(line.name) ? ` kc-line-${identityTone(line.name)}` : ""}`} key={line.id} aria-live={line.liveBot ? "off" : undefined}>
              <time dateTime={new Date(line.timestamp).toISOString()}>{clockLabel(line.timestamp)}</time><strong className={identityTone(line.name)}>{line.name}</strong><span>{renderChatText(displayedText)}{typing && <i className="kc-type-cursor" aria-hidden="true"/>}</span>
            </article>})}
          </div>
          {isMember ? <form className="kc-compose" onSubmit={sendMessage}>
            <div className="kc-compose-row">
              <label className="kc-sr-only" htmlFor="kc-message">Ton message</label>
              <input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`Écrire dans ${room.label}…`} disabled={socketState !== "online"}/>
              <span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button>
            </div>
            <div className="kc-quick-prompts" role="group" aria-label="Questions rapides à insérer">
              <span>MISSIONS RAPIDES</span>
              <button type="button" onClick={() => insertQuickPrompt("KITT, aide-moi à préparer un diagnostic pour ma Pontiac. Pose-moi les questions une par une.")} disabled={socketState !== "online"}>Atelier technique</button>
              <button type="button" onClick={() => insertQuickPrompt("KITT, propose-moi un quiz Knight Rider de cinq questions, une par une, et attends ma réponse entre chaque question.")} disabled={socketState !== "online"}>Quiz K2000</button>
              <button type="button" onClick={() => insertQuickPrompt("KITT, présente-toi à un nouveau membre et explique ce que tu peux faire dans ce salon.")} disabled={socketState !== "online"}>Présentation</button>
              <button type="button" onClick={() => insertQuickPrompt("KARR, examine les hypothèses de notre diagnostic : quelles vérifications manquent et pourquoi ?")} disabled={socketState !== "online"}>Contre-expertise KARR</button>
              <small>Un clic prépare le texte dans la saisie; rien n’est envoyé automatiquement.</small>
            </div>
            <div className="kc-compose-tools">
              <div className="kc-emote-wrap">
                <button type="button" className="kc-emote-toggle" aria-expanded={emotesOpen} aria-label="Ouvrir les émoticônes Knight Rider" onClick={() => setEmotesOpen(value => !value)}><Smile size={15}/> Émoticônes KITT</button>
                {emotesOpen && <div className="kc-emote-picker" role="group" aria-label="Émoticônes Knight Rider">
                  {KNIGHT_RIDER_EMOTES.map(emote => <button type="button" key={emote.code} aria-label={`${emote.label}, insérer ${emote.code}`} title={`${emote.label} ${emote.code}`} onClick={() => addEmote(emote.code)}><img src={emote.src} alt="" loading="lazy"/><span><strong>{emote.label}</strong><small>{emote.code}</small></span></button>)}
                </div>}
              </div>
              <button type="button" className="kc-buzz" disabled={socketState !== "online" || buzzCooldown > 0} onClick={sendBuzz}><Zap size={15}/> {buzzCooldown > 0 ? `Buzz · ${buzzCooldown}s` : "Buzz KITT"}</button>
              <small>Les émoticônes sont dédiées à Knight Rider.</small>
            </div>
          </form> : <div className="kc-readonly"><ShieldCheck size={17}/><span>Mode découverte : tu peux lire les salons. Pour écrire, ajoute ta Pontiac au globe et fais valider son profil avec photo.</span></div>}
        </section>
        <aside className="kc-roster">
          <div className="kc-roster-heading"><Users size={17}/><strong>Membres présents</strong><span>{members.length}</span></div>
          <div className="kc-roster-list">{members.length ? members.map((item,index)=><div className={`kc-person${identityTone(item.name) ? ` kc-person-${identityTone(item.name)}` : ""}`} key={`${item.name}-${index}`}>
            <span className="kc-avatar">{item.name.slice(0,1).toUpperCase()}</span><span>{item.name}{item.role && <small className="kc-person-role">{item.role}</small>}</span><i title="En ligne"/>
          </div>) : <small className="kc-no-members">Aucun propriétaire connecté pour l’instant.</small>}</div>
          <button type="button" className="kc-sound" aria-pressed={sound} onClick={toggleSound}>{sound ? <Bell size={15}/> : <BellOff size={15}/>} {sound ? "Sons activés" : "Activer les sons"}<small>messages · arrivées · Buzz</small></button>
          <section className="kc-arrival-voice" aria-label="Annonce vocale des arrivées">
            <label><input type="checkbox" checked={arrivalVoiceEnabled} onChange={event => saveArrivalVoicePreference(event.target.checked)}/><Volume2 size={15}/><span>Annoncer les nouveaux membres</span></label>
            <div className="kc-arrival-volume"><label htmlFor="kc-arrival-volume">Volume vocal</label><output htmlFor="kc-arrival-volume">{arrivalVoiceVolume}%</output><input id="kc-arrival-volume" type="range" min="0" max="100" step="1" value={arrivalVoiceVolume} onChange={event => saveArrivalVoicePreference(arrivalVoiceEnabledRef.current, Number(event.target.value))} aria-label={`Volume des annonces ${arrivalVoiceVolume} pour cent`}/></div>
            <button type="button" onClick={testArrivalVoice}>Tester l’annonce</button>
            {arrivalVoiceStatus && <small role="status" aria-live="polite">{arrivalVoiceStatus}</small>}
          </section>
          {isMember && <details className="kc-mission-panel">
            <summary><FolderOpen size={16}/><span><strong>Dossiers de mission</strong><small>Mémoire volontaire · {missionMemory.notes.length}/2000</small></span></summary>
            <div className="kc-mission-body">
              <p className="kc-mission-warning"><strong>Notes partagées avec KITT/KARR :</strong> leurs réponses dans le salon peuvent les mentionner. N’y inscris pas de secret.</p>
              <p className="kc-mission-explainer">Tes notes restent désactivées par défaut. Active leur usage pour qu’elles servent à personnaliser les réponses publiques.</p>
              <label className="kc-memory-check"><input type="checkbox" checked={missionMemory.enabled} onChange={event => editMissionMemory(current => ({ ...current, enabled: event.target.checked }))}/><span>Autoriser KITT/KARR à utiliser ces notes</span></label>
              <label className="kc-memory-notes">Notes personnelles<textarea maxLength={2000} rows={5} value={missionMemory.notes} onChange={event => editMissionMemory(current => ({ ...current, notes: event.target.value.slice(0, 2000) }))} placeholder="Ex. modèle de Pontiac, projets en cours, préférences de discussion…"/><small>{missionMemory.notes.length}/2000 caractères</small></label>
              <label className="kc-memory-select">Rythme des interventions spontanées<select value={missionMemory.frequency} onChange={event => editMissionMemory(current => ({ ...current, frequency: event.target.value as MemoryFrequency }))}><option value="quiet">Discret</option><option value="balanced">Équilibré</option><option value="lively">Plus présent</option></select></label>
              <p className="kc-memory-frequency">Ce réglage concerne les interventions spontanées liées à tes notes. Les commandes explicites restent traitées normalement.</p>
              <label className="kc-memory-check kc-memory-voice"><input type="checkbox" checked={missionMemory.voice} onChange={event => toggleMissionVoice(event.target.checked)}/><Volume2 size={15}/><span>Lire les nouveaux messages KITT/KARR avec une voix française du navigateur</span></label>
              <p className="kc-memory-voice-note">La voix ne lit que les nouveaux messages reçus après activation, jamais l’historique. Désactiver la voix ou quitter le salon arrête la lecture.</p>
              <p className="kc-memory-voice-note">Pr&eacute;f&eacute;rence de voix enregistr&eacute;e : {savedVoicePreference ? "oui" : "non"}. La voix reste d&eacute;sactiv&eacute;e au d&eacute;marrage et doit &ecirc;tre activ&eacute;e sur cet appareil &agrave; chaque visite.</p>
              <div className="kc-memory-actions">
                <button type="button" onClick={() => void missionMemoryRequest("GET")} disabled={memoryBusy}><FolderOpen size={14}/>Charger</button>
                <button type="button" className="save" onClick={() => void missionMemoryRequest("PUT")} disabled={memoryBusy}><Save size={14}/>Enregistrer</button>
                <button type="button" className="erase" onClick={eraseMissionMemory} disabled={memoryBusy}><Trash2 size={14}/>Effacer</button>
              </div>
              {memoryFeedback && <p className={`kc-memory-feedback${memoryFeedbackError ? " error" : ""}`} role={memoryFeedbackError ? "alert" : "status"} aria-live="polite">{memoryFeedback}</p>}
              <p className="kc-memory-retention">Historique public : jusqu’à 500 messages par salon, conservés au maximum 90 jours.</p>
            </div>
          </details>}
          {isMember ? <button type="button" className="kc-leave" onClick={disconnect}>Quitter le salon</button> : <form className="kc-guest-join" onSubmit={enter}>
            <div className="kc-join-heading"><span>ACCÈS PROPRIÉTAIRE</span><small>PROFIL PHOTO VALIDÉ</small></div>
            {owners.length ? <label>Ton Pontiac sur le globe
              <select required value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} · {owner.car} {owner.year}</option>)}
              </select>
            </label> : <p>Aucun profil avec photo n’est encore approuvé. Inscris ta voiture sur le globe, puis attends la validation.</p>}
            <div className="kc-common-access" role="note">
              <strong>Code commun du salon : <code>1982</code></strong>
              <span>Après validation de ta Pontiac avec photo, tu peux entrer directement. Aucun code personnel à demander à Manix.</span>
            </div>
            <label>Code d’accès<input required maxLength={80} autoComplete="off" inputMode="numeric" value={invite} onChange={event => setInvite(event.target.value)} placeholder="1982" disabled={!owners.length}/></label>
            <button type="submit" disabled={!owners.length || !invite.trim() || service !== "online"}>Entrer dans le salon <ArrowRight size={15}/></button>
            <a className="kc-globe-cta" href="/communaute-pontiac#inscription"><CarFront size={15}/> Inscrire ma Pontiac sur le globe</a>
            <p>Étapes : inscris ta Pontiac avec une photo, attends la validation du profil, puis entre avec le code commun 1982. L’accès reste associé à ton profil approuvé.</p>
          </form>}
        </aside>
      </div> : isMember ? <section className="kc-offline"><Radio size={24}/><div><strong>{service === "online" ? `Session mémorisée pour ${member}` : "Le salon est momentanément hors ligne."}</strong><p>{service === "online" ? "Ton code a déjà été utilisé. Cet appareil se souviendra de toi." : "Ta session est conservée. Réessaie quand le relais sera disponible."}</p></div>{service === "online" ? <button type="button" onClick={() => setReconnectKey(value => value + 1)}>Revenir au salon <ArrowRight size={15}/></button> : <button type="button" onClick={() => window.location.reload()}>Réessayer <ArrowRight size={15}/></button>}<button type="button" onClick={forgetDevice}>Oublier cet appareil</button></section> : <section className="kc-offline"><Radio size={24}/><div><strong>{service === "checking" ? "Recherche du salon…" : "Le salon est momentanément hors ligne."}</strong><p>Tu peux déjà préparer ton inscription au globe Pontiac.</p></div><a href="/communaute-pontiac#inscription">Voir l’inscription <ArrowRight size={15}/></a></section>}
      {(error || notice) && <p className={error ? "kc-feedback error" : "kc-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <footer className="kc-footer"><span><Wifi size={14}/> {socketState === "online" ? (isMember ? "PROPRIÉTAIRE VALIDÉ" : "VISITEUR · LECTURE SEULE") : socketState === "connecting" ? "CONNEXION…" : <><WifiOff size={14}/> DÉCONNECTÉ</>}</span><span>BY MANIX · KITT FRANCO-BELGE</span><a href="/mentions-legales"><CircleHelp size={14}/> Règles du salon</a></footer>
    </div>
    <p className="kc-disclaimer">Salon communautaire inspiré des chats des années 1990. MSN est une marque de Microsoft ; KITT et Knight Rider appartiennent à leurs ayants droit. Aucun partenariat n’est revendiqué.</p>
  </main>;
}
