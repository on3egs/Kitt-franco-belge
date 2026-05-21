#!/usr/bin/env python3
"""Lanceur de Kyronext-Studio.

Ajoute le dossier du projet au chemin d'import puis demarre l'application.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kyronext.app import main  # noqa: E402  (import apres ajustement du chemin)

if __name__ == "__main__":
    sys.exit(main())
