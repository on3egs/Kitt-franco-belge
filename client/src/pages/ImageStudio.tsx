import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  Check,
  ChevronRight,
  Columns2,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Redo2,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import "./ImageStudio.css";
import "./ImageStudioEnhancements.css";

type Photo = { image: HTMLImageElement; name: string; bytes: number };
type Tab = "retouch" | "compose";
type MaskData = { values: Float32Array; width: number; height: number };
type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  vignette: number;
};
type Settings = {
  adjustments: Adjustments;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  threshold: number;
  softness: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  solidBackground: boolean;
  backgroundColor: string;
  shadow: number;
  shadowBlur: number;
  maxSide: number;
};
type EditHistory = {
  present: Settings;
  past: Settings[];
  future: Settings[];
  checkpoint: Settings | null;
};
type EditAction =
  | { type: "change"; patch: Partial<Settings> }
  | { type: "begin" | "commit" | "undo" | "redo" | "new-photo" };

const MAX_OUTPUT_SIDE = 4096;
const DEFAULTS: Settings = {
  adjustments: { brightness: 0, contrast: 0, saturation: 0, vignette: 0 },
  rotation: 0,
  flipX: false,
  flipY: false,
  threshold: 42,
  softness: 18,
  scale: 72,
  offsetX: 0,
  offsetY: 8,
  solidBackground: false,
  backgroundColor: "#111827",
  shadow: 28,
  shadowBlur: 18,
  maxSide: MAX_OUTPUT_SIDE,
};
const INITIAL_HISTORY: EditHistory = {
  present: DEFAULTS,
  past: [],
  future: [],
  checkpoint: null,
};
const MODEL_URL = `${import.meta.env.BASE_URL}models/mediapipe/selfie_segmenter.tflite`;
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const PRESETS: { name: string; className: string; adjustments: Adjustments }[] =
  [
    {
      name: "Naturel",
      className: "natural",
      adjustments: { brightness: 0, contrast: 0, saturation: 0, vignette: 0 },
    },
    {
      name: "Cinéma",
      className: "cinema",
      adjustments: {
        brightness: 2,
        contrast: 14,
        saturation: -18,
        vignette: 24,
      },
    },
    {
      name: "Portrait",
      className: "portrait",
      adjustments: { brightness: 6, contrast: -5, saturation: 7, vignette: 9 },
    },
    {
      name: "Noir & blanc",
      className: "mono",
      adjustments: {
        brightness: 2,
        contrast: 20,
        saturation: -100,
        vignette: 8,
      },
    },
    {
      name: "KITT nuit",
      className: "night",
      adjustments: {
        brightness: -6,
        contrast: 22,
        saturation: -25,
        vignette: 32,
      },
    },
  ];

function sameSettings(a: Settings, b: Settings) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function committed(state: EditHistory): EditHistory {
  if (!state.checkpoint) return state;
  return {
    ...state,
    checkpoint: null,
    past: sameSettings(state.checkpoint, state.present)
      ? state.past
      : [...state.past, state.checkpoint].slice(-40),
    future: sameSettings(state.checkpoint, state.present) ? state.future : [],
  };
}
function editReducer(state: EditHistory, action: EditAction): EditHistory {
  if (action.type === "new-photo")
    return { ...INITIAL_HISTORY, present: { ...DEFAULTS } };
  if (action.type === "begin")
    return state.checkpoint ? state : { ...state, checkpoint: state.present };
  if (action.type === "commit") return committed(state);
  if (action.type === "change") {
    const next = { ...state.present, ...action.patch };
    if (sameSettings(next, state.present)) return state;
    return {
      ...state,
      present: next,
      past: state.checkpoint
        ? state.past
        : [...state.past, state.present].slice(-40),
      future: [],
    };
  }
  const ready = committed(state);
  if (action.type === "undo" && ready.past.length) {
    return {
      present: ready.past[ready.past.length - 1],
      past: ready.past.slice(0, -1),
      future: [ready.present, ...ready.future],
      checkpoint: null,
    };
  }
  if (action.type === "redo" && ready.future.length) {
    return {
      present: ready.future[0],
      past: [...ready.past, ready.present].slice(-40),
      future: ready.future.slice(1),
      checkpoint: null,
    };
  }
  return ready;
}

function canvasSize(image: HTMLImageElement, maxSide = MAX_OUTPUT_SIDE) {
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight)
  );
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
      resolve({ image, name: file.name, bytes: file.size });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Cette image n’a pas pu être ouverte. Essaie un fichier JPG, PNG ou WebP."
        )
      );
    };
    image.src = url;
  });
}
function coverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight
  );
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
function photoCanvas(photo: Photo, settings: Settings, maxSide: number) {
  const size = canvasSize(photo.image, maxSide);
  const turned = Math.abs(settings.rotation % 180) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = turned ? size.height : size.width;
  canvas.height = turned ? size.width : size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le navigateur ne peut pas préparer l’image.");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
  const a = settings.adjustments;
  ctx.filter = `brightness(${100 + a.brightness}%) contrast(${100 + a.contrast}%) saturate(${100 + a.saturation}%)`;
  ctx.drawImage(
    photo.image,
    -size.width / 2,
    -size.height / 2,
    size.width,
    size.height
  );
  return canvas;
}

export default function ImageStudio() {
  const [tab, setTab] = useState<Tab>("retouch");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [background, setBackground] = useState<Photo | null>(null);
  const [mask, setMask] = useState<MaskData | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [format, setFormat] = useState<
    "image/png" | "image/jpeg" | "image/webp"
  >("image/png");
  const [quality, setQuality] = useState(92);
  const [filename, setFilename] = useState("");
  const [compare, setCompare] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [history, dispatch] = useReducer(editReducer, INITIAL_HISTORY);
  const settings = history.present;
  const {
    adjustments,
    rotation,
    flipX,
    flipY,
    threshold,
    softness,
    scale,
    offsetX,
    offsetY,
    solidBackground,
    backgroundColor,
    shadow,
    shadowBlur,
    maxSide,
  } = settings;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const photoRevision = useRef(0);
  const loadRevisions = useRef({ photo: 0, background: 0 });
  const mounted = useRef(true);
  const currentDimensions = useMemo(() => {
    if (!photo) return null;
    const size = canvasSize(
      tab === "compose" && background ? background.image : photo.image,
      maxSide
    );
    return tab === "retouch" && Math.abs(rotation % 180) === 90
      ? { width: size.height, height: size.width }
      : size;
  }, [photo, background, tab, rotation, maxSide]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, []);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.image.src);
    },
    [photo]
  );
  useEffect(
    () => () => {
      if (background) URL.revokeObjectURL(background.image.src);
    },
    [background]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo || !currentDimensions) return;
    canvas.width = currentDimensions.width;
    canvas.height = currentDimensions.height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError(true);
      setStatus("Le navigateur ne peut pas afficher cet aperçu.");
      return;
    }
    try {
      if (tab === "retouch") {
        ctx.drawImage(photoCanvas(photo, settings, maxSide), 0, 0);
        if (adjustments.vignette > 0) {
          const radius = Math.max(canvas.width, canvas.height) * 0.78;
          const shade = ctx.createRadialGradient(
            canvas.width / 2,
            canvas.height / 2,
            radius * 0.2,
            canvas.width / 2,
            canvas.height / 2,
            radius
          );
          shade.addColorStop(0, "rgba(0,0,0,0)");
          shade.addColorStop(1, `rgba(0,0,0,${adjustments.vignette / 100})`);
          ctx.fillStyle = shade;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      if (background)
        coverImage(ctx, background.image, canvas.width, canvas.height);
      else if (solidBackground || format === "image/jpeg") {
        ctx.fillStyle = solidBackground ? backgroundColor : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // Mask the untransformed subject so its outline follows rotation and mirrors.
      const sourceSize = canvasSize(photo.image, maxSide);
      const subject = document.createElement("canvas");
      subject.width = sourceSize.width;
      subject.height = sourceSize.height;
      const subjectCtx = subject.getContext("2d");
      if (!subjectCtx) throw new Error("Impossible de préparer le sujet.");
      subjectCtx.filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`;
      subjectCtx.drawImage(photo.image, 0, 0, subject.width, subject.height);
      subjectCtx.filter = "none";
      if (mask) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = mask.width;
        maskCanvas.height = mask.height;
        const maskCtx = maskCanvas.getContext("2d");
        if (!maskCtx) throw new Error("Impossible d’appliquer le contour.");
        const pixels = maskCtx.createImageData(mask.width, mask.height);
        const mid = threshold / 100;
        const half = Math.max(0.01, softness / 200);
        for (let i = 0; i < mask.values.length; i++) {
          const p = i * 4;
          pixels.data[p] = 255;
          pixels.data[p + 1] = 255;
          pixels.data[p + 2] = 255;
          pixels.data[p + 3] = Math.round(
            Math.max(
              0,
              Math.min(1, (mask.values[i] - (mid - half)) / (half * 2))
            ) * 255
          );
        }
        maskCtx.putImageData(pixels, 0, 0);
        subjectCtx.globalCompositeOperation = "destination-in";
        subjectCtx.drawImage(maskCanvas, 0, 0, subject.width, subject.height);
      }
      const turned = Math.abs(rotation % 180) === 90;
      const w = turned ? subject.height : subject.width;
      const h = turned ? subject.width : subject.height;
      const fit = (Math.min(canvas.width / w, canvas.height / h) * scale) / 100;
      ctx.save();
      ctx.translate(
        canvas.width / 2 + (offsetX / 100) * canvas.width,
        canvas.height / 2 + (offsetY / 100) * canvas.height
      );
      ctx.shadowColor = `rgba(0,0,0,${shadow / 100})`;
      ctx.shadowBlur = shadow > 0 ? (canvas.width * shadowBlur) / 1000 : 0;
      ctx.shadowOffsetY = shadow > 0 ? Math.max(2, canvas.height * 0.008) : 0;
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(fit * (flipX ? -1 : 1), fit * (flipY ? -1 : 1));
      ctx.drawImage(subject, -subject.width / 2, -subject.height / 2);
      ctx.restore();
    } catch (cause) {
      setError(true);
      setStatus(
        cause instanceof Error
          ? cause.message
          : "L’aperçu n’a pas pu être calculé. Essaie une image plus petite."
      );
    }
  }, [
    tab,
    photo,
    background,
    mask,
    settings,
    adjustments,
    currentDimensions,
    format,
    maxSide,
    threshold,
    softness,
    scale,
    offsetX,
    offsetY,
    rotation,
    flipX,
    flipY,
    solidBackground,
    backgroundColor,
    shadow,
    shadowBlur,
    compare,
  ]);

  function announce(message: string, isError = false) {
    setStatus(message);
    setError(isError);
  }
  function change(patch: Partial<Settings>) {
    dispatch({ type: "change", patch });
  }
  function sliderProps() {
    return {
      onPointerDown: () => dispatch({ type: "begin" }),
      onPointerUp: () => dispatch({ type: "commit" }),
      onPointerCancel: () => dispatch({ type: "commit" }),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ].includes(event.key)
        )
          dispatch({ type: "begin" });
      },
      onKeyUp: () => dispatch({ type: "commit" }),
      onBlur: () => dispatch({ type: "commit" }),
    };
  }
  async function choosePhoto(
    file: File | undefined,
    destination: "photo" | "background"
  ) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      announce("Choisis un fichier image JPG, PNG, WebP ou AVIF.", true);
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      announce(
        "Limite de 80 Mo par image pour préserver la mémoire du navigateur.",
        true
      );
      return;
    }
    const revision = ++loadRevisions.current[destination];
    if (destination === "photo") photoRevision.current++;
    try {
      const loaded = await loadPhoto(file);
      if (!mounted.current || revision !== loadRevisions.current[destination]) {
        URL.revokeObjectURL(loaded.image.src);
        return;
      }
      if (destination === "photo") {
        setPhoto(loaded);
        setMask(null);
        dispatch({ type: "new-photo" });
        setFilename(loaded.name.replace(/\.[^.]+$/, "") + "-manix-studio");
        announce(
          "Photo prête. Choisis un style ou ajuste les curseurs : le résultat s’actualise à droite."
        );
      } else {
        setBackground(loaded);
        announce(
          "Décor chargé. Ajuste la taille et la position de la personne pour composer la scène."
        );
      }
    } catch (cause) {
      announce(
        cause instanceof Error
          ? cause.message
          : "Impossible d’ouvrir cette image.",
        true
      );
    }
  }
  async function cutOutPerson() {
    if (!photo || busy) return;
    const revision = photoRevision.current;
    setBusy(true);
    announce("Chargement du détourage… La photo reste dans le navigateur.");
    try {
      if (!segmenterRef.current) {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: "IMAGE",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (!mounted.current) {
          segmenter.close();
          return;
        }
        segmenterRef.current = segmenter;
      }
      if (revision !== photoRevision.current) return;
      const segmenter = segmenterRef.current;
      const result = segmenter.segment(photo.image);
      try {
        const personIndex = segmenter
          .getLabels()
          .findIndex(label => /person/i.test(label));
        const selectedMask =
          result.confidenceMasks?.[personIndex >= 0 ? personIndex : 1] ??
          result.confidenceMasks?.[0];
        if (!selectedMask)
          throw new Error(
            "Aucun contour détecté. Essaie une photo nette avec une personne au premier plan."
          );
        if (revision !== photoRevision.current || !mounted.current) return;
        const data = {
          values: new Float32Array(selectedMask.getAsFloat32Array()),
          width: selectedMask.width,
          height: selectedMask.height,
        };
        setMask(data);
        announce(
          "Personne détourée. Affine les bords, puis choisis un décor, un fond uni ou un PNG transparent."
        );
      } finally {
        result.confidenceMasks?.forEach(item => item.close());
        result.categoryMask?.close();
      }
    } catch (cause) {
      if (mounted.current && revision === photoRevision.current)
        announce(
          cause instanceof Error
            ? cause.message
            : "Détourage indisponible. Vérifie la connexion et réessaie.",
          true
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function downloadResult() {
    const canvas = canvasRef.current;
    if (!canvas || !photo) {
      announce("Ajoute d’abord une image.", true);
      return;
    }
    let exportCanvas = canvas;
    if (format === "image/jpeg") {
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) {
        announce("Impossible de préparer l’export JPEG.", true);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
    }
    exportCanvas.toBlob(
      blob => {
        if (!blob) {
          announce("Le navigateur n’a pas pu exporter cette image.", true);
          return;
        }
        const requestedFormat = format;
        const extension =
          blob.type === "image/jpeg"
            ? "jpg"
            : blob.type === "image/webp"
              ? "webp"
              : "png";
        const name =
          filename
            .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
            .replace(/\.(png|jpg|jpeg|webp)$/i, "")
            .trim() || "image-manix-studio";
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name}.${extension}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        announce(
          `Image téléchargée · ${exportCanvas.width} × ${exportCanvas.height} · ${(blob.size / 1048576).toFixed(2)} Mo.${blob.type !== requestedFormat ? " Ce navigateur a utilisé le format PNG." : ""}`
        );
      },
      format,
      format === "image/png" ? undefined : quality / 100
    );
  }
  const noImage = !photo;
  const activePreset = PRESETS.find(
    preset => JSON.stringify(preset.adjustments) === JSON.stringify(adjustments)
  )?.name;

  return (
    <main className="image-studio">
      <header className="is-topbar">
        <a href="/outils" className="is-back">
          <ArrowLeft size={16} /> Retour aux outils
        </a>
        <span className="is-brand">
          KITT <i>//</i> MANIX IMAGE STUDIO
        </span>
        <span className="is-online">
          <b /> TRAITEMENT LOCAL
        </span>
      </header>
      <section className="is-hero">
        <div className="is-hero-glow" />
        <div className="is-hero-copy">
          <span className="is-eyebrow">
            <Sparkles size={14} /> L’ATELIER PHOTO BY MANIX
          </span>
          <h1>
            Une photo.
            <br />
            <em>Ta prochaine création.</em>
          </h1>
          <p>
            Donne du caractère à une image, isole une personne et invente un
            nouveau décor. Compare, ajuste et télécharge le résultat.
          </p>
          <div className="is-privacy">
            <ShieldCheck size={17} /> Gratuit · sans compte · images traitées
            sur cet appareil
          </div>
        </div>
        <div className="is-hero-mark" aria-hidden="true">
          <span>KI</span>
          <i />
          <b />
        </div>
      </section>
      <div className="is-quickstart" aria-label="Comment utiliser le studio">
        <div>
          <b>01</b>
          <span>
            <strong>Ajoute ta photo</strong>
            <small>Depuis ton PC ou par glisser-déposer.</small>
          </span>
        </div>
        <ChevronRight size={17} aria-hidden="true" />
        <div>
          <b>02</b>
          <span>
            <strong>Crée ton rendu</strong>
            <small>Retouche, miroir ou détourage d’une personne.</small>
          </span>
        </div>
        <ChevronRight size={17} aria-hidden="true" />
        <div>
          <b>03</b>
          <span>
            <strong>Exporte une copie</strong>
            <small>PNG, JPEG ou WebP, jusqu’à 4096 px.</small>
          </span>
        </div>
      </div>
      <section
        className="is-workspace"
        aria-label="Studio de retouche et de composition"
      >
        <div className="is-workspace-head">
          <div>
            <span className="is-eyebrow">TON ESPACE DE CRÉATION</span>
            <h2>
              {tab === "retouch" ? "Retouche photo" : "Détourage & montage"}
            </h2>
            <p>
              {tab === "retouch"
                ? "Les styles sont un point de départ. Chaque réglage peut être annulé."
                : "Le détourage isole une personne. Les réglages de couleur restent appliqués au sujet."}
            </p>
          </div>
          <div className="is-tabs" aria-label="Mode d’édition">
            <button
              aria-pressed={tab === "retouch"}
              className={tab === "retouch" ? "active" : ""}
              onClick={() => setTab("retouch")}
            >
              <Sparkles size={15} /> Retouche
            </button>
            <button
              aria-pressed={tab === "compose"}
              className={tab === "compose" ? "active" : ""}
              onClick={() => setTab("compose")}
            >
              <WandSparkles size={15} /> Détourage & montage
            </button>
          </div>
        </div>
        <div className="is-layout">
          <aside className="is-controls">
            <div className="is-control-section">
              <div className="is-section-title">
                <span>01</span> TES IMAGES
              </div>
              <label className="is-upload">
                <ImagePlus size={20} />
                <strong>
                  {photo ? "Remplacer la photo" : "Choisir la photo"}
                </strong>
                <small>
                  {photo
                    ? photo.name
                    : "JPG · PNG · WebP · AVIF · jusqu’à 80 Mo"}
                </small>
                <input
                  aria-label="Choisir la photo à modifier"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={event => {
                    void choosePhoto(event.currentTarget.files?.[0], "photo");
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {photo && (
                <div className="is-file-facts">
                  <span>
                    {photo.image.naturalWidth} × {photo.image.naturalHeight} px
                  </span>
                  <span>{(photo.bytes / 1048576).toFixed(2)} Mo</span>
                </div>
              )}
              {tab === "compose" && (
                <label className="is-upload is-upload-secondary">
                  <ImagePlus size={18} />
                  <strong>
                    {background ? "Changer le décor" : "Ajouter un décor"}
                  </strong>
                  <small>
                    {background
                      ? background.name
                      : "Facultatif · choisis une autre photo de ton PC"}
                  </small>
                  <input
                    aria-label="Choisir l’image de fond"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={event => {
                      void choosePhoto(
                        event.currentTarget.files?.[0],
                        "background"
                      );
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
              {tab === "compose" && background && (
                <button
                  className="is-remove-bg"
                  onClick={() => {
                    setBackground(null);
                    announce(
                      "Décor retiré. Choisis un fond uni ou un export transparent."
                    );
                  }}
                >
                  Retirer le décor
                </button>
              )}
            </div>
            {tab === "retouch" ? (
              <div className="is-control-section">
                <div className="is-section-title">
                  <span>02</span> STYLES & LUMIÈRE
                </div>
                <div className="is-style-grid">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      disabled={noImage}
                      aria-pressed={activePreset === preset.name}
                      className={`is-style ${preset.className} ${activePreset === preset.name ? "active" : ""}`}
                      onClick={() =>
                        change({ adjustments: preset.adjustments })
                      }
                    >
                      <span aria-hidden="true" />
                      <strong>{preset.name}</strong>
                      {activePreset === preset.name && <Check size={12} />}
                    </button>
                  ))}
                </div>
                {(
                  [
                    ["brightness", "Luminosité", -40, 40],
                    ["contrast", "Contraste", -40, 40],
                    ["saturation", "Saturation", -100, 100],
                    ["vignette", "Vignette", 0, 60],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label className="is-range" key={key}>
                    <span>
                      {label}
                      <b>
                        {adjustments[key] > 0 ? "+" : ""}
                        {adjustments[key]}
                      </b>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={adjustments[key]}
                      disabled={noImage}
                      {...sliderProps()}
                      onChange={event =>
                        change({
                          adjustments: {
                            ...adjustments,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  className="is-reset"
                  disabled={noImage}
                  onClick={() => {
                    change({
                      adjustments: DEFAULTS.adjustments,
                      rotation: 0,
                      flipX: false,
                      flipY: false,
                    });
                    announce(
                      "Retouche réinitialisée. Tu peux encore annuler cette action."
                    );
                  }}
                >
                  Réinitialiser la retouche
                </button>
              </div>
            ) : (
              <div className="is-control-section">
                <div className="is-section-title">
                  <span>02</span> ISOLER LA PERSONNE
                </div>
                <button
                  className="is-cutout"
                  disabled={!photo || busy}
                  onClick={() => void cutOutPerson()}
                >
                  {busy ? (
                    <span className="is-spinner" />
                  ) : (
                    <WandSparkles size={17} />
                  )}
                  {busy
                    ? "Détourage en cours…"
                    : mask
                      ? "Réanalyser la personne"
                      : "Détourer la personne"}
                </button>
                <p className="is-small-note">
                  Le premier lancement télécharge le moteur depuis jsDelivr et
                  le modèle depuis le site. La photo reste sur ton appareil. Ce
                  modèle est conçu pour les personnes.
                </p>
                <label className="is-range">
                  <span>
                    Seuil de contour<b>{threshold}%</b>
                  </span>
                  <input
                    type="range"
                    min="15"
                    max="75"
                    value={threshold}
                    disabled={!mask}
                    {...sliderProps()}
                    onChange={event =>
                      change({ threshold: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="is-range">
                  <span>
                    Douceur du bord<b>{softness}%</b>
                  </span>
                  <input
                    type="range"
                    min="2"
                    max="40"
                    value={softness}
                    disabled={!mask}
                    {...sliderProps()}
                    onChange={event =>
                      change({ softness: Number(event.target.value) })
                    }
                  />
                </label>
                {mask && (
                  <div className="is-mask-ok">
                    <Check size={15} /> Contour de la personne actif
                  </div>
                )}
                <div className="is-section-title is-subtitle">
                  <span>03</span> COMPOSER LA SCÈNE
                </div>
                {(
                  [
                    ["scale", "Taille du sujet", 10, 200],
                    ["offsetX", "Position horizontale", -80, 80],
                    ["offsetY", "Position verticale", -80, 80],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label className="is-range" key={key}>
                    <span>
                      {label}
                      <b>{settings[key]}%</b>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={settings[key]}
                      disabled={noImage}
                      {...sliderProps()}
                      onChange={event =>
                        change({ [key]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
                <button
                  className="is-reset"
                  disabled={noImage}
                  onClick={() => change({ scale: 100, offsetX: 0, offsetY: 0 })}
                >
                  Centrer et ajuster le sujet
                </button>
                {!background && (
                  <div className="is-background-options">
                    <label className="is-check-label">
                      <input
                        type="checkbox"
                        checked={solidBackground}
                        onChange={event =>
                          change({ solidBackground: event.target.checked })
                        }
                      />{" "}
                      Utiliser un fond uni
                    </label>
                    {solidBackground ? (
                      <label className="is-color-row">
                        Couleur du fond
                        <input
                          aria-label="Couleur du fond"
                          type="color"
                          value={backgroundColor}
                          {...sliderProps()}
                          onChange={event =>
                            change({ backgroundColor: event.target.value })
                          }
                        />
                      </label>
                    ) : (
                      <p className="is-small-note">
                        Le damier représente la transparence, conservée en PNG
                        et WebP. Un JPEG reçoit un fond blanc.
                      </p>
                    )}
                  </div>
                )}
                <label className="is-range">
                  <span>
                    Intensité de l’ombre<b>{shadow}%</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="75"
                    value={shadow}
                    disabled={noImage}
                    {...sliderProps()}
                    onChange={event =>
                      change({ shadow: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="is-range">
                  <span>
                    Diffusion de l’ombre<b>{shadowBlur}</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={shadowBlur}
                    disabled={noImage || shadow === 0}
                    {...sliderProps()}
                    onChange={event =>
                      change({ shadowBlur: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            )}
            <div className="is-control-section">
              <div className="is-transform-row">
                <span>Orientation</span>
                <button
                  disabled={noImage}
                  title="Tourner à gauche"
                  aria-label="Tourner à gauche"
                  onClick={() => change({ rotation: (rotation - 90) % 360 })}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  disabled={noImage}
                  title="Tourner à droite"
                  aria-label="Tourner à droite"
                  onClick={() => change({ rotation: (rotation + 90) % 360 })}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  disabled={noImage}
                  title="Miroir horizontal"
                  aria-label="Miroir horizontal"
                  aria-pressed={flipX}
                  onClick={() => change({ flipX: !flipX })}
                >
                  <FlipHorizontal2 size={16} />
                </button>
                <button
                  disabled={noImage}
                  title="Miroir vertical"
                  aria-label="Miroir vertical"
                  aria-pressed={flipY}
                  onClick={() => change({ flipY: !flipY })}
                >
                  <FlipVertical2 size={16} />
                </button>
              </div>
            </div>
            <div className="is-control-section is-export-section">
              <div className="is-section-title">
                <span>{tab === "retouch" ? "03" : "04"}</span> TON FICHIER FINAL
              </div>
              <label className="is-select">
                Dimensions maximales
                <select
                  value={maxSide}
                  onChange={event =>
                    change({ maxSide: Number(event.target.value) })
                  }
                >
                  <option value="4096">
                    Définition originale · maximum 4096 px
                  </option>
                  <option value="2560">Grand écran · maximum 2560 px</option>
                  <option value="1920">Full HD · maximum 1920 px</option>
                  <option value="1280">Web léger · maximum 1280 px</option>
                  <option value="800">Partage rapide · maximum 800 px</option>
                </select>
              </label>
              <label className="is-select">
                Format de sortie
                <select
                  value={format}
                  onChange={event =>
                    setFormat(event.target.value as typeof format)
                  }
                >
                  <option value="image/png">
                    PNG · transparence et sans perte
                  </option>
                  <option value="image/jpeg">JPEG · photo plus légère</option>
                  <option value="image/webp">
                    WebP · compact et transparent
                  </option>
                </select>
              </label>
              {format !== "image/png" && (
                <label className="is-range">
                  <span>
                    Qualité de compression<b>{quality}%</b>
                  </span>
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={quality}
                    onChange={event => setQuality(Number(event.target.value))}
                  />
                </label>
              )}
              <label className="is-select">
                Nom du fichier
                <input
                  className="is-filename"
                  type="text"
                  value={filename}
                  maxLength={150}
                  placeholder="image-manix-studio"
                  onChange={event => setFilename(event.target.value)}
                />
              </label>
              {currentDimensions && (
                <div className="is-export-size">
                  <Check size={13} /> {currentDimensions.width} ×{" "}
                  {currentDimensions.height} px{" "}
                  <span>
                    {format === "image/jpeg"
                      ? "JPG"
                      : format === "image/webp"
                        ? "WEBP"
                        : "PNG"}
                  </span>
                </div>
              )}
              <button
                className="is-download"
                disabled={noImage || busy}
                onClick={downloadResult}
              >
                <ArrowDownToLine size={17} /> Télécharger mon image
              </button>
              <small className="is-export-note">
                Les proportions sont conservées, sans agrandir les petites
                images. Le fichier source n’est pas modifié.
              </small>
            </div>
          </aside>
          <section className="is-canvas-panel">
            <div className="is-editor-toolbar">
              <div className="is-history-buttons">
                <button
                  disabled={!history.past.length}
                  onClick={() => dispatch({ type: "undo" })}
                  title="Annuler le dernier réglage"
                >
                  <Undo2 size={15} /> Annuler
                </button>
                <button
                  disabled={!history.future.length}
                  onClick={() => dispatch({ type: "redo" })}
                  title="Rétablir le réglage"
                >
                  <Redo2 size={15} /> Rétablir
                </button>
              </div>
              <button
                className={`is-compare-toggle ${compare ? "active" : ""}`}
                disabled={noImage}
                aria-pressed={compare}
                onClick={() => setCompare(value => !value)}
              >
                <Columns2 size={15} /> Avant / après
              </button>
            </div>
            <div className="is-canvas-toolbar">
              <span>
                <i />{" "}
                {photo ? "APERÇU EN DIRECT" : "AJOUTE UNE PHOTO POUR COMMENCER"}
              </span>
              <span>
                {currentDimensions
                  ? `${currentDimensions.width} × ${currentDimensions.height} px`
                  : "— × —"}
              </span>
            </div>
            <div
              className={`is-canvas-stage ${tab === "compose" ? "is-composition" : ""} ${noImage ? "is-empty" : ""} ${dragging ? "is-dragging" : ""} ${compare && photo ? "is-comparing" : ""}`}
              onDragOver={event => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={event => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                )
                  setDragging(false);
              }}
              onDrop={event => {
                event.preventDefault();
                setDragging(false);
                void choosePhoto(
                  event.dataTransfer.files[0],
                  tab === "compose" && photo ? "background" : "photo"
                );
              }}
            >
              {noImage ? (
                <div className="is-empty-state">
                  <span>
                    <ImagePlus size={30} />
                  </span>
                  <h3>Le prochain rendu est le tien.</h3>
                  <p>
                    Dépose ta photo ici ou sélectionne un fichier. Les réglages
                    et l’aperçu s’activent aussitôt.
                  </p>
                  <label className="is-empty-cta">
                    Choisir une photo
                    <input
                      aria-label="Choisir une photo pour commencer"
                      type="file"
                      accept="image/*"
                      onChange={event => {
                        void choosePhoto(
                          event.currentTarget.files?.[0],
                          "photo"
                        );
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <small>JPG · PNG · WebP · AVIF</small>
                </div>
              ) : (
                <>
                  {compare && (
                    <div className="is-preview-frame is-original-frame">
                      <span>ORIGINAL</span>
                      <img
                        src={photo.image.src}
                        alt="Photo originale avant retouche"
                      />
                    </div>
                  )}
                  <div className="is-preview-frame">
                    {compare && <span>TON RENDU</span>}
                    <canvas
                      ref={canvasRef}
                      aria-label={
                        tab === "retouch"
                          ? "Aperçu de la photo retouchée"
                          : "Aperçu du détourage et du montage"
                      }
                    />
                  </div>
                </>
              )}
            </div>
            <div
              className={`is-status ${error ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {status ||
                "Les commandes sont prêtes. Ajoute une photo pour créer ton premier rendu."}
            </div>
            {photo && (
              <p className="is-drop-note">
                {tab === "compose"
                  ? "Déposer une image dans l’aperçu remplace le décor. Le sujet se remplace avec « Remplacer la photo »."
                  : "Astuce : active « Avant / après » pour comparer. L’historique conserve les 40 derniers réglages de cette photo."}
              </p>
            )}
            {tab === "compose" && (
              <div className="is-tip">
                <Sparkles size={15} />
                <span>
                  <strong>Pour un montage plus naturel</strong> : choisis un
                  décor avec une lumière proche de celle du portrait, puis
                  ajuste la taille et l’ombre. Les cheveux fins et les mains
                  peuvent rester imparfaits; le studio ne propose pas de pinceau
                  de masque.
                </span>
              </div>
            )}
            <div className="is-use-cases">
              <span>À CRÉER ICI</span>
              <div>
                <strong>Photo de profil</strong>
                <p>Éclaircis le portrait et exporte en JPEG léger.</p>
              </div>
              <div>
                <strong>Visuel pour le groupe</strong>
                <p>Détoure une personne et ajoute ton décor.</p>
              </div>
              <div>
                <strong>Image transparente</strong>
                <p>Exporte la personne sans fond en PNG.</p>
              </div>
            </div>
          </section>
        </div>
      </section>
      <footer className="is-footer">
        <span>KITT FRANCO-BELGE · BY MANIX</span>
        <span>MediaPipe Selfie Segmenter · modèle sous licence Apache 2.0</span>
        <a
          href="https://www.facebook.com/groups/757797724622219/"
          target="_blank"
          rel="noreferrer"
        >
          GROUPE FACEBOOK KITT-FRANCO-BELGE ↗
        </a>
        <a href="/open-source-licenses/mediapipe-APACHE-2.0.txt">
          LICENCE DU MOTEUR
        </a>
        <a href="/models/mediapipe/selfie-segmentation-model-card.pdf">
          FICHE DU MODÈLE
        </a>
      </footer>
    </main>
  );
}
