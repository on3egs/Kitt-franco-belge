export default function MentionsLegales() {
  return (
    <div className="min-h-screen py-20 px-6" style={{ background: "#0a0000", fontFamily: "Rajdhani, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#ff2222", letterSpacing: "0.2em", marginBottom: "8px" }}>
          // KITT FRANCO-BELGE — MENTIONS LÉGALES
        </div>
        <h1 style={{ fontFamily: "Orbitron, monospace", color: "white", fontSize: "2rem", marginBottom: "2rem" }}>
          Mentions Légales
        </h1>

        <div style={{ color: "rgba(192,192,192,0.8)", lineHeight: 1.9, fontSize: "1rem" }}>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>1. Éditeur du site</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            <strong style={{ color: "white" }}>Emmanuel Gelinne</strong>, alias Manix<br />
            Belgique<br />
            Contact : via le formulaire de contact sur le site
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>2. Hébergement</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site est hébergé par <strong style={{ color: "white" }}>GitHub Pages</strong>, un service de GitHub, Inc. (filiale de Microsoft Corporation).<br />
            88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.<br />
            Politique de confidentialité GitHub : <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer" style={{ color: "#ff2222" }}>github.com/privacy</a>
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>3. Propriété intellectuelle — Droits tiers</h2>
          <p style={{ marginBottom: "1rem" }}>
            <strong style={{ color: "white" }}>Knight Rider™</strong>, <strong style={{ color: "white" }}>K.I.T.T.™</strong>, <strong style={{ color: "white" }}>K2000™</strong>, <strong style={{ color: "white" }}>KARR™</strong> et tous les personnages, noms, logos et éléments distinctifs associés à la série télévisée <em>Knight Rider</em> sont des marques déposées et des œuvres protégées appartenant à <strong style={{ color: "white" }}>NBCUniversal Media, LLC</strong>.
          </p>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site est un <strong style={{ color: "white" }}>projet de fan indépendant, non officiel et strictement non commercial</strong>. Il n'est en aucun cas affilié à NBCUniversal, Glen A. Larson Productions ni à aucune entité officielle liée à la franchise Knight Rider. Aucun produit ou service n'est vendu sous ces marques.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>4. Contenu du site</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Les textes, créations graphiques, développements logiciels, photographies du véhicule et contenus propres au site sont la propriété d'Emmanuel Gelinne (Manix), sauf mention contraire. Toute reproduction partielle ou totale sans autorisation écrite est interdite.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>5. Intégrations tierces</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Ce site intègre des contenus diffusés sur des plateformes tierces (lecteurs vidéo embarqués, widget de groupe communautaire). Ces intégrations sont soumises aux conditions générales et politiques de confidentialité de leurs éditeurs respectifs. L'éditeur du présent site ne saurait être tenu responsable des traitements de données effectués par ces tiers.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>6. Limitation de responsabilité</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Les informations publiées sur ce site sont fournies à titre indicatif. L'éditeur ne garantit pas l'exactitude, l'exhaustivité ni la mise à jour permanente de ces informations. En aucun cas, l'éditeur ne saurait être tenu responsable d'un dommage direct ou indirect résultant de l'utilisation de ce site.
          </p>

          <h2 style={{ color: "#ff2222", fontFamily: "Orbitron, monospace", fontSize: "1rem", marginBottom: "0.75rem" }}>7. Droit applicable</h2>
          <p style={{ marginBottom: "1.5rem" }}>
            Le présent site est soumis au droit belge. Tout litige relatif à son utilisation relève de la compétence des tribunaux belges.
          </p>

        </div>

        <div style={{ marginTop: "3rem", borderTop: "1px solid rgba(255,34,34,0.2)", paddingTop: "1.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
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
