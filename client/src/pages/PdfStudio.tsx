import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowUp, Check, FilePlus2, FileText, GripVertical, LoaderCircle, RotateCw, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import type { PDFDocument } from "pdf-lib";
import "./PdfStudio.css";

type Source = { id: number; name: string; document: PDFDocument; bytes: number };
type Page = { id: number; source: number; index: number; rotation: number; thumbnail: string; selected: boolean };
const MAX_PAGES = 80;
const MAX_BYTES = 100 * 1024 * 1024;
const sizeLabel = (size: number) => `${(size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

export default function PdfStudio() {
  const [sources, setSources] = useState<Source[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [history, setHistory] = useState<Page[][]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [name, setName] = useState("document-manix");
  const [preview, setPreview] = useState<string | null>(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState<Page | null>(null);
  const selected = pages.filter(page => page.selected);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
    else dialog.current?.close();
  }, [zoom]);

  function commit(next: Page[]) {
    setHistory(old => [...old.slice(-19), pages]);
    setPages(next);
    setPreview(null);
    setStatus("");
  }

  async function importFiles(list: FileList | File[]) {
    if (busy || !list.length) return;
    setError(""); setBusy(true); setProgress(0); setStatus("Ouverture des PDF…");
    const created: Source[] = [], additions: Page[] = [];
    try {
      const incoming = Array.from(list);
      if (incoming.some(file => !file.name.toLowerCase().endsWith(".pdf"))) throw new Error("Choisissez uniquement des fichiers PDF.");
      const totalBytes = sources.reduce((sum, source) => sum + source.bytes, 0) + incoming.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_BYTES) throw new Error("Limite totale de 100 Mo. Fermez ce projet pour en ouvrir un autre.");
      const [{ PDFDocument }, pdfjs] = await Promise.all([import("pdf-lib"), import("pdfjs-dist")]);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      for (let fileIndex = 0; fileIndex < incoming.length; fileIndex++) {
        const file = incoming[fileIndex], bytes = new Uint8Array(await file.arrayBuffer());
        let document: PDFDocument;
        try { document = await PDFDocument.load(bytes); }
        catch { throw new Error(`« ${file.name} » ne peut pas être ouvert. Les PDF chiffrés ou endommagés ne sont pas pris en charge.`); }
        const count = document.getPageCount();
        if (count + pages.length + additions.length > MAX_PAGES) throw new Error(`Ce projet est limité à ${MAX_PAGES} pages pour rester fluide.`);
        const id = ++sequence.current;
        created.push({ id, name: file.name, document, bytes: file.size });
        const task = pdfjs.getDocument({ data: bytes.slice() });
        let view;
        try {
          view = await task.promise;
          for (let index = 0; index < count; index++) {
            if (!alive.current) return;
            const page = await view.getPage(index + 1);
            const original = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(1.4, 600 / Math.max(original.width, original.height)) });
            const canvas = documentCanvas(viewport.width, viewport.height);
            await page.render({ canvas, viewport }).promise;
            additions.push({ id: ++sequence.current, source: id, index, rotation: 0, thumbnail: canvas.toDataURL("image/jpeg", 0.85), selected: false });
            canvas.width = canvas.height = 1;
            page.cleanup();
            setProgress(Math.round(100 * (fileIndex + (index + 1) / count) / incoming.length));
            setStatus(`Miniatures : ${file.name} · ${index + 1}/${count}`);
          }
        } finally { await task.destroy(); }
      }
      if (!alive.current) return;
      setSources(old => [...old, ...created]);
      commit([...pages, ...additions]);
      setStatus(`${additions.length} page${additions.length > 1 ? "s ajoutées" : " ajoutée"}. Sélectionnez les pages à modifier.`);
    } catch (err) { if (alive.current) { setStatus(""); setError(err instanceof Error ? err.message : "L’import a échoué."); } }
    finally { if (alive.current) setBusy(false); if (input.current) input.current.value = ""; }
  }

  function move(id: number, offset: number) {
    const from = pages.findIndex(page => page.id === id), to = from + offset;
    if (from < 0 || to < 0 || to >= pages.length) return;
    const next = [...pages]; [next[from], next[to]] = [next[to], next[from]]; commit(next);
  }

  function dropPage(target: number) {
    if (dragPage === null || dragPage === target) return;
    const from = pages.findIndex(page => page.id === dragPage), to = pages.findIndex(page => page.id === target);
    const next = [...pages], [page] = next.splice(from, 1); next.splice(to, 0, page); commit(next); setDragPage(null);
  }

  async function exportPdf() {
    if (!pages.length || busy) return;
    setBusy(true); setError(""); setStatus("Création du PDF…"); setProgress(0);
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const target = await PDFDocument.create();
      target.setCreator("Studio PDF · By Manix · KITT Franco-Belge");
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index], source = sources.find(source => source.id === page.source)!;
        const [copy] = await target.copyPages(source.document, [page.index]);
        copy.setRotation(degrees((copy.getRotation().angle + page.rotation) % 360));
        target.addPage(copy); setProgress(Math.round((index + 1) / pages.length * 100));
      }
      const data = await target.save();
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([data as Uint8Array], { type: "application/pdf" }));
      setPreview(url);
      const link = document.createElement("a"); link.href = url; link.download = exportName(name); link.click();
      setStatus(`${pages.length} pages exportées · ${sizeLabel(data.byteLength)}. Votre PDF est prêt.`);
    } catch (err) { setError(err instanceof Error ? err.message : "La création du PDF a échoué."); }
    finally { if (alive.current) setBusy(false); }
  }

  return <main className="pdf-studio" id="main-content">
    <a className="ps-back" href="/outils"><ArrowLeft size={16} /> Retour au laboratoire</a>
    <header className="ps-hero">
      <div><span className="ps-kicker">ATELIER DOCUMENTS · BY MANIX</span><h1>Votre PDF.<br /><em>Dans le bon ordre.</em></h1><p>Voyez les pages, rassemblez vos documents et préparez le fichier dont vous avez besoin.</p><div className="ps-badges"><span><ShieldCheck size={15} /> Traitement sur cet appareil</span><span>Gratuit · sans compte</span></div></div>
      <div className="ps-stack" aria-hidden="true"><i /><i /><div><FileText size={46} /><span>STUDIO PDF</span><small>FUSIONNER · ORGANISER · EXPORTER</small></div></div>
    </header>
    <div className="ps-steps"><span><b>01</b> Ajoutez vos PDF</span><span><b>02</b> Organisez les pages</span><span><b>03</b> Téléchargez le résultat</span></div>
    <section className={`ps-drop ${dragging ? "is-dragging" : ""}`} aria-label="Importer des PDF" onDragOver={event => { if (!busy && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragging(false); void importFiles(event.dataTransfer.files); } }}>
      <FilePlus2 size={29} /><div><strong>{pages.length ? "Ajouter d’autres PDF" : "Déposez vos documents ici"}</strong><p>Ou choisissez des fichiers sur votre PC. Jusqu’à {MAX_PAGES} pages et 100 Mo par projet.</p></div>
      <label className={`ps-button ${busy ? "is-disabled" : ""}`}>Choisir des PDF<input ref={input} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={event => { if (event.target.files) void importFiles(event.target.files); }} /></label>
    </section>
    {busy && <div className="ps-progress" role="status"><LoaderCircle size={17} /><span>{status}</span><progress value={progress} max={100} aria-label="Avancement" /></div>}
    {error && <p className="ps-error" role="alert">{error}</p>}
    {!busy && status && <p className="ps-status" role="status"><Check size={17} /> {status}</p>}
    {pages.length > 0 ? <>
      <div className="ps-project"><div><span className="ps-kicker">PLAN DU DOCUMENT</span><h2>{pages.length} page{pages.length > 1 ? "s" : ""} <small>· {sources.length} PDF importé{sources.length > 1 ? "s" : ""}</small></h2></div><button className="ps-light" disabled={busy || !history.length} onClick={() => { const previous = history[history.length - 1]; setHistory(history.slice(0, -1)); setPages(previous); setPreview(null); setStatus("Dernière modification annulée."); }}><Undo2 size={16} /> Annuler</button></div>
      <div className="ps-toolbar" role="group" aria-label="Actions sur les pages sélectionnées">
        <label><input type="checkbox" checked={!!pages.length && selected.length === pages.length} disabled={busy} onChange={event => setPages(pages.map(page => ({ ...page, selected: event.target.checked })))} /> Tout sélectionner</label><span>{selected.length} sélectionnée{selected.length > 1 ? "s" : ""}</span>
        <button className="ps-light" disabled={busy || !selected.length} onClick={() => commit(pages.map(page => page.selected ? { ...page, rotation: (page.rotation + 90) % 360 } : page))}><RotateCw size={16} /> Tourner de 90°</button>
        <button className="ps-light ps-danger" disabled={busy || !selected.length} onClick={() => commit(pages.filter(page => !page.selected))}><Trash2 size={16} /> Retirer</button>
      </div>
      <p className="ps-help">Glissez les pages pour les déplacer, ou utilisez leurs flèches. Cliquez sur une miniature pour l’agrandir. « Retirer » modifie ce projet : vous récupérez les pages avec Annuler.</p>
      <section className="ps-pages" aria-label="Pages du PDF">
        {pages.map((page, index) => <article key={page.id} className={`ps-page ${page.selected ? "is-selected" : ""} ${dragPage === page.id ? "is-moving" : ""}`} draggable={!busy} onDragStart={event => { setDragPage(page.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(page.id)); }} onDragEnd={() => setDragPage(null)} onDragOver={event => { if (dragPage !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => { if (dragPage !== null) { event.preventDefault(); dropPage(page.id); } }}>
          <div className="ps-page-top"><label><input type="checkbox" aria-label={`Sélectionner la page ${index + 1}`} checked={page.selected} disabled={busy} onChange={() => setPages(pages.map(item => item.id === page.id ? { ...item, selected: !item.selected } : item))} /> Page {index + 1}</label><GripVertical size={15} aria-hidden="true" /></div>
          <button className="ps-thumb" onClick={() => setZoom(page)} aria-label={`Agrandir la page ${index + 1}`}><img src={page.thumbnail} alt={`Aperçu de la page ${page.index + 1} du document source`} style={{ transform: `rotate(${page.rotation}deg)` }} /></button>
          <p title={sources.find(source => source.id === page.source)?.name}>{sources.find(source => source.id === page.source)?.name}<small>Page source {page.index + 1}{page.rotation ? ` · +${page.rotation}°` : ""}</small></p>
          <div className="ps-page-actions"><button disabled={busy || index === 0} aria-label={`Avancer la page ${index + 1}`} onClick={() => move(page.id, -1)}><ArrowUp size={15} /></button><button disabled={busy || index === pages.length - 1} aria-label={`Reculer la page ${index + 1}`} onClick={() => move(page.id, 1)}><ArrowDown size={15} /></button><button disabled={busy} aria-label={`Tourner la page ${index + 1}`} onClick={() => commit(pages.map(item => item.id === page.id ? { ...item, rotation: (item.rotation + 90) % 360 } : item))}><RotateCw size={15} /></button><button disabled={busy} aria-label={`Retirer la page ${index + 1}`} onClick={() => commit(pages.filter(item => item.id !== page.id))}><Trash2 size={15} /></button></div>
        </article>)}
      </section>
      <div className="ps-export"><label>Nom du fichier<input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="document-manix" disabled={busy} /><small>Extension .pdf ajoutée automatiquement</small></label><button className="ps-button" disabled={busy} onClick={() => void exportPdf()}><ArrowDownToLine size={18} /> Télécharger mon PDF</button>{preview && <a className="ps-light" href={preview} target="_blank" rel="noreferrer">Ouvrir le résultat</a>}</div>
    </> : <section className="ps-empty"><FileText size={40} /><h2>Préparez un document qui vous ressemble.</h2><p>Un dossier administratif, des cours à regrouper ou des pages scannées à remettre dans le bon sens : les miniatures apparaîtront ici.</p>{history.length > 0 && <button className="ps-light" disabled={busy} onClick={() => { setPages(history[history.length - 1]); setHistory(history.slice(0, -1)); }}><Undo2 size={16} /> Récupérer les pages retirées</button>}</section>}
    <aside className="ps-notice"><ShieldCheck size={20} /><div><strong>Vos fichiers restent dans cet onglet.</strong><p>Ce studio organise des pages ; il ne modifie pas le texte. Les PDF protégés ne sont pas acceptés. Les signatures numériques et formulaires interactifs peuvent être perdus lors de l’assemblage. Téléchargez le résultat avant de fermer la page.</p><a href="/outils-licences.html">Fonctionnement et licences</a></div></aside>
    <footer className="ps-footer"><span>BY MANIX · KITT FRANCO-BELGE</span><a href="https://www.facebook.com/groups/757797724622219/" target="_blank" rel="noreferrer">La communauté KITT-FRANCO-BELGE ↗</a></footer>
    <dialog ref={dialog} className="ps-dialog" onCancel={event => { event.preventDefault(); setZoom(null); }} onClose={() => setZoom(null)} aria-label="Aperçu agrandi de la page"><button className="ps-light" aria-label="Fermer l’aperçu" onClick={() => setZoom(null)}><X size={18} /> Fermer</button>{zoom && <img src={zoom.thumbnail} style={{ transform: `rotate(${zoom.rotation}deg)` }} alt="Aperçu de la page sélectionnée" />}</dialog>
  </main>;
}

function documentCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height); return canvas;
}
function exportName(value: string) { return `${value.trim().replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").slice(0, 100) || "document-manix"}.pdf`; }
