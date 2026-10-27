import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bell, BellOff, CarFront, Check, CircleHelp, MessageCircle, Radio, ShieldCheck, Users, Wifi, WifiOff } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./KittChat.css";

type Room = { id: string; label: string; topic: string };
type ChatLine = { id: string; name: string; text: string; timestamp: number; kind?: "system" | "message" };
type Member = { name: string };
type Owner = { id: string; name: string; car: string; year: string; photos: string[] };
const FALLBACK_ROOMS: Room[] = [
  { id: "general", label: "Le grand salon", topic: "Le rendez-vous de toute la communaut?" },
  { id: "atelier", label: "Garage & r?pliques", topic: "Pontiac, restauration et KITT" },
  { id: "electronique", label: "?lectronique", topic: "LED, capteurs et projets maison" },
  { id: "radio", label: "Radio KITT", topic: "Musique et souvenirs de la s?rie" },
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
        if (!statusResponse.ok) throw new Error("Le salon n?est pas encore reli? au serveur.");
        const statusData = await statusResponse.json();
        if (!Array.isArray(statusData.rooms)) throw new Error("R?ponse invalide du salon.");
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
          const saved = sessionStorage.getItem(SESSION_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { token?: string; name?: string; ownerId?: string };
            if (parsed.token && parsed.name && parsed.ownerId && approved.some(owner => owner.id === parsed.ownerId)) {
              setSessionToken(parsed.token);
              setMember(parsed.name);
              setOwnerId(parsed.ownerId);
            } else if (saved) sessionStorage.removeItem(SESSION_KEY);
          }
        } catch { sessionStorage.removeItem(SESSION_KEY); }
      } catch {
        if (active) setService("offline");
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { soundEnabled.current = sound; }, [sound]);

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
      if (packet.type === "message" && packet.message && typeof packet.message === "object") {
        const line = packet.message as ChatLine;
        setLines(current => [...current.slice(-98), line]);
        if (soundEnabled.current && line.name !== member && line.kind !== "system") {
          try {
            audio.current ||= new AudioContext();
            const oscillator = audio.current.createOscillator();
            const gain = audio.current.createGain();
            oscillator.frequency.value = 700;
            gain.gain.value = .035;
            oscillator.connect(gain);
            gain.connect(audio.current.destination);
            oscillator.start();
            oscillator.stop(audio.current.currentTime + .06);
          } catch { /* Notification sonore facultative */ }
        }
        return;
      }
      if (packet.type === "room") {
        setLines(Array.isArray(packet.history) ? packet.history as ChatLine[] : []);
        setRoom(rooms.find(item => item.id === packet.room) || FALLBACK_ROOMS[0]);
        return;
      }
      if (packet.type === "error") setError(typeof packet.message === "string" ? packet.message : "Message refus?.");
    };
    client.onerror = () => setError("Connexion interrompue. V?rifie le relais et r?essaie.");
    client.onclose = event => {
      if (socket.current === client) { socket.current = null; setSocketState("closed"); }
      if (event.code === 4001 && isMember) {
        setSessionToken(""); setMember("");
        sessionStorage.removeItem(SESSION_KEY);
        setError("La session ou le profil Pontiac n?est plus valide. Contacte Manix apr?s l?approbation du profil.");
      } else if (event.code === 1013) setError("Le salon est momentan?ment complet. R?essaie dans un instant.");
    };
    return () => {
      if (socket.current === client) socket.current = null;
      client.close(1000, "Navigation");
    };
    // The room changes through a switch packet so browsing channels does not reconnect the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, service, isMember, sessionToken, member]);

  useEffect(() => {
    if (socketState === "online") socket.current?.send(JSON.stringify({ type: "switch", room: room.id }));
  }, [room.id, socketState]);
  useEffect(() => { if (messageBox.current) messageBox.current.scrollTop = messageBox.current.scrollHeight; }, [lines]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  function disconnect() {
    socket.current?.close(1000, "D?connexion");
    socket.current = null;
    setSocketState("closed"); setLines([]); setMembers([]);
    setSessionToken(""); setMember(""); sessionStorage.removeItem(SESSION_KEY);
  }

  async function enter(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiBase || !ownerId || !invite.trim()) {
      setError("Choisis ton profil Pontiac approuv? et saisis le code personnel re?u de Manix.");
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
        throw new Error(data.error || "Profil ou invitation refus?.");
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, name: data.name, ownerId: data.ownerId }));
      setMember(data.name); setSessionToken(data.token); setNotice("Profil Pontiac v?rifi?. Bienvenue dans le salon !"); setInvite("");
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

  const headingStatus = service === "checking" ? "RECHERCHE DU RELAIS" : service === "online" ? "RELAIS PR?T" : "SALON HORS LIGNE";

  return <main className="kc-page">
    <header className="kc-sitebar">
      <a href="/" className="kc-brand"><span className="kc-brand-led"/>KITT <small>FRANCO-BELGE</small></a>
      <a className="kc-world-link" href="/communaute-pontiac"><CarFront size={16}/> Pontiac Owners World <ArrowRight size={14}/></a>
    </header>
    <section className="kc-intro">
      <div><p className="kc-eyebrow">KNIGHT RIDER COMMUNITY ? EST. 1998</p><h1>Le salon <em>KITT</em></h1>
        <p>Entre voir l?ambiance sans compte. Pour parler, il faut poss?der une Pontiac et faire valider son profil photo sur le globe.</p>
      </div>
      <div className="kc-status"><span className={service === "online" ? "is-online" : ""}/><strong>{headingStatus}</strong>
        <small>{service === "online" ? "Visite libre ? ?criture r?serv?e aux propri?taires valid?s" : "Le salon sera disponible quand le service sera reli?."}</small>
      </div>
    </section>
    <div className="kc-window">
      <div className="kc-titlebar"><span className="kc-app-icon"><MessageCircle size={15}/></span><strong>MSN CHAT ? KNIGHT RIDER FRANCE</strong><div className="kc-window-buttons"><span>_</span><span>?</span><span>?</span></div></div>
      <div className="kc-toolbar"><span>Fichier</span><span>Salon</span><span>Affichage</span><span>Aide</span><span className="kc-toolbar-right">KITT Network v1.0</span></div>
      {(service === "online" || socketState === "connecting") && <div className="kc-room-tabs" role="tablist" aria-label="Salons de discussion">
        {rooms.map(item => <button key={item.id} role="tab" aria-selected={room.id === item.id} className={room.id === item.id ? "active" : ""} onClick={() => setRoom(item)}>{item.label}</button>)}
      </div>}
      {socketState !== "closed" ? <div className="kc-content">
        <section className="kc-conversation" aria-label={`Messages du salon ${room.label}`}>
          <div className="kc-room-topic"><strong>{room.label}</strong><span>{room.topic}</span></div>
          <div className="kc-messages" ref={messageBox} role="log" aria-live="polite" aria-relevant="additions text">
            {socketState === "connecting" && <p className="kc-empty">Le salon s?ouvre?</p>}
            {socketState === "online" && !lines.length && <p className="kc-empty">Le salon s??veille? Lance la conversation quand ton profil sera valid?.</p>}
            {lines.map(line => <article className={`kc-line ${line.kind === "system" ? "system" : ""}`} key={line.id}>
              <time dateTime={new Date(line.timestamp).toISOString()}>{clockLabel(line.timestamp)}</time><strong>{line.name}</strong><span>{line.text}</span>
            </article>)}
          </div>
          {isMember ? <form className="kc-compose" onSubmit={sendMessage}>
            <label className="kc-sr-only" htmlFor="kc-message">Ton message</label>
            <input id="kc-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder={`?crire dans ${room.label}?`} disabled={socketState !== "online"}/>
            <span>{message.length}/500</span><button type="submit" disabled={!message.trim() || socketState !== "online"}>Envoyer</button>
          </form> : <div className="kc-readonly"><ShieldCheck size={17}/><span>Mode d?couverte : tu peux lire les salons. Pour ?crire, ajoute ta Pontiac au globe et fais valider son profil photo.</span></div>}
        </section>
        <aside className="kc-roster">
          <div className="kc-roster-heading"><Users size={17}/><strong>Membres pr?sents</strong><span>{members.length}</span></div>
          <div className="kc-roster-list">{members.length ? members.map((item,index)=><div className="kc-person" key={`${item.name}-${index}`}>
            <span className="kc-avatar">{item.name.slice(0,1).toUpperCase()}</span><span>{item.name}</span><i title="En ligne"/>
          </div>) : <small className="kc-no-members">Aucun propri?taire connect? pour l?instant.</small>}</div>
          <button type="button" className="kc-sound" aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Bell size={15}/> : <BellOff size={15}/>} {sound ? "D?sactiver les sons" : "Activer les sons"}</button>
          {isMember ? <button type="button" className="kc-leave" onClick={disconnect}>Quitter le salon</button> : <form className="kc-guest-join" onSubmit={enter}>
            <div className="kc-join-heading"><span>ACC?S PROPRI?TAIRE</span><small>PROFIL PHOTO VALID?</small></div>
            {owners.length ? <label>Ton Pontiac sur le globe
              <select required value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} ? {owner.car} {owner.year}</option>)}
              </select>
            </label> : <p>Aucun profil avec photo n?est encore approuv?. Inscris ta voiture sur le globe, puis attends la validation.</p>}
            <label>Code personnel<input required maxLength={80} autoComplete="one-time-code" value={invite} onChange={event => setInvite(event.target.value)} placeholder="Code remis apr?s validation" disabled={!owners.length}/></label>
            <button type="submit" disabled={!owners.length || !invite.trim() || service !== "online"}>Entrer dans le salon <ArrowRight size={15}/></button>
            <a className="kc-globe-cta" href="/communaute-pontiac#inscription"><CarFront size={15}/> Inscrire ma Pontiac sur le globe</a>
            <p>Ton profil est d?j? approuv? ? Demande ton code ? Manix via le groupe <a href="https://www.facebook.com/groups/kittfrancobelge" target="_blank" rel="noopener noreferrer">KITT Franco-Belge</a>.</p>
          </form>}
        </aside>
      </div> : <section className="kc-offline"><Radio size={24}/><div><strong>{service === "checking" ? "Recherche du salon?" : "Le salon est momentan?ment hors ligne."}</strong><p>Tu peux d?j? pr?parer ton inscription au globe Pontiac.</p></div><a href="/communaute-pontiac#inscription">Voir l?inscription <ArrowRight size={15}/></a></section>}
      {(error || notice) && <p className={error ? "kc-feedback error" : "kc-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <footer className="kc-footer"><span><Wifi size={14}/> {socketState === "online" ? (isMember ? "PROPRI?TAIRE VALID?" : "VISITEUR ? LECTURE SEULE") : socketState === "connecting" ? "CONNEXION?" : <><WifiOff size={14}/> D?CONNECT?</>}</span><span>BY MANIX ? KITT FRANCO-BELGE</span><a href="/mentions-legales"><CircleHelp size={14}/> R?gles du salon</a></footer>
    </div>
    <p className="kc-disclaimer">Salon communautaire inspir? par les chats des ann?es 1990. MSN est une marque de Microsoft ; KITT et Knight Rider appartiennent ? leurs ayants droit. Aucun partenariat n?est revendiqu?.</p>
  </main>;
}
