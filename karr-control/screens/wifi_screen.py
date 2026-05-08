"""Menu WiFi — scan réseaux, connexion, état."""
import curses
import threading
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box, draw_hbar


class WifiScreen(BaseScreen):
    name = "wifi"

    def __init__(self, app):
        super().__init__(app)
        self._sel       = 0
        self._networks  = []
        self._status    = "Appuyez sur S pour scanner"
        self._scanning  = False
        self._input_mode = False
        self._password_buf = []

    def on_show(self):
        pass

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("WIFI CONTROL", "Réseaux sans fil")

        net = self.mon["network"].get()
        ssid    = net.get("wifi_ssid",    "—")
        quality = net.get("wifi_quality",  0)
        ip      = net.get("ip_local",     "—")
        ping    = net.get("ping_ms",      -1)
        wifi_up = net.get("wifi_up",      False)

        # ── Statut courant ────────────────────────────────────────────────
        draw_box(s, 1, 1, 6, w-2, "CONNEXION ACTUELLE")
        safe_addstr(s, 2, 3, "SSID    : ", cp(C_DIM))
        safe_addstr(s, 2, 13, ssid, cp(C_OK) if wifi_up else cp(C_DIM))
        bar_w = min(20, w-40)
        safe_addstr(s, 3, 3, "Signal  : ", cp(C_DIM))
        if wifi_up:
            draw_hbar(s, 3, 13, bar_w, quality)
            safe_addstr(s, 3, 13+bar_w+1, f"{quality}%", cp(C_OK) if quality > 50 else cp(C_WARN))
        else:
            safe_addstr(s, 3, 13, "Non connecté", cp(C_DIM))
        safe_addstr(s, 4, 3, f"IP      : {ip}", cp(C_DEFAULT))
        ping_str = f"{ping:.0f} ms" if ping >= 0 else "OFFLINE"
        ping_col = cp(C_OK) if ping >= 0 else cp(C_ERROR)
        safe_addstr(s, 5, 3, f"Ping    : {ping_str}", ping_col)

        # ── Liste réseaux ─────────────────────────────────────────────────
        list_y = 7
        list_h = min(len(self._networks) + 2, h - list_y - 5)
        draw_box(s, list_y, 1, max(3, list_h + 2), w-2, "RÉSEAUX DISPONIBLES")

        if self._scanning:
            safe_addstr(s, list_y+1, 3, "⟳ Scan en cours...", cp(C_WARN) | curses.A_BOLD)
        elif not self._networks:
            safe_addstr(s, list_y+1, 3, self._status, cp(C_DIM))
        else:
            for i, net in enumerate(self._networks[:list_h]):
                row = list_y + 1 + i
                sig = net.get("signal", 0)
                sec = "🔒" if net.get("security", "").strip() not in ("", "--") else "  "
                sig_col = cp(C_OK) if sig > 60 else (cp(C_WARN) if sig > 30 else cp(C_ERROR))
                bar_s = min(12, w-40)
                lock_str = "[L]" if net.get("security", "").strip() not in ("", "--") else "   "
                ssid_str = net.get("ssid", "?")[:max(1, w-28)]

                if i == self._sel:
                    safe_addstr(s, row, 2, " " * (w-4), cp(C_SELECTED))
                    safe_addstr(s, row, 3, f" ► {lock_str} {ssid_str}", cp(C_SELECTED) | curses.A_BOLD)
                    draw_hbar(s, row, w-18, bar_s, sig, fixed_color=cp(C_SELECTED))
                else:
                    safe_addstr(s, row, 3, f"   {lock_str} {ssid_str}", cp(C_DEFAULT))
                    draw_hbar(s, row, w-18, bar_s, sig)

        # ── Saisie mot de passe ───────────────────────────────────────────
        if self._input_mode:
            pw_y = h - 4
            draw_box(s, pw_y, 5, 3, w-10, "MOT DE PASSE")
            pw_display = "*" * len(self._password_buf)
            safe_addstr(s, pw_y+1, 7, f"> {pw_display}█", cp(C_DEFAULT) | curses.A_BOLD)

        safe_addstr(s, h-3, 3, self._status, cp(C_DIM))
        self.draw_nav_hint([("↑↓","SÉLECT"), ("S","SCAN"), ("ENT","CONNEXION"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if self._input_mode:
            return self._handle_pw_key(key)

        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_UP:
            self._sel = max(0, self._sel - 1)
        elif key == curses.KEY_DOWN:
            self._sel = min(max(0, len(self._networks)-1), self._sel + 1)
        elif key == ord('s') or key == ord('S'):
            self._scan()
        elif key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            self._connect_selected()
        return None

    def _handle_pw_key(self, key: int):
        if key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            pw = "".join(self._password_buf)
            self._password_buf.clear()
            self._input_mode = False
            if self._networks and self._sel < len(self._networks):
                ssid = self._networks[self._sel].get("ssid", "")
                threading.Thread(
                    target=self._do_connect, args=(ssid, pw), daemon=True
                ).start()
        elif key == 27:
            self._password_buf.clear()
            self._input_mode = False
        elif key in (curses.KEY_BACKSPACE, 127, 8):
            if self._password_buf:
                self._password_buf.pop()
        elif 32 <= key < 256:
            self._password_buf.append(chr(key))
        return None

    def _scan(self):
        if self._scanning:
            return
        self._scanning = True
        self._status   = "Scan en cours..."
        threading.Thread(target=self._do_scan, daemon=True).start()

    def _do_scan(self):
        from monitors.network import NetworkMonitor
        nets = NetworkMonitor.scan_wifi()
        self._networks = nets
        self._scanning = False
        self._status   = f"{len(nets)} réseau(x) trouvé(s)"

    def _connect_selected(self):
        if not self._networks or self._sel >= len(self._networks):
            return
        net = self._networks[self._sel]
        if net.get("security", "").strip() not in ("", "--"):
            self._input_mode = True
            self._password_buf.clear()
        else:
            threading.Thread(
                target=self._do_connect, args=(net["ssid"], ""), daemon=True
            ).start()

    def _do_connect(self, ssid: str, password: str):
        self._status = f"Connexion à {ssid}..."
        from monitors.network import NetworkMonitor
        ok = NetworkMonitor.connect_wifi(ssid, password)
        self._status = f"{'Connecté' if ok else 'Erreur'} : {ssid}"
