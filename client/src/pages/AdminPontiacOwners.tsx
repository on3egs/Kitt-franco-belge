import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, LockKeyhole, X } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";

type Submission = { id: string; name: string; car: string; year: string; location: string; story: string; photos: string[]; submittedAt: number; previewUrls?: string[] };

export default function AdminPontiacOwners() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Submission[]>([]);
  const [base, setBase] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Entre le jeton administrateur pour afficher les dossiers privés.");
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  async function load(nextOffset = 0) {
    if (!token) return;
    setLoading(true); setMessage("");
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    try {
      const apiBase = await getApiBase();
      if (!apiBase) throw new Error("Relais KITT hors ligne.");
      setBase(apiBase);
      const response = await fetch(`${apiBase}/api/pontiac-owners/pending?offset=${nextOffset}`, { headers: { "X-Admin-Token": token }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
      const rows = Array.isArray(data.pending) ? data.pending as Submission[] : [];
      const prepared = await Promise.all(rows.map(async row => {
        const previewUrls: string[] = [];
        for (let index = 0; index < row.photos.length; index++) {
          const image = await fetch(`${apiBase}/api/pontiac-owners/pending-photo/${row.id}/${index}`, { headers: { "X-Admin-Token": token }, cache: "no-store" });
          if (!image.ok) continue;
          const objectUrl = URL.createObjectURL(await image.blob());
          urls.current.push(objectUrl); previewUrls.push(objectUrl);
        }
        return { ...row, previewUrls };
      }));
      setItems(prepared); setOffset(Number(data.offset) || 0); setTotal(Number(data.total) || 0);
      setMessage(rows.length ? "Dossiers privés — visibles uniquement avec ton jeton administrateur." : "Aucun dossier en attente sur cette page.");
    } catch (error) {
      setItems([]); setMessage(error instanceof Error ? error.message : "Connexion impossible.");
    } finally { setLoading(false); }
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (!base || !token) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`${base}/api/pontiac-owners/decide`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token }, body: JSON.stringify({ id, action }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Décision refusée.");
      setMessage(action === "approve" ? "Profil approuvé et visible sur le globe." : "Profil refusé et photos effacées.");
      await load(offset);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action impossible."); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[#09090d] px-4 py-12 text-[#f6eeee] md:px-10">
    <div className="mx-auto max-w-5xl">
      <a href="/communaute-pontiac" className="text-sm text-rose-300 hover:text-white">← Retour au globe Pontiac</a>
      <p className="mt-8 font-mono text-xs tracking-[.24em] text-rose-400">KITT FRANCO-BELGE · MODÉRATION PRIVÉE</p>
      <h1 className="mt-3 font-[Orbitron] text-3xl font-bold md:text-5xl">Profils Pontiac</h1>
      <p className="mt-3 max-w-2xl text-white/65">Les images en attente ne sont pas publiques. Approuve un dossier pour le publier, ou refuse-le pour effacer ses photos.</p>
      <form className="mt-8 flex flex-col gap-3 rounded border border-rose-900/60 bg-[#100d12] p-4 sm:flex-row" onSubmit={e=>{e.preventDefault();void load(0)}}>
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><LockKeyhole className="shrink-0 text-amber-300" size={18}/><input type="password" autoComplete="current-password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Jeton administrateur" className="min-w-0 flex-1 border border-white/10 bg-black/40 px-3 py-3 text-white outline-none focus:border-rose-400"/></label>
        <button disabled={loading || !token} className="border border-rose-500/70 bg-rose-950 px-5 py-3 font-mono text-xs tracking-wider hover:bg-rose-900 disabled:opacity-40">{loading ? "CHARGEMENT…" : "CHARGER LES DOSSIERS"}</button>
      </form>
      <p className="mt-3 min-h-6 text-sm text-amber-200" role="status">{message}</p>
      <div className="mt-4 flex items-center justify-between border-b border-rose-900/50 pb-3 font-mono text-[10px] tracking-widest text-white/55"><span>EN ATTENTE · {total}</span><div className="flex gap-2"><button type="button" disabled={loading || offset <= 0} onClick={()=>void load(Math.max(0,offset-5))} aria-label="Page précédente" className="rounded border border-white/15 p-2 disabled:opacity-30"><ChevronLeft size={16}/></button><button type="button" disabled={loading || offset+5>=total} onClick={()=>void load(offset+5)} aria-label="Page suivante" className="rounded border border-white/15 p-2 disabled:opacity-30"><ChevronRight size={16}/></button></div></div>
      <div className="mt-5 grid gap-5">
        {items.map(item=><article key={item.id} className="grid gap-4 border border-white/10 bg-[#100d12] p-4 md:grid-cols-[1fr_1.15fr] md:p-6">
          <div className="grid grid-cols-2 gap-2 self-start">{item.previewUrls?.map((src,index)=><img key={src} src={src} alt={`Photo ${index+1} de ${item.car}`} className="aspect-[4/3] w-full border border-white/10 object-cover"/>)}{!item.previewUrls?.length&&<div className="col-span-2 p-8 text-sm text-white/50">Aucune photo jointe.</div>}</div>
          <div><p className="font-mono text-[10px] tracking-widest text-rose-300">{item.location || "SANS LOCALISATION PUBLIQUE"}</p><h2 className="mt-2 text-2xl font-bold">{item.name}</h2><p className="mt-1 text-amber-200">{item.car} · {item.year}</p><p className="mt-4 whitespace-pre-wrap text-white/75">{item.story}</p><p className="mt-3 font-mono text-[10px] text-white/40">Reçu le {new Date(item.submittedAt*1000).toLocaleString("fr-BE")}</p><div className="mt-5 flex flex-wrap gap-3"><button disabled={loading} onClick={()=>void decide(item.id,"approve")} className="flex items-center gap-2 border border-emerald-500/50 bg-emerald-950/60 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-900 disabled:opacity-40"><Check size={16}/> Approuver</button><button disabled={loading} onClick={()=>void decide(item.id,"reject")} className="flex items-center gap-2 border border-rose-500/50 bg-rose-950/60 px-4 py-2 text-sm text-rose-100 hover:bg-rose-900 disabled:opacity-40"><X size={16}/> Refuser et effacer les photos</button></div></div>
        </article>)}
      </div>
    </div>
  </main>;
}
