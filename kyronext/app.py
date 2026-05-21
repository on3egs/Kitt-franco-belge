"""Assemblage de l'application : QApplication, moteur QML et objets exposes.

Chaque objet logique (telechargement, lecteur, compteurs...) est cree ici puis
expose a QML sous forme de *singleton*. Un singleton est resolu des le
chargement des types QML, donc avant toute liaison : cela garantit que
l'interface trouve toujours ses objets, sans erreur de demarrage.
"""

from __future__ import annotations

import os
import subprocess
import sys

from PyQt5.QtCore import QObject, QTimer, QUrl, pyqtProperty, pyqtSlot
from PyQt5.QtGui import QGuiApplication
from PyQt5.QtQml import QQmlApplicationEngine, qmlRegisterSingletonType

from . import __app_name__, paths
from .config import Config
from .deps import DepsChecker
from .downloader import Downloader
from .history import History
from .metrics import SystemMetrics
from .player import Player
from .sounds import SoundFx



class Shell(QObject):
    """Petits services systeme exposes a QML (presse-papier, ouverture de fichiers)."""

    @pyqtProperty(str, constant=True)
    def phoenixSource(self) -> str:
        """URL de l'image phoenix de l'interface (chaine vide si absente)."""
        if paths.PHOENIX_ASSET.exists():
            return QUrl.fromLocalFile(str(paths.PHOENIX_ASSET)).toString()
        return ""

    @pyqtSlot(result=str)
    def clipboard(self) -> str:
        """Retourne le texte du presse-papier (pour le bouton COLLER)."""
        board = QGuiApplication.clipboard()
        return board.text() if board is not None else ""

    @pyqtSlot()
    def openMediaDir(self) -> None:
        self._open(str(paths.MEDIA_DIR))

    @pyqtSlot()
    def openLast(self) -> None:
        last = self._latest_media()
        if last is not None:
            self._open(last)

    @pyqtSlot(result=str)
    def lastMediaName(self) -> str:
        last = self._latest_media()
        return last.rsplit("/", 1)[-1] if last else ""

    def _latest_media(self) -> str | None:
        """Chemin du media le plus recent (hors fichiers .part)."""
        if not paths.MEDIA_DIR.exists():
            return None
        files = [
            p
            for p in paths.MEDIA_DIR.iterdir()
            if p.is_file()
            and p.suffix.lower() in paths.MEDIA_EXTENSIONS
            and not p.name.endswith(".part")
        ]
        if not files:
            return None
        return str(max(files, key=lambda p: p.stat().st_mtime))

    def _open(self, target: str) -> None:
        try:
            subprocess.Popen(["xdg-open", target])
        except OSError:
            pass


def _singleton_factory(instance: QObject):
    """Fabrique de singleton QML : retourne toujours l'instance fournie."""
    def factory(_engine=None, _script_engine=None) -> QObject:
        return instance
    return factory


def main() -> int:
    """Point d'entree de l'application."""
    paths.ensure_dirs()
    QGuiApplication.setApplicationName(__app_name__)
    QGuiApplication.setOrganizationName("Manix")
    app = QGuiApplication(sys.argv)

    # Objets logiques.
    history = History()
    config = Config()
    deps = DepsChecker()
    downloader = Downloader(history)
    player = Player(config)
    metrics = SystemMetrics()
    shell = Shell()
    sound_fx = SoundFx()

    # Exposition a QML : un singleton par objet, dans le module "Kyronext".
    singletons = {
        "Config": config,
        "History": history,
        "Deps": deps,
        "Downloader": downloader,
        "Player": player,
        "Metrics": metrics,
        "Shell": shell,
        "SoundFx": sound_fx,
    }
    for type_name, instance in singletons.items():
        qmlRegisterSingletonType(
            type(instance), "Kyronext", 1, 0, type_name,
            _singleton_factory(instance),
        )

    engine = QQmlApplicationEngine()
    engine.load(QUrl.fromLocalFile(str(paths.QML_DIR / "main.qml")))
    if not engine.rootObjects():
        print("Erreur : impossible de charger l'interface QML.", file=sys.stderr)
        return 1

    metrics.start()
    app.aboutToQuit.connect(player.shutdown)
    app.aboutToQuit.connect(downloader.cancel)
    app.aboutToQuit.connect(metrics.stop)

    # Mise a jour automatique de yt-dlp, peu apres l'affichage de la fenetre
    # (en tache de fond, journalisee dans l'interface).
    if config.autoUpdate:
        QTimer.singleShot(1200, deps.autoUpdate)

    # Mode test : quitte automatiquement (verification sans interface visible).
    if os.environ.get("KYRONEXT_SMOKETEST"):
        QTimer.singleShot(3000, app.quit)

    return app.exec_()
