#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gestionnaire Universel de Prononciation pour Kyronex.

Ce composant applique un dictionnaire phonétique externe au texte juste avant
l'envoi au moteur TTS (Piper). Le texte affiché, mémorisé ou indexé n'est
jamais modifié : seule une copie temporaire destinée à la synthèse vocale est
transformée.

Architecture :
- Dictionnaires JSON externes dans <base>/dictionnaires/.
- Chaque dictionnaire a une priorité ; les règles sont appliquées dans l'ordre
  décroissant des priorités.
- Les regex sont compilées une seule fois au démarrage avec des limites de mot
  explicites lorsque la règle le demande.
- Rechargement automatique si le fichier source est modifié (mtime).
"""

from __future__ import annotations

import json
import os
import re
import threading
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_DICT_DIR = Path(__file__).resolve().parent / "dictionaries"

# eSpeak-NG/Piper accept the ASCII apostrophe and U+2019 in French, but
# U+02BC and other look-alikes can be interpreted as ordinary characters.
# Normalize ALL apostrophe-like characters to ASCII apostrophe for consistency.
# This ensures French elisions (l', d', j', qu', etc.) are preserved and
# correctly processed by the phonemizer.
_APOSTROPHES = str.maketrans({
    "\u2018": "'",  # LEFT SINGLE QUOTATION MARK
    "\u2019": "'",  # RIGHT SINGLE QUOTATION MARK
    "\u02bc": "'",  # MODIFIER LETTER APOSTROPHE
    "\uff07": "'",  # FULLWIDTH APOSTROPHE
    "\u0060": "'",  # GRAVE ACCENT (sometimes used as apostrophe)
    "\u00b4": "'",  # ACUTE ACCENT (sometimes used as apostrophe)
})


def normalize_tts_text(text: str) -> str:
    """Canonicalise le texte UTF-8 avant phonémisation Piper/eSpeak.

    Toutes les variantes Unicode d'apostrophe sont normalisées vers l'apostrophe
    ASCII ('). Cela garantit que les élisions françaises (l', d', j', qu', etc.)
    restent intactes et sont correctement interprétées par eSpeak/Piper.

    Une apostrophe reste un caractère d'élision et ne devient jamais un espace,
    donc elle ne peut pas créer une frontière de segment.
    """
    text = unicodedata.normalize("NFC", str(text or ""))
    text = text.translate(_APOSTROPHES)
    text = text.replace("\u00a0", " ").replace("\u202f", " ")
    text = re.sub(r"[\u200b\u200c\u200d\u2060\ufeff]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def normalize_french_tts_text(text: str) -> str:
    """Normalize French elision punctuation for the TTS copy only.

    This function ensures that all French elisions (l', d', j', qu', c', n', etc.)
    are preserved with ASCII apostrophes, which eSpeak-NG/Piper handles correctly
    for French phonemization.
    """
    return normalize_tts_text(text)


@dataclass
class PronunciationRule:
    """Une règle de remplacement phonétique."""
    category: str
    priority: int
    pattern: str
    replacement: str
    case_sensitive: bool = False
    use_word_boundaries: bool = True
    _compiled: re.Pattern | None = field(default=None, repr=False)

    def compile(self) -> re.Pattern:
        if self._compiled is None:
            flags = 0 if self.case_sensitive else re.IGNORECASE
            pattern = self.pattern
            if self.use_word_boundaries:
                # Ajoute \b si ce n'est déjà encadré explicitement
                if not pattern.startswith(r"\b"):
                    pattern = r"\b" + pattern
                if not pattern.endswith(r"\b"):
                    pattern = pattern + r"\b"
            self._compiled = re.compile(pattern, flags)
        return self._compiled


class PronunciationManager:
    """
    Charge et applique les dictionnaires de prononciation Kyronex.

    Usage minimal :
        pm = PronunciationManager()
        tts_text = pm.prepare_text(display_text)
    """

    def __init__(
        self,
        dict_dir: str | Path | None = None,
        auto_reload: bool = True,
    ):
        self.dict_dir = Path(dict_dir) if dict_dir else DEFAULT_DICT_DIR
        self.auto_reload = auto_reload
        self._lock = threading.RLock()
        self._rules: list[PronunciationRule] = []
        self._mtimes: dict[Path, float] = {}
        self._last_load: float = 0.0
        self.reload()

    # ------------------------------------------------------------------
    # Chargement
    # ------------------------------------------------------------------
    def _load_dictionary(self, path: Path) -> list[PronunciationRule]:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError(f"Le dictionnaire {path} doit être un objet JSON")

        category = data.get("category", path.stem)
        priority = int(data.get("priority", 5))
        entries = data.get("entries", [])
        if not isinstance(entries, list):
            raise ValueError(f"'{path}': 'entries' doit être une liste")

        rules: list[PronunciationRule] = []
        for idx, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            try:
                # Vérification basique du pattern
                re.compile(entry["pattern"])
            except re.error as exc:
                raise ValueError(
                    f"{path} entrée {idx}: pattern invalide {entry.get('pattern')!r}: {exc}"
                ) from exc

            rules.append(
                PronunciationRule(
                    category=category,
                    priority=priority,
                    pattern=entry["pattern"],
                    replacement=entry.get("replacement", ""),
                    case_sensitive=entry.get("case_sensitive", False),
                    use_word_boundaries=entry.get("use_word_boundaries", True),
                )
            )
        return rules

    def reload(self) -> None:
        """Recharge tous les dictionnaires JSON du répertoire."""
        with self._lock:
            rules: list[PronunciationRule] = []
            mtimes: dict[Path, float] = {}

            if self.dict_dir.is_dir():
                for path in sorted(self.dict_dir.glob("*.json")):
                    try:
                        mtime = path.stat().st_mtime
                        mtimes[path] = mtime
                        rules.extend(self._load_dictionary(path))
                    except Exception as exc:
                        print(
                            f"[PRONUNCIATION WARNING] Impossible de charger {path}: {exc}",
                            flush=True,
                        )

            # Tri : priorité décroissante, puis ordre alphabétique du fichier
            rules.sort(key=lambda r: (-r.priority, r.category, r.pattern))

            self._rules = rules
            self._mtimes = mtimes
            self._last_load = time_now()

    def _needs_reload(self) -> bool:
        if not self.auto_reload:
            return False
        if not self.dict_dir.is_dir():
            return False
        current = {p: p.stat().st_mtime for p in self.dict_dir.glob("*.json")}
        return current != self._mtimes

    # ------------------------------------------------------------------
    # Application
    # ------------------------------------------------------------------
    def prepare_text(self, text: str) -> str:
        """
        Retourne une copie phonétisée du texte destinée au TTS.

        Le texte d'origine n'est jamais modifié.
        """
        if self.auto_reload and self._needs_reload():
            self.reload()

        with self._lock:
            # Nettoyage commun à toutes les voix. Le texte original reste
            # intact : seule cette copie temporaire est destinée au TTS.
            result = re.sub(r"```[\s\S]*?```|~~~[\s\S]*?~~~", " ", text)
            result = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", result)
            result = re.sub(r"(?i)(?:https?://|www\.)\S+", " ", result)
            result = re.sub(r"`([^`]+)`", r"\1", result)
            result = re.sub(r"^#{1,6}\s+", "", result, flags=re.MULTILINE)
            result = re.sub(r"^[*+\-]\s+", "", result, flags=re.MULTILINE)
            result = re.sub(r"^\d+[.)]\s+", "", result, flags=re.MULTILINE)
            result = re.sub(r"[*_~]", "", result)
            result = re.sub(r"\s*[—–]\s*", ", ", result)
            result = re.sub(r"(-?\d+(?:[.,]\d+)?)\s*°\s*[Cc]", r"\1 degrés", result)
            result = re.sub(r"(\d+(?:[.,]\d+)?)\s*km/h\b", r"\1 kilomètres par heure", result, flags=re.I)
            result = re.sub(r"(\d+(?:[.,]\d+)?)\s*m/s\b", r"\1 mètres par seconde", result, flags=re.I)
            result = re.sub(r"(\d+(?:[.,]\d+)?)\s*%", r"\1 pour cent", result)
            result = re.sub(r"(?<=\d),(?=\d)", " virgule ", result)
            result = re.sub(r"\b(\d{1,2}):([0-5]\d)\b", r"\1 heures \2", result)
            result = re.sub(r"(?<=\d)\s*\*\s*(?=\d)", " fois ", result)
            # La ponctuation structure la phrase sans être lue comme un nom de signe.
            result = re.sub(r"\s*:\s*", ", ", result)
            result = re.sub(r"\s*;\s*", ", ", result)
            result = re.sub(r"[#@|\\]+", " ", result)
            result = re.sub(r"\betc\.?(?=\s|$)", "et cetera", result, flags=re.I)
            result = re.sub(r"\bN\.B\.?(?=\s|$)", "nota bene", result, flags=re.I)
            result = re.sub(r"\.{2,}", ".", result)
            result = re.sub(r"!{2,}", "!", result)
            result = re.sub(r"\?{2,}", "?", result)
            result = re.sub(r"[ \t]+", " ", result).strip()
            result = normalize_french_tts_text(result)
            for rule in self._rules:
                result = rule.compile().sub(rule.replacement, result)
            return normalize_french_tts_text(result)

    def list_rules(self) -> list[dict[str, Any]]:
        """Retourne les règles actuellement chargées (à des fins de debug)."""
        with self._lock:
            return [
                {
                    "category": r.category,
                    "priority": r.priority,
                    "pattern": r.pattern,
                    "replacement": r.replacement,
                    "case_sensitive": r.case_sensitive,
                    "use_word_boundaries": r.use_word_boundaries,
                }
                for r in self._rules
            ]


def time_now() -> float:
    import time
    return time.monotonic()


# Instance globale partagée par le serveur.
_manager: PronunciationManager | None = None


def get_manager(dict_dir: str | Path | None = None) -> PronunciationManager:
    global _manager
    if _manager is None:
        _manager = PronunciationManager(dict_dir=dict_dir)
    return _manager


def prepare_text_for_tts(text: str, dict_dir: str | Path | None = None) -> str:
    """Fonction utilitaire directe."""
    return get_manager(dict_dir=dict_dir).prepare_text(text)


if __name__ == "__main__":
    # Test rapide autonome
    import tempfile
    tmp = Path(tempfile.mkdtemp())
    (tmp / "users.json").write_text(
        json.dumps(
            {
                "category": "users",
                "priority": 3,
                "entries": [
                    {"pattern": "Frank", "replacement": "Franque"},
                    {"pattern": "Dadoo", "replacement": "Da-dou"},
                    {"pattern": "Dylan", "replacement": "Dilane"},
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    pm = PronunciationManager(dict_dir=tmp)
    samples = [
        "Bonjour Frank.",
        "Dadoo et Dylan sont présents.",
        "Franklin n'est pas Frank.",
    ]
    for s in samples:
        print(f"IN  : {s}")
        print(f"OUT : {pm.prepare_text(s)}")
        print()
