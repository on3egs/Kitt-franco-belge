# Évolution jouable : patrouilles, bar et radio

L'audit et la sélection avant développement sont dans
[AUDIT_GAMEPLAY_2026-10-29.md](AUDIT_GAMEPLAY_2026-10-29.md).

## Prendre le départ

Choisir **PATROUILLES FLAG · COMMENCER**, puis une intervention. En jeu :
**P** ouvre le tableau, **J** lance le scanner, **F** appelle KITT, **E** utilise
ou permet de monter/descendre, **Espace** saute ou déclenche le Turbo.
Ces commandes sont modifiables dans Paramètres, avec les déplacements AZERTY.
Sur mobile, les actions principales sont visibles et **OUTILS +** expose
construction, changement d'arme, moteur et radio.

Le bar est accessible avec **VISITER LE BISTRO FLAG**. Ses deux bornes ouvrent
les vrais jeux externes Pac-Man et Tetris ; leur fermeture rend la main au FPS.

## Les cinq chantiers réalisés

1. **Interventions FLAG renouvelables.** Douze contrats, correspondant à quatre
   activités dans trois secteurs : poste FLAG, relais Nevada/Liège et liaison
   forestière/Paris. Dépannage, enquête, homologation routière et avant-poste.
   Les positions de dépannage et d'enquête ont trois variantes. Les circuits
   diffèrent entre secteurs. L'avant-poste est homologué une fois par secteur.
2. **Scanner d'enquête.** Les trois brouilleurs de KARR ne deviennent utilisables
   qu'après une impulsion depuis KITT ou à proximité. Énergie, recharge, portée,
   onde visible, sons et collecte des preuves à pied. La troisième balise de
   l'homologation nécessite réellement un Turbo Boost, pas une simple proximité.
3. **Garage Bonnie.** Crédits distincts du score, réputation, secteurs à 120/300,
   rangs et carnet de rapports. Trois équipements à trois niveaux : condensateur
   Turbo, analyseur d'April, pneus moléculaires. Ils modifient saut/recharge,
   portée/énergie et réponse d'accélération/seuil de dérapage. Les achats et
   résultats persistent sur l'appareil.
4. **Construction utile.** Plan de 62 blocs : 25 de sol pierre, 12 de piliers
   métal, 25 de toit bois. Chaque coordonnée et matériau est vérifié. Pose manuelle
   ou matériel de mission déployé couche par couche par les vraies opérations de
   blocs. Un plan incomplet ou démonté ne reçoit pas l'homologation.
5. **Vrai bar-arcade.** Entrée de plain-pied, comptoir en L, arrière-bar garni,
   tabourets chromés, banquettes, tasses, machine à café, ardoise franco-belge,
   barman, damier, brique/bois, éclairage chaud et néons. Les bornes possèdent
   écran animé, bandeau, joystick, boutons et monnayeur. Mobilier solide et allées
   dégagées. Café/gaufre de service avec délai, jukebox relié à la radio.

Boucle effective : **objectif → déplacement/action → rapport au camion FLAG →
crédits/réputation → équipement → intervention suivante**. L'annulation, l'échec
du chrono et un rapport tenté au volant ne donnent pas une prime. Le paiement est
unique. Le chrono et le bonus sont figés à la réussite, pas à la fin du retour.

## Radio

Sept stations : NRJ Dance, Radio Contact, Tipik, Bel RTL, Nostalgie, Nostalgie 80,
Classic 21 80s. Présélections, précédent/suivant, favoris, station/volume/sourdine
mémorisés, état de lecture réel, erreurs et réessai. L'arrêt retire les sources.
La radio active suspend la musique synthétique concurrente du jeu.
Son panneau suspend le déplacement et libère réellement la souris pour régler
les stations ; sa fermeture ou Échap rend la vue FPS. F9 conserve sa fonction
d'allumage/extinction même pendant le réglage.

Les lecteurs NRJ/Bel RTL restent pilotés par leur diffuseur : le jeu ne prétend
pas connaître leur état audio. Les flux directs restent dépendants des stations.
Radio Contact, Tipik et Nostalgie 80 ont été réellement reçus et décodés dans
Chrome lors de cette vérification, en plus des tests du lecteur avec Audio simulé.

## Défauts corrigés et vérifications

- E pouvait être absorbé par un objectif et empêcher de quitter KITT ; il rend
  maintenant d'abord la main au pilote, sauf le sauvetage Goliath prévu au volant.
- L'autonomie vise l'extérieur du bar quand le pilote se trouve dedans.
- Le prompt du chantier conserve le rayon de construction manuel.
- Les démons poursuivent réellement le joueur, respectent les murs, télégraphient
  leur attaque et restent hors du bistrot. Leur temps ne progresse pas en pause.
- Les camions possèdent des volumes de collision ; les décors Halloween restent
  hors du bitume et le terrain du poste se raccorde sans falaise abrupte.
- Les briefings restent compacts par défaut. Sur mobile, radar, actions et
  dialogues n'occupent plus les mêmes emplacements.

Contrôles locaux passés : TypeScript et build du site, contrats/économie/plan,
IA, réseau deux clients/PIN/16 places, contrôles/profils/reconnexion et mobile,
progression anonyme et classement local, vrais signaux WebAudio et voix,
radio et lecture réelle de trois stations, accès à pied aux deux bornes externes,
camions, présentation du bar et disposition mobile.

Le scénario `test-patrol-browser.cjs` appelle KITT, monte/descend, répare à pied,
revient au rapport, construit les cinq couches du plan, revient recevoir sa prime,
achète un équipement et vérifie sa sauvegarde après rechargement. Il part d'une
sauvegarde de position pour le départ ; les déplacements/actions/récompenses sont
effectués avec les commandes. `test-patrol-types-browser.cjs` couvre la conduite
vers un portique, la pause du chrono, les trois indices du scanner et un bloc
manuel conforme au plan. Les captures sont dans `test-results/`, hors publication.

Les essais Chrome utilisent un rendu logiciel de vérification ; ils ne constituent
pas une mesure des 60 FPS sur les différentes cartes graphiques des joueurs.

## Ce qui reste volontairement hors de cette version

- Missions, monstres et économie coopératifs autoritaires côté serveur : les salles
  actuelles partagent avatars, véhicules et blocs, tandis que les contrats restent
  personnels. Le texte du jeu l'indique.
- Classement mondial fiable et progression entre appareils : le carnet reste local.
- Semi-remorque articulé physiquement, pilote rival KARR et campagne cinématique
  longue. Les fonctions et la campagne historiques restent disponibles.
- Photographies et secrets : aucun original photo, PIN ou `.env` n'est ajouté.

## Cinq suites proposées

1. Convoi FLAG coopératif avec rôles pilote, réparateur et opérateur scanner.
2. KARR rival qui suit les routes et sabote les relais réellement partagés.
3. Semi FLAG articulé avec rampe et entrée de KITT dans l'atelier roulant.
4. Rallye Liège–Bruxelles–Paris avec itinéraires et médailles vérifiées serveur.
5. Trophées du bar et classement des bornes reliés à des comptes optionnels.
