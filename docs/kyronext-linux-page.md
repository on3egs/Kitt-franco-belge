# Présentation Kyronext OS — 30 octobre 2026

Page statique préparée dans `client/public/kyronext-linux/`, liée depuis une
carte de `client/src/pages/ToolsHub.tsx`. Le chemin `/kyronext-os/` existant
reste la démonstration Web et n'a pas été remplacé.

La nouvelle page présente la distribution Linux Live réelle : Debian 13,
KDE Plasma, AMD64, personnalisation et limites de la préversion. Elle
comprend une capture réelle du Live, une lecture vocale facultative avec
arrêt, ainsi qu'une fiche technique téléchargeable. Aucun lien de
téléchargement ISO public n'est inventé et aucune illustration de véhicule
de la série n'est distribuée sur cette page.

## Contrôles effectués

- `node --check client/public/kyronext-linux/presentation.js` : réussi.
- Analyse TSX de ToolsHub avec esbuild : réussie.
- `git diff --check` : réussi.
- Présence des fichiers liés (CSS, JS, capture, fiche) : vérifiée.
- Rendu réel Edge headless 1440 × 1100 : inspecté, capture conservée dans
  `G:/kyronext-os/logs/kitt-kyronext-page.png`.

La voix audible dépend du navigateur et des voix système ; elle n'a pas
été écoutée en test. Aucun build global, déploiement, transfert d'ISO ou
changement de configuration Jetson n'a été effectué.

Pour publier : inclure le répertoire statique dans le prochain build Vite
et déployer la page ainsi que la carte du hub selon le processus existant.
La page correspondante `https://kyronext.eu/kyronext-os/` doit également être
publiée avant de considérer le lien intersite comme opérationnel.
