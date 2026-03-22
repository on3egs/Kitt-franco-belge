/*
 * TypewriterText — Affichage de texte caractère par caractère
 * Style: Terminal KITT, monospace, curseur clignotant rouge
 */

import { useEffect, useState } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  showCursor?: boolean;
  onComplete?: () => void;
}

export default function TypewriterText({
  text,
  speed = 50,
  delay = 0,
  className = "",
  showCursor = true,
  onComplete,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    let timeout: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    const start = () => {
      interval = setInterval(() => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setDone(true);
          onComplete?.();
        }
      }, speed);
    };

    if (delay > 0) {
      timeout = setTimeout(() => start(), delay);
    } else {
      start();
    }

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [text, speed, delay, onComplete]);

  return (
    <span className={className}>
      {displayed}
      {showCursor && !done && (
        <span
          className="inline-block w-[2px] h-[1em] bg-red-500 ml-0.5 align-middle"
          style={{ animation: "blink 1s step-end infinite" }}
        />
      )}
      {showCursor && done && (
        <span
          className="inline-block w-[2px] h-[1em] bg-red-500 ml-0.5 align-middle opacity-0"
          style={{ animation: "blink 1s step-end infinite" }}
        />
      )}
    </span>
  );
}
