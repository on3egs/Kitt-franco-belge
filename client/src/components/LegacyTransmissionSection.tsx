import "./LegacyTransmissionSection.css";
const URL = `${import.meta.env.BASE_URL}kyronext-legacy/`;
export default function LegacyTransmissionSection() {
  return <section className="legacy-feature" id="legacy-transmission" aria-labelledby="legacy-feature-title">
    <div className="legacy-feature-card">
      <a href={URL} className="legacy-feature-image" aria-label="Lancer Legacy Transmission, la nouvelle démo musicale KYRONEXT">
        <img src={`${URL}assets/poster.jpg`} width="960" height="540" loading="lazy" alt="KITT noire et KARR noire et argent en trois dimensions, leurs scanners allumés sur une route nocturne" />
        <span className="legacy-feature-play" aria-hidden="true">▶</span><span className="legacy-feature-caption">LEGACY TRANSMISSION <b>03:12 / BY MANIX</b></span>
      </a>
      <div className="legacy-feature-copy"><span className="legacy-feature-kicker">NOUVELLE TRANSMISSION / VOL. 02</span><h2 id="legacy-feature-title">On n’a jamais<br/><em>éteint la machine.</em></h2><p>KITT, KARR, l’Atomium et une bande-son rock tracker originale. Une démo 3D de 3 min 12, puis huit archives YouTube pour retrouver les signatures de nos disquettes.</p><div className="legacy-feature-tags"><span>3D</span><span>ROCK / 4 PISTES</span><span>HOMMAGE AMIGA</span></div><a className="legacy-feature-launch" href={URL}>LANCER LA TRANSMISSION <span aria-hidden="true">↗</span></a><a className="legacy-feature-archives" href={`${URL}#archives`}>Ouvrir les capsules mémoire →</a></div>
    </div>
  </section>;
}
