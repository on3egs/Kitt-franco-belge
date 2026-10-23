// Local synthesis avoids broken remote audio and duplicate downloads.
const sounds = { scanner:[840,1040,.12], boot:[180,680,.3], hover:[600,620,.035], click:[420,700,.06], glitch:[180,80,.1], notification:[520,920,.18], ambient:[90,120,.2] } as const;
let context: AudioContext | undefined;
let lastHover = 0;
const active = new Set<OscillatorNode>();
export function soundEnabled() { try { return localStorage.getItem("kitt-sound") !== "off"; } catch { return true; } }
window.addEventListener("kitt-sound-change", () => { if (!soundEnabled()) { active.forEach(o => { try { o.stop(); } catch {} }); active.clear(); } });
export function useSoundEffects() {
 const play = (key: keyof typeof sounds) => {
  if (!soundEnabled() || document.hidden) return;
  if (key === "hover") { if (Date.now()-lastHover < 120) return; lastHover=Date.now(); }
  try {
   context ??= new AudioContext(); const ctx=context;
   void ctx.resume().then(() => {
    if (!soundEnabled() || document.hidden) return;
    const [from,to,duration]=sounds[key], now=ctx.currentTime;
    const oscillator=ctx.createOscillator(), gain=ctx.createGain();
    oscillator.type="sine"; oscillator.frequency.setValueAtTime(from,now); oscillator.frequency.exponentialRampToValueAtTime(to,now+duration);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.045,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(gain);gain.connect(ctx.destination);active.add(oscillator);
    oscillator.onended=()=>{active.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    oscillator.start(now);oscillator.stop(now+duration+.01);
   }).catch(()=>{});
  } catch { /* Audio support must not block navigation. */ }
 };return {play};
}
