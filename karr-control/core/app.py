"""
Gestionnaire principal de l'application KARR Control Center.
Gère la boucle d'événements, les transitions d'écrans, les moniteurs.
"""
import curses
import signal
import sys
import time
import threading
from core.colors import init_colors, cp, C_HEADER, C_DIM, C_BORDER
from core.widgets import safe_addstr, draw_separator


class KarrApp:
    """Classe principale — instanciée par main.py, lancée par curses.wrapper."""

    def __init__(self):
        self.stdscr     = None
        self.running    = True
        self.screens    = {}
        self._current   = None
        self._resize_ev = threading.Event()

        # Moniteurs partagés entre tous les écrans
        self.monitors   = {}

    # ─────────────────────────────────────────────────────────────────────
    # Point d'entrée curses.wrapper
    # ─────────────────────────────────────────────────────────────────────

    def run(self, stdscr):
        self.stdscr = stdscr
        self._init_curses()
        init_colors()
        self._setup_signals()
        self._start_monitors()

        # Boot screen
        from boot import BootScreen
        BootScreen(stdscr).run()

        # Charger et afficher le dashboard
        self._load_screens()
        self.switch_screen("dashboard")

        # Boucle principale
        try:
            self._main_loop()
        finally:
            self._cleanup()

    # ─────────────────────────────────────────────────────────────────────
    # Initialisation
    # ─────────────────────────────────────────────────────────────────────

    def _init_curses(self):
        curses.cbreak()
        curses.noecho()
        self.stdscr.keypad(True)
        curses.curs_set(0)
        self.stdscr.nodelay(True)
        self.stdscr.timeout(80)     # 80ms timeout sur getch → ~12.5 fps max

    def _setup_signals(self):
        signal.signal(signal.SIGWINCH, lambda s, f: self._resize_ev.set())
        signal.signal(signal.SIGTERM,  lambda s, f: self._stop())

    def _start_monitors(self):
        from monitors.system  import SystemMonitor
        from monitors.gpu     import GpuMonitor
        from monitors.audio   import AudioMonitor
        from monitors.network import NetworkMonitor

        self.monitors["system"]  = SystemMonitor(interval=1.0)
        self.monitors["gpu"]     = GpuMonitor(interval=2.0)
        self.monitors["audio"]   = AudioMonitor(interval=0.5)
        self.monitors["network"] = NetworkMonitor(interval=3.0)

        for m in self.monitors.values():
            m.start()

    def _load_screens(self):
        from screens.dashboard    import DashboardScreen
        from screens.audio_screen import AudioScreen
        from screens.bt_screen    import BluetoothScreen
        from screens.wifi_screen  import WifiScreen
        from screens.dev_screen   import DevicesScreen
        from screens.ai_screen    import AiScreen
        from screens.gpu_screen   import GpuScreen
        from screens.svc_screen   import ServicesScreen
        from screens.log_screen   import LogsScreen
        from screens.diag_screen  import DiagnosticScreen

        for name, cls in [
            ("dashboard",   DashboardScreen),
            ("audio",       AudioScreen),
            ("bluetooth",   BluetoothScreen),
            ("wifi",        WifiScreen),
            ("devices",     DevicesScreen),
            ("ai",          AiScreen),
            ("gpu",         GpuScreen),
            ("services",    ServicesScreen),
            ("logs",        LogsScreen),
            ("diagnostic",  DiagnosticScreen),
        ]:
            self.screens[name] = cls(self)

    # ─────────────────────────────────────────────────────────────────────
    # Boucle principale
    # ─────────────────────────────────────────────────────────────────────

    def _main_loop(self):
        while self.running:
            # Gérer resize terminal
            if self._resize_ev.is_set():
                self._resize_ev.clear()
                self._handle_resize()

            # Dessiner l'écran courant
            if self._current:
                try:
                    self._current.draw()
                except Exception:
                    pass

            curses.doupdate()

            # Lire touche
            key = self.stdscr.getch()
            if key == -1:
                continue

            # Touches globales
            if key == ord('q') or key == ord('Q'):
                if self._current and getattr(self._current, "name", "") != "dashboard":
                    self.switch_screen("dashboard")
                else:
                    # Double q pour quitter depuis dashboard
                    self._stop()
                continue

            # Déléguer à l'écran courant
            if self._current:
                try:
                    action = self._current.handle_key(key)
                    if action:
                        self._dispatch(action)
                except Exception:
                    pass

    def _dispatch(self, action):
        if isinstance(action, str):
            action = {"type": "navigate", "screen": action}

        t = action.get("type", "")
        if t == "navigate":
            self.switch_screen(action["screen"])
        elif t == "quit":
            self._stop()

    # ─────────────────────────────────────────────────────────────────────
    # Gestion des écrans
    # ─────────────────────────────────────────────────────────────────────

    def switch_screen(self, name: str):
        if self._current:
            try:
                self._current.on_hide()
            except Exception:
                pass

        screen = self.screens.get(name)
        if not screen:
            return

        self._current = screen
        self.stdscr.clear()
        self.stdscr.refresh()

        try:
            screen.on_show()
        except Exception:
            pass

    # ─────────────────────────────────────────────────────────────────────
    # Resize
    # ─────────────────────────────────────────────────────────────────────

    def _handle_resize(self):
        curses.endwin()
        self.stdscr.refresh()
        self.stdscr.clear()
        h, w = self.stdscr.getmaxyx()
        for screen in self.screens.values():
            try:
                screen.on_resize(h, w)
            except Exception:
                pass

    # ─────────────────────────────────────────────────────────────────────
    # Cleanup
    # ─────────────────────────────────────────────────────────────────────

    def _stop(self):
        self.running = False

    def _cleanup(self):
        for m in self.monitors.values():
            try:
                m.stop()
            except Exception:
                pass
        curses.curs_set(1)
        curses.nocbreak()
        self.stdscr.keypad(False)
        curses.echo()
        curses.endwin()


# ─────────────────────────────────────────────────────────────────────────
# Classe de base pour tous les écrans
# ─────────────────────────────────────────────────────────────────────────

class BaseScreen:
    """Classe parente que chaque écran hérite."""

    name = "base"

    def __init__(self, app: KarrApp):
        self.app     = app
        self.stdscr  = app.stdscr
        self.mon     = app.monitors   # raccourci vers les moniteurs

    # Propriétés pratiques
    @property
    def height(self) -> int:
        return self.stdscr.getmaxyx()[0]

    @property
    def width(self) -> int:
        return self.stdscr.getmaxyx()[1]

    # ── Interface à implémenter ───────────────────────────────────────────

    def draw(self):
        """Dessine l'écran complet. Appelée ~12 fois/sec."""
        pass

    def handle_key(self, key: int):
        """Traite une touche. Retourne une action ou None."""
        if key == 27 or key == ord('q'):          # ESC / q → retour
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_F1:
            return {"type": "navigate", "screen": "dashboard"}
        return None

    def on_show(self):
        """Appelé quand l'écran devient visible."""
        pass

    def on_hide(self):
        """Appelé quand l'écran est caché."""
        pass

    def on_resize(self, h: int, w: int):
        """Appelé lors d'un resize terminal."""
        pass

    # ── Helpers communs ───────────────────────────────────────────────────

    def draw_title_bar(self, title: str, subtitle: str = ""):
        """Barre de titre globale en haut de l'écran."""
        import datetime
        max_y, max_x = self.stdscr.getmaxyx()

        # Fond de la barre
        try:
            self.stdscr.addstr(0, 0, " " * (max_x - 1),
                               cp(C_HEADER) | curses.A_BOLD)
        except curses.error:
            pass

        # Titre gauche
        safe_addstr(self.stdscr, 0, 1, f"◆ {title}",
                    cp(C_HEADER) | curses.A_BOLD)

        # Heure droite
        now = datetime.datetime.now().strftime("%H:%M:%S")
        safe_addstr(self.stdscr, 0, max_x - 10, now,
                    cp(C_HEADER) | curses.A_BOLD)

        # Sous-titre centré
        if subtitle:
            sx = max(0, (max_x - len(subtitle)) // 2)
            safe_addstr(self.stdscr, 0, sx, subtitle, cp(C_DIM))

    def draw_nav_hint(self, hints: list):
        """Barre de navigation en bas (F-keys)."""
        from core.widgets import draw_fkey_bar
        draw_fkey_bar(self.stdscr, hints)
