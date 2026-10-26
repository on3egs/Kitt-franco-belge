import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, ArrowRight, AudioLines, CheckCircle2, FileAudio2, Info, ShieldCheck } from "lucide-react";
import KittScanner from "@/components/KittScanner";
import { getApiBase } from "@/lib/tunnel";
import "./music-pages.css";

type CreationType = "original" | "ai" | "licensed";

export default function SoumettreMusique() {
  const [url, setUrl] = useState("");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationType || !rightsConfirmed) return;
    setStatus("loading"); setErrorMsg("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const base = await getApiBase();
      if (!base) throw new Error("Le service de soumission est momentanément injoignable. Réessayez un peu plus tard.");
      const response = await fetch(`${base}/api/music-submit`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          url: url.trim(), titre: titre.trim(), artiste: artiste.trim(), pseudo: pseudo.trim() || "Anonyme", message: message.trim(),
          theme: "knight-rider", creation_type: creationType, rights_confirmed: true,
          license_note: licenseNote.trim(), theme_note: themeNote.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `La soumission a échoué (erreur ${response.status}).`);
      setStatus("ok"); setUrl(""); setTitre(""); setArtiste(""); setPseudo(""); setMessage("");
      setCreationType(""); setLicenseNote(""); setThemeNote(""); setRightsConfirmed(false);
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof DOMException && error.name === "AbortError" ? "Le délai de réponse est dépassé. Vérifiez votre connexion et réessayez." : error instanceof Error ? error.message : "La soumission n’a pas abouti.");
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
        <div><strong>Préparez un lien MP3 direct et accessible</strong><p>Hébergez le fichier sur un service qui permet la lecture publique sans compte, mot de passe ou page intermédiaire. Collez le lien du fichier audio, pas une page vidéo ou une page de téléchargement.</p></div>
      </div>

      {status === "ok" ? <section className="submission-success" role="status" aria-live="polite"><CheckCircle2 size={36} /><span className="music-kicker">TRANSMISSION REÇUE</span><h2>Merci pour votre proposition.</h2><p>Elle est en attente de vérification. Elle ne sera ajoutée à la playlist qu’après examen et approbation de Manix.</p><div className="submission-success-actions"><Link className="music-button primary" href="/musique">Retour à la musique <ArrowRight size={16} /></Link><button className="music-button secondary" type="button" onClick={() => setStatus("idle")}>Proposer une autre piste</button></div></section> : <form className="music-submit-form" onSubmit={handleSubmit}>
        <div className="music-form-section-title"><span>01</span><div><h2>La piste</h2><p>Les champs marqués d’un astérisque sont nécessaires.</p></div></div>
        <label className="music-form-field"><span>Lien direct vers le fichier audio <b>*</b></span><input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/ma-piste.mp3" autoComplete="url" /><small>Le lien sera utilisé par le lecteur après approbation.</small></label>
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
      </form>}
      <footer className="music-footer"><Link href="/musique">← Retour à la playlist</Link><span>BY MANIX · KITT FRANCO-BELGE</span></footer>
    </div>
  </main>;
}
