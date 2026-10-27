import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  Check,
  ImagePlus,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import "./ImageStudio.css";
import "./ImageStudioEnhancements.css";

type Photo = { image: HTMLImageElement; name: string };
type Tab = "retouch" | "compose";
type MaskData = { values: Float32Array; width: number; height: number };
type Adjustments = { brightness: number; contrast: number; saturation: number; vignette: number };

const MAX_OUTPUT_SIDE = 4096;
const MODEL_URL = `${import.meta.env.BASE_URL}models/mediapipe/selfie_segmenter.tflite`;
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";

function canvasSize(image: HTMLImageElement) {
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  return {
    width: Math.max(1, Math.round(image.naturalWidth * scale)),
    height: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

function loadPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ image, name: file.name });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cette image n’a pas pu être ouverte. Essaie un fichier JPG, PNG ou WebP."));
    };
    image.src = url;
  });
}

function coverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export default function ImageStudio() {
  const [tab, setTab] = useState<Tab>("retouch");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [background, setBackground] = useState<Photo | null>(null);
  const [mask, setMask] = useState<MaskData | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [format, setFormat] = useState<"image/png" | "image/jpeg" | "image/webp">("image/png");
  const [quality, setQuality] = useState(92);
  const [threshold, setThreshold] = useState(42);
  const [softness, setSoftness] = useState(18);
  const [scale, setScale] = useState(72);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(8);
  const [rotation, setRotation] = useState(0);
  const [adjustments, setAdjustments] = useState<Adjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vignette: 0,
  });
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);

  useEffect(() => () => segmenterRef.current?.close(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (tab === "retouch" && photo) {
      const size = canvasSize(photo.image);
      const turned = Math.abs(rotation % 180) === 90;
      canvas.width = turned ? size.height : size.width;
      canvas.height = turned ? size.width : size.height;
      const target = canvas.getContext("2d", { alpha: false });
      if (!target) return;
      target.save();
      target.translate(canvas.width / 2, canvas.height / 2);
      target.rotate((rotation * Math.PI) / 180);
      target.filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`;
      target.drawImage(photo.image, -size.width / 2, -size.height / 2, size.width, size.height);
      target.restore();
      if (adjustments.vignette > 0) {
        const radius = Math.max(canvas.width, canvas.height) * 0.78;
        const shade = target.createRadialGradient(canvas.width / 2, canvas.height / 2, radius * 0.2, canvas.width / 2, canvas.height / 2, radius);
        shade.addColorStop(0, "rgba(0,0,0,0)");
        shade.addColorStop(1, `rgba(0,0,0,${adjustments.vignette / 100})`);
        target.fillStyle = shade;
        target.fillRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    if (tab === "compose" && photo) {
      const reference = background?.image ?? photo.image;
      const size = canvasSize(reference);
      canvas.width = size.width;
      canvas.height = size.height;
      const target = canvas.getContext("2d", { alpha: true });
      if (!target) return;
      if (background) {
        coverImage(target, background.image, canvas.width, canvas.height);
      } else if (format === "image/jpeg") {
        target.fillStyle = "#ffffff";
        target.fillRect(0, 0, canvas.width, canvas.height);
      }

      const subjectSize = canvasSize(photo.image);
      const subjectCanvas = document.createElement("canvas");
      subjectCanvas.width = subjectSize.width;
      subjectCanvas.height = subjectSize.height;
      const subjectCtx = subjectCanvas.getContext("2d");
      if (!subjectCtx) return;
      subjectCtx.drawImage(photo.image, 0, 0, subjectSize.width, subjectSize.height);

      if (mask) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = mask.width;
        maskCanvas.height = mask.height;
        const maskCtx = maskCanvas.getContext("2d");
        if (!maskCtx) return;
        const pixels = maskCtx.createImageData(mask.width, mask.height);
        const mid = threshold / 100;
        const half = Math.max(0.01, softness / 200);
        for (let i = 0; i < mask.values.length; i++) {
          const alpha = Math.max(0, Math.min(1, (mask.values[i] - (mid - half)) / (half * 2)));
          const p = i * 4;
          pixels.data[p] = 255;
          pixels.data[p + 1] = 255;
          pixels.data[p + 2] = 255;
          pixels.data[p + 3] = Math.round(alpha * 255);
        }
        maskCtx.putImageData(pixels, 0, 0);
        subjectCtx.globalCompositeOperation = "destination-in";
        subjectCtx.drawImage(maskCanvas, 0, 0, subjectSize.width, subjectSize.height);
      }

      const fit = Math.min(canvas.width / subjectSize.width, canvas.height / subjectSize.height);
      const subjectWidth = subjectSize.width * fit * (scale / 100);
      const subjectHeight = subjectSize.height * fit * (scale / 100);
      const x = (canvas.width - subjectWidth) / 2 + (offsetX / 100) * canvas.width;
      const y = (canvas.height - subjectHeight) / 2 + (offsetY / 100) * canvas.height;
      target.save();
      target.shadowColor = "rgba(0,0,0,.28)";
      target.shadowBlur = Math.max(8, canvas.width * 0.012);
      target.shadowOffsetY = Math.max(3, canvas.height * 0.008);
      target.drawImage(subjectCanvas, x, y, subjectWidth, subjectHeight);
      target.restore();
    }
  }, [tab, photo, background, mask, threshold, softness, scale, offsetX, offsetY, rotation, adjustments, format]);

  async function choosePhoto(file: File | undefined, destination: "photo" | "background") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choisis un fichier image.");
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setStatus("Limite de 80 Mo par image pour préserver la mémoire du navigateur.");
      return;
    }
    try {
      const loaded = await loadPhoto(file);
      if (destination === "photo") {
        setPhoto(loaded);
        setMask(null);
        setStatus("Image prête. Les réglages restent modifiables avant l’export.");
      } else {
        setBackground(loaded);
        setStatus("Nouveau fond chargé. Le fichier reste sur cet appareil.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossible d’ouvrir cette image.");
    }
  }

  async function cutOutPerson() {
    if (!photo) return;
    setBusy(true);
    setStatus("Chargement du modèle de détourage… le fichier image reste dans le navigateur.");
    try {
      if (!segmenterRef.current) {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        segmenterRef.current = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: "IMAGE",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      }
      const segmenter = segmenterRef.current;
      const result = segmenter.segment(photo.image);
      const labels = segmenter.getLabels();
      const personIndex = labels.findIndex(label => /person/i.test(label));
      const selectedMask = result.confidenceMasks?.[personIndex >= 0 ? personIndex : 1] ?? result.confidenceMasks?.[0];
      if (!selectedMask) throw new Error("Le modèle n’a pas produit de masque. Essaie une photo plus nette avec une personne au premier plan.");
      const values = new Float32Array(selectedMask.getAsFloat32Array());
      const data = { values, width: selectedMask.width, height: selectedMask.height };
      result.confidenceMasks?.forEach(item => item.close());
      result.categoryMask?.close();
      setMask(data);
      setStatus(`Détourage terminé · ${data.width} × ${data.height}. Ajuste le seuil et la douceur du bord pour affiner le contour.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Le détourage n’a pas abouti. Vérifie la connexion puis réessaie.");
    } finally {
      setBusy(false);
    }
  }

  function resetAdjustments() {
    setAdjustments({ brightness: 0, contrast: 0, saturation: 0, vignette: 0 });
    setRotation(0);
    setStatus("Réglages réinitialisés.");
  }

  function setAdjustment(key: keyof Adjustments, value: number) {
    setAdjustments(current => ({ ...current, [key]: value }));
  }

  function downloadResult() {
    const canvas = canvasRef.current;
    if (!canvas || !photo) {
      setStatus("Ajoute d’abord une image.");
      return;
    }
    canvas.toBlob(blob => {
      if (!blob) {
        setStatus("Le navigateur n’a pas pu exporter cette image.");
        return;
      }
      const extension = format.split("/")[1];
      const baseName = photo.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${baseName}-manix-studio.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus(`Export prêt · ${canvas.width} × ${canvas.height} · ${(blob.size / 1048576).toFixed(2)} Mo.`);
    }, format, format === "image/png" ? undefined : quality / 100);
  }

  const noImage = !photo;

  return (
    <main className="image-studio">
      <header className="is-topbar">
        <a href="/outils" className="is-back"><ArrowLeft size={16} /> Retour aux outils</a>
        <span className="is-brand">KITT <i>//</i> MANIX IMAGE STUDIO</span>
        <span className="is-online"><b /> TRAITEMENT LOCAL</span>
      </header>

      <section className="is-hero">
        <div className="is-hero-glow" />
        <div className="is-hero-copy">
          <span className="is-eyebrow"><Sparkles size={14} /> ATELIER VISUEL · VERSION BÊTA</span>
          <h1>Studio <em>Image</em></h1>
          <p>Retouche tes photos, détoure une personne et place-la sur un autre décor. Tes images ne quittent pas ton navigateur.</p>
          <div className="is-privacy"><ShieldCheck size={17} /> Fichiers traités sur cet appareil · aucun envoi d’image au site</div>
        </div>
        <div className="is-hero-mark" aria-hidden="true"><span>KI</span><i /><b /></div>
      </section>

      <section className="is-workspace" aria-label="Studio de retouche et de composition">
        <div className="is-workspace-head">
          <div>
            <span className="is-eyebrow">TON ESPACE DE CRÉATION</span>
            <h2>{tab === "retouch" ? "Retouche photo" : "Détourage & montage"}</h2>
            <p>{tab === "retouch" ? "Ajuste l’image, compare tes réglages et exporte une copie." : "Isole la personne du premier plan puis compose une nouvelle scène."}</p>
          </div>
          <div className="is-tabs" role="tablist" aria-label="Mode d’édition">
            <button role="tab" aria-selected={tab === "retouch"} className={tab === "retouch" ? "active" : ""} onClick={() => setTab("retouch")}><Sparkles size={15} /> Retouche</button>
            <button role="tab" aria-selected={tab === "compose"} className={tab === "compose" ? "active" : ""} onClick={() => setTab("compose")}><WandSparkles size={15} /> Détourage & montage</button>
          </div>
        </div>

        <div className="is-layout">
          <aside className="is-controls">
            <div className="is-control-section">
              <div className="is-section-title"><span>01</span> IMAGES</div>
              <label className="is-upload">
                <ImagePlus size={20} />
                <strong>{photo ? "Remplacer la photo" : "Choisir la photo"}</strong>
                <small>{photo ? photo.name : "JPG · PNG · WebP, jusqu’à 80 Mo"}</small>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => { void choosePhoto(event.currentTarget.files?.[0], "photo"); event.currentTarget.value = ""; }} />
              </label>
              {tab === "compose" && <label className="is-upload is-upload-secondary">
                <ImagePlus size={18} />
                <strong>{background ? "Changer le décor" : "Ajouter une image de fond"}</strong>
                <small>{background ? background.name : "Facultatif · le PNG peut rester transparent"}</small>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => { void choosePhoto(event.currentTarget.files?.[0], "background"); event.currentTarget.value = ""; }} />
              </label>}
              {tab === "compose" && background && <button className="is-remove-bg" onClick={() => { setBackground(null); setStatus("Décor retiré · l’export PNG gardera la transparence."); }}>Retirer l’image de fond</button>}
            </div>

            {tab === "retouch" ? <div className="is-control-section">
              <div className="is-section-title"><span>02</span> RÉGLAGES</div>
              <div className="is-presets">
                <button disabled={noImage} onClick={() => { setAdjustment("brightness", 0); setAdjustment("contrast", 0); setAdjustment("saturation", 0); setAdjustment("vignette", 0); }}>Original</button>
                <button disabled={noImage} onClick={() => { setAdjustment("brightness", 2); setAdjustment("contrast", 14); setAdjustment("saturation", -18); setAdjustment("vignette", 24); }}>Cinéma</button>
                <button disabled={noImage} onClick={() => { setAdjustment("brightness", 2); setAdjustment("contrast", 20); setAdjustment("saturation", -100); setAdjustment("vignette", 8); }}>Noir</button>
              </div>
              {([ ["brightness", "Luminosité", -40, 40], ["contrast", "Contraste", -40, 40], ["saturation", "Saturation", -100, 100], ["vignette", "Vignette", 0, 60] ] as const).map(([key, label, min, max]) => (
                <label className="is-range" key={key}>
                  <span>{label}<b>{adjustments[key] > 0 ? "+" : ""}{adjustments[key]}</b></span>
                  <input type="range" min={min} max={max} value={adjustments[key]} disabled={noImage} onChange={event => setAdjustment(key, Number(event.target.value))} />
                </label>
              ))}
              <div className="is-rotate-row">
                <span>Rotation</span>
                <button disabled={noImage} aria-label="Tourner à gauche" onClick={() => setRotation(value => value - 90)}><RotateCcw size={16} /></button>
                <button disabled={noImage} aria-label="Tourner à droite" onClick={() => setRotation(value => value + 90)}><RotateCw size={16} /></button>
              </div>
              <button className="is-reset" disabled={noImage} onClick={resetAdjustments}>Réinitialiser les réglages</button>
            </div> : <div className="is-control-section">
              <div className="is-section-title"><span>02</span> DÉTOURAGE</div>
              <button className="is-cutout" disabled={!photo || busy} onClick={() => void cutOutPerson()}>
                {busy ? <span className="is-spinner" /> : <WandSparkles size={17} />}
                {busy ? "Détourage en cours…" : mask ? "Réanalyser la personne" : "Détourer la personne"}
              </button>
              <p className="is-small-note">Au premier détourage, le moteur WebAssembly versionné est chargé depuis jsDelivr. La photo reste dans ton navigateur et n’est pas envoyée.</p>
              <label className="is-range">
                <span>Seuil de contour<b>{threshold}%</b></span>
                <input type="range" min="15" max="75" value={threshold} disabled={!mask} onChange={event => setThreshold(Number(event.target.value))} />
              </label>
              <label className="is-range">
                <span>Douceur du bord<b>{softness}%</b></span>
                <input type="range" min="2" max="40" value={softness} disabled={!mask} onChange={event => setSoftness(Number(event.target.value))} />
              </label>
              {mask && <div className="is-mask-ok"><Check size={15} /> Masque personne actif</div>}
              <div className="is-section-title is-subtitle"><span>03</span> POSITION & TAILLE</div>
              {([ ["scale", "Taille", 30, 150], ["offsetX", "Position horizontale", -45, 45], ["offsetY", "Position verticale", -45, 45] ] as const).map(([key, label, min, max]) => (
                <label className="is-range" key={key}>
                  <span>{label}<b>{key === "scale" ? `${scale}%` : `${key === "offsetX" ? offsetX : offsetY}%`}</b></span>
                  <input type="range" min={min} max={max} value={key === "scale" ? scale : key === "offsetX" ? offsetX : offsetY} disabled={noImage} onChange={event => key === "scale" ? setScale(Number(event.target.value)) : key === "offsetX" ? setOffsetX(Number(event.target.value)) : setOffsetY(Number(event.target.value))} />
                </label>
              ))}
            </div>}

            <div className="is-control-section is-export-section">
              <div className="is-section-title"><span>{tab === "retouch" ? "03" : "04"}</span> EXPORT</div>
              <label className="is-select">Format de sortie
                <select value={format} onChange={event => setFormat(event.target.value as typeof format)}>
                  <option value="image/png">PNG · qualité maximale</option>
                  <option value="image/jpeg">JPEG · fichier léger</option>
                  <option value="image/webp">WebP · compact</option>
                </select>
              </label>
              {format !== "image/png" && <label className="is-range"><span>Qualité<b>{quality}%</b></span><input type="range" min="60" max="100" value={quality} onChange={event => setQuality(Number(event.target.value))} /></label>}
              <button className="is-download" disabled={noImage} onClick={downloadResult}><ArrowDownToLine size={17} /> Télécharger l’image</button>
              <small className="is-export-note">Sortie limitée à 4096 px sur le côté le plus long. Un nouveau fichier est créé; l’original reste intact.</small>
            </div>
          </aside>

          <section className="is-canvas-panel">
            <div className="is-canvas-toolbar">
              <span><i /> {photo ? "APERÇU ACTUALISÉ" : "EN ATTENTE D’UNE IMAGE"}</span>
              <span>{photo ? `${photo.image.naturalWidth} × ${photo.image.naturalHeight}` : "— × —"}</span>
            </div>
            <div
              className={`is-canvas-stage ${tab === "compose" ? "is-composition" : ""} ${noImage ? "is-empty" : ""} ${dragging ? "is-dragging" : ""}`}
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; void choosePhoto(file, tab === "compose" && photo ? "background" : "photo"); }}
            >
              {noImage ? <div className="is-empty-state"><span><ImagePlus size={30} /></span><h3>Ton image prend place ici</h3><p>Charge une photo pour commencer la retouche ou le montage.</p><label className="is-empty-cta">Choisir une image<input type="file" accept="image/*" onChange={event => { void choosePhoto(event.currentTarget.files?.[0], "photo"); event.currentTarget.value = ""; }} /></label></div> : <canvas ref={canvasRef} aria-label={tab === "retouch" ? "Aperçu de la photo retouchée" : "Aperçu du détourage et du montage"} />}
            </div>
            <div className={`is-status ${status.startsWith("Détourage terminé") ? "success" : ""}`} role="status">{status || "Choisis une photo pour afficher les commandes."}</div>
            {tab === "compose" && <div className="is-tip"><Sparkles size={15} /><span><strong>À savoir</strong> : un fond contrasté et une personne proche de l’appareil donnent généralement un contour plus propre. Les cheveux fins et les mains peuvent demander une retouche manuelle.</span></div>}
          </section>
        </div>
      </section>

      <footer className="is-footer"><span>KITT FRANCO-BELGE · BY MANIX</span><span>MediaPipe Selfie Segmenter · modèle sous licence Apache 2.0</span><a href="/open-source-licenses/mediapipe-APACHE-2.0.txt">LICENCE DU MOTEUR</a><a href="/models/mediapipe/selfie-segmentation-model-card.pdf">FICHE DU MODÈLE</a></footer>
    </main>
  );
}
