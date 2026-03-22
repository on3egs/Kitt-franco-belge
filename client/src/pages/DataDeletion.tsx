export default function DataDeletion() {
  return (
    <div className="min-h-screen py-20 px-6" style={{ background: "#0a0000", fontFamily: "Rajdhani, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", letterSpacing: "0.2em", marginBottom: "8px" }}>
          // KITT FRANCO-BELGE — SUPPRESSION DES DONNÉES
        </div>
        <h1 style={{ fontFamily: "Orbitron, monospace", color: "white", fontSize: "2rem", marginBottom: "2rem" }}>
          Suppression des Données
        </h1>

        <div style={{ color: "rgba(192,192,192,0.8)", lineHeight: 1.9, fontSize: "1rem" }}>
          <p style={{ marginBottom: "1.5rem" }}>
            Conformément au RGPD et aux politiques de Meta/Facebook, vous pouvez demander la suppression
            de vos données personnelles collectées via ce site.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>
            Données concernées
          </h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site ne stocke aucune donnée Facebook sur ses serveurs. Le widget Facebook intégré
            est géré directement par Meta. Pour supprimer vos données Facebook, rendez-vous dans
            les paramètres de votre compte Facebook.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>
            Données du formulaire de contact
          </h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Si vous avez utilisé le formulaire de contact, vos données (nom, email, message) peuvent
            être supprimées sur simple demande.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>
            Comment faire une demande de suppression
          </h2>
          <p style={{ marginBottom: "0.5rem" }}>
            Envoyez votre demande via le formulaire de contact sur le site principal en indiquant :
          </p>
          <ul style={{ marginLeft: "1.5rem", marginBottom: "1.5rem" }}>
            <li>Votre nom et adresse email</li>
            <li>La nature des données à supprimer</li>
            <li>Objet : "Demande de suppression de données"</li>
          </ul>
          <p style={{ marginBottom: "1.5rem" }}>
            Nous traiterons votre demande dans un délai de 30 jours.
          </p>
        </div>

        <div style={{ marginTop: "3rem", borderTop: "1px solid rgba(255,34,34,0.2)", paddingTop: "1.5rem", display: "flex", gap: "2rem" }}>
          <a href="/" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "#ff2222", letterSpacing: "0.15em" }}>
            ← RETOUR AU SITE
          </a>
          <a href="/privacy" style={{ fontFamily: "Orbitron, monospace", fontSize: "0.7rem", color: "rgba(192,192,192,0.5)", letterSpacing: "0.15em" }}>
            POLITIQUE DE CONFIDENTIALITÉ
          </a>
        </div>
      </div>
    </div>
  );
}
