# Kyronex Studio - Gestion media CLI

Ce projet fournit une base simple pour telecharger une video depuis une URL publique autorisee, conserver le fichier video et extraire une version audio MP3 dans `media/`.

## Installation

Sur Ubuntu/Debian/Jetson avec droits administrateur :

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg nodejs
python3 -m pip install --user --upgrade yt-dlp
```

Ajoutez `~/.local/bin` au `PATH` si `yt-dlp` n'est pas trouve :

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Pour rendre ce changement permanent :

```bash
printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.bashrc
```

Verification :

```bash
yt-dlp --version
ffmpeg -version
node --version
```

## Structure

```text
KyronexStudio/
  assets/
    burning_phoenix_wikimedia.png
    phoenix_fire.png     # Watermark transparent pour l'interface
  media/                 # Videos et fichiers MP3 generes
  state/                 # Historique local et miniature du dernier media
  scripts/
    create_phoenix_asset.py
    kyronex_gui.py       # Interface graphique simple
    kyronex_media.sh     # Telechargement + extraction audio
  README.md
```

## Utilisation

Interface graphique :

```bash
kyronex-studio
```

Un raccourci `Kyronex Studio` est aussi disponible sur le Bureau.

Fonctions de l'interface :

- collage rapide d'URL avec `COLLER`
- telechargement video MP4 meilleure qualite ou MP3 seulement
- jauge de progression, vitesse, ETA et taille
- vumetres digitaux pilotes par l'audio du dernier media : segments L/R, spectre, peak hold, dB et oscilloscope
- apercu du dernier media telecharge
- bouton `OPEN LAST` pour ouvrir le dernier fichier
- historique local des URLs dans `state/history.json`

Depuis le dossier `KyronexStudio` :

```bash
chmod +x scripts/kyronex_media.sh
./scripts/kyronex_media.sh "https://www.youtube.com/watch?v=VIDEO_ID"
```

Avec un nom de sortie personnalise :

```bash
./scripts/kyronex_media.sh "https://www.youtube.com/watch?v=VIDEO_ID" "kyronex_demo"
```

Les fichiers seront crees dans :

```text
KyronexStudio/media/
```

## Notes d'exploitation

- Le script refuse de continuer si `yt-dlp` ou `ffmpeg` est absent.
- Node.js est utilise comme runtime JavaScript pour ameliorer la compatibilite YouTube de `yt-dlp`.
- Les telechargements partiels sont repris automatiquement et les erreurs reseau temporaires sont retentees plus longtemps.
- La video source est conservee et une copie audio MP3 est generee.
- `--no-playlist` evite de telecharger toute une playlist par accident.
- `--restrict-filenames` produit des noms compatibles avec les outils CLI.
- Utilisez uniquement des contenus pour lesquels vous avez les droits de telechargement et de traitement.

## Option GUI : Stacher

Stacher est une interface graphique pour `yt-dlp` disponible sur https://stacher.io/#downloads.

Attention pour cette machine : le telechargement Linux officiel est un paquet Debian `amd64`, alors que ce systeme est `aarch64`/ARM. Ne l'installez pas sur cette machine sauf si l'editeur publie une version ARM compatible.

Sur un poste Ubuntu/Debian `amd64`, l'installation typique serait :

```bash
sudo apt-get install -y ./stacher7_VERSION_amd64.deb
```

Le workflow CLI Kyronex Studio reste independant de Stacher et fonctionne directement avec `yt-dlp` + `ffmpeg`.

## Credits visuels

- `assets/burning_phoenix_wikimedia.png` vient de Wikimedia Commons : "Burning Phoenix - looking left.svg".
- Auteur original : Andres Montesinos ; edition SVG : Jaybear.
- Licence : Creative Commons Attribution-ShareAlike 3.0 Unported.
- Source : https://commons.wikimedia.org/wiki/File:Burning_Phoenix_-_looking_left.svg
