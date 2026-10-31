import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  ChevronDown,
  Code2,
  Copy,
  FileArchive,
  FileAudio2,
  FileImage,
  FileSearch,
  FileText,
  Film,
  FolderOpen,
  HardDriveUpload,
  Headphones,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Mic,
  MonitorPlay,
  Music2,
  Search,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  History,
  LayoutGrid,
  List,
  Subtitles,
  Wrench,
  X,
} from "lucide-react";
import "./ToolsHub.css";
import "./StudioPromo.css";
import "./ToolsProducts.css";
import { speakSiteAnnouncement } from "../utils/siteSpeech";
import EverydayTools from "../components/EverydayTools";

type Group =
  | "Vidéo"
  | "Audio"
  | "PDF"
  | "Documents"
  | "Images"
  | "Fichiers"
  | "Texte";
type FileTool = {
  id: string;
  group: Group;
  title: string;
  description: string;
  icon: typeof Film;
  accept?: string;
  multiple?: boolean;
  option?: string;
  placeholder?: string;
  textPrompt?: string;
  hint?: string;
};
const TOOLS: FileTool[] = [
  {
    id: "media-convert",
    group: "Vidéo",
    title: "Convertir vidéo / audio",
    description: "Réencode en MP4, WebM, AVI, MPEG, MP3 ou WAV.",
    icon: Film,
    accept: "video/*,audio/*",
    option: "Format de sortie",
    hint: "Conversion locale dans le navigateur avec FFmpeg WebAssembly. Les fichiers ne sont pas envoyés au serveur. Le premier lancement télécharge le moteur de conversion.",
  },
  {
    id: "video-info",
    group: "Vidéo",
    title: "Fiche vidéo",
    description: "Dimensions, durée, type de fichier et taille.",
    icon: Film,
    accept: "video/*",
  },
  {
    id: "video-thumb",
    group: "Vidéo",
    title: "Capture d’image",
    description:
      "Choisissez une image dans une vidéo et enregistrez-la en PNG.",
    icon: ImageIcon,
    accept: "video/*",
  },
  {
    id: "video-trim",
    group: "Vidéo",
    title: "Découper une vidéo",
    description: "Choisissez un début et une fin pour exporter l’extrait WebM.",
    icon: MonitorPlay,
    accept: "video/*",
    option: "Début et fin en secondes (séparez par ;)",
    placeholder: "0;30",
    hint: "Le résultat est un WebM réencodé, pas une copie du codec d’origine. Plage maximale : 2 minutes.",
  },
  {
    id: "video-audio",
    group: "Vidéo",
    title: "Extraire la piste audio",
    description:
      "Enregistrez la piste son locale en WebM lorsque le navigateur le permet.",
    icon: AudioLines,
    accept: "video/*",
    hint: "La piste est réencodée en WebM si la lecture et capture de flux sont prises en charge par le navigateur.",
  },
  {
    id: "video-frames",
    group: "Vidéo",
    title: "Images clés en ZIP",
    description: "Exportez une série de captures à intervalles réguliers.",
    icon: FileArchive,
    accept: "video/*",
    option: "Intervalle en secondes",
    placeholder: "5",
    hint: "Jusqu’à 30 captures PNG, limitées aux vidéos de 1280 × 720.",
  },
  {
    id: "video-contact-sheet",
    group: "Vidéo",
    title: "Planche de scènes",
    description:
      "Assemble jusqu’à 24 captures de la vidéo en une seule image PNG.",
    icon: ImageIcon,
    accept: "video/*",
    option: "Intervalle de capture en secondes",
    placeholder: "5",
    hint: "Le navigateur doit pouvoir lire le codec vidéo. Les images sont assemblées localement; la vidéo n’est pas réencodée.",
  },
  {
    id: "audio-info",
    group: "Audio",
    title: "Fiche audio",
    description: "Durée, fréquence, canaux, type déclaré et poids du fichier.",
    icon: FileAudio2,
    accept: "audio/*",
    hint: "Les codecs lisibles dépendent du navigateur; le débit binaire exact n’est pas estimé.",
  },
  {
    id: "audio-waveform",
    group: "Audio",
    title: "Forme d’onde audio",
    description:
      "Crée une image PNG de la forme d’onde à partir d’un fichier décodable.",
    icon: AudioLines,
    accept: "audio/*",
    hint: "Le décodage est local. Limite conseillée : 100 Mo et 10 minutes d’audio.",
  },
  {
    id: "audio-wav",
    group: "Audio",
    title: "Convertir en WAV",
    description:
      "Convertit un audio lisible en WAV PCM 16 bits, mono ou stéréo.",
    icon: FileAudio2,
    accept: "audio/*",
    hint: "Les codecs source dépendent du navigateur. Pour une source multicanale, seuls les deux premiers canaux sont conservés.",
  },
  {
    id: "audio-trim",
    group: "Audio",
    title: "Découper un son",
    description: "Extrait une plage et l’enregistre en WAV PCM.",
    icon: Music2,
    accept: "audio/*",
    option: "Début et fin en secondes (séparez par ;)",
    placeholder: "0;15",
    hint: "Pour une décimale en français, écrivez 1,5;3,25. Le résultat est en WAV PCM.",
  },
  {
    id: "audio-normalize",
    group: "Audio",
    title: "Normaliser le volume",
    description: "Ajuste les crêtes au niveau choisi et crée une copie WAV PCM.",
    icon: AudioLines,
    accept: "audio/*",
    hint: "Cette normalisation de crête n’égalise pas la perception sonore entre les morceaux.",
  },
  {
    id: "audio-join",
    group: "Audio",
    title: "Assembler des sons",
    description:
      "Assemble plusieurs audios décodables dans l’ordre choisi et exporte un WAV PCM.",
    icon: Headphones,
    accept: "audio/*",
    multiple: true,
  },
  {
    id: "audio-record",
    group: "Audio",
    title: "Enregistreur vocal",
    description:
      "Enregistre le microphone en WebM, avec votre autorisation explicite.",
    icon: Mic,
  },
  {
    id: "pdf-merge",
    group: "PDF",
    title: "Fusionner des PDF",
    description:
      "Assemble les pages de plusieurs PDF dans l’ordre de sélection.",
    icon: FileText,
    accept: "application/pdf",
    multiple: true,
  },
  {
    id: "pdf-split",
    group: "PDF",
    title: "Séparer les pages",
    description: "Crée un PDF par page, regroupé dans une archive ZIP.",
    icon: FileArchive,
    accept: "application/pdf",
  },
  {
    id: "pdf-reorder",
    group: "PDF",
    title: "Réordonner les pages",
    description:
      "Copiez le numéro des pages dans l’ordre voulu, par exemple 3,1,2.",
    icon: FileSearch,
    accept: "application/pdf",
    option: "Nouvel ordre des pages",
    placeholder: "3,1,2",
  },
  {
    id: "pdf-remove",
    group: "PDF",
    title: "Supprimer des pages",
    description: "Retire les pages indiquées en conservant les autres.",
    icon: FileText,
    accept: "application/pdf",
    option: "Pages à retirer",
    placeholder: "2,4-6",
  },
  {
    id: "pdf-rotate",
    group: "PDF",
    title: "Tourner les pages",
    description: "Applique une rotation permanente par pas de 90 degrés.",
    icon: ChevronDown,
    accept: "application/pdf",
    option: "Rotation en degrés",
    placeholder: "90",
  },
  {
    id: "pdf-page-numbers",
    group: "PDF",
    title: "Numéroter les pages",
    description:
      "Ajoute un numéro discret en bas de chaque page, à partir du nombre choisi.",
    icon: FileText,
    accept: "application/pdf",
    option: "Premier numéro",
    placeholder: "1",
  },
  {
    id: "pdf-watermark",
    group: "PDF",
    title: "Filigrane texte",
    description: "Ajoute un texte en diagonale sur les pages d’un PDF.",
    icon: BadgeCheck,
    accept: "application/pdf",
    option: "Opacité (0,05 à 0,4)",
    placeholder: "0,18",
    textPrompt: "Texte du filigrane",
    hint: "Le filigrane est intégré dans une nouvelle copie; l’original n’est pas modifié.",
  },
  {
    id: "pdf-compress",
    group: "PDF",
    title: "Réécrire la structure PDF",
    description:
      "Réorganise la structure du document sans perte. Les images ne sont pas recompressées.",
    icon: FileArchive,
    accept: "application/pdf",
    hint: "La taille finale peut rester identique, voire augmenter selon le fichier.",
  },
  {
    id: "pdf-text",
    group: "PDF",
    title: "PDF vers texte",
    description:
      "Extrait le texte accessible des pages PDF, dans l’ordre de lecture fourni.",
    icon: FileText,
    accept: "application/pdf",
    hint: "Pas d’OCR : un PDF scanné sans couche texte donnera peu ou pas de résultat.",
  },
  {
    id: "image-pdf",
    group: "PDF",
    title: "Images vers PDF",
    description: "Place une ou plusieurs images JPG ou PNG dans un PDF A4.",
    icon: FileImage,
    accept: "image/png,image/jpeg",
    multiple: true,
  },
  {
    id: "text-pdf",
    group: "Documents",
    title: "Texte vers PDF",
    description:
      "Crée un PDF A4 à partir du texte collé, accents français compris.",
    icon: FileText,
  },
  {
    id: "text-docx",
    group: "Documents",
    title: "Texte vers Word",
    description:
      "Crée un document DOCX à partir d’un texte ou d’un fichier TXT.",
    icon: FileText,
    accept: "text/plain,.txt",
  },
  {
    id: "docx-text",
    group: "Documents",
    title: "Word vers texte",
    description: "Extrait les paragraphes d’un DOCX sans envoyer le document.",
    icon: FileSearch,
    accept:
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "docx-pdf",
    group: "Documents",
    title: "Word vers PDF",
    description:
      "Convertit le texte d’un DOCX en PDF. La mise en page complexe est simplifiée.",
    icon: FileText,
    accept:
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    hint: "Les images, tableaux, colonnes et styles avancés du document Word ne sont pas conservés.",
  },
  {
    id: "image-convert",
    group: "Images",
    title: "Convertir une image",
    description:
      "Convertit en PNG, JPEG ou WebP avec aperçu de la taille résultante.",
    icon: ImageIcon,
    accept: "image/*",
    option: "Format de sortie",
    placeholder: "WebP",
    hint: "Le réencodage supprime les métadonnées d’origine. JPEG ne conserve pas la transparence.",
  },
  {
    id: "image-resize",
    group: "Images",
    title: "Redimensionner des images",
    description: "Réduit les dimensions et crée des copies JPEG optimisées.",
    icon: FileImage,
    accept: "image/*",
    multiple: true,
    option: "Largeur maximale en pixels",
    placeholder: "1600",
    hint: "La sortie JPEG ne conserve pas la transparence; l’image est réencodée dans le navigateur.",
  },
  {
    id: "image-contact-sheet",
    group: "Images",
    title: "Planche contact",
    description:
      "Compose une mosaïque PNG et choisissez si les noms de fichiers apparaissent.",
    icon: ImageIcon,
    accept: "image/*",
    multiple: true,
    option: "Nombre de colonnes (1 à 6)",
    placeholder: "3",
    hint: "Les noms sont imprimés sous les images par défaut. Vous pouvez les numéroter ou les masquer avant de créer la planche.",
  },
  {
    id: "zip-create",
    group: "Fichiers",
    title: "Créer une archive ZIP",
    description:
      "Compresse plusieurs fichiers en une seule archive à télécharger.",
    icon: FileArchive,
    multiple: true,
  },
  {
    id: "zip-extract",
    group: "Fichiers",
    title: "Ouvrir une archive ZIP",
    description:
      "Prépare des fichiers individuels. Les chemins dangereux sont refusés.",
    icon: FolderOpen,
    accept: ".zip,application/zip",
  },
  {
    id: "sha256",
    group: "Fichiers",
    title: "Empreinte SHA-256",
    description:
      "Calcule l’empreinte d’un fichier pour vérifier qu’il n’a pas changé.",
    icon: ShieldCheck,
  },
  {
    id: "base64",
    group: "Fichiers",
    title: "Encodeur Base64",
    description: "Encode du texte ou décode une chaîne Base64 UTF-8.",
    icon: Code2,
  },
  {
    id: "clean-text",
    group: "Texte",
    title: "Nettoyer un texte",
    description:
      "Retire les lignes vides, supprime les doublons et normalise les espaces.",
    icon: Sparkles,
  },
  {
    id: "compare-text",
    group: "Texte",
    title: "Comparer deux textes",
    description:
      "Affiche les lignes propres à chaque version et un résumé des différences.",
    icon: FileSearch,
    option: "Second texte à comparer",
    placeholder: "Collez la seconde version ici…",
  },
  {
    id: "csv-json",
    group: "Texte",
    title: "CSV vers JSON",
    description:
      "Convertit un CSV avec en-têtes; détecte la virgule, le point-virgule ou la tabulation.",
    icon: Code2,
    accept: ".csv,text/csv",
  },
  {
    id: "json-csv",
    group: "Texte",
    title: "JSON vers CSV",
    description:
      "Convertit un tableau d’objets en CSV, avec les guillemets correctement échappés.",
    icon: Code2,
    accept: ".json,application/json",
  },
  {
    id: "srt",
    group: "Vidéo",
    title: "Créer des sous-titres SRT",
    description:
      "Transforme des paragraphes en séquences SRT à durée réglable.",
    icon: Subtitles,
    option: "Secondes par sous-titre",
    placeholder: "3",
  },
  {
    id: "srt-vtt",
    group: "Vidéo",
    title: "Convertir SRT / WebVTT",
    description:
      "Convertit les horodatages et blocs de sous-titres entre SRT et WebVTT.",
    icon: Subtitles,
    accept: ".srt,.vtt,text/plain,text/vtt",
    hint: "Les horodatages classiques sont pris en charge; le style avancé et les animations de sous-titres ne sont pas convertis.",
  },
  {
    id: "text-stats",
    group: "Texte",
    title: "Compter mots et caractères",
    description: "Compte mots, caractères, lignes et temps de lecture estimé.",
    icon: FileText,
  },
];
const GROUPS: Array<Group | "Tout"> = [
  "Tout",
  "Vidéo",
  "Audio",
  "PDF",
  "Documents",
  "Images",
  "Fichiers",
  "Texte",
];
const FEATURED_IDS = [
  "video-contact-sheet",
  "audio-waveform",
  "pdf-watermark",
  "image-contact-sheet",
  "text-pdf",
];
const TEXT_INPUT_IDS = new Set([
  "clean-text",
  "compare-text",
  "text-pdf",
  "text-docx",
  "base64",
  "csv-json",
  "json-csv",
  "srt",
  "srt-vtt",
  "text-stats",
  "pdf-watermark",
]);
type Output = { name: string; blob: Blob; note?: string };
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(2)} Mo`;
}
function ResultText({ result }: { result: Output }) {
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const isText = /^(text\/|application\/json)/.test(result.blob.type);
  useEffect(() => {
    let mounted = true;
    setCopied(false);
    if (isText) void result.blob.text().then(text => { if (mounted) setValue(text.replace(/^\uFEFF/, "")); });
    return () => { mounted = false; };
  }, [result, isText]);
  if (!isText) return null;
  return (
    <div className="result-text-block">
      <div><span>Aperçu du contenu{value.length > 6000 ? " · 6 000 premiers caractères" : ""}</span><button type="button" onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => setCopied(false));
      }} disabled={!value || !navigator.clipboard} title="Copier le contenu complet"><Copy size={13} /> {copied ? "Copié" : "Copier"}</button></div>
      <pre tabIndex={0}>{value.slice(0, 6000)}</pre>
    </div>
  );
}
const MAX_FILE = 512 * 1024 * 1024;
const MAX_AUDIO_FILE = 100 * 1024 * 1024;
const MAX_PDF_FILE = 150 * 1024 * 1024;
const safeName = (name: string) =>
  name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120) || "fichier";
const stem = (name: string) => name.replace(/\.[^.]+$/i, "") || "fichier";
const textBlob = (text: string, type = "text/plain;charset=utf-8") =>
  new Blob(["\uFEFF", text], { type });
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function acceptsFile(file: File, accept: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase(),
    type = file.type.toLowerCase();
  return accept
    .split(",")
    .map(value => value.trim().toLowerCase())
    .some(rule =>
      rule.startsWith(".")
        ? name.endsWith(rule)
        : rule.endsWith("/*")
          ? type.startsWith(rule.slice(0, -1))
          : type === rule ||
            (rule === "application/pdf" && name.endsWith(".pdf"))
    );
}
function detectCsvDelimiter(source: string) {
  const candidates = [",", ";", "\t"],
    lines = source.split(/\r?\n/).filter(Boolean).slice(0, 10);
  let best = ",",
    bestScore = -1;
  for (const delimiter of candidates) {
    let score = 0;
    for (const line of lines) {
      let quoted = false,
        count = 0;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"' && line[i + 1] === '"' && quoted) {
          i++;
          continue;
        }
        if (line[i] === '"') quoted = !quoted;
        else if (line[i] === delimiter && !quoted) count++;
      }
      score += count > 0 ? count + 1 : 0;
    }
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}
function csvRows(source: string, delimiter = detectCsvDelimiter(source)) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV invalide : un guillemet n’est pas fermé.");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
function toCsv(rows: unknown[][]) {
  return rows
    .map(row =>
      row
        .map(value => {
          const s = String(value ?? "");
          return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(",")
    )
    .join("\r\n");
}
async function readZip(bytes: Uint8Array) {
  const { unzipSync } = await import("fflate");
  let total = 0,
    count = 0;
  const e = unzipSync(bytes, {
    filter: info => {
      if (info.name.endsWith("/")) return false;
      if (++count > 200)
        throw new Error("Archive refusée : plus de 200 fichiers.");
      if (
        info.originalSize > 50 * 1024 * 1024 ||
        (total += info.originalSize) > 50 * 1024 * 1024
      )
        throw new Error(
          "Cette archive dépasse la limite de décompression de 50 Mo."
        );
      if (info.compression !== 0 && info.compression !== 8)
        throw new Error(
          "Cette archive utilise une compression non prise en charge."
        );
      return true;
    },
  });
  const entries: Array<{ name: string; data: Uint8Array }> = [],
    names = new Map<string, number>();
  for (const [path, data] of Object.entries(e)) {
    if (path.endsWith("/")) continue;
    const base = safeName(
        path.split(/[\\/]/).filter(Boolean).pop() || "fichier"
      ),
      ext = /\.[^.]+$/.exec(base)?.[0] || "",
      stemName = ext ? base.slice(0, -ext.length) : base,
      n = (names.get(base) || 0) + 1;
    names.set(base, n);
    entries.push({ name: n === 1 ? base : `${stemName}-${n}${ext}`, data });
  }
  return entries;
}
function parseRange(value: string, total: number) {
  const pages = new Set<number>();
  for (const part of value
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error("Indiquez des pages comme 1,3-5.");
    const start = Number(m[1]),
      end = Number(m[2] || m[1]);
    if (start < 1 || end < start || end > total)
      throw new Error("Numéro de page hors limites.");
    for (let p = start; p <= end; p++) pages.add(p - 1);
  }
  if (!pages.size) throw new Error("Indiquez au moins une page.");
  return Array.from(pages);
}
async function wavBlob(
  buffer: AudioBuffer,
  start = 0,
  end = buffer.duration,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void
) {
  const from = Math.max(0, Math.floor(start * buffer.sampleRate)),
    to = Math.min(buffer.length, Math.floor(end * buffer.sampleRate));
  if (to <= from) throw new Error("La plage audio est vide.");
  const channels = Math.min(2, buffer.numberOfChannels),
    length = to - from,
    bytes = new ArrayBuffer(44 + length * channels * 2),
    view = new DataView(bytes);
  const put = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  put(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, length * channels * 2, true);
  let offset = 44;
  const blockSize = 65536;
  for (let blockStart = from; blockStart < to; blockStart += blockSize) {
    if (signal?.aborted) throw new DOMException("Traitement annulé.", "AbortError");
    const blockEnd = Math.min(to, blockStart + blockSize);
    for (let i = blockStart; i < blockEnd; i++) {
      for (let c = 0; c < channels; c++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
        view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
        offset += 2;
      }
    }
    onProgress?.(Math.round(((blockEnd - from) / length) * 100));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Blob([bytes], { type: "audio/wav" });
}
async function decodeAudio(file: File) {
  const Ctx =
    window.AudioContext ||
    ((window as any).webkitAudioContext as typeof AudioContext);
  if (!Ctx) throw new Error("Ce navigateur ne sait pas décoder l’audio.");
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    await ctx.close();
  }
}
async function makePdfText(text: string) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48,
    size = 11,
    line = 16;
  let page = doc.addPage([595.28, 841.89]),
    y = page.getHeight() - margin;
  const paragraphs = text.replace(/\r/g, "").split("\n");
  for (const raw of paragraphs) {
    let value = raw || " ";
    try {
      font.encodeText(value);
    } catch {
      value = Array.from(value)
        .map(ch => {
          try {
            font.encodeText(ch);
            return ch;
          } catch {
            return "?";
          }
        })
        .join("");
    }
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (
        font.widthOfTextAtSize(candidate, size) <=
        page.getWidth() - margin * 2
      )
        current = candidate;
      else {
        if (y < margin) {
          page = doc.addPage([595.28, 841.89]);
          y = page.getHeight() - margin;
        }
        page.drawText(current || word, { x: margin, y, size, font });
        y -= line;
        current = current ? word : "";
      }
    }
    if (y < margin) {
      page = doc.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
    }
    if (current)
      page.drawText(current, {
        x: margin,
        y,
        size,
        font:
          current.length < 64 && /^([A-ZÉÈÀÙÇ0-9 ]+)$/.test(current)
            ? bold
            : font,
      });
    y -= line;
  }
  return await doc.save({ useObjectStreams: true });
}
async function extractDocx(bytes: Uint8Array) {
  const { strFromU8, unzipSync } = await import("fflate");
  const files = unzipSync(bytes),
    xml = files["word/document.xml"];
  if (!xml)
    throw new Error("Le fichier ne semble pas contenir un document Word.");
  const doc = new DOMParser().parseFromString(
    strFromU8(xml),
    "application/xml"
  );
  if (doc.querySelector("parsererror"))
    throw new Error("Le document Word est invalide.");
  return Array.from(doc.getElementsByTagName("w:p"))
    .map(p =>
      Array.from(p.getElementsByTagName("w:t"))
        .map(n => n.textContent || "")
        .join("")
    )
    .join("\n");
}
function mediaRecorderType(candidates: string[]) {
  return (
    candidates.find(
      x =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x)
    ) || ""
  );
}
async function recordMp4InBrowser(
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number | null, current: number, duration: number) => void
) {
  const mimeType = mediaRecorderType([
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
  ]);
  if (!mimeType)
    throw new Error("L’encodage MP4 natif n’est pas disponible dans ce navigateur.");
  const video = document.createElement("video"),
    sourceUrl = URL.createObjectURL(file);
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  video.src = sourceUrl;
  let sourceStream: MediaStream | null = null,
    outputStream: MediaStream | null = null,
    recorder: MediaRecorder | null = null,
    progressTimer = 0;
  let abortHandler: (() => void) | null = null;
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => reject(new DOMException("Traitement annulé.", "AbortError"));
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  const wait = <T,>(promise: Promise<T>) => Promise.race([promise, abortPromise]);
  try {
    await wait(once(video, "loadedmetadata"));
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("Cette vidéo n’a pas de dimensions lisibles.");
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      onProgress(null, 0, 0);
      await wait(Promise.race([
        seekVideo(video, 1_000_000_000),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Durée de la vidéo introuvable.")), 10000)),
      ]));
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Le navigateur ne peut pas déterminer la durée de cette vidéo.");
    await wait(seekVideo(video, 0));

    const capturedStream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    sourceStream = capturedStream;
    const videoTrack = capturedStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error("La capture vidéo n’est pas prise en charge.");
    outputStream = capturedStream;
    recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: video.videoWidth <= 854 ? 2_000_000 : video.videoWidth <= 1280 ? 4_000_000 : 7_000_000,
      audioBitsPerSecond: 160_000,
    });
    const chunks: BlobPart[] = [];
    const recording = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder!.onerror = () => reject(new Error("Le navigateur a interrompu la création du MP4."));
      recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || "video/mp4" }));
    });
    void recording.catch(() => {});
    let playbackFinished!: Promise<void>;
    playbackFinished = new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener("ended", ended);
        video.removeEventListener("error", failed);
        signal.removeEventListener("abort", cancelled);
      };
      const ended = () => { cleanup(); resolve(); },
        failed = () => { cleanup(); reject(new Error("La lecture de la vidéo a échoué.")); },
        cancelled = () => { cleanup(); reject(new DOMException("Traitement annulé.", "AbortError")); };
      video.addEventListener("ended", ended, { once: true });
      video.addEventListener("error", failed, { once: true });
      signal.addEventListener("abort", cancelled, { once: true });
    });
    const report = () => {
      const current = Math.max(0, video.currentTime),
        percent = Math.min(99, Math.round((current / duration) * 100));
      onProgress(percent, current, duration);
    };
    recorder.start(500);
    progressTimer = window.setInterval(report, 250);
    await wait(video.play());
    await wait(playbackFinished);
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await wait(recording);
    if (signal.aborted) throw new DOMException("Traitement annulé.", "AbortError");
    if (!blob.size) throw new Error("Le navigateur a créé un MP4 vide.");
    onProgress(100, duration, duration);
    return blob;
  } finally {
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    if (progressTimer) window.clearInterval(progressTimer);
    video.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    [...(sourceStream?.getTracks() || []), ...(outputStream?.getTracks() || [])]
      .forEach(track => track.stop());
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}
function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.03) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
        cleanup();
        resolve();
      },
      failed = () => {
        cleanup();
        reject(new Error("Impossible de lire cette image de la vidéo."));
      },
      cleanup = () => {
        video.removeEventListener("seeked", done);
        video.removeEventListener("error", failed);
      };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });
}
function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      blob =>
        blob
          ? resolve(blob)
          : reject(
              new Error("Impossible de créer l’image dans ce navigateur.")
            ),
      "image/png"
    )
  );
}
async function makeImageContactSheet(
  files: File[],
  rawColumns: number,
  labelMode: "filename" | "number" | "hidden",
  checkpoint?: () => Promise<void>,
  onProgress?: (completed: number, total: number) => void
) {
  if (!files.length) throw new Error("Choisissez au moins une image.");
  if (files.length > 40)
    throw new Error("Limite de 40 images par planche contact.");
  const columns = Math.max(1, Math.min(6, Math.round(rawColumns) || 3)),
    cellWidth = 320,
    cellHeight = 236,
    labelHeight = labelMode === "hidden" ? 0 : 42,
    gap = 12,
    outer = 18;
  const rows = Math.ceil(files.length / columns),
    canvas = document.createElement("canvas");
  canvas.width = outer * 2 + columns * cellWidth + (columns - 1) * gap;
  canvas.height = outer * 2 + rows * cellHeight + (rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.fillStyle = "#080d15";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "700 18px Consolas, monospace";
  ctx.fillStyle = "#ff7382";
  ctx.fillText("KITT // PLANCHE CONTACT", outer, outer + 18);
  for (let index = 0; index < files.length; index++) {
    await checkpoint?.();
    const image = await createImageBitmap(files[index]),
      column = index % columns,
      row = Math.floor(index / columns),
      x = outer + column * (cellWidth + gap),
      y = outer + 36 + row * (cellHeight + gap),
      previewHeight = cellHeight - labelHeight;
    ctx.fillStyle = "#111a27";
    ctx.fillRect(x, y, cellWidth, cellHeight);
    ctx.strokeStyle = "#34445a";
    ctx.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
    const scale = Math.min(
        (cellWidth - 18) / image.width,
        (previewHeight - 12) / image.height
      ),
      width = image.width * scale,
      height = image.height * scale;
    ctx.drawImage(
      image,
      x + (cellWidth - width) / 2,
      y + 6 + (previewHeight - height) / 2,
      width,
      height
    );
    image.close();
    if (labelMode !== "hidden") {
      ctx.fillStyle = "#e9eff8";
      ctx.font = "12px Segoe UI, sans-serif";
      const name =
        labelMode === "number"
          ? `IMAGE ${String(index + 1).padStart(2, "0")}`
          : files[index].name.length > 42
            ? `${files[index].name.slice(0, 39)}…`
            : files[index].name;
      ctx.fillText(name, x + 9, y + cellHeight - 12, cellWidth - 18);
    }
    onProgress?.(index + 1, files.length);
  }
  return canvasPng(canvas);
}
async function makeWaveform(
  buffer: AudioBuffer,
  checkpoint?: () => Promise<void>,
  onProgress?: (completed: number, total: number) => void
) {
  if (buffer.duration > 600)
    throw new Error("Limite de 10 minutes pour produire une forme d’onde.");
  const width = 1800,
    bandHeight = 260,
    top = 78,
    gap = 34,
    channels = Math.min(2, buffer.numberOfChannels),
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = top * 2 + channels * bandHeight + (channels - 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.fillStyle = "#080d15";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ff7382";
  ctx.font = "700 24px Consolas, monospace";
  ctx.fillText("KITT // FORME D’ONDE", 34, 42);
  ctx.fillStyle = "#95a5bb";
  ctx.font = "14px Consolas, monospace";
  ctx.fillText(
    `${formatTime(buffer.duration)} · ${buffer.sampleRate.toLocaleString("fr-FR")} Hz · ${channels} canal${channels > 1 ? "x" : ""}`,
    width - 380,
    42
  );
  for (let channel = 0; channel < channels; channel++) {
    const y = top + channel * (bandHeight + gap),
      center = y + bandHeight / 2,
      amplitude = bandHeight * 0.42,
      data = buffer.getChannelData(channel);
    ctx.fillStyle = "#101a27";
    ctx.fillRect(24, y, width - 48, bandHeight);
    ctx.strokeStyle = "#34445a";
    ctx.strokeRect(24.5, y + 0.5, width - 49, bandHeight - 1);
    ctx.strokeStyle = "#233247";
    ctx.beginPath();
    ctx.moveTo(25, center);
    ctx.lineTo(width - 25, center);
    ctx.stroke();
    ctx.strokeStyle = channel === 0 ? "#ff4058" : "#6ee7ff";
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    const columns = width - 50;
    for (let x = 0; x < columns; x++) {
      if (x % 64 === 0) await checkpoint?.();
      const start = Math.floor((x * data.length) / (width - 50)),
        end = Math.max(
          start + 1,
          Math.floor(((x + 1) * data.length) / (width - 50))
        ),
        stride = Math.max(1, Math.floor((end - start) / 80));
      let min = 1,
        max = -1;
      for (let sample = start; sample < end; sample += stride) {
        const value = data[sample];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      ctx.moveTo(x + 25, center - max * amplitude);
      ctx.lineTo(x + 25, center - min * amplitude);
      if (x % 64 === 0) onProgress?.(channel * columns + x, channels * columns);
    }
    onProgress?.((channel + 1) * columns, channels * columns);
    ctx.stroke();
    ctx.fillStyle = "#c9d4e3";
    ctx.font = "12px Consolas, monospace";
    ctx.fillText(
      channels === 1 ? "MONO" : channel === 0 ? "GAUCHE" : "DROITE",
      36,
      y + 20
    );
  }
  return canvasPng(canvas);
}
function convertSubtitle(source: string, direction: string) {
  const normalized = source
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
  if (!normalized) throw new Error("Collez ou chargez un fichier SRT/WebVTT.");
  const body = normalized.replace(/^WEBVTT[^\n]*\n+/i, "");
  const cues = body
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(block => block && !/^NOTE(?:\s|$)/.test(block))
    .map(block => {
      const lines = block.split("\n"),
        timeIndex = lines.findIndex(line => line.includes("-->"));
      if (timeIndex < 0)
        throw new Error("Bloc de sous-titres sans horodatage reconnu.");
      const match = lines[timeIndex].match(
        /((?:\d{2}:)?\d{2}:\d{2})[,.](\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2})[,.](\d{3})(?:\s+.*)?$/
      );
      if (!match)
        throw new Error(
          "Horodatage non reconnu : utilisez HH:MM:SS,mmm ou HH:MM:SS.mmm."
        );
      const time = (value: string, millis: string) =>
        `${value.includes(":") && value.split(":").length === 2 ? "00:" : ""}${value}.${millis}`;
      return {
        start: time(match[1], match[2]),
        end: time(match[3], match[4]),
        text: lines
          .slice(timeIndex + 1)
          .join("\n")
          .trim(),
      };
    });
  if (!cues.length) throw new Error("Aucun sous-titre valide trouvé.");
  if (direction === "vtt")
    return `WEBVTT\n\n${cues.map(cue => `${cue.start} --> ${cue.end}\n${cue.text}`).join("\n\n")}\n`;
  return `${cues.map((cue, index) => `${index + 1}\n${cue.start.replace(".", ",")} --> ${cue.end.replace(".", ",")}\n${cue.text}`).join("\n\n")}\n`;
}

export default function ToolsHub() {
  const [category, setCategory] = useState<Group | "Tout">("Tout"),
    [search, setSearch] = useState(""),
    [toolView, setToolView] = useState<"all" | "favorites" | "recent">("all"),
    [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
      try { const saved = JSON.parse(localStorage.getItem("kitt-tool-favorites-v1") || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
    }),
    [recentIds, setRecentIds] = useState<string[]>(() => {
      try { const saved = JSON.parse(localStorage.getItem("kitt-tool-recent-v1") || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
    }),
    [catalogNotice, setCatalogNotice] = useState(""),
    [selected, setSelected] = useState<FileTool | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [text, setText] = useState(""),
    [option, setOption] = useState(""),
    [contactSheetLabelMode, setContactSheetLabelMode] = useState<
      "filename" | "number" | "hidden"
    >("filename"),
    [quality, setQuality] = useState(88),
    [videoSize, setVideoSize] = useState<"720" | "480" | "source">("source"),
    [normalizeTarget, setNormalizeTarget] = useState(95),
    [filenameTemplate, setFilenameTemplate] = useState(() => {
      try { return localStorage.getItem("kitt-tool-filename-template-v1") || "{nom}-{outil}"; } catch { return "{nom}-{outil}"; }
    }),
    [outputs, setOutputs] = useState<Output[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [toolProgress, setToolProgress] = useState<number | null>(null),
    [recording, setRecording] = useState(false),
    [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]),
    [selectedMicrophone, setSelectedMicrophone] = useState(""),
    [playbackRate, setPlaybackRate] = useState(1),
    [mediaMeta, setMediaMeta] = useState(""),
    [dragging, setDragging] = useState(false),
    [catalogLimit, setCatalogLimit] = useState(12),
    [catalogLayout, setCatalogLayout] = useState<"cards" | "list">("cards");
  const input = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<BlobPart[]>([]),
    stream = useRef<MediaStream | null>(null),
    video = useRef<HTMLVideoElement>(null),
    workbench = useRef<HTMLElement>(null),
    job = useRef<AbortController | null>(null),
    cancelActive = useRef<(() => void) | null>(null);
  const locked = busy || recording;
  const available = useMemo(
    () =>
      TOOLS.filter(
        t =>
          (toolView === "all" || (toolView === "favorites" ? favoriteIds.includes(t.id) : recentIds.includes(t.id))) &&
          (category === "Tout" || t.group === category) &&
          (!search ||
            normalizeSearch(
              `${t.title} ${t.description} ${t.group} ${t.id}`
            ).includes(normalizeSearch(search.trim())))
      ).sort((left, right) => toolView === "recent" ? recentIds.indexOf(left.id) - recentIds.indexOf(right.id) : 0),
    [category, search, toolView, favoriteIds, recentIds]
  );
  const preview = useMemo(
    () =>
      files[0] &&
      (files[0].type.startsWith("video/") || files[0].type.startsWith("audio/"))
        ? URL.createObjectURL(files[0])
        : "",
    [files]
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  useEffect(
    () => () => {
      job.current?.abort();
      cancelActive.current?.();
      stream.current?.getTracks().forEach(t => t.stop());
      recorder.current?.state !== "inactive" && recorder.current?.stop();
    },
    []
  );
  useEffect(() => setCatalogLimit(12), [category, search, toolView]);
  useEffect(() => {
    const syncSavedTools = (event: StorageEvent) => {
      if (event.key && event.key !== "kitt-tool-favorites-v1" && event.key !== "kitt-tool-recent-v1") return;
      const readIds = (key: string) => {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(value)
            ? value.filter((id): id is string => typeof id === "string" && TOOLS.some(tool => tool.id === id))
            : [];
        } catch { return []; }
      };
      setFavoriteIds(readIds("kitt-tool-favorites-v1"));
      setRecentIds(readIds("kitt-tool-recent-v1"));
    };
    window.addEventListener("storage", syncSavedTools);
    return () => window.removeEventListener("storage", syncSavedTools);
  }, []);
  useEffect(() => {
    if (selected?.id !== "audio-record" || !navigator.mediaDevices?.enumerateDevices) return;
    let active = true;
    const refreshMicrophones = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(device => device.kind === "audioinput");
        if (active) {
          setMicrophones(inputs);
          setSelectedMicrophone(current => current && !inputs.some(device => device.deviceId === current) ? "" : current);
        }
      } catch {
        if (active) setMicrophones([]);
      }
    };
    void refreshMicrophones();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshMicrophones);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.("devicechange", refreshMicrophones);
    };
  }, [selected?.id]);
  function openTool(tool: FileTool) {
    setSelected(tool);
    setFiles([]);
    setText("");
    setContactSheetLabelMode("filename");
    setOption(
      (
        {
          "pdf-rotate": "90",
          "pdf-page-numbers": "1",
          "pdf-watermark": "0.18",
          "image-convert": "WebP",
          "image-resize": "1600",
          "image-contact-sheet": "3",
          "video-frames": "5",
          "video-contact-sheet": "5",
          srt: "3",
          "srt-vtt": "srt",
        } as Record<string, string>
      )[tool.id] || ""
    );
    setQuality(88);
    setVideoSize("source");
    setNormalizeTarget(95);
    setOutputs([]);
    setStatus("");
    setDragging(false);
    setMediaMeta("");
    setPlaybackRate(1);
  }
  function selectFiles(incoming: FileList | File[]) {
    if (!selected || locked) return;
    const list = Array.from(incoming);
    const rejected = list.filter(
      file => !acceptsFile(file, selected.accept || "")
    );
    if (rejected.length) {
      setStatus(
        `Format non accepté : ${rejected.map(file => file.name).join(", ")}. Formats admis : ${selected.accept || "tous"}.`
      );
      return;
    }
    const combined = selected.multiple ? [...files, ...list] : list.slice(0, 1);
    const chosen = combined.filter((file, index) => combined.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index);
    setFiles(chosen);
    setOutputs([]);
    setStatus(
      chosen.length
        ? `${chosen.length} fichier(s) prêt(s) localement${!selected.multiple && list.length > 1 ? " · un seul fichier requis" : ""}.`
        : ""
    );
    setMediaMeta("");
  }
  function moveFile(index: number, direction: -1 | 1) {
    if (locked) return;
    const next = [...files];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setFiles(next);
    setOutputs([]);
    setStatus("Ordre mis à jour. L’export suivra cette liste de haut en bas.");
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = safeName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function downloadOutputBundle() {
    if (outputs.length < 2) return;
    try {
      const { zipSync } = await import("fflate");
      const entries = Object.fromEntries(await Promise.all(outputs.map(async (output, index) => [
        `${String(index + 1).padStart(2, "0")}-${safeName(output.name)}`,
        new Uint8Array(await output.blob.arrayBuffer()),
      ]))) as Record<string, Uint8Array>;
      download(new Blob([zipSync(entries, { level: 5 }) as Uint8Array], { type: "application/zip" }), "atelier-kitt-resultats.zip");
      setStatus("Archive ZIP prête au téléchargement.");
    } catch {
      setStatus("Impossible de créer l’archive ZIP dans ce navigateur.");
    }
  }
  const downloads = useMemo(
    () =>
      outputs.map(o => ({
        name: o.name,
        url: URL.createObjectURL(o.blob),
        note: o.note,
      })),
    [outputs]
  );
  useEffect(
    () => () => downloads.forEach(o => URL.revokeObjectURL(o.url)),
    [downloads]
  );
  async function processTool() {
    if (!selected || locked) return;
    const controller = new AbortController();
    job.current = controller;
    const checkpoint = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (controller.signal.aborted) throw new DOMException("Traitement annulé.", "AbortError");
    };
    const reportProgress = (completed: number, total: number) => {
      if (total > 0) setToolProgress(Math.min(99, Math.round((completed / total) * 100)));
    };
    const hasStepProgress = [
      "pdf-merge", "pdf-split", "pdf-page-numbers", "pdf-watermark", "pdf-rotate", "pdf-text",
      "image-pdf", "image-contact-sheet", "image-convert", "image-resize", "zip-create",
      "audio-waveform", "audio-wav", "audio-trim", "audio-normalize", "audio-join",
      "video-frames", "video-contact-sheet",
    ].includes(selected.id);
    setBusy(true);
    setToolProgress(hasStepProgress ? 0 : null);
    setStatus("Préparation de vos fichiers sur cet appareil…");
    setOutputs([]);
    try {
      if (selected.id === "audio-record") {
        await startRecording();
        return;
      }
      if (files.some(f => f.size > MAX_FILE))
        throw new Error("Limite de 512 Mo par fichier local.");
      if (
        selected.group === "Audio" &&
        files.some(f => f.size > MAX_AUDIO_FILE)
      )
        throw new Error(
          "Limite audio de 100 Mo par fichier pour éviter de saturer la mémoire du navigateur."
        );
      if (
        selected.group === "PDF" &&
        selected.id !== "image-pdf" &&
        files.some(f => f.size > MAX_PDF_FILE)
      )
        throw new Error("Limite PDF de 150 Mo par fichier dans le navigateur.");
      let created: Output[] = [];
      const file = files[0],
        readText = async () => (file ? await file.text() : text);
      switch (selected.id) {
        case "clean-text": {
          const src = await readText(),
            seen = new Set<string>(),
            clean = src
              .replace(/\r/g, "")
              .split("\n")
              .map(x => x.trim().replace(/[\t ]+/g, " "))
              .filter(x => {
                if (!x) return false;
                if (seen.has(x)) return false;
                seen.add(x);
                return true;
              })
              .join("\n");
          created = [{ name: "texte-nettoye.txt", blob: textBlob(clean) }];

          break;
        }
        case "compare-text": {
          const a = await readText(),
            b = option,
            sa = new Set(a.split(/\r?\n/)),
            sb = new Set(b.split(/\r?\n/)),
            left = Array.from(sa).filter(x => x && !sb.has(x)),
            right = Array.from(sb).filter(x => x && !sa.has(x)),
            report = [
              "LIGNES UNIQUEMENT DANS LE PREMIER TEXTE",
              ...left,
              "",
              "LIGNES UNIQUEMENT DANS LE SECOND TEXTE",
              ...right,
            ].join("\n");

          created = [
            {
              name: "comparaison.txt",
              blob: textBlob(report),
              note: `${left.length} ligne(s) retirée(s), ${right.length} ajoutée(s)`,
            },
          ];
          break;
        }
        case "text-docx": {
          const { Document, Packer, Paragraph, TextRun } = await import("docx");
          const src = await readText();
          const doc = new Document({
            sections: [
              {
                children: src
                  .replace(/\r/g, "")
                  .split("\n")
                  .map(
                    line =>
                      new Paragraph({ children: [new TextRun(line || " ")] })
                  ),
              },
            ],
          });
          created = [
            {
              name: (file ? stem(file.name) : "document") + ".docx",
              blob: await Packer.toBlob(doc),
            },
          ];
          break;
        }
        case "docx-text": {
          const value = await extractDocx(
            new Uint8Array(await file!.arrayBuffer())
          );

          created = [
            { name: stem(file!.name) + ".txt", blob: textBlob(value) },
          ];
          break;
        }
        case "text-pdf":
        case "docx-pdf": {
          const source =
            selected.id === "docx-pdf"
              ? await extractDocx(new Uint8Array(await file!.arrayBuffer()))
              : await readText();
          const bytes = await makePdfText(source);
          created = [
            {
              name: stem(file?.name || "document") + ".pdf",
              blob: new Blob([bytes as Uint8Array], {
                type: "application/pdf",
              }),
              note: "Le texte est conservé ; les styles Word complexes sont simplifiés.",
            },
          ];
          break;
        }
        case "csv-json": {
          const source = await readText(),
            delimiter = detectCsvDelimiter(source),
            rows = csvRows(source, delimiter);
          if (rows.length < 2)
            throw new Error(
              "Le CSV doit contenir une ligne d’en-têtes et au moins une donnée."
            );
          const headers = rows[0];
          const records = rows
            .slice(1)
            .filter(r => r.some(Boolean))
            .map(r =>
              Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
            );
          const result = JSON.stringify(records, null, 2);
          created = [
            {
              name: stem(file?.name || "donnees") + ".json",
              blob: textBlob(result, "application/json;charset=utf-8"),
              note: `Séparateur détecté : ${delimiter === "\t" ? "tabulation" : delimiter}`,
            },
          ];

          break;
        }
        case "json-csv": {
          const data = JSON.parse(await readText());
          if (
            !Array.isArray(data) ||
            data.some(
              row => !row || typeof row !== "object" || Array.isArray(row)
            )
          )
            throw new Error("Le JSON doit être un tableau d’objets.");
          const headers = Array.from(
            new Set(data.flatMap(row => Object.keys(row)))
          );
          const result = toCsv([
            headers,
            ...data.map(row =>
              headers.map(key => {
                const value = row[key];
                return value && typeof value === "object"
                  ? JSON.stringify(value)
                  : value;
              })
            ),
          ]);
          created = [
            {
              name: stem(file?.name || "donnees") + ".csv",
              blob: textBlob(result, "text/csv;charset=utf-8"),
            },
          ];

          break;
        }
        case "srt": {
          const duration = Math.max(1, Math.min(30, Number(option) || 3));
          const result = (await readText())
            .trim()
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map(
              (caption, i) =>
                `${i + 1}\n${srtTime(i * duration)} --> ${srtTime((i + 1) * duration)}\n${caption.trim()}`
            )
            .join("\n\n");
          created = [{ name: "sous-titres.srt", blob: textBlob(result) }];

          break;
        }
        case "srt-vtt": {
          const direction = option === "vtt" ? "vtt" : "srt",
            result = convertSubtitle(await readText(), direction);
          created = [
            {
              name:
                stem(file?.name || "sous-titres") +
                (direction === "vtt" ? ".vtt" : ".srt"),
              blob: textBlob(result, "text/plain;charset=utf-8"),
              note: `Format ${direction.toUpperCase()} · horodatages classiques`,
            },
          ];

          break;
        }
        case "text-stats": {
          const source = await readText(),
            words = source.trim() ? source.trim().split(/\s+/).length : 0,
            lines = source ? source.replace(/\r/g, "").split("\n").length : 0,
            characters = source.length,
            compact = source.replace(/\s/g, "").length,
            reading = Math.max(1, Math.ceil(words / 200)),
            value = `MOTS : ${words.toLocaleString("fr-FR")}\nCARACTÈRES (espaces compris) : ${characters.toLocaleString("fr-FR")}\nCARACTÈRES (sans espaces) : ${compact.toLocaleString("fr-FR")}\nLIGNES : ${lines.toLocaleString("fr-FR")}\nLECTURE ESTIMÉE : environ ${reading} min (200 mots/min)`;

          created = [{ name: "statistiques-texte.txt", blob: textBlob(value) }];
          break;
        }
        case "pdf-merge": {
          if (files.length < 2)
            throw new Error("Choisissez au moins deux PDF.");
          const { PDFDocument } = await import("pdf-lib");
          const target = await PDFDocument.create();
          for (const pdf of files) {
            await checkpoint();
            setStatus(`Fusion du PDF ${files.indexOf(pdf) + 1} sur ${files.length}…`);
            const source = await PDFDocument.load(await pdf.arrayBuffer());
            const pages = await target.copyPages(
              source,
              source.getPageIndices()
            );
            pages.forEach(p => target.addPage(p));
            reportProgress(files.indexOf(pdf) + 1, files.length);
          }
          created = [
            {
              name: "documents-fusionnes.pdf",
              blob: new Blob(
                [(await target.save({ useObjectStreams: true })) as Uint8Array],
                { type: "application/pdf" }
              ),
            },
          ];
          break;
        }
        case "pdf-reorder":
        case "pdf-remove": {
          const { PDFDocument } = await import("pdf-lib");
          const source = await PDFDocument.load(await file!.arrayBuffer()),
            count = source.getPageCount();
          let indices: number[];
          if (selected.id === "pdf-reorder") {
            indices = option.split(",").map(x => {
              const n = Number(x.trim());
              if (!Number.isInteger(n) || n < 1 || n > count)
                throw new Error(`Pages 1 à ${count} : ordre invalide.`);
              return n - 1;
            });
          } else {
            const removed = new Set(parseRange(option, count));
            indices = Array.from({ length: count }, (_, i) => i).filter(
              i => !removed.has(i)
            );
            if (!indices.length)
              throw new Error("Il faut conserver au moins une page.");
          }
          const result = await PDFDocument.create();
          (await result.copyPages(source, indices)).forEach(p =>
            result.addPage(p)
          );
          created = [
            {
              name: stem(file!.name) + "-modifie.pdf",
              blob: new Blob(
                [(await result.save({ useObjectStreams: true })) as Uint8Array],
                { type: "application/pdf" }
              ),
            },
          ];
          break;
        }
        case "pdf-split": {
          const [{ PDFDocument }, { zipSync }] = await Promise.all([
            import("pdf-lib"),
            import("fflate"),
          ]);
          const source = await PDFDocument.load(await file!.arrayBuffer()),
            zipItems: Record<string, Uint8Array> = {};
          if (source.getPageCount() > 100)
            throw new Error("Limite de 100 pages pour cette opération.");
          for (let i = 0; i < source.getPageCount(); i++) {
            await checkpoint();
            setStatus(`Extraction de la page ${i + 1} sur ${source.getPageCount()}…`);
            const part = await PDFDocument.create();
            (await part.copyPages(source, [i])).forEach(p => part.addPage(p));
            zipItems[`page-${String(i + 1).padStart(3, "0")}.pdf`] =
              await part.save();
            reportProgress(i + 1, source.getPageCount());
          }
          created = [
            {
              name: stem(file!.name) + "-pages.zip",
              blob: new Blob([zipSync(zipItems, { level: 5 }) as Uint8Array], {
                type: "application/zip",
              }),
            },
          ];
          break;
        }
        case "pdf-page-numbers": {
          const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
          const first = Number(option);
          if (!Number.isInteger(first) || first < 0 || first > 999999)
            throw new Error(
              "Choisissez un numéro de départ entre 0 et 999999."
            );
          const pdf = await PDFDocument.load(await file!.arrayBuffer());
          if (pdf.getPageCount() > 1000)
            throw new Error("Limite de 1000 pages pour numéroter ce document.");
          const font = await pdf.embedFont(StandardFonts.Helvetica);
          const pages = pdf.getPages();
          for (let index = 0; index < pages.length; index++) {
            await checkpoint();
            const page = pages[index];
            const label = String(first + index),
              size = 9,
              width = font.widthOfTextAtSize(label, size);
            page.drawText(label, {
              x: (page.getWidth() - width) / 2,
              y: 18,
              size,
              font,
              color: rgb(0.38, 0.42, 0.49),
            });
            reportProgress(index + 1, pages.length);
          }
          const data = await pdf.save({ useObjectStreams: true });
          created = [
            {
              name: stem(file!.name) + "-numerote.pdf",
              blob: new Blob([data as Uint8Array], { type: "application/pdf" }),
              note: `${pdf.getPageCount()} page(s) · départ ${first}`,
            },
          ];
          break;
        }
        case "pdf-watermark": {
          const { PDFDocument, StandardFonts, rgb, degrees } =
            await import("pdf-lib");
          const label = text.trim();
          if (!label)
            throw new Error("Saisissez le texte à inscrire en filigrane.");
          if (label.length > 80)
            throw new Error("Limite de 80 caractères pour le filigrane.");
          const opacity = Number(option.replace(",", "."));
          if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 0.4)
            throw new Error(
              "Choisissez une opacité comprise entre 0,05 et 0,4."
            );
          const pdf = await PDFDocument.load(await file!.arrayBuffer());
          if (pdf.getPageCount() > 500)
            throw new Error("Limite de 500 pages pour appliquer un filigrane.");
          const font = await pdf.embedFont(StandardFonts.Helvetica);
          const pages = pdf.getPages();
          for (let index = 0; index < pages.length; index++) {
            await checkpoint();
            const page = pages[index];
            const size = Math.min(
                42,
                ((page.getWidth() - 48) /
                  Math.max(1, font.widthOfTextAtSize(label, 42))) *
                  42
              ),
              width = font.widthOfTextAtSize(label, size);
            page.drawText(label, {
              x: (page.getWidth() - width) / 2,
              y: page.getHeight() / 2,
              size,
              font,
              color: rgb(0.72, 0.22, 0.28),
              opacity,
              rotate: degrees(32),
            });
            reportProgress(index + 1, pages.length);
          }
          const data = await pdf.save({ useObjectStreams: true });
          created = [
            {
              name: stem(file!.name) + "-filigrane.pdf",
              blob: new Blob([data as Uint8Array], { type: "application/pdf" }),
              note: `Filigrane « ${label} » · opacité ${Math.round(opacity * 100)} %`,
            },
          ];
          break;
        }
        case "pdf-rotate":
        case "pdf-compress": {
          const { PDFDocument, degrees } = await import("pdf-lib");
          const pdf = await PDFDocument.load(await file!.arrayBuffer());
          if (selected.id === "pdf-rotate") {
            const deg = Number(option);
            if (![90, 180, 270].includes(deg))
              throw new Error("Choisissez 90, 180 ou 270 degrés.");
            const pages = pdf.getPages();
            for (let index = 0; index < pages.length; index++) {
              await checkpoint();
              pages[index].setRotation(degrees((pages[index].getRotation().angle + deg) % 360));
              reportProgress(index + 1, pages.length);
            }
          }
          const data = await pdf.save({
            useObjectStreams: true,
            addDefaultPage: false,
          });
          const note =
            selected.id === "pdf-compress"
              ? `Structure réécrite sans recompression des images · ${(data.length / 1048576).toFixed(2)} Mo`
              : `Rotation appliquée aux ${pdf.getPageCount()} pages`;
          created = [
            {
              name: stem(file!.name) + ".pdf",
              blob: new Blob([data as Uint8Array], { type: "application/pdf" }),
              note,
            },
          ];
          break;
        }
        case "pdf-text": {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
          const doc = await pdfjs.getDocument({
            data: new Uint8Array(await file!.arrayBuffer()),
          }).promise;
          const pages: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            await checkpoint();
            setStatus(`Lecture de la page ${i} sur ${doc.numPages}…`);
            const page = await doc.getPage(i),
              content = await page.getTextContent();
            pages.push(
              content.items
                .map(item => ("str" in item ? item.str : ""))
                .filter(Boolean)
                .join(" ")
            );
            reportProgress(i, doc.numPages);
          }
          const value = pages.join("\n\n");

          created = [
            { name: stem(file!.name) + ".txt", blob: textBlob(value) },
          ];
          break;
        }
        case "image-pdf": {
          if (files.length > 30)
            throw new Error("Limite de 30 images par PDF.");
          const { PDFDocument } = await import("pdf-lib");
          const pdf = await PDFDocument.create();
          for (const img of files) {
            await checkpoint();
            setStatus(`Ajout de l’image ${files.indexOf(img) + 1} sur ${files.length}…`);
            const bytes = await img.arrayBuffer(),
              image =
                img.type === "image/png"
                  ? await pdf.embedPng(bytes)
                  : await pdf.embedJpg(bytes),
              page = pdf.addPage([595.28, 841.89]),
              scale = Math.min(
                (page.getWidth() - 48) / image.width,
                (page.getHeight() - 48) / image.height
              ),
              w = image.width * scale,
              h = image.height * scale;
            page.drawImage(image, {
              x: (page.getWidth() - w) / 2,
              y: (page.getHeight() - h) / 2,
              width: w,
              height: h,
            });
            reportProgress(files.indexOf(img) + 1, files.length);
          }
          created = [
            {
              name: "images.pdf",
              blob: new Blob(
                [(await pdf.save({ useObjectStreams: true })) as Uint8Array],
                { type: "application/pdf" }
              ),
            },
          ];
          break;
        }
        case "image-contact-sheet": {
          const blob = await makeImageContactSheet(
            files,
            Number(option),
            contactSheetLabelMode,
            checkpoint,
            reportProgress
          );
          created = [
            {
              name: "planche-contact.png",
              blob,
              note: `${files.length} image(s) · ${contactSheetLabelMode === "hidden" ? "noms masqués" : contactSheetLabelMode === "number" ? "images numérotées" : "noms affichés"} · ${(blob.size / 1048576).toFixed(2)} Mo`,
            },
          ];
          break;
        }
        case "image-convert":
        case "image-resize": {
          const max =
            selected.id === "image-resize"
              ? Math.max(64, Math.min(6000, Number(option) || 1600))
              : 6000;
          for (const img of files) {
            await checkpoint();
            setStatus(`Conversion de l’image ${files.indexOf(img) + 1} sur ${files.length}…`);
            const bitmap = await createImageBitmap(img),
              scale = Math.min(1, max / bitmap.width, max / bitmap.height),
              canvas = document.createElement("canvas");
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas indisponible.");
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            const mime =
                selected.id === "image-resize"
                  ? "image/jpeg"
                  : (
                      {
                        png: "image/png",
                        jpeg: "image/jpeg",
                        webp: "image/webp",
                      } as Record<string, string>
                    )[option.toLowerCase()] || "image/webp",
              blob = await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                  b =>
                    b
                      ? resolve(b)
                      : reject(new Error("Format d’image non pris en charge.")),
                  mime,
                  quality / 100
                )
              );
            created.push({
              name:
                stem(img.name) +
                (selected.id === "image-resize"
                  ? "-redimensionnee"
                  : "-convertie") +
                (
                  {
                    "image/png": ".png",
                    "image/jpeg": ".jpg",
                    "image/webp": ".webp",
                  } as Record<string, string>
                )[mime],
              blob,
              note: `${canvas.width} × ${canvas.height} · ${quality}% · ${(blob.size / 1024).toFixed(0)} Ko`,
            });
            reportProgress(files.indexOf(img) + 1, files.length);
          }
          break;
        }
        case "zip-create": {
          if (files.length < 1)
            throw new Error("Choisissez au moins un fichier.");
          const { zipSync } = await import("fflate");
          const items: Record<string, Uint8Array> = {};
          let total = 0;
          for (const f of files) {
            await checkpoint();
            if (f.size > MAX_FILE)
              throw new Error(
                "Fichier trop volumineux (limite 512 Mo par élément)."
              );
            total += f.size;
            if (total > 50 * 1024 * 1024)
              throw new Error(
                "Limite totale de 50 Mo pour créer une archive depuis le navigateur."
              );
            let name = safeName(f.name),
              n = 2;
            while (items[name]) {
              const ext = /\.[^.]+$/.exec(name)?.[0] || "",
                base = ext ? name.slice(0, -ext.length) : name;
              name = `${base}-${n++}${ext}`;
            }
            items[name] = new Uint8Array(await f.arrayBuffer());
            reportProgress(files.indexOf(f) + 1, files.length);
          }
          created = [
            {
              name: "fichiers-kitt.zip",
              blob: new Blob([zipSync(items, { level: 6 }) as Uint8Array], {
                type: "application/zip",
              }),
            },
          ];
          break;
        }
        case "zip-extract": {
          if (file!.size > 25 * 1024 * 1024)
            throw new Error("Limite de 25 Mo pour ouvrir une archive locale.");
          const entries = await readZip(
            new Uint8Array(await file!.arrayBuffer())
          );
          created = entries.map(e => ({
            name: e.name,
            blob: new Blob([e.data]),
          }));
          break;
        }
        case "sha256": {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await file!.arrayBuffer()
          );
          created = [
            {
              name: "SHA-256.txt",
              blob: textBlob(
                `${Array.from(new Uint8Array(digest))
                  .map(x => x.toString(16).padStart(2, "0"))
                  .join("")}  ${file!.name}`
              ),
            },
          ];
          break;
        }
        case "base64": {
          const src = await readText();
          if (option.toLowerCase() === "decoder") {
            const bytes = Uint8Array.from(atob(src.trim()), c =>
              c.charCodeAt(0)
            );
            const result = new TextDecoder("utf-8", { fatal: true }).decode(
              bytes
            );

            created = [{ name: "texte-decode.txt", blob: textBlob(result) }];
          } else {
            const bytes = new TextEncoder().encode(src);
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000)
              binary += String.fromCharCode(
                ...Array.from(bytes.subarray(i, i + 0x8000))
              );
            const result = btoa(binary);

            created = [{ name: "texte-base64.txt", blob: textBlob(result) }];
          }
          break;
        }
        case "audio-info": {
          const buffer = await decodeAudio(file!),
            value = `FICHIER : ${file!.name}\nDURÉE : ${buffer.duration.toFixed(2)} s (${formatTime(buffer.duration)})\nFRÉQUENCE : ${buffer.sampleRate.toLocaleString("fr-FR")} Hz\nCANAUX : ${buffer.numberOfChannels}\nTYPE DÉCLARÉ : ${file!.type || "non fourni"}\nTAILLE : ${(file!.size / 1048576).toFixed(2)} Mo`;

          created = [
            {
              name: stem(file!.name) + "-fiche.txt",
              blob: textBlob(value),
              note: "Caractéristiques décodées par le navigateur",
            },
          ];
          break;
        }
        case "audio-waveform": {
          const buffer = await decodeAudio(file!),
            blob = await makeWaveform(buffer, checkpoint, reportProgress);
          created = [
            {
              name: stem(file!.name) + "-forme-onde.png",
              blob,
              note: `${formatTime(buffer.duration)} · ${buffer.sampleRate.toLocaleString("fr-FR")} Hz · ${Math.min(2, buffer.numberOfChannels)} canal(aux)`,
            },
          ];
          break;
        }
        case "audio-wav":
        case "audio-trim":
        case "audio-normalize": {
          const buffer = await decodeAudio(file!);
          let start = 0,
            end = buffer.duration;
          if (selected.id === "audio-trim") {
            [start, end] = parseSeconds(option, buffer.duration);
          }
          let outputBuffer = buffer;
          if (selected.id === "audio-normalize") {
            let peak = 0;
            const totalSamples = buffer.length * buffer.numberOfChannels;
            let scanned = 0;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
              const channel = buffer.getChannelData(c);
              for (let offset = 0; offset < channel.length; offset += 262144) {
                await checkpoint();
                const end = Math.min(channel.length, offset + 262144);
                for (let sample = offset; sample < end; sample++)
                  peak = Math.max(peak, Math.abs(channel[sample]));
                scanned += end - offset;
                setToolProgress(Math.round((scanned / totalSamples) * 30));
                setStatus(`Analyse du son… ${Math.round((scanned / totalSamples) * 100)} %`);
              }
            }
            const targetAmplitude = normalizeTarget / 100;
            const scale = peak ? targetAmplitude / peak : 1;
            const Ctx =
                window.AudioContext ||
                ((window as any).webkitAudioContext as typeof AudioContext),
              ctx = new Ctx();
            try {
              const render = ctx.createBuffer(
                buffer.numberOfChannels,
                buffer.length,
                buffer.sampleRate
              );
              for (let c = 0; c < buffer.numberOfChannels; c++) {
                const target = render.getChannelData(c),
                  source = buffer.getChannelData(c);
                for (let offset = 0; offset < target.length; offset += 262144) {
                  await checkpoint();
                  const end = Math.min(target.length, offset + 262144);
                  for (let i = offset; i < end; i++) target[i] = source[i] * scale;
                  const completed = c * target.length + end;
                  setToolProgress(30 + Math.round((completed / totalSamples) * 35));
                  setStatus(`Normalisation du son… ${Math.round((completed / totalSamples) * 100)} %`);
                }
              }
              outputBuffer = render;
            } finally {
              await ctx.close();
            }
          }
          const blob = await wavBlob(outputBuffer, start, end, controller.signal, percent => {
            const base = selected.id === "audio-normalize" ? 65 : 0;
            setToolProgress(base + Math.round((percent / 100) * (99 - base)));
            setStatus(`Création du WAV… ${percent} %`);
          });
          created = [
            {
              name: stem(file!.name) + ".wav",
              blob,
              note: `${buffer.numberOfChannels} canaux · ${buffer.sampleRate} Hz · ${(blob.size / 1048576).toFixed(2)} Mo`,
            },
          ];
          break;
        }
        case "audio-join": {
          if (files.length < 2)
            throw new Error("Choisissez au moins deux fichiers audio.");
          const decoded = await Promise.all(files.map(decodeAudio)),
            rate = decoded[0].sampleRate,
            channels = Math.max(
              ...decoded.map(x => Math.min(2, x.numberOfChannels))
            ),
            length = decoded.reduce(
              (n, x) => n + Math.ceil(x.duration * rate),
              0
            );
          if (length / rate > 600)
            throw new Error(
              "Limite totale de 10 minutes pour assembler l’audio."
            );
          const Ctx =
              window.AudioContext ||
              ((window as any).webkitAudioContext as typeof AudioContext),
            ctx = new Ctx(),
            out = ctx.createBuffer(channels, length, rate);
          let cursor = 0;
          try {
          for (const item of decoded) {
            const count = Math.ceil(item.duration * rate);
            for (let c = 0; c < channels; c++) {
              const target = out.getChannelData(c),
                source = item.getChannelData(
                  Math.min(c, item.numberOfChannels - 1)
                );
              for (let blockStart = 0; blockStart < count; blockStart += 65536) {
                await checkpoint();
                const blockEnd = Math.min(count, blockStart + 65536);
                for (let i = blockStart; i < blockEnd; i++) {
                  const pos = (i * item.sampleRate) / rate,
                    left = Math.floor(pos),
                    fraction = pos - left;
                  target[cursor + i] =
                    (source[left] || 0) * (1 - fraction) +
                    (source[Math.min(left + 1, source.length - 1)] || 0) *
                      fraction;
                }
                reportProgress(cursor + blockEnd, length);
                setStatus(`Assemblage audio… ${Math.min(99, Math.round(((cursor + blockEnd) / length) * 80))} %`);
              }
            }
            cursor += count;
          }
          const blob = await wavBlob(out, 0, out.duration, controller.signal, percent => {
            setToolProgress(80 + Math.round((percent / 100) * 19));
            setStatus(`Création du WAV assemblé… ${percent} %`);
          });
          created = [{ name: "audio-assemble.wav", blob }];
          } finally {
            await ctx.close();
          }
          break;
        }
        case "video-info":
        case "video-thumb":
        case "video-frames": {
          const v = video.current;
          if (!v || !files[0])
            throw new Error("Chargez une vidéo et attendez l’aperçu.");
          if (selected.id === "video-info") {
            const value = `Fichier : ${file!.name}\nDurée : ${formatTime(v.duration)} (${v.duration.toFixed(2)} s)\nDimensions : ${v.videoWidth} × ${v.videoHeight}\nType : ${file!.type || "non fourni"}\nTaille : ${(file!.size / 1048576).toFixed(2)} Mo`;

            created = [{ name: "fiche-video.txt", blob: textBlob(value) }];
            setMediaMeta(value);
          } else {
            if (v.videoWidth > 1280 || v.videoHeight > 720)
              throw new Error(
                "Pour protéger la mémoire, choisissez une vidéo de 1280 × 720 maximum pour extraire ses images."
              );
            const interval =
              selected.id === "video-thumb"
                ? Math.max(0, v.currentTime)
                : Math.max(2, Math.min(120, Number(option) || 5));
            const canvas = document.createElement("canvas");
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas indisponible.");
            const shots: number[] = [];
            if (selected.id === "video-thumb") shots.push(v.currentTime);
            else
              for (
                let t = 0;
                t < v.duration && shots.length < 30;
                t += interval
              )
                shots.push(t);
            const items: Record<string, Uint8Array> = {};
            for (let i = 0; i < shots.length; i++) {
              await checkpoint();
              setStatus(`Capture ${i + 1} sur ${shots.length}…`);
              await seekVideo(v, shots[i]);
              ctx.drawImage(v, 0, 0);
              const blob = await new Promise<Blob>(r =>
                canvas.toBlob(b => r(b!), "image/png")
              );
              if (selected.id === "video-thumb")
                created = [
                  {
                    name: `${stem(file!.name)}-${Math.floor(shots[i])}s.png`,
                    blob,
                  },
                ];
              else
                items[
                  `image-${String(i + 1).padStart(3, "0")}-${Math.floor(shots[i])}s.png`
                ] = new Uint8Array(await blob.arrayBuffer());
              reportProgress(i + 1, shots.length);
            }
            if (selected.id === "video-frames") {
              const { zipSync } = await import("fflate");
              created = [
                {
                  name: "captures-video.zip",
                  blob: new Blob([zipSync(items, { level: 4 }) as Uint8Array], {
                    type: "application/zip",
                  }),
                },
              ];
            }
          }
          break;
        }
        case "video-contact-sheet": {
          const v = video.current;
          if (!v || !files[0])
            throw new Error("Chargez une vidéo et attendez l’aperçu.");
          if (v.videoWidth > 1280 || v.videoHeight > 720)
            throw new Error(
              "La planche contact accepte les vidéos jusqu’à 1280 × 720 pour préserver la mémoire."
            );
          if (!Number.isFinite(v.duration) || v.duration <= 0)
            throw new Error("La durée de cette vidéo est inconnue.");
          if (v.readyState < 2) await once(v, "loadeddata");
          const interval = Math.max(2, Math.min(120, Number(option) || 5)),
            times: number[] = [];
          for (
            let second = 0;
            second < v.duration && times.length < 24;
            second += interval
          )
            times.push(second);
          if (!times.length) times.push(0);
          const columns = 4,
            cellWidth = 360,
            cellHeight = 238,
            gap = 10,
            outer = 16,
            rows = Math.ceil(times.length / columns),
            canvas = document.createElement("canvas");
          canvas.width = outer * 2 + columns * cellWidth + (columns - 1) * gap;
          canvas.height = outer * 2 + 36 + rows * cellHeight + (rows - 1) * gap;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas indisponible.");
          ctx.fillStyle = "#080d15";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ff7382";
          ctx.font = "700 18px Consolas, monospace";
          ctx.fillText("KITT // PLANCHE DE SCÈNES", outer, outer + 20);
          for (let index = 0; index < times.length; index++) {
            await checkpoint();
            setStatus(`Composition de la scène ${index + 1} sur ${times.length}…`);
            await seekVideo(v, times[index]);
            const x = outer + (index % columns) * (cellWidth + gap),
              y = outer + 36 + Math.floor(index / columns) * (cellHeight + gap),
              pictureHeight = cellHeight - 32;
            ctx.fillStyle = "#111a27";
            ctx.fillRect(x, y, cellWidth, cellHeight);
            const scale = Math.min(
                (cellWidth - 16) / v.videoWidth,
                (pictureHeight - 8) / v.videoHeight
              ),
              width = v.videoWidth * scale,
              height = v.videoHeight * scale;
            ctx.drawImage(
              v,
              x + (cellWidth - width) / 2,
              y + 4 + (pictureHeight - height) / 2,
              width,
              height
            );
            ctx.fillStyle = "#e9eff8";
            ctx.font = "12px Consolas, monospace";
            ctx.fillText(formatTime(times[index]), x + 9, y + cellHeight - 10);
            reportProgress(index + 1, times.length);
          }
          const blob = await canvasPng(canvas);
          created = [
            {
              name: stem(file!.name) + "-scenes.png",
              blob,
              note: `${times.length} captures · intervalle ${interval} s · max 24 images`,
            },
          ];
          break;
        }
        case "video-trim":
        case "video-audio": {
          created = [await recordVideo(file!, selected.id, option, setStatus, controller.signal)];
          break;
        }
        case "media-convert": {
          if (!file) throw new Error("Choisissez un fichier vidéo ou audio.");
          if (file.size > 500 * 1024 * 1024) throw new Error("Limite : 500 Mo par fichier pour la conversion locale.");
          const format = option || "mp4";
          const sourceExtension = file.name.split(".").pop()?.toLowerCase();
          const inputIsAudio = file.type.startsWith("audio/") || (!file.type && /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name));
          if (format === "mp4" && sourceExtension === "mp4") {
            created = [{ name: `${stem(file.name)}.mp4`, blob: file, note: "Ce fichier est déjà en MP4. Copie rapide sans perte de qualité ni réencodage." }];
            break;
          }
          if (format === "mp4" && !inputIsAudio && videoSize === "source" && mediaRecorderType(["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"]) && typeof (HTMLVideoElement.prototype as any).captureStream === "function") {
            setStatus("Préparation de l’encodage MP4 natif…");
            try {
              const blob = await recordMp4InBrowser(file, controller.signal, (percent, current, duration) => {
                setToolProgress(percent);
                setStatus(duration > 0
                  ? `Encodage MP4 accéléré · ${formatTime(current)} / ${formatTime(duration)} · ${percent ?? 0} %`
                  : "Lecture des horodatages de la vidéo…");
              });
              created = [{
                name: `${stem(file.name)}.mp4`,
                blob,
                note: "MP4 créé par l’encodeur vidéo natif, à la résolution d’origine.",
              }];
              break;
            } catch (nativeError) {
              if (controller.signal.aborted) throw nativeError;
              setToolProgress(null);
              setStatus("Le mode natif n’a pas pu démarrer ; passage au moteur de secours…");
            }
          }
          setStatus("Chargement du moteur FFmpeg…");
          const { FFmpeg } = await import("@ffmpeg/ffmpeg");
          const ffmpeg = new FFmpeg();
          let ffmpegLog = "", lastPercent = 0, durationSeconds = 0, encodingStarted = false;
          let termination: Promise<void> | null = null;
          const terminate = () => {
            termination ??= Promise.resolve(ffmpeg.terminate());
            return termination;
          };
          cancelActive.current = terminate;
          controller.signal.addEventListener("abort", terminate, { once: true });
          let loadTimer: number | undefined;
          ffmpeg.on("log", ({ message }) => { ffmpegLog = `${ffmpegLog}\n${message}`.slice(-1800); });
          ffmpeg.on("progress", ({ time }) => {
            if (!encodingStarted) return;
            if (!durationSeconds || !Number.isFinite(time)) {
              setToolProgress(null);
              setStatus(`Encodage en cours · ${formatTime(Math.max(0, time / 1_000_000))} écoulées…`);
              return;
            }
            const mediaTime = time / 1_000_000;
            const estimate = Math.max(0, Math.min(99, Math.round((mediaTime / durationSeconds) * 100)));
            lastPercent = Math.max(lastPercent, estimate);
            setToolProgress(lastPercent);
            setStatus(`Encodage vidéo · ${formatTime(Math.max(0, mediaTime))} / ${formatTime(durationSeconds)} · ${lastPercent} %`);
          });
          const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core";
          try {
            setStatus("Initialisation du moteur vidéo…");
            const loadPromise = ffmpeg.load(
              { coreURL: `${base}.js`, wasmURL: `${base}.wasm` },
              { signal: controller.signal }
            );
            await Promise.race([
              loadPromise,
              new Promise<never>((_, reject) => {
                loadTimer = window.setTimeout(() => reject(new Error("Le moteur vidéo ne démarre pas. Vérifiez la connexion puis réessayez dans Chrome ou Edge à jour.")), 90000);
              }),
            ]);
            if (controller.signal.aborted) throw new Error("Conversion annulée.");
            const inputName = `input.${file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin"}`;
            const outputName = `output.${format}`;
            const scaleArgs = !inputIsAudio && videoSize !== "source"
              ? ["-vf", videoSize === "480" ? "scale=min(854\\,iw):-2" : "scale=min(1280\\,iw):-2"]
              : [];
            setStatus("Préparation du fichier vidéo…");
            await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
            if (controller.signal.aborted) throw new Error("Conversion annulée.");
            if (!inputIsAudio) {
              setStatus("Analyse de la durée pour afficher une progression précise…");
              try {
                await ffmpeg.ffprobe([
                  "-v", "error", "-show_entries", "format=duration", "-of",
                  "default=noprint_wrappers=1:nokey=1", inputName, "-o", "kitt-duration.txt",
                ], -1, { signal: controller.signal });
                const durationText = await ffmpeg.readFile("kitt-duration.txt", "utf8");
                durationSeconds = Number(String(durationText).trim());
                await ffmpeg.deleteFile("kitt-duration.txt");
                if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
                  await ffmpeg.ffprobe([
                    "-v", "error", "-show_entries", "packet=pts_time,duration_time",
                    "-of", "csv=p=0", inputName, "-o", "kitt-packets.txt",
                  ], -1, { signal: controller.signal });
                  const packetText = await ffmpeg.readFile("kitt-packets.txt", "utf8");
                  durationSeconds = String(packetText).split(/\r?\n/).reduce((latest, row) => {
                    const [ptsRaw, durationRaw] = row.split(","), pts = Number(ptsRaw), packetDuration = Number(durationRaw);
                    return Number.isFinite(pts) ? Math.max(latest, pts + (Number.isFinite(packetDuration) ? packetDuration : 0)) : latest;
                  }, 0);
                  await ffmpeg.deleteFile("kitt-packets.txt");
                }
              } catch (probeError) {
                if (controller.signal.aborted) throw probeError;
                durationSeconds = 0;
              }
            }
            setToolProgress(durationSeconds > 0 || inputIsAudio ? 0 : null);
            encodingStarted = true;
            setStatus(durationSeconds > 0 ? `Encodage vidéo · 0 / ${formatTime(durationSeconds)} · 0 %` : "Encodage vidéo en cours…");
            const args = format === "mp3" ? ["-i", inputName, "-vn", "-codec:a", "libmp3lame", "-q:a", "2", outputName]
              : format === "wav" ? ["-i", inputName, "-vn", "-c:a", "pcm_s16le", outputName]
              : format === "avi" ? ["-i", inputName, ...scaleArgs, "-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame", outputName]
              : format === "mpeg" ? ["-i", inputName, ...scaleArgs, "-c:v", "mpeg1video", "-c:a", "mp2", outputName]
              : format === "webm" ? ["-i", inputName, ...scaleArgs, "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libvorbis", outputName]
              : ["-i", inputName, ...scaleArgs, "-threads", "0", "-c:v", "mpeg4", "-q:v", videoSize === "480" ? "7" : "5", "-bf", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputName];
            const exitCode = await ffmpeg.exec(args);
            if (exitCode !== 0) throw new Error(`Conversion impossible vers ${format.toUpperCase()}. ${ffmpegLog.trim().split("\n").slice(-3).join(" · ")}`);
            const data = await ffmpeg.readFile(outputName);
            const mime = ({mp3:"audio/mpeg",wav:"audio/wav",mp4:"video/mp4",webm:"video/webm",avi:"video/x-msvideo",mpeg:"video/mpeg"} as Record<string,string>)[format];
            const outputBytes = new Uint8Array(data as Uint8Array);
            created = [{name:`${stem(file.name)}.${format}`,blob:new Blob([outputBytes.buffer as ArrayBuffer],{type:mime}),note:`Converti en ${format.toUpperCase()} localement${!inputIsAudio && videoSize === "480" ? " · mode très rapide, 480p maximum" : !inputIsAudio && videoSize === "720" ? " · mode rapide, 720p maximum" : ""}`}];
          } finally {
            if (loadTimer !== undefined) window.clearTimeout(loadTimer);
            controller.signal.removeEventListener("abort", terminate);
            if (cancelActive.current === terminate) cancelActive.current = null;
            await terminate();
          }
          break;
        }
        default:
          throw new Error("Cet outil sera bientôt disponible.");
      }
      await checkpoint();
      const outputDate = new Date().toISOString().slice(0, 10);
      const outputBase = files.length === 1 && file ? stem(file.name) : "";
      const usedNames = new Set<string>();
      const formatted = created.map(result => {
        const extension = result.name.match(/\.[^.]+$/)?.[0] || "";
        const fallback = stem(result.name);
        const base = (filenameTemplate || "{nom}-{outil}")
          .replaceAll("{nom}", outputBase || fallback)
          .replaceAll("{outil}", selected.id)
          .replaceAll("{date}", outputDate);
        const cleanBase = safeName(base);
        let name = `${cleanBase}${extension}`, suffix = 2;
        while (usedNames.has(name.toLowerCase())) name = `${cleanBase}-${suffix++}${extension}`;
        usedNames.add(name.toLowerCase());
        return { ...result, name };
      });
      setOutputs(formatted);
      setToolProgress(100);
      setStatus(
        created.length
          ? `${created.length} fichier(s) prêt(s). Les originaux restent inchangés.`
          : "Opération terminée."
      );
    } catch (error) {
      setStatus(
        controller.signal.aborted ? "Traitement annulé. Vous pouvez modifier les fichiers et recommencer." : error instanceof Error
          ? error.message
          : "Impossible de traiter ce fichier."
      );
    } finally {
      setBusy(false);
      setToolProgress(null);
      cancelActive.current = null;
      if (job.current === controller) job.current = null;
    }
  }
  async function startRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    )
      throw new Error("Enregistrement micro indisponible dans ce navigateur.");
    const selectedType = mediaRecorderType([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ]);
    if (!selectedType)
      throw new Error("Aucun format d’enregistrement compatible trouvé.");
    stream.current = await navigator.mediaDevices.getUserMedia({
      audio: selectedMicrophone
        ? { deviceId: { exact: selectedMicrophone } }
        : true,
    });
    chunks.current = [];
    recorder.current = new MediaRecorder(stream.current, {
      mimeType: selectedType,
    });
    recorder.current.ondataavailable = e => {
      if (e.data.size) chunks.current.push(e.data);
    };
    recorder.current.onstop = () => {
      const blob = new Blob(chunks.current, {
        type: selectedType.split(";")[0],
      });
      const ext = selectedType.includes("mp4") ? "m4a" : "webm";
      const recordDate = new Date().toISOString().slice(0, 10);
      const recordName = (filenameTemplate || "{nom}-{outil}")
        .replaceAll("{nom}", "enregistrement")
        .replaceAll("{outil}", "micro")
        .replaceAll("{date}", recordDate);
      setOutputs([
        {
          name: `${safeName(recordName)}.${ext}`,
          blob,
        },
      ]);
      stream.current?.getTracks().forEach(t => t.stop());
      stream.current = null;
      setRecording(false);
      setBusy(false);
      setStatus(
        `Enregistrement terminé · ${(blob.size / 1024).toFixed(0)} Ko.`
      );
    };
    recorder.current.onerror = () => {
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      setRecording(false);
      setBusy(false);
      setStatus("Le navigateur a interrompu l’enregistrement. Vérifiez le microphone et recommencez.");
    };
    recorder.current.start();
    setRecording(true);
    setBusy(false);
    setStatus(
      "Micro actif. Cliquez sur Arrêter pour terminer l’enregistrement."
    );
  }
  async function recordVideo(
    file: File,
    mode: "video-trim" | "video-audio",
    range: string,
    setInfo: (value: string) => void,
    signal: AbortSignal
  ): Promise<Output> {
    if (typeof MediaRecorder === "undefined")
      throw new Error("L’enregistrement de flux n’est pas pris en charge.");
    const source = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = source;
    v.preload = "auto";
    v.playsInline = true;
    let captureStream: MediaStream | null = null;
    let activeRecorder: MediaRecorder | null = null;
    try {
      await once(v, "loadedmetadata");
      if (signal.aborted) throw new DOMException("Annulé", "AbortError");
      let start = 0,
        end = v.duration;
      if (mode === "video-trim") [start, end] = parseSeconds(range, v.duration);
      if (end - start > 120)
        throw new Error(
          "Limite de 2 minutes par extrait pour protéger la mémoire."
        );
      await seekVideo(v, start);
      const capture =
        (v as any).captureStream?.() || (v as any).mozCaptureStream?.();
      if (!capture)
        throw new Error(
          "captureStream n’est pas disponible dans ce navigateur."
        );
      const tracks =
        mode === "video-audio" ? capture.getAudioTracks() : capture.getTracks();
      if (!tracks.length) throw new Error("Aucune piste audio détectée.");
      const streamOut = new MediaStream(tracks);
      captureStream = streamOut;
      const mime = mediaRecorderType(
        mode === "video-audio"
          ? ["audio/webm;codecs=opus", "audio/webm"]
          : ["video/webm;codecs=vp9,opus", "video/webm"]
      );
      if (!mime) throw new Error("Aucun codec WebM compatible.");
      const rec = new MediaRecorder(streamOut, {
          mimeType: mime,
          videoBitsPerSecond: 2_000_000,
        }),
        parts: BlobPart[] = [];
      activeRecorder = rec;
      const completed = new Promise<Blob>((resolve, reject) => {
        rec.ondataavailable = e => {
          if (e.data.size) parts.push(e.data);
        };
        rec.onerror = () =>
          reject(new Error("Enregistrement interrompu par le navigateur."));
        rec.onstop = () =>
          resolve(new Blob(parts, { type: mime.split(";")[0] }));
      });
      void completed.catch(() => { /* Le chemin principal restitue l’erreur lors de l’attente. */ });
      rec.start(250);
      await v.play();
      setInfo(`Capture en cours · ${formatTime(end - start)} à enregistrer en temps réel. Vous pouvez annuler.`);
      const timeout = Math.min(120_000, (end - start) * 1000);
      await new Promise<void>((resolve, reject) => {
        const aborted = () => { clearTimeout(timer); reject(new DOMException("Annulé", "AbortError")); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, timeout);
        if (signal.aborted) aborted();
        else signal.addEventListener("abort", aborted, { once: true });
      });
      if (rec.state !== "inactive") rec.stop();
      v.pause();
      const blob = await completed;
      return {
        name:
          stem(file.name) +
          (mode === "video-audio" ? "-audio.webm" : "-extrait.webm"),
        blob,
        note: `${formatTime(end - start)} · export WebM natif navigateur`,
      };
    } finally {
      if (activeRecorder?.state === "recording") activeRecorder.stop();
      captureStream?.getTracks().forEach(track => track.stop());
      v.pause();
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(source);
    }
  }
  function startRecordingButton() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setBusy(true);
    void startRecording().catch(e => {
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      setBusy(false);
      setStatus(e instanceof Error ? e.message : String(e));
    });
  }
  function choose(tool: FileTool) {
    if (locked) return;
    const nextRecent = [tool.id, ...recentIds.filter(id => id !== tool.id)].slice(0, 8);
    setRecentIds(nextRecent);
    try { localStorage.setItem("kitt-tool-recent-v1", JSON.stringify(nextRecent)); } catch { /* historique facultatif */ }
    speakSiteAnnouncement(`${tool.title}. Outil sélectionné. ${tool.description}`, { replacePending: true, rate: 0.86, pitch: 0.84 });
    openTool(tool);
    setTimeout(() => {
      workbench.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      document.getElementById("workbench-title")?.focus({ preventScroll: true });
    }, 30);
  }
  function toggleFavorite(tool: FileTool) {
    const next = favoriteIds.includes(tool.id) ? favoriteIds.filter(id => id !== tool.id) : [tool.id, ...favoriteIds];
    setFavoriteIds(next);
    try { localStorage.setItem("kitt-tool-favorites-v1", JSON.stringify(next)); } catch { /* favoris facultatifs */ }
  }

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div className="tools-hero-scan" />
        <div className="tools-hero-copy">
          <span className="tools-kicker">
            <span className="tools-live-dot" />
            KITT FRANCO-BELGE · LABORATOIRE NUMÉRIQUE
          </span>
          <h1>
            Vos outils.
            <br />
            <em>À portée de clic.</em>
          </h1>
          <p>
            Transformez vos vidéos, sons, images et documents avec des outils
            gratuits ouverts dans le navigateur. Pour les formats pris en
            charge, vos fichiers restent sur votre appareil.
          </p>
          <div className="tools-hero-badges">
            <span>
              <ShieldCheck size={16} />
              Traitement local
            </span>
            <span>
              <Sparkles size={16} />
              Sans compte
            </span>
            <span>
              <BadgeCheck size={16} />
              Licences affichées
            </span>
          </div>
          <div className="tools-hero-actions">
            <a className="tools-primary-link" href="#catalogue-outils"><Wrench size={17} /> Trouver mon outil <ArrowRight size={16} /></a>
            <a href="#outils-quotidiens">Outils du quotidien <ArrowDown size={15} /></a>
          </div>
          <p className="tools-hero-signature">CONÇU PAR MANIX <span>POUR KITT FRANCO-BELGE</span></p>
        </div>
        <div className="tools-hero-visual" aria-hidden="true">
          <div className="tools-orbit tools-orbit-a" />
          <div className="tools-orbit tools-orbit-b" />
          <div className="tools-core">
            <Wrench size={40} />
          </div>
          <i className="tools-star star-a" />
          <i className="tools-star star-b" />
        </div>
      </section>
      <div className="tools-privacy">
        <Info size={18} />
        <p>
          <strong>Confidentialité :</strong> le catalogue, le Studio Image et le
          Studio PDF traitent les fichiers dans votre navigateur. Manix Voice
          Studio envoie explicitement sa référence de voix et le passage choisi
          au moteur AGX par HTTPS pour les convertir ; ses limites et sa durée
          de conservation sont expliquées dans le studio. Le navigateur peut
          conserver son historique. Vérifiez vos droits sur les fichiers.
        </p>
        <a href="/outils-licences.html">Licences et limites →</a>
      </div>
      <a className="tools-image-studio-promo" href="/kyronext-linux/">
        <span className="tools-image-studio-icon"><MonitorPlay size={22} /></span>
        <span className="tools-image-studio-copy">
          <small>LINUX LIVE · 0.1 DEVELOPER PREVIEW · BY MANIX</small>
          <strong>Kyronext OS</strong>
          <span>Un véritable bureau Debian et KDE, une identité personnalisable. Présentation vocale et fiche technique ; nouvelle ISO publique disponible en deux parties.</span>
        </span>
        <span className="tools-image-studio-action">Découvrir le système <ArrowRight size={16} /></span>
      </a>
      <a className="tools-image-studio-promo" href="/studio-image">
        <span className="tools-image-studio-icon"><ImageIcon size={22} /></span>
        <span className="tools-image-studio-copy">
          <small>NOUVEAU · BY MANIX</small>
          <strong>Studio Image</strong>
          <span>Retouche, détourage de personne et montage photo dans ton navigateur.</span>
        </span>
        <span className="tools-image-studio-action">Ouvrir le studio <ArrowRight size={16} /></span>
      </a>
      <a className="tools-image-studio-promo tools-voice-studio-promo" href="/studio-voix">
        <span className="tools-image-studio-icon"><Mic size={22} /></span>
        <span className="tools-image-studio-copy">
          <small>NOUVEAU · BÊTA AGX · VOIX AUTORISÉE</small>
          <strong>Manix Voice Studio</strong>
          <span>Enregistre une voix, convertis un court audio ou crée une lecture parlée avec le timbre autorisé.</span>
        </span>
        <span className="tools-image-studio-action">Découvrir le studio <ArrowRight size={16} /></span>
      </a>
      <div className="tools-utility-links" aria-label="Autres outils KITT">
        <a href="/studio-pdf" className="tools-utility-card">
          <span className="tools-utility-icon"><FileText size={19} /></span>
          <span><small>NOUVEL ATELIER VISUEL</small><strong>Studio PDF</strong><em>Voir, réordonner, tourner et fusionner les pages</em></span>
          <ArrowRight size={16} />
        </a>
        <a href="/studio-voix" className="tools-utility-card tools-voice-utility-card">
          <span className="tools-utility-icon"><Mic size={19} /></span>
          <span><small>NOUVEL ATELIER AUDIO · BÊTA AGX</small><strong>Manix Voice Studio</strong><em>Enregistre, transforme et écoute une voix autorisée</em></span>
          <ArrowRight size={16} />
        </a>
        <a href="/kitt-media-lab/" className="tools-utility-card">
          <span className="tools-utility-icon"><FileImage size={19} /></span>
          <span><small>APPLICATION WINDOWS 11</small><strong>KITT Media Lab</strong><em>5 outils locaux · présentation et téléchargement</em></span>
          <ArrowRight size={16} />
        </a>
        <a href="/kitt-relay/" className="tools-utility-card">
          <span className="tools-utility-icon relay"><FolderOpen size={19} /></span>
          <span><small>TRANSFERT ENTRE APPAREILS</small><strong>KITT Relais</strong><em>Envoie un fichier directement sur le réseau local</em></span>
          <ArrowRight size={16} />
        </a>
      </div>
      <section className="tools-starter" aria-labelledby="tools-starter-title">
        <div className="tools-starter-heading">
          <div>
            <span className="tools-kicker">
              LE GARAGE EST OUVERT · BY MANIX
            </span>
            <h2 id="tools-starter-title">
              Choisissez, transformez, récupérez.
            </h2>
            <p>
              Pas de compte ni d’envoi de fichier : le navigateur fait le
              travail sur votre appareil.
            </p>
          </div>
          <span className="tools-starter-stamp">
            <ShieldCheck size={17} /> LOCAL · GRATUIT · SANS TÉLÉVERSEMENT
          </span>
        </div>
        <div className="tools-flow" aria-label="Mode d’emploi en trois étapes">
          <div>
            <b>01</b>
            <span>
              <strong>Ouvrez un outil</strong>
              <small>Filtrez par format ou cherchez un besoin.</small>
            </span>
          </div>
          <div>
            <b>02</b>
            <span>
              <strong>Choisissez vos fichiers</strong>
              <small>Glissez-les dans la zone ou parcourez le PC.</small>
            </span>
          </div>
          <div>
            <b>03</b>
            <span>
              <strong>Vérifiez puis téléchargez</strong>
              <small>
                Un aperçu confirme les médias avant l’enregistrement.
              </small>
            </span>
          </div>
        </div>
        <div className="tools-featured-heading">
          <span className="tools-kicker">RACCOURCIS DU GARAGE</span>
          <span>Ouvrir directement un atelier</span>
        </div>
        <div className="tools-featured-grid">
          {FEATURED_IDS.map(id => {
            const tool = TOOLS.find(item => item.id === id)!;
            const Icon = tool.icon;
            return (
              <button
                type="button"
                className="tools-featured-card"
                key={tool.id}
                onClick={() => choose(tool)}
                disabled={locked}
              >
                <span className="tool-card-icon">
                  <Icon size={19} />
                </span>
                <span>
                  <small>{tool.group}</small>
                  <strong>{tool.title}</strong>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
      {selected && (
        <section ref={workbench} className="tool-workbench" aria-labelledby="workbench-title">
          <div className="workbench-heading">
            <div>
              <span className="tools-kicker">
                OUTIL SÉLECTIONNÉ · {selected.group.toUpperCase()}
              </span>
              <h2 id="workbench-title" tabIndex={-1}>{selected.title}</h2>
              <p>{selected.description}</p>
              {selected.hint && (
                <p className="tool-hint">
                  <Info size={15} />
                  {selected.hint}
                </p>
              )}
            </div>
            <button
              type="button"
              className={`workbench-favorite ${favoriteIds.includes(selected.id) ? "is-favorite" : ""}`}
              onClick={() => toggleFavorite(selected)}
              aria-pressed={favoriteIds.includes(selected.id)}
              aria-label={favoriteIds.includes(selected.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
              title={favoriteIds.includes(selected.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Star fill={favoriteIds.includes(selected.id) ? "currentColor" : "none"} />
            </button>
            <button type="button" className="workbench-close" disabled={locked} onClick={() => openTool(selected)} aria-label="Vider les fichiers et réinitialiser les réglages" title="Réinitialiser l’outil"><RotateCcw size={18} /></button>
            <button
              type="button"
              className="workbench-close"
              onClick={() => {
                setSelected(null);
                setFiles([]);
                setOutputs([]);
                setStatus("");
              }}
              aria-label="Fermer l’outil"
              disabled={locked}
            >
              <X />
            </button>
          </div>
          <div className="workbench-body">
            <div className="workbench-inputs">
              <details className="tool-output-settings">
                <summary>Nom des fichiers exportés <span>Personnaliser</span></summary>
              <label className="tool-option tool-name-mask">
                Modèle de nom
                <input
                  value={filenameTemplate}
                  maxLength={72}
                  onChange={e => {
                    setFilenameTemplate(e.target.value);
                    try { localStorage.setItem("kitt-tool-filename-template-v1", e.target.value); } catch { /* préférence facultative */ }
                  }}
                  placeholder="{nom}-{outil}-{date}"
                  aria-label="Masque du nom de fichier exporté"
                />
                <small>
                  Variables : <code>{"{nom}"}</code> nom d’origine, <code>{"{outil}"}</code> outil utilisé, <code>{"{date}"}</code> date du jour. L’extension du fichier reste adaptée.
                </small>
              </label>
              </details>
              {selected.id !== "audio-record" && (
                <>
                  <label
                    className={`tool-file-picker ${dragging ? "is-dragging" : ""}`}
                    onDragEnter={e => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => {
                      if (
                        !e.currentTarget.contains(
                          e.relatedTarget as Node | null
                        )
                      )
                        setDragging(false);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      setDragging(false);
                      selectFiles(e.dataTransfer.files);
                    }}
                  >
                    <HardDriveUpload size={22} />
                    <strong>
                      {files.length
                        ? `${files.length} fichier(s) sélectionné(s)`
                        : selected.multiple
                          ? "Glissez ici ou choisissez plusieurs fichiers"
                          : "Glissez ici ou choisissez un fichier"}
                    </strong>
                    <span>
                      {selected.multiple && files.length > 0 ? "Ajoutez d’autres fichiers · " : ""}
                      Traitement local · limite{" "}
                      {selected.group === "Audio"
                        ? "100 Mo pour l’audio"
                        : selected.group === "PDF" &&
                            selected.id !== "image-pdf"
                          ? "150 Mo pour les PDF"
                          : "512 Mo par fichier"}
                    </span>
                    <input
                      ref={input}
                      type="file"
                      accept={selected.accept}
                      multiple={selected.multiple}
                      disabled={locked}
                      onChange={e => {
                        selectFiles(e.currentTarget.files || []);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {files.length > 0 && <div className="tool-file-summary"><span>{files.length} fichier{files.length > 1 ? "s" : ""} · {formatBytes(files.reduce((total, file) => total + file.size, 0))}{selected.multiple ? " · ordre de traitement ↓" : ""}</span><button type="button" disabled={locked} onClick={() => { setFiles([]); setOutputs([]); setMediaMeta(""); setStatus("Sélection vidée."); }}>Tout retirer</button></div>}
                  {files.map((f, index) => (
                    <div className="tool-file-row" key={`${f.name}-${f.size}-${f.lastModified}`}>
                      {selected.multiple ? <b className="tool-file-index">{String(index + 1).padStart(2, "0")}</b> : <FileText size={16} />}
                      <span title={f.name}>{f.name}<small>{formatBytes(f.size)}</small></span>
                      <div className="tool-file-actions">
                        {selected.multiple && <><button type="button" disabled={locked || index === 0} onClick={() => moveFile(index, -1)} aria-label={`Monter ${f.name}`} title="Monter"><ArrowUp size={14} /></button><button type="button" disabled={locked || index === files.length - 1} onClick={() => moveFile(index, 1)} aria-label={`Descendre ${f.name}`} title="Descendre"><ArrowDown size={14} /></button></>}
                        <button type="button" disabled={locked} onClick={() => { setFiles(current => current.filter((_, i) => i !== index)); setOutputs([]); setStatus("Fichier retiré de la sélection."); }} aria-label={`Retirer ${f.name}`} title="Retirer"><X size={14} /></button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {selected.id === "video-thumb" ||
              selected.id === "video-info" ||
              selected.id === "video-trim" ||
              selected.id === "video-audio" ||
              selected.id === "video-frames" ||
              selected.id === "video-contact-sheet" ? (
                files[0] && preview ? (
                  <div className="media-preview">
                    <video
                      ref={video}
                      src={preview}
                      controls
                      playsInline
                      onLoadedMetadata={e => {
                        const v = e.currentTarget;
                        setMediaMeta(
                          `${v.videoWidth} × ${v.videoHeight} · ${formatTime(v.duration)}`
                        );
                      }}
                      onRateChange={e =>
                        setPlaybackRate(e.currentTarget.playbackRate)
                      }
                      onLoadedData={e => {
                        e.currentTarget.playbackRate = playbackRate;
                      }}
                    />
                    <div className="media-controls">
                      <span>{mediaMeta || "Lecture locale"}</span>
                      <label>
                        Vitesse{" "}
                        <select
                          value={playbackRate}
                          onChange={e =>
                            setPlaybackRate(Number(e.target.value))
                          }
                        >
                          <option value={0.5}>0,5×</option>
                          <option value={0.75}>0,75×</option>
                          <option value={1}>1×</option>
                          <option value={1.25}>1,25×</option>
                          <option value={1.5}>1,5×</option>
                          <option value={2}>2×</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null
              ) : null}
              {selected.group === "Audio" && files[0] && preview && (
                <div className="media-preview audio-preview">
                  <audio
                    controls
                    src={preview}
                    onLoadedMetadata={e => {
                      const audio = e.currentTarget;
                      setMediaMeta(
                        `${formatTime(audio.duration)} · ${files[0].type || "format détecté par le navigateur"}`
                      );
                    }}
                  />
                  <div className="media-controls">
                    <span>{mediaMeta || "Écoute locale avant traitement"}</span>
                  </div>
                </div>
              )}
              {selected.id === "audio-record" && (
                <div className="recorder-panel">
                  <label className="tool-option">
                    Microphone de cet appareil
                    <select
                      value={selectedMicrophone}
                      onChange={event => setSelectedMicrophone(event.target.value)}
                      disabled={recording}
                      aria-label="Choisir le microphone de cet appareil"
                    >
                      <option value="">Microphone par défaut du navigateur</option>
                      {microphones.map((microphone, index) => (
                        <option key={microphone.deviceId || `micro-${index}`} value={microphone.deviceId}>
                          {microphone.label || `Microphone ${index + 1} (nom masqué par le navigateur)`}
                        </option>
                      ))}
                    </select>
                    <small>La capture utilise le micro du navigateur sur votre appareil, pas celui du serveur KITT. Les noms peuvent rester masqués jusqu’à l’autorisation micro.</small>
                  </label>
                  <div className="recorder-state">
                    <div className={`recorder-led ${recording ? "recording" : ""}`} />
                    <p>
                      {recording
                        ? "Le microphone enregistre dans votre navigateur."
                        : "Aucun enregistrement sans votre clic et l’autorisation du navigateur."}
                    </p>
                  </div>
                </div>
              )}
              {TEXT_INPUT_IDS.has(selected.id) &&
                (selected.textPrompt ? (
                  <label className="tool-option tool-text-option">
                    {selected.textPrompt}
                    <textarea
                      className="tool-textarea"
                      value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Ex. CONFIDENTIEL"
                      aria-label={selected.textPrompt}
                    />
                  </label>
                ) : (
                  <textarea
                    className="tool-textarea"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={
                      selected.id === "compare-text"
                        ? "Collez la première version ici…"
                        : selected.accept
                          ? "Optionnel : vous pouvez aussi coller le contenu ici."
                          : "Collez ou saisissez votre texte ici…"
                    }
                    aria-label={
                      selected.id === "compare-text"
                        ? "Premier texte à comparer"
                        : "Texte à traiter"
                    }
                  />
                ))}
              {selected.option && selected.id !== "audio-trim" && selected.id !== "video-trim" && (
                <label className="tool-option">
                  {selected.option}
                  {selected.id === "media-convert" ? (
                    <select value={option || "mp4"} onChange={e => setOption(e.target.value)}>
                      <option value="mp4">MP4 · vidéo universelle</option><option value="webm">WebM · web</option>
                      <option value="avi">AVI · vidéo classique</option><option value="mpeg">MPEG · vidéo DVD</option>
                      <option value="mp3">MP3 · audio</option><option value="wav">WAV · audio sans perte</option>
                    </select>
                  ) : selected.id === "image-convert" ? (
                    <select
                      value={option || "WebP"}
                      onChange={e => setOption(e.target.value)}
                    >
                      <option>WebP</option>
                      <option>JPEG</option>
                      <option>PNG</option>
                    </select>
                  ) : selected.id === "pdf-rotate" ? (
                    <select value={option || "90"} onChange={e => setOption(e.target.value)}><option value="90">90° · quart de tour à droite</option><option value="180">180° · demi-tour</option><option value="270">270° · quart de tour à gauche</option></select>
                  ) : selected.id === "srt-vtt" ? (
                    <select
                      value={option}
                      onChange={e => setOption(e.target.value)}
                    >
                      <option value="srt">SRT vers WebVTT</option>
                      <option value="vtt">WebVTT vers SRT</option>
                    </select>
                  ) : selected.id === "compare-text" ? (
                    <textarea
                      className="tool-textarea tool-second-text"
                      value={option}
                      onChange={e => setOption(e.target.value)}
                      placeholder={selected.placeholder}
                      aria-label="Second texte à comparer"
                    />
                  ) : selected.id === "image-contact-sheet" ? (
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={option}
                      onChange={e => setOption(e.target.value)}
                      placeholder={selected.placeholder}
                    />
                  ) : (
                    <input
                      value={option}
                      onChange={e => setOption(e.target.value)}
                      placeholder={selected.placeholder}
                    />
                  )}
                </label>
              )}
              {selected.id === "media-convert" && !["mp3", "wav"].includes(option || "mp4") && files.some(file => file.type.startsWith("video/")) && (
                <label className="tool-option">
                  Vitesse et résolution vidéo
                  <select value={videoSize} onChange={event => setVideoSize(event.target.value as "720" | "480" | "source")}>
                    <option value="source">Accéléré · encodeur natif · résolution d’origine</option>
                    <option value="720">Réduire à 720p maximum · conversion plus lente</option>
                    <option value="480">Réduire à 480p maximum · conversion plus lente</option>
                  </select>
                  <small>Le mode accéléré utilise l’encodeur vidéo du navigateur et conserve tous les détails. Les modes 720p et 480p passent par FFmpeg.</small>
                </label>
              )}
              {(selected.id === "audio-trim" || selected.id === "video-trim") && (
                <fieldset className="tool-range-fieldset"><legend>Plage à conserver</legend><div className="tool-trim-controls">
                  <label><span>Début (secondes)</span><input type="number" min="0" step="0.1" value={option.split(";")[0] || ""} placeholder="0" onChange={e => setOption(`${e.target.value};${option.split(";")[1] || ""}`)} /></label>
                  <label><span>Fin (secondes)</span><input type="number" min="0" step="0.1" value={option.split(";")[1] || ""} placeholder="15" onChange={e => setOption(`${option.split(";")[0] || "0"};${e.target.value}`)} /></label>
                </div></fieldset>
              )}
              {selected.id === "audio-normalize" && (
                <label className="tool-option tool-quality">
                  Niveau de crête cible <strong>{normalizeTarget}%</strong>
                  <input type="range" min="70" max="99" step="1" value={normalizeTarget} onChange={e => setNormalizeTarget(Number(e.target.value))} aria-label="Niveau de crête audio cible" />
                  <small>Réglez la marge avant écrêtage : plus le pourcentage est bas, plus la sortie reste douce.</small>
                </label>
              )}
              {selected.id === "image-contact-sheet" && (
                <label className="tool-option">
                  Légendes sous les miniatures
                  <select
                    value={contactSheetLabelMode}
                    onChange={e =>
                      setContactSheetLabelMode(
                        e.target.value as "filename" | "number" | "hidden"
                      )
                    }
                  >
                    <option value="filename">Afficher les noms de fichiers</option>
                    <option value="number">Remplacer par des numéros</option>
                    <option value="hidden">Masquer les légendes</option>
                  </select>
                  <small>
                    Ce réglage concerne le PNG créé. Les noms restent visibles dans la liste des fichiers sélectionnés.
                  </small>
                </label>
              )}
              {selected.id === "image-convert" ||
              selected.id === "image-resize" ? (
                <label className="tool-option tool-quality">
                  Qualité JPEG / WebP <strong>{quality}%</strong>
                  <input
                    type="range"
                    min="40"
                    max="100"
                    step="1"
                    value={quality}
                    onChange={e => setQuality(Number(e.target.value))}
                    aria-label="Qualité de sortie de l’image"
                  />
                  <small>
                    PNG reste sans perte; le réglage de qualité s’applique au
                    JPEG et au WebP.
                  </small>
                </label>
              ) : null}
              {selected.id === "base64" && (
                <label className="tool-option">
                  Sens de conversion
                  <select
                    value={option || "encoder"}
                    onChange={e => setOption(e.target.value)}
                  >
                    <option value="encoder">Texte vers Base64</option>
                    <option value="decoder">Base64 vers texte</option>
                  </select>
                </label>
              )}
              <button
                type="button"
                className="tool-run"
                disabled={
                  (busy && !recording) ||
                  (!files.length && !text.trim() && selected.id !== "audio-record") ||
                  (selected.id === "pdf-watermark" && (!files.length || !text.trim())) ||
                  ((selected.id === "pdf-merge" || selected.id === "audio-join") && files.length < 2)
                }
                onClick={
                  selected.id === "audio-record"
                    ? startRecordingButton
                    : processTool
                }
              >
                {recording ? (
                  <>
                    <X size={17} /> Arrêter et récupérer l’enregistrement
                  </>
                ) : busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Traitement en
                    cours…
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> Lancer l’outil
                  </>
                )}
              </button>
              {busy && !recording && <button type="button" className="tool-cancel" onClick={() => { job.current?.abort(); cancelActive.current?.(); setStatus("Annulation demandée…"); }}><X size={15} /> Annuler le traitement</button>}
              <p className="tool-run-help">{recording ? "Le micro est actif jusqu’à votre arrêt." : selected.multiple ? "L’export suit l’ordre de votre sélection. Vos originaux sont conservés." : "Un nouveau fichier sera créé. Votre original est conservé."}</p>
              <p className="tool-status" role="status" aria-live="polite">
                {status || ""}
              </p>
              {busy && (
                <div className={`tool-progress ${toolProgress === null ? "is-indeterminate" : ""}`} role="progressbar" aria-label="Progression du traitement" aria-valuemin={0} aria-valuemax={100} aria-valuenow={toolProgress ?? undefined}>
                  <span style={toolProgress === null ? undefined : { width: `${toolProgress}%` }} />
                  <small>{toolProgress === null ? "Traitement en cours" : `${toolProgress} %`}</small>
                </div>
              )}
            </div>
            <div className="workbench-results">
              {outputs.length > 0 ? (
                <>
                  <h3>
                    <BadgeCheck size={18} /> Résultats prêts
                  </h3>
                  {outputs.length > 1 && (
                    <button type="button" className="download-all" onClick={() => void downloadOutputBundle()}>
                      <FileArchive size={15} /> Tout télécharger (.zip)
                    </button>
                  )}
                  {outputs.map((result, i) => {
                    const url = downloads[i]?.url;
                    return (
                      <div
                        className="output-result"
                        key={`${result.name}-${i}`}
                      >
                        {url && result.blob.type.startsWith("image/") && (
                          <img
                            className="result-image-preview"
                            src={url}
                            alt={`Aperçu de ${result.name}`}
                            loading="lazy"
                          />
                        )}
                        {url && result.blob.type.startsWith("audio/") && (
                          <audio
                            className="result-audio-preview"
                            controls
                            preload="metadata"
                            src={url}
                            aria-label={`Écouter ${result.name}`}
                          />
                        )}
                        {url && result.blob.type.startsWith("video/") && (
                          <video
                            className="result-video-preview"
                            controls
                            preload="metadata"
                            src={url}
                            aria-label={`Lire ${result.name}`}
                          />
                        )}
                        {url && result.blob.type === "application/pdf" && (
                          <a
                            className="result-pdf-preview"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ouvrir l’aperçu PDF dans un nouvel onglet ↗
                          </a>
                        )}
                        <ResultText result={result} />
                        <div className="output-row">
                          <span>
                            <strong>{result.name}</strong>
                            {result.note && <small>{result.note}</small>}
                            <small className="result-file-size">{formatBytes(result.blob.size)}</small>
                          </span>
                          <button
                            type="button"
                            onClick={() => download(result.blob, result.name)}
                          >
                            <ArrowDownToLine size={16} /> Télécharger
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <p>Les fichiers originaux ne sont jamais remplacés.</p>
                </>
              ) : (
                <div className="results-empty">
                  <span className="result-shield">
                    <ShieldCheck />
                  </span>
                  <strong>Prêt quand vous l’êtes</strong>
                  <span>Choisissez un fichier puis lancez l’outil.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="tools-catalog" id="catalogue-outils" aria-label="Catalogue des outils">
        <div className="tools-section-heading">
          <div>
            <span className="tools-kicker">ATELIER KITT</span>
            <h2>Qu’est-ce qu’on transforme&nbsp;?</h2>
          </div>
          <span className="tools-count">{TOOLS.length} outils · gratuits</span>
        </div>
        <div className="tools-browser">
          <aside className="tools-filters">
            <label className="tools-search">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chercher un outil…"
                aria-label="Chercher un outil"
              />
              {search && <button type="button" className="tools-clear-search" onClick={() => setSearch("")} aria-label="Effacer la recherche"><X size={14} /></button>}
            </label>
            <div className="tools-view-tabs" role="group" aria-label="Vue du catalogue">
              <button type="button" className={toolView === "all" ? "active" : ""} aria-pressed={toolView === "all"} onClick={() => setToolView("all")}><Wrench size={14}/> Tous <span>{TOOLS.length}</span></button>
              <button type="button" className={toolView === "favorites" ? "active" : ""} aria-pressed={toolView === "favorites"} onClick={() => setToolView("favorites")}><Star size={14}/> Favoris <span>{favoriteIds.length}</span></button>
              <button type="button" className={toolView === "recent" ? "active" : ""} aria-pressed={toolView === "recent"} onClick={() => setToolView("recent")}><History size={14}/> Récents <span>{recentIds.length}</span></button>
            </div>
            {(toolView === "favorites" && favoriteIds.length > 0 || toolView === "recent" && recentIds.length > 0) && (
              <button
                type="button"
                className="tools-clear-saved"
                onClick={() => {
                  const favorites = toolView === "favorites";
                  const key = favorites ? "kitt-tool-favorites-v1" : "kitt-tool-recent-v1";
                  try { localStorage.removeItem(key); } catch { /* stockage local facultatif */ }
                  if (favorites) setFavoriteIds([]); else setRecentIds([]);
                  setCatalogNotice(favorites ? "Favoris effacés de ce navigateur." : "Historique récent effacé de ce navigateur.");
                }}
              >
                <RotateCcw size={13} /> Effacer {toolView === "favorites" ? "les favoris" : "les récents"}
              </button>
            )}
            <span className="tools-sr-only" role="status" aria-live="polite">{catalogNotice}</span>
            <div className="tools-categories">
              {GROUPS.map(group => (
                <button
                  type="button"
                  key={group}
                  className={category === group ? "active" : ""}
                  onClick={() => setCategory(group)}
                >
                  {group}
                  <span>
                    {group === "Tout"
                      ? TOOLS.length
                      : TOOLS.filter(t => t.group === group).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="tools-side-note">
              <ShieldCheck size={17} />
              <p>
                Choisissez un fichier depuis votre appareil. Rien n’est transmis
                à KITT.
              </p>
            </div>
          </aside>
          <div className="tools-catalog-content">
            <div className="tools-catalog-toolbar">
              <p role="status"><strong>{available.length}</strong> outil{available.length > 1 ? "s" : ""}{category !== "Tout" ? ` · ${category}` : " disponibles"}{search ? ` pour « ${search} »` : ""}</p>
              <div role="group" aria-label="Présentation des outils">
                <button type="button" className={catalogLayout === "cards" ? "active" : ""} aria-pressed={catalogLayout === "cards"} onClick={() => setCatalogLayout("cards")} title="Cartes"><LayoutGrid size={15} /><span>Cartes</span></button>
                <button type="button" className={catalogLayout === "list" ? "active" : ""} aria-pressed={catalogLayout === "list"} onClick={() => setCatalogLayout("list")} title="Liste compacte"><List size={15} /><span>Liste</span></button>
              </div>
            </div>
            <div className={`tools-grid ${catalogLayout === "list" ? "tools-grid-list" : ""}`}>
            {available.slice(0, catalogLimit).map(tool => {
              const Icon = tool.icon;
              return (
                <button
                  type="button"
                  className={`tool-card ${selected?.id === tool.id ? "selected" : ""}`}
                  key={tool.id}
                  onClick={() => choose(tool)}
                  aria-pressed={selected?.id === tool.id}
                  disabled={locked}
                >
                  <span className="tool-card-icon">
                    <Icon size={21} />
                  </span>
                  {favoriteIds.includes(tool.id) && <span className="tool-card-favorite" aria-label="Outil favori"><Star size={14} fill="currentColor"/></span>}
                  <span className="tool-card-group">{tool.group}</span>
                  <strong>{tool.title}</strong>
                  <span className="tool-card-description">
                    {tool.description}
                  </span>
                  <span className="tool-card-action">
                    Ouvrir l’outil <ChevronDown size={14} />
                  </span>
                </button>
              );
            })}
            {!available.length && (
              <div className="tools-no-results">
                <Search size={28} /><strong>{toolView === "favorites" && !favoriteIds.length ? "Votre garage de favoris est vide" : "Aucun outil ne correspond"}</strong>
                <p>{toolView === "favorites" && !favoriteIds.length ? "Ouvrez un outil puis utilisez son étoile pour le retrouver ici." : "Essayez un autre mot-clé, une autre catégorie ou le catalogue complet."}</p>
                <button type="button" onClick={() => { setSearch(""); setCategory("Tout"); setToolView("all"); }}>Voir tous les outils</button>
              </div>
            )}
            </div>
            {available.length > catalogLimit && <button type="button" className="tools-load-more" onClick={() => setCatalogLimit(limit => limit + 12)}><ChevronDown size={17} /> Afficher {Math.min(12, available.length - catalogLimit)} autres outils <span>{Math.min(catalogLimit, available.length)} / {available.length}</span></button>}
          </div>
        </div>
      </section>
      <section id="outils-quotidiens" className="tools-everyday-section" aria-label="Outils du quotidien"><EverydayTools /></section>
      <section className="tools-bottom">
        <div className="tools-bottom-icon">
          <ShieldCheck size={27} />
        </div>
        <div>
          <span className="tools-kicker">LIBRE ET TRANSPARENT</span>
          <h2>Les règles du laboratoire</h2>
          <p>
            Pas de rip de services vidéo, de retrait de filigrane tiers, de
            déverrouillage DRM ni de transfert caché. On travaille sur les
            fichiers que vous choisissez et sur les formats que le navigateur
            prend en charge.
          </p>
          <a href="/outils-licences">
            Voir les licences, les limites et les attributions →
          </a>
        </div>
      </section>
      <footer className="tools-footer">
        <a href="/">← Retour à KITT Franco-Belge</a>
        <span>BY MANIX · EN COLLABORATION AVEC KNIGHT RIDER FRANCE</span>
        <a href="https://www.facebook.com/groups/757797724622219/" target="_blank" rel="noreferrer">GROUPE FACEBOOK KITT-FRANCO-BELGE ↗</a>
      </footer>
    </main>
  );
}

function parseSeconds(input: string, duration: number): [number, number] {
  const separator = input.includes(";") ? ";" : ",";
  const parts = input
    .split(separator)
    .map(x => Number(x.trim().replace(",", ".")));
  if (
    parts.length !== 2 ||
    parts.some(x => !Number.isFinite(x)) ||
    parts[0] < 0 ||
    parts[1] <= parts[0] ||
    parts[1] > duration
  )
    throw new Error(
      `Entrez un début et une fin entre 0 et ${duration.toFixed(1)} secondes.`
    );
  return [parts[0], parts[1]];
}
function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000),
    h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000),
    milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "durée inconnue";
  const m = Math.floor(seconds / 60),
    s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function once(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
        target.removeEventListener(event, ok);
        target.removeEventListener("error", bad);
        resolve();
      },
      bad = () => {
        target.removeEventListener(event, ok);
        target.removeEventListener("error", bad);
        reject(new Error("Impossible de lire ce fichier vidéo."));
      };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });
}
