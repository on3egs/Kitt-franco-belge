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
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          background: "rgba(10,0,0,0.97)",
          border: "1px solid rgba(255,34,34,0.3)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
          minWidth: "140px",
        }}>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code as any); setOpen(false); }}
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
