# Midnight Runner — By Manix

Jeu d'arcade original, autonome et sans bibliothèque tierce. Les effets graphiques sont dessinés sur Canvas et les bips sont générés avec Web Audio. Aucun fichier audio, image ou service externe n'est requis.

## Commandes

- Flèches gauche/droite, A/D (QWERTY) ou Q/D (AZERTY) : changer de voie.
- Espace maintenu : turbo; il consomme l'énergie et absorbe un impact si la réserve le permet.
- P ou Échap : pause/reprise. M : activer/couper les effets sonores.
- Sur écran tactile : glisser latéralement ou utiliser les flèches; maintenir TURBO pour l'activer.

Évite les voitures, collecte les cellules cyan pour recharger le turbo et tiens 60 secondes réparties en cinq secteurs. Les dépassements sans collision construisent un combo jusqu'à ×5; un choc le réinitialise. Une cellule recharge le turbo et répare un point de blindage si tu as déjà encaissé un impact. Le blindage commence à trois points. Le meilleur score est conservé dans le stockage local du navigateur.

## Intégration

Point d'entrée à ajouter au catalogue du site : `/static/games/midnight-runner/` (`index.html`). Le dossier n'a besoin d'aucun autre fichier de l'application.
