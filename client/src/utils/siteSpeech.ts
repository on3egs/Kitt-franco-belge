type SpeechOptions = { lang?: string; rate?: number; pitch?: number; volume?: number; replacePending?: boolean };

type QueuedSpeech = { text: string; options: SpeechOptions };
const queue: QueuedSpeech[] = [];
let active = false;
let waitingForVoices = false;

function pump() {
  if (active || !queue.length || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (!voices.length && !waitingForVoices) {
    waitingForVoices = true;
    synth.addEventListener("voiceschanged", () => { waitingForVoices = false; pump(); }, { once: true });
    window.setTimeout(() => { waitingForVoices = false; pump(); }, 800);
    return;
  }
  const next = queue.shift();
  if (!next) return;
  const utterance = new SpeechSynthesisUtterance(next.text);
  utterance.lang = next.options.lang || "fr-FR";
  utterance.rate = next.options.rate ?? 0.84;
  utterance.pitch = next.options.pitch ?? 0.84;
  utterance.volume = next.options.volume ?? 1;
  const lang = utterance.lang.toLowerCase().replace("_", "-");
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().replace("_", "-") === lang)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2)))
    || null;
  active = true;
  const done = () => { if (!active) return; active = false; window.setTimeout(pump, 120); };
  utterance.onend = done;
  utterance.onerror = done;
  try { synth.speak(utterance); } catch { done(); }
}

/** Queue an announcement so a later click cannot cut the current sentence short. */
export function speakSiteAnnouncement(text: string, options: SpeechOptions = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  if (options.replacePending) queue.length = 0;
  queue.push({ text: String(text).trim(), options });
  pump();
  return true;
}

/** Stop queued speech only when the visitor explicitly turns voice off. */
export function stopSiteSpeech() {
  queue.length = 0;
  active = false;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
