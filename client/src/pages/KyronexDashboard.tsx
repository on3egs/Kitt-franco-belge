import { useEffect, useState } from "react";

const units = [
  ["K.A.R.R.", "01 // KARR", "KARR · ORIN NX 16GB", "https://karr.kitt-franco-belge.be", "hover_karr.mp3"],
  ["K.I.T.T.", "02 // KITT", "KITT · ORIN NANO 8GB", "https://kitt.kitt-franco-belge.be", "hover_kitt.mp3"],
  ["SUPER K.I.T.T. V3", "03 // FLAGSHIP", "AGX ORIN · NEURAL NODE", "https://kitt.kitt-franco-belge.be", "hover_kitt.mp3"],
  ["KARR De Dadoo", "04 // DADOO", "JETSON ORIN NX · LOCAL NET", "http://192.168.129.25:3001?ai=karr_dadoo", "hover_karr.mp3"],
  ["K-4000", "05 // KR-95", "KIRONEX · FRANK / KR-95", "https://k4000.kitt-franco-belge.be", "hover_kitt.mp3"],
  ["K.I.T.T. PASCAL", "06 // PASCAL", "ORIN NANO 8GB · NEMOTRON", "https://kitt-pascal.kitt-franco-belge.be", "hover_kitt.mp3"],
  ["JO KNIGHT RIDER", "07 // NEURAL NODE", "KYRONEX · EN CONSTRUCTION", "#", "hover_kitt.mp3"],
  ["HERVÉ DE PASCAL-K.", "08 // NEURAL NODE", "KYRONEX · EN CONSTRUCTION", "#", "hover_kitt.mp3"],
];

export default function KyronexDashboard() {
  const [booting, setBooting] = useState(true);
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState("");

  const openUnit = (event: React.MouseEvent<HTMLAnchorElement>, name: string, href: string) => {
    if (href === "#") return;
    event.preventDefault();
    setTarget(name);
    setLinking(true);
    playSystemSfx("link");
    speakIdentity(name);
    window.setTimeout(() => { window.location.href = href; }, 5200);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 5500);
    return () => window.clearTimeout(timer);
  }, []);

  const playSfx = (file: string) => {
    const audio = new Audio(`/kyronex/${file}`);
    audio.volume = 0.24;
    audio.play().catch(() => undefined);
  };

  const speakIdentity = (name: string) => {
    fetch("https://karr.kitt-franco-belge.be/api/tts-eleven", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Je suis ${name}. Liaison directe avec l'ordinateur de la Fondation. Connexion acceptée.`,
        model_id: "eleven_v3",
        voice_settings: { stability: 0.55, similarity_boost: 0.88, style: 0.22, use_speaker_boost: true },
      }),
    })
      .then((response) => response.ok ? response.blob() : Promise.reject())
      .then((blob) => {
        const audio = new Audio(URL.createObjectURL(blob));
        audio.volume = 0.9;
        audio.play().catch(() => undefined);
      })
      .catch(() => undefined);
  };

  const playSystemSfx = (mode: "boot" | "link") => {
    try {
      const context = new AudioContext();
      const notes = mode === "boot" ? [110, 165, 220, 330, 440] : [220, 277, 370, 494, 659];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index % 2 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.62);
        gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + index * 0.62 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.62 + 0.42);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + index * 0.62);
        oscillator.stop(context.currentTime + index * 0.62 + 0.45);
      });
      window.setTimeout(() => context.close(), 3800);
    } catch {}
  };

  useEffect(() => {
    playSystemSfx("boot");
  }, []);

  return (
    <main className="kx-red">
      <style>{`
        .kx-boot,.kx-link{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(0,0,0,.88);backdrop-filter:blur(14px);animation:kx-fade .45s ease}.kx-boot-box,.kx-link-box{width:min(430px,calc(100% - 36px));padding:28px 24px;text-align:center;border:1px solid rgba(255,32,32,.55);background:rgba(12,2,4,.8);box-shadow:0 0 45px rgba(255,0,0,.24),inset 0 0 28px rgba(255,0,0,.06)}.kx-orbit{position:relative;width:124px;height:124px;margin:0 auto 22px;border:1px solid rgba(255,32,32,.4);border-radius:50%;box-shadow:0 0 25px rgba(255,0,0,.18)}.kx-orbit:before,.kx-orbit:after{position:absolute;inset:18px;content:"";border:1px solid rgba(255,32,32,.26);border-radius:50%;transform:rotate(62deg) scaleX(.42)}.kx-orbit:after{transform:rotate(-62deg) scaleX(.42)}.kx-satellite{position:absolute;top:-5px;left:50%;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px var(--red);animation:kx-orbit 2.4s linear infinite}.kx-flag{position:absolute;top:50%;left:50%;width:29px;height:19px;transform:translate(-50%,-50%);background:linear-gradient(90deg,#171717 0 33%,#f5c400 33% 66%,#ed1c24 66%);box-shadow:0 0 15px rgba(255,255,255,.35)}.kx-boot-label,.kx-link-title{color:var(--red);font-size:.62rem;letter-spacing:.17em}.kx-boot-text,.kx-link-text{margin:12px 0 17px;color:var(--dim);font-size:.57rem;letter-spacing:.08em}.kx-progress{height:4px;overflow:hidden;background:rgba(255,32,32,.14)}.kx-progress i{display:block;width:38%;height:100%;background:var(--red);box-shadow:0 0 12px var(--red);animation:kx-progress 1.9s ease-in-out infinite}.kx-link-box{animation:kx-link-in .3s ease}.kx-link-title{font-size:.72rem}.kx-link-lines{margin:21px 0;text-align:left;color:rgba(255,255,255,.68);font-size:.56rem;line-height:2;letter-spacing:.07em}.kx-link-lines b{color:var(--red);font-weight:400}.kx-link-lines b:before{content:"[ OK ] ";color:#f4f4f4}.kx-link .kx-progress i{width:75%;animation-duration:1.2s}@keyframes kx-orbit{to{transform:rotate(360deg) translateX(56px) rotate(-360deg)}}@keyframes kx-progress{50%{transform:translateX(175%)}}@keyframes kx-fade{from{opacity:0}to{opacity:1}}@keyframes kx-link-in{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}
      `}</style>
      {booting && <div className="kx-boot"><div className="kx-boot-box"><div className="kx-orbit"><i className="kx-satellite" /><b className="kx-flag" /></div><div className="kx-boot-label">KYRONEX SATELLITE LINK</div><div className="kx-boot-text">SIGNAL ACQUIRED // BELGIAN NODE</div><div className="kx-progress"><i /></div></div></div>}
      {linking && <div className="kx-link"><div className="kx-link-box"><div className="kx-link-title">DIRECT FOUNDATION LINK</div><div className="kx-link-text">ÉTABLISSEMENT DU CANAL CHIFFRÉ · {target}</div><div className="kx-link-lines"><div><b>IDENTITY VERIFIED</b></div><div><b>ENCRYPTED CHANNEL</b></div><div><b>COMPUTER HANDSHAKE</b></div><div><b>CONNECTION ACCEPTED</b></div></div><div className="kx-progress"><i /></div></div></div>}
      <div className="kx-red-shell">
        <header className="kx-red-header"><a className="kx-red-brand" href="/kyronex/"><span className="kx-red-mark">KX</span><span><span className="kx-red-title">KYRONEX</span><span className="kx-red-sub">KNIGHT INDUSTRIES SYSTEM</span></span></a><span className="kx-red-status"><i />SYSTEM ONLINE</span></header>
        <section className="kx-red-hero"><div><p className="kx-red-kicker">NEURAL ACCESS TERMINAL // 08 UNITS</p><h1>Choose your unit</h1></div><p className="kx-red-copy">Interface centrale de pilotage. Sélectionnez une unité pour établir la liaison.</p></section>
        <div className="kx-scanner" aria-hidden="true"><span /></div>
        <section className="kx-grid" aria-label="Unités KYRONEX">{units.map(([name, index, spec, href, sfx], i) => <a className="kx-card" href={href} target={href === "#" ? undefined : "_blank"} rel="noreferrer" onClick={(event) => openUnit(event, name, href)} onMouseEnter={() => playSfx(sfx)} key={name}><span className="kx-card-top"><span className="kx-index">{index}</span><span className="kx-icon">{["◈","⬡","⚡","◎","◇","✦","◌","◌"][i]}</span></span><span><h2>{name}</h2><p>{spec}</p></span><span className="kx-card-bottom"><span className="kx-state">{href === "#" ? "IN DEV" : "ONLINE"}</span><span className="kx-open">OPEN <b>›</b></span></span></a>)}</section>
        <footer className="kx-footer"><span><strong>KYRONEX</strong> // NEURAL ACCESS TERMINAL</span><span>V3.0 · SECURE LINK</span></footer>
      </div>
    </main>
  );
}
import { useState } from "react";
