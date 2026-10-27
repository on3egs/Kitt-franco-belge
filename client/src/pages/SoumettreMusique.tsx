import { FormEvent, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, ArrowRight, AudioLines, CheckCircle2, FileAudio2, Info, ShieldCheck } from "lucide-react";
import KittScanner from "@/components/KittScanner";
import { getApiBase } from "@/lib/tunnel";
import "./music-pages.css";

type CreationType = "original" | "ai" | "licensed";
type SubmissionMode = "file" | "link";
const MAX_AUDIO_SIZE = 64 * 1024 * 1024;
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} Mio` : `${Math.ceil(bytes / 1024)} Kio`;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", onAbort); resolve(value); }, error => { signal.removeEventListener("abort", onAbort); reject(error); });
  });
}

export default function SoumettreMusique() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<SubmissionMode>("file");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submittedMode, setSubmittedMode] = useState<SubmissionMode>("file");
  const [titre, setTitre] = useState("");
  const [artiste, setArtiste] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [message, setMessage] = useState("");
  const [creationType, setCreationType] = useState<CreationType | "">("");
  const [licenseNote, setLicenseNote] = useState("");
  const [themeNote, setThemeNote] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function chooseAudio(file: File | null) {
    setErrorMsg("");
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLocaleLowerCase();
    if (!AUDIO_EXTENSIONS.includes(extension)) {
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("error");
      setErrorMsg("Choisissez un fichier MP3, WAV, OGG, FLAC ou M4A.");
      return;
    }
    if (file.size > MAX_AUDIO_SIZE) {
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("error");
      setErrorMsg(`Ce fichier pèse ${formatFileSize(file.size)}. La limite est de 64 Mio.`);
      return;
    }
    if (file.size === 0) {
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("error");
      setErrorMsg("Ce fichier est vide. Choisissez un fichier audio valide.");
      return;
    }
    setAudioFile(file); setStatus("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationType || !rightsConfirmed || (mode === "file" && !audioFile) || (mode === "link" && !url.trim())) return;
    setStatus("loading"); setErrorMsg("");
    const controller = new AbortController();
    const isFileUpload = mode === "file";
    const timeoutMs = isFileUpload ? 10 * 60 * 1000 : 30000;
    const timeout = window.setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
    try {
      const base = await withAbort(getApiBase(), controller.signal);
      if (!base) throw new Error("Le service KITT est momentanément injoignable. Réessayez un peu plus tard.");
      let response: Response;
      if (isFileUpload && audioFile) {
        const formData = new FormData();
        formData.append("audio", audioFile, audioFile.name);
        formData.append("titre", titre.trim());
        formData.append("artiste", artiste.trim());
        formData.append("pseudo", pseudo.trim() || "Anonyme");
        formData.append("message", message.trim());
        formData.append("theme", "knight-rider");
        formData.append("creation_type", creationType);
        formData.append("rights_confirmed", "true");
        formData.append("license_note", licenseNote.trim());
        formData.append("theme_note", themeNote.trim());
        response = await fetch(`${base}/api/music-upload`, { method: "POST", signal: controller.signal, headers: { Accept: "application/json" }, body: formData });
      } else {
        response = await fetch(`${base}/api/music-submit`, {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            url: url.trim(), titre: titre.trim(), artiste: artiste.trim(), pseudo: pseudo.trim() || "Anonyme", message: message.trim(),
            theme: "knight-rider", creation_type: creationType, rights_confirmed: true,
            license_note: licenseNote.trim(), theme_note: themeNote.trim(),
          }),
        });
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `La soumission a échoué (erreur ${response.status}).`);
      setSubmittedMode(mode);
      setStatus("ok"); setUrl(""); setTitre(""); setArtiste(""); setPseudo(""); setMessage("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setCreationType(""); setLicenseNote(""); setThemeNote(""); setRightsConfirmed(false);
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof DOMException && error.name === "TimeoutError"
        ? isFileUpload ? "L’envoi a dépassé le délai de 10 minutes. Vérifiez votre connexion et réessayez avec le fichier sélectionné." : "Le délai de réponse est dépassé. Vérifiez votre connexion et réessayez."
        : error instanceof DOMException && error.name === "AbortError" ? "L’envoi a été interrompu. Vérifiez votre connexion et réessayez."
        : error instanceof Error ? error.message : "La soumission n’a pas abouti.");
    } finally { window.clearTimeout(timeout); }
  }

  const licenseLabel = creationType === "ai" ? "Outil IA et statut des droits de publication" : creationType === "licensed" ? "Licence, titulaire des droits et autorisation" : "Origine de la création et statut des droits";
  const licenseHint = creationType === "ai"
    ? "Précisez l’outil utilisé et pourquoi la piste peut être publiée. Une création IA ne donne pas automatiquement le droit de reprendre une musique, un sample ou une voix protégés."
    : creationType === "licensed"
      ? "Indiquez le nom ou l’URL de la licence, son titulaire et en quoi elle autorise la diffusion sur ce site."
      : "Confirmez que vous avez composé et réalisé cette piste, et précisez si elle contient des éléments créés par d’autres personnes.";

  return <main className="music-page music-submit-page">
    <div className="music-atmosphere" aria-hidden="true"><span /></div>
    <div className="music-shell music-submit-shell">
      <Link href="/musique" className="music-back-link"><ArrowLeft size={16} /> Retour à la playlist</Link>
      <header className="music-heading submit-heading">
        <div className="music-eyebrow"><AudioLines size={15} /> CANAL DE TRANSMISSION KITT</div>
        <h1>Proposer une <em>création</em></h1>
        <p>Une piste originale ou créée avec des droits de publication clairs, dans le thème Knight Rider.</p>
        <KittScanner height={5} />
      </header>

      <div className="submission-guide">
        <div className="submission-guide-icon"><FileAudio2 size={23} /></div>
        <div><strong>Envoyez votre fichier directement depuis votre appareil</strong><p>Choisissez un fichier audio : KITT le recevra et, après validation par Manix, le lecteur le servira depuis son stockage. Vous n’avez pas à l’héberger ailleurs. Le service KITT doit être en ligne pendant l’envoi.</p></div>
      </div>

      {status === "ok" ? <section className="submission-success" role="status" aria-live="polite"><CheckCircle2 size={36} /><span className="music-kicker">TRANSMISSION REÇUE</span><h2>Merci pour votre proposition.</h2><p>{submittedMode === "file" ? "Le fichier a été reçu par KITT. Après approbation, le lecteur le servira depuis le stockage du serveur; l’hébergement d’origine n’est pas nécessaire." : "Votre lien est en attente de vérification. Après approbation, il sera ajouté à la playlist."} Manix vérifie chaque proposition avant publication.</p><div className="submission-success-actions"><Link className="music-button primary" href="/musique">Retour à la musique <ArrowRight size={16} /></Link><Link className="music-button secondary" href="/admin">Modération Manix <ArrowRight size={16} /></Link><button className="music-button secondary" type="button" onClick={() => setStatus("idle")}>Proposer une autre piste</button></div></section> : <form className="music-submit-form" onSubmit={handleSubmit}>
        <fieldset className="music-submit-fields" disabled={status === "loading"}>
        <div className="music-upload-mode" role="group" aria-label="Mode d’envoi de la piste">
          <button type="button" className={mode === "file" ? "is-active" : ""} aria-pressed={mode === "file"} onClick={() => { setMode("file"); setStatus("idle"); setErrorMsg(""); }}><FileAudio2 size={17} /> Fichier de mon PC</button>
          <button type="button" className={mode === "link" ? "is-active" : ""} aria-pressed={mode === "link"} onClick={() => { setMode("link"); setStatus("idle"); setErrorMsg(""); }}>Lien audio avancé</button>
        </div>

        {mode === "file" ? <div className="music-upload-panel">
          <label className="music-file-picker" htmlFor="music-audio-file"><FileAudio2 size={23} /><span><strong>{audioFile ? "Remplacer le fichier audio" : "Choisir un fichier audio"}</strong><small>MP3, WAV, OGG, FLAC ou M4A · 64 Mio maximum</small></span><input ref={fileInputRef} id="music-audio-file" type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/mp4" required={mode === "file"} onChange={event => chooseAudio(event.currentTarget.files?.[0] || null)} /></label>
          {audioFile && <div className="music-selected-file"><FileAudio2 size={18} /><span><strong>{audioFile.name}</strong><small>{formatFileSize(audioFile.size)}</small></span><button type="button" aria-label="Retirer le fichier audio choisi" disabled={status === "loading"} onClick={() => { setAudioFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Retirer</button></div>}
          {audioFile && status === "loading" && <p className="music-upload-wait" role="status" aria-live="polite">Envoi de {audioFile.name} ({formatFileSize(audioFile.size)}). Cela peut prendre plusieurs minutes; gardez cette page ouverte.</p>}
          <p className="music-upload-storage"><Info size={16} /> L’envoi transfère une copie au serveur KITT. Si Manix approuve la piste, elle sera conservée sur le serveur et ne dépendra pas d’un hébergeur externe.</p>
        </div> : <label className="music-form-field music-link-field"><span>Lien direct vers le fichier audio <b>*</b></span><input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/ma-piste.mp3" autoComplete="url" /><small>Mode avancé : le lien doit permettre la lecture publique du fichier audio. Son hébergement doit rester accessible.</small></label>}

        <div className="music-form-section-title"><span>01</span><div><h2>La piste</h2><p>Les champs marqués d’un astérisque sont nécessaires.</p></div></div>
        <div className="music-form-grid"><label className="music-form-field"><span>Titre de la piste <b>*</b></span><input type="text" required maxLength={80} value={titre} onChange={event => setTitre(event.target.value)} placeholder="Nom de la création" /></label><label className="music-form-field"><span>Artiste / créateur <b>*</b></span><input type="text" required maxLength={80} value={artiste} onChange={event => setArtiste(event.target.value)} placeholder="Votre nom ou pseudo d’artiste" /></label></div>
        <label className="music-form-field"><span>Pseudo affiché</span><input type="text" maxLength={50} value={pseudo} onChange={event => setPseudo(event.target.value)} placeholder="Anonyme si laissé vide" autoComplete="nickname" /></label>

        <div className="music-form-section-title"><span>02</span><div><h2>Le thème Knight Rider</h2><p>Expliquez le lien avec KITT ou l’univers de la série. La piste proposée doit être une création partageable, pas un enregistrement officiel.</p></div></div>
        <label className="music-form-field"><span>En quoi votre piste s’inspire de Knight Rider / KITT ? <b>*</b></span><textarea required minLength={15} maxLength={500} rows={3} value={themeNote} onChange={event => setThemeNote(event.target.value)} placeholder="Ex. composition électronique originale inspirée par les synthétiseurs et l’ambiance des séries TV des années 1980." /><small>{themeNote.length}/500 · N’incluez pas de musique officielle, de reprise ou de sample sans autorisation.</small></label>

        <div className="music-form-section-title"><span>03</span><div><h2>Origine et droits de publication</h2><p>Un lien public ne signifie pas que son contenu peut être republié. Décrivez les droits associés à votre piste.</p></div></div>
        <fieldset className="music-creation-type"><legend>Type de création <b>*</b></legend><div className="music-choice-grid">
          <label className={creationType === "original" ? "is-selected" : ""}><input type="radio" name="creationType" value="original" required checked={creationType === "original"} onChange={() => setCreationType("original")} /><span className="music-choice-mark" /><span><strong>Originale</strong><small>Composée / réalisée par moi</small></span></label>
          <label className={creationType === "ai" ? "is-selected" : ""}><input type="radio" name="creationType" value="ai" checked={creationType === "ai"} onChange={() => setCreationType("ai")} /><span className="music-choice-mark" /><span><strong>Création IA</strong><small>Avec les droits de publication requis</small></span></label>
          <label className={creationType === "licensed" ? "is-selected" : ""}><input type="radio" name="creationType" value="licensed" checked={creationType === "licensed"} onChange={() => setCreationType("licensed")} /><span className="music-choice-mark" /><span><strong>Sous licence</strong><small>Licence compatible ou autorisation</small></span></label>
        </div></fieldset>
        <label className="music-form-field"><span>{licenseLabel} <b>*</b></span><textarea required minLength={15} maxLength={500} rows={4} value={licenseNote} onChange={event => setLicenseNote(event.target.value)} placeholder={creationType === "licensed" ? "Nom et URL de la licence, titulaire des droits, autorisation de diffusion…" : creationType === "ai" ? "Nom de l’outil, conditions de publication vérifiées, éléments tiers utilisés…" : "Je confirme être l’auteur de la composition et de l’enregistrement…"} /><small>{licenseNote.length}/500 · {licenseHint}</small></label>

        <div className="music-rights-note"><Info size={18} /><p>Les outils d’IA ne confèrent pas à eux seuls une autorisation d’utiliser ou de republier une œuvre protégée. Les reprises, samples, musiques officielles et éléments tiers nécessitent les droits ou autorisations applicables. <a href="https://economie.fgov.be/fr/themes/propriete-intellectuelle/droits-de-propriete/droits-dauteur-et-droits/droits-dauteur/le-droit-dauteur-sur-internet" target="_blank" rel="noreferrer">Guide officiel belge sur le droit d’auteur sur Internet ↗</a></p></div>

        <label className="music-rights-check"><input type="checkbox" required checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} /><span><ShieldCheck size={20} /><span>Je confirme avoir créé cette piste ou détenir les droits et autorisations nécessaires pour la proposer et permettre sa lecture sur ce site. Je n’inclus pas de musique officielle, de reprise, de sample ni d’autre élément protégé sans autorisation. <b>*</b></span></span></label>
        <label className="music-form-field optional-message"><span>Message pour Manix</span><textarea maxLength={300} rows={2} value={message} onChange={event => setMessage(event.target.value)} placeholder="Contexte ou remarque (facultatif)" /></label>

        {status === "error" && <div className="music-submit-error" role="alert"><AlertCircle size={18} /><span>{errorMsg}</span></div>}
        <div className="music-submit-actions"><button className="music-button primary submit-button" type="submit" disabled={status === "loading" || !rightsConfirmed}>{status === "loading" ? "Transmission en cours…" : <>Envoyer pour vérification <ArrowRight size={17} /></>}</button><p>La proposition reste privée en attente d’approbation. L’envoi ne garantit pas sa publication.</p></div>
        </fieldset>
      </form>}
      <footer className="music-footer"><Link href="/musique">← Retour à la playlist</Link><span>BY MANIX · KITT FRANCO-BELGE</span></footer>
    </div>
  </main>;
}
