import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";

const COMPARAISON = [
  { label: "Couleur principale", kitt: "Noir brillant", karr: "Noir mat" },
  { label: "Pare-choc avant", kitt: "Chrome argenté", karr: "Noir mat / Gris" },
  { label: "Personnalité", kitt: "Protecteur, loyal", karr: "Instinct de survie" },
  { label: "Priorité", kitt: "Protéger son conducteur", karr: "Se protéger lui-même" },
  { label: "Voix", kitt: "William Daniels", karr: "Peter Cullen" },
  { label: "Scanner", kitt: "Rouge — de gauche à droite", karr: "Rouge — identique" },
  { label: "Numéro de série", kitt: "Knight Industries Two Thousand", karr: "Knight Automated Roving Robot" },
  { label: "Statut", kitt: "Héros de la série", karr: "Antagoniste — 3 épisodes" },
];

const PROGRESSION_KARR = [
  { label: "Pare-choc avant — Peinture noire (dessus)", value: 85, tag: "PRESQUE FINI" },
  { label: "Pare-choc avant — Peinture grise (dessous)", value: 20, tag: "EN COURS" },
  { label: "Différenciation visuelle KARR vs KITT", value: 35, tag: "EN COURS" },
  { label: "Intégration électronique KARR", value: 10, tag: "PLANIFIÉ" },
];

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

export default function Karr() {
  const heroRef = useRef<HTMLDivElement>(null);
  const comparRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const visibleCompar = useIntersection(comparRef);
  const visibleProg = useIntersection(progRef);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (visibleProg) setTimeout(() => setAnimated(true), 200);
  }, [visibleProg]);

  return (
    <div className="min-h-screen" style={{ background: "#0a0000" }}>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: "linear-gradient(180deg, #050000 0%, #0a0000 100%)" }}
      >
        {/* Grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255,34,34,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />

        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,34,34,0.08) 0%, transparent 70%)"
        }} />

        <div className="relative container py-32 text-center">
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.3em", marginBottom: "1rem" }}>
            // KNIGHT INDUSTRIES — PROTOTYPE NON AUTORISÉ
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white mb-2" style={{ fontFamily: "Orbitron, monospace" }}>
            K.A.R.R.
          </h1>
          <h2 className="text-xl md:text-3xl font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            KNIGHT AUTOMATED ROVING ROBOT
          </h2>

          <div className="max-w-md mx-auto mb-8">
            <KittScanner height={8} />
          </div>

          <p className="max-w-2xl mx-auto text-lg mb-10" style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.75)", lineHeight: 1.9 }}>
            Le prototype original. L'ancêtre de KITT. Programmé pour assurer sa propre survie avant tout —
            même au détriment de son conducteur. Apparu dans <em>Knight Rider</em> en 1982 et 1983,
            KARR est le double maléfique que Manix recrée sur sa Pontiac Trans Am.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center gap-3 px-8 py-4 transition-all hover:border-red-500"
              style={{ border: "1px solid rgba(255,34,34,0.3)", fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.15em", color: "rgba(192,192,192,0.8)" }}
            >
              ← RETOUR KITT
            </Link>
            <button
              onClick={() => document.getElementById("comparaison")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-3 px-8 py-4 transition-all"
              style={{ background: "rgba(255,34,34,0.15)", border: "1px solid #ff2222", fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.15em", color: "#ff2222" }}
            >
              KARR vs KITT ↓
            </button>
          </div>
        </div>
      </section>

      {/* Comparaison */}
      <section id="comparaison" ref={comparRef} className="relative py-24" style={{ background: "#060000" }}>
        <KittScanner height={3} />
        <div className="relative container pt-12">
          <div className="mb-12 text-center" style={{
            opacity: visibleCompar ? 1 : 0,
            transform: visibleCompar ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease"
          }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em", marginBottom: "8px" }}>
              // ANALYSE COMPARATIVE — DOSSIER KNIGHT INDUSTRIES
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "Orbitron, monospace" }}>
              KARR <span style={{ color: "#ff2222" }}>vs</span> KITT
            </h2>
          </div>

          {/* Headers */}
          <div className="grid grid-cols-3 gap-4 mb-4 max-w-3xl mx-auto">
            <div />
            <div className="text-center p-3" style={{ background: "rgba(255,34,34,0.05)", border: "1px solid rgba(255,34,34,0.2)" }}>
              <span style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "#ff2222" }}>K.I.T.T.</span>
            </div>
            <div className="text-center p-3" style={{ background: "rgba(80,80,80,0.05)", border: "1px solid rgba(150,150,150,0.2)" }}>
              <span style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "rgba(192,192,192,0.6)" }}>K.A.R.R.</span>
            </div>
          </div>

          <div className="max-w-3xl mx-auto space-y-2">
            {COMPARAISON.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-3 gap-4"
                style={{
                  opacity: visibleCompar ? 1 : 0,
                  transform: visibleCompar ? "translateY(0)" : "translateY(20px)",
                  transition: `all 0.5s ease ${i * 0.08}s`
                }}
              >
                <div className="flex items-center px-3 py-3" style={{ background: "rgba(255,34,34,0.03)", borderLeft: "2px solid rgba(255,34,34,0.2)" }}>
                  <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", letterSpacing: "0.05em" }}>{row.label}</span>
                </div>
                <div className="flex items-center justify-center px-3 py-3 text-center" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.15)" }}>
                  <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(220,220,220,0.85)" }}>{row.kitt}</span>
                </div>
                <div className="flex items-center justify-center px-3 py-3 text-center" style={{ background: "rgba(60,60,60,0.06)", border: "1px solid rgba(120,120,120,0.15)" }}>
                  <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.9rem", color: "rgba(160,160,160,0.7)" }}>{row.karr}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Progression KARR Franco-Belge */}
      <section ref={progRef} className="relative py-24" style={{ background: "#080000" }}>
        <div className="relative container">
          <div className="mb-12 text-center" style={{
            opacity: visibleProg ? 1 : 0,
            transform: visibleProg ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s ease"
          }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em", marginBottom: "8px" }}>
              // CHANTIER EN COURS — MANIX
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "Orbitron, monospace" }}>
              KARR <span style={{ color: "#ff2222" }}>FRANCO-BELGE</span>
            </h2>
            <p className="mt-4 max-w-xl mx-auto" style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.6)", fontSize: "1rem" }}>
              Travail en cours sur la Pontiac Trans Am. Le pare-choc avant reçoit sa transformation KARR — noir mat dessus, gris dessous, fidèle à la série 1982.
            </p>
          </div>

          <div className="space-y-6 max-w-2xl mx-auto">
            {PROGRESSION_KARR.map((item, i) => (
              <div key={item.label} style={{
                opacity: visibleProg ? 1 : 0,
                transform: visibleProg ? "translateX(0)" : "translateX(-20px)",
                transition: `all 0.6s ease ${i * 0.1}s`
              }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.8)", letterSpacing: "0.05em" }}>{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)" }}>{item.tag}</span>
                    <span className="stat-number" style={{ fontSize: "0.85rem" }}>{item.value}%</span>
                  </div>
                </div>
                <div style={{ height: "6px", background: "rgba(255,34,34,0.1)", border: "1px solid rgba(255,34,34,0.15)", position: "relative", overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: animated ? `${item.value}%` : "0%",
                    background: "linear-gradient(90deg, #cc1111, #ff2222)",
                    transition: `width 1.2s ease ${i * 0.15}s`,
                    boxShadow: "0 0 8px rgba(255,34,34,0.6)",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <a
              href="https://www.youtube.com/@KITTK2000"
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
              }}
            >
              ▶ SUIVRE L'AVANCEMENT SUR YOUTUBE
            </a>
          </div>
        </div>
      </section>

      {/* Footer simple */}
      <footer className="py-8 text-center" style={{ borderTop: "1px solid rgba(255,34,34,0.1)", background: "#050000" }}>
        <Link href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.2em" }}>
          ← RETOUR AU SYSTÈME KITT FRANCO-BELGE
        </Link>
      </footer>

    </div>
  );
}
