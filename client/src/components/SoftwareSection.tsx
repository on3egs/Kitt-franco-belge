import { ArrowUpRight, Headphones, MonitorCheck, Download, BookOpen } from "lucide-react";

export default function SoftwareSection() {
  return <section id="logiciels" className="software-section container">
    <div className="software-intro"><div><p className="section-label">CONÇU AVEC PASSION · BY MANIX</p><h2>Votre prochain<br/><span>tableau de bord.</span></h2></div><p>La signature Knight Rider, des outils concrets. Écoutez votre musique, explorez votre bibliothèque et gardez un œil sur vos Jetson.</p></div>
    <div className="software-grid">
      <a href="/kyronext-studio/" className="software-card studio-card"><div className="software-card-top"><Headphones size={28}/><span>STUDIO 4.5.0 · WINDOWS</span><ArrowUpRight size={22}/></div><div className="software-preview"><img src="/kyronext-studio/preview-library-4.5.0.png" alt="Bibliothèque musicale de Kyronext Studio" loading="lazy" width="1280" height="800"/></div><div className="software-card-copy"><h3>Kyronext Studio</h3><p>Votre cockpit Hi-Fi. Collections, favoris, lecture continue et téléchargements MP3 dans une interface inspirée de KITT.</p><span className="software-cta">Découvrir et télécharger <Download size={16}/></span></div></a>
      <a href="/sentinel/" className="software-card sentinel-card"><div className="software-card-top"><MonitorCheck size={28}/><span>SENTINEL 1.1.0 · WINDOWS</span><ArrowUpRight size={22}/></div><div className="software-preview"><img src="/sentinel/diagnostic-1.1.0.png" alt="Diagnostic de KITT Sentinel en mode démonstration" loading="lazy" width="1280" height="800"/></div><div className="software-card-copy"><h3>KITT Sentinel</h3><p>Le poste de surveillance de vos Jetson. Présence Tailscale, accès SSH, diagnostics et annonces vocales françaises.</p><span className="software-cta">Découvrir et télécharger <Download size={16}/></span></div></a>
    </div>
    <div className="software-bottom"><span><BookOpen size={17}/> Installation guidée · Réglages personnels · Thème Knight Rider</span><a href="/documents">Explorer la documentation <ArrowUpRight size={16}/></a></div>
  </section>;
}
