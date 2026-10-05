"""Minimal espeak-ng adapter for PiperGPU on systems without piper_phonemize_cpp."""
from __future__ import annotations
import subprocess


def phonemize_espeak(text: str, voice: str, data_path=None):
    command = ["espeak-ng", "--ipa=3", "-q", "-v", voice or "fr"]
    if data_path:
        command.extend(["--path", str(data_path)])
    result = subprocess.run(command, input=text, text=True, capture_output=True, check=True)
    return [[line] for line in result.stdout.splitlines() if line]
