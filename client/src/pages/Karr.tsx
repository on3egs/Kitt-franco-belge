import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";

const COMPARAISON = [
  { label: "Couleur principale", kitt: "Noir brillant", karr: "Noir mat" },
  { label: "Pare-choc avant", kitt: "Noir brillant", karr: "Noir mat / Gris" },
  { label: "Personnalité", kitt: "Protecteur, loyal", karr: "Instinct de survie" },
  { label: "Priorité", kitt: "Protéger son conducteur", karr: "Se protéger lui-même" },
  { label: "Voix (VF)", kitt: "Guy Chapelier", karr: "Guy Chapelier" },
  { label: "Scanner", kitt: "Rouge", karr: "Ambre / Jaune (saison 3)" },
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

        <div className="relative container py-20 md:py-32 text-center px-4">
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.6)", letterSpacing: "0.3em", marginBottom: "1rem" }}>
            // KNIGHT INDUSTRIES — PROTOTYPE NON AUTORISÉ
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white mb-2" style={{ fontFamily: "Orbitron, monospace" }}>
            K.A.R.R.
          </h1>
          <h2 className="text-sm md:text-3xl font-bold mb-6" style={{ fontFamily: "Orbitron, monospace", color: "#ff2222" }}>
            KNIGHT AUTOMATED ROVING ROBOT
          </h2>

          <div className="max-w-md mx-auto mb-8">
            <KittScanner height={8} color={{ r: 255, g: 160, b: 0 }} />
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
            <button
              onClick={() => document.getElementById("voix")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-3 px-8 py-4 transition-all"
              style={{ border: "1px solid rgba(255,160,0,0.4)", fontFamily: "Orbitron, monospace", fontSize: "0.7rem", letterSpacing: "0.15em", color: "rgba(255,160,0,0.8)" }}
            >
              DOSSIER VOIX ↓
            </button>
          </div>
        </div>
      </section>

      {/* Comparaison */}
      <section id="comparaison" ref={comparRef} className="relative py-24" style={{ background: "#060000" }}>
        <KittScanner height={3} color={{ r: 255, g: 160, b: 0 }} />
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

          {/* Desktop headers — cachés sur mobile */}
          <div className="hidden md:grid grid-cols-3 gap-4 mb-4 max-w-3xl mx-auto">
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
                style={{
                  opacity: visibleCompar ? 1 : 0,
                  transform: visibleCompar ? "translateY(0)" : "translateY(20px)",
                  transition: `all 0.5s ease ${i * 0.08}s`
                }}
              >
                {/* Mobile : carte empilée */}
                <div className="md:hidden" style={{ background: "rgba(255,34,34,0.03)", borderLeft: "2px solid rgba(255,34,34,0.2)", padding: "10px 12px", marginBottom: "2px" }}>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(192,192,192,0.45)", letterSpacing: "0.05em", marginBottom: "8px" }}>{row.label}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center py-2 px-2" style={{ background: "rgba(255,34,34,0.06)", border: "1px solid rgba(255,34,34,0.15)" }}>
                      <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.45rem", color: "#ff2222", marginBottom: "4px" }}>KITT</div>
                      <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(220,220,220,0.85)" }}>{row.kitt}</div>
                    </div>
                    <div className="text-center py-2 px-2" style={{ background: "rgba(60,60,60,0.06)", border: "1px solid rgba(120,120,120,0.15)" }}>
                      <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.45rem", color: "rgba(192,192,192,0.5)", marginBottom: "4px" }}>KARR</div>
                      <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.85rem", color: "rgba(160,160,160,0.7)" }}>{row.karr}</div>
                    </div>
                  </div>
                </div>
                {/* Desktop : 3 colonnes */}
                <div className="hidden md:grid grid-cols-3 gap-4">
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
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Dossier Voix */}
      <section id="voix" className="relative py-24" style={{ background: "#050000" }}>
        <KittScanner height={3} color={{ r: 255, g: 160, b: 0 }} />
        <div className="relative container pt-12 max-w-4xl">
          <div className="mb-12 text-center">
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,160,0,0.6)", letterSpacing: "0.2em", marginBottom: "8px" }}>
              // DOSSIER CONFIDENTIEL — KNIGHT INDUSTRIES
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "Orbitron, monospace" }}>
              DOSSIER <span style={{ color: "rgba(255,160,0,0.9)" }}>VOIX</span>
            </h2>
            <p className="mt-4 max-w-xl mx-auto" style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.6)", fontSize: "1rem" }}>
              Qui a donné la voix à ces deux intelligences artificielles ? La réponse est différente selon la version.
            </p>
          </div>

          {/* VO */}
          <div className="mb-8 p-6" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,160,0,0.5)", letterSpacing: "0.2em", marginBottom: "12px" }}>
              // VERSION ORIGINALE — ANGLAIS
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4" style={{ background: "rgba(255,34,34,0.05)", border: "1px solid rgba(255,34,34,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#ff2222", letterSpacing: "0.1em", marginBottom: "8px" }}>K.I.T.T.</div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(220,220,220,0.9)", fontWeight: 600 }}>William Daniels</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", marginTop: "6px", lineHeight: 1.7 }}>
                  Calme · Posé · Rassurant · Intelligent
                </div>
              </div>
              <div className="p-4" style={{ background: "rgba(80,80,80,0.05)", border: "1px solid rgba(120,120,120,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "rgba(192,192,192,0.5)", letterSpacing: "0.1em", marginBottom: "8px" }}>K.A.R.R.</div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(192,192,192,0.8)", fontWeight: 600 }}>Peter Cullen <span style={{ fontSize: "0.8rem", color: "rgba(192,192,192,0.4)" }}>(S1)</span></div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1rem", color: "rgba(192,192,192,0.6)", marginTop: "4px" }}>Paul Frees <span style={{ fontSize: "0.8rem", color: "rgba(192,192,192,0.4)" }}>(S3)</span></div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", marginTop: "6px", lineHeight: 1.7 }}>
                  Grave · Froid · Robotique · Menaçant
                </div>
              </div>
            </div>
            <div className="mt-4 px-4 py-2" style={{ background: "rgba(255,34,34,0.04)", borderLeft: "2px solid rgba(255,34,34,0.3)" }}>
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,34,34,0.7)" }}>
                VO — KITT ≠ KARR &nbsp;·&nbsp; Deux acteurs distincts &nbsp;·&nbsp; Deux identités sonores opposées
              </span>
            </div>
          </div>

          {/* VF */}
          <div className="mb-8 p-6" style={{ background: "rgba(255,160,0,0.03)", border: "1px solid rgba(255,160,0,0.15)" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,160,0,0.5)", letterSpacing: "0.2em", marginBottom: "12px" }}>
              // VERSION FRANÇAISE — DOUBLAGE VF
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4" style={{ background: "rgba(255,34,34,0.05)", border: "1px solid rgba(255,34,34,0.15)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#ff2222", letterSpacing: "0.1em", marginBottom: "8px" }}>K.I.T.T.</div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(220,220,220,0.9)", fontWeight: 600 }}>Guy Chapelier</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", marginTop: "6px", lineHeight: 1.7 }}>
                  Chaleureux · Fluide · Protecteur
                </div>
              </div>
              <div className="p-4" style={{ background: "rgba(255,160,0,0.05)", border: "1px solid rgba(255,160,0,0.2)" }}>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "rgba(255,160,0,0.8)", letterSpacing: "0.1em", marginBottom: "8px" }}>K.A.R.R.</div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "1.1rem", color: "rgba(220,220,220,0.9)", fontWeight: 600 }}>Guy Chapelier</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(192,192,192,0.5)", marginTop: "6px", lineHeight: 1.7 }}>
                  Sec · Froid · Sans affect · Menaçant
                </div>
              </div>
            </div>
            <div className="mt-4 px-4 py-2" style={{ background: "rgba(255,160,0,0.06)", borderLeft: "2px solid rgba(255,160,0,0.4)" }}>
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(255,160,0,0.8)" }}>
                VF — KITT = KARR &nbsp;·&nbsp; Un seul acteur &nbsp;·&nbsp; La différence : intonation, rythme, froideur
              </span>
            </div>
          </div>

          {/* Analyse */}
          <div className="mb-8 p-6" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,160,0,0.5)", letterSpacing: "0.2em", marginBottom: "12px" }}>
              // ANALYSE
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.6)", marginBottom: "8px" }}>POURQUOI DEUX VOIX EN VO ?</div>
                <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.95rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.8 }}>
                  Les producteurs voulaient que KARR soit immédiatement identifiable comme une menace. Peter Cullen — connu pour Optimus Prime — apporte une voix naturellement imposante et froide. Le contraste avec William Daniels est total et voulu.
                </p>
              </div>
              <div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "rgba(192,192,192,0.6)", marginBottom: "8px" }}>POURQUOI UNE SEULE VOIX EN VF ?</div>
                <p style={{ fontFamily: "Rajdhani, sans-serif", fontSize: "0.95rem", color: "rgba(192,192,192,0.7)", lineHeight: 1.8 }}>
                  Contrainte de budget et de planning classique dans le doublage des années 80. KARR n'apparaissant que dans 3 épisodes, les studios français ont confié les deux rôles à Guy Chapelier, qui a adapté son interprétation pour les différencier.
                </p>
              </div>
            </div>
          </div>

          {/* Bio button */}
          <div className="flex flex-wrap gap-3">
            <a
              href="https://fr.wikipedia.org/wiki/Guy_Chapelier"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 transition-all"
              style={{ background: "rgba(255,160,0,0.1)", border: "1px solid rgba(255,160,0,0.35)", fontFamily: "Orbitron, monospace", fontSize: "0.6rem", letterSpacing: "0.1em", color: "rgba(255,160,0,0.9)" }}
            >
              ▶ BIO GUY CHAPELIER — WIKIPEDIA
            </a>
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
