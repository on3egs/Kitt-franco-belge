"""Effets sonores de l'interface (clics, ticks).

Genere un clic typewriter court au format WAV puis le joue via ffplay
en arriere-plan ( subprocess non-bloquant ).
"""
from __future__ import annotations

import struct
import subprocess
import wave
from pathlib import Path

from PyQt5.QtCore import QObject, pyqtSlot

from . import paths

_CLICK_PATH = Path(paths.STATE_DIR) / "click.wav"

# Sons du splash de demarrage (console power-up + scanner KITT).
_SPLASH_SOUNDS = (
    paths.ASSETS_DIR / "splash_powerup.mp3",
    paths.ASSETS_DIR / "splash_scanner.mp3",
)


def _generate_click_wav(path: Path) -> None:
    sr = 22050
    duration = 0.040  # 40 ms
    n = int(sr * duration)
    data = bytearray()
    for i in range(n):
        t = i / sr
        env = (1.0 - t / duration) ** 2.8
        impulse = 0.6 * env * (1.0 if i % 3 == 0 else -0.35)
        noise = 0.12 * env * ((i * 7 % 5) / 5.0 - 0.5)
        sample = int((impulse + noise) * 32767 * 0.85)
        sample = max(-32768, min(32767, sample))
        data += struct.pack("<h", sample)

    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(data)


class SoundFx(QObject):
    """Singleton expose a QML pour jouer des effets sonores."""

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._splash_procs: list = []
        if not _CLICK_PATH.exists():
            paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
            _generate_click_wav(_CLICK_PATH)

    @pyqtSlot()
    def click(self) -> None:
        """Joue un court clic de confirmation via ffplay (non-bloquant)."""
        try:
            subprocess.Popen(
                ["ffplay", "-nodisp", "-autoexit", "-volume", "20",
                 str(_CLICK_PATH)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (OSError, FileNotFoundError):
            pass

    @pyqtSlot()
    def splash(self) -> None:
        """Joue les sons de demarrage (console power-up + scanner KITT)."""
        for path in _SPLASH_SOUNDS:
            if not path.exists():
                continue
            try:
                proc = subprocess.Popen(
                    ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet",
                     "-volume", "60", str(path)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                self._splash_procs.append(proc)
            except (OSError, FileNotFoundError):
                pass

    @pyqtSlot()
    def stopSplash(self) -> None:
        """Coupe les sons de demarrage encore en cours."""
        for proc in self._splash_procs:
            if proc.poll() is None:
                try:
                    proc.terminate()
                except OSError:
                    pass
        self._splash_procs.clear()
