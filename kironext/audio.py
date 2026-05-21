"""Analyse audio temps reel a partir d'un flux PCM.

Le lecteur fait produire a ffmpeg, en plus du son joue, un flux PCM brut
(float32 stereo). Ce module lit ce flux et en extrait, environ 43 fois par
seconde :
  - le niveau RMS de chaque canal (gauche / droite) pour les vumetres ;
  - la repartition basses / mediums / aigus (FFT) pour le fond reactif.

Le calcul est volontairement leger (numpy vectorise) pour rester fluide,
y compris sur Jetson Nano.
"""

from __future__ import annotations

import threading
from typing import Callable

import numpy as np

SAMPLE_RATE = 44100
CHANNELS = 2
CHUNK_FRAMES = 1024                       # ~43 analyses par seconde
_BYTES_PER_CHUNK = CHUNK_FRAMES * CHANNELS * 4  # float32 = 4 octets

# Fenetre de Hann et masques de frequences pre-calcules une seule fois.
_WINDOW = np.hanning(CHUNK_FRAMES).astype(np.float32)
_FREQS = np.fft.rfftfreq(CHUNK_FRAMES, 1.0 / SAMPLE_RATE)
_MASK_BASS = _FREQS < 250.0
_MASK_MID = (_FREQS >= 250.0) & (_FREQS < 4000.0)
_MASK_TREBLE = _FREQS >= 4000.0

# Signature du callback : (gauche, droite, basses, mediums, aigus), tous 0..1.
LevelCallback = Callable[[float, float, float, float, float], None]


def _rms_to_level(rms: float) -> float:
    """Convertit un niveau RMS lineaire en valeur 0..1 via une courbe en dB."""
    if rms <= 1e-5:
        return 0.0
    decibels = 20.0 * np.log10(rms)
    # -48 dB -> 0.0  ;  0 dB -> 1.0
    return float(np.clip((decibels + 48.0) / 48.0, 0.0, 1.0))


class PcmReader:
    """Lit un flux PCM float32 stereo dans un thread et publie les niveaux."""

    def __init__(self, stream, callback: LevelCallback) -> None:
        self._stream = stream
        self._callback = callback
        self._stop = False
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop = True

    def _loop(self) -> None:
        while not self._stop:
            try:
                raw = self._stream.read(_BYTES_PER_CHUNK)
            except (OSError, ValueError):
                break
            if not raw or len(raw) < _BYTES_PER_CHUNK:
                break  # fin du flux

            data = np.frombuffer(raw, dtype=np.float32).reshape(-1, CHANNELS)
            left = data[:, 0]
            right = data[:, 1]

            level_l = _rms_to_level(float(np.sqrt(np.mean(left * left)) + 1e-9))
            level_r = _rms_to_level(float(np.sqrt(np.mean(right * right)) + 1e-9))

            mono = (left + right) * 0.5
            spectrum = np.abs(np.fft.rfft(mono * _WINDOW))
            total = float(spectrum.sum()) + 1e-9
            bass = min(1.0, float(spectrum[_MASK_BASS].sum() / total) * 2.4)
            mid = min(1.0, float(spectrum[_MASK_MID].sum() / total) * 2.2)
            treble = min(1.0, float(spectrum[_MASK_TREBLE].sum() / total) * 4.5)

            self._callback(level_l, level_r, bass, mid, treble)

        # Flux termine : on remet les niveaux a zero.
        if not self._stop:
            self._callback(0.0, 0.0, 0.0, 0.0, 0.0)
