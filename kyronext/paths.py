"""Chemins de fichiers et constantes partages par toute l'application.

Centraliser ces valeurs ici evite de les repeter dans chaque module et
facilite un eventuel deplacement du projet.
"""

from __future__ import annotations

from pathlib import Path

# Racine du projet = dossier parent du paquet "kyronext".
PROJECT_DIR = Path(__file__).resolve().parent.parent

MEDIA_DIR = PROJECT_DIR / "media"      # videos et MP3 telecharges
STATE_DIR = PROJECT_DIR / "state"      # donnees locales (historique, config)
ASSETS_DIR = PROJECT_DIR / "assets"    # images de l'interface
QML_DIR = PROJECT_DIR / "qml"          # fichiers d'interface QML

HISTORY_FILE = STATE_DIR / "history.json"
CONFIG_FILE = STATE_DIR / "config.json"
PHOENIX_ASSET = ASSETS_DIR / "burning_phoenix_wikimedia.png"

# Extensions reconnues pour le lecteur audio et le balayage des medias.
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".opus", ".wav", ".flac", ".ogg", ".aac"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi"}
MEDIA_EXTENSIONS = AUDIO_EXTENSIONS | VIDEO_EXTENSIONS


def ensure_dirs() -> None:
    """Cree les dossiers de travail s'ils n'existent pas encore."""
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
