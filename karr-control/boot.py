"""Écran de démarrage rétro-futuriste KARR — animation séquentielle."""
import curses
import time
import threading
from core.colors import cp, C_DEFAULT, C_TITLE, C_DIM, C_OK, C_WARN, C_ERROR, C_BORDER, C_ALERT
from core.widgets import safe_addstr, draw_box

# Logo KARR ASCII
LOGO = [
    r" ██╗  ██╗ █████╗ ██████╗ ██████╗ ",
    r" ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗",
    r" █████╔╝ ███████║██████╔╝██████╔╝",
    r" ██╔═██╗ ██╔══██║██╔══██╗██╔══██╗",
    r" ██║  ██╗██║  ██║██║  ██║██║  ██║",
    r" ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝",
]

SUBTITLE = "KINETIC YIELDING RESPONSIVE ONBOARD NEURAL EXPERT"
VERSION  = "SYSTEM v3.1 — ORIN NANO SUPER 8GB — JETPACK 6.2"

# Séquence de démarrage
BOOT_SEQUENCE = [
    ("KERNEL INTERFACE",      True,  0.04),
    ("CUDA 12.6 DRIVER",      True,  0.05),
    ("AUDIO SUBSYSTEM",       True,  0.06),
    ("PULSEAUDIO DAEMON",     True,  0.04),
    ("HK MIC ARRAY [8CH]",    True,  0.07),
    ("TTS ENGINE [PIPER GPU]",True,  0.08),
    ("STT ENGINE [WHISPER]",  True,  0.06),
    ("NETWORK INTERFACE",     True,  0.05),
    ("BLUETOOTH STACK",       True,  0.04),
    ("LLM CORE [GEMMA-4-E2B]",True,  0.10),
    ("AI PERSONALITY MATRIX", True,  0.08),
    ("KYRONEX SERVER",        True,  0.06),
    ("CONTROL CENTER UI",     True,  0.03),
]


class BootScreen:
    def __init__(self, stdscr):
        self.stdscr = stdscr

    def run(self):
        stdscr = self.stdscr
        stdscr.nodelay(False)
        curses.curs_set(0)

        max_y, max_x = stdscr.getmaxyx()

        # ── Phase 1 : logo ────────────────────────────────────────────────
        stdscr.clear()
        self._draw_scanlines(stdscr, max_y, max_x)
        self._draw_logo(stdscr, max_y, max_x)
        self._draw_subtitle(stdscr, max_y, max_x)
        stdscr.refresh()
        time.sleep(0.4)

        # ── Phase 2 : séquence de boot ────────────────────────────────────
        box_h = len(BOOT_SEQUENCE) + 6
        box_w = 52
        box_y = max_y // 2 - box_h // 2 + 3
        box_x = max_x // 2 - box_w // 2

        draw_box(stdscr, box_y, box_x, box_h, box_w,
                 "SYSTEM INITIALIZATION",
                 cp(C_BORDER), cp(C_TITLE) | curses.A_BOLD)

        # En-tête
        safe_addstr(stdscr, box_y + 1, box_x + 2,
                    "KARR CONTROL CENTER — BOOT SEQUENCE",
                    cp(C_DIM))
        safe_addstr(stdscr, box_y + 2, box_x + 2,
                    "─" * (box_w - 4), cp(C_BORDER))

        stdscr.refresh()

        for i, (label, ok, delay) in enumerate(BOOT_SEQUENCE):
            row = box_y + 3 + i

            # Animation dots
            for d in range(3):
                dots = "." * (d + 1) + " " * (2 - d)
                safe_addstr(stdscr, row, box_x + 2,
                            f"  {label:<30}  [{dots}]",
                            cp(C_DEFAULT))
                stdscr.refresh()
                time.sleep(delay / 3)

                # Vérifier ESC pour passer le boot
                stdscr.nodelay(True)
                k = stdscr.getch()
                stdscr.nodelay(False)
                if k == 27:  # ESC
                    self._finish_all(stdscr, box_y, box_x, box_h, box_w)
                    return

            # Résultat
            status = "[ OK ]" if ok else "[FAIL]"
            color  = cp(C_OK) | curses.A_BOLD if ok else cp(C_ERROR) | curses.A_BOLD
            safe_addstr(stdscr, row, box_x + 2,
                        f"  {label:<30}  ",
                        cp(C_DEFAULT))
            safe_addstr(stdscr, row, box_x + 2 + 34, status, color)
            stdscr.refresh()

        # ── Phase 3 : message final ───────────────────────────────────────
        time.sleep(0.2)
        final_row = box_y + box_h - 2
        msg = "[ ALL SYSTEMS OPERATIONAL ]"
        mx = box_x + (box_w - len(msg)) // 2
        safe_addstr(stdscr, final_row, mx, msg,
                    cp(C_OK) | curses.A_BOLD | curses.A_BLINK)
        stdscr.refresh()
        time.sleep(1.0)

        # ── Phase 4 : fade out ────────────────────────────────────────────
        stdscr.nodelay(True)
        stdscr.clear()
        stdscr.refresh()
        stdscr.nodelay(False)

    def _finish_all(self, stdscr, by, bx, bh, bw):
        """Marque tous les items OK instantanément (si ESC pressé)."""
        for i, (label, ok, _) in enumerate(BOOT_SEQUENCE):
            row = by + 3 + i
            status = "[ OK ]"
            safe_addstr(stdscr, row, bx + 2, f"  {label:<30}  ", cp(C_DEFAULT))
            safe_addstr(stdscr, row, bx + 2 + 34, status, cp(C_OK) | curses.A_BOLD)
        stdscr.refresh()
        time.sleep(0.3)
        stdscr.clear()
        stdscr.refresh()

    def _draw_logo(self, stdscr, max_y: int, max_x: int):
        logo_w = max(len(l) for l in LOGO)
        ly = max(1, max_y // 2 - len(LOGO) - 6)
        lx = max(0, (max_x - logo_w) // 2)

        for i, line in enumerate(LOGO):
            safe_addstr(stdscr, ly + i, lx, line,
                        cp(C_ALERT) | curses.A_BOLD)

    def _draw_subtitle(self, stdscr, max_y: int, max_x: int):
        ly = max(1, max_y // 2 - len(LOGO) + 1)

        # Subtitle centré
        sx = max(0, (max_x - len(SUBTITLE)) // 2)
        safe_addstr(stdscr, ly, sx, SUBTITLE,
                    cp(C_TITLE) | curses.A_DIM)

        # Version centré
        vx = max(0, (max_x - len(VERSION)) // 2)
        safe_addstr(stdscr, ly + 2, vx, VERSION, cp(C_DIM))

    def _draw_scanlines(self, stdscr, max_y: int, max_x: int):
        """Lignes de scan légères sur lignes paires."""
        for row in range(0, max_y, 2):
            try:
                stdscr.addstr(row, 0, " " * (max_x - 1), cp(C_BORDER) | curses.A_DIM)
            except curses.error:
                pass
