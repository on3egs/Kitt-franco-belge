"""Verification des dependances externes et aide a leur installation.

Kironext Studio s'appuie sur trois outils en ligne de commande :
  - yt-dlp  : telechargement YouTube (installable sans droits admin via pip) ;
  - ffmpeg  : conversion audio/video et lecture (paquet systeme) ;
  - node    : runtime JavaScript ameliorant la compatibilite YouTube (optionnel).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import threading

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal, pyqtSlot

# (commande, indispensable au fonctionnement)
TOOLS = [
    ("yt-dlp", True),
    ("ffmpeg", True),
    ("ffprobe", True),
    ("node", False),
]


class DepsChecker(QObject):
    """Detecte les outils manquants et peut installer yt-dlp automatiquement."""

    changed = pyqtSignal()
    logLine = pyqtSignal(str)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._missing: list[str] = []
        self.refresh()

    @pyqtSlot()
    def refresh(self) -> None:
        """Recalcule la liste des commandes absentes du PATH."""
        self._missing = [name for name, _ in TOOLS if shutil.which(name) is None]
        self.changed.emit()

    @pyqtProperty("QStringList", notify=changed)
    def missing(self) -> list[str]:
        return self._missing

    @pyqtProperty(bool, notify=changed)
    def ready(self) -> bool:
        """Vrai si aucune dependance *indispensable* ne manque."""
        critical = {name for name, required in TOOLS if required}
        return not (critical & set(self._missing))

    @pyqtProperty(str, notify=changed)
    def hint(self) -> str:
        """Message d'aide a afficher quand des dependances manquent."""
        if not self._missing:
            return "Toutes les dependances sont presentes."
        parts: list[str] = []
        if "yt-dlp" in self._missing:
            parts.append("yt-dlp : utilisez le bouton INSTALLER (pip, sans admin).")
        apt_pkgs: list[str] = []
        if {"ffmpeg", "ffprobe"} & set(self._missing):
            apt_pkgs.append("ffmpeg")
        if "node" in self._missing:
            apt_pkgs.append("nodejs")
        if apt_pkgs:
            parts.append("Terminal : sudo apt install -y " + " ".join(apt_pkgs))
        return "   |   ".join(parts)

    @pyqtSlot()
    def installYtDlp(self) -> None:
        """Lance l'installation/mise a jour de yt-dlp via pip, en tache de fond."""
        threading.Thread(target=self._pip_install, daemon=True).start()

    @pyqtSlot()
    def autoUpdate(self) -> None:
        """Met a jour yt-dlp silencieusement au demarrage (si deja installe).

        yt-dlp doit suivre les changements frequents de YouTube : une mise a
        jour automatique garde les telechargements fiables. Sans droits admin
        (pip --user), donc sans risque pour le systeme.
        """
        if shutil.which("yt-dlp") is None:
            return  # rien a mettre a jour : l'utilisateur installera via le bouton
        threading.Thread(target=self._auto_update, daemon=True).start()

    def _auto_update(self) -> None:
        self.logLine.emit("Verification de la mise a jour de yt-dlp...")
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--user",
                 "--upgrade", "--quiet", "yt-dlp"],
                capture_output=True, text=True, timeout=180,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            self.logLine.emit(f"Mise a jour yt-dlp ignoree : {exc}")
            return
        if proc.returncode == 0:
            self.logLine.emit("yt-dlp est a jour.")
        else:
            self.logLine.emit("Mise a jour yt-dlp impossible (hors ligne ?).")
        self.refresh()

    def _pip_install(self) -> None:
        self.logLine.emit("Installation de yt-dlp via pip (--user)...")
        try:
            proc = subprocess.Popen(
                [sys.executable, "-m", "pip", "install", "--user", "--upgrade", "yt-dlp"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self.logLine.emit(f"Echec du lancement de pip : {exc}")
            return
        assert proc.stdout is not None
        for line in proc.stdout:
            self.logLine.emit(line.rstrip())
        code = proc.wait()
        if code == 0:
            self.logLine.emit("yt-dlp est installe.")
        else:
            self.logLine.emit(f"pip a echoue (code {code}).")
        self.refresh()
