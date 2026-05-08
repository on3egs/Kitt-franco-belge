"""Moniteur réseau : IP, WiFi, ping, bande passante."""
import threading
import time
import subprocess
import re
import socket
from pathlib import Path


class NetworkMonitor:
    def __init__(self, interval: float = 2.0):
        self.interval = interval
        self._lock = threading.Lock()
        self._data = {
            "wifi_ssid":     "—",
            "wifi_quality":  0,
            "wifi_signal":   -100,
            "wifi_up":       False,
            "eth_up":        False,
            "ip_local":      "—",
            "ip_wan":        "—",
            "ping_ms":       -1,
            "iface_wifi":    "wlP1p1s0",
            "iface_eth":     "eno1",
            "rx_kbps":       0.0,
            "tx_kbps":       0.0,
        }
        self._prev_rx = 0
        self._prev_tx = 0
        self._prev_t  = time.monotonic()
        self._thread  = None
        self._running = False

    # ── API publique ──────────────────────────────────────────────────────

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="net-monitor")
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
        data.update(self._read_wifi())
        data.update(self._read_ip())
        data.update(self._read_bandwidth())
        data["ping_ms"] = self._ping("8.8.8.8")

        with self._lock:
            self._data.update(data)

    # ── WiFi via iwconfig / nmcli ─────────────────────────────────────────

    def _read_wifi(self) -> dict:
        result = {"wifi_ssid": "—", "wifi_quality": 0, "wifi_signal": -100, "wifi_up": False}

        # Essai nmcli d'abord (plus fiable)
        try:
            out = subprocess.check_output(
                ["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi"],
                timeout=3, stderr=subprocess.DEVNULL
            ).decode()
            for line in out.strip().split("\n"):
                if line.startswith("yes:"):
                    parts = line.split(":")
                    if len(parts) >= 3:
                        result["wifi_ssid"]    = parts[1]
                        result["wifi_quality"] = int(parts[2]) if parts[2].isdigit() else 0
                        result["wifi_signal"]  = result["wifi_quality"] - 100
                        result["wifi_up"]      = True
                    return result
        except Exception:
            pass

        # Fallback iwconfig
        try:
            out = subprocess.check_output(
                ["iwconfig", "wlP1p1s0"],
                timeout=2, stderr=subprocess.DEVNULL
            ).decode()
            m_ssid = re.search(r'ESSID:"([^"]+)"', out)
            m_qual = re.search(r"Quality=(\d+)/(\d+)", out)
            if m_ssid:
                result["wifi_ssid"] = m_ssid.group(1)
                result["wifi_up"]   = True
            if m_qual:
                q = int(m_qual.group(1)) * 100 // int(m_qual.group(2))
                result["wifi_quality"] = q
        except Exception:
            pass

        return result

    # ── IP locale ────────────────────────────────────────────────────────

    def _read_ip(self) -> dict:
        result = {"ip_local": "—", "eth_up": False}

        # IP via hostname
        try:
            ips = socket.getaddrinfo(socket.gethostname(), None)
            for r in ips:
                ip = r[4][0]
                if ip.startswith("192.168.") or ip.startswith("10."):
                    result["ip_local"] = ip
                    break
        except Exception:
            pass

        # État ethernet
        eth_path = Path("/sys/class/net/eno1/operstate")
        if eth_path.exists():
            result["eth_up"] = eth_path.read_text().strip() == "up"

        return result

    # ── Bande passante (/proc/net/dev) ────────────────────────────────────

    def _read_bandwidth(self) -> dict:
        iface = "wlP1p1s0"
        try:
            with open("/proc/net/dev") as f:
                for line in f:
                    if iface in line:
                        parts = line.split()
                        rx = int(parts[1])
                        tx = int(parts[9])

                        now = time.monotonic()
                        dt = now - self._prev_t
                        if dt > 0 and self._prev_rx > 0:
                            rx_kbps = (rx - self._prev_rx) / 1024.0 / dt
                            tx_kbps = (tx - self._prev_tx) / 1024.0 / dt
                        else:
                            rx_kbps = tx_kbps = 0.0

                        self._prev_rx = rx
                        self._prev_tx = tx
                        self._prev_t  = now

                        return {
                            "rx_kbps": round(max(rx_kbps, 0), 1),
                            "tx_kbps": round(max(tx_kbps, 0), 1),
                        }
        except Exception:
            pass
        return {"rx_kbps": 0.0, "tx_kbps": 0.0}

    # ── Ping ─────────────────────────────────────────────────────────────

    @staticmethod
    def _ping(host: str, count: int = 1) -> float:
        try:
            out = subprocess.check_output(
                ["ping", "-c", str(count), "-W", "1", host],
                timeout=3, stderr=subprocess.DEVNULL
            ).decode()
            m = re.search(r"time=(\d+\.?\d*)\s*ms", out)
            return float(m.group(1)) if m else -1.0
        except Exception:
            return -1.0

    # ── Scan WiFi ────────────────────────────────────────────────────────

    @staticmethod
    def scan_wifi() -> list:
        try:
            out = subprocess.check_output(
                ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list"],
                timeout=10, stderr=subprocess.DEVNULL
            ).decode()
            networks = []
            seen = set()
            for line in out.strip().split("\n"):
                parts = line.split(":")
                if len(parts) >= 2:
                    ssid = parts[0].strip()
                    if ssid and ssid not in seen:
                        seen.add(ssid)
                        networks.append({
                            "ssid":     ssid,
                            "signal":   int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0,
                            "security": parts[2].strip() if len(parts) > 2 else "?",
                        })
            return sorted(networks, key=lambda n: n["signal"], reverse=True)
        except Exception:
            return []

    @staticmethod
    def connect_wifi(ssid: str, password: str) -> bool:
        try:
            subprocess.run(
                ["nmcli", "device", "wifi", "connect", ssid, "password", password],
                timeout=30, check=True, stderr=subprocess.DEVNULL
            )
            return True
        except Exception:
            return False
