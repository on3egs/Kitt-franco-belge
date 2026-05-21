"""Compteurs systeme temps reel pour les quatre jauges du tableau de bord.

Sources de donnees, choisies pour leur robustesse sur Jetson :
  - tegrastats : charge GPU, temperature, puissance electrique, RAM ;
  - psutil     : debit reseau (descendant / montant) et charge CPU.

Si tegrastats est absent (machine non Jetson), le module bascule sur psutil
seul : les jauges GPU et puissance restent simplement a zero.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import threading
import time

from PyQt5.QtCore import QObject, pyqtProperty, pyqtSignal

try:
    import psutil
except ImportError:  # pragma: no cover - psutil est attendu mais optionnel
    psutil = None

_RE_GPU = re.compile(r"GR3D_FREQ\s+(\d+)%")
_RE_TEMP = re.compile(r"(?:tj|GPU)@([\d.]+)C")
_RE_RAM = re.compile(r"RAM\s+(\d+)/(\d+)MB")
_RE_POWER = re.compile(r"\b[A-Z][A-Z0-9_]*\s+(\d+)mW/\d+mW")


class SystemMetrics(QObject):
    """Mesure GPU / puissance / reseau dans un thread et publie vers QML."""

    changed = pyqtSignal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._gpu = 0.0        # %
        self._power = 0.0      # watts
        self._temp = 0.0       # degres Celsius
        self._ram = 0.0        # %
        self._cpu = 0.0        # %
        self._net_down = 0.0   # Mo/s
        self._net_up = 0.0     # Mo/s
        self._stop = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Demarre la boucle de mesure (une seule fois)."""
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop = True

    # --- proprietes exposees a QML --------------------------------------
    @pyqtProperty(float, notify=changed)
    def gpu(self) -> float:
        return self._gpu

    @pyqtProperty(float, notify=changed)
    def power(self) -> float:
        return self._power

    @pyqtProperty(float, notify=changed)
    def temp(self) -> float:
        return self._temp

    @pyqtProperty(float, notify=changed)
    def ram(self) -> float:
        return self._ram

    @pyqtProperty(float, notify=changed)
    def cpu(self) -> float:
        return self._cpu

    @pyqtProperty(float, notify=changed)
    def netDown(self) -> float:
        return self._net_down

    @pyqtProperty(float, notify=changed)
    def netUp(self) -> float:
        return self._net_up

    # --- boucle de mesure ----------------------------------------------
    def _net_counters(self) -> tuple[int, int]:
        if psutil is None:
            return (0, 0)
        io = psutil.net_io_counters()
        return (io.bytes_recv, io.bytes_sent)

    def _update_net(self, last: tuple[int, int], last_time: float
                    ) -> tuple[tuple[int, int], float]:
        """Calcule le debit reseau a partir de l'ecart de compteurs."""
        now = time.time()
        cur = self._net_counters()
        delta = now - last_time
        if delta > 0:
            self._net_down = max(0.0, (cur[0] - last[0]) / delta / 1e6)
            self._net_up = max(0.0, (cur[1] - last[1]) / delta / 1e6)
        return cur, now

    def _parse_tegrastats(self, line: str) -> None:
        """Extrait GPU, temperature, RAM et puissance d'une ligne tegrastats."""
        gpu = _RE_GPU.search(line)
        if gpu:
            self._gpu = float(gpu.group(1))
        temp = _RE_TEMP.search(line)
        if temp:
            self._temp = float(temp.group(1))
        ram = _RE_RAM.search(line)
        if ram:
            used, total = float(ram.group(1)), float(ram.group(2))
            if total > 0:
                self._ram = used / total * 100.0
        watts = sum(int(mw) for mw in _RE_POWER.findall(line)) / 1000.0
        if watts > 0:
            self._power = watts

    def _loop(self) -> None:
        tegrastats = shutil.which("tegrastats")
        proc: subprocess.Popen | None = None
        if tegrastats:
            try:
                proc = subprocess.Popen(
                    [tegrastats, "--interval", "1000"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                )
            except OSError:
                proc = None

        last_net = self._net_counters()
        last_time = time.time()

        if proc is not None and proc.stdout is not None:
            # Cadence dictee par tegrastats (une ligne par seconde).
            for line in proc.stdout:
                if self._stop:
                    break
                self._parse_tegrastats(line)
                last_net, last_time = self._update_net(last_net, last_time)
                if psutil is not None:
                    self._cpu = float(psutil.cpu_percent())
                self.changed.emit()
            try:
                proc.terminate()
            except OSError:
                pass
        else:
            # Repli sans tegrastats : psutil uniquement, cadence 1 s.
            while not self._stop:
                time.sleep(1.0)
                last_net, last_time = self._update_net(last_net, last_time)
                if psutil is not None:
                    self._cpu = float(psutil.cpu_percent())
                    self._ram = float(psutil.virtual_memory().percent)
                self.changed.emit()
