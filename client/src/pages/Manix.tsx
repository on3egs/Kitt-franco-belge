import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import KittScanner from "@/components/KittScanner";

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

const TIMELINE = [
  {
    year: "~1985",
    icon: "📼",
    title: "Le CPC 464 de Grand-Mère",
    text: "Tout commence avec un cadeau extraordinaire : un Schneider CPC 464 avec lecteur K7, offert par sa grand-mère. Dans les librairies de Belgique, un magazine vendu en 7 extraits proposait à chaque numéro une page de code à taper soi-même. Sans internet, sans professeur, sans aide — juste un enfant de 8 ans face à un écran vert, et des lignes de BASIC à reproduire lettre par lettre.",
  },
  {
    year: "Quelques années plus tard",
    icon: "🕵️",
    title: "Le Pirate Blanc",
    text: "Dans un petit village de Belgique, le destin frappe à une porte inattendue. Le père d'un ami — un homme discret qui travaille pour la police Belgo-Luxembourgeoise comme pirate blanc — devient une figure de mentor. Chaque visite chez son ami se transforme en séance d'observation fascinée : des lignes de code défilent sur l'écran, et Manix est comme hypnotisé. Le pirate blanc remarque cette fixation, propose une chaise à côté de lui.",
  },
  {
    year: "Deux ans d'apprentissage",
    icon: "💻",
    title: "L'IBM 80-86",
    text: "Deux ans de visites régulières, deux ans d'apprentissage silencieux auprès d'un vrai professionnel. Et un jour, le mentor fait un geste rare : il offre son PC IBM 80-86. Du CPC 464 et ses K7 au vrai PC sous MS-DOS — un saut technologique vertigineux pour un adolescent qui n'avait eu pour seul guide que sa curiosité.",
  },
  {
    year: "L'ère des machines",
    icon: "🎮",
    title: "Atari, Commodore & Co.",
    text: "De machine en machine, la passion ne faiblit pas. Atari, Commodore, les grandes heures de la micro-informatique personnelle — Manix les a vécues de l'intérieur, les mains dans le code, à une époque où chaque ligne écrite était une conquête.",
  },
  {
    year: "La formation",
    icon: "🎨",
    title: "Cours d'Infographie",
    text: "La curiosité ne s'arrête jamais. Des cours d'infographie viendront compléter le parcours autodidacte : HTML, CSS, Flash MX... les outils du web naissant. Manix apprend à marier l'art et le code, l'esthétique et la logique.",
  },
  {
    year: "Aujourd'hui",
    icon: "🚗",
    title: "KITT Franco-Belge",
    text: "Des décennies après le premier \"10 PRINT\" tapé sur un CPC 464, Manix donne vie à KITT — l'intelligence artificielle de Knight Rider — sur Jetson Nano, avec llama.cpp, Piper TTS, Whisper STT et des tunnels Cloudflare. Une boucle magnifique : l'enfant qui tapait du code de magazine est devenu l'architecte d'une IA qui parle, écoute et répond. La technologie a changé. La passion, jamais.",
  },
];

export default function Manix() {
  const heroRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const visibleStory = useIntersection(storyRef);
  const [photoLoaded, setPhotoLoaded] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: "#050000" }}>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: "linear-gradient(180deg, #030000 0%, #080000 100%)" }}
      >
        {/* Grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255,34,34,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,34,34,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at 50% 40%, rgba(255,34,34,0.07) 0%, transparent 70%)"
        }} />

        <div className="relative container py-20 md:py-32 text-center px-4 max-w-4xl mx-auto">

          {/* Label discret */}
          <div style={{
            fontFamily: "Space Mono, monospace", fontSize: "0.55rem",
            color: "rgba(255,34,34,0.5)", letterSpacing: "0.35em", marginBottom: "2rem"
          }}>
            DOSSIER CONFIDENTIEL — KNIGHT INDUSTRIES
          </div>

          {/* Photo */}
          <div className="flex justify-center mb-8">
            <div style={{
              position: "relative", width: 200, height: 200,
              border: "2px solid rgba(255,34,34,0.4)",
              boxShadow: "0 0 30px rgba(255,34,34,0.2), 0 0 60px rgba(255,34,34,0.1)",
              borderRadius: 4, overflow: "hidden", background: "#0a0000"
            }}>
              <img
                src="/manix.png"
                alt="Le Maître Manix"
                onLoad={() => setPhotoLoaded(true)}
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  filter: "sepia(20%) contrast(1.1)",
                  opacity: photoLoaded ? 1 : 0,
                  transition: "opacity 0.8s ease"
                }}
              />
              {/* Scanner overlay */}
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: "linear-gradient(transparent 40%, rgba(255,34,34,0.06) 50%, transparent 60%)",
                animation: "scan-photo 3s linear infinite"
              }} />
            </div>
          </div>

          <style>{`
            @keyframes scan-photo {
              0%   { background-position: 0 -200px; }
              100% { background-position: 0 400px; }
            }
          `}</style>

          <div style={{
            fontFamily: "Space Mono, monospace", fontSize: "0.6rem",
            color: "rgba(255,34,34,0.4)", letterSpacing: "0.25em", marginBottom: "0.5rem"
          }}>
            IDENTITÉ
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white mb-3"
            style={{ fontFamily: "Orbitron, monospace", letterSpacing: "0.1em" }}>
            MANIX
          </h1>

          <h2 className="text-sm md:text-base font-bold mb-6"
            style={{ fontFamily: "Orbitron, monospace", color: "#ff2222", letterSpacing: "0.3em" }}>
            LE MAÎTRE — ARCHITECTE DE KITT
          </h2>

          <div className="max-w-sm mx-auto mb-8">
            <KittScanner height={6} color={{ r: 255, g: 34, b: 34 }} />
          </div>

          <p className="max-w-2xl mx-auto text-base mb-10"
            style={{ fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.7)", lineHeight: 2 }}>
            Autodidacte. Passionné. Pionnier discret. Depuis un CPC 464 et une page de code dans un magazine belge
            jusqu'à une intelligence artificielle qui parle et écoute — l'histoire d'une vie guidée par la curiosité.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center gap-3 px-8 py-4 transition-all hover:border-red-500"
              style={{
                border: "1px solid rgba(255,34,34,0.3)",
                fontFamily: "Orbitron, monospace", fontSize: "0.65rem",
                letterSpacing: "0.15em", color: "rgba(192,192,192,0.7)"
              }}
            >
              ← RETOUR ACCUEIL
            </Link>
            <button
              onClick={() => document.getElementById("histoire")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-3 px-8 py-4 transition-all"
              style={{
                background: "rgba(255,34,34,0.1)", border: "1px solid #ff2222",
                fontFamily: "Orbitron, monospace", fontSize: "0.65rem",
                letterSpacing: "0.15em", color: "#ff2222", cursor: "pointer"
              }}
            >
              LIRE L'HISTOIRE →
            </button>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section id="histoire" ref={storyRef} style={{ background: "#060000", padding: "80px 0" }}>
        <div className="container max-w-3xl mx-auto px-4">

          <div className="text-center mb-16">
            <div style={{
              fontFamily: "Space Mono, monospace", fontSize: "0.55rem",
              color: "rgba(255,34,34,0.5)", letterSpacing: "0.3em", marginBottom: "1rem"
            }}>
              CHRONOLOGIE — DOSSIER #001
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white"
              style={{ fontFamily: "Orbitron, monospace" }}>
              DE 8 ANS AU CPC 464<br />
              <span style={{ color: "#ff2222" }}>À L'IA KITT</span>
            </h2>
          </div>

          <div style={{ position: "relative" }}>
            {/* Ligne verticale */}
            <div style={{
              position: "absolute", left: "50%", top: 0, bottom: 0,
              width: 1, background: "rgba(255,34,34,0.2)", transform: "translateX(-50%)"
            }} className="hidden md:block" />

            {TIMELINE.map((item, i) => (
              <div
                key={i}
                className={`flex flex-col md:flex-row gap-6 mb-16 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}
                style={{
                  opacity: visibleStory ? 1 : 0,
                  transform: visibleStory ? "translateY(0)" : "translateY(30px)",
                  transition: `opacity 0.6s ease ${i * 0.15}s, transform 0.6s ease ${i * 0.15}s`
                }}
              >
                {/* Contenu */}
                <div className="flex-1" style={{
                  border: "1px solid rgba(255,34,34,0.2)",
                  background: "rgba(255,34,34,0.03)",
                  padding: "24px 28px",
                }}>
                  <div style={{
                    fontFamily: "Space Mono, monospace", fontSize: "0.55rem",
                    color: "rgba(255,34,34,0.5)", letterSpacing: "0.2em", marginBottom: "4px"
                  }}>
                    {item.year}
                  </div>
                  <div className="text-xl font-bold text-white mb-3"
                    style={{ fontFamily: "Orbitron, monospace", fontSize: "0.9rem", letterSpacing: "0.1em" }}>
                    {item.icon} {item.title}
                  </div>
                  <p style={{
                    fontFamily: "Rajdhani, sans-serif", color: "rgba(192,192,192,0.7)",
                    lineHeight: 1.9, fontSize: "0.95rem"
                  }}>
                    {item.text}
                  </p>
                </div>

                {/* Point central */}
                <div className="hidden md:flex items-center justify-center" style={{ width: 40, flexShrink: 0 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: "#ff2222",
                    boxShadow: "0 0 10px rgba(255,34,34,0.6)"
                  }} />
                </div>

                {/* Spacer côté opposé */}
                <div className="hidden md:block flex-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer discret */}
      <section style={{ background: "#030000", padding: "60px 0", textAlign: "center" }}>
        <div style={{
          fontFamily: "Space Mono, monospace", fontSize: "0.55rem",
          color: "rgba(255,34,34,0.3)", letterSpacing: "0.3em", marginBottom: "2rem"
        }}>
          FIN DU DOSSIER — KNIGHT INDUSTRIES TWO THOUSAND
        </div>
        <div className="max-w-xs mx-auto mb-8">
          <KittScanner height={4} color={{ r: 255, g: 34, b: 34 }} />
        </div>
        <Link
          href="/"
          style={{
            fontFamily: "Orbitron, monospace", fontSize: "0.65rem",
            letterSpacing: "0.15em", color: "rgba(255,34,34,0.5)",
            textDecoration: "none", border: "1px solid rgba(255,34,34,0.2)",
            padding: "12px 28px", display: "inline-block"
          }}
        >
          ← RETOUR ACCUEIL
        </Link>
      </section>

    </div>
  );
}
