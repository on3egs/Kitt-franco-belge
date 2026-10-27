export type CsvDelimiter = "," | ";" | "\t" | "|";

export function parseTable(source: string, delimiter: CsvDelimiter): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const finishField = () => { row.push(field); field = ""; afterQuote = false; };
  const finishRow = () => {
    finishField();
    if (row.length > 100) throw new Error("Le tableau dépasse 100 colonnes. Sélectionnez le bon séparateur ou un fichier plus petit.");
    rows.push(row); row = [];
    if (rows.length > 5001) throw new Error("Limite : 5 000 lignes de données pour conserver un tableau fluide.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"' && field.length === 0 && !afterQuote) quoted = true;
    else if (afterQuote && char.trim()) throw new Error("CSV invalide : un caractère suit un guillemet fermant. Vérifiez le séparateur.");
    else if (!afterQuote) field += char;
  }
  if (quoted) throw new Error("CSV incomplet : un champ entre guillemets n’est pas fermé.");
  if (field.length || row.length || (!text.endsWith("\n") && !text.endsWith("\r"))) finishRow();
  return rows;
}

export function detectDelimiter(text: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [";", ",", "\t", "|"];
  let winner: CsvDelimiter = ";";
  let bestScore = -1;
  // Sample complete logical records; quoted line breaks must not break detection.
  let end = text.length;
  let quoted = false;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    }
    if (text[i] === "\n" && !quoted && ++lines >= 15) { end = i; break; }
  }
  const sample = text.slice(0, end);
  for (const candidate of candidates) {
    try {
      const rows = parseTable(sample, candidate).filter(row => row.some(cell => cell.trim()));
      if (!rows.length) continue;
      const widths = new Map<number, number>();
      for (const row of rows) widths.set(row.length, (widths.get(row.length) ?? 0) + 1);
      const [width, count] = Array.from(widths).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      const score = width > 1 ? count / rows.length * 100 + Math.min(width, 30) : 0;
      if (score > bestScore) { bestScore = score; winner = candidate; }
    } catch { /* Another delimiter may correctly parse the sample. */ }
  }
  return winner;
}

export function tableHeaders(row: string[], width: number): string[] {
  const used = new Set<string>();
  return Array.from({ length: width }, (_, i) => {
    const base = row[i]?.trim() || `Colonne ${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    return name;
  });
}

export function encodeTable(rows: string[][], delimiter: CsvDelimiter, protectFormulas = true): string {
  return rows.map(row => row.map(value => {
    // A CSV opened in a spreadsheet can interpret these prefixes as a formula.
    const safe = protectFormulas && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return /["\r\n]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }).join(delimiter)).join("\r\n");
}

export function safeFileStem(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "-")
    .replace(/[. ]+$/g, "").replace(/^-+|-+$/g, "").slice(0, 72) || "fichier";
}

export function renameBatch(names: string[], prefix: string, start: number, digits: number, lowerExtension: boolean): string[] {
  const stem = safeFileStem(prefix);
  return names.map((name, index) => {
    const dot = name.lastIndexOf(".");
    const rawExtension = dot > 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16) : "";
    const extension = lowerExtension ? rawExtension.toLowerCase() : rawExtension;
    return `${stem}-${String(start + index).padStart(digits, "0")}${extension}`;
  });
}

const PASSWORD_GROUPS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!#$%&()*+,-./:;<=>?@[]^_{|}~",
};
export type PasswordGroup = keyof typeof PASSWORD_GROUPS;

function secureIndex(length: number): number {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Le générateur sécurisé n’est pas disponible dans ce navigateur.");
  const array = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / length) * length;
  do { globalThis.crypto.getRandomValues(array); } while (array[0] >= limit);
  return array[0] % length;
}

export function generatePassword(length: number, groups: PasswordGroup[], unambiguous: boolean): string {
  if (!Number.isInteger(length) || length < 12 || length > 96) throw new Error("Choisissez une longueur entre 12 et 96 caractères.");
  if (!groups.length) throw new Error("Sélectionnez au moins une famille de caractères.");
  const alphabets = groups.map(group => {
    const alphabet = PASSWORD_GROUPS[group];
    return unambiguous ? alphabet.replace(/[0O1Il|]/g, "") : alphabet;
  });
  const all = alphabets.join("");
  const password = alphabets.map(alphabet => alphabet[secureIndex(alphabet.length)]);
  while (password.length < length) password.push(all[secureIndex(all.length)]);
  for (let i = password.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}
