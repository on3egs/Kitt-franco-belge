"""Moniteur GPU Jetson Orin — lecture sysfs + tegrastats."""
import threading
import time
import subprocess
import re
from pathlib import Path


class GpuMonitor:
    def __init__(self, interval: float = 1.0):
        self.interval = interval
        self._lock = threading.Lock()
        self._data = {
            "gpu_pct":    0.0,
            "gpu_freq_mhz": 0,
            "gpu_freq_max": 0,
            "emc_freq_mhz": 0,
            "vdd_cpu_w":  0.0,
            "vdd_gpu_w":  0.0,
            "vdd_soc_w":  0.0,
            "power_mode": "UNKNOWN",
            "nvpmodel":   "UNKNOWN",
        }
        self._thread = None
        self._running = False

    # ── API publique ──────────────────────────────────────────────────────

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="gpu-monitor")
        self._thread.start()

    def stop(self):
        self._running = False

    def get(self) -> dict:
        with self._lock:
            return dict(self._data)

    # ── Boucle de collecte ────────────────────────────────────────────────

    def _loop(self):
        while self._running:
            try:
                self._collect()
            except Exception:
                pass
            time.sleep(self.interval)

    def _collect(self):
        data = {}
        data.update(self._read_gpu_load())
        data.update(self._read_power())
        data.update(self._read_nvpmodel())
        with self._lock:
            self._data.update(data)

    # ── Charge GPU (sysfs Orin) ───────────────────────────────────────────

    # Chemins sysfs possibles sur Orin Nano
    _GPU_LOAD_PATHS = [
        "/sys/devices/17000000.ga10b/load",
        "/sys/devices/gpu.0/load",
        "/sys/class/devfreq/17000000.ga10b/cur_freq",
    ]

    _GPU_FREQ_PATHS = [
        "/sys/class/devfreq/17000000.ga10b/cur_freq",
        "/sys/class/devfreq/17000000.gv11b/cur_freq",
        "/sys/devices/17000000.ga10b/devfreq/17000000.ga10b/cur_freq",
    ]

    _GPU_MAX_PATHS = [
        "/sys/class/devfreq/17000000.ga10b/max_freq",
        "/sys/class/devfreq/17000000.gv11b/max_freq",
    ]

    def _read_sysfs(self, paths: list) -> int | None:
        for p in paths:
            try:
                return int(Path(p).read_text().strip())
            except Exception:
                continue
        return None

    def _read_gpu_load(self) -> dict:
        result = {"gpu_pct": 0.0, "gpu_freq_mhz": 0, "gpu_freq_max": 0}

        # Charge GPU (0-1000 sur Orin)
        for p in ["/sys/devices/17000000.ga10b/load",
                   "/sys/devices/gpu.0/load",
                   "/sys/class/misc/nvgpu0/load"]:
            try:
                raw = int(Path(p).read_text().strip())
                result["gpu_pct"] = round(raw / 10.0, 1)
                break
            except Exception:
                continue

        # Fréquence courante
        freq_hz = self._read_sysfs(self._GPU_FREQ_PATHS)
        if freq_hz:
            result["gpu_freq_mhz"] = freq_hz // 1_000_000

        # Fréquence max
        max_hz = self._read_sysfs(self._GPU_MAX_PATHS)
        if max_hz:
            result["gpu_freq_max"] = max_hz // 1_000_000

        return result

    # ── Consommation électrique (/sys/bus/i2c) ────────────────────────────

    _POWER_PATHS = {
        "vdd_gpu": [
            "/sys/bus/i2c/drivers/ina3221/1-0040/hwmon/hwmon*/in1_input",
            "/sys/bus/i2c/devices/1-0040/hwmon/hwmon*/in1_input",
        ],
    }

    def _read_power(self) -> dict:
        # Lecture rapide via tegrastats --interval 50 (une seule fois)
        try:
            out = subprocess.check_output(
                ["tegrastats", "--interval", "500"],
                timeout=2, stderr=subprocess.DEVNULL
            ).decode()
            return self._parse_tegrastats(out)
        except Exception:
            pass
        return {}

    def _parse_tegrastats(self, line: str) -> dict:
        result = {}
        # VDD_CPU_CV: 3432mW  VDD_SOC: 2052mW
        for name, key in [("VDD_CPU_CV", "vdd_cpu_w"),
                          ("VDD_SOC",    "vdd_soc_w"),
                          ("VDD_GPU",    "vdd_gpu_w")]:
            m = re.search(rf"{name}\s+(\d+)mW", line)
            if m:
                result[key] = round(int(m.group(1)) / 1000.0, 2)
        return result

    # ── nvpmodel / mode alimentation ──────────────────────────────────────

    def _read_nvpmodel(self) -> dict:
        try:
            out = subprocess.check_output(
                ["nvpmodel", "-q", "--verbose"],
                timeout=2, stderr=subprocess.DEVNULL
            ).decode()
            # NV Power Mode: MAXN  ID: 0
            m = re.search(r"NV Power Mode:\s+(\S+)", out)
            if m:
                mode = m.group(1)
                return {"power_mode": mode, "nvpmodel": mode}
        except Exception:
            pass

        # Fallback: lire /etc/nvpmodel.conf ou /sys
        try:
            out = subprocess.check_output(
                ["cat", "/etc/nvpmodel.conf"],
                timeout=1, stderr=subprocess.DEVNULL
            ).decode()
            m = re.search(r"< PM_CONFIG DEFAULT=(\d+)", out)
            if m:
                return {"nvpmodel": f"ID:{m.group(1)}"}
        except Exception:
            pass

        return {"power_mode": "UNKNOWN", "nvpmodel": "?"}

    # ── Changement de mode d'alimentation ────────────────────────────────

    @staticmethod
    def set_power_mode(mode: str) -> bool:
        """Définit le mode alimentation (MAXN, 10W, 15W, etc.)."""
        modes = {"MAXN": 0, "10W": 1, "15W": 2, "SUPER": 3}
        mid = modes.get(mode.upper())
        if mid is None:
            return False
        try:
            subprocess.run(
                ["sudo", "nvpmodel", "-m", str(mid)],
                timeout=5, check=True, stderr=subprocess.DEVNULL
            )
            return True
        except Exception:
            return False
