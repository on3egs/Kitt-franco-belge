import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowUpRight, Search, Monitor } from "lucide-react";
import LangSelector from "./LangSelector";
import { useLanguage } from "@/contexts/LanguageContext";

export const SITE_LINKS: { href: string; label: string; detail: string; keywords?: string }[] = [
  { href: "https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/", label: "KITT · Monde en blocs", detail: "Construction voxel, KITT, Halloween et salles de 16 joueurs", keywords: "minecraft minercraft bac sable moutons monstres lilou alexia jeux" },
  { href: "/outils#outils-quotidiens", label: "Outils du quotidien", detail: "Tableur CSV, renommage de fichiers et mots de passe · By Manix" },
  { href: "/studio-pdf", label: "Studio PDF", detail: "Organiser, tourner, retirer et fusionner les pages avec aperçu" },
  { href: "/studio-voix", label: "Manix Voice Studio", detail: "Enregistrer sa voix, créer une lecture ou transformer une source audio" },
  { href: "/studio-image", label: "Studio Image", detail: "Retouche photo, avant/après, détourage et montage" },
  { href: "/outils", label: "Laboratoire d’outils", detail: "Outils locaux gratuits pour vidéo, audio, PDF et fichiers" },
  { href: "/nouveautes/", label: "Le nouveau cockpit", detail: "Découvrir les outils, les animations et les réglages sonores" },
  { href: "/netshield/", label: "Manix NetShield", detail: "Filtrage DNS, installation Windows et guide AGX" },
  { href: "/kyronext-os/", label: "Kyronext OS", detail: "Explorer le cockpit et ses applications" },
  { href: "/shadow-of-karr/", label: "Shadow of KARR", detail: "Retrouver le jeu Knight Rider" },
  { href: "/#histoire", label: "Le projet", detail: "L’histoire de KITT Franco-Belge" },
  { href: "/#services", label: "Technologies", detail: "IA locale, électronique et répliques" },
  { href: "/videos", label: "Vidéos", detail: "La galerie de la communauté" },
  { href: "/communaute-pontiac", label: "Pontiac Owners World", detail: "Carte mondiale et galerie des Pontiac Knight Rider" },
  { href: "/salon-kitt", label: "MSN Chat KITT", detail: "Le salon communautaire Knight Rider" },
  { href: "/jeux/", label: "Arcade KITT", detail: "Jouer aux créations Knight Rider du projet" },
  { href: "/musique", label: "Musique", detail: "Écouter les créations partagées" },
  { href: "/documents", label: "Documents", detail: "Documentation et ressources PDF" },
  { href: "/kyronext-studio/", label: "Kyronext Studio", detail: "Lecteur Hi-Fi et téléchargements · Windows" },
  { href: "/sentinel/", label: "KITT Sentinel", detail: "Supervision de vos Jetson · Windows" },
  { href: "/field-vault/", label: "KYRONEXT Field Vault", detail: "Ressources de terrain hors ligne · bêta" },
  { href: "/guide-logiciels/", label: "Catalogue et aide", detail: "Mode d’emploi interactif et téléchargements" },
  { href: "https://kyronext.eu/dub-studio/", label: "KYRONEXT DUB Studio", detail: "Traduction vidéo et voix par interlocuteur · bêta" },
  { href: "https://kyronext.eu/video-studio/", label: "KYRONEXT Video Studio", detail: "Génération vidéo à partir de photos et de texte" },
  { href: "/karr", label: "KARR", detail: "Découvrir l’univers KARR" },
  { href: "/soumettre", label: "Participer", detail: "Partager une vidéo avec la communauté" },
  { href: "/soutenir/", label: "Soutenir", detail: "Aider le projet à avancer" },
  { href: "/#contact", label: "Contact", detail: "Échanger avec KITT Franco-Belge" },
];

export default function SiteNavigation() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <header className="site-header" ref={root}>
    <a className="site-brand" href="/" aria-label="KITT Franco-Belge — accueil"><span className="brand-led" aria-hidden="true" /><span>KITT <small>FRANCO-BELGE</small></span></a>
    <nav className="site-desktop-links" aria-label="Navigation principale">
      <a href="#histoire">{t("nav.histoire")}</a><a href="/videos">{t("nav.videos")}</a><a href="/communaute-pontiac">Pontiac Owners</a><a href="/salon-kitt">MSN Chat</a><a href="/jeux/">Jeux</a><a href="/musique">{t("nav.musique")}</a><a href="/guide-logiciels/">Catalogue</a><a href="#contact">{t("nav.contact")}</a>
    </nav>
    <div className="site-header-actions">
      <button className="site-icon-button nav-search" onClick={() => window.dispatchEvent(new Event("kitt-open-search"))} aria-label="Rechercher dans le site"><Search size={18}/></button>
      <LangSelector />
      <a className="site-os-access" href="/kyronext-os/" aria-label="Ouvrir Kyronext OS"><Monitor size={16}/><span>KYRONEXT OS</span></a>
      <a className="site-access" href="/kyronex/">{t("nav.access")} <ArrowUpRight size={15}/></a>
      <button ref={toggle} className="site-icon-button" aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>{open ? <X size={20}/> : <Menu size={20}/>}</button>
    </div>
    {open && <nav id="site-menu" className="site-mega-menu" aria-label="Toutes les rubriques">
      <div className="site-menu-heading">EXPLOREZ L’UNIVERS KITT <span>KYRONEXT SYSTEM BY MANIX</span></div>
      <div className="site-menu-grid">{SITE_LINKS.map(link => <a href={link.href} key={link.href} onClick={() => setOpen(false)}><span>{link.label} <ArrowUpRight size={15}/></span><small>{link.detail}</small></a>)}</div>
      <a className="site-partner" href="https://kyronext.eu" target="_blank" rel="noopener noreferrer">Kyronext.eu <ArrowUpRight size={15}/> <small>IA, robotique et électronique</small></a>
    </nav>}
  </header>;
}
