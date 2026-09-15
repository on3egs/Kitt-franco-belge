#!/usr/bin/env python3
"""Installe les voix Piper françaises déclarées dans voices_manifest.json.

Les poids restent volontairement hors Git. Chaque téléchargement comprend le
modèle ONNX, sa configuration ONNX JSON et la carte du modèle quand publiée.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
MANIFEST = APP_DIR / "voices_manifest.json"
DEFAULT_VOICE_DIR = APP_DIR / "models" / "voices"
HF_RESOLVE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/{speaker}/{quality}/{filename}"
MODEL_CARD_FILENAMES = ("MODEL_CARD", "README.md")


def download(url: str, destination: Path) -> bool:
    """Télécharge atomiquement, sans écraser un fichier déjà complet."""
    if destination.is_file() and destination.stat().st_size:
        print(f"[OK] Déjà présent : {destination.name}")
        return True
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(destination)
        print(f"[OK] Téléchargé : {destination.name}")
        return True
    except (OSError, urllib.error.URLError, urllib.error.HTTPError) as exc:
        temporary.unlink(missing_ok=True)
        print(f"[ERREUR] {destination.name}: {exc}", file=sys.stderr)
        return False


def model_parts(voice: dict) -> tuple[str, str, str]:
    filename = Path(voice["path"]).name
    # Les ids du manifeste correspondent directement au répertoire officiel.
    speaker, quality = filename.removesuffix(".onnx").removeprefix("fr_FR-").rsplit("-", 1)
    return speaker, quality, filename


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice-dir", type=Path, default=DEFAULT_VOICE_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    selected = [v for v in manifest["voices"] if v["engine"] == "piper" and v["id"].startswith("fr_fr_")]
    failures = []
    for voice in selected:
        speaker, quality, filename = model_parts(voice)
        destination = args.voice_dir / voice["path"]
        base_url = HF_RESOLVE.format(speaker=speaker, quality=quality, filename=filename)
        print(f"\n== {voice['name']} ({voice['quality']}) ==")
        if args.dry_run:
            print(base_url)
            continue
        ok_model = download(base_url, destination)
        ok_config = download(base_url + ".json", Path(str(destination) + ".json"))
        # Une carte est une information de licence/documentation, non un prérequis du runtime.
        card_dir = destination.parent / "model_cards"
        card_ok = False
        for card_name in MODEL_CARD_FILENAMES:
            if download(base_url.rsplit("/", 1)[0] + "/" + card_name, card_dir / f"{filename}.{card_name}"):
                card_ok = True
                break
        if not (ok_model and ok_config and card_ok):
            failures.append(voice["id"])
    if failures:
        print("Voix incomplètes : " + ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
