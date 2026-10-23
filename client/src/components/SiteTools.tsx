import { useEffect, useRef, useState } from "react";
import { ArrowUp, Search, Volume2, VolumeX, X, ArrowUpRight } from "lucide-react";
import { SITE_LINKS } from "./SiteNavigation";
function readSound() { try { return localStorage.getItem("kitt-sound") !== "off"; } catch { return true; } }
export default function SiteTools() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sound, setSound] = useState(readSound);
  const [scrolled, setScrolled] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); show(); } };
    const scroll = () => setScrolled(window.scrollY > 500);
    window.addEventListener("kitt-open-search", show); window.addEventListener("keydown", key); window.addEventListener("scroll", scroll, { passive: true }); scroll();
    return () => { window.removeEventListener("kitt-open-search", show); window.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll); };
  }, []);
  useEffect(() => {
    if (open) { dialog.current?.showModal(); input.current?.focus(); }
    else if (dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [open]);
  const toggleSound = () => {
    const next = !sound; setSound(next);
    try { localStorage.setItem("kitt-sound", next ? "on" : "off"); } catch { /* session only */ }
    window.dispatchEvent(new CustomEvent("kitt-sound-change", { detail: next }));
  };
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const results = SITE_LINKS.filter(l => normalize(l.label + " " + l.detail).includes(normalize(query)));
  return <>
    <a className="skip-content" href="#main-content">Aller au contenu</a>
    <div className="site-tools" role="group" aria-label="Outils du site">
      <button ref={trigger} onClick={() => setOpen(true)} aria-label="Rechercher dans le site" title="Recherche · Ctrl + K"><Search size={18}/></button>
      <button onClick={toggleSound} aria-label={sound ? "Couper les sons du site" : "Activer les sons du site"} aria-pressed={sound} title={sound ? "Sons activés" : "Sons coupés"}>{sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
      {scrolled && <button onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })} aria-label="Retour en haut"><ArrowUp size={18}/></button>}
    </div>
    <dialog ref={dialog} className="site-search-dialog" aria-labelledby="search-title" onCancel={e => { e.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)} onKeyDownCapture={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } }} onClick={e => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setOpen(false); } }}>
      <div className="site-search-title"><h2 id="search-title">Explorer le site</h2><button className="site-icon-button" aria-label="Fermer la recherche" onClick={() => setOpen(false)}><X size={20}/></button></div>
      <label className="site-search-input"><Search size={20}/><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Musique, logiciel, documents…" aria-label="Votre recherche" type="search"/></label>
      <div className="site-search-results">{results.length ? results.map(l => <a href={l.href} key={l.href} onClick={() => setOpen(false)}><span>{l.label}<small>{l.detail}</small></span><ArrowUpRight size={18}/></a>) : <p role="status">Aucune rubrique trouvée. Essayez « Studio » ou « vidéos ».</p>}</div>
      <div className="site-search-tip">Navigation dans les rubriques · Échap pour fermer</div>
    </dialog>
  </>;
}

