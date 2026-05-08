"""
Dashboard principal KARR — panneau de monitoring + console IA.
Layout : 60% haut (monitoring en grille) + 40% bas (console IA scrollable).
"""
import curses
import datetime
import threading
import time
import json
import ssl
import urllib.request
import urllib.parse
import textwrap

from core.app     import BaseScreen
from core.colors  import cp, bar_color, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_ALERT, C_AI, C_USER, C_HEADER, C_INPUT, C_SELECTED
from core.widgets import (safe_addstr, draw_box, draw_hbar, draw_label,
                           draw_status_dot, draw_fkey_bar, wrap_text)

# Ratio de division écran haut/bas
SPLIT_RATIO = 0.58


class DashboardScreen(BaseScreen):
    name = "dashboard"

    def __init__(self, app):
        super().__init__(app)
        # ── Console IA ───────────────────────────────────────────────────
        self._history    = []    # [{"role": "user"|"karr", "text": "..."}]
        self._input_buf  = []    # caractères saisis
        self._input_mode = False # True = saisie active
        self._scroll_off = 0     # offset scroll historique
        self._llm_busy   = False # génération en cours
        self._llm_stream = ""    # buffer streaming
        self._lock       = threading.Lock()

        # ── Cache services (TTL 5s, rafraîchi en background) ─────────────
        self._svc_cache      = {}    # {name: bool}
        self._svc_cache_ts   = 0.0
        self._svc_refreshing = False

        # Message de bienvenue
        self._history.append({
            "role": "karr",
            "text": "Bonjour Manix. Tous les systèmes sont opérationnels. "
                    "Appuyez sur [ESPACE] ou [ENTRÉE] pour me parler."
        })

    # ─────────────────────────────────────────────────────────────────────
    # DRAW
    # ─────────────────────────────────────────────────────────────────────

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        split = max(12, int(h * SPLIT_RATIO))

        # ── Barre de titre globale ────────────────────────────────────────
        self._draw_header(w)

        # ── Panneau MONITORING (haut) ─────────────────────────────────────
        self._draw_monitoring(1, 0, split - 1, w)

        # ── Séparateur + barre de navigation ─────────────────────────────
        self._draw_nav_bar(split - 1, w)

        # ── Panneau CONSOLE IA (bas) ──────────────────────────────────────
        console_h = h - split - 1
        if console_h > 2:
            self._draw_console(split, 0, console_h, w)

        # ── Barre de statut bas ────────────────────────────────────────────
        self._draw_status_bar(h - 1, w)

        s.noutrefresh()

    # ── Barre de titre ────────────────────────────────────────────────────

    def _draw_header(self, w: int):
        s = self.stdscr
        now = datetime.datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
        try:
            s.addstr(0, 0, " " * (w - 1), cp(C_HEADER) | curses.A_BOLD)
        except curses.error:
            pass
        safe_addstr(s, 0, 1, "◆ KARR CONTROL CENTER", cp(C_HEADER) | curses.A_BOLD)
        safe_addstr(s, 0, w - len(now) - 1, now, cp(C_HEADER) | curses.A_BOLD)

    # ── Panneau monitoring ────────────────────────────────────────────────

    def _draw_monitoring(self, y: int, x: int, h: int, w: int):
        s = self.stdscr
        sys_d  = self.mon["system"].get()
        gpu_d  = self.mon["gpu"].get()
        aud_d  = self.mon["audio"].get()
        net_d  = self.mon["network"].get()

        # Grille : 3 colonnes de panneaux sur 2 rangées
        col_w  = w // 3
        row_h  = max(4, (h - 1) // 2)

        # ── Ligne 1 : SYSTEM | AUDIO | NETWORK ───────────────────────────
        self._draw_panel_system(y,           x,            row_h, col_w,     sys_d)
        self._draw_panel_audio (y,           x + col_w,    row_h, col_w,     aud_d)
        self._draw_panel_network(y,          x + col_w*2,  row_h, w - col_w*2, net_d)

        # ── Ligne 2 : GPU | AI STATUS | SERVICES ─────────────────────────
        y2 = y + row_h
        if y2 < y + h - 1:
            self._draw_panel_gpu    (y2, x,           row_h, col_w,     gpu_d, sys_d)
            self._draw_panel_ai     (y2, x + col_w,   row_h, col_w)
            self._draw_panel_services(y2, x + col_w*2,row_h, w - col_w*2)

    def _draw_panel_system(self, y, x, h, w, d):
        draw_box(self.stdscr, y, x, h, w, "SYSTEM")
        if h < 4:
            return
        cpu = d.get("cpu_pct", 0)
        ram = d.get("ram_pct", 0)
        temp = d.get("temp_cpu", 0)
        uptime = d.get("uptime_s", 0)

        bar_w = max(6, w - 14)
        safe_addstr(self.stdscr, y+1, x+2, "CPU ", cp(C_DIM))
        draw_hbar(self.stdscr, y+1, x+6, bar_w, cpu)
        safe_addstr(self.stdscr, y+1, x+6+bar_w+1, f"{cpu:5.1f}%", bar_color(cpu))

        if h > 3:
            ram_used = d.get("ram_used_mb", 0)
            ram_tot  = d.get("ram_total_mb", 1)
            safe_addstr(self.stdscr, y+2, x+2, "RAM ", cp(C_DIM))
            draw_hbar(self.stdscr, y+2, x+6, bar_w, ram)
            safe_addstr(self.stdscr, y+2, x+6+bar_w+1, f"{ram:5.1f}%", bar_color(ram))

        if h > 4:
            temp_col = cp(C_OK) if temp < 65 else (cp(C_WARN) if temp < 80 else cp(C_ERROR) | curses.A_BOLD)
            safe_addstr(self.stdscr, y+3, x+2, f"TEMP {temp:.0f}°C", temp_col)
            up_str = self.mon["system"].__class__.format_uptime(uptime)
            safe_addstr(self.stdscr, y+3, x+14, f"UP {up_str}", cp(C_DIM))

    def _draw_panel_audio(self, y, x, h, w, d):
        draw_box(self.stdscr, y, x, h, w, "AUDIO")
        if h < 4:
            return
        vol = d.get("sink_vol_pct", 0)
        mic = d.get("src_vol_pct", 0)
        muted_out = d.get("sink_muted", False)
        muted_mic = d.get("src_muted", False)
        bt_conn   = d.get("bt_connected", False)
        bt_dev    = d.get("bt_device", "—")[:10]

        bar_w = max(6, w - 14)

        mute_mark = "[M]" if muted_out else "   "
        safe_addstr(self.stdscr, y+1, x+2, "OUT ", cp(C_DIM))
        draw_hbar(self.stdscr, y+1, x+6, bar_w, vol)
        safe_addstr(self.stdscr, y+1, x+6+bar_w+1, f"{vol:3d}%{mute_mark}", bar_color(vol))

        if h > 3:
            mute_mic = "[M]" if muted_mic else "   "
            safe_addstr(self.stdscr, y+2, x+2, "MIC ", cp(C_DIM))
            draw_hbar(self.stdscr, y+2, x+6, bar_w, mic)
            safe_addstr(self.stdscr, y+2, x+6+bar_w+1, f"{mic:3d}%{mute_mic}", bar_color(mic))

        if h > 4:
            bt_icon = "♪" if bt_conn else "✗"
            bt_col  = cp(C_OK) if bt_conn else cp(C_DIM)
            safe_addstr(self.stdscr, y+3, x+2, f"BT  {bt_icon} {bt_dev}", bt_col)

    def _draw_panel_network(self, y, x, h, w, d):
        draw_box(self.stdscr, y, x, h, w, "NETWORK")
        if h < 3:
            return
        ssid    = d.get("wifi_ssid", "—")[:max(1, w-10)]
        quality = d.get("wifi_quality", 0)
        ip      = d.get("ip_local", "—")
        ping    = d.get("ping_ms", -1)
        rx      = d.get("rx_kbps", 0)
        tx      = d.get("tx_kbps", 0)
        wifi_up = d.get("wifi_up", False)

        sig_col = cp(C_OK) if quality > 60 else (cp(C_WARN) if quality > 30 else cp(C_ERROR))
        safe_addstr(self.stdscr, y+1, x+2, f"WiFi ", cp(C_DIM))
        safe_addstr(self.stdscr, y+1, x+7, f"{ssid}", sig_col if wifi_up else cp(C_DIM))

        if h > 3:
            safe_addstr(self.stdscr, y+2, x+2, f"IP   {ip}", cp(C_DEFAULT))

        if h > 4:
            ping_str = f"{ping:.0f}ms" if ping >= 0 else "OFFLINE"
            ping_col = cp(C_OK) if ping >= 0 else cp(C_ERROR)
            safe_addstr(self.stdscr, y+3, x+2, f"Ping {ping_str}", ping_col)

    def _draw_panel_gpu(self, y, x, h, w, gd, sd):
        draw_box(self.stdscr, y, x, h, w, "GPU JETSON")
        if h < 3:
            return
        gpu_pct  = gd.get("gpu_pct", 0)
        freq_mhz = gd.get("gpu_freq_mhz", 0)
        freq_max = gd.get("gpu_freq_max", 0)
        temp_gpu = sd.get("temp_gpu", 0)
        mode     = gd.get("nvpmodel", "?")

        bar_w = max(6, w - 14)
        safe_addstr(self.stdscr, y+1, x+2, "GPU ", cp(C_DIM))
        draw_hbar(self.stdscr, y+1, x+6, bar_w, gpu_pct)
        safe_addstr(self.stdscr, y+1, x+6+bar_w+1, f"{gpu_pct:5.1f}%", bar_color(gpu_pct))

        if h > 3:
            freq_str = f"{freq_mhz}MHz" if freq_mhz else "—"
            safe_addstr(self.stdscr, y+2, x+2, f"FREQ {freq_str}", cp(C_DEFAULT))

        if h > 4:
            tg_col = cp(C_OK) if temp_gpu < 65 else (cp(C_WARN) if temp_gpu < 80 else cp(C_ERROR))
            safe_addstr(self.stdscr, y+3, x+2, f"TEMP {temp_gpu:.0f}°C  [{mode}]", tg_col)

    def _draw_panel_ai(self, y, x, h, w):
        draw_box(self.stdscr, y, x, h, w, "AI STATUS")
        if h < 3:
            return
        safe_addstr(self.stdscr, y+1, x+2, "LLM  gemma-4-E2B", cp(C_DEFAULT))
        if h > 3:
            safe_addstr(self.stdscr, y+2, x+2, "STT  faster-whisper", cp(C_DEFAULT))
        if h > 4:
            llm_str = "GENERATING..." if self._llm_busy else "READY"
            llm_col = cp(C_WARN) | curses.A_BOLD if self._llm_busy else cp(C_OK)
            safe_addstr(self.stdscr, y+3, x+2, f"STAT {llm_str}", llm_col)

    def _draw_panel_services(self, y, x, h, w):
        from config import SERVICES
        draw_box(self.stdscr, y, x, h, w, "SERVICES")
        if h < 3:
            return
        for i, (svc, label) in enumerate(SERVICES[:h-2]):
            row = y + 1 + i
            active = self._check_service(svc)
            dot    = "●" if active else "○"
            col    = cp(C_OK) | curses.A_BOLD if active else cp(C_DIM)
            name   = svc[:max(1, w-8)]
            safe_addstr(self.stdscr, row, x+2, f"{dot} {name}", col)

    def _check_service(self, name: str) -> bool:
        now = time.monotonic()
        if now - self._svc_cache_ts > 5.0 and not self._svc_refreshing:
            self._svc_refreshing = True
            threading.Thread(target=self._refresh_svc_cache, daemon=True).start()
        return self._svc_cache.get(name, False)

    def _refresh_svc_cache(self):
        from core.sysrun import run_out
        from config import SERVICES
        cache = {
            svc: run_out(["systemctl", "is-active", svc], timeout=1).strip() == "active"
            for svc, _ in SERVICES
        }
        self._svc_cache    = cache
        self._svc_cache_ts = time.monotonic()
        self._svc_refreshing = False

    # ── Barre de navigation F-Keys ────────────────────────────────────────

    def _draw_nav_bar(self, y: int, w: int):
        nav = [
            ("F2","AUDIO"), ("F3","BT"), ("F4","WIFI"),
            ("F5","DEV"),   ("F6","AI"), ("F7","GPU"),
            ("F8","SVC"),   ("F9","LOG"),("F10","DIAG"),
            ("Q","QUIT"),
        ]
        try:
            self.stdscr.addstr(y, 0, " " * (w-1), cp(C_BORDER))
        except curses.error:
            pass
        x = 0
        for fkey, label in nav:
            if x >= w - 1:
                break
            safe_addstr(self.stdscr, y, x, fkey,          cp(C_SELECTED) | curses.A_BOLD)
            x += len(fkey)
            safe_addstr(self.stdscr, y, x, f" {label} ",  cp(C_DIM))
            x += len(label) + 2

    # ── Console IA ────────────────────────────────────────────────────────

    def _draw_console(self, y: int, x: int, h: int, w: int):
        s = self.stdscr
        if h < 4:
            return

        # Titre console
        try:
            s.addstr(y, x, " " * (w-1), cp(C_BORDER))
        except curses.error:
            pass
        safe_addstr(s, y, x+1, " KARR AI CONSOLE ", cp(C_TITLE) | curses.A_BOLD)
        mode_str = " [SAISIE] " if self._input_mode else " [ESPACE=parler] "
        safe_addstr(s, y, x + w - len(mode_str) - 1, mode_str, cp(C_DIM))

        # Zone d'historique (h-2 lignes disponibles, dernière = input)
        hist_h   = h - 2
        input_y  = y + h - 1

        # Construire toutes les lignes formatées
        lines = self._build_history_lines(w - 4)

        # Scroll automatique vers le bas
        if len(lines) > hist_h and self._scroll_off == 0:
            visible_start = max(0, len(lines) - hist_h)
        else:
            visible_start = max(0, len(lines) - hist_h - self._scroll_off)

        # Fond de la zone
        for row in range(hist_h):
            try:
                s.addstr(y + 1 + row, x, " " * (w-1))
            except curses.error:
                pass

        # Afficher les lignes
        for row in range(hist_h):
            line_idx = visible_start + row
            if line_idx >= len(lines):
                break
            ltype, ltext = lines[line_idx]
            render_y = y + 1 + row
            if ltype == "user":
                safe_addstr(s, render_y, x+2, f"VOUS  › {ltext}", cp(C_USER) | curses.A_BOLD)
            elif ltype == "karr":
                safe_addstr(s, render_y, x+2, f"KARR  › {ltext}", cp(C_AI))
            elif ltype == "karr_cont":
                safe_addstr(s, render_y, x+10, ltext, cp(C_AI))
            elif ltype == "user_cont":
                safe_addstr(s, render_y, x+10, ltext, cp(C_USER) | curses.A_BOLD)
            elif ltype == "status":
                safe_addstr(s, render_y, x+2, ltext, cp(C_DIM))
            elif ltype == "error":
                safe_addstr(s, render_y, x+2, ltext, cp(C_ERROR))
            elif ltype == "error_cont":
                safe_addstr(s, render_y, x+10, ltext, cp(C_ERROR))

        # Séparateur avant input
        try:
            s.addstr(input_y - 1, x, "─" * (w - 1), cp(C_BORDER))
        except curses.error:
            pass

        # Ligne d'input
        if self._input_mode:
            prompt = "VOUS  › "
            input_text = "".join(self._input_buf)
            cursor = "█"
            display = f"{prompt}{input_text}{cursor}"
            # Tronquer si trop long
            if len(display) > w - 4:
                display = display[-(w-4):]
            try:
                s.addstr(input_y, x, " " * (w-1), cp(C_INPUT))
            except curses.error:
                pass
            safe_addstr(s, input_y, x+2, display, cp(C_INPUT) | curses.A_BOLD)
        else:
            # Afficher streaming si en cours
            if self._llm_busy and self._llm_stream:
                snippet = self._llm_stream[-max(1, w-20):]
                safe_addstr(s, input_y, x+2,
                             f"KARR  › {snippet}▌",
                             cp(C_AI) | curses.A_BOLD)
            else:
                hint = "[ ESPACE = parler │ ↑↓ = scroll │ ESC = menu ]"
                safe_addstr(s, input_y, x + (w - len(hint))//2,
                             hint, cp(C_DIM) | curses.A_DIM)

    def _build_history_lines(self, w: int) -> list:
        """Transforme l'historique en liste (type, texte) pour affichage."""
        lines = []
        for entry in self._history:
            role = entry["role"]
            text = entry["text"]
            wrapped = wrap_text(text, w - 10)

            if not wrapped:
                continue

            # Première ligne avec rôle
            lines.append((role, wrapped[0]))
            # Lignes de continuation
            for cont in wrapped[1:]:
                lines.append((f"{role}_cont", cont))
            # Ligne vide entre messages
            lines.append(("", ""))

        return lines

    # ─────────────────────────────────────────────────────────────────────
    # HANDLE_KEY
    # ─────────────────────────────────────────────────────────────────────

    def handle_key(self, key: int):
        # ── Navigation F-Keys ─────────────────────────────────────────────
        fkey_nav = {
            curses.KEY_F2:  "audio",
            curses.KEY_F3:  "bluetooth",
            curses.KEY_F4:  "wifi",
            curses.KEY_F5:  "devices",
            curses.KEY_F6:  "ai",
            curses.KEY_F7:  "gpu",
            curses.KEY_F8:  "services",
            curses.KEY_F9:  "logs",
            curses.KEY_F10: "diagnostic",
        }
        if key in fkey_nav:
            return {"type": "navigate", "screen": fkey_nav[key]}

        if key == ord('Q'):
            return {"type": "quit"}

        # ── Mode saisie ───────────────────────────────────────────────────
        if self._input_mode:
            return self._handle_input_key(key)

        # ── Mode navigation ───────────────────────────────────────────────
        if key in (ord(' '), ord('\n'), curses.KEY_ENTER):
            self._input_mode = True
            self._scroll_off = 0
            return None

        if key == curses.KEY_UP:
            self._scroll_off = min(self._scroll_off + 2, 100)
        elif key == curses.KEY_DOWN:
            self._scroll_off = max(0, self._scroll_off - 2)
        elif key == 27:
            self._scroll_off = 0

        return None

    def _handle_input_key(self, key: int) -> dict | None:
        if key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            text = "".join(self._input_buf).strip()
            self._input_buf.clear()
            self._input_mode = False
            if text:
                self._send_message(text)
            return None

        if key == 27:                           # ESC → annuler saisie
            self._input_buf.clear()
            self._input_mode = False
            return None

        if key in (curses.KEY_BACKSPACE, 127, 8):
            if self._input_buf:
                self._input_buf.pop()
            return None

        # Caractère imprimable
        if 32 <= key < 256:
            if len(self._input_buf) < 256:
                self._input_buf.append(chr(key))
        return None

    # ── Envoi message LLM ─────────────────────────────────────────────────

    def _send_message(self, text: str):
        with self._lock:
            self._history.append({"role": "user", "text": text})
            self._llm_busy = True
            self._llm_stream = ""
            self._scroll_off  = 0

        threading.Thread(
            target=self._query_llm,
            args=(text,),
            daemon=True,
            name="llm-query"
        ).start()

    def _query_llm(self, text: str):
        """Requête au serveur KYRONEX — exécutée dans un thread séparé."""
        from config import KYRONEX_URL, SESSION_ID, USER_NAME

        payload = json.dumps({
            "message":    text,
            "session_id": SESSION_ID,
            "audio":      False,
            "user_name":  USER_NAME,
        }).encode()

        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode    = ssl.CERT_NONE

        try:
            req = urllib.request.Request(
                f"{KYRONEX_URL}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as resp:
                data = json.loads(resp.read().decode())
                reply = data.get("reply", "").strip()
        except Exception as e:
            reply = None
            err_msg = f"[ERREUR CONNEXION : {type(e).__name__}]"

        with self._lock:
            self._llm_busy   = False
            self._llm_stream = ""
            if reply:
                self._history.append({"role": "karr", "text": reply})
            else:
                self._history.append({"role": "error", "text": err_msg})

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def on_show(self):
        self._scroll_off = 0

    def on_resize(self, h: int, w: int):
        pass
