"""Historique local des URLs telechargees (state/history.json)."""

from __future__ import annotations

import json

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal, pyqtSlot

from . import paths

MAX_ITEMS = 20  # nombre d'URLs conservees


class History(QObject):
    """Liste ordonnee des dernieres URLs, la plus recente en premier."""

    changed = pyqtSignal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._items = self._load()

    def _load(self) -> list[str]:
        try:
            data = json.loads(paths.HISTORY_FILE.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        if isinstance(data, list):
            return [u for u in data if isinstance(u, str)][:MAX_ITEMS]
        return []

    def _save(self) -> None:
        try:
            paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
            paths.HISTORY_FILE.write_text(
                json.dumps(self._items[:MAX_ITEMS], indent=2), "utf-8"
            )
        except OSError:
            pass

    @pyqtProperty("QStringList", notify=changed)
    def items(self) -> list[str]:
        return self._items

    @pyqtSlot(str)
    def add(self, url: str) -> None:
        """Ajoute une URL en tete, sans doublon."""
        url = (url or "").strip()
        if not url:
            return
        self._items = [u for u in self._items if u != url]
        self._items.insert(0, url)
        self._items = self._items[:MAX_ITEMS]
        self._save()
        self.changed.emit()

    @pyqtSlot()
    def clear(self) -> None:
        self._items = []
        self._save()
        self.changed.emit()
