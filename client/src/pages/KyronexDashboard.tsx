import { useEffect, useRef, useState } from "react";
import "./KyronexDashboard.css";

const units = [
  { name:"K.A.R.R.", code:"01", role:"Unité autonome", spec:"KARR · ORIN NX 16 GB", href:"https://karr.kitt-franco-belge.be", sound:"hover_karr.mp3", tone:"amber", icon:"◈", online:true },
  { name:"K.I.T.T.", code:"02", role:"Assistant embarqué", spec:"KITT · ORIN NANO 8 GB", href:"https://kitt.kitt-franco-belge.be", sound:"hover_kitt.mp3", tone:"cyan", icon:"⬡", online:true },
  { name:"SUPER K.I.T.T. V3", code:"03", role:"Nœud principal", spec:"AGX ORIN · NEURAL NODE", href:"https://kitt.kitt-franco-belge.be", sound:"hover_kitt.mp3", tone:"red", icon:"✦", online:true },
  { name:"KARR DE DADOO", code:"04", role:"Accès distant", spec:"JETSON ORIN NX · REMOTE ACCESS", href:"https://karr-dadoo.kitt-franco-belge.be/?ai=karr_dadoo", sound:"hover_karr.mp3", tone:"violet", icon:"◎", online:true },
  { name:"K-4000", code:"05", role:"Unité expérimentale", spec:"KYRONEX · FRANK / KR-95", href:"https://k4000.kitt-franco-belge.be", sound:"hover_kitt.mp3", tone:"blue", icon:"◇", online:true },
  { name:"K.I.T.T. PASCAL", code:"06", role:"Assistant embarqué", spec:"ORIN NANO 8 GB · NEMOTRON", href:"https://kitt-pascal.kitt-franco-belge.be", sound:"hover_kitt.mp3", tone:"cyan", icon:"⌘", online:true },
  { name:"JO KNIGHT RIDER", code:"07", role:"Nœud neuronal", spec:"KYRONEX · EN CONSTRUCTION", href:"#", sound:"hover_kitt.mp3", tone:"muted", icon:"◌", online:false },
  { name:"HERVÉ DE PASCAL-K.", code:"08", role:"Nœud neuronal", spec:"KYRONEX · EN CONSTRUCTION", href:"#", sound:"hover_karr.mp3", tone:"muted", icon:"◌", online:false },
];

export default function KyronexDashboard() {
  const [booting, setBooting] = useState(true);
  const [linking, setLinking] = useState("");
  const navigationTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 1450);
    return () => { window.clearTimeout(timer); if (navigationTimer.current) window.clearTimeout(navigationTimer.current); };
  }, []);
  const playSfx = (file: string) => { const audio = new Audio(`/kyronex/${file}`); audio.volume = 0.16; audio.play().catch(() => undefined); };
  const connect = (event: React.MouseEvent<HTMLAnchorElement>, unit: typeof units[number]) => {
    event.preventDefault();
    if (!unit.online) return;
    setLinking(unit.name);
    try {
      const context = new AudioContext();
      [220,277,370,494,659].forEach((frequency,i) => {
        const osc=context.createOscillator(), gain=context.createGain(), start=context.currentTime+i*.2;
        osc.type=i%2?"triangle":"sine"; osc.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.035,start+.025);
        gain.gain.exponentialRampToValueAtTime(.0001,start+.27); osc.connect(gain).connect(context.destination);
        osc.start(start); osc.stop(start+.3);
      });
      window.setTimeout(() => void context.close(),1800);
    } catch {}
    const isKarr=unit.name.includes("KARR");
    fetch("https://karr.kitt-franco-belge.be/api/tts-eleven",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      text:`Je suis ${unit.name}. Liaison directe avec l'ordinateur de la Fondation. Connexion acceptée.`,model_id:"eleven_v3",
      voice_settings:{stability:isKarr?.42:.58,similarity_boost:.88,style:isKarr?.32:.16,use_speaker_boost:true}
    })}).then(r=>r.ok?r.blob():Promise.reject()).then(blob=>{const audio=new Audio(URL.createObjectURL(blob));audio.volume=.9;audio.play().catch(()=>undefined)}).catch(()=>undefined);
    navigationTimer.current=window.setTimeout(()=>{window.location.href=unit.href},3600);
  };
  return <main className="kx-dashboard">
    <div className="kx-ambient" aria-hidden="true"><span/><span/><span/></div>
    {booting&&<div className="kx-boot" role="status" aria-label="Initialisation de Kyronex"><div className="kx-boot-panel">
      <div className="kx-boot-emblem"><span>KX</span><i/></div><p>KYRONEX <b>///</b> INITIALISATION</p>
      <div className="kx-boot-track"><i/></div><small>ACQUISITION DU SIGNAL · BELGIQUE</small>
    </div></div>}
    {!!linking&&<div className="kx-link" role="status" aria-live="polite"><div className="kx-link-panel">
      <div className="kx-link-icon"><span>⌁</span><i/></div><p className="kx-eyebrow">LIAISON SÉCURISÉE · EN COURS</p>
      <h2>{linking}</h2><p className="kx-link-copy">Établissement du canal avec l’ordinateur de la Fondation.</p>
      <div className="kx-handshake"><span>IDENTITÉ VÉRIFIÉE</span><span>CANAL CHIFFRÉ</span><span>CONNEXION ACCEPTÉE</span></div>
      <div className="kx-link-track"><i/></div>
    </div></div>}
    <div className="kx-frame">
      <header className="kx-topbar">
        <a className="kx-brand" href="/kyronex/" aria-label="Kyronex, accueil"><span className="kx-brand-mark">K<span>X</span></span><span className="kx-brand-name">KYRONEX<small>KNIGHT INDUSTRIES · BELGIUM</small></span></a>
        <div className="kx-top-status"><span className="kx-live"><i/> SYSTÈME OPÉRATIONNEL</span><span className="kx-top-divider"/><span className="kx-clock">RÉSEAU // 08 NŒUDS</span></div>
        <a className="kx-top-link" href="/">SITE KITT <span>↗</span></a>
      </header>
      <section className="kx-intro" aria-labelledby="kx-title">
        <div className="kx-intro-copy">
          <p className="kx-eyebrow"><span className="kx-eyebrow-line"/> TERMINAL D’ACCÈS NEURONAL <span className="kx-eyebrow-id">KX / 03.08</span></p>
          <h1 id="kx-title">LA ROUTE<br/><em>VOUS ATTEND.</em></h1>
          <p className="kx-lead">Choisissez votre unité. La liaison sécurisée s’établit en quelques secondes.</p>
          <a className="kx-scroll-cue" href="#kx-units"><span>↓</span> SÉLECTIONNER UNE UNITÉ</a>
        </div>
        <div className="kx-hero-visual" aria-hidden="true">
          <div className="kx-hero-halo"/><div className="kx-hero-orbit kx-orbit-one"/><div className="kx-hero-orbit kx-orbit-two"/>
          <div className="kx-hero-crosshair kx-crosshair-a"/><div className="kx-hero-crosshair kx-crosshair-b"/>
          <div className="kx-hero-label kx-label-top">PONTIAC FIREBIRD <b>82</b></div>
          <img src="/kyronex/kitt-car.png" alt="" className="kx-car-art"/><div className="kx-scanline"/>
          <div className="kx-hero-label kx-label-bottom"><span>VEHICLE SYSTEM</span><b>100% <i>●</i></b></div>
          <div className="kx-hero-coordinates">39° 06′ N<br/>77° 09′ W</div>
        </div>
        <div className="kx-intro-index"><span>01</span><i/><span>08</span></div>
      </section>
      <section className="kx-units-section" id="kx-units" aria-labelledby="kx-units-title">
        <div className="kx-section-heading">
          <div><p className="kx-eyebrow">RÉSEAU KYRONEX <span className="kx-eyebrow-id">/ SÉLECTION</span></p><h2 id="kx-units-title">Choisissez votre <em>unité</em></h2></div>
          <p className="kx-section-note"><span className="kx-section-count">06</span> UNITÉS DISPONIBLES<br/><span>02 EN PRÉPARATION</span></p>
        </div>
        <div className="kx-grid">{units.map(unit=><a className={`kx-card kx-tone-${unit.tone}${unit.online?"":" kx-card-offline"}`} href={unit.href}
          target={unit.online?"_blank":undefined} rel={unit.online?"noreferrer":undefined}
          aria-label={unit.online?`Ouvrir ${unit.name}, ${unit.role}`:`${unit.name}, unité en préparation`} aria-disabled={!unit.online}
          onClick={event=>connect(event,unit)} onMouseEnter={()=>unit.online&&playSfx(unit.sound)} key={unit.code}>
          <div className="kx-card-head"><span className="kx-card-number">UNITÉ <b>{unit.code}</b></span><span className="kx-card-state"><i/>{unit.online?"EN LIGNE":"BIENTÔT"}</span></div>
          <div className="kx-card-core"><span className="kx-card-glyph">{unit.icon}</span><span className="kx-card-arrow">↗</span></div>
          <div className="kx-card-copy"><p>{unit.role}</p><h3>{unit.name}</h3><span>{unit.spec}</span></div>
          <div className="kx-card-footer"><span>{unit.online?"ÉTABLIR LA LIAISON":"ACCÈS EN PRÉPARATION"}</span><b>{unit.online?"→":"···"}</b></div>
        </a>)}</div>
      </section>
      <footer className="kx-footer"><span><b>KYRONEX</b> · ACCÈS AUX UNITÉS</span><span>RÉSEAU SÉCURISÉ <i/> VERSION 3.0</span></footer>
    </div>
  </main>;
}
