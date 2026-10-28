"""Bounded, atomic storage for public room history and opt-in mission notes."""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Any


class ChatMemory:
    def __init__(self, root: Path):
        self.root = root
        self.path = root / "missions.json"
        self.profiles: dict[str, dict[str, Any]] = {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                self.profiles = {key: self.clean(value) for key, value in raw.items() if isinstance(value, dict)}
        except (OSError, ValueError):
            pass

    @staticmethod
    def clean(value: dict[str, Any]) -> dict[str, Any]:
        return {
            "notes": str(value.get("notes", ""))[:2000],
            "enabled": value.get("enabled") is True,
            "frequency": value.get("frequency") if value.get("frequency") in ("quiet", "balanced", "lively") else "balanced",
            "voice": value.get("voice") is True,
        }

    def get(self, owner: str) -> dict[str, Any]:
        return dict(self.profiles.get(owner, self.clean({})))

    def write(self, owner: str, value: dict[str, Any] | None) -> dict[str, Any]:
        updated = dict(self.profiles)
        if value is None:
            updated.pop(owner, None)
        else:
            updated[owner] = self.clean(value)
        self._atomic(self.path, updated)
        self.profiles = updated
        return self.get(owner)

    def _atomic(self, path: Path, value: Any) -> None:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_suffix(".tmp")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)

    def history(self, room: str) -> list[dict[str, Any]]:
        # Room identifiers are validated by the calling router.
        if not room.replace("_", "").isalnum():
            return []
        try:
            data = json.loads((self.root / f"history-{room}.json").read_text(encoding="utf-8"))
            cutoff = (time.time() - 90 * 86400) * 1000
            return [line for line in data if isinstance(line, dict) and isinstance(line.get("timestamp"), (int, float)) and line["timestamp"] >= cutoff][-500:]
        except (OSError, ValueError, TypeError):
            return []

    def save_history(self, room: str, lines: list[dict[str, Any]]) -> None:
        if not room.replace("_", "").isalnum():
            raise ValueError("Invalid room")
        cutoff = (time.time() - 90 * 86400) * 1000
        self._atomic(self.root / f"history-{room}.json", [line for line in lines if line.get("timestamp", 0) >= cutoff][-500:])

    def recall(self, room: str, query: str, exclude_ids: set[str] | None = None) -> list[dict[str, Any]]:
        """Retrieve older relevant human statements, without treating them as facts."""
        stopwords = {
            "avec", "dans", "pour", "mais", "alors", "comment", "pourquoi", "vous", "nous",
            "cette", "cela", "quoi", "kitt", "karr", "manix", "bonjour", "salut", "suis",
            "etait", "avais", "avait", "avoir", "fait", "faire", "veux", "bien", "plus",
        }

        def terms(text: str) -> set[str]:
            plain = unicodedata.normalize("NFKD", text.casefold())
            plain = "".join(char for char in plain if not unicodedata.combining(char))
            return {word for word in re.findall(r"[a-z0-9]{4,}", plain) if word not in stopwords}

        needles = terms(query)
        if not needles:
            return []
        ranked = []
        for line in self.history(room):
            if line.get("id") in (exclude_ids or set()) or line.get("kind") == "system" or line.get("name") in ("KITT", "KARR"):
                continue
            overlap = needles & terms(str(line.get("text", "")))
            if overlap:
                ranked.append((len(overlap), line.get("timestamp", 0), line))
        best = sorted(ranked, key=lambda item: (item[0], item[1]), reverse=True)[:6]
        return [item[2] for item in sorted(best, key=lambda item: item[1])]
