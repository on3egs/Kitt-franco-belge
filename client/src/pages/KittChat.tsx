import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Bell, BellOff, CarFront, Check, CircleHelp, Download, Link2, MessageCircle, Radio, ShieldCheck, Smile, Users, Wifi, WifiOff, Zap } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./KittChat.css";

type Room = { id: string; label: string; topic: string };
type ChatLine = { id: string; name: string; text: string; timestamp: number; kind?: "system" | "message" };
type Member = { name: string; role?: string; admin?: boolean };
type Owner = { id: string; name: string; car: string; year: string; photos: string[] };
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

function clockLabel(timestamp: number) {
  return new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
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
  const [invite, setInvite] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState(false);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [roomToast, setRoomToast] = useState("");
  const [buzzActive, setBuzzActive] = useState(false);
  const [buzzCooldown, setBuzzCooldown] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const messageBox = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const roomToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMember = Boolean(sessionToken);

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

  function playRoomSound(kind: "message" | "join" | "buzz" | "test") {
    if (!soundEnabled.current) return;
    try {
      audio.current ||= new AudioContext();
      const context = audio.current;
      if (context.state === "suspended") void context.resume();
      const notes = kind === "buzz" ? [220, 165] : kind === "join" || kind === "test" ? [660, 880] : [700];
      const startAt = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = startAt + index * (kind === "buzz" ? 0.16 : 0.14);
        const noteLength = kind === "buzz" ? 0.22 : kind === "test" || kind === "join" ? 0.16 : 0.11;
        const peak = kind === "buzz" ? 0.16 : kind === "test" ? 0.12 : kind === "join" ? 0.095 : 0.07;
        oscillator.type = kind === "buzz" ? "triangle" : "sine";
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

  function triggerBuzzEffect() {
    setBuzzActive(false);
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
        setSocketState("online");
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []);
        return;
      }
      if (packet.type === "presence") { setMembers(Array.isArray(packet.members) ? packet.members as Member[] : []); return; }
      if (packet.type === "buzz") {
        const sender = typeof packet.name === "string" ? packet.name : "Un membre";
        if (sender !== member) {
          triggerBuzzEffect();
          showRoomToast(`${sender} vous fait signe avec un Buzz KITT !`);
          playRoomSound("buzz");
        }
        return;
      }
      if (packet.type === "message" && packet.message && typeof packet.message === "object") {
        const line = packet.message as ChatLine;
        setLines(current => [...current.slice(-98), line]);
        if (line.kind === "system" && line.text.endsWith(" entre dans le salon.") && !line.text.startsWith(`${member} `)) {
          const joinedName = line.text.slice(0, -" entre dans le salon.".length);
          showRoomToast(`${joinedName} vient de rejoindre le salon.`);
          playRoomSound("join");
        } else if (line.name !== member && line.kind !== "system") {
          playRoomSound("message");
        }
        return;
      }
      if (packet.type === "room") {
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setRoom(rooms.find(item => item.id === packet.room) || FALLBACK_ROOMS[0]);
        return;
      }
      if (packet.type === "error") setError(typeof packet.message === "string" ? packet.message : "Message refusé.");
    };
    client.onerror = () => setError("Connexion interrompue. Vérifie le relais et réessaie.");
    client.onclose = event => {
      if (socket.current === client) { socket.current = null; setSocketState("closed"); }
      if (event.code === 4001 && isMember) {
        setSessionToken(""); setMember("");
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        setError("La session ou le profil Pontiac n’est plus valide. Contacte Manix après l’approbation du profil.");
      } else if (event.code === 1013) setError("Le salon est momentanément complet. Réessaie dans un instant.");
    };
    return () => {
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
    void audio.current?.close();
  }, []);

  function disconnect() {
    socket.current?.close(1000, "Déconnexion");
    socket.current = null;
    setSocketState("closed"); setLines([]); setMembers([]);
  }

  function forgetDevice() {
    socket.current?.close(1000, "Oubli de cet appareil");
    socket.current = null;
    localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
    setSessionToken(""); setMember(""); setSocketState("closed"); setLines([]); setMembers([]);
  }

  async function enter(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiBase || !ownerId || !invite.trim()) {
      setError("Choisis ton profil Pontiac approuvé et saisis le code personnel reçu de Manix.");
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
      setMember(data.name); setSessionToken(data.token); setNotice("Profil Pontiac vérifié. Bienvenue ! Cet appareil mémorisera ta session : tu n’auras pas à ressaisir ton code."); setInvite("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de rejoindre le salon.");
    }
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
    <div className={`kc-window${buzzActive ? " kc-buzz-effect" : ""}`}>
      <div className="kc-titlebar"><span className="kc-app-icon"><MessageCircle size={15}/></span><strong>KITT-FRANCO-BELGE · SALON COMMUNAUTAIRE</strong><div className="kc-window-buttons"><span>−</span><span>□</span><span>×</span></div></div>
      <div className="kc-toolbar"><span>Fichier</span><span>Salon</span><span>Affichage</span><span>Aide</span><span className="kc-toolbar-right">KITT Network v1.0</span></div>
      {(service === "online" || socketState === "connecting") && <div className="kc-room-tabs" role="tablist" aria-label="Salons de discussion">
        {rooms.map(item => <button key={item.id} role="tab" aria-selected={room.id === item.id} className={room.id === item.id ? "active" : ""} onClick={() => setRoom(item)}>{item.label}</button>)}
      </div>}
      {socketState !== "closed" ? <div className="kc-content">
        <section className="kc-conversation" aria-label={`Messages du salon ${room.label}`}>
          <div className="kc-room-topic"><strong>{room.label}</strong><span>{room.topic}</span></div>
          <div className="kc-messages" ref={messageBox} role="log" aria-live="polite" aria-relevant="additions text">
            {socketState === "connecting" && <p className="kc-empty">Le salon s’ouvre…</p>}
            {socketState === "online" && !lines.length && <p className="kc-empty">Le salon s’éveille… Lance la conversation quand ton profil sera validé.</p>}
            {lines.map(line => <article className={`kc-line ${line.kind === "system" ? "system" : ""}`} key={line.id}>
              <time dateTime={new Date(line.timestamp).toISOString()}>{clockLabel(line.timestamp)}</time><strong>{line.name}</strong><span>{renderChatText(line.text)}</span>
            </article>)}
          </div>
          {isMember ? <form className="kc-compose" onSubmit={sendMessage}>
            <div className="kc-compose-row">
              <label className="kc-sr-only" htmlFor="kc-message">Ton message</label>
              <input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`Écrire dans ${room.label}…`} disabled={socketState !== "online"}/>
              <span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button>
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
          <div className="kc-roster-list">{members.length ? members.map((item,index)=><div className={`kc-person${item.admin ? " kc-person-bot" : ""}`} key={`${item.name}-${index}`}>
            <span className="kc-avatar">{item.name.slice(0,1).toUpperCase()}</span><span>{item.name}{item.role && <small className="kc-person-role">{item.role}</small>}</span><i title="En ligne"/>
          </div>) : <small className="kc-no-members">Aucun propriétaire connecté pour l’instant.</small>}</div>
          <button type="button" className="kc-sound" aria-pressed={sound} onClick={toggleSound}>{sound ? <Bell size={15}/> : <BellOff size={15}/>} {sound ? "Sons activés" : "Activer les sons"}<small>messages · arrivées · Buzz</small></button>
          {isMember ? <button type="button" className="kc-leave" onClick={disconnect}>Quitter le salon</button> : <form className="kc-guest-join" onSubmit={enter}>
            <div className="kc-join-heading"><span>ACCÈS PROPRIÉTAIRE</span><small>PROFIL PHOTO VALIDÉ</small></div>
            {owners.length ? <label>Ton Pontiac sur le globe
              <select required value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} · {owner.car} {owner.year}</option>)}
              </select>
            </label> : <p>Aucun profil avec photo n’est encore approuvé. Inscris ta voiture sur le globe, puis attends la validation.</p>}
            <label>Code personnel<input required maxLength={80} autoComplete="one-time-code" value={invite} onChange={event => setInvite(event.target.value)} placeholder="Code remis après validation" disabled={!owners.length}/></label>
            <button type="submit" disabled={!owners.length || !invite.trim() || service !== "online"}>Entrer dans le salon <ArrowRight size={15}/></button>
            <a className="kc-globe-cta" href="/communaute-pontiac#inscription"><CarFront size={15}/> Inscrire ma Pontiac sur le globe</a>
            <p>Ton profil est déjà approuvé ? Demande ton code à Manix via le groupe <a href="https://www.facebook.com/groups/kittfrancobelge" target="_blank" rel="noopener noreferrer">KITT Franco-Belge</a>.</p>
          </form>}
        </aside>
      </div> : isMember ? <section className="kc-offline"><Radio size={24}/><div><strong>{service === "online" ? `Session mémorisée pour ${member}` : "Le salon est momentanément hors ligne."}</strong><p>{service === "online" ? "Ton code a déjà été utilisé. Cet appareil se souviendra de toi." : "Ta session est conservée. Réessaie quand le relais sera disponible."}</p></div>{service === "online" ? <button type="button" onClick={() => setReconnectKey(value => value + 1)}>Revenir au salon <ArrowRight size={15}/></button> : <button type="button" onClick={() => window.location.reload()}>Réessayer <ArrowRight size={15}/></button>}<button type="button" onClick={forgetDevice}>Oublier cet appareil</button></section> : <section className="kc-offline"><Radio size={24}/><div><strong>{service === "checking" ? "Recherche du salon…" : "Le salon est momentanément hors ligne."}</strong><p>Tu peux déjà préparer ton inscription au globe Pontiac.</p></div><a href="/communaute-pontiac#inscription">Voir l’inscription <ArrowRight size={15}/></a></section>}
      {(error || notice) && <p className={error ? "kc-feedback error" : "kc-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <footer className="kc-footer"><span><Wifi size={14}/> {socketState === "online" ? (isMember ? "PROPRIÉTAIRE VALIDÉ" : "VISITEUR · LECTURE SEULE") : socketState === "connecting" ? "CONNEXION…" : <><WifiOff size={14}/> DÉCONNECTÉ</>}</span><span>BY MANIX · KITT FRANCO-BELGE</span><a href="/mentions-legales"><CircleHelp size={14}/> Règles du salon</a></footer>
    </div>
    <p className="kc-disclaimer">Salon communautaire inspiré des chats des années 1990. MSN est une marque de Microsoft ; KITT et Knight Rider appartiennent à leurs ayants droit. Aucun partenariat n’est revendiqué.</p>
  </main>;
}
