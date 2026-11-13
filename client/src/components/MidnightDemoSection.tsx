import "./MidnightDemoSection.css";

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
    </section>
  );
}
