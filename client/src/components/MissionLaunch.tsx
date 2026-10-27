import { useState } from 'react';

const journeys = {
  'Découvrir': [
    ['L’histoire de KITT', 'Le projet, les répliques et les technologies qui leur donnent vie.', '/#histoire', '01 · LES ORIGINES'],
    ['Rencontrer KARR', 'Explorez l’autre visage de l’univers Knight Rider.', '/karr', '02 · LE RIVAL'],
    ['Piloter le terminal', 'Retrouvez votre point d’accès à l’interface KITT.', '/kyronex/', '03 · AUX COMMANDES'],
  ],
  'Écouter & regarder': [
    ['La galerie vidéo', 'Découvrez les réalisations et les vidéos de la communauté.', '/videos', '01 · REGARDER'],
    ['Les créations musicales', 'Parcourez les musiques et les contributions partagées.', '/musique', '02 · ÉCOUTER'],
    ['La salle d’arcade KITT', 'Jouez aux jeux du projet dans votre navigateur.', '/jeux/', '03 · JOUER'],
  ],
  'Équiper mon cockpit': [
    ['Choisir un logiciel', 'Commencez par le catalogue et les guides de prise en main.', '/guide-logiciels/', '01 · COMPARER'],
    ['Superviser mes appareils', 'KITT Sentinel rassemble les informations utiles sur vos Jetson.', '/sentinel/', '02 · SUPERVISER'],
    ['Filtrer mon réseau', 'NetShield, son installateur Windows et son guide AGX.', '/netshield/', '03 · CONFIGURER'],
  ],
  'Créer & participer': [
    ['Partager une vidéo', 'Présentez votre réalisation et ses sources à la communauté.', '/soumettre', '01 · PARTAGER'],
    ['Explorer les documents', 'Retrouvez les ressources et proposez les vôtres.', '/documents', '02 · TRANSMETTRE'],
    ['Faire avancer le projet', 'Découvrez les façons de contribuer à KITT Franco-Belge.', '/soutenir/', '03 · CONTRIBUER'],
  ],
} as const;
type Journey = keyof typeof journeys;
export default function MissionLaunch() {
  const [journey, setJourney] = useState<Journey>('Découvrir');
  return <section className="kc-mission" aria-labelledby="kc-mission-title">
    <div className="kc-mission-head"><div><span className="kc-mission-kicker">KNIGHT INTERFACE · VOTRE PARCOURS</span><h2 id="kc-mission-title">Votre prochaine mission<br/>commence ici.</h2><p>Choisissez ce qui vous intéresse. Votre cockpit garde vos favoris, vos notes et vos réglages à portée de main.</p></div><div className="kc-orbit" aria-hidden="true">K.I.</div></div>
    <div className="kc-intents" role="group" aria-label="Choisir mon parcours">{(Object.keys(journeys) as Journey[]).map(key=><button key={key} aria-pressed={key===journey} onClick={()=>setJourney(key)}>{key}</button>)}</div>
    <div className="kc-mission-grid" aria-live="polite">{journeys[journey].map(([title,description,path,kicker])=><a className="kc-mission-card" href={path} key={path}><small>{kicker}</small><strong>{title} ↗</strong><span>{description}</span></a>)}</div>
    <div className="kc-mission-footer"><a href="/nouveautes/">Découvrir les nouveautés et le mode d’emploi ↗</a><button className="kc-open" onClick={()=>window.dispatchEvent(new CustomEvent('kitt-open-cockpit',{detail:{tab:'tools'}}))}>Ouvrir le cockpit personnel →</button></div>
  </section>;
}
