"""Menu Système IA — statut LLM, STT, TTS, contrôle services."""
import curses
import subprocess
import threading
import time
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box, draw_hbar


class AiScreen(BaseScreen):
    name = "ai"

    ACTIONS = [
        ("Restart KYRONEX",    "restart"),
        ("Arrêt KYRONEX",      "stop"),
        ("Démarrage KYRONEX",  "start"),
        ("Afficher logs IA",   "logs"),
        ("Retour dashboard",   "back"),
    ]

    def __init__(self, app):
        super().__init__(app)
        self._sel       = 0
        self._status    = ""
        self._llm_info  = {}
        self._logs      = []
        self._log_scroll = 0

    def on_show(self):
        threading.Thread(target=self._refresh_llm, daemon=True).start()

    def _refresh_llm(self):
        info = {}
        # Statut llama-server via HTTP
        try:
            import urllib.request, json, ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(
                "http://localhost:8080/health", timeout=2
            ) as r:
                info["llm_ok"] = r.status == 200
        except Exception:
            info["llm_ok"] = False

        # Tokens/s depuis bench
        try:
            bench_path = "/home/kitt/bench_llama_gpu.txt"
            with open(bench_path) as f:
                for line in f:
                    if "tokens/s" in line.lower() or "t/s" in line.lower():
                        import re
                        m = re.search(r"([\d.]+)\s*(?:tokens?/s|t/s)", line, re.I)
                        if m:
                            info["tps"] = float(m.group(1))
                            break
        except Exception:
            pass

        # RAM/VRAM via /proc/meminfo
        try:
            with open("/proc/meminfo") as f:
                mem = {}
                for line in f:
                    k, v = line.split(":", 1)
                    mem[k.strip()] = int(v.split()[0])
            total = mem.get("MemTotal", 0) // 1024
            avail = mem.get("MemAvailable", 0) // 1024
            info["ram_used_mb"]  = total - avail
            info["ram_total_mb"] = total
        except Exception:
            pass

        self._llm_info = info
        self._load_logs()

    def _load_logs(self):
        from core.sysrun import run_out
        out = run_out(
            ["journalctl", "-u", "kitt-kyronex.service", "-n", "20",
             "--no-pager", "--output=short"],
            timeout=5
        )
        self._logs = out.strip().split("\n")[-20:] if out.strip() else ["[Logs indisponibles]"]

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("AI SYSTEM MONITOR", "LLM · STT · TTS · Status")

        info = self._llm_info
        llm_ok = info.get("llm_ok", False)

        # ── Panneau statut ────────────────────────────────────────────────
        draw_box(s, 1, 1, 8, w//2-1, "COMPOSANTS IA")

        llm_col = cp(C_OK) | curses.A_BOLD if llm_ok else cp(C_ERROR)
        safe_addstr(s, 2, 3, "LLM  ", cp(C_DIM))
        safe_addstr(s, 2, 8, "gemma-4-E2B-it-Q4_K_M", cp(C_DEFAULT))
        safe_addstr(s, 2, w//2-10, "ACTIVE" if llm_ok else "OFFLINE", llm_col)

        safe_addstr(s, 3, 3, "STT  faster-whisper base GPU int8", cp(C_DEFAULT))
        safe_addstr(s, 4, 3, "TTS  piper GPU — fr_FR-siwis", cp(C_DEFAULT))

        tps = info.get("tps", 0)
        tps_col = cp(C_OK) if tps > 15 else (cp(C_WARN) if tps > 5 else cp(C_ERROR))
        safe_addstr(s, 5, 3, f"TPS  ", cp(C_DIM))
        safe_addstr(s, 5, 8, f"{tps:.1f} tok/s", tps_col | curses.A_BOLD)

        ram_used  = info.get("ram_used_mb",  0)
        ram_total = info.get("ram_total_mb", 7400)
        ram_pct   = 100 * ram_used // max(ram_total, 1)
        safe_addstr(s, 6, 3, f"RAM  {ram_used}MB / {ram_total}MB  [{ram_pct}%]",
                    cp(C_WARN) if ram_pct > 80 else cp(C_DEFAULT))

        kyronex_ok = self._check_service("kitt-kyronex.service")
        safe_addstr(s, 7, 3, "SVC  kitt-kyronex ", cp(C_DIM))
        safe_addstr(s, 7, 21, "RUNNING" if kyronex_ok else "DOWN",
                    cp(C_OK) | curses.A_BOLD if kyronex_ok else cp(C_ERROR) | curses.A_BOLD)

        # ── Actions ───────────────────────────────────────────────────────
        menu_y = 1
        menu_x = w//2 + 1
        menu_w = w - menu_x - 2
        draw_box(s, menu_y, menu_x, len(self.ACTIONS)+2, menu_w, "ACTIONS")
        for i, (label, _) in enumerate(self.ACTIONS):
            row = menu_y + 1 + i
            if i == self._sel:
                safe_addstr(s, row, menu_x+1, " " * (menu_w-2), cp(C_SELECTED))
                safe_addstr(s, row, menu_x+2, f" ► {label}", cp(C_SELECTED) | curses.A_BOLD)
            else:
                safe_addstr(s, row, menu_x+2, f"   {label}", cp(C_DEFAULT))

        # ── Logs ──────────────────────────────────────────────────────────
        log_y = 9
        log_h = max(3, h - log_y - 2)
        draw_box(s, log_y, 1, log_h, w-2, "LOGS KYRONEX")

        vis_h = log_h - 2
        start = max(0, len(self._logs) - vis_h - self._log_scroll)
        for i, line in enumerate(self._logs[start:start+vis_h]):
            row = log_y + 1 + i
            col = cp(C_ERROR) if "error" in line.lower() or "fail" in line.lower() else cp(C_DIM)
            safe_addstr(s, row, 3, line[:w-6], col)

        safe_addstr(s, h-2, 3, self._status, cp(C_WARN) if self._status else cp(C_DIM))
        self.draw_nav_hint([("↑↓","MENU"), ("ENT","LANCER"), ("R","REFRESH"), ("ESC","RETOUR")])
        s.noutrefresh()

    @staticmethod
    def _check_service(name: str) -> bool:
        from core.sysrun import run_out
        return run_out(["systemctl", "is-active", name], timeout=1).strip() == "active"

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_UP:
            self._sel = (self._sel - 1) % len(self.ACTIONS)
        elif key == curses.KEY_DOWN:
            self._sel = (self._sel + 1) % len(self.ACTIONS)
        elif key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            return self._activate()
        elif key == ord('r') or key == ord('R'):
            threading.Thread(target=self._refresh_llm, daemon=True).start()
        elif key == curses.KEY_PPAGE:
            self._log_scroll = min(self._log_scroll + 5, max(0, len(self._logs) - 5))
        elif key == curses.KEY_NPAGE:
            self._log_scroll = max(0, self._log_scroll - 5)
        return None

    def _activate(self):
        _, action = self.ACTIONS[self._sel]
        if action == "back":
            return {"type": "navigate", "screen": "dashboard"}
        elif action == "restart":
            self._svc_action("restart", "kitt-kyronex.service")
        elif action == "stop":
            self._svc_action("stop",    "kitt-kyronex.service")
        elif action == "start":
            self._svc_action("start",   "kitt-kyronex.service")
        elif action == "logs":
            return {"type": "navigate", "screen": "logs"}
        return None

    def _svc_action(self, cmd: str, svc: str):
        self._status = f"{cmd.upper()} {svc}..."
        def _do():
            try:
                from core.sysrun import run_ok
                ok = run_ok(["systemctl", cmd, svc], timeout=30, sudo=True)
                self._status = f"{'✓' if ok else '✗'} {cmd} {svc}"
                self._refresh_llm()
            except Exception as e:
                self._status = f"Erreur : {e}"
        threading.Thread(target=_do, daemon=True).start()
