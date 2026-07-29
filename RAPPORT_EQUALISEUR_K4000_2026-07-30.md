# Rapport — restauration de l’équaliseur K4000 — 30 juillet 2026

## Cause exacte

L’équaliseur historique n’était pas masqué par le nouveau fond : son fichier `k4000-voice-display.js` existait encore sur K4000, mais la synchronisation de `k4000/app/static/index.html` avait remplacé la page active par une version qui ne contenait plus :

- la balise `<script>` chargeant le composant ;
- le conteneur `<k4000-voice-display>` ;
- le bouton et les événements plein écran ;
- le raccordement du lecteur Web Audio à l’analyseur.

Le composant ne pouvait donc plus être instancié. Le composant original a été restauré et amélioré; aucun second équaliseur n’a été ajouté.

## Fichiers modifiés

- `k4000/app/static/index.html`
- `k4000/app/static/k4000-voice-display.js`

## Opacité et calques

- Mode normal : fond du canvas à `0.80` (80 %), barres/textes/graduations conservés à forte lisibilité.
- Mode plein écran : fond du canvas à `1.00` (100 %), totalement opaque.
- Conteneur normal : `z-index: 40`, `isolation: isolate`, `pointer-events: none`.
- Bouton plein écran : `z-index: 42`, `pointer-events: auto`.
- Plein écran de secours/orientation : `position: fixed`, `inset: 0`, `z-index: 9999`.
- L’image de fond reste donc toujours sous l’équaliseur et la surface visuelle ne bloque aucun contrôle.

## Rendu

- Barres en blocs rectangulaires nets, style numérique années 1990.
- Fréquences logarithmiques affichées : 80, 160, 315, 630 Hz, 1.25, 2.5, 5 et 8 kHz.
- Graduations 0, -12, -24 et -36 dB.
- Canvas `image-rendering: pixelated`, coordonnées arrondies et absence de flou sur les barres/traits/textes.
- Animation synchronisée au son avec `AnalyserNode`, `requestAnimationFrame` et lissage spectral.
- Redimensionnement géré par `ResizeObserver`.

## Tests

- Démarrage : script HTTP 200, composant personnalisé instancié, dimensions non nulles.
- 1536×1024 : canvas 998×352, normal, opacité 0.8.
- 1024×768 : canvas 961×339, normal, opacité 0.8.
- 390×844 : canvas 498×176 (densité écran incluse), normal, opacité 0.8.
- 1280×560 paysage : mode plein écran automatique, largeur canvas 1280, opacité 1.
- Plein écran : pixels des quatre bords opaques, aucune traversée du fond d’écran.
- Entrée/sortie : événements `fullscreenchange`, `webkitfullscreenchange`, redimensionnement et changement d’orientation raccordés à `resize()`.
- Audio : le `AudioBufferSourceNode` est reconnecté à `voiceDisplay.connectSource`, puis libéré à la fin de chaque morceau.
- Service `kyronext.service` resté actif, aucune erreur Python/JavaScript serveur relevée.

## Retour arrière

Sauvegarde K4000 : `/home/K4000/kyronext-backups/equalizer_restore_20260730_013329`
