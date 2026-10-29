# Audit préalable — KITT / Fondation FLAG

État audité : `ae472cc6d`, avant cette évolution. Le périmètre est le jeu voxel
(`game/`, HTML, serveur Socket.IO, intégration du catalogue et vérifications),
pas le chatbot ni les autres logiciels indépendants du dépôt.

## Thème et promesse

Un pilote de la Fondation FLAG construit ses installations et intervient avec
KITT sur les routes franco-belges. L'univers associe les enquêtes de Michael,
les inventions de Bonnie, la menace de Goliath et des haltes rétro accueillantes.
Halloween ajoute des anomalies à investiguer, sans remplacer la mission de FLAG.

## Ce qui existe réellement

- Monde déterministe : chunks 16×16, cinq régions, routes, hangar, enseignes,
  végétation, jour/nuit, pluie, textures procédurales et fusion de faces.
- Première personne ZQSD configurable, course, saut, accroupissement, tactile,
  construction/destruction, neuf cases, inventaire et deux recettes de craft.
- Créatif/survie : vie, faim, frites/gaufres, retour au poste en cas de défaite.
- KITT : appel autonome avec évitement local, conduite, freinage, dérapage,
  Turbo Boost, scanner visuel, moteur et pneus synthétisés.
- Profils : Michael, Lilou avec lunettes, Alexia sans lunettes ; profils privés
  vérifiés côté serveur. Devon, Bonnie, April et RC3 sont présents comme PNJ.
- Histoire : parler à Devon, approcher Goliath dans KITT et libérer Bonnie,
  rapport, briefing dans le camion atelier, collecte de deux noyaux et réparation.
- Annexe : choisir une piste, poser cinq blocs, entrer dans KITT, vaincre trois
  démons, améliorer le moteur. Course de trois portiques sans chronométrage utile.
- Points, rangs, trois seuils de récompenses, trois niveaux moteur ; scores et
  campagne locaux. Les points ne constituent pas une monnaie dépensable.
- Moutons et quatre familles Halloween ; impacts, fragments et sons. Les démons
  blessent ; les autres monstres ne constituent pas de vrais combats progressifs.
- Radio : cinq stations externes, erreurs affichées, flux non hébergés.
- Bistrot : coque de bâtiment, gros cubes de mobilier et deux liens d'arcade dans
  une fenêtre. Ce n'est pas encore un intérieur de bar crédible.
- Réseau : 16 places, positions, profils, véhicules visibles, modifications de
  blocs, départs et reconnexion. Les missions, monstres, noyaux et scores ne sont
  PAS des simulations coopératives synchronisées.
- Catalogue public, lancement en iframe et retour au site.

## Faiblesses et défauts observés dans le code

1. Pas de boucle renouvelable après la courte histoire ; monde vaste sans tâches
   liées à ses régions. Les deux pistes annexes utilisent presque la même suite.
2. Cinq blocs quelconques valident un refuge : aucune forme, aucun toit vérifié.
3. Scanner uniquement esthétique / arme : aucune enquête ou découverte réelle.
4. Les améliorations manquent de choix ; plusieurs récompenses ne modifient pas
   assez les actions. Le rang informe mais ne donne pas d'objectif intermédiaire.
5. Course non chronométrée, `raceStarted` inutilisé ; `campaign.path` peut bloquer
   son lancement après avoir choisi une mission annexe.
6. L'IA démon recalcule un point de promenade à chaque image et y ajoute un
   déplacement de `.85*.016` : sa poursuite ne s'accumule quasiment pas.
7. Tout le monde peut construire, mais cela n'a pas d'utilité précise dans FLAG.
8. Le bistrot utilise des cubes de un mètre pour chaises/écrans/comptoir, sans
   arrière-bar, assises crédibles, écran dessiné, joystick ni éclairage intérieur.
   Son plancher est un bloc plus haut que le dehors, sans entrée adaptée.
9. Les bulles très grandes occultent l'action ; l'objectif utile doit rester
   compact, avec les explications disponibles à la demande.
10. Des aides affichent E/U/24 m en dur, même quand les commandes sont modifiées.
    Le bestiaire dit « non agressifs » alors que les démons attaquent.
11. Les temps reposent parfois sur l'horloge de rendu, pas sur le temps joué.
    Le trajet Goliath a déjà été corrigé pour ne plus sauter à la reprise.
12. Les limites réseau sont utiles mais ne rendent pas les résultats compétitifs
    fiables : une campagne locale ne doit pas être présentée comme un classement mondial.

## Comparaison documentée, pas une partie Roblox prétendument jouée

- Jailbreak met en avant un rôle lisible (arrêter / s'échapper), les voitures et
  la possibilité d'agir ensemble ou seul. Ici le rôle de FLAG doit se traduire
  par des interventions, pas seulement des dialogues.
- Driving Empire met en avant courses, réglages, personnalisation et rencontres
  automobiles : les gains ont un usage visible. Ici les équipements de KITT
  doivent ouvrir des décisions et modifier la conduite ou l'enquête.
- La documentation Roblox relie interaction minute par minute, activité répétée
  et progression. Elle recommande une entrée rapide, des objectifs courts et
  longs, des quêtes liées aux mécaniques et un usage mobile réel.
- Ces références documentent des principes et les fonctions annoncées ; aucune
  mesure d'addiction, de rétention ou de supériorité du jeu n'est inventée.

## Idées classées (impact 1–5 ; effort 1–5)

| Idée liée au thème | Impact | Effort | Décision |
|---|---:|---:|---|
| Contrats FLAG renouvelables : dépannage, relais et patrouille routière | 5 | 3 | **1** |
| Scanner d'enquête KITT : impulsion, indices, brouilleurs KARR | 5 | 3 | **2** |
| Garage Bonnie : crédits d'intervention, équipements utiles et paliers | 5 | 3 | **3** |
| Avant-postes FLAG à bâtir selon un vrai plan vérifié | 4 | 3 | **4** |
| Bistrot franco-belge 1988 : bar détaillé, bornes, halte et départ en mission | 5 | 4 | **5**, demande déjà active |
| Convoi coopératif FLAG contre Goliath, simulation serveur commune | 5 | 5 | Suite : architecture réseau plus large |
| KARR rival conduisant et sabotant les relais | 5 | 5 | Suite |
| Semi FLAG articulé, rampe et réparation de KITT embarqué | 4 | 5 | Suite |
| Radio de Devon variant selon mission, région et prénom | 4 | 2 | Intégré aux cinq systèmes |
| Épreuves Turbo sur routes montagneuses avec médailles | 4 | 3 | Contrats routiers puis extension |
| Vitrines de trophées et scanner personnalisé au garage | 3 | 2 | Rang / équipements d'abord |
| Rallye Bruxelles–Liège–Paris, temps et itinéraires alternatifs | 4 | 4 | Trois secteurs d'intervention d'abord |
| Événement Halloween : fausses alertes et relais possédés | 4 | 3 | Indices d'enquête, puis événement collectif |
| Défi cuisine belge et livraison de gaufres en KITT | 3 | 3 | Suite |

## Boucle retenue

Choisir une intervention → rejoindre le secteur avec KITT → scanner, dépanner,
conduire ou construire → revenir transmettre le rapport → recevoir crédits et
réputation → choisir un équipement de Bonnie → entreprendre une intervention
plus difficile. Une activité a un objectif visible, une condition de réussite
réelle et un paiement unique. L'annulation et l'échec ne versent pas la récompense.

## Direction artistique précise du bistrot

« Créer un bar-arcade franco-belge de bord de route en 1988 dans l'univers FLAG.
Grand comptoir en L en bois sombre avec plateau poli, tabourets de cuir rouge
à pieds chromés et repose-pieds, arrière-bar à étagères garnies, verrerie,
bouteilles stylisées, machine à café et ardoise frites/gaufres. Banquettes de diner
à dossiers et tables avec tasses. Sol à damier, soubassements bois, brique chaude,
suspensions chaudes, néons rouges et cyan, enseigne extérieure lisible. Deux
bornes debout Pac-Man et Tetris reconnaissables : caisse, écran incliné animé,
bandeau, joystick, boutons et monnayeur. Entrée de plain-pied et allées continues.
Rendu voxel détaillé à échelle humaine, matériaux procéduraux originaux, pas de
photographies ou d'images de référence incluses. Batches de géométries statiques,
éclairage local mesuré et qualité mobile conservée. »

## Vérification prévue pour chaque lot

- Logique : transition des contrats, récompense unique, annulation, sauvegarde,
  coûts et effets d'équipements, vrai plan de construction.
- Chrome : actions avec les commandes, objectifs, déplacement, menus, retour,
  contrôle des captures. Vérification mobile des panneaux et boutons.
- Régression : monde partagé et deux clients, profils, radio, bornes et camions.
- Publication : commit explicite, push, sauvegarde ciblée sur le Jetson joignable,
  test public de la version déployée. Aucun secret ou photo dans les artefacts.

## Sources primaires consultées

- https://create.roblox.com/docs/production/game-design/core-loops
- https://create.roblox.com/docs/production/game-design/onboarding
- https://create.roblox.com/docs/production/game-design/introduction-to-quest-design
- https://create.roblox.com/docs/get-started/strategies
- https://www.roblox.com/games/606849621/Jailbreak
- https://www.roblox.com/games/3351674303/Driving-Empire
- https://barcade.com/ (association bar, mobilier et bornes classiques)
- https://threejs.org/docs/ (CanvasTexture, InstancedMesh et éclairage)

Audit et sélection terminés avant le début des modifications du jeu.
