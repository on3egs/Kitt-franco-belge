#!/usr/bin/env python3
"""Régression des élisions : le texte livré à Piper ne doit jamais les couper."""

import ast
import html
import re
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

from pronunciation_manager import normalize_french_tts_text, prepare_text_for_tts


def load_cleaner():
    tree = ast.parse((APP_DIR / "kitt_server.py").read_text(encoding="utf-8"))
    function = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_clean_tts_text"
    )
    module = ast.Module(body=[function], type_ignores=[])
    namespace = {
        "re": re,
        "html": html,
        "normalize_french_tts_text": normalize_french_tts_text,
        "prepare_text_for_tts": prepare_text_for_tts,
    }
    exec(compile(module, "kitt_server.py", "exec"), namespace)
    return namespace["_clean_tts_text"]


def assert_joined(clean, source, expected=None):
    actual = clean(source)
    if expected is not None:
        assert actual == expected, (source, actual, expected)
    # Aucun caractère d'apostrophe exotique ne doit pouvoir atteindre Piper.
    assert all(ch not in actual for ch in "’‘ʼ＇`´"), (source, actual)
    # Le test cible la régression : rien ne doit être coupé par un espace.
    assert not re.search(r"(?iu)(?:d|l|j|c|n|qu|quelqu|jusqu|aujourd)\s+", actual), (source, actual)
    return actual


def main():
    clean = load_cleaner()
    variants = "'’‘ʼ＇`´"
    stems = (
        ("d", "accord", "d'accord"),
        ("d", "un", "d'un"),
        ("d", "une", "d'une"),
        ("l", "homme", "lomme"),
        ("j", "ai", "jé"),
        ("c", "est", "cé"),
        ("qu", "il", "kil"),
        ("quelqu", "un", "quelqu'un"),
        ("jusqu", "à", "jusqu'à"),
        ("d", "aujourd'hui", "d'aujourd'hui"),
        ("d", "ailleurs", "d'ailleurs"),
        ("n", "est-ce pas", "né-ce pas"),
        ("l", "aise", "l'aise"),
    )
    for left, right, expected in stems:
        for apostrophe in variants:
            assert_joined(clean, left + apostrophe + right, expected)
    # Les unités restent prises en charge, mais jamais à la place d'une
    # élision : la règle « l -> litres » ne doit plus exister.
    assert clean("Le moteur fait 2,8 L.") == "Le moteur fait 2 virgule 8 litres."
    assert clean("Ajoute 1 l d'eau.") == "Ajoute 1 litre d'eau."
    print("OK: 77 variantes d'élisions normalisées sans pause ajoutée")


if __name__ == "__main__":
    main()
