"""Moniteur audio : volumes PulseAudio, niveaux micro, sinks/sources."""
import threading
import time
import subprocess
import re


import os as _os

# Variables de session PulseAudio — capturées une fois au démarrage
_PULSE_ENV = {k: v for k, v in _os.environ.items()
              if k in ("PULSE_SERVER", "PULSE_RUNTIME_PATH",
                       "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
                       "HOME", "USER")}


def _pactl(*args, timeout: float = 2.0) -> str:
    """Exécute pactl avec les variables de session PulseAudio."""
    try:
        env = dict(_os.environ)
        env.update(_PULSE_ENV)
        return subprocess.check_output(
            ["pactl", *args],
            timeout=timeout, stderr=subprocess.DEVNULL,
            env=env,
        ).decode()
    except Exception:
        return ""


def _pa_set(cmd: list, timeout: float = 2.0) -> bool:
    try:
        subprocess.run(["pactl", *cmd], timeout=timeout,
                       check=True, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


class AudioMonitor:
    def __init__(self, interval: float = 0.5):
        self.interval = interval
        self._lock = threading.Lock()
        self._data = {
            "sink_name":    "—",
            "sink_vol_pct": 0,
            "sink_muted":   False,
            "source_name":  "—",
            "src_vol_pct":  0,
            "src_muted":    False,
            "sinks":        [],
            "sources":      [],
            "bt_connected": False,
            "bt_device":    "—",
        }
        self._thread = None
        self._running = False

    # ── API publique ──────────────────────────────────────────────────────

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="audio-monitor")
        self._thread.start()

    def stop(self):
        self._running = False

    def get(self) -> dict:
        with self._lock:
            return dict(self._data)

    # ── Contrôle volume ───────────────────────────────────────────────────

    def set_sink_volume(self, pct: int) -> bool:
        pct = max(0, min(pct, 150))
        return _pa_set(["set-sink-volume", "@DEFAULT_SINK@", f"{pct}%"])

    def set_source_volume(self, pct: int) -> bool:
        pct = max(0, min(pct, 150))
        return _pa_set(["set-source-volume", "@DEFAULT_SOURCE@", f"{pct}%"])

    def toggle_sink_mute(self) -> bool:
        return _pa_set(["set-sink-mute", "@DEFAULT_SINK@", "toggle"])

    def toggle_source_mute(self) -> bool:
        return _pa_set(["set-source-mute", "@DEFAULT_SOURCE@", "toggle"])

    def set_default_sink(self, name: str) -> bool:
        return _pa_set(["set-default-sink", name])

    def set_default_source(self, name: str) -> bool:
        return _pa_set(["set-default-source", name])

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

        # Sink courant (sortie)
        sink_info = _pactl("get-sink-volume", "@DEFAULT_SINK@")
        data["sink_vol_pct"] = self._parse_volume(sink_info)
        mute_out = _pactl("get-sink-mute", "@DEFAULT_SINK@")
        data["sink_muted"] = "yes" in mute_out.lower()

        # Source courante (micro)
        src_info = _pactl("get-source-volume", "@DEFAULT_SOURCE@")
        data["src_vol_pct"] = self._parse_volume(src_info)
        mute_src = _pactl("get-source-mute", "@DEFAULT_SOURCE@")
        data["src_muted"] = "yes" in mute_src.lower()

        # Listes (update moins fréquent)
        sinks   = self._list_sinks()
        sources = self._list_sources()
        data["sinks"]   = sinks
        data["sources"] = sources

        # Nom du sink par défaut
        default_sink_out = _pactl("get-default-sink")
        data["sink_name"] = default_sink_out.strip() or "—"
        default_src_out = _pactl("get-default-source")
        data["source_name"] = default_src_out.strip() or "—"

        # Bluetooth (appel non bloquant, délégué à un thread séparé)
        if not hasattr(self, "_bt_thread_active") or not self._bt_thread_active:
            self._bt_thread_active = True
            import threading as _t
            _t.Thread(target=self._refresh_bluetooth, daemon=True).start()

        with self._lock:
            self._data.update(data)

    # ── Parsing ──────────────────────────────────────────────────────────

    @staticmethod
    def _parse_volume(text: str) -> int:
        """Extrait le pourcentage de volume depuis la sortie pactl."""
        m = re.search(r"(\d+)%", text)
        return int(m.group(1)) if m else 0

    @staticmethod
    def _list_sinks() -> list:
        out = _pactl("list", "sinks", "short")
        sinks = []
        for line in out.strip().split("\n"):
            if line.strip():
                parts = line.split("\t")
                if len(parts) >= 2:
                    sinks.append({
                        "id":   parts[0].strip(),
                        "name": parts[1].strip(),
                        "state": parts[4].strip() if len(parts) > 4 else "?",
                    })
        return sinks

    @staticmethod
    def _list_sources() -> list:
        out = _pactl("list", "sources", "short")
        sources = []
        for line in out.strip().split("\n"):
            if line.strip():
                parts = line.split("\t")
                if len(parts) >= 2:
                    name = parts[1].strip()
                    if ".monitor" in name:
                        continue
                    sources.append({
                        "id":    parts[0].strip(),
                        "name":  name,
                        "state": parts[4].strip() if len(parts) > 4 else "?",
                    })
        return sources

    def _refresh_bluetooth(self):
        """Détection BT asynchrone — ne bloque pas la collecte audio."""
        result = {"bt_connected": False, "bt_device": "—"}
        try:
            # Lire les appareils connectés via bluetoothctl devices
            out = subprocess.check_output(
                ["bluetoothctl", "devices", "Connected"],
                timeout=1.5, stderr=subprocess.DEVNULL
            ).decode()
            for line in out.strip().split("\n"):
                if line.startswith("Device"):
                    parts = line.split(" ", 2)
                    name = parts[2].strip() if len(parts) > 2 else "BT"
                    result = {"bt_connected": True, "bt_device": name}
                    break
        except Exception:
            pass
        with self._lock:
            self._data.update(result)
        self._bt_thread_active = False

    @staticmethod
    def _detect_bluetooth() -> dict:
        """Méthode obsolète — remplacée par _refresh_bluetooth."""
        return {"bt_connected": False, "bt_device": "—"}

    # ── Profils audio ─────────────────────────────────────────────────────

    @staticmethod
    def apply_profile(name: str):
        from config import AUDIO_PROFILES, AUDIO_SINK, AUDIO_SOURCE
        p = AUDIO_PROFILES.get(name.upper())
        if not p:
            return
        _pa_set(["set-sink-volume",   AUDIO_SINK,   f"{p['volume']}%"])
        _pa_set(["set-source-volume", AUDIO_SOURCE, f"{p['mic']}%"])
