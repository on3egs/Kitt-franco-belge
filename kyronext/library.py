"""Bibliotheque locale : indexation, recherche et tri des medias telecharges.

Sert de modele a la vue Bibliotheque du mode sobre. Scanne le dossier media/
au demarrage et a chaque fin de telechargement, puis filtre/trie en memoire.
"""

from __future__ import annotations

import getpass
import re
import shutil
import subprocess
import time
from pathlib import Path

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal, pyqtSlot

from . import paths

_YT_ID = re.compile(r"-[A-Za-z0-9_-]{11}(?=\.[^.]+$)")


def _label(path: Path) -> str:
    """Nom lisible : sans identifiant YouTube ni extension, underscores -> espaces."""
    name = _YT_ID.sub("", path.name)
    name = name.rsplit(".", 1)[0].replace("_", " ").strip()
    return name or path.name


def _fmt_size(num: float) -> str:
    for unit in ("o", "Ko", "Mo", "Go"):
        if num < 1024:
            return f"{num:.0f} {unit}" if unit == "o" else f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} To"


def _fmt_age(seconds: float) -> str:
    if seconds < 60:
        return "a l'instant"
    if seconds < 3600:
        return f"il y a {int(seconds // 60)} min"
    if seconds < 86400:
        return f"il y a {int(seconds // 3600)} h"
    days = int(seconds // 86400)
    if days < 30:
        return f"il y a {days} j"
    if days < 365:
        return f"il y a {days // 30} mois"
    return f"il y a {days // 365} an{'s' if days >= 730 else ''}"


class Library(QObject):
    """Liste filtrable et triable des medias de media/."""

    changed = pyqtSignal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._all: list[dict] = []
        self._view: list[dict] = []
        self._query = ""
        self._kind = "all"           # "all" | "audio" | "video"
        self._sort = "name"          # "name" | "recent" | "size"
        self._player = None
        self.rescan()

    @pyqtSlot()
    def rescan(self) -> None:
        """Reindexe entierement le dossier media/."""
        items: list[dict] = []
        if paths.MEDIA_DIR.exists():
            for p in paths.MEDIA_DIR.iterdir():
                if not p.is_file():
                    continue
                ext = p.suffix.lower()
                if ext in paths.AUDIO_EXTENSIONS:
                    kind = "audio"
                elif ext in paths.VIDEO_EXTENSIONS:
                    kind = "video"
                else:
                    continue
                try:
                    stat = p.stat()
                except OSError:
                    continue
                items.append({
                    "name": _label(p),
                    "kind": kind,
                    "ext": ext.lstrip("."),
                    "path": str(p),
                    "size": _fmt_size(stat.st_size),
                    "_size": stat.st_size,
                    "age": _fmt_age(time.time() - stat.st_mtime),
                    "_mtime": stat.st_mtime,
                })
        self._all = items
        self._refresh_view()

    @pyqtSlot(str)
    def setQuery(self, text: str) -> None:
        text = (text or "").strip().lower()
        if text != self._query:
            self._query = text
            self._refresh_view()

    @pyqtSlot(str)
    def setKind(self, kind: str) -> None:
        if kind in ("all", "audio", "video") and kind != self._kind:
            self._kind = kind
            self._refresh_view()

    @pyqtSlot(str)
    def setSort(self, field: str) -> None:
        if field in ("name", "recent", "size") and field != self._sort:
            self._sort = field
            self._refresh_view()

    def _refresh_view(self) -> None:
        view = self._all
        if self._kind != "all":
            view = [i for i in view if i["kind"] == self._kind]
        if self._query:
            q = self._query
            view = [i for i in view if q in i["name"].lower()]
        if self._sort == "name":
            view = sorted(view, key=lambda i: i["name"].lower())
        elif self._sort == "recent":
            view = sorted(view, key=lambda i: i["_mtime"], reverse=True)
        elif self._sort == "size":
            view = sorted(view, key=lambda i: i["_size"], reverse=True)
        self._view = view
        self.changed.emit()

    @pyqtProperty("QVariantList", notify=changed)
    def items(self) -> list[dict]:
        return [
            {"name": i["name"], "kind": i["kind"], "ext": i["ext"],
             "path": i["path"], "size": i["size"], "age": i["age"]}
            for i in self._view
        ]

    @pyqtProperty(int, notify=changed)
    def count(self) -> int:
        return len(self._view)

    @pyqtProperty(int, notify=changed)
    def totalCount(self) -> int:
        return len(self._all)

    @pyqtProperty(str, notify=changed)
    def query(self) -> str:
        return self._query

    @pyqtProperty(str, notify=changed)
    def kind(self) -> str:
        return self._kind

    @pyqtProperty(str, notify=changed)
    def sortField(self) -> str:
        return self._sort

    @pyqtSlot(int, result=str)
    def pathAt(self, index: int) -> str:
        if 0 <= index < len(self._view):
            return self._view[index]["path"]
        return ""

    def attach_player(self, player) -> None:
        """Branche le lecteur audio (appele depuis app.py)."""
        self._player = player

    @pyqtSlot(int)
    def activate(self, index: int) -> None:
        """Active l'item : lit l'audio dans le lecteur, ouvre la video externe."""
        if not (0 <= index < len(self._view)):
            return
        item = self._view[index]
        if item["kind"] == "audio":
            if self._player is None:
                return
            audio_paths = [i["path"] for i in self._view if i["kind"] == "audio"]
            try:
                start = audio_paths.index(item["path"])
            except ValueError:
                start = 0
            self._player.setQueue(audio_paths, start)
        else:
            self._open_externally(item["path"])

    @staticmethod
    def _open_externally(path: str) -> None:
        try:
            subprocess.Popen(["xdg-open", path])
        except OSError:
            pass

    # --- copie vers cle USB --------------------------------------------
    @pyqtSlot(result="QStringList")
    def usbMountpoints(self) -> list[str]:
        """Liste les cles USB montees sous /media/<user>/ ou /run/media/<user>/.

        Detecte au moment de l'appel (pas de cache) : permet a l'utilisateur de
        brancher la cle puis cliquer sans avoir a relancer.
        """
        user = getpass.getuser()
        bases = [Path("/media") / user, Path("/run/media") / user, Path("/media")]
        seen: set[str] = set()
        mounts: list[str] = []
        for base in bases:
            if not base.exists():
                continue
            try:
                base_dev = base.stat().st_dev
            except OSError:
                continue
            try:
                children = list(base.iterdir())
            except OSError:
                continue
            for p in children:
                if not p.is_dir():
                    continue
                key = str(p)
                if key in seen:
                    continue
                try:
                    if p.stat().st_dev != base_dev:
                        mounts.append(key)
                        seen.add(key)
                except OSError:
                    continue
        return mounts

    @pyqtSlot(int, str, result=str)
    def copyToUsb(self, index: int, mountpoint: str) -> str:
        """Copie le fichier vers cle/MP3/ ou cle/Video/. Retourne le chemin
        de destination ou une chaine vide en cas d'echec."""
        if not (0 <= index < len(self._view)):
            return ""
        item = self._view[index]
        src = Path(item["path"])
        if not src.exists():
            return ""
        root = Path(mountpoint)
        if not root.exists():
            return ""
        sub = "MP3" if item["kind"] == "audio" else "Video"
        target_dir = root / sub
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            dest = target_dir / src.name
            shutil.copy2(str(src), str(dest))
            return str(dest)
        except OSError:
            return ""

    @pyqtSlot(int, result=bool)
    def deleteAt(self, index: int) -> bool:
        """Supprime le fichier du disque ET de la vue. Renvoie True si OK."""
        if not (0 <= index < len(self._view)):
            return False
        item = self._view[index]
        path_str = item["path"]
        # Si on est en train de jouer ce fichier, on arrete proprement le lecteur.
        if self._player is not None:
            try:
                current = self._player._tracks[self._player._index]
                if str(current) == path_str:
                    self._player.stop()
            except (IndexError, AttributeError):
                pass
        try:
            Path(path_str).unlink()
        except OSError:
            return False
        self.rescan()
        # Synchronise aussi la playlist du Player pour qu'elle ne reference plus
        # le fichier supprime.
        if self._player is not None:
            self._player.scan()
        return True
