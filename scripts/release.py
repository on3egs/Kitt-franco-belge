#!/usr/bin/env python3
"""Cree un tag git et pousse pour declencher le build GitHub Actions.

Usage:
    python3 scripts/release.py [VERSION]

Exemple:
    python3 scripts/release.py 4.0.1
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()


def run(cmd: list[str]) -> str:
    print("$", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def main() -> int:
    version = sys.argv[1] if len(sys.argv) > 1 else None
    if not version:
        # Lire la version actuelle
        init = ROOT / "kyronext" / "__init__.py"
        for line in init.read_text().splitlines():
            if "__version__" in line:
                version = line.split("=")[-1].strip().strip('"')
                break
        if not version:
            print("ERREUR : impossible de lire la version")
            return 1
        print(f"Version detectee : {version}")
        resp = input(f"Creer le tag v{version} ? [O/n] ")
        if resp.lower() not in ("", "o", "oui", "y", "yes"):
            print("Annule.")
            return 0

    tag = f"v{version}"

    # Verifier que le working tree est propre
    status = run(["git", "status", "--short"])
    if status:
        print("\n⚠️  Des modifications non commitees existent :")
        print(status)
        resp = input("Continuer quand meme ? [o/N] ")
        if resp.lower() not in ("o", "oui", "y", "yes"):
            print("Annule.")
            return 0

    # Creer et pusher le tag
    run(["git", "tag", "-a", tag, "-m", f"Release {tag}"])
    run(["git", "push", "origin", tag])

    print(f"\n✅ Tag {tag} pousse !")
    print(f"   GitHub Actions va automatiquement builder la release.")
    print(f"   Surveille : https://github.com/on3egs/Kitt-franco-belge/actions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
