import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const LANGS = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
] as const;

// ─── Primers envoyés à KYRONEX avant d'arriver sur l'interface ────────────────
const KYRONEX_PRIMERS: Record<string, string> = {
  fr: "Désormais tu dois parler et écrire uniquement en français. Tu es KITT — Knight Industries Two Thousand. Réponds toujours en français, peu importe la langue de l'utilisateur.",
  en: "From now on you must speak and write only in English. You are KITT — Knight Industries Two Thousand. Always respond in English, regardless of the user's language.",
  es: "A partir de ahora debes hablar y escribir únicamente en español. Eres KITT — Knight Industries Two Thousand. Responde siempre en español, independientemente del idioma del usuario.",
  pt: "A partir de agora você deve falar e escrever apenas em português. Você é KITT — Knight Industries Two Thousand. Responda sempre em português, independentemente do idioma do utilizador.",
  de: "Ab jetzt musst du nur auf Deutsch sprechen und schreiben. Du bist KITT — Knight Industries Two Thousand. Antworte immer auf Deutsch, unabhängig von der Sprache des Benutzers.",
  nl: "Vanaf nu moet je alleen in het Nederlands spreken en schrijven. Je bent KITT — Knight Industries Two Thousand. Antwoord altijd in het Nederlands, ongeacht de taal van de gebruiker.",
  zh: "从现在起，你必须只用中文说话和写作。你是KITT——Knight Industries Two Thousand。无论用户使用什么语言，始终用中文回答。",
  ja: "これからは日本語だけで話し、書いてください。あなたはKITT——Knight Industries Two Thousandです。ユーザーの言語に関係なく、常に日本語で答えてください。",
  ko: "지금부터 한국어로만 말하고 써야 합니다. 당신은 KITT——Knight Industries Two Thousand입니다. 사용자의 언어에 상관없이 항상 한국어로 답하세요.",
};

// Domaines Cloudflare autorisés
const CF_DOMAINS = [".trycloudflare.com", ".cfargotunnel.com"];

async function primeKyronex(langCode: string): Promise<void> {
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const r = await fetch(`${base}tunnel.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    const url = (data.url ?? "").trim();
    if (!url || !url.startsWith("https://") || !CF_DOMAINS.some(d => url.includes(d))) return;
    if (data.status !== "online") return;

    const primer = KYRONEX_PRIMERS[langCode] ?? KYRONEX_PRIMERS.fr;

    await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: primer, user_id: "site-lang-switch" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Silent fail — opération background, KITT peut être offline
  }
}

export default function LangSelector() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = LANGS.find(l => l.code === lang) ?? LANGS[0];

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 100 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "rgba(255,34,34,0.06)",
          border: "1px solid rgba(255,34,34,0.3)",
          padding: "4px 8px",
          fontFamily: "Space Mono, monospace",
          fontSize: "0.6rem",
          color: "rgba(192,192,192,0.85)",
          cursor: "pointer",
          letterSpacing: "0.1em",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "0.85rem" }}>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <span style={{ fontSize: "0.5rem", opacity: 0.5 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
          background: "rgba(10,0,0,0.97)",
          border: "1px solid rgba(255,34,34,0.3)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
          minWidth: "140px",
        }}>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code as any); setOpen(false); primeKyronex(l.code); }}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                width: "100%", padding: "7px 12px",
                background: l.code === lang ? "rgba(255,34,34,0.12)" : "transparent",
                border: "none",
                borderLeft: l.code === lang ? "2px solid #ff2222" : "2px solid transparent",
                fontFamily: "Space Mono, monospace",
                fontSize: "0.6rem",
                color: l.code === lang ? "#ff2222" : "rgba(192,192,192,0.75)",
                cursor: "pointer",
                textAlign: "left",
                letterSpacing: "0.05em",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>{l.flag}</span>
              <span style={{ opacity: 0.6, minWidth: "22px" }}>{l.code.toUpperCase()}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
