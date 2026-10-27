import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Camera, CarFront, Check, ChevronRight, MapPin, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { getApiBase } from "@/lib/tunnel";
import "./PontiacOwners.css";

type Owner = {
  id: string;
  name: string;
  car: string;
  year: string;
  location: string;
  latitude: number;
  longitude: number;
  story: string;
  photos: string[];
  founder?: boolean;
};

const FOUNDER: Owner = {
  id: "manix", name: "Manix", car: "Pontiac Firebird · projet KITT", year: "1986–1989",
  location: "Belgique · région approximative", latitude: 50.5, longitude: 4.5,
  story: "Le projet KITT Franco-Belge réunit passion automobile, électronique et culture Knight Rider.", photos: [], founder: true,
};

type Marker = { x: number; y: number; owner: Owner };

function WorldGlobe({ owners, selectedId, onSelect }: { owners: Owner[]; selectedId: string; onSelect: (owner: Owner) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markersRef = useRef<Marker[]>([]);
  const frameRef = useRef(0);
  const rotationRef = useRef(-0.9);
  const landMaskRef = useRef<Uint8ClampedArray | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx = context;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const surfaceCanvas = document.createElement("canvas");
    const surfaceContext = surfaceCanvas.getContext("2d");
    const landImage = new Image();
    landImage.onload = () => {
      if (!maskContext) return;
      maskCanvas.width = landImage.naturalWidth;
      maskCanvas.height = landImage.naturalHeight;
      maskContext.drawImage(landImage, 0, 0);
      landMaskRef.current = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    };
    landImage.src = "/static/pontiac-world/land-mask.png";
    let width = 0, height = 0, dpr = 1, last = 0, lastTextureFrame = 0, surfaceImage: ImageData | null = null;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      surfaceCanvas.width = canvas.width; surfaceCanvas.height = canvas.height;
      surfaceImage = surfaceContext?.createImageData(surfaceCanvas.width, surfaceCanvas.height) || null;
    };
    const onResize = new ResizeObserver(resize);
    onResize.observe(canvas);
    resize();

    const project = (lon: number, lat: number, cx: number, cy: number, radius: number, spin: number) => {
      const phi = lat * Math.PI / 180, lambda = (lon + spin * 180 / Math.PI) * Math.PI / 180;
      const depth = Math.cos(phi) * Math.cos(lambda);
      return { x: cx + radius * Math.cos(phi) * Math.sin(lambda), y: cy - radius * Math.sin(phi), depth };
    };
    const draw = (time: number) => {
      if (!width || !height) { frameRef.current = requestAnimationFrame(draw); return; }
      if (!reduced && time - last > 32) rotationRef.current += 0.00023 * (time - last);
      last = time;
      const { x: cx, y: cy } = { x: width / 2, y: height / 2 };
      const radius = Math.min(width * 0.39, height * 0.39);
      ctx.clearRect(0, 0, width, height);
      const atmosphere = ctx.createRadialGradient(cx, cy, radius * .65, cx, cy, radius * 1.28);
      atmosphere.addColorStop(0, "#fe273300"); atmosphere.addColorStop(.8, "#fd30332b"); atmosphere.addColorStop(1, "#fa272300");
      ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, width, height);
      const sphere = ctx.createRadialGradient(cx - radius * .35, cy - radius * .42, radius * .06, cx, cy, radius * 1.02);
      sphere.addColorStop(0, "#39212a"); sphere.addColorStop(.56, "#131923"); sphere.addColorStop(1, "#06080e");
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = sphere; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2); ctx.clip();
      const mask = landMaskRef.current;
      if (mask && surfaceContext && surfaceImage && time - lastTextureFrame > 50) {
        lastTextureFrame = time;
        const pixels = surfaceImage.data;
        pixels.fill(0);
        const pixelWidth = surfaceCanvas.width, pixelHeight = surfaceCanvas.height;
        const px = cx * dpr, py = cy * dpr, pr = radius * dpr;
        const minX = Math.max(0, Math.floor(px - pr)), maxX = Math.min(pixelWidth - 1, Math.ceil(px + pr));
        const minY = Math.max(0, Math.floor(py - pr)), maxY = Math.min(pixelHeight - 1, Math.ceil(py + pr));
        const maskWidth = maskCanvas.width, maskHeight = maskCanvas.height, spin = rotationRef.current;
        const tau = Math.PI * 2, lightX = -.42, lightY = -.48, lightZ = .77;
        for (let y = minY; y <= maxY; y++) {
          const ny = (y - py) / pr;
          for (let x = minX; x <= maxX; x++) {
            const nx = (x - px) / pr, depthSquared = 1 - nx * nx - ny * ny;
            if (depthSquared <= 0) continue;
            const nz = Math.sqrt(depthSquared);
            const longitude = Math.atan2(nx, nz) - spin;
            const latitude = Math.asin(-ny);
            const mapX = Math.min(maskWidth - 1, Math.max(0, Math.floor((longitude / tau + .5) * maskWidth)));
            const mapY = Math.min(maskHeight - 1, Math.max(0, Math.floor((.5 - latitude / Math.PI) * maskHeight)));
            const source = (mapY * maskWidth + mapX) * 4;
            const coverage = mask[source + 3];
            if (coverage < 48) continue;
            const edge = coverage < 245
              || (mapX + 1 < maskWidth && mask[source + 4] < 32)
              || (mapX > 0 && mask[source - 4] < 32)
              || (mapY + 1 < maskHeight && mask[source + maskWidth * 4] < 32)
              || (mapY > 0 && mask[source - maskWidth * 4] < 32);
            const illumination = Math.max(.28, .48 + .58 * (nx * lightX + ny * lightY + nz * lightZ));
            const target = (y * pixelWidth + x) * 4;
            pixels[target] = Math.round((edge ? 132 : 82) * illumination);
            pixels[target + 1] = Math.round((edge ? 225 : 164) * illumination);
            pixels[target + 2] = Math.round((edge ? 199 : 136) * illumination);
            pixels[target + 3] = coverage;
          }
        }
        surfaceContext.putImageData(surfaceImage, 0, 0);
      }
      ctx.drawImage(surfaceCanvas, 0, 0, width, height);
      ctx.strokeStyle = "#c9e8ff30"; ctx.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); let active = false;
        for (let lon = -180; lon <= 180; lon += 4) { const p = project(lon, lat, cx, cy, radius, rotationRef.current); if (p.depth > 0) { active ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); active = true; } else active = false; }
        ctx.stroke();
      }
      for (let lon = -150; lon <= 180; lon += 30) {
        ctx.beginPath(); let active = false;
        for (let lat = -88; lat <= 88; lat += 3) { const p = project(lon, lat, cx, cy, radius, rotationRef.current); if (p.depth > 0) { active ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); active = true; } else active = false; }
        ctx.stroke();
      }
      ctx.strokeStyle = "#ff667781"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI * .5, Math.PI * .5); ctx.stroke();
      ctx.restore();
      const visible: Marker[] = [];
      for (const owner of owners) {
        if (typeof owner.latitude !== "number" || typeof owner.longitude !== "number") continue;
        const p = project(owner.longitude, owner.latitude, cx, cy, radius, rotationRef.current);
        if (p.depth < .02) continue;
        visible.push({ x: p.x, y: p.y, owner });
        const active = owner.id === selectedId;
        ctx.beginPath(); ctx.arc(p.x, p.y, active ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = owner.founder ? "#ffc46b" : active ? "#fff" : "#ff515c"; ctx.shadowColor = owner.founder ? "#ffc46b" : "#ff3e50"; ctx.shadowBlur = active ? 20 : 12; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(p.x,p.y,active ? 16 : 12,0,Math.PI*2); ctx.strokeStyle = owner.founder ? "#ffc46b77" : "#ff566766"; ctx.stroke();
      }
      markersRef.current = visible;
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); onResize.disconnect(); };
  }, [owners, selectedId]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const marker = markersRef.current.find(point => Math.hypot(point.x - x, point.y - y) < 18);
    if (marker) onSelect(marker.owner);
  };
  return <canvas ref={canvasRef} className="po-globe-canvas" onClick={handleClick} role="img" aria-label="Globe interactif des membres; active les profils approximativement localisés" />;
}

async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choisis un fichier image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Chaque image doit faire moins de 12 Mo.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Le navigateur ne peut pas préparer cette image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Image illisible.")), "image/jpeg", .78));
  if (blob.size > 900 * 1024) throw new Error("Cette photo reste trop lourde après compression. Choisis une image plus petite.");
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Lecture de l’image impossible.")); reader.readAsDataURL(blob); });
}

export default function PontiacOwners() {
  const [owners, setOwners] = useState<Owner[]>([FOUNDER]);
  const [selected, setSelected] = useState(FOUNDER);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", car: "", year: "", location: "", latitude: "", longitude: "", story: "", consent: false, showLocation: false });
  const shownOwners = useMemo(() => owners, [owners]);

  const loadOwners = useCallback(async () => {
    setLoading(true); setApiReady(false);
    try {
      const base = await getApiBase(); setApiBase(base);
      if (!base) throw new Error("Relais de la communauté hors ligne.");
      const response = await fetch(`${base}/api/pontiac-owners/approved`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Service communauté indisponible (${response.status}).`);
      const data = await response.json();
      const remote = Array.isArray(data.approved)
        ? (data.approved as Owner[]).map(owner => ({
            ...owner,
            // L’API renvoie des chemins absolus à son propre domaine; sans cette
            // résolution, le navigateur chercherait les photos sur GitHub Pages.
            photos: Array.isArray(owner.photos)
              ? owner.photos.map(photo => new URL(photo, base).toString())
              : [],
          }))
        : [];
      const withoutFounder = remote.filter(owner => owner.id !== FOUNDER.id);
      const next = [FOUNDER, ...withoutFounder];
      setOwners(next); setSelected(current => next.find(owner => owner.id === current.id) || FOUNDER); setApiReady(true); setError("");
    } catch (cause) {
      setOwners([FOUNDER]); setSelected(FOUNDER);
      setError(cause instanceof Error ? cause.message : "Le service communauté est hors ligne.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadOwners(); }, [loadOwners]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    if (photos.length + files.length > 4) { setError("Quatre photos au maximum par voiture."); return; }
    try {
      const prepared = await Promise.all(Array.from(files).map(compressPhoto));
      setPhotos(current => [...current, ...prepared].slice(0, 4));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Préparation des photos impossible."); }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiReady || !apiBase) { setError("La boîte de réception sécurisée est momentanément indisponible. Ton dossier n’a pas été envoyé; réessaie plus tard."); return; }
    if (!form.consent) { setError("Confirme que tu as le droit de partager ces photos et informations."); return; }
    if (!photos.length) { setError("Ajoute au moins une photo de ta Pontiac."); return; }
    if (form.showLocation && (!form.location.trim() || form.latitude === "" || form.longitude === "")) { setError("Pour afficher un repère, indique une région et des coordonnées arrondies."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/pontiac-owners/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, car: form.car, year: form.year, location: form.showLocation ? form.location : "",
          latitude: form.showLocation ? Number(form.latitude) : null,
          longitude: form.showLocation ? Number(form.longitude) : null,
          story: form.story, showLocation: form.showLocation, consent: form.consent, website: "", photos }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Transmission impossible.");
      setNotice("Photo re\u00e7ue en priv\u00e9. Manix doit valider le dossier avant que ton profil et tes photos deviennent visibles publiquement.");
      setForm({ name: "", car: "", year: "", location: "", latitude: "", longitude: "", story: "", consent: false, showLocation: false });
      setPhotos([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Transmission impossible."); }
    finally { setSubmitting(false); }
  }

  return <main className="po-page">
    <div className="po-grid" aria-hidden="true" />
    <header className="po-topline"><a href="/">KITT <span>FRANCO-BELGE</span></a><span><i /> RESEAU DES PASSIONNES</span></header>
    <section className="po-hero">
      <div className="po-hero-copy"><p className="po-eyebrow">PONTIAC · KNIGHT RIDER · COMMUNAUTÉ</p>
        <h1>Une voiture.<br/><em>Un monde de passionnés.</em></h1>
        <p>Montre ta Pontiac façon KITT, raconte son histoire et retrouve les autres passionnés sur notre globe communautaire.</p>
        <a className="po-primary" href="#inscription"><Camera size={17}/> Présenter ma voiture <ChevronRight size={16}/></a>
      </div>
      <div className="po-scan-art" aria-hidden="true"><div className="po-scan-ring"><i/><i/><i/></div><span>KITT / COMMUNITY LINK</span></div>
    </section>

    <section className="po-stats" aria-label="État du réseau">
      <div><span>PROFILS APPROUVÉS</span><strong>{owners.length}</strong><small>Manix + membres publiés</small></div>
      <div><span>PHOTOS PAR PROFIL</span><strong>04</strong><small>Intérieur, extérieur, détails</small></div>
      <div><span>PROTECTION</span><strong>100%</strong><small>Position exacte jamais affichée</small></div>
      <div className={`po-service ${apiReady ? "is-online" : "is-offline"}`}><span>RELAIS COMMUNAUTÉ</span><strong>{loading ? "TEST…" : apiReady ? "EN LIGNE" : "HORS LIGNE"}</strong><small>{loading ? "Vérification du serveur" : apiReady ? "Envoi avec validation" : "Les profils existants restent consultables"}</small></div>
    </section>

    <section className="po-explorer" aria-labelledby="po-globe-title">
      <div className="po-section-head"><div><p className="po-eyebrow">UN TOUR DU MONDE EN PONTIAC</p><h2 id="po-globe-title">Le globe des passionnés</h2></div><button type="button" className="po-refresh" onClick={() => void loadOwners()} disabled={loading} aria-label="Actualiser les profils"><RotateCcw size={16}/> Actualiser</button></div>
      {error && !apiReady && <p className="po-inline-note"><i/> {error} — le globe de démonstration reste visible.</p>}
      <div className="po-globe-layout">
        <div className="po-globe-wrap"><WorldGlobe owners={shownOwners} selectedId={selected.id} onSelect={setSelected}/><div className="po-globe-caption"><span><i/> MANIX · BELGIQUE APPROXIMATIVE</span><span>{Math.max(0, owners.length - 1)} MEMBRE{owners.length - 1 === 1 ? "" : "S"} VALIDÉ{owners.length - 1 === 1 ? "" : "S"}</span></div></div>
        <article className="po-profile-card" aria-live="polite">
          <div className="po-profile-photo">{selected.photos[0] ? <img src={selected.photos[0]} alt={`Pontiac de ${selected.name}`}/> : <div className="po-car-placeholder"><span>KNIGHT INDUSTRIES</span><strong>KITT</strong><i/></div>}<span className="po-verified"><ShieldCheck size={14}/> {selected.founder ? "FONDATEUR" : "PROFIL VALIDÉ"}</span></div>
          <div className="po-profile-info"><p className="po-eyebrow">{selected.location || "Passionné Knight Rider"}</p><h3>{selected.name}</h3><div className="po-car-line"><CarFront size={17}/><span>{selected.car} <small>{selected.year}</small></span></div><p>{selected.story}</p>
          {selected.photos.length > 1 && <div className="po-thumbs">{selected.photos.slice(1).map((src,index)=><img key={`${selected.id}-${index}`} src={src} alt={`Photo ${index+2} de la voiture de ${selected.name}`} loading="lazy"/>)}</div>}
          </div>
        </article>
      </div>
      <div className="po-member-directory" aria-label="Profils de la communauté">{owners.map(owner=><button key={owner.id} type="button" onClick={()=>setSelected(owner)} aria-pressed={selected.id===owner.id}><span className={owner.founder?"is-founder":""}/><strong>{owner.name}</strong><small>{owner.location||"Profil sans position publique"}</small></button>)}</div>
      <p className="po-privacy-line"><MapPin size={15}/> Les repères publics sont volontairement arrondis à une grande région. Aucune adresse précise n’est enregistrée ou montrée.</p>
    </section>

    <section className="po-submit" id="inscription">
      <div className="po-submit-intro"><p className="po-eyebrow">À TON TOUR DE REJOINDRE LE RÉSEAU</p><h2>Présente ta Pontiac</h2><p>Partage jusqu’à quatre vues, quelques mots sur ton projet et une région approximative. Chaque profil est relu avant publication.</p>
        <ul><li><Check size={16}/> Photos transformées en JPEG léger dans ton navigateur</li><li><Check size={16}/> Pas de plaque affichée à part si elle apparaît sur ta photo</li><li><Check size={16}/> Aucune position GPS exacte publiée</li></ul>
      </div>
      <form className="po-form" onSubmit={submit}>
        <div className="po-form-heading"><span>01 / IDENTITÉ & VOITURE</span><span>BY MANIX</span></div>
        <div className="po-form-grid">
          <label>Ton nom ou pseudo<input required maxLength={48} autoComplete="nickname" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex. Alex KITT"/></label>
          <label>Année approximative<select required value={form.year} onChange={e=>setForm({...form,year:e.target.value})}><option value="">Choisir une période</option><option>1982–1984</option><option>1985–1989</option><option>Projet de réplique</option></select></label>
          <label className="po-span-two">Ta voiture<input required maxLength={80} value={form.car} onChange={e=>setForm({...form,car:e.target.value})} placeholder="Firebird / Trans Am · nom de ta voiture"/></label>
          <label className="po-span-two">Ta présentation<textarea required maxLength={420} rows={3} value={form.story} onChange={e=>setForm({...form,story:e.target.value})} placeholder="Raconte en quelques lignes ta voiture et ton projet…"/><small>{form.story.length}/420</small></label>
        </div>
        <div className="po-form-heading"><span>02 / PHOTOS DE LA VOITURE</span><span>{photos.length}/4</span></div>
        <div className="po-photo-grid">
          {photos.map((src,index)=><div className="po-photo-preview" key={`${index}-${src.length}`}><img src={src} alt={`Aperçu ${index+1}`}/><button type="button" onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))} aria-label={`Retirer la photo ${index+1}`}><X size={15}/></button><span>{index===0?"EXTÉRIEUR":"VUE VOITURE"} · {index+1}</span></div>)}
          {photos.length < 4 && <button type="button" className="po-upload-tile" onClick={()=>fileRef.current?.click()}><Upload size={22}/><strong>Ajouter des photos</strong><span>Jusqu’à {4-photos.length} · JPG, PNG, WebP</span></button>}
          <input ref={fileRef} className="po-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>void addPhotos(e.target.files)} aria-label="Choisir jusqu’à quatre photos"/>
        </div>
        <div className="po-form-heading"><span>03 / TA RÉGION SUR LE GLOBE</span><span>FACULTATIF</span></div>
        <div className="po-form-grid"><label className="po-span-two">Région ou pays<input maxLength={80} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Ex. Wallonie, Belgique · pas d’adresse"/></label>
          <label>Latitude approximative<input type="number" min="-60" max="80" step="1" value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})} placeholder="Ex. 51"/></label><label>Longitude approximative<input type="number" min="-180" max="180" step="1" value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})} placeholder="Ex. 5"/></label>
          <label className="po-consent po-span-two"><input type="checkbox" checked={form.showLocation} onChange={e=>setForm({...form,showLocation:e.target.checked})}/><span>Je souhaite montrer un repère géographique approximatif sur le globe. Je n’indiquerai pas mon adresse.</span></label>
        </div>
        <label className="po-consent po-ownership"><input type="checkbox" required checked={form.consent} onChange={e=>setForm({...form,consent:e.target.checked})}/><span>Je suis propriétaire de cette Pontiac. J’ai le droit de partager les photos, j’autorise leur affichage public après validation et je comprends qu’elles pourront être copiées par des visiteurs.</span></label>
        {notice && <div className="po-success" role="status"><Check size={18}/>{notice}</div>}
        {error && (apiReady || notice || photos.length > 0) && <div className="po-error" role="alert">{error}</div>}
        {!apiReady && !loading && <div className="po-api-note"><ShieldCheck size={18}/><span>Le service sécurisé de réception n’est pas joignable pour le moment. Le formulaire ne transmettra pas tes données hors ligne.</span></div>}
        <button className="po-submit-button" disabled={submitting || loading || !apiReady}><span>{submitting?"ENVOI EN COURS…":"ENVOYER POUR VALIDATION"}</span><ArrowDown size={16}/></button>
        <small className="po-submit-legal">Apr&egrave;s l&#39;envoi, seuls Manix et les administrateurs peuvent voir le dossier. Apr&egrave;s validation, le profil et les photos deviennent visibles &agrave; tous les visiteurs. L&#39;envoi ne publie rien automatiquement.</small>
      </form>
    </section>

    <footer className="po-footer"><span>KITT FRANCO-BELGE · BY MANIX</span><span>KNIGHT RIDER FRANCE · PONTIAC OWNERS NETWORK</span><a href="/">RETOUR À L’ACCUEIL ↗</a><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">MAP DATA ? MADE WITH NATURAL EARTH</a></footer>
  </main>;
}
