export default function Privacy() {
  return (
    <div className="min-h-screen py-20 px-6" style={{ background: "#0a0000", fontFamily: "Rajdhani, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", letterSpacing: "0.2em", marginBottom: "8px" }}>
          // KITT FRANCO-BELGE — POLITIQUE DE CONFIDENTIALITÉ
        </div>
        <h1 style={{ fontFamily: "Orbitron, monospace", color: "white", fontSize: "2rem", marginBottom: "2rem" }}>
          Politique de Confidentialité
        </h1>

        <div style={{ color: "rgba(192,192,192,0.8)", lineHeight: 1.9, fontSize: "1rem" }}>
          <p style={{ marginBottom: "1.5rem" }}>
            Dernière mise à jour : mars 2026
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>1. Responsable du traitement</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Emmanuel Gelinne (Manix) — Projet KITT Franco-Belge. Contact : via le formulaire sur le site.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>2. Données collectées</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site collecte uniquement un compteur de visites anonyme (sans identification personnelle).
            Le formulaire de contact collecte le nom, l'adresse e-mail et le message uniquement pour répondre à votre demande.
            Aucune donnée n'est revendue à des tiers.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>3. Cookies</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site utilise uniquement des données de session locales (sessionStorage) pour mémoriser votre visite
            et éviter de compter plusieurs fois le même visiteur. Aucun cookie de tracking tiers n'est utilisé.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>4. Intégrations tierces</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site intègre des contenus YouTube et Facebook (widget groupe). Ces services peuvent déposer leurs propres cookies
            selon leurs politiques de confidentialité respectives. Nous vous invitons à consulter les politiques de confidentialité
            de Google/YouTube et de Meta/Facebook.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>5. Vos droits</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données.
            Pour exercer ces droits, contactez-nous via le formulaire de contact du site.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>6. Hébergement</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site est hébergé sur GitHub Pages (Microsoft). Pour plus d'informations : github.com/privacy
          </p>
        </div>

        <div style={{ marginTop: "3rem", borderTop: "1px solid rgba(255,34,34,0.2)", paddingTop: "1.5rem" }}>
          <a
            href="/"
            style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "#ff2222", letterSpacing: "0.15em" }}
          >
            ← RETOUR AU SITE
          </a>
        </div>
      </div>
    </div>
  );
}
