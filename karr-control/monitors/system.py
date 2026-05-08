"""Moniteur système : CPU, RAM, température, swap — lecture /proc et /sys."""
import threading
import time
import os
import re
import subprocess
from pathlib import Path


class SystemMonitor:
    def __init__(self, interval: float = 1.0):
        self.interval = interval
        self._lock = threading.Lock()
        self._data = {
            "cpu_pct": 0.0,
            "ram_used_mb": 0,
            "ram_total_mb": 0,
            "ram_pct": 0.0,
            "swap_used_mb": 0,
            "swap_total_mb": 0,
            "swap_pct": 0.0,
            "temp_cpu": 0.0,
            "temp_gpu": 0.0,
            "temp_soc": 0.0,
            "uptime_s": 0,
            "load1": 0.0,
            "load5": 0.0,
        }
        self._prev_cpu = None
        self._thread = None
        self._running = False

    # ── API publique ──────────────────────────────────────────────────────

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="sys-monitor")
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
        data.update(self._read_cpu())
        data.update(self._read_mem())
        data.update(self._read_temps())
        data.update(self._read_uptime())

        with self._lock:
            self._data.update(data)

    # ── Lecture CPU (/proc/stat) ──────────────────────────────────────────

    def _read_cpu(self) -> dict:
        try:
            with open("/proc/stat") as f:
                line = f.readline()
            fields = [int(v) for v in line.split()[1:]]
            idle = fields[3] + fields[4]  # idle + iowait
            total = sum(fields)

            if self._prev_cpu is not None:
                d_total = total - self._prev_cpu[0]
                d_idle  = idle  - self._prev_cpu[1]
                if d_total > 0:
                    pct = 100.0 * (1.0 - d_idle / d_total)
                else:
                    pct = 0.0
            else:
                pct = 0.0

            self._prev_cpu = (total, idle)
            return {"cpu_pct": round(max(0.0, min(pct, 100.0)), 1)}
        except Exception:
            return {"cpu_pct": 0.0}

    # ── Lecture RAM + Swap (/proc/meminfo) ───────────────────────────────

    def _read_mem(self) -> dict:
        try:
            mem = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    k, v = line.split(":", 1)
                    mem[k.strip()] = int(v.split()[0])

            total_mb     = mem.get("MemTotal", 0) // 1024
            avail_mb     = mem.get("MemAvailable", 0) // 1024
            used_mb      = total_mb - avail_mb
            swap_total_mb= mem.get("SwapTotal", 0) // 1024
            swap_free_mb = mem.get("SwapFree", 0) // 1024
            swap_used_mb = swap_total_mb - swap_free_mb

            return {
                "ram_used_mb":   used_mb,
                "ram_total_mb":  total_mb,
                "ram_pct":       round(100.0 * used_mb / max(total_mb, 1), 1),
                "swap_used_mb":  swap_used_mb,
                "swap_total_mb": swap_total_mb,
                "swap_pct":      round(100.0 * swap_used_mb / max(swap_total_mb, 1), 1),
            }
        except Exception:
            return {}

    # ── Températures (/sys/class/thermal) ────────────────────────────────

    _ZONE_NAMES = {
        "cpu-thermal": "cpu",
        "gpu-thermal": "gpu",
        "soc0-thermal": "soc",
        "tj-thermal": "tj",
    }

    def _read_temps(self) -> dict:
        result = {"temp_cpu": 0.0, "temp_gpu": 0.0, "temp_soc": 0.0}
        thermal_root = Path("/sys/class/thermal")
        if not thermal_root.exists():
            return result

        zones = sorted(thermal_root.glob("thermal_zone*"))
        for zone in zones:
            try:
                typ  = (zone / "type").read_text().strip()
                raw  = int((zone / "temp").read_text().strip())
                temp_c = raw / 1000.0
                key = self._ZONE_NAMES.get(typ)
                if key:
                    result[f"temp_{key}"] = round(temp_c, 1)
            except Exception:
                continue
        return result

    # ── Uptime + load (/proc/uptime, /proc/loadavg) ──────────────────────

    def _read_uptime(self) -> dict:
        try:
            with open("/proc/uptime") as f:
                uptime_s = float(f.read().split()[0])
        except Exception:
            uptime_s = 0.0

        try:
            with open("/proc/loadavg") as f:
                parts = f.read().split()
                load1 = float(parts[0])
                load5 = float(parts[1])
        except Exception:
            load1 = load5 = 0.0

        return {"uptime_s": int(uptime_s), "load1": load1, "load5": load5}

    # ── Helper uptime formaté ─────────────────────────────────────────────

    @staticmethod
    def format_uptime(seconds: int) -> str:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        if h >= 24:
            return f"{h//24}d {h%24:02d}h"
        return f"{h:02d}h{m:02d}m"
