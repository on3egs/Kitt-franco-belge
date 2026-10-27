import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Gamepad2, Maximize2, Play, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import "./arcade.css";
import "./arcade-enhancements.css";

type Game = {
  id: string;
  name: string;
  mode: string;
  description: string;
  src: string;
  controls: string;
  badge: string;
  icon: string;
  group: "agx" | "site";
};

// Les dix jeux de l’arcade KYRONEXT installée sur l’AGX Orin.
const AGX_GAMES: Game[] = [
  { id: "stunt", name: "Knight Racer · Stunt Racing", mode: "Course · 3D / 2D", description: "Trois courses, turbo, cascades et circuit personnalisable. Le mode 2D prend le relais si WebGL est indisponible.", src: "/kitt-stunt-racing/?kyronex=1", controls: "Flèches ou WASD · Espace : turbo · P : pause", badge: "JEU AGX · BY MANIX", icon: "🏁", group: "agx" },
  { id: "pacman", name: "Pac-Man", mode: "Labyrinthe · arcade", description: "Traverse le labyrinthe, évite les fantômes et ramasse les bonus. Une version arcade originale du projet.", src: "/static/games/index.html?game=pacman", controls: "Flèches · WASD · commandes à l’écran", badge: "JEU AGX · SOLO", icon: "◉", group: "agx" },
  { id: "tetris", name: "Tetris", mode: "Puzzle · arcade", description: "Empile les pièces, enchaîne les lignes et vise le meilleur score avec réserve et aperçu de la prochaine pièce.", src: "/static/games/index.html?game=tetris", controls: "← → déplacer · ↑ tourner · Espace : chute · P : pause", badge: "JEU AGX · SOLO", icon: "▦", group: "agx" },
  { id: "space-knight-rider", name: "Space Knight Rider", mode: "Combat · arcade", description: "Décolle, choisis ton pilote et affronte les vagues ennemies avec un arsenal évolutif.", src: "/static/games/space_invaders_pro/", controls: "Flèches · Espace : tir · commandes à l’écran", badge: "JEU AGX · COMBAT", icon: "▲", group: "agx" },
  { id: "asteroids-pro", name: "Astéroïdes Pro", mode: "Survie · arcade", description: "Pilote avec inertie, économise tes boucliers et traverse des vagues de débris toujours plus denses.", src: "/static/games/asteroids_pro/", controls: "Flèches · Espace : tir · commandes indiquées en jeu", badge: "JEU AGX · SURVIE", icon: "☄", group: "agx" },
  { id: "asteroids-3d", name: "Astéroïdes 3D Ultra", mode: "Survie · 3D", description: "Affronte les débris en trois dimensions avec des commandes directes et un rendu spatial immersif.", src: "/static/games/3d/asteroids-3d-ultra.html", controls: "Flèches et espace · commandes à l’écran", badge: "JEU AGX · 3D ULTRA", icon: "☄", group: "agx" },
  { id: "tron", name: "TRON · duel contre KARR", mode: "Duel · stratégie", description: "Trace ta route et enferme l’adversaire dans l’arène lumineuse. Le duel se joue dans le navigateur.", src: "/static/games/index.html?game=tron", controls: "Flèches ou WASD · commandes tactiles disponibles", badge: "JEU AGX · DUEL", icon: "◈", group: "agx" },
  { id: "space-invaders", name: "Space Invaders", mode: "Tir · arcade", description: "Repousse les vagues, améliore ton arsenal et prépare-toi aux boss.", src: "/static/games/index.html?game=spaceinvaders", controls: "Flèches · Espace : tir · P : pause", badge: "JEU AGX · ARCADE", icon: "👾", group: "agx" },
  { id: "pacman-3d", name: "Pac-Man 3D", mode: "Labyrinthe · 3D", description: "Explore le labyrinthe en trois dimensions et change de caméra selon ta façon de jouer.", src: "/static/games/3d/pacman-3d.html", controls: "Touches et commandes tactiles indiquées au lancement", badge: "JEU AGX · IMMERSION", icon: "◉", group: "agx" },
  { id: "tetris-3d", name: "Tetris 3D Ultra", mode: "Puzzle · 3D", description: "Retrouve le puzzle à pièces tombantes dans une arène tridimensionnelle avec aperçu et commandes dédiées.", src: "/static/games/3d/tetris-3d-ultra.html", controls: "Flèches · ZQSD · espace · commandes à l’écran", badge: "JEU AGX · 3D ULTRA", icon: "▦", group: "agx" },
  { id: "invaders-3d", name: "Invaders 3D", mode: "Combat · 3D", description: "Dix vagues de vaisseaux, des boucliers et une défense de la galaxie en profondeur.", src: "/static/games/3d/space-invaders-3d-ultra.html", controls: "Commandes indiquées au lancement · plein écran disponible", badge: "JEU AGX · COMBAT 3D", icon: "✦", group: "agx" },
  { id: "shadow-karr", name: "Shadow of KARR", mode: "Aventure · 8 missions", description: "Une campagne à défilement avec KITT, des adversaires et des combats de boss.", src: "/static/games/shadow-of-karr/", controls: "Commandes indiquées dans le jeu", badge: "JEU AGX · CAMPAGNE", icon: "▰", group: "agx" },
];

const SITE_GAMES: Game[] = [
  { id: "adventure", name: "KITT Adventure", mode: "Course · arcade", description: "Évite le trafic, ramasse les bonus et fais grimper ton score dans cette aventure rétro.", src: "/kitt-adventure/", controls: "Flèches ou WASD · Espace : turbo · T : bouclier", badge: "CRÉATION DU SITE", icon: "🚘", group: "site" },
  { id: "maze", name: "KITT Maze Run", mode: "Labyrinthe · arcade", description: "Récupère les cellules d’énergie et échappe aux drones dans un labyrinthe original.", src: "/kitt-maze/", controls: "Flèches · WASD · ZQSD · commandes à l’écran", badge: "CRÉATION ORIGINALE", icon: "⌘", group: "site" },
  { id: "blocks", name: "KITT Block Drop", mode: "Puzzle · arcade", description: "Empile les blocs, complète des lignes et améliore ton meilleur score.", src: "/kitt-blocks/", controls: "← → déplacer · ↑ tourner · ↓ accélérer · Espace : chute", badge: "CRÉATION ORIGINALE", icon: "▥", group: "site" },
];

const GAMES = [...AGX_GAMES, ...SITE_GAMES];
type GameFilter = "all" | Game["group"];

function ArcadeArtwork({ game }: { game: Game }) {
  return <div className={`arcade-game-art game-art-${game.id}`} aria-hidden="true">
    <div className="arcade-game-art-grid" />
    <span>{game.icon}</span>
    <i />
  </div>;
}

export default function Arcade() {
  const [selected, setSelected] = useState(GAMES[0]);
  const [sound, setSound] = useState(false);
  const [filter, setFilter] = useState<GameFilter>("all");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [plays, setPlays] = useState<Record<string, number>>({});
  const playSectionRef = useRef<HTMLElement>(null);
  const visibleGames = filter === "all" ? GAMES : GAMES.filter((game) => game.group === filter);

  useEffect(() => {
    try { setPlays(JSON.parse(localStorage.getItem("kitt-arcade-plays") || "{}")); } catch { setPlays({}); }
  }, []);

  const choose = (game: Game) => {
    setSelected(game);
    if (game.id !== selected.id) setFrameLoaded(false);
    const next = { ...plays, [game.id]: (plays[game.id] || 0) + 1 };
    setPlays(next);
    try { localStorage.setItem("kitt-arcade-plays", JSON.stringify(next)); } catch { /* stockage facultatif */ }
    if (sound && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      const announcement = new SpeechSynthesisUtterance(`${game.name}. Chargement du jeu.`);
      announcement.lang = "fr-FR";
      speechSynthesis.speak(announcement);
    }
    window.setTimeout(() => playSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const fullscreen = () => document.querySelector<HTMLIFrameElement>(".arcade-frame")?.requestFullscreen?.();

  return <main className="arcade-page">
    <section className="arcade-hero">
      <div className="arcade-scan" aria-hidden="true" />
      <a className="arcade-back" href="/"><ArrowLeft size={16} /> Retour au site</a>
      <div className="arcade-hero-copy">
        <span className="arcade-kicker"><span className="arcade-live" /> KITT FRANCO-BELGE · SALLE D’ARCADE</span>
        <h1>À toi de <em>jouer.</em></h1>
        <p>Les douze jeux de l’AGX et les créations du site sont réunis ici. Choisis une mission pour la lancer.</p>
        <div className="arcade-pills">
          <span><Gamepad2 size={15} />{GAMES.length} jeux accessibles</span>
          <span><ShieldCheck size={15} />Gratuit · sans compte</span>
          <a href="#collection"><Play size={14} />Voir les jeux ↓</a>
        </div>
      </div>
      <div className="arcade-hero-light" aria-hidden="true"><div className="arcade-light-inner" /></div>
    </section>

    <section id="collection" className="arcade-library" aria-label="Collection de jeux">
      <div className="arcade-library-title">
        <div><span className="arcade-kicker">12 JEUX AGX · 3 CRÉATIONS DU SITE</span><h2>La collection KITT</h2></div>
        <span className="arcade-plays">{Object.values(plays).reduce((a, b) => a + b, 0)} lancements sur cet appareil</span>
      </div>
      <div className="arcade-filters" role="group" aria-label="Filtrer les jeux">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tous les jeux <span>{GAMES.length}</span></button>
        <button type="button" aria-pressed={filter === "agx"} onClick={() => setFilter("agx")}>Collection AGX <span>{AGX_GAMES.length}</span></button>
        <button type="button" aria-pressed={filter === "site"} onClick={() => setFilter("site")}>Créations du site <span>{SITE_GAMES.length}</span></button>
      </div>
      <div className="arcade-cards">
        {visibleGames.map((game) => <article className={`arcade-card ${selected.id === game.id ? "selected" : ""}`} key={game.id}>
          <div className={`arcade-card-art art-${game.id}`}>
            <span className="arcade-card-number">{String(GAMES.indexOf(game) + 1).padStart(2, "0")}</span>
            <ArcadeArtwork game={game} />
            <span className="arcade-art-label">{game.mode.toUpperCase()}</span>
          </div>
          <div className="arcade-card-body">
            <span className="arcade-card-badge">{game.badge}</span>
            <h3>{game.name}</h3>
            <p>{game.description}</p>
            <div className="arcade-card-footer">
              <span>{game.mode} · {plays[game.id] || 0} lancement{(plays[game.id] || 0) > 1 ? "s" : ""}</span>
              <button type="button" onClick={() => choose(game)}><Play size={15} fill="currentColor" />Jouer</button>
            </div>
          </div>
        </article>)}
      </div>
    </section>

    <section ref={playSectionRef} className="arcade-play-section" aria-label="Jeu sélectionné">
      <div className="arcade-stage-head">
        <div><span className="arcade-kicker">MISSION SÉLECTIONNÉE · {selected.group === "agx" ? "COLLECTION AGX" : "CRÉATION DU SITE"}</span><h2>{selected.name}</h2></div>
        <div className="arcade-stage-actions">
          <a href={selected.src} target="_blank" rel="noreferrer" title="Ouvrir le jeu dans un nouvel onglet"><ExternalLink size={17} /><span>Nouvel onglet</span></a>
          <button type="button" onClick={fullscreen} title="Passer le jeu en plein écran"><Maximize2 size={17} /><span>Plein écran</span></button>
        </div>
      </div>
      <div className="arcade-frame-shell">
        <iframe key={selected.id} className="arcade-frame" src={selected.src} title={selected.name} allow="fullscreen; gamepad" allowFullScreen loading="lazy" onLoad={() => setFrameLoaded(true)} />
        <div className="arcade-stage-bottom"><span><i className={frameLoaded ? "is-ready" : ""} />{frameLoaded ? "INTERFACE CHARGÉE" : "CHARGEMENT DU JEU"}</span><span>{selected.mode.toUpperCase()}</span></div>
      </div>
      <div className="arcade-controls"><Gamepad2 size={17} /><span>{selected.controls}</span><button type="button" onClick={() => setSound(!sound)} title={sound ? "Désactiver l’annonce vocale" : "Activer l’annonce vocale"}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Voix {sound ? "active" : "désactivée"}</span></button></div>
    </section>

    <aside className="arcade-credits"><ShieldCheck size={18} /><p><strong>À propos des droits et des crédits</strong><br />Ces jeux sont des créations de fans associées au projet KITT Franco-Belge. Knight Rider, KITT et KARR restent des marques et personnages appartenant à leurs ayants droit. Les jeux ne sont ni officiels ni affiliés aux détenteurs de ces droits. Les éléments tiers éventuels et leurs licences sont précisés dans les crédits du jeu concerné.</p><a href="/static/games/THIRD-PARTY-LICENSES.md">Crédits des moteurs <ExternalLink size={13} /></a><a href="/mentions-legales">Mentions légales <ExternalLink size={13} /></a></aside>
    <footer className="arcade-footer"><a href="/">← KITT Franco-Belge</a><span>BY MANIX · POUR LES FANS, PAR DES FANS</span></footer>
  </main>;
}
