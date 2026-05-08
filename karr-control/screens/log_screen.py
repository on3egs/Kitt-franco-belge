"""Menu Logs — journalctl avec filtres et scroll."""
import curses
import subprocess
import threading
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box


LOG_SOURCES = [
    ("KYRONEX",  ["journalctl", "-u", "kitt-kyronex.service", "-n", "100", "--no-pager"]),
    ("SYSTÈME",  ["journalctl", "-n", "80", "--no-pager", "--priority=warning"]),
    ("KERNEL",   ["journalctl", "-k", "-n", "60", "--no-pager"]),
    ("WATCHDOG", ["journalctl", "-u", "kitt-watchdog.service", "-n", "60", "--no-pager"]),
    ("TUNNEL",   ["journalctl", "-u", "kitt-tunnel.service", "-n", "60", "--no-pager"]),
]


class LogsScreen(BaseScreen):
    name = "logs"

    def __init__(self, app):
        super().__init__(app)
        self._source  = 0
        self._lines   = []
        self._scroll  = 0
        self._loading = False

    def on_show(self):
        self._load()

    def _load(self):
        if self._loading:
            return
        self._loading = True
        self._scroll  = 0
        threading.Thread(target=self._do_load, daemon=True).start()

    def _do_load(self):
        _, cmd = LOG_SOURCES[self._source]
        try:
            out = subprocess.check_output(
                cmd, timeout=10, stderr=subprocess.DEVNULL
            ).decode(errors="replace")
            self._lines = out.strip().split("\n")
        except Exception as e:
            self._lines = [f"[Erreur chargement logs : {e}]"]
        self._loading = False

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()

        src_name = LOG_SOURCES[self._source][0]
        self.draw_title_bar(f"LOGS — {src_name}", "journalctl")

        # ── Onglets sources ───────────────────────────────────────────────
        x = 2
        for i, (name, _) in enumerate(LOG_SOURCES):
            if i == self._source:
                safe_addstr(s, 1, x, f"[{name}]", cp(C_SELECTED) | curses.A_BOLD)
            else:
                safe_addstr(s, 1, x, f" {name} ", cp(C_DIM))
            x += len(name) + 3

        if self._loading:
            safe_addstr(s, 1, w-12, "Chargement…", cp(C_WARN))

        # ── Zone logs ─────────────────────────────────────────────────────
        log_y = 2
        log_h = h - log_y - 2
        draw_box(s, log_y, 1, log_h, w-2, "")

        vis_h = log_h - 2
        total = len(self._lines)

        # Auto-scroll vers la fin si scroll == 0
        if self._scroll == 0:
            start = max(0, total - vis_h)
        else:
            start = max(0, total - vis_h - self._scroll)

        for i in range(vis_h):
            idx = start + i
            if idx >= total:
                break
            row  = log_y + 1 + i
            line = self._lines[idx][:w-4]

            # Colorisation des niveaux
            lower = line.lower()
            if "error" in lower or "fail" in lower or "crit" in lower:
                col = cp(C_ERROR)
            elif "warn" in lower:
                col = cp(C_WARN)
            elif "ok" in lower or "start" in lower or "activ" in lower:
                col = cp(C_OK)
            else:
                col = cp(C_DIM)

            safe_addstr(s, row, 3, line, col)

        # Indicateur scroll
        if total > vis_h:
            pos = start * 100 // max(total, 1)
            safe_addstr(s, h-2, 3, f"Ligne {start+1}/{total}  [{pos}%]  ↑↓ PageUP/DN", cp(C_DIM))

        self.draw_nav_hint([("←→","SOURCE"), ("↑↓","SCROLL"), ("PgUP/DN","PAGE"),
                             ("R","RELOAD"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}

        if key == curses.KEY_LEFT:
            self._source = (self._source - 1) % len(LOG_SOURCES)
            self._load()
        elif key == curses.KEY_RIGHT:
            self._source = (self._source + 1) % len(LOG_SOURCES)
            self._load()
        elif key == curses.KEY_UP:
            self._scroll += 2
        elif key == curses.KEY_DOWN:
            self._scroll = max(0, self._scroll - 2)
        elif key == curses.KEY_PPAGE:
            self._scroll += 20
        elif key == curses.KEY_NPAGE:
            self._scroll = max(0, self._scroll - 20)
        elif key == curses.KEY_HOME:
            self._scroll = max(0, len(self._lines) - 5)
        elif key == curses.KEY_END:
            self._scroll = 0
        elif key == ord('r') or key == ord('R'):
            self._load()

        return None
