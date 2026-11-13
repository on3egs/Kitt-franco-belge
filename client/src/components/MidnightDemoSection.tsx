import "./MidnightDemoSection.css";
import "./MidnightTribute.css";

const DEMO_URL = `${import.meta.env.BASE_URL}kyronext-midnight/`;

export default function MidnightDemoSection() {
  return (
    <section className="midnight-section" id="demo-1990" aria-labelledby="midnight-title">
      <div className="midnight-card">
        <a className="midnight-preview" href={DEMO_URL} aria-label="Lancer Midnight Disk, la démo KYRONEXT par Manix">
          <img src={`${DEMO_URL}poster.png`} alt="KITT et KARR en 3D polygonale sur une route nocturne, sous le logo chromé KYRONEXT" width="480" height="300" loading="lazy" />
          <span className="midnight-play" aria-hidden="true">▶</span>
          <span className="midnight-caption">KITT + KARR <span>01:36 / BY MANIX</span></span>
        </a>
        <div className="midnight-copy">
          <span className="midnight-kicker"><span aria-hidden="true">●</span> DEMO DISK / VOL. 01</span>
          <h2 id="midnight-title">Le futur a une<br /><em>disquette d’avance.</em></h2>
          <p>KYRONEXT remonte en 1990. KITT et KARR en 3D, effets Copper, logo chromé et musique chiptune : une création originale dans l’esprit de la scène Amiga.</p>
          <div className="midnight-signature">MIDNIGHT DISK <span>BY MANIX</span></div>
          <a className="midnight-launch" href={DEMO_URL}>LANCER LA DÉMO <span aria-hidden="true">↗</span></a>
          <small>La musique démarre à votre clic. À regarder avec le son.</small>
        </div>
      </div>
      <aside className="midnight-tribute" aria-labelledby="midnight-tribute-title">
        <div className="midnight-transmission"><span>SIGNAL REÇU / 1990 → DEMAIN</span><span>MESSAGE AUX PARRAINS</span></div>
        <h3 id="midnight-tribute-title">À ceux qui ont laissé la lumière allumée.</h3>
        <p>Avant nos écrans, il y avait vos nuits. Des disquettes pour constellations, des pseudos pour signatures. Entre deux chargements, vous glissiez une preuve : quelques lignes de code pouvaient ouvrir un monde.</p>
        <p>Aux anciens de la scène, à ses parrains et à tous les passeurs de savoir : <strong>merci</strong>. Vos trouvailles, vos démonstrations et votre passion du code continuent de nous aider à apprendre et à inventer.</p>
        <ul className="midnight-greets" aria-label="Hommage aux groupes de la scène">
          {["Skid Row", "Fairlight", "Paradox", "Quartex", "TRSI", "Razor 1911", "Anarchy", "D-Mob"].map(name => <li key={name}>{name}</li>)}
        </ul>
        <p className="midnight-ethos">KYRONEXT poursuit ce fil avec une boussole <strong>white hat</strong> : comprendre, créer, protéger et transmettre, dans le respect des personnes, des auteurs et des systèmes.</p>
        <footer className="midnight-tribute-footer"><span>Le disque a changé. La lumière circule encore.</span><b>BY MANIX</b></footer>
      </aside>
    </section>
  );
}
