# PROMPT DE CORRECTION — Kyronext Studio UI

> Contexte : Projet QML PyQt5 à `/home/kitt/KironextStudio/`. Stack : QtQuick 2.15, Shapes. Pas de QtMultimedia. Aesthetic strict : années 80 hi-fi / auto (Smiths/VDO), PAS de néon/fluo/RGB gaming. Mat, chrome, aluminium brossé, incandescent chaud.

---

## 1. CORE MONITOR — Calibration aiguille Gauge.qml

**Fichier** : `qml/Gauge.qml`  
**Fichier appelant** : `qml/main.qml` (lignes 289-295)

**Problème** : Les 7 gauges (CPU, GPU, RAM, TEMP, PWR, ↓, ↑) affichent une valeur numérique correcte (ex: CPU 30 %), mais l'aiguille rouge reste à 0. L'arc rouge de la circonférence, lui, semble juste. L'aiguille doit suivre l'arc rouge au bout du nez.

**Analyse technique actuelle** :
- `frac` est calculé dans `onValueChanged` et `onScaleMaxChanged` avec `frac = Math.max(0, Math.min(1, value / scaleMax))`.
- L'arc rouge (Canvas `arcCanvas`) utilise `(start + root.frac * root.arcSpan)`.
- L'aiguille (`needle`) utilise le même angle `root.arcStart + root.frac * root.arcSpan`.
- Donc l'aiguille et l'arc sont cohérents entre eux, mais pas avec la valeur numérique affichée.

**Root cause probable** : `frac` n'est pas correctement mis à jour quand `value` arrive de Python. Peut-être un problème de type (string vs number) depuis `Metrics.cpu`, ou un binding cassé, ou `scaleMax` qui bloque le calcul (ex: `autoScale` ou `maxValue` incorrect).

**Action demandée** :
- Vérifier que `value` est bien traité comme un `real` (forcer `parseFloat` côté Python si besoin, ou caster en QML).
- S'assurer que `frac` est une propriété **bindée** (`frac: Math.max(0, Math.min(1, value / scaleMax))`) plutôt qu'assignée dans `onValueChanged`, pour éviter les déconnexions de signal.
- Si `autoScale` est utilisé pour les gauges réseau, vérifier qu'il ne pollue pas les autres.
- **Résultat attendu** : quand CPU = 30, l'aiguille pointe exactement au même endroit que l'arc rouge (soit 30 % de l'arc), et le chiffre centre affiche 30.

---

## 2. VU METERS — Descendre et élargir pour lisibilité

**Fichier** : `qml/main.qml` (ligne 303)  
**Fichier** : `qml/VuMeter.qml`

**Problème** : Les 5 VU meters (L, R, BASS, MID, TREBLE) sont trop serrés. Les chiffres gradués (-48, -36, -24, etc.) s'entrechevauchent et sont illisibles.

**Action demandée** :
1. Dans `main.qml` ligne 303, augmenter la hauteur de la rangée VU meters de `105` à **`115`** (descendre/donner plus d'air).
2. Dans `VuMeter.qml`, augmenter `implicitWidth` de `260` à **`280`** (élargir chaque VU meter de 20 px).
3. Vérifier que les labels Canvas (ligne 163) ne se chevauchent plus avec la nouvelle largeur. Si besoin, réduire légèrement la taille de police des chiffres (`bold 9px` → `bold 8px`) ou espacer les labels numériques.

---

## 3. RÉORGANISATION DES IMAGES KITT

### 3a. HEADER — Scanner seul
**Fichier** : `qml/main.qml` (lignes 197-205)

**Problème** : L'image `kitt_scanner.png` dans le header montre trop (scanner + partie plaque). On ne doit voir que la bande LED scanner.

**Action** :
- Soit utiliser `sourceClipRect: Qt.rect(x, y, w, h)` sur l'Image QML pour zoomer/croper dynamiquement.
- Soit regénérer le PNG via Python/PIL (`PIL.Image.crop`) à partir de `assets/kitt.png` pour ne garder que la partie supérieure scanner (environ le tiers supérieur de l'image originale 1536×1024).
- Hauteur cible dans le header : garder `height: 34` et `width: 320`.
- **Conserver** la petite image `kitt.png` (42 px) à droite des toggles UPDATE/LITE (lignes 188-193).

### 3b. TRANSFER — Cockpit
**Fichier** : `qml/main.qml` (lignes 253-279)

**Action** :
- Retirer l'image `kitt_plate.png` actuelle dans le panel TRANSFER.
- Y mettre `kitt_cockpit.jpg` en fond, `fillMode: Image.PreserveAspectCrop`, `opacity: 0.12`.
- L'image doit être placée **sous** les éléments de texte/boutons (donc déclarée avant ou avec `z` inférieur).

### 3c. SYSTEM LOG — Plaque zoomée
**Fichier** : `qml/main.qml` (lignes 475-487)

**Action** :
- Retirer `kitt_franco_belge.jpg` du SYSTEM LOG.
- Y mettre `kitt_plate.png` (la plaque d'immatriculation zoomée déjà existante) en fond, `fillMode: Image.PreserveAspectCrop`, `opacity: 0.15`.

### 3d. AUDIO PLAYER — Franco-Belge
**Fichier** : `qml/main.qml` (lignes 321-328)

**Action** :
- Retirer `kitt.png` du fond de la playlist (AUDIO PLAYER).
- Y mettre `kitt_franco_belge.jpg` à la place, `fillMode: Image.PreserveAspectCrop`, `opacity: 0.12`.

### 3e. HISTORY — Retirer cockpit
**Fichier** : `qml/main.qml` (lignes 488-495)

**Action** :
- Retirer `kitt_cockpit.jpg` du panel HISTORY (le laisser vide, fond noir standard).

---

## 4. HEADER — Version v4

**Fichier** : `qml/main.qml` (ligne 178)

**Action** : Remplacer le texte `"KNIGHT INDUSTRIES MEDIA CENTER v2.0"` par `"KNIGHT INDUSTRIES MEDIA CENTER v4.0"`.

---

## ASSETS DISPONIBLES (dans `assets/`)

- `kitt.png` — voiture complète 1536×1024
- `kitt_scanner.png` — crop actuel (à recadrer si besoin)
- `kitt_plate.png` — crop plaque déjà existant
- `kitt_franco_belge.jpg` — affiche Franco-Belge
- `kitt_cockpit.jpg` — tableau de bord intérieur

## RÈGLE ESTHÉTIQUE (INCONTOURNABLE)

- PAS de néon, PAS de glow flashy, PAS de RGB gaming.
- Cible : Smiths/VDO 1980s, Nagra, Tascam. Mat, chrome sobre, aluminium brossé, lumière incandescente chaude.
- Opacité des images de fond : entre 0.10 et 0.18 maximum.
