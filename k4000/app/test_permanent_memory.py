#!/usr/bin/env python3
"""Tests sans LLM ni matériel pour la mémoire permanente ciblée K-4000."""

import os
import sys
from pathlib import Path

os.environ["KYRONEXT_WHISPER_PRELOAD"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import kitt_server as server


EXPECTED = {
    "Qui a fabriqué ton scanner ?": "current_scanner",
    "Où a été fabriquée ta fibre ?": "current_bodywork",
    "Quelle résine a été utilisée ?": "current_bodywork",
    "Combien de temps a pris ta construction ?": "current_construction",
    "Quelle couleur vas-tu avoir ?": "current_construction",
    "Quelle est ta longueur ?": "current_dimensions_weight",
    "Combien pèses-tu ?": "current_dimensions_weight",
    "Quel moteur as-tu ?": "current_powertrain_safety",
    "Quelle boîte de vitesses as-tu ?": "current_powertrain_safety",
    "Sur quelle voiture était basée la Knight 4000 du film ?": "film_origin",
    "Quelle voiture a inspiré son dessin ?": "film_origin",
    "Qui était ta voix française ?": "film_cast_continuity",
    "Qui était ta voix américaine ?": "film_cast_continuity",
}

UNRELATED = (
    "Quelle heure est-il ?",
    "Quel temps fera-t-il demain ?",
    "Donne-moi une recette de crêpes.",
    "Calcule 17 fois 23.",
    "Qui est le président de la France ?",
    "Raconte-moi une histoire.",
    "Ouvre les fenêtres.",
    "Joue une musique.",
    "Comment vas-tu ?",
    "Explique la photosynthèse.",
)


def main() -> None:
    for question, expected_id in EXPECTED.items():
        section_ids = [item["id"] for item in server._match_permanent_memory_sections(question)]
        assert expected_id in section_ids, (question, expected_id, section_ids)
    for question in UNRELATED:
        assert not server._match_permanent_memory_sections(question), question
    scanner_history = [
        {"role": "user", "content": "Qui s'est occupé du scanner ?"},
        {"role": "assistant", "content": "Andrea l'a fabriqué spécialement."},
    ]
    follow_up_ids = [
        item["id"] for item in server._match_permanent_memory_sections("Pourquoi est-il particulier ?", scanner_history)
    ]
    assert "current_scanner" in follow_up_ids, follow_up_ids
    print(f"{len(EXPECTED)}/{len(EXPECTED)} questions mémoire ciblées OK")
    print(f"{len(UNRELATED)}/{len(UNRELATED)} questions hors sujet sans injection OK")
    print("1/1 question de suivi contextuelle OK")


if __name__ == "__main__":
    main()
