"""Mode diagnostic complet — auto-check tous les composants système."""
import curses
import subprocess
import threading
import time
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR
from core.widgets import safe_addstr, draw_box


class DiagnosticScreen(BaseScreen):
    name = "diagnostic"

    CHECKS = [
        ("GPU CUDA",         "cuda"),
        ("LLM llama-server", "llm"),
        ("STT Whisper",      "stt"),
        ("TTS Piper",        "tts"),
        ("Audio HK MIC",     "audio"),
        ("Bluetooth",        "bluetooth"),
        ("WiFi",             "wifi"),
        ("Ethernet",         "ethernet"),
        ("Ping Internet",    "ping"),
        ("Service KYRONEX",  "kyronex"),
        ("Service Tunnel",   "tunnel"),
        ("NVMe SSD",         "nvme"),
        ("RAM libre",        "ram"),
        ("Température CPU",  "temp_cpu"),
        ("Température GPU",  "temp_gpu"),
    ]

    def __init__(self, app):
        super().__init__(app)
        self._results  = {}   # {key: {"state": "OK"|"WARN"|"FAIL"|"...", "detail": ""}}
        self._running  = False
        self._done     = False
        self._progress = 0

    def on_show(self):
        self._results  = {}
        self._done     = False
        self._progress = 0
        threading.Thread(target=self._run_diag, daemon=True).start()

    def _run_diag(self):
        self._running = True
        checks = self.CHECKS
        for i, (label, key) in enumerate(checks):
            self._progress = i
            result = self._run_check(key)
            self._results[key] = result
            time.sleep(0.05)

        self._running = False
        self._done    = True
        self._progress = len(checks)

    def _run_check(self, key: str) -> dict:
        try:
            if key == "cuda":
                out = subprocess.check_output(
                    ["nvidia-smi", "--query-gpu=utilization.gpu",
                     "--format=csv,noheader"],
                    timeout=3, stderr=subprocess.DEVNULL
                ).decode().strip()
                return {"state": "OK", "detail": f"GPU: {out}"}

            elif key == "llm":
                import urllib.request
                try:
                    urllib.request.urlopen("http://localhost:8080/health", timeout=2)
                    return {"state": "OK", "detail": "llama-server répond"}
                except Exception:
                    return {"state": "FAIL", "detail": "Port 8080 injoignable"}

            elif key == "stt":
                import os
                venv = "/home/kitt/kitt-ai/venv/lib/python3.10/site-packages/faster_whisper"
                if os.path.isdir(venv):
                    return {"state": "OK", "detail": "faster-whisper installé"}
                return {"state": "WARN", "detail": "Venv introuvable"}

            elif key == "tts":
                import os
                piper = "/home/kitt/kitt-ai/piper_gpu.py"
                if os.path.exists(piper):
                    return {"state": "OK", "detail": "piper_gpu.py présent"}
                return {"state": "WARN", "detail": "piper_gpu.py introuvable"}

            elif key == "audio":
                out = subprocess.check_output(
                    ["pactl", "list", "sources", "short"],
                    timeout=3, stderr=subprocess.DEVNULL
                ).decode()
                if "HK" in out or "CF-IC" in out:
                    return {"state": "OK", "detail": "HK MIC Array détecté"}
                return {"state": "WARN", "detail": "HK MIC non détecté"}

            elif key == "bluetooth":
                out = subprocess.check_output(
                    ["bluetoothctl", "show"],
                    timeout=3, stderr=subprocess.DEVNULL
                ).decode()
                if "Powered: yes" in out:
                    return {"state": "OK", "detail": "BT actif"}
                return {"state": "WARN", "detail": "BT inactif/manquant"}

            elif key == "wifi":
                net = self.mon["network"].get()
                if net.get("wifi_up"):
                    ssid = net.get("wifi_ssid", "?")
                    q    = net.get("wifi_quality", 0)
                    return {"state": "OK", "detail": f"{ssid} {q}%"}
                return {"state": "FAIL", "detail": "Non connecté"}

            elif key == "ethernet":
                from pathlib import Path
                state = Path("/sys/class/net/eno1/operstate")
                if state.exists() and state.read_text().strip() == "up":
                    return {"state": "OK", "detail": "eth0 UP"}
                return {"state": "WARN", "detail": "Ethernet inactif"}

            elif key == "ping":
                net = self.mon["network"].get()
                p = net.get("ping_ms", -1)
                if p >= 0:
                    return {"state": "OK", "detail": f"{p:.0f} ms"}
                return {"state": "FAIL", "detail": "Pas de réponse"}

            elif key in ("kyronex", "tunnel"):
                svc_map = {"kyronex": "kitt-kyronex.service",
                           "tunnel":  "kitt-tunnel.service"}
                svc = svc_map[key]
                r = subprocess.run(
                    ["systemctl", "is-active", svc],
                    capture_output=True, text=True, timeout=2
                )
                if r.stdout.strip() == "active":
                    return {"state": "OK", "detail": "running"}
                return {"state": "FAIL", "detail": r.stdout.strip()}

            elif key == "nvme":
                out = subprocess.check_output(
                    ["df", "-h", "/"],
                    timeout=3, stderr=subprocess.DEVNULL
                ).decode()
                for line in out.split("\n")[1:]:
                    parts = line.split()
                    if parts:
                        used = parts[4] if len(parts) > 4 else "?"
                        avail = parts[3] if len(parts) > 3 else "?"
                        return {"state": "OK", "detail": f"Utilisé {used}, libre {avail}"}

            elif key == "ram":
                sys_d = self.mon["system"].get()
                pct   = sys_d.get("ram_pct", 0)
                used  = sys_d.get("ram_used_mb", 0)
                total = sys_d.get("ram_total_mb", 1)
                state = "OK" if pct < 80 else ("WARN" if pct < 92 else "FAIL")
                return {"state": state, "detail": f"{used}/{total}MB ({pct:.0f}%)"}

            elif key in ("temp_cpu", "temp_gpu"):
                sys_d = self.mon["system"].get()
                field = key
                val   = sys_d.get(field, 0)
                if val < 65:
                    state = "OK"
                elif val < 80:
                    state = "WARN"
                else:
                    state = "FAIL"
                return {"state": state, "detail": f"{val:.1f}°C"}

        except Exception as e:
            return {"state": "FAIL", "detail": str(e)[:40]}

        return {"state": "WARN", "detail": "Non testé"}

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("AUTO-DIAGNOSTIC", "Vérification complète du système")

        # En-tête
        if self._running:
            pct = int(100 * self._progress / len(self.CHECKS))
            safe_addstr(s, 1, 2, f"Diagnostic en cours... {pct}%", cp(C_WARN) | curses.A_BOLD)
        elif self._done:
            fails = sum(1 for v in self._results.values() if v.get("state") == "FAIL")
            warns = sum(1 for v in self._results.values() if v.get("state") == "WARN")
            ok    = len(self.CHECKS) - fails - warns
            if fails == 0 and warns == 0:
                safe_addstr(s, 1, 2, "[ ALL SYSTEMS OPERATIONAL ]",
                            cp(C_OK) | curses.A_BOLD | curses.A_BLINK)
            else:
                msg = f"[ {ok} OK  {warns} WARN  {fails} FAIL ]"
                col = cp(C_ERROR) | curses.A_BOLD if fails > 0 else cp(C_WARN) | curses.A_BOLD
                safe_addstr(s, 1, 2, msg, col)
        else:
            safe_addstr(s, 1, 2, "Préparation diagnostic...", cp(C_DIM))

        # Tableau résultats
        tbl_y = 2
        tbl_h = min(len(self.CHECKS) + 4, h - tbl_y - 2)
        draw_box(s, tbl_y, 1, tbl_h, w-2, "RÉSULTATS")

        col_name = max(22, w//3)
        col_state = 8

        safe_addstr(s, tbl_y+1, 3,
                    f"{'COMPOSANT':<{col_name}}  {'ÉTAT':<{col_state}}  DÉTAIL",
                    cp(C_TITLE) | curses.A_BOLD)
        safe_addstr(s, tbl_y+2, 3, "─" * (w-6), cp(C_BORDER))

        vis_h = tbl_h - 4
        for i, (label, key) in enumerate(self.CHECKS[:vis_h]):
            row = tbl_y + 3 + i
            res = self._results.get(key)

            if res is None:
                # En cours ou pas encore fait
                if i == self._progress and self._running:
                    state_str = "  ...   "
                    state_col = cp(C_WARN) | curses.A_BOLD
                    detail = "test en cours"
                else:
                    state_str = " WAIT   "
                    state_col = cp(C_DIM)
                    detail = ""
            else:
                state = res.get("state", "?")
                detail = res.get("detail", "")
                state_map = {
                    "OK":   ("  OK   ", cp(C_OK) | curses.A_BOLD),
                    "WARN": (" WARN  ", cp(C_WARN) | curses.A_BOLD),
                    "FAIL": (" FAIL  ", cp(C_ERROR) | curses.A_BOLD),
                }
                state_str, state_col = state_map.get(state, ("  ?    ", cp(C_DIM)))

            safe_addstr(s, row, 3, f"  {label:<{col_name}}", cp(C_DEFAULT))
            safe_addstr(s, row, 3 + col_name + 2, f"[{state_str}]", state_col)
            safe_addstr(s, row, 3 + col_name + col_state + 4, detail[:max(1,w-col_name-20)], cp(C_DIM))

        self.draw_nav_hint([("R","RELANCER"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if (key == ord('r') or key == ord('R')) and not self._running:
            self.on_show()
        return None
