# Kyronext-Studio

Application Linux de téléchargement et de gestion de contenus media, avec
une interface futuriste inspirée de KITT / KARR.

Auteur : **Manix** — administrateur du groupe Facebook *KITT Franco-Belge*.
Collaboration : Manix + IA.

---

## Fonctionnalités

- Téléchargement **vidéo MP4** (meilleure qualité) ou **audio MP3**
- Téléchargement de **playlists** complètes
- **Barre de progression**, vitesse, ETA, taille
- **Journal système** détaillé et **historique des URL**
- **Lecteur audio intégré** (lecture du dossier `media/`)
- **2 vumètres analogiques** à aiguille, pilotés en temps réel par le son
  (analyse PCM + inertie physique réaliste)
- **4 compteurs animés** : débit montant, débit descendant, puissance (watts),
  charge GPU — alimentés par les capteurs Jetson
- **Fond animé** discret accéléré GPU (grille, particules, scanner KARR)
- **Mise à jour automatique** de `yt-dlp` au démarrage
- Détection des **dépendances manquantes** avec aide à l'installation
- **Mode allégé** pour les petits Jetson (Nano)

## Architecture

Interface **Qt5 / QML** (rendu accéléré GPU) pilotée par une logique Python.

```text
KyronextStudio/
  run.py                  Lanceur de l'application
  requirements.txt        Dépendances Python
  kyronext/               Logique applicative (Python)
    app.py                Assemblage QApplication + moteur QML
    config.py             Paramètres utilisateur persistants
    history.py            Historique des URL
    deps.py               Vérification / mise à jour des dépendances
    downloader.py         Téléchargement yt-dlp
    player.py             Lecteur audio (ffmpeg)
    audio.py              Analyse audio temps réel (RMS + FFT)
    metrics.py            Compteurs système (tegrastats + psutil)
    paths.py              Chemins et constantes
  qml/                    Interface QML
    main.qml              Fenêtre principale
    NeonButton, Panel, ChipToggle, VuMeter, Gauge, Background
  scripts/
    kyronext_media.sh     Téléchargement en ligne de commande
  assets/  media/  state/
```

## Installation

Sur Ubuntu / Jetson (avec droits administrateur, une seule fois) :

```bash
sudo apt install -y ffmpeg nodejs \
    python3-pyqt5 python3-pyqt5.qtquick \
    qml-module-qtquick2 qml-module-qtquick-controls2 \
    qml-module-qtquick-window2 qml-module-qtquick-layouts \
    qml-module-qtquick-particles2 qml-module-qtquick-shapes

pip install --user --upgrade yt-dlp numpy psutil
```

## Utilisation

Interface graphique :

```bash
kyronext-studio
```

Un raccourci **Kyronext-Studio** est aussi disponible sur le Bureau.

Ligne de commande :

```bash
./scripts/kyronext_media.sh "https://example.com/watch?v=VIDEO_ID"
```

## Notes d'exploitation

- `yt-dlp` et `ffmpeg` sont indispensables ; `node` est conseillé (meilleure
  compatibilité) mais optionnel.
- Les téléchargements partiels sont repris automatiquement et les erreurs
  réseau temporaires sont retentées.
- Les compteurs GPU / puissance utilisent `tegrastats` (Jetson) ; sur une
  machine classique ils restent simplement à zéro.
- Le **mode allégé** désactive les particules et l'animation de la grille
  pour les Jetson les moins puissants (Nano).
- N'utilisez que des contenus pour lesquels vous avez les droits.

## Crédits visuels

`assets/burning_phoenix_wikimedia.png` — Wikimedia Commons,
« Burning Phoenix - looking left.svg », auteur Andres Montesinos
(édition SVG : Jaybear), licence Creative Commons BY-SA 3.0.

`assets/manix.png` — photographie de l'auteur, © Manix.

## Licence

Ce logiciel est libre, distribué sous licence
**GNU General Public License v3** — voir le fichier `LICENSE`.

Chacun peut l'utiliser, l'étudier, le modifier et le redistribuer ;
toute version dérivée doit rester sous cette même licence.

### Dépendances et leurs licences

| Composant      | Licence                        |
|----------------|--------------------------------|
| PyQt5          | GPL v3                         |
| Qt 5           | LGPL v3                        |
| numpy, psutil  | BSD 3-Clause                   |
| yt-dlp         | The Unlicense (domaine public) |

> Le projet dépend de **PyQt5**, dont la seule licence libre est la
> GPL v3 : c'est elle qui impose la GPL v3 à l'ensemble du projet.

### Marques et images de tiers

Les noms « KITT », « KARR », « Knight Rider », ainsi que le design du
véhicule et de son scanner, sont la propriété d'Universal Studios.
Ce projet est une œuvre de fan, **non commerciale**, sans aucun lien
officiel avec Universal. Les images correspondantes ne sont pas
couvertes par la licence GPL v3 de ce dépôt.

### Conditions d'utilisation et mentions légales

L'usage du logiciel est encadré par le fichier
[`CONDITIONS_UTILISATION.md`](CONDITIONS_UTILISATION.md). Les
informations légales du site figurent dans
[`MENTIONS_LEGALES.md`](MENTIONS_LEGALES.md).
