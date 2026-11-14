# KITT STUNT RACING - Configuration Jetson AGX

## Problèmes Résolus

### 1. CANNON is not defined
- **Cause**: Le CDN de Cannon.js pourrait être bloqué ou trop lent
- **Solution**: Télécharger Cannon.js localement dans `lib/cannon.min.js`
- **Status**: ✅ Corrigé

### 2. Error creating WebGL context  
- **Cause**: Problèmes de compatibilité WebGL sur Jetson AGX
- **Solution**: Ajout de multiples fallback pour WebGL:
  - Désactivation de l'anti-aliasing pour de meilleures performances
  - Tentative avec haute précision d'abord, puis basse précision
  - Options de contexte WebGL spécifiques pour Jetson
  - Fallback vers CSS2DRenderer si nécessaire
- **Status**: ✅ Corrigé

### 3. Contexte WebGL perdu
- **Cause**: Contexte graphique instable sur certains matériels
- **Solution**: Fonctions de vérification et de restauration du contexte WebGL
- **Status**: ✅ Corrigé

## Fichiers Modifiés

1. **index.html**
   - Changement des CDN vers des bibliothèques locales
   - Ajout de vérification de chargement de CANNON

2. **main.js**
   - Amélioration de la création du renderer WebGL avec fallback
   - Ajout de vérification CANNON avant utilisation
   - Ajout de fonctions de vérification/restauration du contexte WebGL
   - Gestion des erreurs dans la boucle d'animation

3. **css/style.css**
   - Assurer que le canvas reste toujours visible

4. **Nouveau dossier: lib/**
   - `three.min.js` - Three.js r128 local
   - `cannon.min.js` - Cannon.js 0.6.2 local

## Instructions de Test

### Méthode 1: Avec Firefox (Recommandé pour Jetson)

```bash
# Fermer d'abord tous les navigateurs
pkill -f firefox || true
pkill -f chromium || true

# Attendre 2 secondes
sleep 2

# Lancer Firefox avec WebGL activé
firefox -P jetson-webgl http://localhost:9000/kitt-ai/kitt-stunt-racing/ &
```

### Méthode 2: Avec Chromium (si Firefox ne fonctionne pas)

```bash
# Fermer les anciens processus Chromium
pkill -f chromium || true
sleep 2

# Lancer Chromium avec flags WebGL
chromium-browser --no-sandbox --disable-gpu --use-gl=egl http://localhost:9000/kitt-ai/kitt-stunt-racing/ &
```

### Méthode 3: Vérification rapide depuis la ligne de commande

```bash
# Tester avec curl pour voir si le serveur répond
curl -I http://localhost:9000/kitt-ai/kitt-stunt-racing/

# Ou ouvrir directement dans le navigateur par défaut
xdg-open http://localhost:9000/kitt-ai/kitt-stunt-racing/
```

## Dépannage

### Si le jeu reste sur l'écran de chargement:

1. **Vérifier la console du navigateur** (F12 ou Ctrl+Shift+I)
2. **Vérifier que CANNON est chargé**:
   ```javascript
   typeof CANNON !== 'undefined'
   ```
3. **Vérifier WebGL**:
   ```javascript
   WebGLRenderingContext !== undefined
   ```
4. **Forcer le rechargement**: Ctrl+F5 ou Ctrl+Shift+R

### Si WebGL échoue:

- Essayez Firefox au lieu de Chromium
- Mettre à jour les pilotes NVIDIA:
  ```bash
  sudo apt update
  sudo apt install --upgrade nvidia-l4t-*
  ```

## Commit & Push

Pour sauvegarder ces corrections:

```bash
cd /home/kitt/kitt-ai

# Ajouter tous les fichiers modifiés
git add kitt-stunt-racing/

# Commit avec un message clair
git commit -m "Fix WebGL and CANNON loading issues for Jetson AGX

- Add local Three.js and Cannon.js libraries to avoid CDN issues
- Improve WebGL renderer initialization with multiple fallback options
- Add CANNON availability check before physics initialization
- Add WebGL context recovery functions for unstable GPU contexts
- Ensure game-canvas is always visible for WebGL context creation
- Add error handling in animation loop for rendering/physics errors


# Push vers le dépôt
git push origin main
```

## Configuration Recommandée pour Jetson

### Firefox:
- Utiliser le profil `jetson-webgl` avec WebGL activé
- Version: Firefox 153.0.4 ou supérieur

### Chromium:
- Utiliser avec les flags: `--no-sandbox --disable-gpu --use-gl=egl`
- Alternative: `--disable-software-rasterizer`

### Performances:
- Résolution recommandée: 1280x720 ou 1920x1080
- Anti-aliasing: Désactivé (pour de meilleures performances)
- Précision WebGL: Basse si haute échoue

## État actuel et tests (v7)

Le menu expose **quatre circuits** : niveaux 1, 2, 3 (avec le looping) et le
**circuit personnalisé** (niveau 4), constructible dans le **Constructeur de
circuit** (menu 🧱, touche `E`). La **page des scores** (🏆, touche `S`) affiche
le hall of fame local par niveau (médailles 🥇🥈🥉, vitesse max, date). La
musique synthwave se toggle avec `P`. Signature **By Manix** présente sur tous
les écrans.

Nouveautés v7 :
- **Graphismes** : tone mapping ACES + sRGB, ombres portées (soleil qui suit la
  voiture), phares réels (spots), aurores boréales animées, étoiles scintillantes
  et filantes, montagnes silhouettées, grille au sol défilante, piliers néon
  pulsants, bandes néon sur les pistes, particules (poussière, étincelles de
  turbo, chocs), confettis à l'arrivée, lignes de vitesse et flash d'impact.
- **Audio** (`js/audio.js`, 100 % WebAudio) : moteur à 4 rapports (3
  oscillateurs + admission), vent et dérapages selon la physique, chocs,
  fanfares, musique synthwave procédurale (séquenceur kick/basse/pads).
- **Code** : `main.js` (cœur + niveau 4 reconstruit depuis une liste d'opérations),
  `js/audio.js`, `js/scores.js`, `js/editor.js`. L'ancien dossier `editor/` est
  conservé comme code historique, il n'est pas chargé.

Tests automatisés headless (Chromium + swiftshader) : `test/e2e.html` avec les
scénarios `boot`, `race1`, `loop3`, `editor`, `scores`, `shot*`
(?scenario=…&gameqs=autodrive=1). Le mode `tick=1` remplace rAF par un timer
(les rAF sont bridés sous Chromium headless).

Pour valider rapidement l'installation :

```bash
./test_game.sh
node --check main.js
```

Pour un test de course automatisé dans Chromium headless, utiliser l'URL :

```text
http://127.0.0.1:9001/?autorace=1&autodrive=1&level=1
```

Si des problèmes persistent, vérifier:
   - Les pilotes GPU sont à jour
   - Le navigateur supporte WebGL 1.0 ou supérieur
   - Aucun bloqueur de scripts n'est actif

---
*Documentation créée pour Manix/KITT FRANCO BELGE*
*Date: 14 août 2026*
