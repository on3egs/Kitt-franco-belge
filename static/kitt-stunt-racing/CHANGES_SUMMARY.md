# KITT STUNT RACING - Résumé des Corrections

**Date:** 15 août 2026  
**Pour:** Jetson AGX - Problèmes de chargement WebGL et CANNON

---

## 🎬 Version 7 (14 septembre 2026) — By Manix

### Graphismes (au maximum, cœur de nuit néon)
- Rendu cinéma : tone mapping **ACES filmique**, espace couleur **sRGB**, exposition réglée.
- **Ombres portées** (PCF 1024) : un soleil directionnel + caméra d'ombre qui suivent la voiture ; la carrosserie, les routes et les piliers projettent des ombres.
- **Phares réels** : deux spots à l'avant de KITT qui éclairent la piste.
- Environnement vivant : **aurores boréales** ondulantes, 620 étoiles (certaines scintillantes), **étoiles filantes**, chaînes de **montagnes** silhouettées, **grille au sol** défilante, **piliers néon** pulsants, skyline avec **antennes clignotantes**.
- Pistes habillées : **bandes néon** rouges/cyan alternées au sol, **néons sur les arches**, lampadaires avec halo, confettis à l'arrivée.
- Effets d'écran : **vignettage** permanent, **lignes de vitesse** à haute vélocité, **flash rouge** d'impact.
- **Particules** (pool de 160 sprites, zéro allocation en vol) : poussière de dérapage, gerbes d'échappement turbo, étincelles de choc contre les murs.
- Caméra : secousse d'impact (atterrissages, murs, turbo), FOV vitesse/turbo.

### Audio (100 % WebAudio synthétisé — `js/audio.js`)
- **Moteur à 4 rapports** : 2 scies désaccordées + sub octave + bruit d'admission ; le régime monte/chute à chaque rapport.
- **Vent** (croît en v²), **dérapages** (passe-bande piloté par la vitesse latérale réelle).
- SFX : chocs (thud), atterrissage, turbo, scanner, checkpoints, compte à rebours, fanfare/record, boucle réussie.
- **Musique synthwave procédurale** : séquenceur kick 4/4, basse 8ths, pads d'accords, hats — touche `P` ou bouton 🎵.

### Constructeur de circuit (fonctionnel)
- Menu 🧱 **CONSTRUCTION DE CIRCUIT** (touche `E`) : 12 types de pièces
  (routes, montées/descentes, virages 45°/90° G/D, saut, **boucle**, checkpoint).
- **Reconstruction en direct** du circuit (meshes **et** corps physiques détruits puis recréés proprement), sauvegarde automatique `localStorage`.
- Checkpoints automatiques tous les 3 morceaux ; caméra orbite (glisser / molette).
- Bouton **🏁 TESTER** → course immédiate sur le circuit ; jouable aussi via
  🛠️ **CIRCUIT PERSONNALISÉ** (touche `4`) depuis le menu.

### Hall of fame (page des scores stylée — `js/scores.js`)
- Écran 🏆 (touche `S`) : par niveau, top 5 des courses avec 🥇🥈🥉, temps, vitesse max, date ; meilleur temps mis en avant ; effacement à confirmation.
- Chaque arrivée enregistre le run (60 max) et affiche le **classement local** atteint.

### Touches
Flèches/WASD conduite • Espace turbo • X scanner • R checkpoint • **P musique** • **S scores** • **E constructeur** • 1-4 niveaux • Échap pause/retour.

### Architecture
- `main.js` (cœur, ~2100 lignes) + `js/audio.js` + `js/scores.js` + `js/editor.js`.
- API `window.KITT` (startRace, backToMenu, rebuildCustom, camera…) pour les modules.
- Niveau 4 = liste d'opérations (`customLayoutFromOps`) ; `rebuildCustom` gère le cycle de vie complet (dispose géométries/matériaux non partagés).
- Tests headless `test/e2e.html` (scénarios boot/race1/loop3/editor/scores/shot), `test_game.sh` étendu (23 contrôles verts).

---

## 🆕 Refonte complète (v2)

### Objectif
Reconstruction de zéro d'une base propre, stable et jouable, style **Stunt Car Racer 1990** avec la voiture **KITT** de Knight Rider.

### Fichiers remplacés
- `index.html` — structure minimale (canvas, menu, HUD)
- `main.js` — code réécrit de zéro avec architecture claire
- `css/style.css` — interface simplifiée, style rétro Knight Rider

### Améliorations majeures
1. ✅ Piste générée segment par segment sans chevauchement
2. ✅ Voiture KITT alignée au sol (corps physique = bas des roues)
3. ✅ Physique stable : pas de temps fixe `1/60`, `maxSubSteps=3`
4. ✅ Sécurité anti-NaN / reset si chute
5. ✅ Contrôles : flèches/WASD, turbo (espace), reset (R)
6. ✅ Caméra poursuite stable
7. ✅ Affichage des erreurs JS à l'écran
8. ✅ Paramètres `?autorace=1` et `?autodrive=1` pour les tests

---

## Problèmes Identifiés et Résolus

### 🔴 Problème 1: `ERROR: CANNON is not defined`
**Cause:** 
- La bibliothèque Cannon.js était chargée depuis un CDN (cdnjs.cloudflare.com)
- Les requêtes CDN peuvent être bloquées ou trop lentes sur certains réseaux
- Si le CDN échoue, la variable globale CANNON n'est pas définie

**Solutions Implémentées:**
1. ✅ Téléchargement local de Cannon.js (v0.6.2) dans `lib/cannon.min.js`
2. ✅ Mise à jour de index.html pour utiliser la version locale au lieu du CDN
3. ✅ Vérification dans main.js que CANNON est défini avant utilisation
4. ✅ Fallback vers un système de physique simple si CANNON n'est pas disponible

**Fichiers Modifiés:**
- `index.html` - Changement de `<script src="https://cdnjs.cloudflare.com/ajax/libs/cannon.js/...">` vers `<script src="lib/cannon.min.js">`
- `main.js` - Ajout de vérification CANNON dans `initPhysics()`
- Nouveau: `lib/cannon.min.js` - Copie locale de Cannon.js

---

### 🔴 Problème 2: `ERROR: Error creating WebGL context`
**Cause:**
- Problèmes de compatibilité WebGL sur Jetson AGX
- Paramètres de contexte WebGL par défaut peuvent ne pas fonctionner avec le GPU NVIDIA Tegra
- Anti-aliasing activé peut causer des problèmes de performance
- Précision haute (highp) peut ne pas être supportée

**Solutions Implémentées:**
1. ✅ Tentative de création WebGL avec haute précision d'abord
2. ✅ Fallback vers basse précision si haute échoue
3. ✅ Désactivation de l'anti-aliasing pour de meilleures performances
4. ✅ Ajout de l'option `failIfMajorPerformanceCaveat: false` pour éviter les échecs avec les GPU lents
5. ✅ Fallback final vers CSS2DRenderer si WebGL n'est pas disponible
6. ✅ Gestion des erreurs améliorée dans la boucle d'animation

**Fichiers Modifiés:**
- `main.js` - Amélioration de `initThreeJS()` avec multiples niveaux de fallback
- `main.js` - Ajout de `checkWebGLContext()` et `restoreWebGLContext()`
- `main.js` - Vérification du contexte WebGL dans `animate()`
- `index.html` - Ajout de vérification de support WebGL

---

### 🔴 Problème 3: Jeu bloqué sur l'écran de chargement à 100%
**Cause:**
- Le canvas WebGL pourrait être caché ou non visible lors de la création du contexte
- La création du contexte WebGL nécessite que le canvas soit visible

**Solutions Implémentées:**
1. ✅ Assurer que #game-canvas reste toujours visible (CSS: `visibility: visible !important`)
2. ✅ Assurer que #game-canvas a `opacity: 1 !important`
3. ✅ Canvas positionné en `fixed` avec z-index: 1 pour être toujours au-dessus

**Fichiers Modifiés:**
- `css/style.css` - Ajout de `visibility: visible !important` et `opacity: 1 !important` à #game-canvas

---

## 🔴 Problème 4: Port serveur toujours occupé
**Cause:**
- `start_server.sh` et `LAUNCH_GAME.sh` étaient figés sur le port 9001
- Si un autre processus utilisait ce port, le lancement échouait

**Solutions Implémentées:**
1. ✅ Détection automatique d'un port libre parmi : 8000, 8001, 8002, 8003, 9000, 9001
2. ✅ Affichage clair du port utilisé dans la console
3. ✅ Mise à jour de `LAUNCH_GAME.sh` pour ouvrir le navigateur sur le bon port

**Fichiers Modifiés:**
- `start_server.sh` - Recherche de port libre
- `LAUNCH_GAME.sh` - Recherche de port libre et propagation à l'URL

---

## 🔴 Problème 5: Piste et voiture invisibles
**Cause:**
- `updateTrackPosition()` était vide : toutes les pièces de piste s'empilaient à l'origine
- Couleurs trop sombres (route 0x333333, voiture 0x111111)
- Lumières ambiantes faibles (intensité 0.5)
- Caméra trop proche de la scène

**Solutions Implémentées:**
1. ✅ `buildTrack()` utilise maintenant les positions/rotations explicites de chaque pièce
2. ✅ Implémentation de `updateTrackPosition()` pour l'éditeur
3. ✅ Éclaircissement des couleurs (route 0x666666, voiture 0x222222)
4. ✅ Augmentation de l'éclairage ambiant (0.8) et directionnel (1.0)
5. ✅ Caméra positionnée plus haut et plus loin (0, 15, 25)
6. ✅ Caméra qui suit la voiture pendant la course

**Fichiers Modifiés:**
- `main.js` - `buildTrack()`, `updateTrackPosition()`, `GameConfig`, `initLighting()`, `initThreeJS()`, `updateVehicle()`

---

## 🔴 Problème 6: Contrôles inopérants
**Cause:**
- La touche `S` était utilisée à la fois pour reculer (`ArrowDown`/`KeyS`) et pour activer le scanner
- Pas de corps physique sous la piste : la voiture tombait dans le vide

**Solutions Implémentées:**
1. ✅ Déplacement de l'activation du scanner sur la touche `X`
2. ✅ Ajout d'un corps physique de sol de secours dans `addGround()`
3. ✅ Implémentation de `createTrackPhysics()` avec des boîtes de collision pour chaque pièce
4. ✅ Contrôles : flèches/WASD pour conduire, Espace pour le turbo, X pour le scanner

**Fichiers Modifiés:**
- `main.js` - `handleRaceKey()`, `addGround()`, `createTrackPhysics()`

---

## Fichiers Nouveaux

```
kitt-stunt-racing/
├── lib/
│   ├── three.min.js      # Three.js r128 local (603KB)
│   └── cannon.min.js     # Cannon.js 0.6.2 local (132KB)
├── README_JETSON.md      # Documentation complète pour Jetson
├── test_game.sh          # Script de test des problèmes courants
├── start_server.sh      # Script de démarrage du serveur
└── CHANGES_SUMMARY.md    # Ce fichier
```

---

## Fichiers Modifiés

### 1. index.html
- **Ligne 271-273:** Changement des CDN Three.js et Cannon.js vers des versions locales
- **Ligne 277-292:** Ajout de script de vérification WebGL et CANNON

### 2. main.js
- **Ligne 198-267:** Remplacement de la création simple du renderer WebGL par une version robuste avec multiples fallback
- **Ligne 305-325:** Ajout de vérification CANNON dans initPhysics() avec fallback
- **Ligne 1770-1800:** Ajout de fonctions checkWebGLContext() et restoreWebGLContext()
- **Ligne 1838-1878:** Ajout de vérification du contexte WebGL dans animate()

### 3. css/style.css
- **Ligne 344-353:** Ajout de `visibility: visible !important` et `opacity: 1 !important` à #game-canvas

---

## Solution Complète pour Chromium

D'après les messages de l'utilisateur, Chromium ne fonctionne plus. Voici comment le faire fonctionner:

### Solution 1: Utiliser Chromium avec des flags spécifiques pour Jetson
```bash
chromium-browser \
  --no-sandbox \
  --disable-gpu \
  --use-gl=egl \
  http://localhost:9001/
```

### Solution 2: Installer Chromium depuis les dépôts Mozilla (meilleur support WebGL)
```bash
# Installer Firefox (qui a un meilleur support WebGL sur ARM)
sudo apt update
sudo apt install firefox -y

# Créer un profil avec WebGL activé
firefox -P jetson-webgl
# Dans le profil, s'assurer que WebGL est activé dans about:config
```

### Solution 3: Utiliser le navigateur par défaut avec l'URL correcte
```bash
xdg-open http://localhost:9001/
```

---

## Instructions de Commit

```bash
cd /home/kitt/kitt-ai

# Ajouter tous les fichiers modifiés et nouveaux
git add kitt-stunt-racing/

# Commit avec un message descriptif
git commit -m "Fix WebGL and CANNON loading issues for Jetson AGX compatibility

Corrections:
- Add local Three.js r128 and Cannon.js 0.6.2 libraries to avoid CDN issues
- Improve WebGL renderer initialization with multiple fallback levels:
  * Try high precision first, fall back to low precision
  * Disable antialiasing for better Jetson performance
  * Use failIfMajorPerformanceCaveat: false to avoid GPU rejection
  * Fallback to CSS2DRenderer if WebGL completely fails
- Add CANNON availability check before physics initialization with mock fallback
- Add WebGL context checking and recovery functions in animation loop
- Ensure game-canvas is always visible for WebGL context creation
- Add comprehensive error handling in render loop

New files:
- lib/three.min.js, lib/cannon.min.js (local libraries)
- README_JETSON.md (comprehensive Jetson setup guide)
- test_game.sh (diagnostic script)
- start_server.sh (dedicated server startup)


# Push vers le dépôt
git push origin main
```

---

## Comment Tester

### 1. Démarrer le serveur dédié:
```bash
/home/kitt/kitt-ai/kitt-stunt-racing/start_server.sh
# Puis ouvrir: http://localhost:9001/
```

### 2. Ou utiliser le serveur existant:
```bash
# Copier kitt-stunt-racing vers un endroit servi par le serveur existant
# Par exemple, si le serveur sert /home/kitt/kitt-ai/static/:
cp -r /home/kitt/kitt-ai/kitt-stunt-racing /home/kitt/kitt-ai/static/
# Puis ouvrir: http://localhost:9000/static/kitt-stunt-racing/
```

### 3. Exécuter le script de test:
```bash
/home/kitt/kitt-ai/kitt-stunt-racing/test_game.sh
```

---

## Prochaines Étapes Recommandées

1. ✅ Tester dans Firefox avec le profil jetson-webgl
2. ✅ Tester dans Chromium avec les flags spécifiés
3. ✅ Vérifier que l'écran de chargement dépasse 100% et que le menu apparaît
4. ✅ Cliquer sur "DEMARRER LA COURSE" et vérifier que la course se lance
5. ✅ Tester les contrôles (flèches, espace pour turbo)

Si des problèmes persistent:
- Ouvrir la console du navigateur (F12) et vérifier les erreurs
- Vérifier que `typeof CANNON !== 'undefined'`
- Vérifier que `WebGLRenderingContext` est défini

---

## Crédits

Toutes les corrections ont été faites pour supporter:
- **Groupe Facebook**: KITT FRANCO BELGE (mentionné dans le jeu)
- **Par Manix**: Développeur du jeu

Technologies: Three.js r128, Cannon.js 0.6.2, HTML5, CSS3, Vanilla JavaScript

---

---

## 🆕 Corrections du 15 août 2026 (v3)

### Problèmes résolus
1. **Voiture immobile** : passage à `CANNON.RaycastVehicle` pour une physique de voiture correcte (roues, suspension, moteur).
2. **Erreur JS bloquante** : correction de la portée de `speedKmh` dans `updateRace()`.
3. **Caméra trop basse** : caméra relevée pour mieux voir la piste.
4. **HUD illisible** : panneaux plus contrastés, ombres de texte, bordures rouges renforcées.
5. **Piste en morceaux / mal alignée** : refonte de la génération de piste avec des sections continues, des barrières latérales et des supports visuels.
6. **Debug** : ajout d'un overlay debug activable avec `?debug=1`.

### Fichiers modifiés
- `main.js`
- `css/style.css`
- `index.html`
- `CHANGES_SUMMARY.md`

---

**Date:** 14 août 2026


---

## 🆕 Version 4 — « Le jeu devient un vrai jeu » (12 septembre 2026)

### Résumé
Reprise du projet après les versions 2-3 (voiture immobile puis piste droite sans but).
Cette version transforme le prototype en **jeu complet et fini** : circuit avec virages et
saut, course chronométrée avec checkpoints et arrivée, record sauvegardé, turbo, scanner,
sons, pause — le tout validé de bout en bout par des tests automatisés dans un vrai
navigateur (Puppeteer + Chromium headless, pilotage autonome de la course entière).

### Le bug fondateur (la voiture « molle » des versions 2-3)
La voiture roulait à peine (≈12 km/h) et s'arrêtait dans les virades. Cause exacte,
prouvée par tests Node hors navigateur sur `lib/cannon.min.js` (officiel 0.6.2, md5 vérifié) :

- **`axleLocal` était `(0,0,1)`** (axe longitudinal) : les roues « roulaient » sur le flanc.
  La convention y-up correcte du `RaycastVehicle` cannon 0.6.2 est **`axleLocal (1,0,0)`**
  (essieu latéral), avec `indexRightAxis:0, indexUpAxis:1, indexForwardAxis:2`.
- **`world.defaultContactMaterial.friction = 0`** requis (sinon la carrosserie frotte et
  freine la voiture ; seules les roues doivent fournir l'adhérence).
- **`frictionSlip` est un plafond d'impulsion** (force max ≈ slip/dt) : 5 est la valeur
  de la démo officielle ; 8 convient à ~500 kg.
- Le modèle de pneus raycast **sous-vire massivement** et oppose un fort contre-couple
  de lacet (≈0,6 rad/s annulés par pas de physique) : toute « suggestion » de rotation
  via `angularVelocity.y` est digérée par le solveur.

### La solution retenue : assistance de braquage arcade
- Lacet **affecté directement** (`angularVelocity.y = steer·v/2.6`, plafonné ±2,2 rad/s,
  gain 1, après `world.step`) + intégration de quaternion en renfort ×0,5.
- Courbure = braquage / empattement (modèle bicyclette) : tenue de virage déterministe
  pour le joueur humain et pour l'autodrive de test.
- Braquage max 0,5 rad (optimum mesuré : au-delà le scrub décroît), `frictionSlip: 5`.

### Piste
Traceur avec état {x, z, y, yaw} : straights (pente gérée), virages en arcs discrétisés
(6°/segment, recouvrement 0,3), et **saut avec trou** (rampe + gap + réception).
Mur lisse unique par côté (hauteur inatteignable — l'ancienne petite barrière laissait
le châssis s'accrocher à son bord et escalader), barrières rouges visuelles conservées.
Arches DÉPART / CHECKPOINT n / ARRIVÉE (canvas texture), supports sous les sections
élevées, grille au sol, étoiles, piliers néons décoratifs.

### Boucle de jeu complète
Menu (caméra orbite) → compte à rebours 3-2-1-GO → course → **écran d'arrivée**
(temps, record localStorage `kittStuntRacingBest`, vitesse max) → rejouer/menu.
Pause (Échap), turbo (Espace, recharge 3 s), scanner animé (X), feux de freinage,
reset au dernier checkpoint (R), respawns automatiques (chute, retournement,
**blocage par déplacement** <1,5 m sur 3 s).

### Sons (WebAudio synthétisé, aucun fichier)
Moteur (scie, pitch lié à la vitesse), bips compte à rebours/checkpoints, fanfare
d'arrivée, whoosh turbo, sweep scanner. Jamais bloquant (try/catch partout).

### Autodrive (tests et démo) — `?autodrive=1`
Poursuite pure sur la **ligne de centre précalculée** (waypoints tous les ~8 m, index
monotone, visée +3 points, correcteur P gain 1,2 + rampe 1,6 rad/s, freinage anticipé).
Filets de sécurité : perdu >25 m de la ligne → respawn + resynchronisation de l'index ;
fin de ligne sans arrivée → nouvelle tentative. Validé : course complète en **≈23,5 s**,
139 km/h de pointe, 0 erreur JS.

### Fichiers
- `main.js` — réécriture complète (~1250 lignes), physique validée, `window.__kitt`
  (état pour tests automatisés) et `window.__kittTrace` (anneau 60 Hz de diagnostic).
- `index.html` — écrans compte à rebours / pause / résultats, barre turbo, aide contrôles.
- `css/style.css` — styles des nouveaux écrans.
- `lib/cannon.min.js`, `lib/three.min.js` — inchangés (officiels).

### Validations automatisées (Puppeteer + Chromium headless)
- Syntaxe : `node --check main.js` OK.
- Menu → clic Démarrer → countdown → racing → 3 checkpoints → finished → résultats.
- Braquage humain mesuré : +53° (gauche 1,5 s @ 70 km/h), −146° (droite 2 s).
- Turbo, pause/reprise, reset R : fonctionnels. 0 erreur JS sur l'ensemble.
- Note : `--enable-unsafe-swiftshader` requis pour le WebGL logiciel headless ;
  les screenshots du snap Chromium s'écrivent hors namespace /tmp (utiliser le home).

### Prochaines pistes (non demandées, idées)
Éditeur de circuits (l'ancien `editor/` est à recâbler sur la v4), tours multiples,
meilleur temps fantôme, gamepad, sons échantillonnés.


---

## 🆕 Version 5 — Maniabilité arcade + Niveau 2 + beauté (12 septembre 2026)

### Maniabilité (retours joueur : « tourne trop vite », « accroche trop »)
- **Lacet plafonné à 80°/s** (`turnRateMax: 1.4` rad/s) au lieu de 126°/s : virages
  franches mais maîtrisables.
- **Braquage humain adouci** : rampe de 4,5 rad/s vers la consigne (finis les à-coups).
- **Glisse le long des murs** : la composante « vers le mur » de la vélocité est
  absorbée, la composante « le long du mur » est conservée (+ petit rebond) —
  raser un mur ne bloque plus la voiture, elle continue d'avancer (comportement
  arcade). Détection des murs par la géométrie de collision (boîtes 0,25×2,2).

### Niveau 2 — « Nuit rapide »
- Sélection au menu (boutons ou touches 1/2), records séparés
  (`kittStuntRacingBest1/Best2`), affichage des deux records au menu, indicateur
  de niveau dans le HUD.
- Circuit neuf (~430 m) : ouverture en 45°, double saut, grand virage 90° à y=2,
  descente, **chicane S**, second petit saut, 4 checkpoints.
- Architecture : les deux pistes coexistent dans le même monde (niveau 2 décalé
  de +420 en x) — pas de reconstruction dynamique, bascule instantanée.
- `?level=2` dans l'URL pour démarrer directement dessus.
- **Piège corrigé** : le contrôle anti-sortie `|x|>400` respawnait la voiture du
  niveau 2 à chaque frame (piste à x=420). Bornes élargies à ±1500.

### Beauté
- Route en **asphalte texturé** (bruit + bords rouges/liseré blanc dessinés dans
  la texture, répétition proportionnelle à la longueur du segment).
- **Ciel en dégradé** (noir → bleu nuit → pourpre) sur dôme inversé, étoiles,
  **lune** avec halo additif.
- **Skyline** : 2 grappes d'immeubles aux fenêtres éclairées (une par niveau).
- **Lampadaires** le long de la piste (tous les 2 segments, alternance des côtés,
  sphère émettrice + halo additif).
- KITT : scoop de capot, lèvre avant, **liseré rouge** latéral, **underglow rouge**
  (sprite additif + point light sous la caisse), **flamme turbo** scintillante à l'arrière.
- Version cache `?v=5`.

### Validé (E2E autodrive, Chromium headless)
- Niveau 1 : **23,45 s** (record), 139 km/h. Niveau 2 : **19,63 s** (record), 129 km/h.
- 0 erreur JS sur les deux niveaux.

---

## 🆕 Validation et correction ciblée — 12 septembre 2026

### Problème confirmé
- Le niveau 3 (looping) était bien généré par `buildTrack()`, mais aucun bouton
  ne permettait de le sélectionner.
- Le paramètre `?level=3` était ignoré et retombait silencieusement sur le niveau 1.
- Le bouton affichait `ÉDITEUR (bientôt)` alors que l'éditeur historique n'est
  pas compatible avec les globaux de la version actuelle et n'était pas chargé.

### Correction
- Ajout du bouton `NIVEAU 3 — Looping` et de la touche `3`.
- Validation des niveaux demandés dans l'URL et dans `startRace()`.
- Ajout du record du niveau 3 dans le menu.
- Version cache portée à `v=6`.
- `test_game.sh` rendu portable et aligné sur les vérifications réellement
  présentes dans le code actuel.

### Correction complémentaire du niveau 3
- Le premier test avec `?level=3` a révélé que la sortie du looping re-déclenchait
  immédiatement le looping : la voiture restait dans la boucle et ne pouvait pas
  atteindre la suite du circuit.
- Ajout d'un état `loopCompleted` par sélection de niveau et décalage contrôlé de
  1,5 m à la sortie vers la section suivante.

### Validation
- `node --check` sur `main.js`, `editor/editor.js` et `editor/trackPieces.js` : OK.
- Chromium headless avec WebGL logiciel : menu et runtime sans erreur.
- Autodrive niveau 1 : arrivée en 23,43 s, 0 erreur applicative.
- Autodrive niveau 2 : arrivée en 19,75 s, 0 erreur applicative.
- Autodrive niveau 3 via la logique de boucle : arrivée en 23,44 s, 0 erreur
  applicative.
- Autodrive niveau 3 réellement sélectionné (`?level=3`) après correction : arrivée
  en 18,13 s, looping parcouru, 0 erreur applicative.


## Fusion Legacy — 14 novembre 2026 · By Manix

Version commune PC / Jetson / site : dix circuits, dix-huit pilotes et fonctionnalités récentes du Jetson ; mode compatible 2D, démarrage protégé et correctifs de commandes issus du site. KITT et KARR utilisent les Trans Am de Legacy Transmission, avec roues Cannon et pièces détachables adaptées. Les portraits, récits audio et licences sont inclus.

La fiche du pilote est organisée en trois blocs : identité et véhicule, histoire sur toute la largeur, puis statistiques. L'écoute du récit possède son propre bouton. La présentation est vérifiée sur ordinateur et mobile.

Validation : dix-huit pilotes, conduite, dégâts et restauration, pause à la perte de focus, fonctionnement sans Three.js ; courses complètes de trois tours sur les circuits 1, 3 avec looping, et 10.
