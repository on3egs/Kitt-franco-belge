#!/usr/bin/env python3
"""Genere la banque d'accueils vocaux "Bonjour <prenom>" avec la voix Guy Chapelier.

Utilise Piper TTS en local sur CPU avec le modele guy_chapelier_v3 — la meme voix
que le serveur LLM KITT. 100% hors-ligne, gratuit, aucune cle API, aucun GPU
sollicite (le serveur LLM garde la carte pour lui).

Usage :
    python3 scripts/generate_greetings.py

Sortie, dans assets/greetings/ :
    bonjour.mp3              — "Bonjour" generique (repli pour un prenom inconnu)
    bonjour_<prenom>.mp3     — un fichier par prenom de kyronext/prenoms.txt
Les fichiers deja presents sont ignores : la commande est relançable a volonte.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import wave
from pathlib import Path

_PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT))

from kyronext.voice_greeting import _slug, load_names  # noqa: E402

# Voix Guy Chapelier — modele Piper partage avec le serveur LLM KITT.
_MODEL = Path("/home/kitt/kitt-ai/models/guy_chapelier_v3.onnx")
_OUT_DIR = _PROJECT / "assets" / "greetings"


def _render(voice, text: str, out_mp3: Path) -> None:
    """Synthetise `text` et l'ecrit en MP3 (WAV temporaire intermediaire)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_wav = Path(tmp.name)
    try:
        with wave.open(str(tmp_wav), "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)
        # Conversion WAV -> MP3 : banque plus legere et versionnable.
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp_wav),
             "-codec:a", "libmp3lame", "-q:a", "4", str(out_mp3)],
            check=True,
        )
    finally:
        tmp_wav.unlink(missing_ok=True)


def main() -> int:
    if not _MODEL.exists():
        print(f"Modele introuvable : {_MODEL}", file=sys.stderr)
        return 1

    names = load_names()
    if not names:
        print("kyronext/prenoms.txt vide ou absent.", file=sys.stderr)
        return 1

    try:
        from piper import PiperVoice
    except ImportError as exc:
        print(f"Package Python 'piper' introuvable : {exc}", file=sys.stderr)
        return 1

    print(f"Chargement de la voix Guy Chapelier ({_MODEL.name})...", flush=True)
    voice = PiperVoice.load(str(_MODEL), use_cuda=False)
    _OUT_DIR.mkdir(parents=True, exist_ok=True)

    # "Bonjour" generique en tete, puis un "Bonjour <prenom>" par prenom.
    jobs: list[tuple[str, Path]] = [("Bonjour.", _OUT_DIR / "bonjour.mp3")]
    for name in names:
        jobs.append((f"Bonjour {name}.", _OUT_DIR / f"bonjour_{_slug(name)}.mp3"))

    created = skipped = failed = 0
    total = len(jobs)
    for i, (text, out_mp3) in enumerate(jobs, start=1):
        if out_mp3.exists() and out_mp3.stat().st_size > 0:
            skipped += 1
            continue
        try:
            _render(voice, text, out_mp3)
            created += 1
            print(f"[{i}/{total}] {text} -> {out_mp3.name}", flush=True)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[{i}/{total}] {text} - ECHEC : {exc}", file=sys.stderr, flush=True)

    print(f"\nTermine : {created} cree(s), {skipped} ignore(s), {failed} echec(s).")
    print(f"Banque : {_OUT_DIR}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
