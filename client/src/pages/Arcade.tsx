import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Gamepad2, LoaderCircle, Maximize2, Play, RotateCcw, Search, ShieldCheck, Star, Volume2, VolumeX, X } from "lucide-react";
import { speakSiteAnnouncement, stopSiteSpeech } from "../utils/siteSpeech";
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
  { id: "manix-classics", name: "Manix Arcade Classics", mode: "10 jeux · 100 niveaux", description: "Dix classiques d’arcade recodés à notre manière : Snake, casse-briques, Pong, démineur, Asteroids et plus. Records réunis dans le Hall of Fame.", src: "/static/games/manix-classics/", controls: "Clavier · souris · tactile · commandes à l’écran", badge: "NOUVEAU · BY MANIX", icon: "🏆", group: "site" },
  { id: "arcade-hall-of-fame", name: "Hall of Fame universel", mode: "Classement · tous les jeux", description: "Retrouve les records locaux des jeux KYRONEXT et des dix nouveaux classiques dans un seul tableau filtrable.", src: "/static/games/high-scores.html", controls: "Filtres par jeu · records de ce navigateur", badge: "CLASSEMENT", icon: "★", group: "site" },
  { id: "adventure", name: "KITT Adventure", mode: "Course · arcade", description: "Évite le trafic, ramasse les bonus et fais grimper ton score dans cette aventure rétro.", src: "/kitt-adventure/", controls: "Flèches ou WASD · Espace : turbo · T : bouclier", badge: "CRÉATION DU SITE", icon: "🚘", group: "site" },
  { id: "maze", name: "KITT Maze Run", mode: "Labyrinthe · arcade", description: "Récupère les cellules d’énergie et échappe aux drones dans un labyrinthe original.", src: "/kitt-maze/", controls: "Flèches · WASD · ZQSD · commandes à l’écran", badge: "CRÉATION ORIGINALE", icon: "⌘", group: "site" },
  { id: "blocks", name: "KITT Block Drop", mode: "Puzzle · arcade", description: "Empile les blocs, complète des lignes et améliore ton meilleur score.", src: "/kitt-blocks/", controls: "← → déplacer · ↑ tourner · ↓ accélérer · Espace : chute", badge: "CRÉATION ORIGINALE", icon: "▥", group: "site" },
  { id: "midnight-runner", name: "Midnight Runner", mode: "Course · arcade 16-bit", description: "Faufile-toi dans la ville de nuit, évite le trafic, récupère l’énergie et tiens jusqu’à l’arrivée.", src: "/static/games/midnight-runner/", controls: "← → ou A/D · Espace : turbo · P/Échap : pause · M : sons · tactile", badge: "NOUVEAU · BY MANIX", icon: "🏎️", group: "site" },
  { id: "signal-zero", name: "KITT — Signal Zéro", mode: "Survie · arcade 16-bit", description: "Explore une région plongée dans le noir, rassemble carburant et pièces, sauve des survivants et rallume la balise avec l’aide de KITT.", src: "/static/games/signal-zero/", controls: "Flèches/ZQSD/WASD · E : agir · F : scanner · Maj : sprint · P : pause · tactile", badge: "NOUVEAU · BY MANIX", icon: "⚡", group: "site" },
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("Tout");
  const [sort, setSort] = useState("collection");
  const [launched, setLaunched] = useState(false);
  const [reload, setReload] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  const playSectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibleGames = useMemo(() => GAMES.filter(game =>
    (filter === "all" || game.group === filter) &&
    (!favoritesOnly || favorites.includes(game.id)) &&
    (genre === "Tout" || clean(game.mode).includes(clean(genre))) &&
    (!query.trim() || clean(`${game.name} ${game.description} ${game.mode}`).includes(clean(query.trim())))
  ).sort((a, b) => sort === "popular" ? (plays[b.id] || 0) - (plays[a.id] || 0) : sort === "name" ? a.name.localeCompare(b.name, "fr") : 0), [filter, favoritesOnly, favorites, query, genre, sort, plays]);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("kitt-arcade-plays") || "{}"); if (saved && typeof saved === "object" && !Array.isArray(saved)) setPlays(Object.fromEntries(Object.entries(saved).filter(([id, count]) => GAMES.some(game => game.id === id) && typeof count === "number" && Number.isFinite(count) && count >= 0).map(([id, count]) => [id, Number(count)]))); } catch { setPlays({}); }
    try { const saved = JSON.parse(localStorage.getItem("kitt-arcade-favorites-v1") || "[]"); if (Array.isArray(saved)) setFavorites(saved.filter(id => typeof id === "string" && GAMES.some(game => game.id === id))); } catch { /* favoris facultatifs */ }
  }, []);
  useEffect(() => {
    if (!launched || frameLoaded) return;
    const timer = window.setTimeout(() => setSlowLoad(true), 18000);
    return () => window.clearTimeout(timer);
  }, [launched, frameLoaded, selected.id, reload]);
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem("kitt-arcade-favorites-v1", JSON.stringify(next)); } catch { /* favoris facultatifs */ }
  };

  const choose = (game: Game) => {
    setSelected(game);
    setLaunched(true);
    setFrameLoaded(false);
    setSlowLoad(false);
    setReload(value => value + 1);
    const next = { ...plays, [game.id]: (plays[game.id] || 0) + 1 };
    setPlays(next);
    try { localStorage.setItem("kitt-arcade-plays", JSON.stringify(next)); } catch { /* stockage facultatif */ }
    if (sound) speakSiteAnnouncement(`${game.name}. Jeu sélectionné. Chargement du jeu.`, { replacePending: true, rate: 0.82, pitch: 0.78 });
    window.setTimeout(() => playSectionRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }), 80);
  };

  const fullscreen = () => { void frameRef.current?.requestFullscreen?.().catch(() => { setSlowLoad(true); }); };

  return <main className="arcade-page">
    <section className="arcade-hero">
      <div className="arcade-scan" aria-hidden="true" />
      <a className="arcade-back" href="/"><ArrowLeft size={16} /> Retour au site</a>
      <div className="arcade-hero-copy">
        <span className="arcade-kicker"><span className="arcade-live" /> KITT FRANCO-BELGE · SALLE D’ARCADE</span>
        <h1>À toi de <em>jouer.</em></h1>
        <p>Courses, puzzles, labyrinthes et défis rétro : retrouve la collection AGX et les créations By Manix. Choisis ton jeu, lis les commandes et entre dans la mission.</p>
        <div className="arcade-pills">
          <span><Gamepad2 size={15} />{GAMES.length} jeux et espaces</span>
          <span><ShieldCheck size={15} />Gratuit · sans compte</span>
          <a href="#collection"><Play size={14} />Voir les jeux ↓</a>
        </div>
      </div>
      <div className="arcade-hero-light" aria-hidden="true"><div className="arcade-light-inner" /></div>
    </section>

    {launched && <section ref={playSectionRef} className="arcade-play-section" aria-label="Jeu sélectionné">
      <div className="arcade-stage-head">
        <div><span className="arcade-kicker">MISSION SÉLECTIONNÉE · {selected.group === "agx" ? "COLLECTION AGX" : "CRÉATION DU SITE"}</span><h2>{selected.name}</h2></div>
        <div className="arcade-stage-actions">
          <button type="button" onClick={() => { setLaunched(false); setFrameLoaded(false); document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }); }} title="Fermer le jeu et libérer ses ressources"><X size={17} /><span>Fermer</span></button>
          <a href={selected.src} target="_blank" rel="noreferrer" title="Ouvrir le jeu dans un nouvel onglet"><ExternalLink size={17} /><span>Nouvel onglet</span></a>
          <button type="button" onClick={fullscreen} title="Passer le jeu en plein écran"><Maximize2 size={17} /><span>Plein écran</span></button>
        </div>
      </div>
      <div className="arcade-frame-shell">
        <iframe ref={frameRef} key={`${selected.id}-${reload}`} className="arcade-frame" src={selected.src} title={selected.name} allow="fullscreen; gamepad" allowFullScreen onLoad={() => { setFrameLoaded(true); setSlowLoad(false); frameRef.current?.focus(); }} />
        {!frameLoaded && <div className="arcade-loading"><LoaderCircle size={28} /><strong>{slowLoad ? "Le chargement prend plus de temps" : "Préparation de la mission…"}</strong><span>{slowLoad ? "Essaie le nouvel onglet ou relance le chargement." : "Le jeu se prépare dans ton navigateur."}</span>{slowLoad && <button type="button" onClick={() => { setReload(value => value + 1); setSlowLoad(false); }}><RotateCcw size={14} /> Réessayer</button>}</div>}
        <div className="arcade-stage-bottom"><span><i className={frameLoaded ? "is-ready" : ""} />{frameLoaded ? "INTERFACE CHARGÉE" : "CHARGEMENT DU JEU"}</span><span>{selected.mode.toUpperCase()}</span></div>
      </div>
      <div className="arcade-controls"><Gamepad2 size={17} /><span>{selected.controls}</span><button type="button" onClick={() => { if (sound) { stopSiteSpeech(); setSound(false); } else setSound(true); }} title={sound ? "Désactiver l’annonce vocale" : "Activer l’annonce vocale"}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Voix {sound ? "active" : "désactivée"}</span></button></div>
      <p className="arcade-play-help">Clique dans le jeu pour lui donner le clavier. Utilise « Nouvel onglet » si un jeu manque de place. Les records sont propres à ce navigateur ; le Hall of Fame les rassemble sur cet appareil.</p>
    </section>}


    <section id="collection" className="arcade-library" aria-label="Collection de jeux">
      <div className="arcade-library-title">
        <div><span className="arcade-kicker">{AGX_GAMES.length} JEUX AGX · {SITE_GAMES.length} CRÉATIONS ET ESPACES DU SITE</span><h2>La collection KITT</h2></div>
        <span className="arcade-plays">{Object.values(plays).reduce((a, b) => a + b, 0)} lancements sur cet appareil</span>
      </div>
      <div className="arcade-filters" role="group" aria-label="Filtrer les jeux">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tous les jeux <span>{GAMES.length}</span></button>
        <button type="button" aria-pressed={filter === "agx"} onClick={() => setFilter("agx")}>Collection AGX <span>{AGX_GAMES.length}</span></button>
        <button type="button" aria-pressed={filter === "site"} onClick={() => setFilter("site")}>Créations du site <span>{SITE_GAMES.length}</span></button>
        <button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(value => !value)}><Star size={13} fill={favoritesOnly ? "currentColor" : "none"} /> Mes favoris <span>{favorites.length}</span></button>
      </div>
      <div className="arcade-search-bar"><label className="arcade-search"><Search size={17} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher un jeu, un style, une mission…" aria-label="Rechercher dans la collection" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche"><X size={15} /></button>}</label><label>Style<select value={genre} onChange={e => setGenre(e.target.value)}>{["Tout", "3D", "Course", "Puzzle", "Labyrinthe", "Combat", "Survie"].map(value => <option key={value}>{value}</option>)}</select></label><label>Trier<select value={sort} onChange={e => setSort(e.target.value)}><option value="collection">Ordre de la collection</option><option value="popular">Mes plus joués</option><option value="name">Nom de A à Z</option></select></label></div>
      <p className="arcade-search-count" role="status">{visibleGames.length} résultat{visibleGames.length > 1 ? "s" : ""} <span>Les jeux se chargent uniquement quand tu cliques sur Jouer.</span></p>
      <div className="arcade-cards">
        {visibleGames.map((game) => <article className={`arcade-card ${selected.id === game.id ? "selected" : ""}`} key={game.id}>
          <div className={`arcade-card-art art-${game.id}`}>
            <span className="arcade-card-number">{String(GAMES.indexOf(game) + 1).padStart(2, "0")}</span>
            <button type="button" className={`arcade-favorite ${favorites.includes(game.id) ? "is-favorite" : ""}`} onClick={() => toggleFavorite(game.id)} aria-label={`${favorites.includes(game.id) ? "Retirer" : "Ajouter"} ${game.name} ${favorites.includes(game.id) ? "des" : "aux"} favoris`} aria-pressed={favorites.includes(game.id)}><Star size={17} fill={favorites.includes(game.id) ? "currentColor" : "none"} /></button>
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
        {!visibleGames.length && <div className="arcade-no-results"><Search size={28} /><h3>{favoritesOnly && !favorites.length ? "Choisis tes favoris" : "Aucun jeu trouvé"}</h3><p>{favoritesOnly && !favorites.length ? "Utilise l’étoile sur une carte pour créer ta propre collection." : "Essaie un autre mot ou retire les filtres."}</p><button type="button" onClick={() => { setQuery(""); setGenre("Tout"); setFilter("all"); setFavoritesOnly(false); }}>Afficher toute la collection</button></div>}
      </div>
    </section>

    <aside className="arcade-credits"><ShieldCheck size={18} /><p><strong>À propos des droits et des crédits</strong><br />Ces jeux sont des créations de fans associées au projet KITT Franco-Belge. Knight Rider, KITT et KARR restent des marques et personnages appartenant à leurs ayants droit. Les jeux ne sont ni officiels ni affiliés aux détenteurs de ces droits. Les éléments tiers éventuels et leurs licences sont précisés dans les crédits du jeu concerné.</p><a href="/static/games/THIRD-PARTY-LICENSES.md">Crédits des moteurs <ExternalLink size={13} /></a><a href="/mentions-legales">Mentions légales <ExternalLink size={13} /></a></aside>
    <footer className="arcade-footer"><a href="/">← KITT Franco-Belge</a><span>BY MANIX · POUR LES FANS, PAR DES FANS</span></footer>
  </main>;
}
