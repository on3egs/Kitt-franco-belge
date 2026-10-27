import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowDownUp, ArrowRight, Check, Copy, FileArchive, Files, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, Search, ShieldCheck, Table2, Trash2, Upload, X } from "lucide-react";
import { detectDelimiter, encodeTable, generatePassword, parseTable, renameBatch, safeFileStem, tableHeaders, type CsvDelimiter, type PasswordGroup } from "../lib/everydayTools";
import "./EverydayTools.css";

type Workshop = "table" | "rename" | "password";
const EXAMPLE = 'Nom;Catégorie;Quantité;Note\r\nScanner KITT;Collection;2;"Série limitée; rouge"\r\nMiniature Trans Am;Collection;5;Échelle 1:24\r\nPoster Knight Rider;Décoration;3;Format A3\r\nScanner KITT;Collection;2;"Série limitée; rouge"';
const OPTIONS: { id: Workshop; title: string; detail: string; icon: typeof Table2; label: string }[] = [
  { id: "table", title: "Tableau malin", detail: "Triez, filtrez et nettoyez vos CSV.", icon: Table2, label: "CSV & JSON" },
  { id: "rename", title: "Fichiers bien rangés", detail: "Renommez tout un lot en une fois.", icon: Files, label: "RENOMMAGE" },
  { id: "password", title: "Générateur de mots de passe", detail: "Créez un mot de passe sur votre appareil.", icon: KeyRound, label: "CONFIDENTIALITÉ" },
];
const bytes = (size: number) => size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} Ko` : `${(size / (1024 * 1024)).toFixed(1)} Mo`;
const normalizeTableSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

function saveFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function copyText(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error("La copie automatique est indisponible. Sélectionnez le résultat et utilisez Ctrl+C.");
  await navigator.clipboard.writeText(text);
}

function TableWorkshop() {
  const [source, setSource] = useState("");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(";");
  const [firstHeader, setFirstHeader] = useState(true);
  const [dedupe, setDedupe] = useState(false);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [formulaSafe, setFormulaSafe] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState("mon-tableau");
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const table = useMemo(() => {
    try {
      if (source.length > 2 * 1024 * 1024) throw new Error("Limite de 2 Mo pour ce tableau. Réduisez le fichier avant de l’ouvrir.");
      const parsed = parseTable(source, delimiter);
      if (!parsed.length) return { headers: [], rows: [], originalCount: 0, error: "" };
      const width = Math.max(...parsed.map(row => row.length));
      const headers = tableHeaders(firstHeader ? parsed[0] : [], width);
      const original = (firstHeader ? parsed.slice(1) : parsed).map(row => Array.from({ length: width }, (_, i) => row[i] ?? ""));
      let rows = skipEmpty ? original.filter(row => row.some(cell => cell.trim())) : original;
      if (dedupe) {
        const seen = new Set<string>();
        rows = rows.filter(row => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; });
      }
      const normalized = normalizeTableSearch(query.trim());
      if (normalized) rows = rows.filter(row => row.some(cell => normalizeTableSearch(cell).includes(normalized)));
      if (sort && sort.column < width) {
        const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
        rows = [...rows].sort((a, b) => collator.compare(a[sort.column], b[sort.column]) * (sort.descending ? -1 : 1));
      }
      return { headers, rows, originalCount: original.length, error: "" };
    } catch (error) { return { headers: [], rows: [], originalCount: 0, error: (error as Error).message }; }
  }, [source, delimiter, firstHeader, skipEmpty, dedupe, query, sort]);
  const lastPage = Math.max(0, Math.ceil(table.rows.length / 20) - 1);
  const activePage = Math.min(page, lastPage);
  const shown = table.rows.slice(activePage * 20, activePage * 20 + 20);

  function updateSource(value: string) {
    setSource(value); setDelimiter(detectDelimiter(value)); setSort(null); setPage(0); setQuery(""); setNotice("");
  }
  async function importCsv(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice("Ce fichier dépasse 2 Mo. Ouvrez une partie plus petite."); return; }
    setReading(true);
    try { const text = await file.text(); updateSource(text); setName(file.name.replace(/\.[^.]+$/, "")); }
    catch { setNotice("Impossible de lire ce fichier. Réessayez avec un CSV en UTF-8."); }
    finally { setReading(false); }
  }
  function exportTable(format: "csv" | "json") {
    if (!table.rows.length) return;
    if (format === "csv") saveFile(`\uFEFF${encodeTable([table.headers, ...table.rows], delimiter, formulaSafe)}`, `${safeFileStem(name)}-nettoye.csv`, "text/csv;charset=utf-8");
    else saveFile(JSON.stringify(table.rows.map(row => Object.fromEntries(table.headers.map((header, index) => [header, row[index]]))), null, 2), `${safeFileStem(name)}-nettoye.json`, "application/json");
    setNotice(`${table.rows.length} ligne(s) exportée(s), dans l’ordre et avec le filtre affichés.`);
  }

  return <div className="ed-workspace">
    <div className="ed-guide"><span>01</span><p><strong>Ouvrez un tableau, faites le ménage, récupérez le résultat.</strong> Importez un CSV UTF-8 ou collez son contenu. Les colonnes se trient en cliquant sur leur titre.</p></div>
    <div className="ed-toolbar"><button className="ed-primary" onClick={() => importRef.current?.click()} disabled={reading}>{reading ? <LoaderCircle size={16} className="ed-spin" /> : <Upload size={16} />} Ouvrir un CSV</button><button onClick={() => updateSource(EXAMPLE)}>Essayer un exemple</button><span>2 Mo · 5 000 lignes · 100 colonnes maximum</span><input ref={importRef} hidden type="file" accept=".csv,.tsv,.txt,text/csv" onChange={event => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} /></div>
    <details className="ed-source" open={!source}><summary>Coller ou modifier le CSV source</summary><label className="ed-field">Contenu du tableau<textarea value={source} onChange={event => { setSource(event.target.value); setPage(0); setNotice(""); }} placeholder={'Nom;Quantité\nScanner KITT;2'} spellCheck={false} maxLength={2 * 1024 * 1024} /></label><button className="ed-small" onClick={() => setDelimiter(detectDelimiter(source))}>Détecter le séparateur</button></details>
    <div className="ed-settings"><label className="ed-field">Séparateur<select value={delimiter} onChange={event => { setDelimiter(event.target.value as CsvDelimiter); setSort(null); setPage(0); }}><option value=";">Point-virgule ;</option><option value=",">Virgule ,</option><option value={"\t"}>Tabulation</option><option value="|">Barre verticale |</option></select></label><label className="ed-check"><input type="checkbox" checked={firstHeader} onChange={event => { setFirstHeader(event.target.checked); setSort(null); }} /> Première ligne = titres</label><label className="ed-check"><input type="checkbox" checked={dedupe} onChange={event => setDedupe(event.target.checked)} /> Retirer les doublons identiques</label><label className="ed-check"><input type="checkbox" checked={skipEmpty} onChange={event => setSkipEmpty(event.target.checked)} /> Retirer les lignes vides</label></div>
    {table.error ? <p className="ed-message ed-error" role="alert">{table.error}</p> : table.headers.length ? <>
      <div className="ed-table-top"><label className="ed-search"><Search size={16} /><input type="search" aria-label="Filtrer les lignes du tableau" placeholder="Rechercher dans toutes les colonnes…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label><span><strong>{table.rows.length}</strong> / {table.originalCount} lignes</span></div>
      <div className="ed-table-wrap" tabIndex={0} role="region" aria-label="Aperçu du tableau avec défilement horizontal"><table><thead><tr>{table.headers.map((header, i) => <th key={i} scope="col" aria-sort={sort?.column === i ? sort.descending ? "descending" : "ascending" : "none"}><button onClick={() => { setSort({ column: i, descending: sort?.column === i ? !sort.descending : false }); setPage(0); }} title={`Trier par ${header}`}>{header}<ArrowDownUp size={12} /></button></th>)}</tr></thead><tbody>{shown.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} title={cell}>{cell || <span className="ed-empty-cell">—</span>}</td>)}</tr>)}</tbody></table>{!table.rows.length && <p className="ed-empty">Aucune ligne ne correspond à votre recherche.</p>}</div>
      <div className="ed-pagination"><button disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Précédent</button><span>Page {activePage + 1} / {lastPage + 1} · 20 lignes par page</span><button disabled={activePage >= lastPage} onClick={() => setPage(activePage + 1)}>Suivant</button></div>
      <label className="ed-check ed-protection"><input type="checkbox" checked={formulaSafe} onChange={event => setFormulaSafe(event.target.checked)} /> Protéger le CSV contre l’exécution de formules dans un tableur<span>Ajoute une apostrophe aux valeurs commençant par =, +, − ou @. Le JSON garde les textes d’origine.</span></label>
      <div className="ed-toolbar ed-export"><button className="ed-primary" disabled={!table.rows.length} onClick={() => exportTable("csv")}><ArrowDownToLine size={16} /> Télécharger le CSV</button><button disabled={!table.rows.length} onClick={() => exportTable("json")}><ArrowDownToLine size={16} /> Télécharger le JSON</button><button onClick={() => { setSort(null); setQuery(""); setDedupe(false); setPage(0); }}>Réinitialiser les filtres</button></div>
    </> : <div className="ed-empty"><Table2 size={32} /><strong>Votre tableau vous attend ici.</strong><span>Inventaire, collection, liste de contacts… Chargez un CSV ou testez l’exemple.</span></div>}
    {notice && <p className="ed-message" role="status">{notice}</p>}
    <p className="ed-footnote">Les cellules restent du texte : les zéros initiaux sont conservés. Les titres vides ou identiques sont renommés pour éviter de perdre des colonnes à l’export JSON.</p>
  </div>;
}

function RenameWorkshop() {
  const [files, setFiles] = useState<File[]>([]);
  const [prefix, setPrefix] = useState("collection-kitt");
  const [start, setStart] = useState(1);
  const [digits, setDigits] = useState(3);
  const [lowerExtension, setLowerExtension] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const names = useMemo(() => renameBatch(files.map(file => file.name), prefix, start, digits, lowerExtension), [files, prefix, start, digits, lowerExtension]);
  const total = files.reduce((sum, file) => sum + file.size, 0);

  function chooseFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const next = Array.from(selected);
    if (next.length > 100) { setNotice("Sélectionnez au maximum 100 fichiers à la fois."); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) { setNotice("Ce lot dépasse 50 Mo. Séparez-le en plusieurs petits lots."); return; }
    setFiles(next); setNotice(""); setProgress(0);
  }
  async function exportZip() {
    setBusy(true); setNotice(""); setProgress(0);
    try {
      const { zipSync } = await import("fflate");
      const entries: Record<string, Uint8Array> = Object.create(null);
      for (let index = 0; index < files.length; index++) {
        entries[names[index]] = new Uint8Array(await files[index].arrayBuffer());
        setProgress(Math.round(((index + 1) / files.length) * 90));
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
      const archive = zipSync(entries, { level: 0 });
      saveFile(archive, `${safeFileStem(prefix)}-renommes.zip`, "application/zip");
      setProgress(100); setNotice(`${files.length} copies renommées sont prêtes dans le ZIP. Décompressez-le avec l’Explorateur Windows.`);
    } catch { setNotice("L’archive n’a pas pu être créée. Essayez un lot plus petit ou vérifiez que les fichiers sont toujours disponibles."); }
    finally { setBusy(false); }
  }

  return <div className="ed-workspace">
    <div className="ed-guide"><span>02</span><p><strong>Des noms propres pour vos photos, sons et documents.</strong> Choisissez les fichiers, vérifiez leur nouveau nom, puis récupérez des copies dans un ZIP. Les fichiers de départ restent disponibles sur votre PC.</p></div>
    <div className="ed-toolbar"><button className="ed-primary" onClick={() => picker.current?.click()} disabled={busy}><Upload size={16} /> Choisir les fichiers</button><span>100 fichiers · 50 Mo par lot maximum</span><input ref={picker} type="file" hidden multiple onChange={event => { chooseFiles(event.target.files); event.target.value = ""; }} /></div>
    <div className="ed-settings ed-rename-settings"><label className="ed-field">Début du nom<input value={prefix} maxLength={72} onChange={event => setPrefix(event.target.value)} disabled={busy} placeholder="collection-kitt" /></label><label className="ed-field">Premier numéro<input type="number" min={0} max={999999} value={start} disabled={busy} onChange={event => setStart(Math.max(0, Math.min(999999, Math.trunc(Number(event.target.value) || 0))))} /></label><label className="ed-field">Nombre de chiffres<select value={digits} disabled={busy} onChange={event => setDigits(Number(event.target.value))}><option value={2}>02</option><option value={3}>003</option><option value={4}>0004</option><option value={5}>00005</option></select></label><label className="ed-check"><input type="checkbox" checked={lowerExtension} disabled={busy} onChange={event => setLowerExtension(event.target.checked)} /> Extensions en minuscules</label></div>
    {files.length ? <><div className="ed-table-top"><span><strong>{files.length}</strong> fichier(s) · {bytes(total)}</span><button className="ed-small" disabled={busy} onClick={() => { setFiles([]); setNotice(""); setProgress(0); }}><Trash2 size={14} /> Vider le lot</button></div><div className="ed-rename-list" role="list" aria-label="Aperçu du renommage">{files.map((file, index) => <div className="ed-rename-row" role="listitem" key={`${index}-${file.name}`}><span title={file.name}>{file.name}<small>{bytes(file.size)}</small></span><ArrowRight size={14} /><strong title={names[index]}>{names[index]}</strong><button className="ed-icon" aria-label={`Retirer ${file.name} du lot`} disabled={busy} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X size={14} /></button></div>)}</div><div className="ed-toolbar ed-export"><button className="ed-primary" disabled={busy || !files.length} onClick={() => void exportZip()}>{busy ? <LoaderCircle className="ed-spin" size={16} /> : <FileArchive size={16} />}{busy ? `Préparation ${progress} %` : "Télécharger les copies en ZIP"}</button><button disabled={busy} onClick={() => { saveFile(`\uFEFF${encodeTable([["Nom d’origine", "Nouveau nom"], ...files.map((file, i) => [file.name, names[i]])], ";")}`, "correspondance-noms.csv", "text/csv;charset=utf-8"); setNotice("La liste des anciens et nouveaux noms est téléchargée."); }}><ArrowDownToLine size={16} /> Liste des noms</button></div>{busy && <progress max={100} value={progress} aria-label="Préparation des fichiers renommés" />}</> : <div className="ed-empty"><Files size={32} /><strong>Un dossier plus facile à retrouver.</strong><span>Exemple : IMG_7381.JPG → {safeFileStem(prefix)}-{String(start).padStart(digits, "0")}.jpg</span></div>}
    {notice && <p className="ed-message" role="status">{notice}</p>}
    <p className="ed-footnote">Le contenu et la qualité des fichiers sont conservés. Le ZIP est créé sans compression pour rester rapide. L’ordre suit la sélection du navigateur ; retirer un fichier met à jour la numérotation.</p>
  </div>;
}

function PasswordWorkshop() {
  const [length, setLength] = useState(24);
  const [groups, setGroups] = useState<PasswordGroup[]>(["lower", "upper", "numbers", "symbols"]);
  const [unambiguous, setUnambiguous] = useState(true);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatedOptions, setGeneratedOptions] = useState("");
  const optionsKey = JSON.stringify([length, groups, unambiguous]);
  const stale = !!password && generatedOptions !== optionsKey;
  const labels: { group: PasswordGroup; title: string; sample: string }[] = [{ group: "lower", title: "Minuscules", sample: "abc" }, { group: "upper", title: "Majuscules", sample: "ABC" }, { group: "numbers", title: "Chiffres", sample: "234" }, { group: "symbols", title: "Symboles", sample: "!#?" }];

  function generate() {
    try { setPassword(generatePassword(length, groups, unambiguous)); setGeneratedOptions(optionsKey); setNotice(""); setCopied(false); }
    catch (error) { setNotice((error as Error).message); }
  }

  return <div className="ed-workspace">
    <div className="ed-guide"><span>03</span><p><strong>Un nouveau mot de passe pour chaque compte.</strong> Réglez la longueur et les caractères acceptés par le service, puis générez votre mot de passe. Enregistrez-le dans votre gestionnaire habituel.</p></div>
    <div className="ed-password-layout"><div className="ed-password-options"><label className="ed-field ed-length">Longueur<strong>{length} caractères</strong><input type="range" min={12} max={96} step={1} value={length} onChange={event => setLength(Number(event.target.value))} /></label><div className="ed-group-options">{labels.map(({ group, title, sample }) => <label className="ed-check" key={group}><input type="checkbox" checked={groups.includes(group)} onChange={event => setGroups(current => event.target.checked ? [...current, group] : current.filter(value => value !== group))} /><span>{title}<small>{sample}</small></span></label>)}</div><label className="ed-check ed-unambiguous"><input type="checkbox" checked={unambiguous} onChange={event => setUnambiguous(event.target.checked)} /> Éviter les caractères ambigus<span>Retire 0, O, 1, I, l et | pour faciliter la recopie.</span></label></div>
      <div className="ed-password-output"><LockKeyhole size={29} /><span className="ed-overline">GÉNÉRÉ SUR VOTRE APPAREIL</span><label className="ed-field">Votre mot de passe<input aria-label="Mot de passe généré" type={show ? "text" : "password"} value={password} placeholder="Cliquez sur Générer" readOnly autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} /></label><label className="ed-check"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} /> Afficher le mot de passe</label>{stale && <p className="ed-stale">Options modifiées : générez un nouveau mot de passe pour les appliquer.</p>}<div className="ed-toolbar"><button className="ed-primary" disabled={!groups.length} onClick={generate}><RefreshCw size={15} />{password ? "Régénérer" : "Générer"}</button><button disabled={!password || stale} onClick={() => { void copyText(password).then(() => { setCopied(true); setNotice("Copié. Collez-le dans votre gestionnaire de mots de passe."); }).catch(error => setNotice(error.message)); }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copié" : "Copier"}</button>{password && <button className="ed-icon" aria-label="Effacer le mot de passe de la page" onClick={() => { setPassword(""); setNotice(""); setCopied(false); }}><Trash2 size={16} /></button>}</div></div></div>
    {!groups.length && <p className="ed-message ed-error" role="alert">Sélectionnez au moins une famille de caractères.</p>}{notice && <p className="ed-message" role="status">{notice}</p>}
    <p className="ed-footnote">Génération aléatoire avec l’API crypto du navigateur. Aucun mot de passe n’est enregistré par cet outil. Le bouton Effacer retire le résultat de la page ; le presse-papiers est géré par votre appareil.</p>
  </div>;
}

export default function EverydayTools() {
  const [active, setActive] = useState<Workshop>("table");
  return <section className="everyday-tools" aria-labelledby="everyday-title">
    <div className="ed-heading"><div><span className="ed-overline"><span className="ed-live" />ATELIERS PRATIQUES · BY MANIX</span><h2 id="everyday-title">Moins de clics.<br /><em>Plus de choses faites.</em></h2><p>Trois ateliers pour organiser vos fichiers, exploiter vos tableaux et créer vos mots de passe.</p></div><span className="ed-local"><ShieldCheck size={19} /><span>Vos fichiers restent ici<small>Traitement dans votre navigateur</small></span></span></div>
    <div className="ed-tabs" role="group" aria-label="Choisir un atelier">{OPTIONS.map(option => <button key={option.id} className={active === option.id ? "is-active" : ""} aria-pressed={active === option.id} aria-controls={`everyday-panel-${option.id}`} onClick={() => setActive(option.id)}><option.icon size={22} /><span><small>{option.label}</small><strong>{option.title}</strong><em>{option.detail}</em></span><ArrowRight size={15} /></button>)}</div>
    <div className="ed-panel"><div id="everyday-panel-table" hidden={active !== "table"}><TableWorkshop /></div><div id="everyday-panel-rename" hidden={active !== "rename"}><RenameWorkshop /></div><div id="everyday-panel-password" hidden={active !== "password"}><PasswordWorkshop /></div></div>
    <div className="ed-credit"><ShieldCheck size={13} /> Gratuit · Sans compte · Aucun fichier envoyé par ces ateliers<span>Création Manix · Communauté KITT-FRANCO-BELGE</span></div>
  </section>;
}
