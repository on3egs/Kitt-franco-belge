"""Menu périphériques — détection automatique USB, audio, caméras, etc."""
import curses
import subprocess
import threading
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box


class DevicesScreen(BaseScreen):
    name = "devices"

    def __init__(self, app):
        super().__init__(app)
        self._sel       = 0
        self._devices   = []
        self._refreshing = False
        self._status    = ""

    def on_show(self):
        self._refresh()

    def _refresh(self):
        if self._refreshing:
            return
        self._refreshing = True
        threading.Thread(target=self._do_refresh, daemon=True).start()

    def _do_refresh(self):
        devs = []
        devs.extend(self._detect_audio())
        devs.extend(self._detect_cameras())
        devs.extend(self._detect_usb())
        devs.extend(self._detect_serial())
        self._devices = devs
        self._refreshing = False
        self._status = f"{len(devs)} périphérique(s) détecté(s)"

    @staticmethod
    def _detect_audio() -> list:
        devs = []
        try:
            out = subprocess.check_output(
                ["pactl", "list", "cards", "short"],
                timeout=3, stderr=subprocess.DEVNULL
            ).decode()
            for line in out.strip().split("\n"):
                if line.strip():
                    parts = line.split("\t")
                    name = parts[1] if len(parts) > 1 else "?"
                    devs.append({"type": "AUDIO", "name": name[:50], "state": "OK"})
        except Exception:
            pass
        return devs

    @staticmethod
    def _detect_cameras() -> list:
        devs = []
        try:
            import glob
            for v in glob.glob("/dev/video*"):
                devs.append({"type": "CAM", "name": v, "state": "PRÉSENT"})
        except Exception:
            pass
        return devs

    @staticmethod
    def _detect_usb() -> list:
        devs = []
        try:
            out = subprocess.check_output(
                ["lsusb"], timeout=5, stderr=subprocess.DEVNULL
            ).decode()
            for line in out.strip().split("\n"):
                if line.strip():
                    # Bus 001 Device 004: ID xxxx:xxxx Description
                    parts = line.split(":", 2)
                    desc = parts[2].strip() if len(parts) > 2 else line.strip()
                    desc = desc[desc.find(" ")+1:][:50] if " " in desc else desc[:50]
                    devs.append({"type": "USB", "name": desc, "state": "OK"})
        except Exception:
            pass
        return devs

    @staticmethod
    def _detect_serial() -> list:
        devs = []
        try:
            import glob
            for port in glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"):
                devs.append({"type": "SERIAL", "name": port, "state": "PRÉSENT"})
        except Exception:
            pass
        return devs

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("DEVICE MANAGER", "Périphériques connectés")

        spin = "⟳" if self._refreshing else " "
        safe_addstr(s, 1, 2, f"{spin} {self._status}", cp(C_DIM))

        # Tableau périphériques
        table_y = 2
        table_h = h - 5
        draw_box(s, table_y, 1, table_h, w-2, "PÉRIPHÉRIQUES")

        col_type  = 6
        col_name  = max(10, w - 24)
        col_state = 10

        # En-tête colonne
        safe_addstr(s, table_y+1, 3,
                    f"{'TYPE':<{col_type}}  {'NOM':<{col_name}}  {'ÉTAT':<{col_state}}",
                    cp(C_TITLE) | curses.A_BOLD)
        safe_addstr(s, table_y+2, 3, "─" * (w-6), cp(C_BORDER))

        visible_h = table_h - 4
        start = max(0, self._sel - visible_h + 1) if self._sel >= visible_h else 0

        for i, dev in enumerate(self._devices[start:start+visible_h]):
            row = table_y + 3 + i
            idx = i + start
            t_col = {
                "AUDIO":  cp(C_OK),
                "CAM":    cp(C_WARN),
                "USB":    cp(C_DEFAULT),
                "SERIAL": cp(C_WARN),
            }.get(dev["type"], cp(C_DIM))

            type_str  = dev["type"][:col_type]
            name_str  = dev["name"][:col_name]
            state_str = dev["state"][:col_state]

            if idx == self._sel:
                safe_addstr(s, row, 2, " " * (w-4), cp(C_SELECTED))
                safe_addstr(s, row, 3, f" ► {type_str:<{col_type}}  {name_str:<{col_name}}  {state_str}", cp(C_SELECTED))
            else:
                safe_addstr(s, row, 3, f"   {type_str:<{col_type}}", cp(C_DIM))
                safe_addstr(s, row, 3 + col_type + 5, f"{name_str}", cp(C_DEFAULT))
                safe_addstr(s, row, 3 + col_type + 5 + col_name + 2, state_str, t_col)

        self.draw_nav_hint([("↑↓","SÉLECT"), ("R","REFRESH"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_UP:
            self._sel = max(0, self._sel - 1)
        elif key == curses.KEY_DOWN:
            self._sel = min(max(0, len(self._devices)-1), self._sel + 1)
        elif key == ord('r') or key == ord('R'):
            self._refresh()
        return None
