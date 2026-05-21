"""Telechargement de contenus media via yt-dlp.

Toute la logique reseau tourne dans un thread dedie : l'interface ne se fige
jamais. La progression et les lignes de journal remontent vers QML par des
signaux Qt (connexions automatiquement securisees entre threads).
"""

from __future__ import annotations

import re
import shutil
import subprocess
import threading

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal, pyqtSlot

from . import paths

# Expressions reconnues dans la sortie de yt-dlp.
_PERCENT = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")
_SIZE = re.compile(r"\bof\s+~?\s*(\S+)")
_SPEED = re.compile(r"\bat\s+(\S+/s)")
_ETA = re.compile(r"\bETA\s+(\S+)")


class Downloader(QObject):
    """Pilote un processus yt-dlp et publie son etat vers l'interface."""

    busyChanged = pyqtSignal()
    statsChanged = pyqtSignal()
    statusChanged = pyqtSignal()
    logLine = pyqtSignal(str)
    finished = pyqtSignal(bool, str)  # (succes, message)

    def __init__(self, history: QObject | None = None,
                 parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._history = history
        self._proc: subprocess.Popen | None = None
        self._busy = False
        self._percent = 0.0
        self._speed = "0 B/s"
        self._eta = "--:--"
        self._size = "-"
        self._status = "SYSTEM READY"

    # --- proprietes exposees a QML --------------------------------------
    @pyqtProperty(bool, notify=busyChanged)
    def busy(self) -> bool:
        return self._busy

    @pyqtProperty(float, notify=statsChanged)
    def percent(self) -> float:
        return self._percent

    @pyqtProperty(str, notify=statsChanged)
    def speed(self) -> str:
        return self._speed

    @pyqtProperty(str, notify=statsChanged)
    def eta(self) -> str:
        return self._eta

    @pyqtProperty(str, notify=statsChanged)
    def size(self) -> str:
        return self._size

    @pyqtProperty(str, notify=statusChanged)
    def status(self) -> str:
        return self._status

    def _set_status(self, text: str) -> None:
        if text != self._status:
            self._status = text
            self.statusChanged.emit()

    # --- actions --------------------------------------------------------
    @pyqtSlot(str, str, bool)
    def start(self, url: str, mode: str, playlist: bool) -> None:
        """Demarre un telechargement (ignore si une tache est deja en cours)."""
        url = (url or "").strip()
        self.logLine.emit(f"--- KYRONEXT TRANSFER INIT (mode={mode}, playlist={playlist}) ---")
        if self._busy or not url:
            return
        missing = [c for c in ("yt-dlp", "ffmpeg") if shutil.which(c) is None]
        if missing:
            self.finished.emit(False, "Dependance manquante : " + ", ".join(missing))
            return

        self._busy = True
        self._percent = 0.0
        self._speed = "STARTING"
        self._eta = "--:--"
        self._size = "-"
        self.busyChanged.emit()
        self.statsChanged.emit()
        self._set_status("TRANSFER ONLINE")
        if self._history is not None:
            self._history.add(url)
        threading.Thread(
            target=self._run, args=(url, mode, playlist), daemon=True
        ).start()

    @pyqtSlot()
    def cancel(self) -> None:
        """Interrompt proprement le telechargement en cours."""
        proc = self._proc
        if proc is not None and proc.poll() is None:
            self._set_status("ABORTING TRANSFER")
            try:
                proc.terminate()
            except OSError:
                pass

    # --- moteur interne -------------------------------------------------
    def _build_cmd(self, url: str, mode: str, playlist: bool) -> list[str]:
        """Construit la ligne de commande yt-dlp, robuste face aux erreurs reseau."""
        yt = shutil.which("yt-dlp") or "yt-dlp"
        cmd = [
            yt,
            "--ignore-config",               # evite les interferences exterieures
            "--ignore-errors",               # continue malgre les videos bloquees
            "--restrict-filenames",          # noms de fichiers compatibles CLI
            "--paths", str(paths.MEDIA_DIR),
            "--output", "%(title).120s-%(id)s.%(ext)s",
            "--newline",                     # une ligne de progression par etape
            "--no-color",                    # pas de codes couleur dans le journal
            "--continue",                    # reprend les telechargements partiels
            "--retries", "50",
            "--fragment-retries", "50",
            "--extractor-retries", "10",
            "--retry-sleep", "http:exp=1:30",
            "--retry-sleep", "fragment:exp=1:30",
            "--socket-timeout", "30",
        ]
        
        if playlist:
            cmd.append("--yes-playlist")
            cmd.append("--playlist-items")
            cmd.append("1-")
        else:
            cmd.append("--no-playlist")

        cmd.append("--no-warnings")

        # node ameliore la compatibilite mais reste optionnel.
        node = shutil.which("node")
        if node:
            cmd += ["--js-runtimes", f"node:{node}",
                    "--remote-components", "ejs:github"]

        if mode == "mp3":
            cmd += ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"]
        else:
            cmd += ["--format", "bv*+ba/b", "--merge-output-format", "mp4"]

        cmd.append(url)
        return cmd

    def _run(self, url: str, mode: str, playlist: bool) -> None:
        """Execute yt-dlp et relaie sa sortie (thread dedie)."""
        cmd = self._build_cmd(url, mode, playlist)
        self.logLine.emit(f"DEBUG: cmd = {' '.join(cmd)}")
        try:
            self._proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self._finish(False, f"Lancement impossible : {exc}")
            return

        assert self._proc.stdout is not None
        for line in self._proc.stdout:
            line = line.rstrip("\n")
            if line:
                self.logLine.emit(line)
                self._parse(line)
        code = self._proc.wait()
        self._proc = None
        if code == 0:
            self._finish(True, "Telechargement termine.")
        else:
            self._finish(False, f"yt-dlp a termine avec le code {code}.")

    def _parse(self, line: str) -> None:
        """Met a jour la progression a partir d'une ligne de yt-dlp."""
        match = _PERCENT.search(line)
        if not match:
            if "[Merger]" in line:
                self._set_status("MERGING VIDEO + AUDIO")
            elif "[ExtractAudio]" in line:
                self._set_status("ENCODING MP3")
            elif "Downloading item" in line:
                self._set_status("PLAYLIST EN COURS")
            return

        self._percent = float(match.group(1))
        speed = _SPEED.search(line)
        eta = _ETA.search(line)
        size = _SIZE.search(line)
        if speed:
            self._speed = speed.group(1)
        if eta:
            self._eta = eta.group(1)
        if size:
            self._size = size.group(1)
        self.statsChanged.emit()
        if self._status not in ("MERGING VIDEO + AUDIO", "ENCODING MP3"):
            self._set_status("TRANSFER ONLINE")

    def _finish(self, ok: bool, message: str) -> None:
        """Cloture le telechargement et notifie l'interface."""
        self._busy = False
        if ok:
            self._percent = 100.0
            self._speed = "COMPLETE"
            self._eta = "00:00"
        self.busyChanged.emit()
        self.statsChanged.emit()
        self._set_status("TRANSFER COMPLETE" if ok else "TRANSFER ERROR")
        self.finished.emit(ok, message)
