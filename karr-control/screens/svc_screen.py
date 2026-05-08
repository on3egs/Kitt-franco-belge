"""Menu Services — gestion des services systemd KARR."""
import curses
import subprocess
import threading
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box
from config import SERVICES as KNOWN_SERVICES


class ServicesScreen(BaseScreen):
    name = "services"

    def __init__(self, app):
        super().__init__(app)
        self._sel     = 0
        self._states  = {}
        self._status  = ""
        self._loading = False

    def on_show(self):
        self._refresh()

    def _refresh(self):
        if self._loading:
            return
        self._loading = True
        threading.Thread(target=self._do_refresh, daemon=True).start()

    def _do_refresh(self):
        states = {}
        for svc, _ in KNOWN_SERVICES:
            states[svc] = self._svc_state(svc)
        self._states  = states
        self._loading = False
        self._status  = ""

    @staticmethod
    def _svc_state(name: str) -> dict:
        try:
            from core.sysrun import run_out
            stdout = run_out(["systemctl", "status", name, "--no-pager"], timeout=3)
            r_stdout = stdout
            lines = stdout.split("\n")
            state  = "unknown"
            uptime = ""
            for line in lines:
                if "Active:" in line:
                    if "running" in line:
                        state = "active"
                    elif "inactive" in line or "dead" in line:
                        state = "inactive"
                    elif "failed" in line:
                        state = "failed"
                    # Extract uptime
                    import re
                    m = re.search(r"(\d+h? ?\d+min|\d+ seconds?|\d+ms)", line)
                    if m:
                        uptime = m.group(1)
                    break
            return {"state": state, "uptime": uptime}
        except Exception:
            return {"state": "unknown", "uptime": ""}

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("SERVICE MANAGER", "Services systemd KARR")

        spin = "⟳ " if self._loading else ""
        safe_addstr(s, 1, 2, f"{spin}Appuyez sur [R] pour rafraîchir", cp(C_DIM))

        # Tableau services
        tbl_y = 2
        tbl_h = max(3, len(KNOWN_SERVICES) + 4)
        draw_box(s, tbl_y, 1, tbl_h, w-2, "SERVICES")

        # En-têtes
        col_name   = max(20, w//3)
        col_desc   = max(10, w//4)
        col_state  = 10
        col_uptime = 12

        safe_addstr(s, tbl_y+1, 3,
                    f"{'SERVICE':<{col_name}}  {'DESCRIPTION':<{col_desc}}  {'ÉTAT':<{col_state}}  UPTIME",
                    cp(C_TITLE) | curses.A_BOLD)
        safe_addstr(s, tbl_y+2, 3, "─" * (w-6), cp(C_BORDER))

        for i, (svc, desc) in enumerate(KNOWN_SERVICES):
            row = tbl_y + 3 + i
            st  = self._states.get(svc, {})
            state  = st.get("state",  "?")
            uptime = st.get("uptime", "")

            state_col = {
                "active":   cp(C_OK) | curses.A_BOLD,
                "inactive": cp(C_DIM),
                "failed":   cp(C_ERROR) | curses.A_BOLD,
            }.get(state, cp(C_WARN))

            dot = "●" if state == "active" else ("✗" if state == "failed" else "○")

            if i == self._sel:
                safe_addstr(s, row, 2, " " * (w-4), cp(C_SELECTED))
                safe_addstr(s, row, 3,
                            f" ► {svc:<{col_name}}  {desc:<{col_desc}}  {state:<{col_state}}  {uptime}",
                            cp(C_SELECTED) | curses.A_BOLD)
            else:
                safe_addstr(s, row, 3, f"   {svc:<{col_name}}", cp(C_DEFAULT))
                safe_addstr(s, row, 3 + col_name + 5, f"{desc:<{col_desc}}", cp(C_DIM))
                safe_addstr(s, row, 3 + col_name + col_desc + 8, f"{dot} {state:<8}", state_col)
                safe_addstr(s, row, 3 + col_name + col_desc + 8 + col_state + 2, uptime, cp(C_DIM))

        # Panneau actions
        action_y = tbl_y + tbl_h + 1
        if action_y < h - 4:
            draw_box(s, action_y, 1, 4, w-2, "ACTIONS")
            safe_addstr(s, action_y+1, 3,
                        "[ S ] Start  [ T ] Stop  [ R ] Restart  [ L ] Logs  [ F5 ] Refresh",
                        cp(C_DIM))

        if self._status:
            safe_addstr(s, h-2, 3, self._status, cp(C_WARN))

        self.draw_nav_hint([("↑↓","SÉLECT"), ("S","START"), ("T","STOP"),
                             ("R","RESTART"), ("L","LOGS"), ("F5","REFRESH"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_UP:
            self._sel = max(0, self._sel - 1)
        elif key == curses.KEY_DOWN:
            self._sel = min(len(KNOWN_SERVICES)-1, self._sel + 1)
        elif key == curses.KEY_F5 or key == ord('f') or key == ord('F'):
            self._refresh()
        elif key == ord('r') or key == ord('R'):
            self._action("restart")
        elif key == ord('s') or key == ord('S'):
            self._action("start")
        elif key == ord('t') or key == ord('T'):
            self._action("stop")
        elif key == ord('l') or key == ord('L'):
            return {"type": "navigate", "screen": "logs"}
        return None

    def _action(self, cmd: str):
        if not KNOWN_SERVICES or self._sel >= len(KNOWN_SERVICES):
            return
        svc = KNOWN_SERVICES[self._sel][0]
        self._status = f"{cmd.upper()} {svc}..."
        def _do():
            from core.sysrun import run_ok
            ok = run_ok(["systemctl", cmd, svc], timeout=30, sudo=True)
            self._status = f"{'✓' if ok else '✗'} {cmd} {svc}"
            self._refresh()
        threading.Thread(target=_do, daemon=True).start()
