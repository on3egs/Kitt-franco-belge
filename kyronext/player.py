"""Lecteur audio integre.

Pour chaque piste, ffmpeg produit deux sorties simultanees a partir d'un seul
processus :
  1. le son envoye a PulseAudio (lecture audible) ;
  2. un flux PCM brut analyse par audio.PcmReader pour piloter les vumetres.

Comme les deux sorties viennent du meme processus, l'animation des vumetres
est parfaitement synchronisee avec le son entendu.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import time
from pathlib import Path

from PyQt5.QtCore import QObject, QTimer, pyqtProperty, pyqtSignal, pyqtSlot

from . import paths
from .audio import SAMPLE_RATE, PcmReader

# Retire le suffixe "-<identifiant 11 caracteres>" du nom de fichier.
_YT_ID = re.compile(r"-[A-Za-z0-9_-]{11}(?=\.[^.]+$)")

# Nom du flux PulseAudio de lecture : sert a le retrouver pour regler le volume.
_APP_TAG = "Kyronext-Studio"


class Player(QObject):
    """Gere la playlist locale, le transport et les niveaux VU temps reel."""

    playlistChanged = pyqtSignal()
    stateChanged = pyqtSignal()
    levelsChanged = pyqtSignal()
    positionChanged = pyqtSignal()
    volumeChanged = pyqtSignal()

    def __init__(self, config, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._config = config
        self._tracks: list[Path] = []
        self._index = 0
        self._state = "stopped"           # stopped | playing | paused
        self._proc: subprocess.Popen | None = None
        self._reader: PcmReader | None = None
        self._offset = 0.0                # position de depart du processus
        self._started_at = 0.0
        self._duration = 0.0
        # Niveaux bruts (cibles) ; QML applique l'inertie via SpringAnimation.
        self._vu_l = 0.0
        self._vu_r = 0.0
        self._bass = 0.0
        self._mid = 0.0
        self._treble = 0.0

        # Volume de lecture : niveau memorise (0..1), etat de sourdine, et
        # gain applique aux niveaux publies pour que les vumetres suivent.
        self._volume = config.volume
        self._muted = False
        self._level_gain = self._volume

        # Anti-rebond : applique le volume PulseAudio peu apres le dernier
        # reglage, pour ne pas relancer pactl a chaque pixel d'un glisser.
        self._vol_timer = QTimer(self)
        self._vol_timer.setSingleShot(True)
        self._vol_timer.setInterval(140)
        self._vol_timer.timeout.connect(self._apply_volume)

        # Timer de progression : avance la barre de lecture et detecte la
        # fin de piste pour enchainer automatiquement.
        self._tick = QTimer(self)
        self._tick.setInterval(120)
        self._tick.timeout.connect(self._on_tick)
        self._tick.start()

        self.scan()

    # --- proprietes exposees a QML --------------------------------------
    @pyqtProperty("QStringList", notify=playlistChanged)
    def tracks(self) -> list[str]:
        return [self._label(p) for p in self._tracks]

    @pyqtProperty(int, notify=stateChanged)
    def index(self) -> int:
        return self._index

    @pyqtProperty(str, notify=stateChanged)
    def state(self) -> str:
        return self._state

    @pyqtProperty(str, notify=stateChanged)
    def currentTitle(self) -> str:
        if 0 <= self._index < len(self._tracks):
            return self._label(self._tracks[self._index])
        return "AUCUNE PISTE"

    # Les niveaux publies sont attenues par le volume (et coupes en sourdine) :
    # vumetres et fond reactif suivent ainsi ce que l'on entend.
    @pyqtProperty(float, notify=levelsChanged)
    def vuLeft(self) -> float:
        return self._vu_l * self._level_gain

    @pyqtProperty(float, notify=levelsChanged)
    def vuRight(self) -> float:
        return self._vu_r * self._level_gain

    @pyqtProperty(float, notify=levelsChanged)
    def bass(self) -> float:
        return self._bass * self._level_gain

    @pyqtProperty(float, notify=levelsChanged)
    def mid(self) -> float:
        return self._mid * self._level_gain

    @pyqtProperty(float, notify=levelsChanged)
    def treble(self) -> float:
        return self._treble * self._level_gain

    @pyqtProperty(float, notify=positionChanged)
    def position(self) -> float:
        return self._position()

    @pyqtProperty(float, notify=positionChanged)
    def duration(self) -> float:
        return self._duration

    @pyqtProperty(float, notify=volumeChanged)
    def volume(self) -> float:
        return self._volume

    @pyqtProperty(bool, notify=volumeChanged)
    def muted(self) -> bool:
        return self._muted

    # --- volume ---------------------------------------------------------
    @pyqtSlot(float)
    def setVolume(self, value: float) -> None:
        """Regle le volume de lecture (0..1) sans recreer le flux ffmpeg."""
        value = max(0.0, min(1.0, value))
        if value == self._volume and not self._muted:
            return
        self._volume = value
        if value > 0.0:
            self._muted = False
        self._level_gain = self._volume
        self.volumeChanged.emit()
        self.levelsChanged.emit()         # vumetres et fond suivent le volume
        self._vol_timer.start()           # application audio differee (anti-rebond)

    @pyqtSlot()
    def toggleMute(self) -> None:
        """Coupe ou retablit le son ; le niveau regle reste memorise."""
        self._muted = not self._muted
        self._level_gain = 0.0 if self._muted else self._volume
        self.volumeChanged.emit()
        self.levelsChanged.emit()
        self._apply_volume()              # immediat : c'est un clic, pas un glisser

    # --- helpers --------------------------------------------------------
    def _label(self, path: Path) -> str:
        """Nom lisible : sans identifiant ni extension."""
        name = _YT_ID.sub("", path.name)
        name = name.rsplit(".", 1)[0].replace("_", " ").strip()
        return name[:70] if name else path.name

    def _position(self) -> float:
        if self._state == "playing":
            pos = self._offset + (time.time() - self._started_at)
        else:
            pos = self._offset
        if self._duration > 0:
            pos = min(pos, self._duration)
        return max(0.0, pos)

    # --- playlist -------------------------------------------------------
    @pyqtSlot()
    def scan(self) -> None:
        """Recharge la liste des fichiers audio de media/."""
        current = (
            self._tracks[self._index]
            if 0 <= self._index < len(self._tracks)
            else None
        )
        if paths.MEDIA_DIR.exists():
            files = sorted(
                (
                    p
                    for p in paths.MEDIA_DIR.iterdir()
                    if p.is_file() and p.suffix.lower() in paths.AUDIO_EXTENSIONS
                ),
                key=lambda p: p.name.lower(),
            )
        else:
            files = []
        self._tracks = files
        if current in files:
            self._index = files.index(current)
        elif self._index >= len(files):
            self._index = 0
        self.playlistChanged.emit()
        self.stateChanged.emit()

    # --- transport ------------------------------------------------------
    @pyqtSlot(int)
    def play(self, index: int) -> None:
        if not self._tracks:
            return
        self._index = index % len(self._tracks)
        self._offset = 0.0
        self._duration = self._probe(self._tracks[self._index])
        self._spawn(0.0)

    @pyqtSlot()
    def toggle(self) -> None:
        if self._state == "playing":
            self.pause()
        elif self._state == "paused":
            self._spawn(self._offset)
        else:
            self.play(self._index)

    @pyqtSlot()
    def pause(self) -> None:
        self._offset = self._position()
        self._kill()
        self._state = "paused"
        self._zero_levels()
        self.stateChanged.emit()

    @pyqtSlot()
    def stop(self) -> None:
        self._kill()
        self._state = "stopped"
        self._offset = 0.0
        self._zero_levels()
        self.stateChanged.emit()
        self.positionChanged.emit()

    @pyqtSlot()
    def next(self) -> None:
        if self._tracks:
            self.play(self._index + 1)

    @pyqtSlot()
    def previous(self) -> None:
        if self._tracks:
            self.play(self._index - 1)

    @pyqtSlot(float)
    def seek(self, fraction: float) -> None:
        if self._duration <= 0 or self._state == "stopped":
            return
        self._offset = max(0.0, min(1.0, fraction)) * self._duration
        if self._state == "playing":
            self._spawn(self._offset)
        else:
            self.positionChanged.emit()

    @pyqtSlot()
    def shutdown(self) -> None:
        """Arret propre : appele a la fermeture de l'application."""
        self._tick.stop()
        self._kill()

    # --- moteur ffmpeg --------------------------------------------------
    def _spawn(self, offset: float) -> None:
        """Lance ffmpeg : lecture PulseAudio + flux PCM d'analyse."""
        self._kill()
        if not 0 <= self._index < len(self._tracks):
            return
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            return
        track = self._tracks[self._index]
        cmd = [
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error",
            "-ss", f"{max(0.0, offset):.2f}", "-i", str(track),
            # Sortie 1 : son audible via PulseAudio. Le flux est nomme pour
            # pouvoir regler son volume a chaud (pactl), sans relancer ffmpeg.
            "-vn", "-f", "pulse", "-name", _APP_TAG, "default",
            # Sortie 2 : PCM brut sur stdout, lu par l'analyseur VU.
            "-vn", "-ac", "2", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1",
        ]
        try:
            self._proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
            )
        except OSError:
            self._proc = None
            return
        self._reader = PcmReader(self._proc.stdout, self._on_levels)
        self._reader.start()
        self._started_at = time.time()
        self._offset = offset
        self._state = "playing"
        self.stateChanged.emit()
        # Le flux PulseAudio apparait avec un leger delai : on lui applique
        # alors le volume memorise.
        QTimer.singleShot(250, self._apply_volume)

    def _kill(self) -> None:
        """Arrete l'analyseur puis le processus ffmpeg en cours."""
        if self._reader is not None:
            self._reader.stop()
            self._reader = None
        proc = self._proc
        self._proc = None
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass

    def _on_levels(self, left: float, right: float,
                   bass: float, mid: float, treble: float) -> None:
        """Recoit les niveaux du thread d'analyse (connexion Qt securisee)."""
        self._vu_l, self._vu_r = left, right
        self._bass, self._mid, self._treble = bass, mid, treble
        self.levelsChanged.emit()

    def _zero_levels(self) -> None:
        self._vu_l = self._vu_r = 0.0
        self._bass = self._mid = self._treble = 0.0
        self.levelsChanged.emit()

    def _on_tick(self) -> None:
        """Avance la barre de lecture et gere la fin de piste."""
        if (
            self._state == "playing"
            and self._proc is not None
            and self._proc.poll() is not None
        ):
            # ffmpeg s'est arrete : piste terminee.
            played = time.time() - self._started_at
            self._proc = None
            if played < 1.0:
                self.stop()  # lecture impossible (fichier illisible)
            elif self._index + 1 < len(self._tracks):
                self.play(self._index + 1)  # enchaine la piste suivante
            else:
                self.stop()
            return
        if self._state == "playing":
            self.positionChanged.emit()

    def _probe(self, track: Path) -> float:
        """Retourne la duree d'une piste en secondes (0 si inconnue)."""
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            return 0.0
        try:
            result = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=nk=1:nw=1", str(track)],
                capture_output=True, text=True, timeout=10,
            )
            return max(0.0, float(result.stdout.strip()))
        except (OSError, ValueError, subprocess.SubprocessError):
            return 0.0

    # --- volume PulseAudio ----------------------------------------------
    def _apply_volume(self, retry: int = 0) -> None:
        """Applique le volume au flux PulseAudio en cours, sans recreer ffmpeg."""
        if retry == 0:
            self._config.volume = self._volume       # memorise le reglage
        pactl = shutil.which("pactl")
        if pactl is None:
            return
        index = self._sink_input_index(pactl)
        if index is None:
            # Le flux n'est pas encore enregistre aupres de PulseAudio :
            # on reessaie quelques fois pendant qu'une piste demarre.
            if retry < 4 and self._state == "playing":
                QTimer.singleShot(300, lambda: self._apply_volume(retry + 1))
            return
        percent = 0 if self._muted else round(self._volume * 100)
        try:
            subprocess.run(
                [pactl, "set-sink-input-volume", index, f"{percent}%"],
                capture_output=True, timeout=3,
            )
        except (OSError, subprocess.SubprocessError):
            pass

    def _sink_input_index(self, pactl: str) -> str | None:
        """Index PulseAudio du flux de lecture de l'application (None si absent)."""
        try:
            listing = subprocess.run(
                [pactl, "list", "sink-inputs"],
                capture_output=True, text=True, timeout=3,
            ).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        index: str | None = None
        for line in listing.splitlines():
            stripped = line.strip()
            if stripped.startswith("Sink Input #"):
                index = stripped[len("Sink Input #"):].strip()
            elif index is not None and _APP_TAG in stripped:
                return index
        return None
