/*
 * KITT FRANCO-BELGE — Page d'atterrissage principale
 * Design: Rétro-futuriste Automobile / Dashboard Haute Performance
 * Sections: Hero, Histoire de la marque, Services, Preuve sociale, Contact
 * Palette: Noir (#0A0000) + Rouge KITT (#FF2222) + Argent (#C0C0C0)
 * Typo: Orbitron (titres) + Space Mono (données) + Rajdhani (corps)
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";
import TypewriterText from "@/components/TypewriterText";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { toast } from "sonner";
import LangSelector from "@/components/LangSelector";
import { useLanguage } from "@/contexts/LanguageContext";
import { getApiBase } from "@/lib/tunnel";

// ─── Image Assets (CDN) ───────────────────────────────────────────────────────
const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_hero_bg-VWv6QwEucPEXJkzKqNiyZu.webp";
const DASHBOARD_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_dashboard-MBu2T8YT7YQFLUit2bKW4b.webp";
const AI_CIRCUIT_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_ai_circuit-G9xZKptt82zWpuBQmQfjTS.webp";
const SCANNER_BAR_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_scanner_bar-Aeu2AWXPNCnZyHCTLJvSVC.webp";

// ─── Data ─────────────────────────────────────────────────────────────────────
const SERVICES = [
  {
    id: "01",
    title: "Intelligence Artificielle Locale",
    subtitle: "KYRONEX A.I. System",
    description:
      "Développement d'une IA locale expérimentale fonctionnant sur architecture Jetson AJX 32/64. Traitement autonome, sans dépendance cloud, pour une réactivité maximale.",
    icon: "🧠",
    tag: "JETSON / LOCAL",
  },
  {
    id: "02",
    title: "Interface Publique KITT",
    subtitle: "Système Central en Ligne",
    description:
      "La première interface publique du projet KITT Franco-Belge est accessible en ligne. Évolution continue : améliorations déployées quotidiennement, parfois heure par heure. Disponible tous les jours de 08h00 à 23h00.",
    icon: "🖥️",
    tag: "08H00 — 23H00",
  },
  {
    id: "03",
    title: "Navigation & Détection",
    subtitle: "GPS + Radar Fix",
    description:
      "Intégration GPS avancée et détection radar via fichiers CSV nationaux. Système de navigation autonome inspiré des capacités de K.I.T.T. de la série Knight Rider.",
    icon: "📡",
    tag: "GPS / RADAR",
  },
  {
    id: "04",
    title: "Électronique Embarquée",
    subtitle: "Convertisseur DC-DC & Console",
    description:
      "Conception et test de systèmes électroniques embarqués : convertisseur DC-DC 12,4V stable, protection contre les surtensions, nouvelle console haute Pascal K industrie / Vincenzo Forte.",
    icon: "⚡",
    tag: "HARDWARE",
  },
  {
    id: "05",
    title: "Base de Données Vidéo",
    subtitle: "Archive Internationale",
    description:
      "Constitution d'une base de données vidéo internationale multilingue dédiée à la naissance et à la création du nouveau KITT K2000. Documentation exhaustive du projet.",
    icon: "🎬",
    tag: "MEDIA / DATA",
  },
  {
    id: "06",
    title: "Réplique & Restauration",
    subtitle: "Pontiac Trans Am",
    description:
      "Projet de réplique fidèle de K.I.T.T. sur base Pontiac Trans Am. Travail artisanal passionnel alliant authenticité technique et respect de l'univers Knight Rider.",
    icon: "🚗",
    tag: "REPLICA",
  },
];

const REVIEWS = [
  {
    author: "Virginie Barbay",
    role: "Membre Admin",
    text: "Ça va mieux Manu ! Le projet avance vraiment bien, on voit l'évolution chaque semaine. Impressionnant le travail accompli.",
    reactions: "❤️",
    date: "Il y a 3 semaines",
  },
  {
    author: "Julie Stephane",
    role: "Membre",
    text: "K2000 ! Bonjour — le projet est incroyable, ça ressemble vraiment à KITT. Le scanner est bluffant de réalisme !",
    reactions: "👍",
    date: "Il y a 1 semaine",
  },
  {
    author: "Knight Rider 95",
    role: "Groupe K2000 France",
    text: "KRMEX ressort légèrement, on dirait... La qualité de la réplique est vraiment au niveau. Bravo pour ce travail de passionné.",
    reactions: "🔥",
    date: "Il y a 1 semaine",
  },
  {
    author: "K2000 Knight Rider France",
    role: "16.6K+ abonnés",
    text: "La première interface du projet KITT Franco-Belge est désormais accessible en ligne. Une initiative remarquable dans la communauté francophone.",
    reactions: "⭐",
    date: "Récemment",
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useIntersection(ref: React.RefObject<Element | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { play } = useSoundEffects();
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    play("click");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? "rgba(10, 0, 0, 0.95)"
          : "transparent",
        backdropFilter: scrolled ? "blur(10px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255, 34, 34, 0.2)" : "none",
      }}
    >
      <div className="container flex items-center justify-between py-4" style={{ position: "relative" }}>
        {/* LangSelector mobile — centré en haut */}
        <div className="md:hidden" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", zIndex: 40 }}>
          <LangSelector />
        </div>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative flex-shrink-0">
            <div
              className="w-full h-full"
              style={{
                background: "linear-gradient(135deg, #cc1111, #ff2222)",
                clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              }}
            />
          </div>
          <div>
            <div
              className="text-white font-bold text-sm tracking-widest"
              style={{ fontFamily: "Orbitron, monospace" }}
            >
              KITT
            </div>
            <div
              className="text-xs tracking-widest"
              style={{ fontFamily: "Space Mono, monospace", color: "#ff2222", fontSize: "0.55rem" }}
            >
              FRANCO-BELGE
            </div>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {(["histoire", "services", "videos", "avis", "contact"] as const).map((id) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
              style={{
                fontFamily: "Space Mono, monospace",
                color: "rgba(192, 192, 192, 0.7)",
                fontSize: "0.65rem",
              }}
            >
              {t(`nav.${id}`)}
            </button>
          ))}
          <Link
            href="/karr"
            className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.karr")}
          </Link>
          <Link
            href="/soumettre"
            className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.soumettre")}
          </Link>
          <Link
            href="/videos"
            className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.galerie")}
          </Link>
          <Link
            href="/musique"
            className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.musique")}
          </Link>
          <Link
            href="/documents"
            className="text-xs tracking-widest uppercase transition-colors hover:text-red-500"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.docs")}
          </Link>
          <LangSelector />
          <a
            href="https://on3egs.github.io/Kitt-franco-belge/kyronex/"
            target="_blank"
            rel="noopener noreferrer"
            className="kitt-btn text-xs px-4 py-2 hover:play-sound"
            style={{ fontSize: "0.6rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.access")}
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => {
            play("hover");
            setMenuOpen(!menuOpen);
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-0.5 w-6 transition-all duration-300"
              style={{
                background: "#ff2222",
                transform:
                  menuOpen
                    ? i === 0
                      ? "rotate(45deg) translate(4px, 4px)"
                      : i === 2
                      ? "rotate(-45deg) translate(4px, -4px)"
                      : "opacity: 0"
                    : "none",
                opacity: menuOpen && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden py-4 px-6 flex flex-col gap-4"
          style={{ background: "rgba(10, 0, 0, 0.98)", borderTop: "1px solid rgba(255,34,34,0.2)" }}
        >
          {(["histoire", "services", "videos", "avis", "contact"] as const).map((id) => (
            <button
              key={id}
              onClick={() => { scrollTo(id); setMenuOpen(false); }}
              className="text-left text-xs tracking-widest uppercase"
              style={{ fontFamily: "Space Mono, monospace", color: "#c0c0c0" }}
            >
              {t(`nav.${id}`)}
            </button>
          ))}
          <Link
            href="/karr"
            className="text-left text-xs tracking-widest uppercase"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.karr")}
          </Link>
          <Link
            href="/soumettre"
            className="text-left text-xs tracking-widest uppercase"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.soumettre")}
          </Link>
          <Link
            href="/videos"
            className="text-left text-xs tracking-widest uppercase"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.galerie")}
          </Link>
          <Link
            href="/musique"
            className="text-left text-xs tracking-widest uppercase"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.musique")}
          </Link>
          <Link
            href="/documents"
            className="text-left text-xs tracking-widest uppercase"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.7)", fontSize: "0.65rem" }}
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.docs")}
          </Link>
          <a
            href="https://on3egs.github.io/Kitt-franco-belge/kyronex/"
            target="_blank"
            rel="noopener noreferrer"
            className="kitt-btn text-center"
            style={{ fontSize: "0.6rem" }}
            onMouseEnter={() => play("hover")}
          >
            {t("nav.access")}
          </a>
        </div>
      )}
    </nav>
  );
}

function HeroSection() {
  const [phase, setPhase] = useState(0);
  const { play } = useSoundEffects();
  const { t } = useLanguage();
  const bgScannerRef = useRef<HTMLCanvasElement>(null);
  const bgScannerPosRef = useRef(0);
  const bgScannerDirRef = useRef(1);
  const bgScannerAnimRef = useRef<number>(0);
  const carScannerRef = useRef<HTMLCanvasElement>(null);
  const carScannerPosRef = useRef(0);
  const carScannerDirRef = useRef(1);
  const carScannerAnimRef = useRef<number>(0);

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase(1); play("glitch"); }, 300);
    const t2 = setTimeout(() => { setPhase(2); play("boot"); }, 1200);
    const t3 = setTimeout(() => { setPhase(3); play("scanner"); }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Animate background scanner
  useEffect(() => {
    const canvas = bgScannerRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const NUM_LEDS = 20;
    const LED_H = canvas.height / NUM_LEDS;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < NUM_LEDS; i++) {
        const dist = Math.abs(i - bgScannerPosRef.current);
        const maxDist = 4;
        const intensity = Math.max(0, 1 - dist / maxDist);

        const r = Math.floor(255 * intensity);
        const g = 0;
        const b = 0;
        const alpha = 0.05 + intensity * 0.2;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        const y = i * LED_H + 2;
        const h = LED_H - 4;
        ctx.fillRect(0, y, canvas.width, h);

        if (intensity > 0.3) {
          ctx.shadowColor = `rgba(255, 34, 34, ${intensity * 0.3})`;
          ctx.shadowBlur = 20 * intensity;
          ctx.fillStyle = `rgba(255, 100, 100, ${intensity * 0.15})`;
          ctx.fillRect(0, y + 2, canvas.width, h - 4);
          ctx.shadowBlur = 0;
        }
      }

      bgScannerPosRef.current += bgScannerDirRef.current * 0.05;
      if (bgScannerPosRef.current >= NUM_LEDS - 1) bgScannerDirRef.current = -1;
      if (bgScannerPosRef.current <= 0) bgScannerDirRef.current = 1;

      bgScannerAnimRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(bgScannerAnimRef.current);
  }, []);

  // ── Scanner KITT — superposé pixel-perfect sur le scanner de la photo ────
  useEffect(() => {
    const canvas = carScannerRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  Position du scanner dans l'IMAGE SOURCE (fraction 0→1)            ║
    // ║  Ces coordonnées pointent vers le scanner rouge dans la photo KITT  ║
    // Coordonnées réelles du scanner dans l'IMAGE SOURCE (fraction 0→1)
    // Ces valeurs sont indépendantes de la taille d'écran — elles pointent
    // vers le scanner rouge dans la photo, et le calcul cover+bg-position
    // projette automatiquement au bon endroit quel que soit le viewport.
    const IMG_SCANNER_CX = 0.3277; // centre X dans l'image source
    const IMG_SCANNER_CY = 0.4976; // centre Y dans l'image source
    const IMG_SCANNER_W  = 0.140;  // largeur du scanner / largeur image
    const IMG_SCANNER_H  = 0.0105; // hauteur du scanner / hauteur image
    // CSS background: backgroundPosition "center 30%"
    const BG_POS_X = 0.50;
    const BG_POS_Y = 0.30;
    // ╚══════════════════════════════════════════════════════════════════════╝

    const NUM_LEDS    = 9;
    const SWEEP_SPEED = 0.020;

    let t = 0;
    let imgNW = 0;
    let imgNH = 0;

    // Charge l'image pour obtenir ses dimensions naturelles
    const img = new Image();
    img.onload = () => { imgNW = img.naturalWidth; imgNH = img.naturalHeight; };
    img.src = HERO_BG;

    // Calcule la position viewport du scanner en tenant compte de cover + bg-position
    const getScannerRect = () => {
      const vpW = canvas.width;
      const vpH = canvas.height;

      if (!imgNW || !imgNH) {
        // Fallback proportionnel tant que l'image n'est pas chargée
        return { cx: vpW * 0.44, cy: vpH * 0.50, sw: vpW * 0.18, sh: vpH * 0.022 };
      }

      // background-size: cover — scale pour couvrir tout le viewport
      const scale = Math.max(vpW / imgNW, vpH / imgNH);
      const rW = imgNW * scale;  // largeur rendue
      const rH = imgNH * scale;  // hauteur rendue

      // background-position: center 30%
      // overflow horizontal distribué 50/50, vertical distribué 30/70
      const offX = (vpW - rW) * BG_POS_X;
      const offY = (vpH - rH) * BG_POS_Y;

      // Position du scanner dans le viewport (100% math, 0 pixel offset)
      const cx = offX + IMG_SCANNER_CX * rW;
      const cy = offY + IMG_SCANNER_CY * rH;
      const sw = IMG_SCANNER_W * rW;
      const sh = Math.max(6, IMG_SCANNER_H * rH);

      return { cx, cy, sw, sh };
    };

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { cx, cy, sh } = getScannerRect();

      // Oscillation sinusoïdale — mouvement authentique KITT
      const sine   = Math.sin(t);
      const ledPos = (sine * 0.5 + 0.5) * (NUM_LEDS - 1);
      const pulse  = 0.85 + 0.15 * Math.sin(t * 3.7);

      // ── Rectangles 2:1 — largeur = 2× hauteur, toujours ──────────────
      const LED_W   = sh * 2;                        // ratio 2:1 garanti
      const LED_GAP = Math.max(2, Math.round(sh * 0.22)) + 3; // espace entre LEDs
      const sw      = NUM_LEDS * (LED_W + LED_GAP) - LED_GAP; // largeur totale
      const startX  = cx - sw / 2;
      const startY  = cy - sh / 2;

      // ── Halo ambiant (lueur diffuse sur toute la barre) ───────────────
      const aGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sw * 0.65);
      aGrad.addColorStop(0,   `rgba(255, 20, 0, ${0.10 * pulse})`);
      aGrad.addColorStop(0.6, `rgba(200,  0, 0, ${0.05 * pulse})`);
      aGrad.addColorStop(1,   `rgba(255,  0, 0, 0)`);
      ctx.fillStyle = aGrad;
      ctx.fillRect(startX - sw * 0.15, startY - sh * 2, sw * 1.3, sh * 6);

      // ── LEDs individuelles (rectangles 2:1) ───────────────────────────
      for (let i = 0; i < NUM_LEDS; i++) {
        const dist      = Math.abs(i - ledPos);
        // Fondu sur les 2 rectangles de chaque extrémité
        const edgeFade  = i < 2 ? (i + 1) / 3 : i >= NUM_LEDS - 2 ? (NUM_LEDS - i) / 3 : 1.0;
        const intensity = Math.max(0, 1 - dist / 5.0) * pulse * edgeFade;
        if (intensity < 0.01) continue;

        const x = startX + i * (LED_W + LED_GAP);

        // Corps LED avec dégradé chaud → sombre
        const lg = ctx.createLinearGradient(x, startY, x, startY + sh);
        lg.addColorStop(0,   `rgba(255, ${Math.floor(160 * intensity)}, 40, ${intensity})`);
        lg.addColorStop(0.5, `rgba(255, ${Math.floor(30  * intensity)},  0, ${intensity})`);
        lg.addColorStop(1,   `rgba(160,   0,  0, ${intensity * 0.6})`);
        ctx.fillStyle = lg;
        ctx.fillRect(x + 1, startY, LED_W - 2, sh);

        // Glow
        if (intensity > 0.2) {
          ctx.save();
          ctx.shadowColor = `rgba(255, 40, 0, ${intensity})`;
          ctx.shadowBlur  = 18 * intensity;
          ctx.fillStyle   = `rgba(255, ${Math.floor(180 * intensity)}, 80, ${intensity * 0.9})`;
          ctx.fillRect(x + LED_W * 0.2, startY + 1, LED_W * 0.6, sh * 0.5);
          ctx.restore();
        }
      }

      // ── Reflet sur la carrosserie — ellipse douce, aucun rectangle ────
      const refAlpha  = 0.18 * Math.abs(sine) * pulse;
      const reflectCX = startX + ledPos * (LED_W + LED_GAP);
      const reflectCY = startY + sh + sh * 0.8;
      const refRX     = LED_W * 3;   // rayon horizontal (suit le point lumineux)
      const refRY     = sh * 1.8;    // rayon vertical (aplati comme une réflexion)

      ctx.save();
      // Étirer horizontalement pour simuler une ellipse large et plate
      ctx.scale(1, 0.45);
      const rg = ctx.createRadialGradient(
        reflectCX, reflectCY / 0.45, 0,
        reflectCX, reflectCY / 0.45, refRX * 2.5
      );
      rg.addColorStop(0,   `rgba(255, 40, 0, ${refAlpha})`);
      rg.addColorStop(0.4, `rgba(220, 10, 0, ${refAlpha * 0.5})`);
      rg.addColorStop(1,   `rgba(180,  0, 0, 0)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(reflectCX, reflectCY / 0.45, refRX * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      t += SWEEP_SPEED;
      carScannerAnimRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(carScannerAnimRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col justify-end overflow-hidden"
      style={{ background: "#0a0000" }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          opacity: phase >= 1 ? 0.7 : 0,
        }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, #0a0000 0%, rgba(10,0,0,0.6) 40%, rgba(10,0,0,0.2) 70%, rgba(10,0,0,0.5) 100%)",
        }}
      />

      {/* Background scanner overlay */}
      <canvas
        ref={bgScannerRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          opacity: phase >= 1 ? 0.4 : 0,
          transition: "opacity 0.8s ease",
        }}
      />

      {/* Car scanner overlay - positioned on the hood */}
      <canvas
        ref={carScannerRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          opacity: phase >= 1 ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
          zIndex: 2,
        }}
      />

      {/* System status top-right */}
      <div
        className="absolute top-24 right-6 md:right-12 text-right hidden md:block"
        style={{
          fontFamily: "Space Mono, monospace",
          fontSize: "0.6rem",
          color: "rgba(255, 34, 34, 0.6)",
          letterSpacing: "0.15em",
          zIndex: 3,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 0.8s",
        }}
      >
        <div>SYS_ID: KFB-2026</div>
        <div>ARCH: JETSON AJX 32/64</div>
        <div>STATUS: <span style={{ color: "#ff2222" }}>ONLINE</span></div>
        <div>MEMBRES: 5.0K+</div>
      </div>

      {/* Main content */}
      <div className="relative z-10 container pb-20 pt-32 text-center md:text-left">
        {/* Label */}
        <div
          className="section-label mb-4"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "translateX(0)" : "translateX(-20px)",
            transition: "all 0.6s ease",
          }}
        >
          {t("hero.label")}
        </div>

        {/* Main title */}
        <h1
          className="text-5xl md:text-7xl lg:text-8xl font-black mb-2 leading-none"
          style={{
            fontFamily: "Orbitron, monospace",
            color: "white",
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          KITT
        </h1>
        <h2
          className="text-2xl md:text-4xl lg:text-5xl font-bold mb-6"
          style={{
            fontFamily: "Orbitron, monospace",
            color: "#ff2222",
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease 0.2s",
          }}
        >
          FRANCO-BELGE
        </h2>

        {/* Scanner bar */}
        <div
          className="mb-8 max-w-md"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transition: "opacity 0.5s ease 0.4s",
          }}
        >
          <KittScanner height={10} />
        </div>

        {/* Tagline */}
        <div
          className="mb-10 max-w-xl"
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transition: "opacity 0.8s ease",
          }}
        >
          <p
            className="text-lg md:text-xl mb-2"
            style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(220,220,220,0.9)", fontWeight: 500 }}
          >
            {t("hero.tagline")}
          </p>
          <p
            className="text-sm"
            style={{ fontFamily: "Space Mono, monospace", color: "rgba(192,192,192,0.6)", lineHeight: 1.8 }}
          >
            {t("hero.subtitle")}{" "}
            <span style={{ color: "#ff2222" }}>Emmanuel Gelinne (Manix)</span>
          </p>
        </div>

        {/* CTA buttons */}
        <div
          className="flex flex-wrap gap-4 justify-center md:justify-start"
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transform: phase >= 3 ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.6s ease 0.2s",
          }}
        >
          <a
            href="https://on3egs.github.io/Kitt-franco-belge/kyronex/"
            target="_blank"
            rel="noopener noreferrer"
            className="kitt-btn"
          >
            {t("hero.cta1")}
          </a>
          <button
            onClick={() => {
              play("click");
              document.getElementById("histoire")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all hover:border-red-500 hover:text-red-400"
            style={{
              fontFamily: "Orbitron, monospace",
              color: "rgba(192,192,192,0.8)",
              border: "1px solid rgba(192,192,192,0.3)",
              fontSize: "0.7rem",
            }}
          >
            {t("hero.cta2")}
          </button>
          <Link
            href="/soumettre"
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: "0.65rem",
              letterSpacing: "0.12em",
              color: "#ff2222",
              border: "1px solid #ff2222",
              padding: "14px 22px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              background: "rgba(255,34,34,0.08)",
              boxShadow: "0 0 12px rgba(255,34,34,0.25)",
              transition: "background 0.2s ease, box-shadow 0.2s ease",
              animation: "hero-cta-pulse 3s ease-in-out infinite",
            }}
            onMouseEnter={e => { play("hover"); (e.currentTarget as HTMLElement).style.background = "rgba(255,34,34,0.2)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px rgba(255,34,34,0.6)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,34,34,0.08)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 12px rgba(255,34,34,0.25)"; }}
          >
            🚗 {t("hero.propose")}
          </Link>
        </div>
      </div>

      {/* Bottom scanner */}
      <div className="relative z-10">
        <KittScanner height={6} />
      </div>
    </section>
  );
}

function StorySection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const { t } = useLanguage();

  return (
    <section
      id="histoire"
      ref={ref}
      className="relative py-24 overflow-hidden"
      style={{ background: "#0a0000" }}
    >
      {/* Background AI circuit image */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${AI_CIRCUIT_IMG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.08,
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,34,34,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative container">
        {/* Section header */}
        <div
          className="mb-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="section-label mb-3 text-center md:text-left">{t("story.label")}</div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            {t("story.title1")}
            <br />
            <span style={{ color: "#ff2222" }}>{t("story.title2")}</span>
          </h2>
        </div>

        {/* Content grid */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(-30px)",
              transition: "all 0.8s ease 0.2s",
            }}
          >
            <div
              className="p-6 mb-6"
              style={{
                background: "rgba(255, 34, 34, 0.05)",
                borderLeft: "3px solid #ff2222",
                borderBottom: "1px solid rgba(255,34,34,0.2)",
              }}
            >
              <div className="section-label mb-2">{t("story.genesis")}</div>
              <p
                className="text-base leading-relaxed"
                style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(220,220,220,0.85)", fontSize: "1.05rem" }}
              >
                {t("story.p1")}
              </p>
            </div>

            <p
              className="mb-6 leading-relaxed"
              style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.75)", fontSize: "1rem", lineHeight: 1.9 }}
            >
              {t("story.p2")}
            </p>

            <p
              className="mb-8 leading-relaxed"
              style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.75)", fontSize: "1rem", lineHeight: 1.9 }}
            >
              {t("story.p3")}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: "5K+", label: t("story.stat1") },
                { value: "2026", label: t("story.stat2") },
                { value: "24/7", label: t("story.stat3") },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="text-center p-4"
                  style={{
                    background: "rgba(255,34,34,0.05)",
                    border: "1px solid rgba(255,34,34,0.2)",
                  }}
                >
                  <div className="stat-number text-2xl">{value}</div>
                  <div
                    className="mt-1"
                    style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", letterSpacing: "0.2em" }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Image + info panel */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(30px)",
              transition: "all 0.8s ease 0.4s",
            }}
          >
            <div
              className="relative mb-6 overflow-hidden"
              style={{ border: "1px solid rgba(255,34,34,0.3)" }}
            >
              <img
                src={SCANNER_BAR_IMG}
                alt="Scanner KITT"
                className="w-full object-cover"
                style={{ height: "220px" }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 p-4"
                style={{ background: "linear-gradient(to top, rgba(10,0,0,0.95), transparent)" }}
              >
                <div className="section-label">{t("story.scanner")}</div>
              </div>
            </div>

            {/* Info terminal */}
            <div
              className="p-5"
              style={{
                background: "rgba(10, 0, 0, 0.8)",
                border: "1px solid rgba(255,34,34,0.2)",
                fontFamily: "Space Mono, monospace",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ color: "#ff2222", marginBottom: "0.75rem", letterSpacing: "0.15em" }}>
                {t("story.sheet")}
              </div>
              {[
                [t("story.key.projet"), "KITT Franco-Belge"],
                [t("story.key.auteur"), "Emmanuel Gelinne (Manix)"],
                [t("story.key.arch"), "Jetson AJX 32/64"],
                [t("story.key.statut"), t("story.val.statut")],
                [t("story.key.cadre"), t("story.val.cadre")],
                [t("story.key.licence"), t("story.val.licence")],
              ].map(([key, val]) => (
                <div key={key} className="flex gap-4 mb-2" style={{ borderBottom: "1px solid rgba(255,34,34,0.08)", paddingBottom: "0.4rem" }}>
                  <span style={{ color: "rgba(192,192,192,0.5)", minWidth: "120px", fontSize: "0.65rem" }}>{key}</span>
                  <span style={{ color: "rgba(220,220,220,0.85)", fontSize: "0.65rem" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legal notice */}
        <div
          className="mt-12 p-5"
          style={{
            background: "rgba(255,34,34,0.03)",
            border: "1px solid rgba(255,34,34,0.15)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.6s",
          }}
        >
          <div className="section-label mb-2">{t("story.legal")}</div>
          <p
            style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "rgba(192,192,192,0.5)", lineHeight: 1.9 }}
          >
            {t("story.legal.text")}
          </p>
        </div>
      </div>
    </section>
  );
}

function ServicesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const { t } = useLanguage();

  return (
    <section
      id="services"
      ref={ref}
      className="relative py-24"
      style={{ background: "#080000" }}
    >
      {/* Top diagonal */}
      <div
        className="absolute top-0 left-0 right-0 h-16"
        style={{
          background: "#0a0000",
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 0)",
        }}
      />

      <div className="relative container">
        {/* Header */}
        <div
          className="mb-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="section-label mb-3 text-center md:text-left">{t("services.label")}</div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            {t("services.title1")}
            <br />
            <span style={{ color: "#ff2222" }}>{t("services.title2")}</span>
          </h2>
          <div className="mt-4 max-w-lg">
            <KittScanner height={4} />
          </div>
        </div>

        {/* Services grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((service, i) => {
            const { play: playSound } = useSoundEffects();
            return (
              <div
                key={service.id}
                className="service-card p-6 relative overflow-hidden"
                style={{
                  background: "rgba(10, 0, 0, 0.8)",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(40px)",
                  transition: `all 0.6s ease ${i * 0.1}s`,
                }}
                onMouseEnter={() => playSound("hover")}
              >
              {/* Number */}
              <div
                className="absolute top-4 right-4"
                style={{
                  fontFamily: "Orbitron, monospace",
                  fontSize: "2.5rem",
                  fontWeight: 900,
                  color: "rgba(255,34,34,0.08)",
                  lineHeight: 1,
                }}
              >
                {service.id}
              </div>

              {/* Icon */}
              <div className="text-3xl mb-4">{service.icon}</div>

              {/* Tag */}
              <div
                className="inline-block px-2 py-0.5 mb-3"
                style={{
                  fontFamily: "Space Mono, monospace",
                  fontSize: "0.55rem",
                  letterSpacing: "0.2em",
                  color: "#ff2222",
                  border: "1px solid rgba(255,34,34,0.3)",
                  background: "rgba(255,34,34,0.05)",
                }}
              >
                {service.tag}
              </div>

              {/* Title */}
              <h3
                className="text-base font-bold text-white mb-1"
                style={{ fontFamily: "Orbitron, monospace", fontSize: "0.85rem", lineHeight: 1.4 }}
              >
                {t(`services.${i}.title`)}
              </h3>
              <div
                className="mb-3"
                style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)" }}
              >
                {t(`services.${i}.subtitle`)}
              </div>

              {/* Description */}
              <p
                style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.95rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.7 }}
              >
                {t(`services.${i}.desc`)}
              </p>

                {/* Bottom accent line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: "linear-gradient(90deg, #ff2222, transparent)" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SocialProofSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const { t } = useLanguage();

  return (
    <section
      id="avis"
      ref={ref}
      className="relative py-24 overflow-hidden"
      style={{ background: "#0a0000" }}
    >
      {/* Dashboard background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${DASHBOARD_IMG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.06,
        }}
      />

      <div className="relative container">
        {/* Header */}
        <div
          className="mb-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="section-label mb-3 text-center md:text-left">{t("community.label")}</div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            {t("community.title1")}
            <br />
            <span style={{ color: "#ff2222" }}>{t("community.title2")}</span>
          </h2>
        </div>

        {/* Stats bar */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.2s",
          }}
        >
          {[
            { value: "5 000+", label: t("community.stat1") },
            { value: "38+", label: t("community.stat2") },
            { value: "16+", label: t("community.stat3") },
            { value: "100%", label: t("community.stat4") },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="text-center p-5"
              style={{
                background: "rgba(255,34,34,0.05)",
                border: "1px solid rgba(255,34,34,0.15)",
                borderTop: "2px solid #ff2222",
              }}
            >
              <div className="stat-number text-3xl mb-1">{value}</div>
              <div
                style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", letterSpacing: "0.15em" }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Reviews grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {REVIEWS.map((review, i) => (
            <div
              key={i}
              className="review-card p-6"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(30px)",
                transition: `all 0.6s ease ${i * 0.15}s`,
              }}
            >
              {/* Quote mark */}
              <div
                className="text-5xl mb-3 leading-none"
                style={{ color: "rgba(255,34,34,0.3)", fontFamily: "Georgia, serif" }}
              >
                "
              </div>

              <p
                className="mb-5"
                style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.05rem", color: "rgba(220,220,220,0.85)", lineHeight: 1.8 }}
              >
                {t(`reviews.${i}.text`)}
              </p>

              {/* Author */}
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="font-bold text-white"
                    style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.1em" }}
                  >
                    {review.author}
                  </div>
                  <div
                    style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)" }}
                  >
                    {review.role}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{review.reactions}</span>
                  <span
                    style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.4)" }}
                  >
                    {t(`reviews.${i}.date`)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Facebook CTA */}
        <div
          className="mt-12 flex flex-col sm:flex-row items-center gap-4 justify-center"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.8s ease 0.6s" }}
        >
          <a
            href="https://www.facebook.com/groups/757797724622219/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 transition-all hover:border-red-500"
            style={{
              border: "1px solid rgba(255,34,34,0.3)",
              fontFamily: "Orbitron, monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              color: "rgba(192,192,192,0.8)",
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>👥</span>
            {t("community.cta1")}
          </a>
          <a
            href="https://www.facebook.com/groups/757797724622219/join_request/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 transition-all"
            style={{
              background: "rgba(255,34,34,0.15)",
              border: "1px solid #ff2222",
              fontFamily: "Orbitron, monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              color: "#ff2222",
              boxShadow: "0 0 15px rgba(255,34,34,0.2)",
            }}
          >
            <span style={{ fontSize: "1rem" }}>+</span>
            {t("community.cta2")}
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Progression Section ──────────────────────────────────────────────────────
const PROGRESSION = [
  { label: "Scanner K.I.T.T.", value: 100, tag: "COMPLET" },
  { label: "Intelligence Artificielle KYRONEX", value: 82, tag: "EN LIGNE" },
  { label: "Carrosserie Extérieure", value: 70, tag: "EN COURS" },
  { label: "Dashboard Knight Rider S4", value: 65, tag: "EN COURS" },
  { label: "Électronique Embarquée", value: 58, tag: "EN COURS" },
  { label: "Pare-choc KARR", value: 40, tag: "EN COURS" },
];

function ProgressionSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const [animated, setAnimated] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (visible) setTimeout(() => setAnimated(true), 200);
  }, [visible]);

  return (
    <section
      ref={ref}
      className="relative py-20 overflow-hidden"
      style={{ background: "#050000" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative container">
        <div
          className="mb-12"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s ease" }}
        >
          <div className="section-label mb-3 text-center md:text-left">{t("progression.label")}</div>
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center md:text-left" style={{ fontFamily: "Orbitron, monospace" }}>
            {t("progression.title1")}<br /><span style={{ color: "#ff2222" }}>{t("progression.title2")}</span>
          </h2>
        </div>
        <div className="space-y-6 max-w-3xl">
          {PROGRESSION.map((item, i) => (
            <div
              key={item.label}
              style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-20px)", transition: `all 0.6s ease ${i * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "rgba(192,192,192,0.8)", letterSpacing: "0.1em" }}>
                  {t(`progression.${i}.label`)}
                </span>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.1em" }}>
                    {t(`progression.${i}.tag`)}
                  </span>
                  <span className="stat-number" style={{ fontSize: "0.85rem" }}>{item.value}%</span>
                </div>
              </div>
              <div style={{ height: "6px", background: "rgba(255,34,34,0.1)", border: "1px solid rgba(255,34,34,0.15)", position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: animated ? `${item.value}%` : "0%",
                    background: item.value === 100
                      ? "linear-gradient(90deg, #ff2222, #ff6666)"
                      : "linear-gradient(90deg, #cc1111, #ff2222)",
                    transition: `width 1.2s ease ${i * 0.15}s`,
                    boxShadow: "0 0 8px rgba(255,34,34,0.6)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Videos Section ───────────────────────────────────────────────────────────
const YOUTUBE_VIDEOS = [
  {
    id: "u6uJdicP9ms",
    title: "Kitt Franco Belge",
    desc: "Présentation générale du projet KITT sur base Pontiac Firebird.",
  },
  {
    id: "LGY_-kAH_do",
    title: "Alternateur Firebird",
    desc: "Réparation d'un alternateur CS130 ACDelco Remy — démontage, diagnostic et essais.",
  },
  {
    id: "pl7B0E6fnYs",
    title: "Rassemblement Voitures de Films — Sazilly",
    desc: "Incroyable rassemblement de voitures de films et séries télévisées.",
  },
  {
    id: "EUxVQxS8syo",
    title: "K2000 — 16 secondes de merci",
    desc: "Un immense merci aux membres du groupe pour leur expertise et leur soutien.",
  },
  {
    id: "wNIHv_39V_8",
    title: "KARR — Pare-choc mise en peinture",
    desc: "Avancement de la mise en peinture du pare-choc style KARR (Knight Rider 1982).",
  },
  {
    id: "-LZcgCjkEHs",
    title: "Progression générale du projet",
    desc: "Aperçu intérieur & extérieur : dashboard Knight Rider S4, ponçage et peinture.",
  },
];

interface CommunityVideo {
  id: string;
  url: string;
  pseudo: string;
  message: string;
  ts: number;
  views?: number;
}

function getYtIdHome(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function VideosSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const { play } = useSoundEffects();
  const { t } = useLanguage();
  const [active, setActive] = useState<string | null>(null);
  const [communityVideos, setCommunityVideos] = useState<CommunityVideo[]>([]);
  const [communityCount, setCommunityCount] = useState(0);

  useEffect(() => {
    getApiBase().then(base => {
      if (!base) return;
      fetch(`${base}/api/videos/approved`)
        .then(r => r.json())
        .then(d => {
          const approved: CommunityVideo[] = d.approved || [];
          setCommunityCount(approved.length);
          // 3 dernières soumises
          setCommunityVideos([...approved].reverse().slice(0, 3));
        })
        .catch(() => {});
    });
  }, []);

  const label = { fontFamily: "Space Mono, monospace", fontSize: "0.5rem", letterSpacing: "0.2em" };

  return (
    <section
      id="videos"
      ref={ref}
      className="relative py-24 overflow-hidden"
      style={{ background: "#060000" }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <KittScanner height={3} />

      <div className="relative container pt-12">

        {/* ══════════════════════════════════════════
            SECTION 1 — COMMUNAUTÉ
        ══════════════════════════════════════════ */}
        <div
          className="mb-20"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          {/* Header communauté */}
          <div style={{ ...label, color: "rgba(100,200,100,0.6)", marginBottom: "12px" }}>
            // DOSSIER_COMMUNAUTÉ — GALERIE PARTAGÉE
          </div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left mb-4"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            GALERIE
            <br />
            <span style={{ color: "#44cc44" }}>COMMUNAUTÉ</span>
          </h2>

          {/* Accroche */}
          <p
            className="mb-8 text-center md:text-left"
            style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.85, maxWidth: "600px" }}
          >
            Tu as filmé ta réplique, trouvé une vidéo K2000, ou tu veux partager un moment du projet ?
            {" "}<strong style={{ color: "#44cc44" }}>Rejoins la galerie officielle.</strong>
          </p>

          {/* CTA PRINCIPAL — Publier ma vidéo */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <Link
              href="/soumettre"
              className="inline-flex items-center justify-center gap-3 px-8 py-4 transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(68,204,68,0.25), rgba(68,204,68,0.1))",
                border: "1px solid #44cc44",
                fontFamily: "Orbitron, monospace",
                fontSize: "0.75rem",
                letterSpacing: "0.15em",
                color: "#44cc44",
                boxShadow: "0 0 20px rgba(68,204,68,0.2)",
                textDecoration: "none",
              }}
              onMouseEnter={() => play("hover")}
            >
              <span style={{ fontSize: "1.1rem" }}>▶</span>
              PUBLIER MA VIDÉO
            </Link>
            <Link
              href="/videos"
              className="inline-flex items-center justify-center gap-3 px-8 py-4 transition-all"
              style={{
                border: "1px solid rgba(68,204,68,0.3)",
                fontFamily: "Orbitron, monospace",
                fontSize: "0.7rem",
                letterSpacing: "0.12em",
                color: "rgba(68,204,68,0.7)",
                textDecoration: "none",
              }}
              onMouseEnter={() => play("hover")}
            >
              VOIR LES VIDÉOS DE LA COMMUNAUTÉ
              {communityCount > 0 && (
                <span style={{
                  background: "#44cc44",
                  color: "#000",
                  borderRadius: "999px",
                  padding: "1px 8px",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                }}>
                  {communityCount}
                </span>
              )}
            </Link>
          </div>

          {/* Aperçu des 3 dernières vidéos communauté */}
          {communityVideos.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {communityVideos.map((v, i) => {
                const ytId = getYtIdHome(v.url) || v.id;
                const isYt = !v.url.includes("facebook.com") && !v.url.includes("fb.watch");
                return (
                  <div
                    key={v.id}
                    className="group relative overflow-hidden"
                    style={{
                      border: "1px solid rgba(68,204,68,0.25)",
                      background: "rgba(0,20,0,0.6)",
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateY(0)" : "translateY(30px)",
                      transition: `all 0.6s ease ${i * 0.12}s`,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      play("click");
                      if (window.innerWidth < 768) {
                        window.open(v.url, "_blank");
                      } else {
                        window.open(v.url, "_blank");
                      }
                    }}
                    onMouseEnter={() => play("hover")}
                  >
                    {/* Badge COMMUNAUTÉ */}
                    <div style={{
                      position: "absolute", top: "8px", left: "8px", zIndex: 2,
                      background: "#44cc44", color: "#000",
                      fontFamily: "Orbitron, monospace", fontSize: "0.45rem",
                      fontWeight: 700, letterSpacing: "0.1em",
                      padding: "3px 8px",
                    }}>
                      COMMUNAUTÉ
                    </div>

                    {/* Thumbnail */}
                    <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
                      {isYt ? (
                        <img
                          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                          alt={v.message}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div style={{
                          width: "100%", height: "100%",
                          background: "linear-gradient(135deg, #0d1b3e 0%, #1a3a6e 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ ...label, color: "rgba(100,150,255,0.8)" }}>FACEBOOK VIDEO</span>
                        </div>
                      )}
                      {/* Play overlay */}
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.3)" }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: "rgba(68,204,68,0.85)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ color: "#000", fontSize: "1.1rem", marginLeft: "3px" }}>▶</span>
                        </div>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: "10px 12px" }}>
                      {v.message && (
                        <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(192,192,192,0.75)", fontStyle: "italic", marginBottom: "4px" }}>
                          "{v.message}"
                        </p>
                      )}
                      <div style={{ ...label, color: "rgba(68,204,68,0.5)", fontSize: "0.42rem" }}>
                        {v.pseudo} — {new Date(v.ts * 1000).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </div>
                    </div>

                    {/* Bottom accent vert */}
                    <div style={{ height: "2px", background: "linear-gradient(90deg, #44cc44, transparent)" }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            SECTION 2 — MES VIDÉOS YOUTUBE
        ══════════════════════════════════════════ */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease 0.2s",
            borderTop: "1px solid rgba(255,34,34,0.15)",
            paddingTop: "48px",
          }}
        >
          <div style={{ ...label, color: "rgba(255,34,34,0.5)", marginBottom: "12px" }}>
            {t("videossec.label")}
          </div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left mb-12"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            {t("videossec.title1")}
            <br />
            <span style={{ color: "#ff2222" }}>{t("videossec.title2")}</span>
          </h2>

          {/* Video grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {YOUTUBE_VIDEOS.map((v, i) => (
              <div
                key={v.id}
                className="group relative overflow-hidden"
                style={{
                  border: "1px solid rgba(255,34,34,0.2)",
                  background: "rgba(10,0,0,0.8)",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(30px)",
                  transition: `all 0.6s ease ${i * 0.1}s`,
                }}
              >
                {/* Badge MANIX */}
                <div style={{
                  position: "absolute", top: "8px", left: "8px", zIndex: 2,
                  background: "#ff2222", color: "white",
                  fontFamily: "Orbitron, monospace", fontSize: "0.45rem",
                  fontWeight: 700, letterSpacing: "0.1em",
                  padding: "3px 8px",
                }}>
                  MANIX
                </div>

                {/* Video player */}
                {active === v.id ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${v.id}?autoplay=1`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full"
                    style={{ aspectRatio: "16/9", border: "none" }}
                  />
                ) : (
                  <div
                    className="relative cursor-pointer"
                    style={{ aspectRatio: "16/9" }}
                    onClick={() => {
                      play("click");
                      if (window.innerWidth < 768) {
                        window.open(`https://www.youtube.com/watch?v=${v.id}`, "_blank");
                      } else {
                        setActive(v.id);
                      }
                    }}
                    onMouseEnter={() => play("hover")}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                      alt={v.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="w-14 h-14 flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{
                          background: "rgba(255,34,34,0.9)",
                          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                        }}
                      >
                        <div
                          className="ml-1"
                          style={{
                            width: 0, height: 0,
                            borderTop: "8px solid transparent",
                            borderBottom: "8px solid transparent",
                            borderLeft: "14px solid white",
                          }}
                        />
                      </div>
                    </div>
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5 transition-transform duration-300 origin-left scale-x-0 group-hover:scale-x-100"
                      style={{ background: "linear-gradient(90deg, #ff2222, transparent)" }}
                    />
                  </div>
                )}

                {/* Info */}
                <div className="p-4">
                  <div
                    className="font-bold text-white mb-1 truncate"
                    style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.05em" }}
                  >
                    {t(`videos.${i}.title`)}
                  </div>
                  <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(192,192,192,0.6)", lineHeight: 1.5 }}>
                    {t(`videos.${i}.desc`)}
                  </p>
                </div>

                <div style={{ height: "2px", background: "linear-gradient(90deg, #ff2222, transparent)" }} />
              </div>
            ))}
          </div>

          {/* CTAs YouTube */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://www.youtube.com/@KITTK2000"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 transition-all hover:border-red-500"
              style={{
                border: "1px solid rgba(255,34,34,0.3)",
                fontFamily: "Orbitron, monospace",
                fontSize: "0.7rem",
                letterSpacing: "0.15em",
                color: "rgba(192,192,192,0.8)",
              }}
              onMouseEnter={() => play("hover")}
            >
              <span style={{ fontSize: "1.2rem" }}>▶</span>
              VOIR MA CHAÎNE YOUTUBE
            </a>
            <a
              href="https://www.youtube.com/@KITTK2000?sub_confirmation=1"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 transition-all"
              style={{
                background: "rgba(255,34,34,0.15)",
                border: "1px solid #ff2222",
                fontFamily: "Orbitron, monospace",
                fontSize: "0.7rem",
                letterSpacing: "0.15em",
                color: "#ff2222",
                boxShadow: "0 0 15px rgba(255,34,34,0.2)",
              }}
              onMouseEnter={() => play("hover")}
            >
              <span style={{ fontSize: "1rem" }}>+</span>
              {t("videossec.cta2")}
            </a>
          </div>
        </div>


      </div>
    </section>
  );
}

function ContactSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersection(ref);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const { play } = useSoundEffects();
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      play("glitch");
      toast.error(t("contact.required"));
      return;
    }
    play("notification");
    setSending(true);

    const text =
      `\u{1F534} NOUVEAU MESSAGE — KITT Franco-Belge\n` +
      `\u{1F464} Nom : ${form.name}\n` +
      `\u{1F4E7} Email : ${form.email}\n` +
      `\u{1F4CB} Sujet : ${form.subject || "(aucun)"}\n` +
      `\u{1F4AC} Message :\n${form.message}`;

    try {
      await fetch(
        `https://api.telegram.org/bot8639685200:AAEkGrfpmQkFCP8TlfB-pq5KsQN8s3OlfWU/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: "8591807736", text }),
        }
      );
      play("scanner");
      toast.success(t("contact.success"), {
        duration: 5000,
      });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch {
      play("glitch");
      toast.error(t("contact.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      id="contact"
      ref={ref}
      className="relative py-24"
      style={{ background: "#080000" }}
    >
      {/* Top scanner */}
      <KittScanner height={4} />

      <div className="relative container pt-16">
        {/* Header */}
        <div
          className="mb-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="section-label mb-3 text-center md:text-left">{t("contact.label")}</div>
          <h2
            className="text-3xl md:text-5xl font-bold text-white text-center md:text-left"
            style={{ fontFamily: "Orbitron, monospace" }}
          >
            {t("contact.title1")}
            <br />
            <span style={{ color: "#ff2222" }}>{t("contact.title2")}</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Contact info */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(-30px)",
              transition: "all 0.8s ease 0.2s",
            }}
          >
            <p
              className="mb-8 leading-relaxed"
              style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.05rem", color: "rgba(192,192,192,0.75)", lineHeight: 1.9 }}
            >
              {t("contact.desc")}
            </p>

            {/* Contact cards */}
            <div className="space-y-4">
              {[
                {
                  icon: "📘",
                  label: "FACEBOOK",
                  value: "KITT FRANCO-BELGE",
                  href: "https://www.facebook.com/groups/757797724622219/",
                },
                {
                  icon: "🌐",
                  label: "INTERFACE KITT",
                  value: "on3egs.github.io/Kitt-franco-belge",
                  href: "https://on3egs.github.io/Kitt-franco-belge/kyronex/",
                },
                {
                  icon: "🔑",
                  label: "ACCÈS SYSTÈME",
                  value: t("contact.access"),
                  href: null,
                },
              ].map(({ icon, label, value, href }) => (
                <div
                  key={label}
                  className="flex items-start gap-4 p-4"
                  style={{
                    background: "rgba(255,34,34,0.04)",
                    border: "1px solid rgba(255,34,34,0.15)",
                    borderLeft: "3px solid rgba(255,34,34,0.5)",
                  }}
                >
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <div
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.15em" }}
                    >
                      {label}
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-red-400 transition-colors"
                        style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(220,220,220,0.85)", fontSize: "0.95rem" }}
                      >
                        {value}
                      </a>
                    ) : (
                      <span
                        style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(220,220,220,0.85)", fontSize: "0.95rem" }}
                      >
                        {value}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* System status */}
            <div
              className="mt-8 p-4"
              style={{
                background: "rgba(10,0,0,0.8)",
                border: "1px solid rgba(255,34,34,0.2)",
                fontFamily: "Space Mono, monospace",
                fontSize: "0.65rem",
              }}
            >
              <div style={{ color: "#ff2222", marginBottom: "0.5rem" }}>{t("contact.system")}</div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full pulse-red"
                  style={{ background: "#ff2222", display: "inline-block" }}
                />
                <span style={{ color: "rgba(192,192,192,0.7)" }}>{t("contact.kyronex")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#22ff44", display: "inline-block", boxShadow: "0 0 5px #22ff44" }}
                />
                <span style={{ color: "rgba(192,192,192,0.7)" }}>{t("contact.facebook")}</span>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(30px)",
              transition: "all 0.8s ease 0.4s",
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div
                className="p-5"
                style={{
                  background: "rgba(10,0,0,0.8)",
                  border: "1px solid rgba(255,34,34,0.2)",
                }}
              >
                <div className="section-label mb-4">{t("contact.form")}</div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label
                      className="block mb-1"
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.15em" }}
                    >
                      {t("contact.name")}
                    </label>
                    <input
                      type="text"
                      className="kitt-input w-full"
                      placeholder={t("contact.name.ph")}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      className="block mb-1"
                      style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.15em" }}
                    >
                      {t("contact.email")}
                    </label>
                    <input
                      type="email"
                      className="kitt-input w-full"
                      placeholder="votre@email.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label
                    className="block mb-1"
                    style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.15em" }}
                  >
                    {t("contact.subject")}
                  </label>
                  <input
                    type="text"
                    className="kitt-input w-full"
                    placeholder={t("contact.subject.ph")}
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                </div>

                <div className="mb-6">
                  <label
                    className="block mb-1"
                    style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.7)", letterSpacing: "0.15em" }}
                  >
                    {t("contact.message")}
                  </label>
                  <textarea
                    className="kitt-input w-full resize-none"
                    rows={5}
                    placeholder={t("contact.message.ph")}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  className="kitt-btn w-full"
                  disabled={sending}
                  onMouseEnter={() => !sending && play("hover")}
                >
                  {sending ? t("contact.sending") : t("contact.send")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useLanguage();
  return (
    <footer
      className="relative py-12"
      style={{ background: "#050000", borderTop: "1px solid rgba(255,34,34,0.15)" }}
    >
      <KittScanner height={3} />
      <div className="container pt-8">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div
              className="text-2xl font-black mb-2"
              style={{ fontFamily: "Orbitron, monospace", color: "white" }}
            >
              KITT
            </div>
            <div
              className="mb-4"
              style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "#ff2222", letterSpacing: "0.2em" }}
            >
              FRANCO-BELGE
            </div>
            <p
              style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(192,192,192,0.5)", lineHeight: 1.7 }}
            >
              {t("footer.brand")}
            </p>
          </div>

          {/* Links */}
          <div>
            <div className="section-label mb-4">{t("footer.nav")}</div>
            <div className="space-y-2">
              {[
                { label: t("footer.nav.1"), id: "histoire" },
                { label: t("footer.nav.2"), id: "services" },
                { label: t("footer.nav.3"), id: "avis" },
                { label: t("footer.nav.4"), id: "contact" },
              ].map(({ label, id }) => {
                const { play: playSound } = useSoundEffects();
                return (
                  <button
                    key={id}
                    onClick={() => {
                      playSound("click");
                      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    onMouseEnter={() => playSound("hover")}
                    className="block text-left hover:text-red-400 transition-colors"
                    style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.95rem", color: "rgba(192,192,192,0.6)" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* External links */}
          <div>
            <div className="section-label mb-4">{t("footer.external")}</div>
            <div className="space-y-2">
              {[
                { label: t("footer.ext.1"), href: "https://on3egs.github.io/Kitt-franco-belge/kyronex/" },
                { label: t("footer.ext.2"), href: "https://www.facebook.com/groups/757797724622219/" },
                { label: t("footer.ext.3"), href: "https://www.youtube.com/@KITTK2000" },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-red-400 transition-colors"
                  style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.95rem", color: "rgba(192,192,192,0.6)" }}
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid rgba(255,34,34,0.1)" }}
        >
          <div
            style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.3)", letterSpacing: "0.1em" }}
          >
            {t("footer.copy")}
            {" "}<Link href="/admin" style={{ color: "rgba(255,34,34,0.35)", textDecoration: "none", padding: "0 4px", fontSize: "0.9rem" }} title="⚙">·</Link>
          </div>
          <div
            style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(255,34,34,0.4)", letterSpacing: "0.1em" }}
          >
            {t("hero.label")}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Visitor Counter ──────────────────────────────────────────────────────────
const FALLBACK_COUNT = 3387; // Affiché si le Jetson est hors ligne

const fetchTunnelUrl = getApiBase;

function VisitorCounter() {
  const [count, setCount]       = useState(0);
  const [displayed, setDisplayed] = useState(0);
  const [isNew, setIsNew]       = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const SESSION_KEY = "kitt_counted";
    const alreadyCounted = !!sessionStorage.getItem(SESSION_KEY);

    async function loadCount() {
      let final = FALLBACK_COUNT;
      try {
        const tunnelUrl = await fetchTunnelUrl();
        if (tunnelUrl) {
          const method = alreadyCounted ? "GET" : "POST";
          const r = await fetch(`${tunnelUrl}/api/site-counter`, {
            method,
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const j = await r.json();
            final = Math.max(FALLBACK_COUNT, j.count as number);
            if (!alreadyCounted) {
              sessionStorage.setItem(SESSION_KEY, "1");
              setIsNew(true);
            }
          }
        }
      } catch {
        // Jetson hors ligne — on affiche le fallback
        if (!alreadyCounted) {
          sessionStorage.setItem(SESSION_KEY, "1");
          setIsNew(true);
        }
      }

      setCount(final);

      // Animation compteur qui monte
      let start = Math.max(1, final - 80);
      const step = () => {
        start += Math.ceil((final - start) / 8) || 1;
        setDisplayed(start);
        if (start < final) requestAnimationFrame(step);
        else setDisplayed(final);
      };
      setTimeout(() => requestAnimationFrame(step), 400);
    }

    loadCount();
  }, []);

  const digits = String(displayed).padStart(5, "0").split("");

  return (
    <div
      className="relative w-full py-6 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a0000 0%, #0f0000 50%, #0a0000 100%)" }}
    >
      {/* Ligne rouge top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, #ff2222, transparent)" }} />
      {/* Ligne rouge bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, #ff2222, transparent)" }} />

      <div className="container flex flex-col md:flex-row items-center justify-between gap-6">

        {/* Label gauche */}
        <div style={{ fontFamily: "Space Mono, monospace" }}>
          <div style={{ fontSize: "0.55rem", letterSpacing: "0.25em", color: "rgba(255,34,34,0.5)", marginBottom: "4px" }}>
            {t("counter.label")}
          </div>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.15em", color: "rgba(192,192,192,0.4)" }}>
            {t("counter.sub")}
          </div>
        </div>

        {/* Compteur central */}
        <div className="flex items-center gap-1">
          {digits.map((d, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,34,34,0.06)",
                border: "1px solid rgba(255,34,34,0.25)",
                borderBottom: "2px solid #ff2222",
                padding: "8px 14px",
                fontFamily: "Orbitron, monospace",
                fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
                fontWeight: 900,
                color: "#ff2222",
                textShadow: "0 0 20px rgba(255,34,34,0.8), 0 0 40px rgba(255,34,34,0.4)",
                boxShadow: "0 0 12px rgba(255,34,34,0.15), inset 0 0 8px rgba(255,34,34,0.05)",
                minWidth: "1ch",
                textAlign: "center",
                lineHeight: 1,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Statut droit */}
        <div className="text-right" style={{ fontFamily: "Space Mono, monospace" }}>
          <div style={{ fontSize: "0.55rem", letterSpacing: "0.2em", color: "#ff2222", marginBottom: "4px" }}>
            {t("counter.online")}
          </div>
          <div style={{ fontSize: "0.55rem", letterSpacing: "0.15em", color: "rgba(192,192,192,0.4)" }}>
            {isNew ? t("counter.new") : t("counter.known")}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Subscribe Popup ──────────────────────────────────────────────────────────
function SubscribePopup() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { play } = useSoundEffects();
  const { t } = useLanguage();

  useEffect(() => {
    if (sessionStorage.getItem("kitt_sub_popup")) return;
    const t = setTimeout(() => setVisible(true), 30000);
    return () => clearTimeout(t);
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-xs w-full"
      style={{
        background: "rgba(10,0,0,0.97)",
        border: "1px solid #ff2222",
        boxShadow: "0 0 30px rgba(255,34,34,0.3)",
        animation: "slideInRight 0.4s ease",
      }}
    >
      <style>{`@keyframes slideInRight { from { transform: translateX(120%); opacity:0; } to { transform: translateX(0); opacity:1; } }`}</style>

      {/* Top bar */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #ff2222, transparent)" }} />

      <div className="p-4">
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem("kitt_sub_popup","1"); }}
          className="absolute top-3 right-3"
          style={{ color: "rgba(192,192,192,0.4)", fontSize: "1rem", lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}
        >✕</button>

        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", letterSpacing: "0.2em", marginBottom: "8px" }}>
          {t("popup.label")}
        </div>
        <p style={{ fontFamily: "Orbitron, monospace", fontSize: "0.75rem", color: "white", marginBottom: "12px", lineHeight: 1.5 }}>
          {t("popup.title")}<br />
          <span style={{ color: "#ff2222" }}>{t("popup.highlight")}</span>
        </p>
        <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(192,192,192,0.6)", marginBottom: "14px" }}>
          {t("popup.desc")}
        </p>
        <a
          href="https://www.youtube.com/@KITTK2000?sub_confirmation=1"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { setDismissed(true); sessionStorage.setItem("kitt_sub_popup","1"); play("scanner"); }}
          onMouseEnter={() => play("hover")}
          className="flex items-center justify-center gap-2 w-full py-3"
          style={{
            background: "rgba(255,34,34,0.15)",
            border: "1px solid #ff2222",
            fontFamily: "Orbitron, monospace",
            fontSize: "0.65rem",
            letterSpacing: "0.15em",
            color: "#ff2222",
          }}
        >
          {t("popup.cta")}
        </a>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Welcome Voice KITT (Guy Chapelier) ───────────────────────────────────────
const WELCOME_AUDIO: Record<string, string> = {
  fr: "/assets/welcome_fr.wav",
  en: "/assets/welcome_en.wav",
  nl: "/assets/welcome_nl.wav",
  de: "/assets/welcome_de.wav",
};

function useWelcomeVoice() {
  useEffect(() => {
    if (sessionStorage.getItem("kitt_welcomed")) return;
    const lang = (navigator.language || "fr").toLowerCase().slice(0, 2);
    const src = WELCOME_AUDIO[lang] || WELCOME_AUDIO["fr"];

    // Pré-charger le fichier audio immédiatement
    const audio = new Audio(src);
    audio.volume = 0.82;
    audio.preload = "auto";

    // Déclencher au premier clic/toucher utilisateur (contourne l'autoplay policy)
    function playOnce() {
      audio.play().catch(() => {});
      sessionStorage.setItem("kitt_welcomed", "1");
      document.removeEventListener("click", playOnce);
    }

    document.addEventListener("click", playOnce, { once: true });

    return () => {
      document.removeEventListener("click", playOnce);
    };
  }, []);
}

export default function Home() {
  useWelcomeVoice();
  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>
      <NavBar />
      <HeroSection />
      <VisitorCounter />
      <StorySection />
      <ServicesSection />
      <ProgressionSection />
      <VideosSection />
      <SocialProofSection />
      <ContactSection />
      <Footer />
      <SubscribePopup />
    </div>
  );
}
