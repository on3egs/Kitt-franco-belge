#!/usr/bin/env python3
"""Synthèse Piper réelle des élisions françaises critiques."""

import sys
import tempfile
import wave
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

from piper import PiperVoice, SynthesisConfig
from test_tts_apostrophes import load_cleaner


def main():
    clean = load_cleaner()
    voice = PiperVoice.load(APP_DIR / "models/voices/kitt.onnx", use_cuda=False)
    samples = (
        "Je suis d’accord avec quelquʼun.",
        "Jʼai ouvert la porte de l’homme.",
        "Quʼest-ce quʼil fait ?",
        "Quelqu’un m’a appelé jusquʼà aujourd’hui.",
        "Je nʼai rien dʼautre à ajouter.",
        "J’aimerais qu’il m’explique ce qu’il s’est passé.",
        "Je suis à lʼaise.",
    )
    with tempfile.TemporaryDirectory(prefix="piper-elisions-") as directory:
        for index, source in enumerate(samples):
            tts_text = clean(source)
            assert "ʼ" not in tts_text and "’" not in tts_text, (source, tts_text)
            path = Path(directory) / f"sample-{index}.wav"
            with wave.open(str(path), "wb") as out:
                voice.synthesize_wav(tts_text, out, syn_config=SynthesisConfig(length_scale=0.85))
            with wave.open(str(path), "rb") as rendered:
                assert rendered.getnframes() > 1000, (source, rendered.getnframes())
                assert rendered.getframerate() == 44100, rendered.getframerate()
    print("OK: 7 phrases synthétisées par Piper avec la voix KITT, WAV lisibles")


if __name__ == "__main__":
    main()
