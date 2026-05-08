"""Menu audio — volume, gain micro, profils, vumètre."""
import curses
import subprocess
import threading
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED, C_HEADER
from core.widgets import safe_addstr, draw_box, draw_hbar, draw_label


class AudioScreen(BaseScreen):
    name = "audio"

    ITEMS = [
        ("Volume sortie",       "vol_out"),
        ("Gain microphone",     "vol_mic"),
        ("Profil NORMAL",       "prof_normal"),
        ("Profil NIGHT",        "prof_night"),
        ("Profil STUDIO",       "prof_studio"),
        ("Profil KARR",         "prof_karr"),
        ("Mute sortie",         "mute_out"),
        ("Mute micro",          "mute_mic"),
        ("Test micro (5s)",     "test_mic"),
        ("Retour dashboard",    "back"),
    ]

    def __init__(self, app):
        super().__init__(app)
        self._sel = 0

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()

        self.draw_title_bar("AUDIO CONTROL", "Volume & Microphone")

        aud = self.mon["audio"].get()
        vol_out = aud.get("sink_vol_pct", 0)
        vol_mic = aud.get("src_vol_pct",  0)
        muted_o = aud.get("sink_muted",   False)
        muted_m = aud.get("src_muted",    False)
        bt_conn = aud.get("bt_connected", False)
        bt_dev  = aud.get("bt_device",    "—")

        # ── Vumètres + valeurs courantes ──────────────────────────────────
        info_box_h = 8
        draw_box(s, 1, 1, info_box_h, w//2-1, "STATUS AUDIO")

        bar_w = max(8, w//2 - 20)
        safe_addstr(s, 2, 3, "SORTIE  ", cp(C_DIM))
        draw_hbar(s, 2, 11, bar_w, vol_out)
        mute_str = " [MUTE]" if muted_o else f" {vol_out}%"
        safe_addstr(s, 2, 11+bar_w+1, mute_str, cp(C_OK) if not muted_o else cp(C_WARN))

        safe_addstr(s, 3, 3, "MICRO   ", cp(C_DIM))
        draw_hbar(s, 3, 11, bar_w, vol_mic)
        mute_str_m = " [MUTE]" if muted_m else f" {vol_mic}%"
        safe_addstr(s, 3, 11+bar_w+1, mute_str_m, cp(C_OK) if not muted_m else cp(C_WARN))

        safe_addstr(s, 4, 3, "BLUETOOTH", cp(C_DIM))
        bt_col = cp(C_OK) if bt_conn else cp(C_DIM)
        safe_addstr(s, 4, 12, f"{'♪ ' + bt_dev if bt_conn else '✗ Non connecté'}", bt_col)

        safe_addstr(s, 5, 3, "SINK", cp(C_DIM))
        sink_short = aud.get("sink_name", "—")[-max(1, w//2-10):]
        safe_addstr(s, 5, 7, sink_short, cp(C_DEFAULT))

        # Sinks disponibles
        sinks   = aud.get("sinks", [])
        sources = aud.get("sources", [])
        safe_addstr(s, 6, 3, f"Sorties: {len(sinks)}  Sources: {len(sources)}", cp(C_DIM))

        # ── Menu actions ──────────────────────────────────────────────────
        menu_y = info_box_h + 2
        menu_w = 36
        menu_x = 2
        draw_box(s, menu_y, menu_x, len(self.ITEMS)+2, menu_w, "ACTIONS")

        for i, (label, _) in enumerate(self.ITEMS):
            row = menu_y + 1 + i
            if i == self._sel:
                safe_addstr(s, row, menu_x+1, " " * (menu_w-2), cp(C_SELECTED))
                safe_addstr(s, row, menu_x+2, f" ► {label}", cp(C_SELECTED) | curses.A_BOLD)
            else:
                safe_addstr(s, row, menu_x+2, f"   {label}", cp(C_DEFAULT))

        # ── Guide touches ─────────────────────────────────────────────────
        self.draw_nav_hint([("↑↓","MENU"), ("←→","RÉGLER"), ("ENT","ACTION"),
                             ("ESC","RETOUR"), ("Q","DASH")])

        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1):
            return {"type": "navigate", "screen": "dashboard"}
        if key == ord('q'):
            return {"type": "navigate", "screen": "dashboard"}

        if key == curses.KEY_UP:
            self._sel = (self._sel - 1) % len(self.ITEMS)
        elif key == curses.KEY_DOWN:
            self._sel = (self._sel + 1) % len(self.ITEMS)
        elif key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            return self._activate()
        elif key == curses.KEY_RIGHT:
            self._adjust(+5)
        elif key == curses.KEY_LEFT:
            self._adjust(-5)
        return None

    def _activate(self):
        _, action = self.ITEMS[self._sel]
        mon = self.mon["audio"]
        if action == "back":
            return {"type": "navigate", "screen": "dashboard"}
        elif action.startswith("prof_"):
            profile = action[5:].upper()
            threading.Thread(
                target=mon.apply_profile, args=(profile,), daemon=True
            ).start()
        elif action == "mute_out":
            threading.Thread(target=mon.toggle_sink_mute, daemon=True).start()
        elif action == "mute_mic":
            threading.Thread(target=mon.toggle_source_mute, daemon=True).start()
        elif action == "test_mic":
            self._test_mic()
        return None

    def _adjust(self, delta: int):
        _, action = self.ITEMS[self._sel]
        mon = self.mon["audio"]
        d   = mon.get()
        if action == "vol_out":
            new_vol = max(0, min(150, d.get("sink_vol_pct", 0) + delta))
            threading.Thread(target=mon.set_sink_volume, args=(new_vol,), daemon=True).start()
        elif action == "vol_mic":
            new_vol = max(0, min(150, d.get("src_vol_pct", 0) + delta))
            threading.Thread(target=mon.set_source_volume, args=(new_vol,), daemon=True).start()

    @staticmethod
    def _test_mic():
        from core.sysrun import run_ok
        threading.Thread(
            target=lambda: run_ok(
                ["parecord", "--device=@DEFAULT_SOURCE@",
                 "--file-format=wav", "-d", "5", "/tmp/karr_mic_test.wav"],
                timeout=8
            ),
            daemon=True
        ).start()
