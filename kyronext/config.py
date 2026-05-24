"""Parametres utilisateur, sauvegardes automatiquement dans state/config.json.

Expose chaque reglage comme une propriete Qt : l'interface QML peut les lire
et les modifier directement, et toute modification est ecrite sur le disque.
"""

from __future__ import annotations

import json

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal

from . import paths

# Valeurs par defaut d'une premiere installation.
DEFAULTS = {
    "mode": "video",       # "video" (MP4) ou "mp3" (audio seul)
    "playlist": False,     # telecharger la playlist entiere plutot qu'une video
    "liteMode": False,     # mode allege : moins d'effets visuels (Jetson Nano)
    "soberMode": False,    # skin sobre (bibliotheque + recherche, sans visualiseurs)
    "autoUpdate": True,    # mise a jour automatique de yt-dlp au demarrage
    "volume": 1.0,         # volume de lecture audio (0.0 .. 1.0)
    "userName": "",        # prenom de l'utilisateur (accueil vocal personnalise)
    # --- Controles de tonalite (0.0..1.0, 0.5 = neutre) ---
    "eqBass":   0.5,       # +-12 dB autour de 100 Hz
    "eqMid":    0.5,       # +-12 dB autour de 1 kHz
    "eqTreble": 0.5,       # +-12 dB autour de 8 kHz
    "balance":  0.5,       # 0 = tout gauche, 1 = tout droite
    "inputGain": 0.5,      # gain d'entree (0 = silence, 0.5 = unite, 1 = +6 dB)
    "dolby":    0.0,       # simulation Dolby B (>0.5 => leger coupe-haut a 5 kHz)
}


class Config(QObject):
    """Conteneur de preferences persistantes."""

    changed = pyqtSignal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._data = dict(DEFAULTS)
        self._load()

    def _load(self) -> None:
        """Lit le fichier de config s'il existe, en ignorant les cles inconnues."""
        try:
            raw = json.loads(paths.CONFIG_FILE.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if isinstance(raw, dict):
            for key in DEFAULTS:
                if key in raw:
                    self._data[key] = raw[key]

    def _save(self) -> None:
        """Ecrit la config sur le disque (echec silencieux si non inscriptible)."""
        try:
            paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
            paths.CONFIG_FILE.write_text(json.dumps(self._data, indent=2), "utf-8")
        except OSError:
            pass

    def _set(self, key: str, value: object) -> None:
        if self._data.get(key) != value:
            self._data[key] = value
            self._save()
            self.changed.emit()

    # --- proprietes exposees a QML --------------------------------------
    @pyqtProperty(str, notify=changed)
    def mode(self) -> str:
        return self._data["mode"]

    @mode.setter
    def mode(self, value: str) -> None:
        self._set("mode", value)

    @pyqtProperty(bool, notify=changed)
    def playlist(self) -> bool:
        return self._data["playlist"]

    @playlist.setter
    def playlist(self, value: bool) -> None:
        self._set("playlist", bool(value))

    @pyqtProperty(bool, notify=changed)
    def liteMode(self) -> bool:
        return self._data["liteMode"]

    @liteMode.setter
    def liteMode(self, value: bool) -> None:
        self._set("liteMode", bool(value))

    @pyqtProperty(bool, notify=changed)
    def soberMode(self) -> bool:
        return self._data["soberMode"]

    @soberMode.setter
    def soberMode(self, value: bool) -> None:
        self._set("soberMode", bool(value))

    @pyqtProperty(bool, notify=changed)
    def autoUpdate(self) -> bool:
        return self._data["autoUpdate"]

    @autoUpdate.setter
    def autoUpdate(self, value: bool) -> None:
        self._set("autoUpdate", bool(value))

    @pyqtProperty(float, notify=changed)
    def volume(self) -> float:
        return self._data["volume"]

    @volume.setter
    def volume(self, value: float) -> None:
        self._set("volume", max(0.0, min(1.0, float(value))))

    @pyqtProperty(str, notify=changed)
    def userName(self) -> str:
        return self._data["userName"]

    @userName.setter
    def userName(self, value: str) -> None:
        self._set("userName", str(value).strip())

    # --- Controles de tonalite --------------------------------------------
    @pyqtProperty(float, notify=changed)
    def eqBass(self) -> float:
        return self._data["eqBass"]

    @eqBass.setter
    def eqBass(self, value: float) -> None:
        self._set("eqBass", max(0.0, min(1.0, float(value))))

    @pyqtProperty(float, notify=changed)
    def eqMid(self) -> float:
        return self._data["eqMid"]

    @eqMid.setter
    def eqMid(self, value: float) -> None:
        self._set("eqMid", max(0.0, min(1.0, float(value))))

    @pyqtProperty(float, notify=changed)
    def eqTreble(self) -> float:
        return self._data["eqTreble"]

    @eqTreble.setter
    def eqTreble(self, value: float) -> None:
        self._set("eqTreble", max(0.0, min(1.0, float(value))))

    @pyqtProperty(float, notify=changed)
    def balance(self) -> float:
        return self._data["balance"]

    @balance.setter
    def balance(self, value: float) -> None:
        self._set("balance", max(0.0, min(1.0, float(value))))

    @pyqtProperty(float, notify=changed)
    def inputGain(self) -> float:
        return self._data["inputGain"]

    @inputGain.setter
    def inputGain(self, value: float) -> None:
        self._set("inputGain", max(0.0, min(1.0, float(value))))

    @pyqtProperty(float, notify=changed)
    def dolby(self) -> float:
        return self._data["dolby"]

    @dolby.setter
    def dolby(self, value: float) -> None:
        self._set("dolby", max(0.0, min(1.0, float(value))))
