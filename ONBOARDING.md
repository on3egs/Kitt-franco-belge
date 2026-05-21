# Kironext Studio — passation technique pour agent IA

Document destiné à toute IA (Kimi, Claude…) reprenant le projet. Lis-le **en
entier** avant de modifier quoi que ce soit. Il décrit l'état réel du code,
pas l'état souhaité.

---

## 1. ⚠️ À LIRE EN PREMIER — le piège du nommage

Le projet a un nom **incohérent** entre le disque, le code et le nom officiel.
Ne « corrige » pas ce nommage à moitié : tu casserais l'application.

| Élément | Valeur réelle actuelle |
|---|---|
| Dossier projet | `~/KironextStudio` (avec **T**) |
| Paquet Python | `kyronext/` (sans T) |
| Module QML | `Kyronext` → `import Kyronext 1.0` (sans T) |
| `__app_name__` (`kyronext/__init__.py`) | `"Kyronext-Studio"` |
| Titre fenêtre / en-tête UI | `Kyronext-Studio` / `KYRONEXT STUDIO` |
| Lanceur installé | `~/.local/bin/kironext-studio` (avec T) |
| Tag du flux audio PulseAudio | `Kironext-Studio` (avec T) |
| **Nom officiel voulu par l'auteur** | **Kironext** (avec T) |

**Couplage critique :** le 2ᵉ argument de `qmlRegisterSingletonType(..., "Kyronext", 1, 0, ...)`
dans `kyronext/app.py` DOIT être identique au `import <Module> 1.0` de **chaque**
fichier `.qml`. Renommer le module QML impose de modifier `app.py` **et tous les
`.qml`** en même temps. Renommer le paquet Python impose de modifier le dossier
`kyronext/`, tous les `from .xxx import`, `run.py`, et l'`import` de `app.py`.

Si on te demande d'unifier en « Kironext », fais-le **en une seule passe complète
et cohérente**, puis teste (section 4). Sinon, n'y touche pas.

---

## 2. Identité & état du projet

Lecteur / téléchargeur YouTube pour Linux (cible : NVIDIA Jetson, Ubuntu 22.04
aarch64), interface « media center » futuriste thème KITT/KARR. Auteur : Manix.
Développé en collaboration Manix + IA. Version `2.0.0`.

C'est une application de bureau **PyQt5 + QML accéléré GPU** : logique en Python,
interface déclarative en QML. ~4500 lignes.

---

## 3. Stack & dépendances

- **Python 3** + **PyQt5** (Qt5 système, installé via `apt`, pas pip — voir
  `requirements.txt`).
- **QML** : QtQuick 2.15, Controls 2, Layouts, Shapes, Particles.
- **NumPy < 2.0** — épinglé : l'environnement Jetson (torch) exige NumPy 1.x.
  Ne pas monter en 2.x.
- **psutil** — débit réseau / CPU.
- Outils système externes : **ffmpeg** + **ffprobe** (lecture + analyse audio),
  **yt-dlp** (téléchargement), **pactl**/**PulseAudio** (volume), **ffplay**
  (effets sonores), **node** (optionnel, fiabilise YouTube), **tegrastats**
  (Jetson, métriques GPU/temp/puissance).

---

## 4. Lancer & tester

```bash
cd ~/KironextStudio
python3 run.py                       # lancement normal (GUI)
kironext-studio                      # idem, via le lanceur installé
KYRONEXT_SMOKETEST=1 python3 run.py  # test sans interaction : quitte seul après 3 s
```

**Vérifier une modification** : lance avec `KYRONEXT_SMOKETEST=1`, redirige la
sortie dans un fichier, inspecte-le. **stderr vide = OK.**

```bash
KYRONEXT_SMOKETEST=1 python3 run.py > /tmp/smoke.log 2>&1; echo "exit=$?"
cat /tmp/smoke.log    # doit être vide
```

⚠️ **Les erreurs QML d'exécution NE FONT PAS planter l'app** : elles s'impriment
sur stderr et l'interface continue, dégradée. Il faut **toujours** lire stderr ;
ne te fie pas au code de sortie.

⚠️ **Ne tue jamais l'app avec `pkill -f run.py`** : le motif `run.py` correspond
aussi au shell qui lance la commande → il se suicide. Tue par correspondance
exacte :

```bash
ps -eo pid,args | awk '$2=="python3" && $3=="run.py"{print $1}' | xargs -r kill
```

⚠️ **Cache QML disque** : Qt met en cache le QML compilé dans
`~/.cache/Manix/Kironext Studio/` ET `~/.cache/Manix/Kyronext-Studio/`
(deux dossiers, séquelle du nommage). Si une modif `.qml` ne semble pas prise en
compte, purge `rm -rf ~/.cache/Manix`.

---

## 5. Carte des fichiers

### Python — `kyronext/`

| Fichier | Rôle |
|---|---|
| `__init__.py` | `__version__`, `__app_name__`. |
| `app.py` | Assemblage : `QGuiApplication`, `QQmlApplicationEngine`, enregistre les **8 singletons** QML, branche `aboutToQuit`, planifie l'auto-update yt-dlp. Point d'entrée `main()`. |
| `config.py` | `Config` — préférences persistées dans `state/config.json`. Clés : `mode`, `playlist`, `liteMode`, `autoUpdate`, `volume`. |
| `history.py` | `History` — historique des URL, `state/history.json`. |
| `deps.py` | `DepsChecker` — détecte/maj `yt-dlp` & dépendances. |
| `downloader.py` | `Downloader` — pilote `yt-dlp` dans un thread, publie progression/journal. |
| `player.py` | `Player` — lecteur audio ffmpeg, playlist du dossier `media/`, niveaux VU, volume. |
| `audio.py` | `PcmReader` — lit un flux PCM float32 dans un thread, calcule RMS (gauche/droite) + bandes FFT (basses/médiums/aigus). |
| `metrics.py` | `SystemMetrics` — `tegrastats` + `psutil` dans un thread : `gpu`, `power`, `temp`, `ram`, `cpu`, `netDown`, `netUp`. |
| `sounds.py` | `SoundFx` — génère un clic WAV, le joue via `ffplay`. |
| `paths.py` | Chemins (`MEDIA_DIR`, `STATE_DIR`…) et constantes (`AUDIO_EXTENSIONS`…). |

### QML — `qml/`

| Fichier | Rôle |
|---|---|
| `main.qml` | Fenêtre principale **sans bordure** (`FramelessWindowHint`) + barre de titre custom. Met en page toutes les sections. |
| `Panel.qml` | Cadre de section (verre/profondeur). **Conteneur à taille fixe** fournie par le layout parent ; le contenu remplit `bodyArea`. |
| `NeonButton.qml`, `ChipToggle.qml` | Bouton néon, interrupteur à puce. |
| `Gauge.qml` | Jauge circulaire animée (`QtQuick.Shapes` + `SpringAnimation`), option `autoScale`. |
| `VuMeter.qml` | Vumètre analogique à aiguille (inertie ressort, maintien de crête). |
| `VolumeControl.qml` | Réglage du volume : icône haut-parleur (Canvas) + glissière. |
| `Background.qml` | Fond animé (grille, particules, scanlines), réagit à `Player.bass`. |
| `BorderEqualizer.qml` | Égaliseurs LED périmétriques. |
| `Oscilloscope.qml` | Visualiseur oscilloscope CRT. |
| `RadioFM.qml` | Panneau tuner FM (utilise `Digit7Seg`/`Segment`). |
| `TapeDeck.qml` | Panneau platine cassette. |
| `ToneControls.qml`, `ToneKnob.qml` | Potards de tonalité hi-fi. |
| `Digit7Seg.qml`, `Segment.qml` | Afficheur 7 segments. |

`run.py` : lanceur (ajoute le projet au `sys.path`, appelle `kyronext.app.main`).
`scripts/kyronext_media.sh` : téléchargement en ligne de commande.
`assets/` images · `media/` médias téléchargés · `state/` config & historique.

---

## 6. Architecture : Python ↔ QML

**Les objets Python sont exposés à QML comme SINGLETONS**, pas comme context
properties. Dans `app.py` :

```python
qmlRegisterSingletonType(type(instance), "Kyronext", 1, 0, "Player", factory)
```

Côté QML : `import Kyronext 1.0` puis `Player.position`, `Config.volume`, etc.

**Pourquoi des singletons et pas des `contextProperty` :** une context property
est **nulle pendant l'évaluation initiale des liaisons QML** → erreurs au
démarrage. Un singleton est résolu au chargement du type, donc toujours
disponible. **Garde ce choix. N'introduis pas de context properties.**

Singletons disponibles : `Config`, `History`, `Deps`, `Downloader`, `Player`,
`Metrics`, `Shell`, `SoundFx`.

**Communication :**
- Lecture QML ← Python : `@pyqtProperty(type, notify=signal)` → liaisons QML.
- Action QML → Python : `@pyqtSlot(...)` → appelable directement (`Player.play(i)`).
- Événement Python → QML : `pyqtSignal` → écouté via `Connections` ou `onXxx`.

**Threads :** `Downloader`, `SystemMetrics` et `PcmReader` tournent dans des
`threading.Thread(daemon=True)`. Ils **n'écrivent jamais** dans QML directement :
ils **émettent des signaux Qt**, automatiquement reroutés vers le thread GUI
(connexions en file). Toute nouvelle logique de fond doit suivre ce modèle.

---

## 7. Sous-systèmes clés

### Téléchargement (`downloader.py`)
`yt-dlp` lancé dans un thread, sortie analysée par regex (pourcentage, vitesse,
ETA). Mode `video` → `bv*+ba/b` fusionné en MP4 ; mode `mp3` → `--extract-audio
--audio-format mp3 --audio-quality 0`. Reprise (`--continue`), nombreux retries.
**Vérifié fonctionnel** (vidéo et MP3).

### Lecteur (`player.py` + `audio.py`)
Un processus **ffmpeg par piste**, avec **deux sorties simultanées** :
1. `-f pulse` → son audible (PulseAudio) ;
2. `-f f32le pipe:1` → PCM brut lu par `PcmReader` → niveaux VU.
Les deux venant du même process, les vumètres sont synchrones avec le son.
`seek` = ffmpeg relancé à la nouvelle position. Fin de piste détectée par un
`QTimer` qui enchaîne la suivante.

### Volume (`player.py`, via `pactl`)
ffmpeg sort à 100 % ; le volume réel est réglé **à chaud** sur le *sink-input*
PulseAudio via `pactl set-sink-input-volume`, **sans relancer ffmpeg**. Le flux
est identifié par `application.name = "Kironext-Studio"` (option ffmpeg `-name`).
Réglage anti-rebondi (`QTimer` 140 ms) pendant un glisser. Le volume scale aussi
les niveaux publiés (`vuLeft/Right`, `bass/mid/treble`) → les vumètres et le fond
suivent le volume. Persisté dans `config.json`.

### Métriques (`metrics.py`)
`tegrastats` (Jetson) parsé par regex pour GPU/temp/RAM/puissance ; `psutil` pour
CPU et débit réseau. Hors Jetson, les valeurs Jetson restent à 0.

---

## 8. Conventions & pièges QML (déjà rencontrés)

1. **`Panel` est un conteneur à taille fixe.** Sa taille vient du layout parent
   (`Layout.preferredHeight`/`fillHeight`) ; `bodyArea` est ancré sur les 4 côtés.
   **Ne refais jamais** `bodyArea.height: childrenRect.height` avec un contenu
   en `anchors.fill: parent` → dépendance circulaire, tout s'écrase à 0.
2. **Largeur d'un délégué de `ListView`** : référence l'`id` de la ListView
   (ex. `width: logView.width`). **Pas** `parent.width` (nul à la création),
   **pas** `ListView.view.width` (observé nul aussi ici).
3. **`PropertyAnimation on x`** : `parent` n'est pas dans la portée de
   l'animation. Donne un `id` à l'objet cible et référence-le.
4. Composants enfants à dimensionner dans un `RowLayout`/`ColumnLayout` : utilise
   `Layout.preferredWidth/Height`, pas `width`/`height` (ignorés par le layout).
5. Le contenu d'un `Panel` se remplit avec `anchors.fill: parent`.

---

## 9. Travaux récents (déjà faits)

- Correctifs layout : `Panel` rendu cohérent, hauteurs ajustées.
- Bouton **volume** complet (`VolumeControl.qml` + logique `pactl`).
- **CORE MONITOR** refait : 7 jauges (CPU, GPU, RAM, TEMP, PWR, ↓, ↑) +
  banc de 5 vumètres (L, R, BASS, MID, TREBLE).
- Fenêtre passée sans bordure + barre de titre custom.
- Ajout `RadioFM`, `TapeDeck`, `ToneControls`, `Oscilloscope`, `SoundFx`.

---

## 10. Limitations connues / à surveiller

- **`README.md` est périmé** : il décrit l'ancienne UI (2 vumètres, 4 jauges).
  Le mettre à jour si on touche aux fonctionnalités.
- **Nommage Kironext/Kyronext** non unifié (section 1).
- L'image `assets/burning_phoenix_wikimedia.png` rend mal (pixels épars).
- `.kimi/config.toml` a `yolo = true` : l'agent Kimi applique sans confirmer —
  d'où l'importance de tester (section 4) après chaque modification.
- Le volume dépend de PulseAudio + `pactl` ; absent → le volume n'a pas d'effet
  (dégradation silencieuse, pas de plantage).
