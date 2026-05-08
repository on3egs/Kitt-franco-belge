#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║   K A R R   C O N T R O L   C E N T E R   v3.1                 ║
║   KINETIC YIELDING RESPONSIVE ONBOARD NEURAL EXPERT             ║
║                                                                  ║
║   Par : Manix & Claude — Jetson Orin Nano Super 8GB             ║
║   Licence MIT — 2026                                             ║
╚══════════════════════════════════════════════════════════════════╝

Usage :
    python3 main.py

Touches globales :
    F2-F10 : navigation menus
    Q      : quitter (depuis dashboard)
    ESC    : retour dashboard
    ESPACE : ouvrir console IA (depuis dashboard)
"""
import curses
import sys
import os
import traceback

# Ajouter le répertoire du script au path Python
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    # Forcer un terminal compatible couleurs
    if not os.environ.get("TERM"):
        os.environ["TERM"] = "xterm-256color"

    from core.app import KarrApp
    app = KarrApp()

    try:
        curses.wrapper(app.run)
    except KeyboardInterrupt:
        pass
    except Exception:
        # Restaurer terminal proprement avant d'afficher l'erreur
        try:
            curses.endwin()
        except Exception:
            pass
        print("\n" + "═" * 60, file=sys.stderr)
        print("  KARR CONTROL CENTER — ERREUR FATALE", file=sys.stderr)
        print("═" * 60, file=sys.stderr)
        traceback.print_exc()
        print("═" * 60, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
