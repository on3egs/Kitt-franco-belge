import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Gamepad2, Maximize2, Play, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import "./arcade.css";

const GAMES = [
  { id: "stunt", name: "KITT Stunt Racing", mode: "Course · 3D", description: "Prends le volant, lance le turbo et construis tes propres circuits. Une course arcade imaginée par Manix pour KITT Franco-Belge.", src: "/kitt-stunt-racing/", controls: "Flèches ou WASD · Espace pour le turbo · Échap pour la pause", badge: "CRÉATION MANIX" },
  { id: "adventure", name: "KITT Adventure", mode: "Course · arcade", description: "Évite le trafic, ramasse les bonus et fais grimper ton score dans cette aventure inspirée des jeux rétro.", src: "/kitt-adventure/", controls: "Flèches ou WASD · Espace pour le turbo · T pour le bouclier", badge: "ÉDITION DU PROJET" },
  { id: "shadow", name: "Shadow of KARR", mode: "Action · aventure", description: "Une aventure Knight Rider déjà proposée sur le site. Ouvre-la en plein écran pour profiter du jeu.", src: "/shadow-of-karr/", controls: "Les commandes sont indiquées dans le jeu.", badge: "JEU DU SITE" },
];

export default function Arcade() {
  const [selected, setSelected] = useState(GAMES[0]);
  const [sound, setSound] = useState(false);
  const [plays, setPlays] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setPlays(JSON.parse(localStorage.getItem("kitt-arcade-plays") || "{}")); } catch { setPlays({}); }
  }, []);
  const choose = (game: typeof GAMES[number]) => {
    setSelected(game);
    const next = { ...plays, [game.id]: (plays[game.id] || 0) + 1 };
    setPlays(next);
    try { localStorage.setItem("kitt-arcade-plays", JSON.stringify(next)); } catch { /* stockage facultatif */ }
    if (sound && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(`${game.name}. Chargement du jeu.`));
    }
  };
  const fullscreen = () => document.querySelector<HTMLIFrameElement>(".arcade-frame")?.requestFullscreen?.();
  return <main className="arcade-page">
    <section className="arcade-hero">
      <div className="arcade-scan" aria-hidden="true" />
      <a className="arcade-back" href="/"><ArrowLeft size={16}/> Retour au site</a>
      <div className="arcade-hero-copy"><span className="arcade-kicker"><span className="arcade-live"/> KITT FRANCO-BELGE · SALLE D’ARCADE</span><h1>À toi de <em>jouer.</em></h1><p>Les jeux du projet réunis au même endroit. Choisis ta mission et prends les commandes.</p>
        <div className="arcade-pills"><span><Gamepad2 size={15}/>{GAMES.length} jeux disponibles</span><span><ShieldCheck size={15}/>Accès gratuit</span><span><Play size={14}/>Sans compte</span></div></div>
      <div className="arcade-hero-light" aria-hidden="true"><div className="arcade-light-inner"/></div>
    </section>
    <section className="arcade-play-section" aria-label="Lecteur de jeu">
      <div className="arcade-stage-head"><div><span className="arcade-kicker">MISSION SÉLECTIONNÉE</span><h2>{selected.name}</h2></div><div className="arcade-stage-actions"><a href={selected.src} target="_blank" rel="noreferrer" title="Ouvrir le jeu dans un nouvel onglet"><ExternalLink size={17}/><span>Nouvel onglet</span></a><button type="button" onClick={fullscreen} title="Passer le jeu en plein écran"><Maximize2 size={17}/><span>Plein écran</span></button></div></div>
      <div className="arcade-frame-shell"><iframe key={selected.id} className="arcade-frame" src={selected.src} title={selected.name} allow="fullscreen; gamepad" allowFullScreen loading="lazy"/><div className="arcade-stage-bottom"><span><i/>SYSTÈME PRÊT</span><span>{selected.mode.toUpperCase()}</span></div></div>
      <div className="arcade-controls"><Gamepad2 size={17}/><span>{selected.controls}</span><button type="button" onClick={()=>setSound(!sound)} title={sound ? "Désactiver la voix" : "Activer l’annonce vocale"}>{sound?<Volume2 size={16}/>:<VolumeX size={16}/>}<span>Voix {sound?"active":"désactivée"}</span></button></div>
    </section>
    <section className="arcade-library"><div className="arcade-library-title"><div><span className="arcade-kicker">CHOISIS TON VÉHICULE</span><h2>La collection</h2></div><span className="arcade-plays">{Object.values(plays).reduce((a,b)=>a+b,0)} sélection{Object.values(plays).reduce((a,b)=>a+b,0)>1?"s":""} sur cet appareil</span></div>
      <div className="arcade-cards">{GAMES.map((game,index)=><article className={`arcade-card ${selected.id===game.id?"selected":""}`} key={game.id}><div className={`arcade-card-art art-${game.id}`} aria-hidden="true"><span className="arcade-card-number">0{index+1}</span><div className="arcade-mini-scanner"/><Gamepad2 size={34}/></div><div className="arcade-card-body"><span className="arcade-card-badge">{game.badge}</span><h3>{game.name}</h3><p>{game.description}</p><div className="arcade-card-footer"><span>{game.mode} · {plays[game.id]||0} sélection{(plays[game.id]||0)>1?"s":""}</span><button type="button" onClick={()=>choose(game)}><Play size={15} fill="currentColor"/>{selected.id===game.id?"Sélectionné":"Jouer"}</button></div></div></article>)}</div>
    </section>
    <aside className="arcade-credits"><ShieldCheck size={18}/><p><strong>À propos des droits et des crédits</strong><br/>Ces jeux sont des créations de fans associées au projet KITT Franco-Belge. Knight Rider, KITT et KARR restent des marques et personnages appartenant à leurs ayants droit. Les jeux ne sont ni officiels ni affiliés aux détenteurs de ces droits. Les éléments tiers éventuellement chargés par un jeu restent soumis à leurs propres licences et crédits.</p><a href="/mentions-legales">Mentions légales <ExternalLink size={13}/></a></aside>
    <footer className="arcade-footer"><a href="/">← KITT Franco-Belge</a><span>BY MANIX · POUR LES FANS, PAR DES FANS</span></footer>
  </main>;
}
