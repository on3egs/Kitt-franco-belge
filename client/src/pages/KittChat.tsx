import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bell, BellOff, CarFront, Check, CircleHelp, MessageCircle, Radio, ShieldCheck, Users, Wifi, WifiOff } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./KittChat.css";

type Room = { id: string; label: string; topic: string };
type ChatLine = { id: string; name: string; text: string; timestamp: number; kind?: "system" | "message" };
type Member = { name: string };
const ROOMS: Room[] = [
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
  const [rooms, setRooms] = useState<Room[]>(ROOMS);
  const [room, setRoom] = useState(ROOMS[0]);
  const [member, setMember] = useState("");
  const [invite, setInvite] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const messageBox = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const base = await getApiBase();
        if (!active) return;
        if (!base) throw new Error("Relais communautaire introuvable.");
        const response = await fetch(`${base}/api/kitt-chat/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("Le salon n’est pas encore relié au serveur.");
        const data = await response.json();
        if (!Array.isArray(data.rooms)) throw new Error("Réponse invalide du salon.");
        const available = data.rooms as Room[];
        if (!active) return;
        setApiBase(base); setRooms(available); setRoom(available[0] || ROOMS[0]); setService("online");
        try {
          const saved = sessionStorage.getItem(SESSION_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { token?: string; name?: string };
            if (parsed.token && parsed.name) { setSessionToken(parsed.token); setMember(parsed.name); }
          }
        } catch { sessionStorage.removeItem(SESSION_KEY); }
      } catch {
        if (active) setService("offline");
      }
    })();
    return () => { active = false; };
  }, []);

  const disconnect = useCallback((forgetSession = false) => {
    socket.current?.close(1000, "Déconnexion"); socket.current = null;
    setSocketState("closed"); setLines([]); setMembers([]);
    if (forgetSession) {
      setSessionToken(""); setMember(""); sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const connect = useCallback((token: string, name: string, selectedRoom: string, base: string) => {
    if (!base || !token) return;
    socket.current?.close();
    const endpoint = new URL("/api/kitt-chat/ws", base);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    setSocketState("connecting"); setError("");
    const client = new WebSocket(endpoint);
    socket.current = client;
    client.onopen = () => client.send(JSON.stringify({ type: "auth", token, room: selectedRoom }));
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
      if (packet.type === "message" && packet.message && typeof packet.message === "object") {
        const line = packet.message as ChatLine;
        setLines(current => [...current.slice(-98), line]);
        if (soundEnabled.current && line.name !== name && line.kind !== "system") {
          try { audio.current ||= new AudioContext(); const oscillator = audio.current.createOscillator(); const gain = audio.current.createGain(); oscillator.frequency.value = 700; gain.gain.value = .035; oscillator.connect(gain); gain.connect(audio.current.destination); oscillator.start(); oscillator.stop(audio.current.currentTime + .06); } catch { /* Audio facultatif */ }
        }
        return;
      }
      if (packet.type === "room") {
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setRoom(ROOMS.find(item => item.id === packet.room) || ROOMS[0]);
        return;
      }
      if (packet.type === "error") setError(typeof packet.message === "string" ? packet.message : "La connexion au salon a été refusée.");
    };
    client.onerror = () => setError("Connexion interrompue. Vérifie le relais du salon et réessaie.");
    client.onclose = event => {
      if (socket.current === client) { socket.current = null; setSocketState("closed"); }
      if (event.code === 4001) { disconnect(true); setError("La session a expiré. Demande une nouvelle invitation à Manix."); }
    };
  }, [disconnect]);

  useEffect(() => { soundEnabled.current = sound; }, [sound]);

  useEffect(() => { if (sessionToken && apiBase && service === "online") connect(sessionToken, member, room.id, apiBase); return () => socket.current?.close(); }, [apiBase, service, sessionToken, member, connect]);
  useEffect(() => { if (socketState === "online") socket.current?.send(JSON.stringify({ type: "switch", room: room.id })); }, [room.id, socketState]);
  useEffect(() => { if (messageBox.current) messageBox.current.scrollTop = messageBox.current.scrollHeight; }, [lines]);

  async function enter(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiBase || !invite.trim() || !pseudo.trim()) { setError("Saisis le code d’invitation et ton pseudo."); return; }
    try {
      const response = await fetch(`${apiBase}/api/kitt-chat/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite: invite.trim(), name: pseudo.trim() }) });
      const data = await response.json();
      if (!response.ok || !data.token || !data.name) throw new Error(data.error || "Invitation refusée.");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, name: data.name }));
      setMember(data.name); setSessionToken(data.token); setNotice("Invitation acceptée. Bienvenue dans le salon !"); setInvite("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de rejoindre le salon."); }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim().slice(0, 500);
    if (!clean || socketState !== "online") return;
    socket.current?.send(JSON.stringify({ type: "message", text: clean })); setMessage("");
  }

  return <main className="kc-page">
    <header className="kc-sitebar"><a href="/" className="kc-brand"><span className="kc-brand-led"/>KITT <small>FRANCO-BELGE</small></a><a className="kc-world-link" href="/communaute-pontiac"><CarFront size={16}/> Pontiac Owners World <ArrowRight size={14}/></a></header>
    <section className="kc-intro"><div><p className="kc-eyebrow">KNIGHT RIDER COMMUNITY · EST. 1998</p><h1>Le salon <em>KITT</em></h1><p>Le rendez-vous des passionnés Knight Rider. Une salle commune, des pseudos, des salons à thème et l’esprit des premiers chats Internet.</p></div><div className="kc-status"><span className={service === "online" ? "is-online" : ""}/><strong>{service === "checking" ? "RECHERCHE DU RELAIS" : service === "online" ? "RELAIS PRÊT" : "SALON HORS LIGNE"}</strong><small>{service === "online" ? "Accès réservé sur invitation" : "Le salon sera disponible quand le service sera relié."}</small></div></section>
    <div className="kc-window">
      <div className="kc-titlebar"><span className="kc-app-icon"><MessageCircle size={15}/></span><strong>MSN CHAT — KNIGHT RIDER FRANCE</strong><div className="kc-window-buttons"><span>_</span><span>□</span><span>×</span></div></div>
      <div className="kc-toolbar"><span>Fichier</span><span>Salon</span><span>Affichage</span><span>Aide</span><span className="kc-toolbar-right">KITT Network v1.0</span></div>
      {sessionToken ? <>
        <div className="kc-room-tabs" role="tablist" aria-label="Salons de discussion">{rooms.map(item => <button key={item.id} role="tab" aria-selected={room.id === item.id} className={room.id === item.id ? "active" : ""} onClick={() => setRoom(item)}>{item.label}</button>)}</div>
        <div className="kc-content">
          <section className="kc-conversation" aria-label={`Messages du salon ${room.label}`}>
            <div className="kc-room-topic"><strong>{room.label}</strong><span>{room.topic}</span></div>
            <div className="kc-messages" ref={messageBox} role="log" aria-live="polite" aria-relevant="additions text">
              {!lines.length && <p className="kc-empty">Le salon s’éveille… Lance la conversation, {member} !</p>}
              {lines.map(line => <article className={`kc-line ${line.kind === "system" ? "system" : ""}`} key={line.id}><time dateTime={new Date(line.timestamp).toISOString()}>{clockLabel(line.timestamp)}</time><strong>{line.name}</strong><span>{line.text}</span></article>)}
            </div>
            <form className="kc-compose" onSubmit={sendMessage}><label className="kc-sr-only" htmlFor="kc-message">Ton message</label><input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`Écrire dans ${room.label}…`} disabled={socketState !== "online"}/><span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button></form>
          </section>
          <aside className="kc-roster"><div className="kc-roster-heading"><Users size={17}/><strong>Membres présents</strong><span>{members.length}</span></div><div className="kc-roster-list">{members.map((item,index)=><div className="kc-person" key={`${item.name}-${index}`}><span className="kc-avatar">{item.name.slice(0,1).toUpperCase()}</span><span>{item.name}</span><i title="En ligne"/></div>)}</div><button type="button" className="kc-sound" aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Bell size={15}/> : <BellOff size={15}/>} {sound ? "Désactiver les sons" : "Activer les sons"}</button><button type="button" className="kc-leave" onClick={() => disconnect(true)}>Quitter le salon</button></aside>
        </div>
      </> : <div className="kc-join-layout">
        <section className="kc-welcome"><div className="kc-welcome-icon"><Radio size={29}/></div><h2>Bienvenue au grand salon</h2><p>Comme les salons MSN d’autrefois : les membres se retrouvent et parlent tous ensemble. Choisis un pseudo de passionné et entre ton invitation.</p><ul><li><Check size={15}/> Salon réservé aux propriétaires Knight Rider invités</li><li><Check size={15}/> Présence en ligne et salons thématiques</li><li><Check size={15}/> Pas de géolocalisation ni de messages privés imposés</li></ul><p className="kc-welcome-note"><ShieldCheck size={16}/> Les codes sont remis uniquement après vérification par Manix. Demande le tien via le groupe Facebook KITT Franco-Belge.</p></section>
        <form className="kc-join" onSubmit={enter}><div className="kc-join-heading"><span>CONNEXION MEMBRE</span><small>INVITATION REQUISE</small></div><label>Pseudo de salon<input required minLength={2} maxLength={24} autoComplete="nickname" value={pseudo} onChange={event => setPseudo(event.target.value)} placeholder="Ex. Pilote86"/></label><label>Code d’invitation<input required maxLength={80} autoComplete="one-time-code" value={invite} onChange={event => setInvite(event.target.value)} placeholder="Colle ici ton code personnel"/></label><button type="submit" disabled={service !== "online"}>Entrer dans le salon <ArrowRight size={16}/></button><p>Pas encore invité ? Contacte Manix via le groupe <a href="https://www.facebook.com/groups/kittfrancobelge" target="_blank" rel="noreferrer">KITT Franco-Belge</a>.</p></form>
      </div>}
      {(error || notice) && <p className={error ? "kc-feedback error" : "kc-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <footer className="kc-footer"><span><Wifi size={14}/> {socketState === "online" ? "CONNECTÉ" : socketState === "connecting" ? "CONNEXION…" : <><WifiOff size={14}/> DÉCONNECTÉ</>}</span><span>MEMBRES VALIDÉS · BY MANIX</span><a href="/mentions-legales"><CircleHelp size={14}/> Règles du salon</a></footer>
    </div>
    <p className="kc-disclaimer">Projet communautaire indépendant inspiré par les salons de discussion des années 1990. MSN est une marque de Microsoft; KITT et Knight Rider appartiennent à leurs ayants droit. Aucun partenariat n’est revendiqué.</p>
  </main>;
}
