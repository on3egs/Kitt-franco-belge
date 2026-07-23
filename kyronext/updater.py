"""Mise a jour automatique — verifie GitHub Releases et telecharge la derniere version.

Usage dans QML : Updater.check() -> declenche checked(version) ou upToDate().
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from PyQt5.QtCore import QObject, pyqtSignal, pyqtSlot, QThread

from . import __version__

# GitHub repo pour les releases
GITHUB_OWNER = "on3egs"
GITHUB_REPO = "Kitt-franco-belge"
RELEASES_API = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"


class _DownloadThread(QThread):
    finished = pyqtSignal(bool, str)

    def __init__(self, url: str, dest: Path) -> None:
        super().__init__()
        self.url = url
        self.dest = dest

    def run(self) -> None:
        try:
            urllib.request.urlretrieve(self.url, self.dest)
            self.finished.emit(True, str(self.dest))
        except Exception as e:
            self.finished.emit(False, str(e))


class Updater(QObject):
    checked = pyqtSignal(str)       # nouvelle version disponible
    upToDate = pyqtSignal()         # deja a jour
    error = pyqtSignal(str)         # erreur reseau
    downloadProgress = pyqtSignal(int)  # 0-100
    downloadFinished = pyqtSignal(bool, str)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._latest: dict | None = None
        self._thread: _DownloadThread | None = None

    @pyqtSlot(result=str)
    def currentVersion(self) -> str:
        return __version__

    @pyqtSlot()
    def check(self) -> None:
        """Verifie s'il y a une nouvelle version sur GitHub Releases."""
        try:
            req = urllib.request.Request(
                RELEASES_API,
                headers={"Accept": "application/vnd.github.v3+json",
                         "User-Agent": f"Kyronext-Studio/{__version__}"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
            self._latest = data
            tag = data.get("tag_name", "").lstrip("v")
            if not tag:
                self.error.emit("Impossible de lire la version distante")
                return
            if self._is_newer(tag, __version__):
                self.checked.emit(tag)
            else:
                self.upToDate.emit()
        except Exception as e:
            self.error.emit(str(e))

    @pyqtSlot()
    def downloadAndInstall(self) -> None:
        """Telecharge le nouvel AppImage et le remplace."""
        if not self._latest:
            self.error.emit("Aucune version a telecharger")
            return

        asset = self._pick_asset()
        if not asset:
            self.error.emit("Aucun fichier compatible trouve dans la release")
            return

        url = asset["browser_download_url"]
        tmp = Path(tempfile.gettempdir()) / asset["name"]

        self._thread = _DownloadThread(url, tmp)
        self._thread.finished.connect(self._on_download_done)
        self._thread.start()

    def _on_download_done(self, ok: bool, path: str) -> None:
        if not ok:
            self.downloadFinished.emit(False, path)
            return

        # Remplacer l'executable actuel
        current = Path(sys.argv[0]).resolve()
        if current.suffix == ".py":
            # Mode dev — on ne peut pas auto-remplacer
            self.downloadFinished.emit(True, path)
            return

        backup = current.with_suffix(".backup")
        try:
            shutil.copy2(current, backup)
            shutil.copy2(path, current)
            os.chmod(current, 0o755)
            self.downloadFinished.emit(True, str(current))
        except Exception as e:
            self.downloadFinished.emit(False, str(e))

    def _pick_asset(self) -> dict | None:
        """Choisis l'asset AppImage x86_64 ou aarch64 selon l'archi."""
        assets = self._latest.get("assets", [])
        machine = os.uname().machine
        suffix = "aarch64" if "aarch" in machine or "arm" in machine else "x86_64"
        for a in assets:
            name = a.get("name", "").lower()
            if name.endswith(".appimage") and suffix in name:
                return a
        # Fallback — n'importe quel .AppImage
        for a in assets:
            if a.get("name", "").lower().endswith(".appimage"):
                return a
        return None

    @staticmethod
    def _is_newer(remote: str, local: str) -> bool:
        """Compare deux versions semver."""
        try:
            ra = [int(x) for x in remote.split(".")]
            la = [int(x) for x in local.split(".")]
            return ra > la
        except ValueError:
            return remote != local
