import { useEffect, useRef, useState, type ChangeEvent as ReactChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowRight, Bell, BellOff, CarFront, Check, CircleHelp, Download, FolderOpen, Link2, MessageCircle, Mic, Radio, Save, ShieldCheck, Smile, Trash2, Users, Volume2, Wifi, WifiOff, Zap } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./KittChat.css";

type Room = { id: string; label: string; topic: string };
type SharedImage = { id: string; url: string; width: number; height: number; alt: string; ownerId: string };
type ChatLine = { id: string; name: string; text: string; timestamp: number; kind?: "system" | "message"; category?: string; liveBot?: boolean; image?: SharedImage; imageRemoved?: boolean; translation?: string; translationLanguage?: string; translationUnavailable?: boolean };
type Member = { name: string; role?: string; admin?: boolean; away?: boolean };
type PendingTurn = { speaker: "KITT" | "KARR"; expiresAt: number };
type BotStatus = "KITT" | "KARR";
type Owner = { id: string; name: string; car: string; year: string; photos: string[] };
type MemoryFrequency = "quiet" | "balanced" | "lively";
type MissionMemory = { notes: string; enabled: boolean; frequency: MemoryFrequency; voice: boolean; mealReminders: boolean };
type SpeechJob = { text: string; speaker: "KITT" | "KARR"; kind: "bot" | "arrival"; engine: "agx" | "browser"; volume: number; messageId?: string; category?: string };
type MicDevice = { deviceId: string; label: string };
const EMPTY_MISSION_MEMORY: MissionMemory = { notes: "", enabled: false, frequency: "balanced", voice: false, mealReminders: true };
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
const ADMIN_TOKEN_KEY = "kitt-pontiac-admin-token-v1";
const OWNER_ACCESS_CODE = "1982";
const ARRIVAL_VOICE_KEY = "kitt-msn-arrival-voice-v1";
const CHAT_LANGUAGES = [{ id: "fr", label: "Français" }, { id: "nl", label: "Nederlands" }, { id: "en", label: "English" }, { id: "de", label: "Deutsch" }, { id: "es", label: "Español" }, { id: "it", label: "Italiano" }, { id: "pt", label: "Português" }];
const CHAT_LANGUAGE_KEY = "kitt-chat-language-v1";
function initialChatLanguage() {
  const saved = localStorage.getItem(CHAT_LANGUAGE_KEY)?.toLowerCase().split("-")[0];
  if (saved && CHAT_LANGUAGES.some(item => item.id === saved)) return saved;
  const browser = navigator.languages?.[0] || navigator.language || "fr";
  const detected = browser.toLowerCase().split("-")[0];
  return CHAT_LANGUAGES.some(item => item.id === detected) ? detected : "fr";
}

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

function communityImageHref(apiBase: string, image: SharedImage) {
  try {
    const base = new URL(apiBase);
    const resolved = new URL(image.url, base);
    const expectedPath = `/api/kitt-chat/images/${encodeURIComponent(image.id)}.webp`;
    if (resolved.origin !== base.origin || resolved.pathname !== expectedPath) return "";
    return resolved.href;
  } catch { return ""; }
}

export default function KittChat() {
  const [apiBase, setApiBase] = useState("");
  const [service, setService] = useState<"checking" | "online" | "offline">("checking");
  const [socketState, setSocketState] = useState<"closed" | "connecting" | "online">("closed");
  const [rooms, setRooms] = useState<Room[]>(FALLBACK_ROOMS);
  const [room, setRoom] = useState(FALLBACK_ROOMS[0]);
  const [chatLanguage, setChatLanguage] = useState(initialChatLanguage);
  const [publicGuestsCanWrite, setPublicGuestsCanWrite] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameDraft, setGuestNameDraft] = useState("");
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [member, setMember] = useState("");
  const [invite, setInvite] = useState(OWNER_ACCESS_CODE);
  const [sessionToken, setSessionToken] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [typedBotText, setTypedBotText] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState(false);
  const [arrivalVoiceEnabled, setArrivalVoiceEnabled] = useState(false);
  const [arrivalVoiceVolume, setArrivalVoiceVolume] = useState(75);
  const [arrivalVoiceStatus, setArrivalVoiceStatus] = useState("");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechStatus, setSpeechStatus] = useState("");
  const [speakingBot, setSpeakingBot] = useState<BotStatus | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechVoices, setSpeechVoices] = useState<{ KITT: string; KARR: string } | null>(null);
  const [pushToTalkAvailable, setPushToTalkAvailable] = useState(false);
  const [imageSharingAvailable, setImageSharingAvailable] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [failedVoiceJob, setFailedVoiceJob] = useState<SpeechJob | null>(null);
  const [pttState, setPttState] = useState<"idle" | "starting" | "recording" | "transcribing">("idle");
  const [pttStatus, setPttStatus] = useState("");
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [imageDescriptionAvailable, setImageDescriptionAvailable] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageQuestion, setImageQuestion] = useState("Decris ce que tu vois sur cette image.");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [describingImageId, setDescribingImageId] = useState("");
  const [imageActionFeedback, setImageActionFeedback] = useState<{ imageId: string; text: string; error: boolean } | null>(null);
  const [selectedImage, setSelectedImage] = useState<SharedImage | null>(null);
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
  const pttButton = useRef<HTMLButtonElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const imageDialogClose = useRef<HTMLButtonElement>(null);
  const imageTrigger = useRef<HTMLButtonElement | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const roomToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const botStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceMessageIds = useRef<Set<string>>(new Set());
  const voiceEnabled = useRef(true);
  const mealRemindersEnabled = useRef(true);
  const arrivalVoiceEnabledRef = useRef(false);
  const arrivalVoiceVolumeRef = useRef(75);
  const speechQueue = useRef<SpeechJob[]>([]);
  const activeSpeech = useRef<SpeechJob | null>(null);
  const speechAudio = useRef<HTMLAudioElement | null>(null);
  const speechBlobUrl = useRef("");
  const speechRequest = useRef<AbortController | null>(null);
  const speechGeneration = useRef(0);
  const pttStream = useRef<MediaStream | null>(null);
  const pttRecorder = useRef<MediaRecorder | null>(null);
  const pttChunks = useRef<Blob[]>([]);
  const pttSize = useRef(0);
  const pttMime = useRef("audio/webm");
  const pttHeld = useRef(false);
  const pttDiscard = useRef(false);
  const pttGeneration = useRef(0);
  const pttTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcribeRequest = useRef<AbortController | null>(null);
  const transcribeGeneration = useRef(0);
  const spacePttHeld = useRef(false);
  const announcedJoinIds = useRef<string[]>([]);
  const voiceGuidePlayed = useRef(false);
  const memoryEditRevision = useRef(0);
  const voicePreferenceTouched = useRef(false);
  const isMember = Boolean(sessionToken);
  const canWriteMessages = isMember || (publicGuestsCanWrite && Boolean(guestName));

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
        const openChat = statusData.publicGuestsCanWrite === true;
        setPublicGuestsCanWrite(openChat);
        setSpeechVoices(statusData.speechVoices && typeof statusData.speechVoices.KITT === "string" && typeof statusData.speechVoices.KARR === "string" ? statusData.speechVoices as { KITT: string; KARR: string } : null);
        setPushToTalkAvailable(statusData.pushToTalk === true);
        setImageSharingAvailable(statusData.imageSharing === true);
        setImageDescriptionAvailable(statusData.imageDescription === true);
        setApiBase(base);
        setRooms(availableRooms);
        setRoom(availableRooms[0] || FALLBACK_ROOMS[0]);
        setOwners(approved);
        setOwnerId(approved[0]?.id || "");
        setService("online");
        // Le salon public et l'accès propriétaire sont deux portes distinctes.
        // Une session propriétaire vérifiée reste donc disponible en mode libre.
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
  useEffect(() => { voiceEnabled.current = speechEnabled; }, [speechEnabled]);
  useEffect(() => { mealRemindersEnabled.current = missionMemory.mealReminders; }, [missionMemory.mealReminders]);
  useEffect(() => {
    if (!apiBase || service !== "online") return;
    let active = true;
    let saved = "";
    try { saved = localStorage.getItem(ADMIN_TOKEN_KEY) || ""; } catch { /* Stockage local indisponible. */ }
    setAdminToken(saved);
    setAdminVerified(false);
    if (!saved) return () => { active = false; };
    void fetch(`${apiBase}/api/kitt-chat/admin/verify`, { headers: { "X-Admin-Token": saved }, cache: "no-store" })
      .then(response => {
        if (!active) return;
        if (response.ok) setAdminVerified(true);
        else if (response.status === 401) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAdminToken("");
        }
      })
      .catch(() => { /* L’outil admin restera masqué si le relais ne répond pas. */ });
    return () => { active = false; };
  }, [apiBase, service]);
  useEffect(() => {
    if (!imageFile) { setImagePreview(""); return; }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);
  useEffect(() => {
    if (!selectedImage) return;
    imageDialogClose.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setSelectedImage(null); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (selectedImage) requestAnimationFrame(() => imageTrigger.current?.focus());
    };
  }, [selectedImage]);
  useEffect(() => {
    const isBlockedTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return true;
      if (target.closest("input,textarea,select,[contenteditable=true],[role=textbox],[role=combobox],[role=dialog],[aria-modal=true],button,a,[role=button]")) return true;
      return false;
    };
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || isBlockedTarget(event.target) || !isMember || socketState !== "online" || !pushToTalkAvailable) return;
      event.preventDefault(); spacePttHeld.current = true; void startPushToTalk();
    };
    const keyup = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space" || !spacePttHeld.current) return;
      event.preventDefault(); spacePttHeld.current = false; finishPushToTalk();
    };
    const suspend = () => {
      spacePttHeld.current = false;
      if (pttHeld.current || pttRecorder.current || transcribeRequest.current) cancelPushToTalk("Capture arrêtée. Tu peux recommencer en maintenant le micro.");
    };
    const visibility = () => { if (document.visibilityState === "hidden") suspend(); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", visibility);
      cancelPushToTalk(""); stopRoomVoice();
    };
  }, [isMember, pushToTalkAvailable, room.id, socketState]);
  useEffect(() => {
    if (!member) return;
    let saved: { enabled?: boolean; volume?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(`${ARRIVAL_VOICE_KEY}:${member.toLocaleLowerCase("fr-BE")}`) || "null"); } catch { saved = null; }
    const wasEnabled = typeof saved?.enabled === "boolean" ? saved.enabled : identityTone(member) === "manix";
    const volume = typeof saved?.volume === "number" ? Math.max(0, Math.min(100, Math.round(saved.volume))) : 75;
    setArrivalVoiceEnabled(wasEnabled); arrivalVoiceEnabledRef.current = wasEnabled;
    setArrivalVoiceVolume(volume); arrivalVoiceVolumeRef.current = volume;
    setArrivalVoiceStatus(wasEnabled ? "Annonces vocales activées selon ta préférence mémorisée." : "");
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
          showMemoryFeedback("Dossier chargé. Les réponses KITT/KARR sont lues par défaut; tu peux couper leur voix à tout moment.");
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

  function clearSpeechOutput(cancelBrowser = true) {
    speechGeneration.current += 1;
    speechRequest.current?.abort(); speechRequest.current = null;
    speechAudio.current?.pause(); speechAudio.current = null;
    if (speechBlobUrl.current) URL.revokeObjectURL(speechBlobUrl.current);
    speechBlobUrl.current = "";
    if (cancelBrowser) { try { window.speechSynthesis?.cancel(); } catch { /* Voix navigateur facultative. */ } }
  }

  function pumpSpeechQueue() {
    if (pttHeld.current || pttRecorder.current?.state === "recording" || pttRecorder.current?.state === "paused" || activeSpeech.current || !speechQueue.current.length) return;
    const job = speechQueue.current.shift();
    if (!job) return;
    activeSpeech.current = job;
    setSpeakingBot(job.kind === "bot" ? job.speaker : null);
    setSpeakingMessageId(job.kind === "bot" ? job.messageId || null : null);
    const generation = ++speechGeneration.current;
    const finish = () => {
      if (activeSpeech.current !== job || speechGeneration.current !== generation) return;
      activeSpeech.current = null;
      setSpeakingBot(null);
      setSpeakingMessageId(null);
      speechRequest.current = null;
      speechAudio.current = null;
      if (speechBlobUrl.current) URL.revokeObjectURL(speechBlobUrl.current);
      speechBlobUrl.current = "";
      window.setTimeout(pumpSpeechQueue, 40);
    };
    const failed = (message: string) => {
      if (activeSpeech.current !== job || speechGeneration.current !== generation) return;
      setVoiceError(message); setFailedVoiceJob(job);
      if (job.kind === "arrival") setArrivalVoiceStatus(message);
      finish();
    };

    if (job.engine === "browser") {
      if (typeof window.SpeechSynthesisUtterance !== "function" || !window.speechSynthesis) {
        failed("La voix du navigateur n'est pas disponible. Installe une voix francaise ou reessaie l'audio AGX.");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(job.text);
      const frenchVoice = window.speechSynthesis.getVoices().find(voice => /^fr(?:-|$)/i.test(voice.lang));
      utterance.lang = frenchVoice?.lang || "fr-FR";
      if (frenchVoice) utterance.voice = frenchVoice;
      utterance.volume = job.volume;
      utterance.rate = job.speaker === "KARR" ? 0.88 : 0.96;
      utterance.pitch = job.speaker === "KARR" ? 0.72 : 1;
      utterance.onend = finish;
      utterance.onerror = event => event.error === "canceled" || event.error === "interrupted"
        ? finish()
        : failed("Le navigateur a bloque la lecture. Clique sur Reessayer apres avoir active le son.");
      try { window.speechSynthesis.speak(utterance); }
      catch { failed("La voix du navigateur ne demarre pas. Verifie les reglages audio du navigateur."); }
      return;
    }

    if (!apiBase || (!sessionToken && !job.messageId)) { failed("Connecte-toi avec un profil approuvé pour tester la voix AGX."); return; }
    const controller = new AbortController();
    speechRequest.current = controller;
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/kitt-chat/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
          body: JSON.stringify({ text: job.text.slice(0, job.kind === "bot" ? 600 : 120), speaker: job.speaker, ...(job.messageId ? { messageId: job.messageId } : {}) }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(data?.error || `Le moteur vocal AGX a repondu ${response.status}.`);
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("Le moteur vocal AGX n'a renvoye aucun audio.");
        if (controller.signal.aborted || speechGeneration.current !== generation) return;
        if (pttHeld.current || pttRecorder.current?.state === "recording" || pttRecorder.current?.state === "paused") {
          speechRequest.current = null;
          activeSpeech.current = null;
          setSpeakingBot(null);
          setSpeakingMessageId(null);
          pumpSpeechQueue();
          return;
        }
        const url = URL.createObjectURL(blob);
        speechBlobUrl.current = url;
        const player = new Audio(url);
        player.volume = Math.max(0, Math.min(1, job.volume));
        speechAudio.current = player;
        player.onended = finish;
        player.onerror = () => failed("L'audio AGX a ete recu, mais le navigateur n'a pas pu le lire. Verifie le format WAV et la sortie audio.");
        try { await player.play(); }
        catch { failed("Lecture audio bloquee par le navigateur. Clique sur Reessayer pour relancer l'audio AGX."); }
      } catch (cause) {
        if (controller.signal.aborted || speechGeneration.current !== generation) return;
        failed(cause instanceof Error ? cause.message : "Impossible de joindre la voix AGX.");
      }
    })();
  }

  function enqueueSpeech(job: SpeechJob) {
    speechQueue.current.push(job);
    pumpSpeechQueue();
  }

  function cancelSpeechKind(kind: SpeechJob["kind"]) {
    speechQueue.current = speechQueue.current.filter(job => job.kind !== kind);
    if (activeSpeech.current?.kind === kind) {
      activeSpeech.current = null;
      setSpeakingBot(null);
      setSpeakingMessageId(null);
      clearSpeechOutput();
      window.setTimeout(pumpSpeechQueue, 40);
    }
  }

  function cancelArrivalSpeech() { cancelSpeechKind("arrival"); }

  function cancelSpeechCategory(category: string) {
    speechQueue.current = speechQueue.current.filter(job => job.category !== category);
    if (activeSpeech.current?.category === category) {
      activeSpeech.current = null;
      setSpeakingBot(null);
      setSpeakingMessageId(null);
      clearSpeechOutput();
      window.setTimeout(pumpSpeechQueue, 40);
    }
  }

  function stopRoomVoice() {
    voiceMessageIds.current.clear();
    speechQueue.current = [];
    activeSpeech.current = null;
    setSpeakingBot(null);
    setSpeakingMessageId(null);
    clearSpeechOutput();
  }

  function pauseSpeechForPushToTalk() {
    const interrupted = activeSpeech.current;
    activeSpeech.current = null;
    setSpeakingBot(null);
    setSpeakingMessageId(null);
    clearSpeechOutput();
    if (interrupted) speechQueue.current.unshift(interrupted);
  }

  function saveArrivalVoicePreference(enabled: boolean, volume = arrivalVoiceVolumeRef.current) {
    const safeVolume = Math.max(0, Math.min(100, Math.round(volume)));
    setArrivalVoiceEnabled(enabled); arrivalVoiceEnabledRef.current = enabled;
    setArrivalVoiceVolume(safeVolume); arrivalVoiceVolumeRef.current = safeVolume;
    if (member) {
      try { localStorage.setItem(`${ARRIVAL_VOICE_KEY}:${member.toLocaleLowerCase("fr-BE")}`, JSON.stringify({ enabled, volume: safeVolume })); } catch { /* Le reglage reste actif pour cette visite. */ }
    }
    if (!enabled) {
      cancelArrivalSpeech();
      setArrivalVoiceStatus("Annonces vocales desactivees.");
    } else {
      setArrivalVoiceStatus("Annonces vocales activees pour cette visite.");
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
    const waitingArrivals = speechQueue.current.filter(job => job.kind === "arrival").length + (activeSpeech.current?.kind === "arrival" ? 1 : 0);
    if (waitingArrivals >= 3) {
      setArrivalVoiceStatus("Plusieurs membres arrivent : les annonces vocales en attente sont limit?es.");
      return true;
    }
    setVoiceError(""); setFailedVoiceJob(null);
    enqueueSpeech({ text: `${name} vient de se connecter au chat Rider.`, speaker: "KITT", kind: "arrival", engine: "agx", volume: arrivalVoiceVolumeRef.current / 100, messageId: id });
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
    if (!speechEnabled || !apiBase) return;
    for (const line of lines) {
      if (!voiceMessageIds.current.has(line.id)) continue;
      voiceMessageIds.current.delete(line.id);
      if (line.category === "meal" && !missionMemory.mealReminders) continue;
      const text = line.text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
      if (!text) continue;
      setVoiceError(""); setFailedVoiceJob(null);
      enqueueSpeech({ text, speaker: identityTone(line.name) === "karr" ? "KARR" : "KITT", kind: "bot", engine: "agx", volume: 1, messageId: line.id, category: line.category });
    }
  }, [apiBase, lines, missionMemory.mealReminders, speechEnabled]);

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

  function playRoomSound(kind: "message" | "join" | "buzz" | "hyper-buzz" | "test" | "vision-start" | "vision-done" | "vision-error") {
    if (!soundEnabled.current) return;
    try {
      audio.current ||= new AudioContext();
      const context = audio.current;
      if (context.state === "suspended") void context.resume();
      const notes = kind === "vision-start" ? [420, 560, 720, 540] : kind === "vision-done" ? [660, 880, 1046] : kind === "vision-error" ? [740, 554, 370] : kind === "hyper-buzz" ? [330, 220, 294, 165] : kind === "buzz" ? [180, 120] : kind === "join" || kind === "test" ? [660, 880] : [700];
      const startAt = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const isBuzz = kind === "buzz" || kind === "hyper-buzz";
        const isVision = kind.startsWith("vision-");
        const noteStart = startAt + index * (kind === "hyper-buzz" ? 0.12 : kind === "buzz" ? 0.11 : kind === "vision-start" ? 0.085 : isBuzz ? 0.16 : isVision ? 0.105 : 0.14);
        const noteLength = kind === "hyper-buzz" ? 0.18 : kind === "buzz" ? 0.075 : isBuzz ? 0.22 : kind === "vision-start" ? 0.085 : kind === "vision-error" ? 0.13 : isVision ? 0.11 : kind === "test" || kind === "join" ? 0.16 : 0.11;
        const peak = kind === "hyper-buzz" ? 0.19 : kind === "buzz" ? 0.045 : kind === "test" ? 0.12 : kind === "join" ? 0.095 : isVision ? 0.045 : isBuzz ? 0.16 : 0.07;
        oscillator.type = kind === "buzz" ? "square" : isBuzz ? "triangle" : kind === "vision-start" ? "square" : kind === "vision-error" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        if (kind === "vision-start") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.12, noteStart + noteLength);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(peak, noteStart + (kind === "buzz" ? 0.012 : 0.018));
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteLength);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + noteLength + (kind === "buzz" ? 0.005 : 0.01));
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
    if (publicGuestsCanWrite && !isMember && !guestName) {
      setSocketState("closed");
      return;
    }
    const endpoint = new URL("/api/kitt-chat/ws", apiBase);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    const client = new WebSocket(endpoint);
    socket.current = client;
    setSocketState("connecting");
    client.onopen = () => client.send(JSON.stringify(
      isMember
        ? { type: "auth", token: sessionToken, room: room.id, language: chatLanguage }
        : { type: "guest", name: guestName, room: room.id, language: chatLanguage },
    ));
    client.onmessage = event => {
      let packet: Record<string, unknown>;
      try { packet = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
      if (packet.type === "ready") {
        clearBotStatus();
        if (!isMember && typeof packet.name === "string") setGuestDisplayName(packet.name);
        setSocketState("online");
        setTypedBotText({});
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []);
        return;
      }
      if (packet.type === "presence") { setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []); return; }
      if (packet.type === "translation" && typeof packet.id === "string" && typeof packet.text === "string") {
        setLines(current => current.map(line => line.id === packet.id ? { ...line, translation: packet.text as string, translationLanguage: typeof packet.languageName === "string" ? packet.languageName : chatLanguage, translationUnavailable: false } : line));
        return;
      }
      if (packet.type === "translation_unavailable" && typeof packet.id === "string") {
        setLines(current => current.map(line => line.id === packet.id ? { ...line, translationUnavailable: true, translationLanguage: typeof packet.languageName === "string" ? packet.languageName : chatLanguage } : line));
        return;
      }
      if (packet.type === "history_cleared") {
        setLines([]); setTypedBotText({}); setPendingTurn(null); clearBotStatus();
        setNotice("L’historique de ce salon a été effacé par un administrateur.");
        return;
      }
      if (packet.type === "image_removed") {
        const imageId = typeof packet.imageId === "string" ? packet.imageId : "";
        const messageId = typeof packet.messageId === "string" ? packet.messageId : typeof packet.id === "string" ? packet.id : "";
        if (imageId) setLines(current => current.map(line => line.id === messageId || line.image?.id === imageId ? { ...line, imageRemoved: true } : line));
        if (imageId) setSelectedImage(current => current?.id === imageId ? null : current);
        return;
      }
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
        const line: ChatLine = { ...incoming, liveBot: incoming.kind !== "system" && (incoming.category !== "meal" || mealRemindersEnabled.current) && ["kitt", "karr"].includes(identityTone(incoming.name)) };
        if (line.liveBot && voiceEnabled.current) voiceMessageIds.current.add(line.id);
        setLines(current => [...current.slice(-98), line]);
        if (line.kind === "system" && line.text.endsWith(" entre dans le salon.")) {
          const joinedName = line.text.slice(0, -" entre dans le salon.".length);
          announceMemberJoined(line.id, joinedName);
        } else if (line.name !== (isMember ? member : guestName) && line.kind !== "system") {
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
      } else if (event.code === 4003 && publicGuestsCanWrite) {
        setGuestName(""); setGuestDisplayName("");
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
  }, [apiBase, service, isMember, sessionToken, member, reconnectKey, publicGuestsCanWrite, guestName]);

  useEffect(() => {
    if (socketState !== "online") return;
    let lastActivitySent = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastActivitySent < 20_000) return;
      const client = socket.current;
      if (!client || client.readyState !== WebSocket.OPEN) return;
      client.send(JSON.stringify({ type: "activity" }));
      lastActivitySent = now;
    };
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("pointermove", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("wheel", markActivity, { passive: true });
    window.addEventListener("touchstart", markActivity, { passive: true });
    window.addEventListener("focus", markActivity);
    markActivity();
    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("wheel", markActivity);
      window.removeEventListener("touchstart", markActivity);
      window.removeEventListener("focus", markActivity);
    };
  }, [socketState]);

  useEffect(() => {
    localStorage.setItem(CHAT_LANGUAGE_KEY, chatLanguage);
    if (socketState === "online") socket.current?.send(JSON.stringify({ type: "language", language: chatLanguage }));
  }, [chatLanguage, socketState]);

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

  function enterPublicGuest(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const clean = guestNameDraft.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 24);
    if (clean.length < 2) { setError("Choisis un pseudo de 2 à 24 caractères."); return; }
    if (["kitt", "karr", "manix", "admin", "administrateur", "visiteur", "invite", "invité"].includes(clean.toLocaleLowerCase("fr-BE"))) {
      setError("Ce pseudo est réservé aux personnages et aux administrateurs du salon."); return;
    }
    setGuestName(clean);
  }

  async function verifyAdminAccess(event: FormEvent) {
    event.preventDefault();
    if (!apiBase) return;
    const token = adminTokenDraft.trim() || adminToken;
    if (!token) { setError("Saisis le jeton administrateur."); return; }
    setAdminBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/admin/verify`, { headers: { "X-Admin-Token": token }, cache: "no-store" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Jeton administrateur refusé.");
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAdminToken(token); setAdminTokenDraft(""); setAdminVerified(true);
      setNotice("Accès administrateur vérifié sur cet appareil.");
    } catch (cause) {
      setAdminVerified(false);
      setError(cause instanceof Error ? cause.message : "Vérification administrateur impossible.");
    } finally { setAdminBusy(false); }
  }

  async function clearRoomHistory() {
    if (!adminVerified || !adminToken || !apiBase) return;
    if (!window.confirm(`Effacer définitivement tout l’historique de « ${room.label} » ? Cette action est irréversible.`)) return;
    setAdminBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/history/clear`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
        body: JSON.stringify({ room: room.id }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) {
        localStorage.removeItem(ADMIN_TOKEN_KEY); setAdminToken(""); setAdminVerified(false);
      }
      if (!response.ok) throw new Error(data?.error || "Impossible d’effacer l’historique.");
      setLines([]); setTypedBotText({}); setPendingTurn(null);
      setNotice(`Historique de « ${room.label} » effacé.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’effacer l’historique.");
    } finally { setAdminBusy(false); }
  }

  function forgetAdminToken() {
    localStorage.removeItem(ADMIN_TOKEN_KEY); setAdminToken(""); setAdminTokenDraft(""); setAdminVerified(false);
    setNotice("Jeton administrateur oublié sur cet appareil.");
  }

  function leavePublicGuest() {
    clearBotStatus(); stopRoomVoice();
    socket.current?.close(1000, "Fin de la visite"); socket.current = null;
    setSocketState("closed"); setLines([]); setMembers([]); setMessage("");
    setGuestName(""); setGuestNameDraft(""); setGuestDisplayName("");
  }

  function forgetDevice() {
    const token = sessionToken;
    if (apiBase && token) {
      void fetch(`${apiBase}/api/kitt-chat/session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => { /* Le jeton local est oublie meme si le relais est hors ligne. */ });
    }
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
      setError("Choisis ton profil Pontiac approuvé et saisis le code d’accès communiqué aux membres.");
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
      setMember(data.name); setSessionToken(data.token); setNotice("Profil Pontiac vérifié. Bienvenue ! Ton accès au salon est permanent sur ce profil."); setInvite("");
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
      mealReminders: data.mealReminders !== false,
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
        showMemoryFeedback("Dossier chargé. La lecture vocale du salon est activée par défaut.");
        setMissionMemory(loaded);
      } else {
        const saved = normalizeMissionMemory(data ?? missionMemory);
        setSavedVoicePreference(saved.voice);
        showMemoryFeedback("Dossier enregistré. La préférence vocale du profil est mémorisée; la lecture du salon démarre activée par défaut.");
        if (memoryEditRevision.current === revisionAtStart) {
          setMissionMemory({ ...saved, voice: missionMemory.voice });
        } else {
          showMemoryFeedback("Le dossier a été enregistré. Les changements faits pendant l’enregistrement restent dans le formulaire.");
        }
      }
    } catch (cause) {
      showMemoryFeedback(cause instanceof Error ? cause.message : "Impossible de contacter le service memoire.", true);
    } finally {
      setMemoryBusy(false);
    }
  }

  function editMissionMemory(update: (current: MissionMemory) => MissionMemory) {
    memoryEditRevision.current += 1;
    setMissionMemory(update);
  }

  function toggleSpeechForVisit(enabled: boolean) {
    setSpeechEnabled(enabled); voiceEnabled.current = enabled;
    if (!enabled) {
      voiceMessageIds.current.clear();
      cancelSpeechKind("bot");
    }
    if (isMember) {
      voicePreferenceTouched.current = true;
      editMissionMemory(current => ({ ...current, voice: enabled }));
    }
    setSpeechStatus(enabled ? "Voix AGX activee pour cette visite; seuls les nouveaux messages seront lus." : "Lecture vocale desactivee.");
    if (enabled && !voiceGuidePlayed.current && sessionToken) {
      voiceGuidePlayed.current = true;
      enqueueSpeech({ text: "Pour parler comme a la CB, maintiens la barre Espace hors du champ de saisie, ou maintiens le bouton micro. Relache pour transcrire, relis le texte puis clique sur Envoyer. Active les voix pour entendre KITT et KARR.", speaker: "KITT", kind: "bot", engine: "agx", volume: 1 });
    }
  }

  function toggleMealReminders(enabled: boolean) {
    editMissionMemory(current => ({ ...current, mealReminders: enabled }));
    if (!enabled) {
      lines.filter(line => line.category === "meal").forEach(line => voiceMessageIds.current.delete(line.id));
      cancelSpeechCategory("meal");
    }
  }

  function insertQuickPrompt(prompt: string) {
    setMessage(current => current.trim() ? `${current.trim()} ${prompt}` : prompt);
    requestAnimationFrame(() => document.getElementById("kc-message")?.focus());
  }

  function testArrivalVoice() {
    if (!sessionToken) {
      setArrivalVoiceStatus("Connecte-toi avec ton profil Pontiac valide pour tester la voix AGX.");
      return;
    }
    const waitingArrivals = speechQueue.current.filter(job => job.kind === "arrival").length + (activeSpeech.current?.kind === "arrival" ? 1 : 0);
    if (waitingArrivals >= 3) { setArrivalVoiceStatus("La file d'annonces est pleine. Attends la fin des annonces puis reessaie."); return; }
    setVoiceError(""); setFailedVoiceJob(null);
    setArrivalVoiceStatus("Test de la voix AGX en cours...");
    enqueueSpeech({ text: "Annonce de test. Pascal K Industry vient de se connecter au chat Rider.", speaker: "KITT", kind: "arrival", engine: "agx", volume: arrivalVoiceVolumeRef.current / 100 });
  }

  function retryFailedVoice() {
    if (!failedVoiceJob) return;
    const retry = { ...failedVoiceJob, engine: "agx" as const };
    setVoiceError(""); setFailedVoiceJob(null);
    if (retry.kind === "arrival") setArrivalVoiceStatus("Nouvelle tentative audio AGX en cours...");
    enqueueSpeech(retry);
  }

  function useBrowserVoiceFallback() {
    if (!failedVoiceJob) return;
    const fallback = { ...failedVoiceJob, engine: "browser" as const };
    setVoiceError(""); setFailedVoiceJob(null);
    if (fallback.kind === "arrival") setArrivalVoiceStatus("Lecture avec la voix francaise du navigateur, a ta demande.");
    enqueueSpeech(fallback);
  }

  function cancelPushToTalk(messageText = "Capture annulee.") {
    pttGeneration.current += 1;
    pttHeld.current = false;
    pttDiscard.current = true;
    if (pttTimer.current) clearTimeout(pttTimer.current);
    pttTimer.current = null;
    transcribeGeneration.current += 1;
    transcribeRequest.current?.abort(); transcribeRequest.current = null;
    const recorder = pttRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* Le flux peut deja etre arrete par le navigateur. */ }
    }
    pttStream.current?.getTracks().forEach(track => track.stop());
    pttStream.current = null; pttRecorder.current = null; pttChunks.current = []; pttSize.current = 0;
    setPttState("idle");
    pumpSpeechQueue();
    if (messageText) setPttStatus(messageText);
  }

  async function startPushToTalk() {
    if (pttHeld.current || pttRecorder.current || transcribeRequest.current || !isMember || socketState !== "online") return false;
    if (!pushToTalkAvailable) { setPttStatus("Le mode microphone n’est pas disponible sur ce relais."); return false; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPttStatus("Le micro demande une page HTTPS securisee et un navigateur compatible.");
      return false;
    }
    if (typeof MediaRecorder === "undefined") {
      setPttStatus("Ce navigateur ne sait pas enregistrer l'audio requis pour le micro.");
      return false;
    }
    pttHeld.current = true; pttDiscard.current = false;
    const generation = ++pttGeneration.current;
    setPttStatus("Autorisation du micro..."); setPttState("starting");
    pauseSpeechForPushToTalk(); // Coupe la lecture active, mais conserve les annonces en attente.
    try {
      const audioConstraints: MediaTrackConstraints = selectedMic ? { deviceId: { exact: selectedMic }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      if (!pttHeld.current || generation !== pttGeneration.current) { stream.getTracks().forEach(track => track.stop()); setPttState("idle"); setPttStatus("Capture annul\u00e9e."); return false; }
      pttStream.current = stream;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (!pttHeld.current || generation !== pttGeneration.current) { stream.getTracks().forEach(track => track.stop()); pttStream.current = null; setPttState("idle"); setPttStatus("Capture annulee."); return false; }
      setMicDevices(devices.filter(device => device.kind === "audioinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` })));
      const supportedMime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      pttMime.current = recorder.mimeType || supportedMime || "audio/webm";
      pttChunks.current = []; pttSize.current = 0; pttRecorder.current = recorder;
      recorder.ondataavailable = event => {
        if (!event.data.size || pttDiscard.current) return;
        pttSize.current += event.data.size;
        if (pttSize.current > 5 * 1024 * 1024) {
          pttDiscard.current = true;
          pttHeld.current = false;
          pttGeneration.current += 1;
          if (pttTimer.current) clearTimeout(pttTimer.current);
          pttTimer.current = null;
          setPttStatus("Enregistrement trop volumineux (limite 5 Mo). Recommence en parlant plus brievement.");
          try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* Deja stoppe. */ }
          return;
        }
        pttChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        pttStream.current = null; pttRecorder.current = null;
        if (pttDiscard.current) { pttHeld.current = false; pttChunks.current = []; pttSize.current = 0; setPttState("idle"); pumpSpeechQueue(); return; }
        const blob = new Blob(pttChunks.current, { type: pttMime.current });
        pttChunks.current = []; pttSize.current = 0;
        if (!blob.size || blob.size > 5 * 1024 * 1024) { setPttState("idle"); setPttStatus("Enregistrement vide ou superieur a 5 Mo. Reessaie."); pumpSpeechQueue(); return; }
        pumpSpeechQueue();
        void transcribeRecording(blob);
      };
      recorder.onerror = () => { pttDiscard.current = true; cancelPushToTalk("Erreur pendant l'enregistrement du micro."); };
      recorder.start(250);
      setPttState("recording"); setPttStatus("Enregistrement... relache le micro pour transcrire. Maximum 20 secondes.");
      pttTimer.current = setTimeout(() => finishPushToTalk(), 20_000);
      return true;
    } catch (cause) {
      pttHeld.current = false;
      pttStream.current?.getTracks().forEach(track => track.stop()); pttStream.current = null;
      setPttState("idle");
      pumpSpeechQueue();
      const errorName = cause instanceof DOMException ? cause.name : "";
      setPttStatus(errorName === "NotAllowedError" ? "Acces au micro refuse. Autorise le micro dans le navigateur, puis maintiens le bouton a nouveau." : errorName === "NotFoundError" ? "Aucun micro disponible. Branche ou selectionne un microphone." : "Impossible de demarrer le micro. Verifie ses permissions et reessaie.");
      return false;
    }
  }

  function finishPushToTalk() {
    pttHeld.current = false;
    if (transcribeRequest.current) return;
    if (pttTimer.current) clearTimeout(pttTimer.current);
    pttTimer.current = null;
    const recorder = pttRecorder.current;
    if (!recorder || recorder.state === "inactive") {
      pttGeneration.current += 1;
      setPttState("idle");
      pumpSpeechQueue();
      return;
    }
    setPttStatus("Transcription en cours...");
    try { recorder.stop(); } catch { cancelPushToTalk("Impossible d'arreter l'enregistrement."); }
  }

  async function transcribeRecording(blob: Blob) {
    const generation = ++transcribeGeneration.current;
    setPttState("transcribing"); setPttStatus("Transcription en cours... le texte ne sera pas envoye sans ton accord.");
    const controller = new AbortController(); transcribeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const form = new FormData();
      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("audio", blob, `message.${extension}`);
      const response = await fetch(`${apiBase}/api/kitt-chat/transcribe`, {
        method: "POST", headers: { Authorization: `Bearer ${sessionToken}` }, body: form, signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as { text?: string; language?: string; truncated?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || `Le service de transcription a repondu ${response.status}.`);
      const text = typeof data?.text === "string" ? data.text.trim().slice(0, 500) : "";
      if (!text) throw new Error("Aucune parole n'a ete reconnue. Verifie le micro et recommence.");
      setMessage(current => current.trim() ? `${current.trim()} ${text}`.slice(0, 500) : text);
      setPttStatus(`${data?.truncated ? "Transcription tronquee a 500 caracteres. " : ""}Texte ajoute a la saisie${data?.language ? ` (${data.language})` : ""}. Relis-le puis clique sur Envoyer.`);
      requestAnimationFrame(() => document.getElementById("kc-message")?.focus());
    } catch (cause) {
      if (controller.signal.aborted) setPttStatus("Transcription interrompue. Tu peux reenregistrer un message.");
      else setPttStatus(cause instanceof Error ? cause.message : "La transcription a echoue. Reessaie.");
    } finally {
      clearTimeout(timeout); if (transcribeRequest.current === controller) transcribeRequest.current = null;
      if (transcribeGeneration.current === generation) setPttState("idle");
    }
  }

  function handlePttKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.code !== "Space" || event.repeat) return;
    event.preventDefault();
    void startPushToTalk();
  }

  function handlePttKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.code !== "Space") return;
    event.preventDefault(); finishPushToTalk();
  }

  function handlePttPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Le navigateur peut déjà gérer la capture. */ }
    void startPushToTalk();
  }

  function handlePttPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); finishPushToTalk();
  }

  function handlePttPointerCancel() {
    cancelPushToTalk("Capture annulée.");
  }

  function eraseMissionMemory() {
    if (!window.confirm("Effacer les notes et reglages de ton dossier de mission ?")) return;
    void missionMemoryRequest("DELETE");
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim().slice(0, 500);
    if (!clean || !canWriteMessages || socketState !== "online") return;
    socket.current?.send(JSON.stringify({ type: "message", text: clean }));
    setMessage("");
  }

  function selectImageFile(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setImageStatus("Choisis une image JPEG, PNG, WebP ou GIF."); return;
    }
    if (file.size > 8 * 1024 * 1024) { setImageStatus("L'image depasse la limite de 8 Mo."); return; }
    setImageFile(file); setImageCaption(""); setImageStatus("Apercu pret. Rien ne sera partage avant ton clic sur Publier.");
  }

  function clearImageDraft() {
    setImageFile(null); setImageCaption(""); setImageStatus("");
  }

  async function publishImage() {
    if (!imageFile || !apiBase || !sessionToken || socketState !== "online" || imageBusy || !imageSharingAvailable) return;
    if (imageFile.size > 8 * 1024 * 1024) { setImageStatus("L'image depasse la limite de 8 Mo."); return; }
    setImageBusy(true); setImageStatus("Envoi de la photo...");
    try {
      const form = new FormData();
      form.append("image", imageFile, imageFile.name);
      form.append("room", room.id);
      form.append("caption", imageCaption.trim().slice(0, 240));
      const response = await fetch(`${apiBase}/api/kitt-chat/images`, {
        method: "POST", headers: { Authorization: `Bearer ${sessionToken}` }, body: form,
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || data?.ok !== true) throw new Error(data?.error || `Le partage a echoue (${response.status}).`);
      setImageFile(null); setImageCaption("");
      setImageStatus("Photo publiee. Le serveur l'ajoute au salon; aucune copie locale n'a ete injectee dans l'historique.");
    } catch (cause) {
      setImageStatus(cause instanceof Error ? cause.message : "Impossible de partager cette photo.");
    } finally { setImageBusy(false); }
  }

  async function deleteSharedImage(image: SharedImage, messageId: string) {
    if (!sessionToken || !apiBase || image.ownerId !== ownerId) return;
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/images/${encodeURIComponent(image.id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || `Suppression refusee (${response.status}).`);
      setLines(current => current.map(line => line.id === messageId || line.image?.id === image.id ? { ...line, imageRemoved: true } : line));
      setSelectedImage(current => current?.id === image.id ? null : current);
    } catch (cause) {
      setImageStatus(cause instanceof Error ? cause.message : "Impossible de supprimer cette photo.");
    }
  }

  async function describeSharedImage(image: SharedImage, speaker: "KITT" | "KARR") {
    if (!sessionToken || !apiBase || !imageDescriptionAvailable || describingImageId) return;
    const progress = `${speaker} analyse la photo sur l'AGX...`;
    playRoomSound("vision-start");
    setDescribingImageId(image.id); setImageStatus(progress); setImageActionFeedback({ imageId: image.id, text: progress, error: false });
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/images/${encodeURIComponent(image.id)}/describe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ speaker, question: (imageQuestion.trim() || "Decris ce que tu vois sur cette image.").slice(0, 500) }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || `La description a echoue (${response.status}).`);
      const done = `Reponse de ${speaker} publiee dans le salon.`;
      playRoomSound("vision-done");
      setImageStatus(done); setImageActionFeedback({ imageId: image.id, text: done, error: false });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La description de cette photo a echoue.";
      playRoomSound("vision-error");
      setImageStatus(message); setImageActionFeedback({ imageId: image.id, text: message, error: true });
    } finally { setDescribingImageId(""); }
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
      setNotice("Test sonore joué. Messages, arrivées, Buzz et analyses photo sont sonorisés.");
    }
  }

  const headingStatus = service === "checking" ? "RECHERCHE DU RELAIS" : service === "online" ? "RELAIS PRÊT" : "SALON HORS LIGNE";
  const visibleLines = lines.filter(line => line.category !== "meal" || missionMemory.mealReminders);

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
        <p>{publicGuestsCanWrite ? "Rejoins la discussion librement : entre ton prénom ou pseudo avant d’entrer, puis parle avec la communauté, KITT et KARR. Dis « bonjour », « hallo », « hello », « hola », « ciao » ou « bom dia » : ils te répondent dans la langue reconnue, à voix haute." : "Viens découvrir l’ambiance sans compte. Pour participer, il faut être propriétaire d’une Pontiac et faire valider son profil avec une photo de la voiture sur le globe."}</p>
      </div>
      <div className="kc-status"><span className={service === "online" ? "is-online" : ""}/><strong>{headingStatus}</strong>
        <small>{service === "online" ? (publicGuestsCanWrite ? "Salon public · pseudo temporaire · aucune inscription" : "Visite libre · écriture réservée aux propriétaires validés") : "Le salon sera disponible lorsque le service sera relié."}</small>
      </div>
    </section>
    <div className={`kc-window${buzzActive ? " kc-buzz-effect" : ""}${buzzActive && buzzIntensity === "hyper" ? " kc-buzz-hyper" : ""}`} data-room={room.id}>
      <div className="kc-titlebar"><span className="kc-app-icon"><MessageCircle size={15}/></span><strong>KITT-FRANCO-BELGE · DES CHEVALIERS</strong><div className="kc-window-buttons"><span>−</span><span>□</span><span>×</span></div></div>
      <div className="kc-toolbar"><span>Fichier</span><span>Salon</span><span>Affichage</span><span>Aide</span><span className="kc-toolbar-right">KITT Network v1.0</span></div>
      {(service === "online" || socketState === "connecting") && <div className="kc-room-tabs" role="tablist" aria-label="Salons de discussion">
        {rooms.map(item => <button key={item.id} role="tab" aria-selected={room.id === item.id} className={room.id === item.id ? "active" : ""} onClick={() => setRoom(item)}>{item.label}</button>)}
      </div>}
      {socketState !== "closed" ? <div className="kc-content">
        <section className="kc-conversation" aria-label={`Messages du salon ${room.label}`}>
          <div className="kc-room-topic"><strong>{room.label}</strong><span>{room.topic}</span><label className="kc-translation-choice">Traduire pour moi<select aria-label="Langue de traduction" value={chatLanguage} onChange={event => { setChatLanguage(event.target.value); setLines(current => current.map(line => ({ ...line, translation: undefined, translationLanguage: undefined, translationUnavailable: false }))); }}>{CHAT_LANGUAGES.map(language => <option key={language.id} value={language.id}>{language.label}</option>)}</select></label></div>
          {botStatus ? <div className={`kc-bot-status kc-bot-${botStatus.toLowerCase()}`} role="status" aria-live="polite">
            <span className="kc-bot-scanner" aria-hidden="true"><i/><i/><i/><i/><i/></span>
            <strong>{botStatus} pr&#233;pare sa r&#233;ponse&#8230;</strong>
          </div> : pendingTurn && <div className={`kc-turn-indicator kc-turn-${pendingTurn.speaker.toLowerCase()}`} role="status" aria-live="polite">
            <span className="kc-turn-led" aria-hidden="true"/>
            <strong>{pendingTurn.speaker} attend une réponse</strong>
            <span className="kc-turn-countdown" aria-hidden="true">{turnRemaining}s</span>
          </div>}
                    {speakingBot && <div className={`kc-speaking-status kc-speaking-${speakingBot.toLowerCase()}`} role="status" aria-live="polite"><span className="kc-speaking-scanner" aria-hidden="true"><i/><i/><i/><i/><i/></span><strong>{speakingBot} parle</strong><span className="kc-wave" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index}/>)}</span><small>Voix et texte synchronisés</small></div>}<div className="kc-messages" ref={messageBox} role="log" aria-live="polite" aria-relevant="additions text">
            {socketState === "connecting" && <p className="kc-empty">Le salon s’ouvre…</p>}
            {socketState === "online" && !visibleLines.length && <p className="kc-empty">Le salon s’éveille… Écris un message, ou interpelle KITT avec « KITT ! ».</p>}
          {visibleLines.map(line => {
            const displayedText = line.liveBot ? typedBotText[line.id] ?? "" : line.text;
            const typing = Boolean(line.liveBot && displayedText.length < line.text.length);
            return <article className={`kc-line${line.kind === "system" ? " system" : ""}${identityTone(line.name) ? ` kc-line-${identityTone(line.name)}` : ""}${speakingMessageId === line.id ? " kc-speaking-line" : ""}`} key={line.id} aria-live={line.liveBot ? "off" : undefined}>
              <time dateTime={new Date(line.timestamp).toISOString()}>{clockLabel(line.timestamp)}</time><strong className={identityTone(line.name)}>{line.name}</strong><div className="kc-line-body"><span className="kc-line-text">{renderChatText(displayedText)}{typing && <i className="kc-type-cursor" aria-hidden="true"/>}</span>{line.translation && <small className="kc-translation-line"><span>Traduction automatique · {line.translationLanguage} :</span> {renderChatText(line.translation)}</small>}{line.translationUnavailable && <small className="kc-translation-line unavailable">Traduction temporairement indisponible · {line.translationLanguage}</small>}
                {line.image && <div className="kc-shared-image">
                  {line.imageRemoved ? <p className="kc-image-removed">Photo supprimée par son propriétaire.</p> : <>
                    {communityImageHref(apiBase, line.image) ? <button type="button" className="kc-image-thumb" aria-label={`Agrandir la photo : ${line.image.alt || "photo partagée"}`} onClick={event => { imageTrigger.current = event.currentTarget; setSelectedImage(line.image || null); }}><img src={communityImageHref(apiBase, line.image)} alt={line.image.alt || "Photo partagée dans le salon"} loading="lazy" width={line.image.width} height={line.image.height} onError={() => setLines(current => current.map(item => item.id === line.id ? { ...item, imageRemoved: true } : item))}/><span>Agrandir la photo</span></button> : <p className="kc-image-removed">Adresse de photo non valide.</p>}
                    <div className="kc-image-actions">
                      <button type="button" disabled={!isMember || !imageDescriptionAvailable || describingImageId === line.image.id} title={!imageDescriptionAvailable ? "La vision par image est indisponible pour le moment." : !isMember ? "Connecte-toi pour demander une description." : "Demander une description visuelle"} onClick={() => void describeSharedImage(line.image!, "KITT")}>{describingImageId === line.image.id ? "KITT examine…" : "Décrire avec KITT"}</button>
                      <button type="button" disabled={!isMember || !imageDescriptionAvailable || describingImageId === line.image.id} title={!imageDescriptionAvailable ? "La vision par image est indisponible pour le moment." : !isMember ? "Connecte-toi pour demander une description." : "Demander une description visuelle"} onClick={() => void describeSharedImage(line.image!, "KARR")}>{describingImageId === line.image.id ? "KARR examine…" : "Décrire avec KARR"}</button>
                      {isMember && ownerId === line.image.ownerId && <button type="button" className="delete" onClick={() => void deleteSharedImage(line.image!, line.id)}>Supprimer ma photo</button>}
                    </div>
                    {imageActionFeedback?.imageId === line.image.id && <small className={`kc-image-status${imageActionFeedback.error ? " error" : ""}`} role="status" aria-live="polite">{imageActionFeedback.text}</small>}
                    {!imageDescriptionAvailable && <small className="kc-image-vision-note">Les photos restent visibles. La description par KITT/KARR est temporairement indisponible.</small>}
                  </>}
                </div>}
              </div>
            </article>})}
          </div>
          {isMember ? <form className="kc-compose" onSubmit={sendMessage}>
            <div className="kc-ptt-guide" aria-label="Mode d’emploi du microphone">
              <span>Mode CB : maintiens <kbd>Espace</kbd> hors de la saisie, ou le bouton micro. Relâche pour transcrire; relis le texte puis clique sur Envoyer.</span>
              <button type="button" onClick={() => enqueueSpeech({ text: "Pour parler comme à la CB, maintiens la barre Espace hors du champ de saisie, ou maintiens le bouton micro. Relâche pour transcrire, relis le texte puis clique sur Envoyer. Active les voix pour entendre KITT et KARR.", speaker: "KITT", kind: "bot", engine: "agx", volume: 1 })} disabled={!sessionToken || socketState !== "online"}>Écouter le mode d’emploi</button>
            </div>
            <div className="kc-compose-row">
              <label className="kc-sr-only" htmlFor="kc-message">Ton message</label>
              <button ref={pttButton} type="button" className={`kc-ptt${pttState === "recording" ? " is-recording" : ""}`} aria-pressed={pttState === "recording"} aria-label={pttState === "recording" ? "Relâcher pour transcrire" : "Maintenir pour parler"} disabled={socketState !== "online" || !pushToTalkAvailable || pttState === "transcribing"} onPointerDown={handlePttPointerDown} onPointerUp={handlePttPointerUp} onPointerCancel={handlePttPointerCancel} onKeyDown={handlePttKeyDown} onKeyUp={handlePttKeyUp} onContextMenu={event => event.preventDefault()}><Mic size={17}/>{pttState === "recording" ? "RELÂCHE POUR TRANSCRIRE" : pttState === "starting" ? "MICRO…" : !pushToTalkAvailable ? "MICRO INDISPONIBLE" : "MAINTENIR POUR PARLER"}</button>
              <input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`Écrire dans ${room.label}…`} disabled={socketState !== "online"}/>
              <span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button>
            </div>
            {micDevices.length > 0 && <label className="kc-mic-select">Microphone<select value={selectedMic} onChange={event => setSelectedMic(event.target.value)}><option value="">Microphone par défaut</option>{micDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label}</option>)}</select></label>}
            {pttStatus && <p className={`kc-ptt-status${pttState === "recording" ? " is-recording" : ""}`} role="status" aria-live="polite">{pttStatus}</p>}
            <div className="kc-quick-prompts" role="group" aria-label="Questions rapides à insérer">
              <span>MISSIONS RAPIDES</span>
              <button type="button" onClick={() => insertQuickPrompt("KITT, aide-moi à préparer un diagnostic pour ma Pontiac. Pose-moi les questions une par une.")} disabled={socketState !== "online"}>Atelier technique</button>
              <button type="button" onClick={() => insertQuickPrompt("KITT, propose-moi un quiz Knight Rider de cinq questions, une par une, et attends ma réponse entre chaque question.")} disabled={socketState !== "online"}>Quiz K2000</button>
              <button type="button" onClick={() => insertQuickPrompt("KITT, présente-toi à un nouveau membre et explique ce que tu peux faire dans ce salon.")} disabled={socketState !== "online"}>Présentation</button>
              <button type="button" onClick={() => insertQuickPrompt("KARR, examine les hypothèses de notre diagnostic : quelles vérifications manquent et pourquoi ?")} disabled={socketState !== "online"}>Contre-expertise KARR</button>
              <small>Un clic prépare le texte dans la saisie; rien n’est envoyé automatiquement.</small>
            </div>
            <div className="kc-photo-share">
              <input ref={imagePicker} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="kc-sr-only" aria-label="Choisir une photo à partager" onChange={selectImageFile}/>
              {!imageFile && <button type="button" onClick={() => imagePicker.current?.click()} disabled={!imageSharingAvailable || imageBusy || socketState !== "online"}>Choisir une photo</button>}
              <small>{imageSharingAvailable ? "JPG, PNG, WebP ou GIF · maximum 8 Mo. La photo est publique dans le salon. Rien n’est envoyé avant ton clic sur Publier." : "Le partage de photos est indisponible sur ce relais."}</small>
              {imageFile && <div className="kc-image-draft">
                {imagePreview && <img src={imagePreview} alt="Aperçu de la photo qui sera partagée"/>}
                <div><strong>{imageFile.name}</strong><small>{(imageFile.size / 1024 / 1024).toFixed(2)} Mo</small></div>
                <label>Légende (facultative)<textarea maxLength={240} rows={2} value={imageCaption} onChange={event => setImageCaption(event.target.value)} placeholder="Décris brièvement la photo…"/></label>
                <div className="kc-image-draft-actions"><button type="button" onClick={() => void publishImage()} disabled={imageBusy}>{imageBusy ? "ENVOI…" : "Publier la photo"}</button><button type="button" onClick={clearImageDraft} disabled={imageBusy}>Annuler</button></div>
              </div>}
              {imageStatus && <small className="kc-image-status" role="status" aria-live="polite">{imageStatus}</small>}
              {!imageDescriptionAvailable && <small className="kc-image-vision-note">Le partage reste actif; la lecture visuelle par KITT/KARR est indisponible selon l’état du relais.</small>}
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
          </form> : publicGuestsCanWrite && guestName ? <form className="kc-compose kc-public-compose" onSubmit={sendMessage}>
            <div className="kc-compose-row">
              <label className="kc-sr-only" htmlFor="kc-message">Ton message</label>
              <input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`Écrire dans ${room.label}…`} disabled={socketState !== "online"}/>
              <span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button>
            </div>
            <div className="kc-public-tools">
              <button type="button" className="kc-emote-toggle" aria-expanded={emotesOpen} aria-label="Ouvrir les émoticônes Knight Rider" onClick={() => setEmotesOpen(value => !value)}><Smile size={15}/> Émoticônes KITT</button>
              {emotesOpen && <div className="kc-emote-picker" role="group" aria-label="Émoticônes Knight Rider">
                {KNIGHT_RIDER_EMOTES.map(emote => <button type="button" key={emote.code} aria-label={`${emote.label}, insérer ${emote.code}`} title={`${emote.label} ${emote.code}`} onClick={() => addEmote(emote.code)}><img src={emote.src} alt="" loading="lazy"/><span><strong>{emote.label}</strong><small>{emote.code}</small></span></button>)}
              </div>}
            </div>
            <small>Connecté comme <strong>{guestDisplayName || guestName}</strong>. Pour parler à KITT ou KARR, écris leur nom dans ton message.</small>
          </form> : <div className="kc-readonly"><ShieldCheck size={17}/><span>Choisis ton pseudo pour rejoindre la conversation.</span></div>}
        </section>
        <aside className="kc-roster">
          <div className="kc-roster-heading"><Users size={17}/><strong>Membres présents</strong><span>{members.length}</span></div>
          <div className="kc-roster-list">{members.length ? members.map((item,index)=><div className={`kc-person${identityTone(item.name) ? ` kc-person-${identityTone(item.name)}` : ""}${item.away ? " is-away" : ""}`} key={`${item.name}-${index}`}>
            <span className="kc-avatar">{item.name.slice(0,1).toUpperCase()}</span><span className="kc-person-name">{item.name}{item.away && <span className="kc-away-indicator" role="img" aria-label="Absent depuis cinq minutes" title="Absent depuis 5 minutes">☕</span>}{item.role && item.role !== "Invite" && <small className="kc-person-role">{item.role}</small>}</span><i className={item.away ? "is-away" : "is-online"} title={item.away ? "Absent · pause-café" : "En ligne"} aria-label={item.away ? "Absent" : "Actif"}/>
          </div>) : <small className="kc-no-members">Aucun propriétaire connecté pour l’instant.</small>}</div>
          <button type="button" className="kc-sound" aria-pressed={sound} onClick={toggleSound}>{sound ? <Bell size={15}/> : <BellOff size={15}/>} {sound ? "Sons activés" : "Activer les sons"}<small>messages · arrivées · Buzz · analyses photo</small></button>
          <section className="kc-arrival-voice" aria-label="Annonce vocale des arrivées">
            <label><input type="checkbox" checked={speechEnabled} onChange={event => toggleSpeechForVisit(event.target.checked)}/><Volume2 size={15}/><span>Écouter les nouvelles réponses KITT/KARR</span></label>
            <small>{speechVoices ? `Voix AGX : ${speechVoices.KITT} · ${speechVoices.KARR}` : "Voix AGX du salon; activées par défaut pendant cette visite."}</small>
            {speechStatus && <small role="status" aria-live="polite">{speechStatus}</small>}
            <label><input type="checkbox" checked={arrivalVoiceEnabled} onChange={event => saveArrivalVoicePreference(event.target.checked)}/><Volume2 size={15}/><span>Annoncer les nouveaux membres</span></label>
            <div className="kc-arrival-volume"><label htmlFor="kc-arrival-volume">Volume vocal</label><output htmlFor="kc-arrival-volume">{arrivalVoiceVolume}%</output><input id="kc-arrival-volume" type="range" min="0" max="100" step="1" value={arrivalVoiceVolume} onChange={event => saveArrivalVoicePreference(arrivalVoiceEnabledRef.current, Number(event.target.value))} aria-label={`Volume des annonces ${arrivalVoiceVolume} pour cent`}/></div>
            <button type="button" onClick={testArrivalVoice} disabled={!sessionToken}>Tester l’annonce {sessionToken ? "" : "(membre connecté)"}</button>
            {arrivalVoiceStatus && <small role="status" aria-live="polite">{arrivalVoiceStatus}</small>}
            {voiceError && <div className="kc-voice-error" role="alert"><span>{voiceError}</span>{failedVoiceJob && <div><button type="button" onClick={retryFailedVoice}>Réessayer l’audio AGX</button><button type="button" onClick={useBrowserVoiceFallback}>Voix navigateur (secours explicite)</button></div>}</div>}
          </section>
          <section className="kc-admin-tools" aria-label="Outils administrateur">
            {adminVerified ? <>
              <div><strong>ADMINISTRATEUR VÉRIFIÉ</strong><small>Effacement du salon sélectionné uniquement.</small></div>
              <button type="button" className="kc-admin-clear" onClick={() => void clearRoomHistory()} disabled={adminBusy || socketState !== "online"}>Effacer l’historique de « {room.label} »</button>
              <button type="button" className="kc-admin-forget" onClick={forgetAdminToken} disabled={adminBusy}>Oublier le jeton sur cet appareil</button>
            </> : <form onSubmit={verifyAdminAccess}>
              <label htmlFor="kc-admin-token">Accès administrateur
                <input id="kc-admin-token" type="password" autoComplete="current-password" value={adminTokenDraft} onChange={event => setAdminTokenDraft(event.target.value)} placeholder="Jeton administrateur"/>
              </label>
              <button type="submit" disabled={adminBusy || service !== "online"}>{adminBusy ? "VÉRIFICATION…" : "Vérifier le jeton"}</button>
            </form>}
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
              <label className="kc-memory-check"><input type="checkbox" checked={missionMemory.mealReminders} onChange={event => toggleMealReminders(event.target.checked)}/><span>Rappels de pause repas occasionnels</span></label>
              <p className="kc-memory-frequency">KITT ou KARR peut proposer une pause pendant les plages de repas. Décoche pour masquer ces rappels dans l’historique et couper leur voix.</p>
              <p className="kc-memory-voice-note">Préférence de voix enregistrée : {savedVoicePreference ? "oui" : "non"}. La lecture vocale du salon est activée par défaut; tu peux la couper avec la case du panneau global.</p>
              <div className="kc-memory-actions">
                <button type="button" onClick={() => void missionMemoryRequest("GET")} disabled={memoryBusy}><FolderOpen size={14}/>Charger</button>
                <button type="button" className="save" onClick={() => void missionMemoryRequest("PUT")} disabled={memoryBusy}><Save size={14}/>Enregistrer</button>
                <button type="button" className="erase" onClick={eraseMissionMemory} disabled={memoryBusy}><Trash2 size={14}/>Effacer</button>
              </div>
              {memoryFeedback && <p className={`kc-memory-feedback${memoryFeedbackError ? " error" : ""}`} role={memoryFeedbackError ? "alert" : "status"} aria-live="polite">{memoryFeedback}</p>}
              <p className="kc-memory-retention">Historique public : jusqu’à 500 messages par salon, conservés au maximum 90 jours.</p>
            </div>
          </details>}
          {isMember ? <button type="button" className="kc-leave" onClick={disconnect}>Quitter le salon</button> : publicGuestsCanWrite && guestName ? <div className="kc-guest-join"><div className="kc-join-heading"><span>PILOTE</span><small>ACCÈS LIBRE</small></div><p>Tu participes sous le pseudo <strong>{guestDisplayName || guestName}</strong>. Il ne sera pas retenu comme compte.</p><button type="button" onClick={leavePublicGuest}>Quitter · changer de pseudo</button></div> : !publicGuestsCanWrite ? <form className="kc-guest-join" onSubmit={enter}>
            <div className="kc-join-heading"><span>ACCÈS PROPRIÉTAIRE</span><small>PROFIL PHOTO VALIDÉ</small></div>
            {owners.length ? <label>Ton Pontiac sur le globe
              <select required value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} · {owner.car} {owner.year}</option>)}
              </select>
            </label> : <p>Aucun profil avec photo n’est encore approuvé. Inscris ta voiture sur le globe, puis attends la validation.</p>}
            <label>Code membre<input required type="text" maxLength={4} pattern="[0-9]{4}" autoComplete="off" inputMode="numeric" value={invite} onChange={event => setInvite(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Code à 4 chiffres" disabled={!owners.length}/></label>
            <button type="submit" disabled={!owners.length || !invite.trim() || service !== "online"}>Entrer dans le salon <ArrowRight size={15}/></button>
            <a className="kc-globe-cta" href="/communaute-pontiac#inscription"><CarFront size={15}/> Inscrire ma Pontiac sur le globe</a>
            <p>Étapes : inscris ta Pontiac avec une photo, attends la validation du profil, puis utilise le code communiqué aux membres. L’accès reste associé à ton profil approuvé.</p>
          </form> : <div className="kc-guest-join"><p>Choisis un pseudo pour cette visite afin d’entrer dans le salon.</p></div>}
        </aside>
      </div> : publicGuestsCanWrite && service === "online" ? <section className="kc-offline kc-open-entry"><Radio size={24}/><form className="kc-guest-join" onSubmit={enterPublicGuest}>
        <div className="kc-join-heading"><span>ENTRÉE LIBRE</span><small>SANS COMPTE</small></div>
        <p>Saisis le prénom ou pseudo à afficher pendant cette visite. Il n’est pas enregistré : tu le retaperas à chaque connexion.</p>
        <label htmlFor="kc-guest-name">Prénom ou pseudo (2 à 24 caractères)<input id="kc-guest-name" maxLength={24} minLength={2} autoComplete="nickname" autoFocus value={guestNameDraft} onChange={event => setGuestNameDraft(event.target.value)} placeholder="Ex. Lilou ou Pilote Liège" required/></label>
        <button type="submit" disabled={service !== "online"}>Entrer sous ce nom <ArrowRight size={15}/></button>
      </form>
      <button type="button" className="kc-owner-toggle" aria-expanded={showOwnerLogin} onClick={() => setShowOwnerLogin(value => !value)}>
        {showOwnerLogin ? "Masquer l’accès propriétaire" : "Déjà propriétaire Pontiac ? Connexion propriétaire"}
      </button>
      {showOwnerLogin && <form className="kc-guest-join kc-owner-entry" onSubmit={enter}>
        <div className="kc-join-heading"><span>ACCÈS PROPRIÉTAIRE</span><small>PROFIL VALIDÉ</small></div>
        {owners.length ? <label>Choisis ton profil Pontiac
          <select required value={ownerId} onChange={event => setOwnerId(event.target.value)}>
            {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} · {owner.car} {owner.year}</option>)}
          </select>
        </label> : <p>Aucun profil Pontiac approuvé n’est disponible. Inscris ta voiture sur le globe et attends sa validation.</p>}
        <label>Code membre<input required type="text" maxLength={4} pattern="[0-9]{4}" autoComplete="off" inputMode="numeric" value={invite} onChange={event => setInvite(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Code à 4 chiffres" disabled={!owners.length}/></label>
        <button type="submit" disabled={!owners.length || !invite.trim() || service !== "online"}>Connexion propriétaire <ArrowRight size={15}/></button>
        <a className="kc-globe-cta" href="/communaute-pontiac#inscription"><CarFront size={15}/> Inscrire ma Pontiac sur le globe</a>
      </form>}
      </section> : isMember ? <section className="kc-offline"><Radio size={24}/><div><strong>{service === "online" ? `Session mémorisée pour ${member}` : "Le salon est momentanément hors ligne."}</strong><p>{service === "online" ? "Ton code a déjà été utilisé. Cet appareil se souviendra de toi." : "Ta session est conservée. Réessaie quand le relais sera disponible."}</p></div>{service === "online" ? <button type="button" onClick={() => setReconnectKey(value => value + 1)}>Revenir au salon <ArrowRight size={15}/></button> : <button type="button" onClick={() => window.location.reload()}>Réessayer <ArrowRight size={15}/></button>}<button type="button" onClick={forgetDevice}>Oublier cet appareil</button></section> : <section className="kc-offline"><Radio size={24}/><div><strong>{service === "checking" ? "Recherche du salon…" : "Le salon est momentanément hors ligne."}</strong><p>Tu peux déjà préparer ton inscription au globe Pontiac.</p></div><a href="/communaute-pontiac#inscription">Voir l’inscription <ArrowRight size={15}/></a></section>}
      {(error || notice) && <p className={error ? "kc-feedback error" : "kc-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <footer className="kc-footer"><span><Wifi size={14}/> {socketState === "online" ? (isMember ? "PROPRIÉTAIRE VALIDÉ" : publicGuestsCanWrite ? `PILOTE · ${guestDisplayName || guestName}` : "VISITEUR · LECTURE SEULE") : socketState === "connecting" ? "CONNEXION…" : <><WifiOff size={14}/> DÉCONNECTÉ</>}</span><span>BY MANIX · KITT FRANCO-BELGE</span><a href="/mentions-legales"><CircleHelp size={14}/> Règles du salon</a></footer>
    </div>
    {selectedImage && <div className="kc-image-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setSelectedImage(null); }}>
      <section className="kc-image-modal" role="dialog" aria-modal="true" aria-labelledby="kc-image-modal-title">
        <header><h2 id="kc-image-modal-title">Photo du salon</h2><button ref={imageDialogClose} type="button" onClick={() => setSelectedImage(null)} aria-label="Fermer l’agrandissement">Fermer <span aria-hidden="true">×</span></button></header>
        {communityImageHref(apiBase, selectedImage) ? <img src={communityImageHref(apiBase, selectedImage)} alt={selectedImage.alt || "Photo partagée dans le salon"} width={selectedImage.width} height={selectedImage.height} onError={() => { setImageStatus("Photo supprimée ou devenue indisponible."); setSelectedImage(null); }}/> : <p>Adresse de photo invalide ou non disponible.</p>}
        {selectedImage.alt && <p>{selectedImage.alt}</p>}
        <label className="kc-image-question">Question facultative<textarea maxLength={500} rows={2} value={imageQuestion} onChange={event => setImageQuestion(event.target.value)} placeholder="Decris ce que tu vois sur cette image..."/><small>{imageQuestion.length}/500 caracteres</small></label>
        {imageDescriptionAvailable ? <div className="kc-image-actions"><button type="button" disabled={!isMember || Boolean(describingImageId)} onClick={() => void describeSharedImage(selectedImage, "KITT")}>Décrire avec KITT</button><button type="button" disabled={!isMember || Boolean(describingImageId)} onClick={() => void describeSharedImage(selectedImage, "KARR")}>Décrire avec KARR</button></div> : <small className="kc-image-vision-note">La description visuelle n’est pas disponible sur ce relais.</small>}
        {isMember && ownerId === selectedImage.ownerId && <button type="button" className="kc-image-delete-modal" onClick={() => void deleteSharedImage(selectedImage, "")}>Supprimer ma photo</button>}
        {imageStatus && <p className="kc-image-status" role="status" aria-live="polite">{imageStatus}</p>}
      </section>
    </div>}
    <p className="kc-disclaimer">Salon communautaire inspiré des chats des années 1990. MSN est une marque de Microsoft ; KITT et Knight Rider appartiennent à leurs ayants droit. Aucun partenariat n’est revendiqué.</p>
  </main>;
}
