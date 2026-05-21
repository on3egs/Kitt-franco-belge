#!/usr/bin/env python3
"""Build Kyronext-Studio en binaire autonome via PyInstaller.

Usage:
    python3 scripts/build.py

Produit:
    dist/Kyronext-Studio/     — dossier autonome
    dist/Kyronext-Studio      — binaire executable
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> int:
    # Nettoyage
    if DIST.exists():
        shutil.rmtree(DIST)
    if BUILD.exists():
        shutil.rmtree(BUILD)

    # Verifier PyInstaller
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("PyInstaller manquant. Installation...")
        run([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Fichier d'entree
    entry = ROOT / "run.py"
    if not entry.exists():
        print(f"ERREUR : {entry} introuvable")
        return 1

    # Icone (si existe)
    icon = ROOT / "assets" / "kitt.png"
    icon_arg = ["--icon", str(icon)] if icon.exists() else []

    # Build PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "Kyronext-Studio",
        "--onefile",          # un seul fichier executable
        "--windowed",         # pas de console
        "--clean",
        "--noconfirm",
        *icon_arg,
        # Inclure QML + assets
        "--add-data", f"qml:qml",
        "--add-data", f"assets:assets",
        str(entry),
    ]
    run(cmd)

    # Verifier le resultat
    exe = DIST / "Kyronext-Studio"
    if not exe.exists():
        print("ERREUR : build echoue — executable non trouve")
        return 1

    print(f"\n✅ Build reussi : {exe}")
    print(f"   Taille : {exe.stat().st_size / 1024 / 1024:.1f} Mo")
    print("\nPour tester : ./dist/Kyronext-Studio")
    return 0


if __name__ == "__main__":
    sys.exit(main())
