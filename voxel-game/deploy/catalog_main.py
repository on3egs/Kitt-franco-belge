"""Intégration ciblée dans le catalogue React du site principal, sur un worktree propre."""
from pathlib import Path

root=Path('/home/kitt/kitt-block-catalog')
arcade=root/'client/src/pages/Arcade.tsx'
s=arcade.read_text(encoding='utf-8-sig')
s=s.replace('  group: "agx" | "site";', '  group: "agx" | "site";\n  keywords?: string;')
entry='''  { id: "kitt-block-mode", name: "KITT · Monde en blocs", mode: "Construction · 3D · Multijoueur", description: "Construis ton refuge FLAG, explore avec KITT et rejoins une salle de 16 pilotes. Halloween : moutons et créatures étranges au rendez-vous.", src: "https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/", controls: "ZQSD / WASD · souris : vue FPS · E : utiliser · F : appeler KITT · Espace : saut · paramètres dans le jeu", badge: "NOUVEAU · HALLOWEEN · COOP", icon: "🧱", group: "agx", keywords: "minecraft minercraft voxel bac sable blocs moutons monstres halloween lilou alexia" },
'''
if 'id: "kitt-block-mode"' not in s:s=s.replace('const AGX_GAMES: Game[] = [\n','const AGX_GAMES: Game[] = [\n'+entry,1)
s=s.replace('clean(`${game.name} ${game.description} ${game.mode}`).includes(clean(query.trim()))','clean(query.trim()).split(/\\s+/).every(word => clean(`${game.name} ${game.description} ${game.mode} ${game.keywords || ""}`).includes(word))')
s=s.replace('"Combat", "Survie"','"Combat", "Survie", "Construction", "Multijoueur"')
s=s.replace('allow="fullscreen; gamepad"','allow="fullscreen; gamepad; autoplay"')
marker='  return <main'
listener='''  useEffect(() => {
    const closeBlockMode = (event: MessageEvent) => {
      if (event.origin === "https://kitt.kitt-franco-belge.be" && event.source === frameRef.current?.contentWindow && event.data?.type === "kitt:blockmode:stop") {
        setLaunched(false); setFrameLoaded(false); document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("message", closeBlockMode);
    return () => window.removeEventListener("message", closeBlockMode);
  }, []);
'''
if 'const closeBlockMode' not in s:
    assert marker in s,'Point de rendu Arcade introuvable'
    s=s.replace(marker,listener+marker,1)
arcade.write_text(s,encoding='utf-8')
navigation=root/'client/src/components/SiteNavigation.tsx'
s=navigation.read_text(encoding='utf-8-sig')
s=s.replace('export const SITE_LINKS = [','export const SITE_LINKS: { href: string; label: string; detail: string; keywords?: string }[] = [')
if 'label: "KITT · Monde en blocs"' not in s:s=s.replace('export const SITE_LINKS:', 'export const SITE_LINKS:',1).replace('[] = [\n','[] = [\n  { href: "https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/", label: "KITT · Monde en blocs", detail: "Construction voxel, KITT, Halloween et salles de 16 joueurs", keywords: "minecraft minercraft bac sable moutons monstres lilou alexia jeux" },\n',1)
navigation.write_text(s,encoding='utf-8')
tools=root/'client/src/components/SiteTools.tsx'
s=tools.read_text(encoding='utf-8-sig')
s=s.replace('const results = SITE_LINKS.filter(l => normalize(l.label + " " + l.detail).includes(normalize(query)));','''const terms = normalize(query).trim().split(/\\s+/).filter(Boolean);
  const results = SITE_LINKS.filter(l => terms.every(term => normalize(l.label + " " + l.detail + " " + (l.keywords || "")).includes(term))).sort((a,b) => {
    const score = (l: typeof a) => terms.reduce((n,word) => n + (normalize(l.label).includes(word) ? 3 : 0), 0);
    return score(b) - score(a);
  });''')
s=s.replace('placeholder="Musique, logiciel, documents…"','placeholder="Jeu, Minecraft, musique, logiciel, documents…"')
s=s.replace('<div className="site-search-results">','<p role="status" aria-live="polite">{results.length} résultat{results.length > 1 ? "s" : ""}</p><div className="site-search-results">')
tools.write_text(s,encoding='utf-8')
cockpit=root/'client/public/site-assets/cockpit.js'
s=cockpit.read_text(encoding='utf-8-sig')
if "'KITT · Monde en blocs'" not in s:s=s.replace('  const CATALOG = [','''  const CATALOG = [
    ['/jeux/', 'Arcade KITT · tous les jeux', 'Applications', 'Jeux de construction, course, arcade et coopération.', 'time'],
    ['https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/', 'KITT · Monde en blocs', 'Applications', 'Minecraft, voxel, Halloween, moutons et salles de 16 joueurs.', 'time'],''',1)
s=s.replace('normalize(x.title+\' \'+x.hint+\' \'+x.group).includes(q)',"q.split(/\\s+/).filter(Boolean).every(word=>normalize(x.title+' '+x.hint+' '+x.group).includes(word))")
cockpit.write_text(s,encoding='utf-8')
print('Catalogue Arcade et deux recherches du site mis à jour.')
