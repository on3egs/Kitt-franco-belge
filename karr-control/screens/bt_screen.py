"""
Menu Bluetooth — scan, connexion, déconnexion.

IMPORTANT : tous les subprocess utilisent stdin=DEVNULL + stdout=PIPE.
Sans ça, bluetoothctl hérite du tty de curses et pollue l'affichage.
"""
import curses
import subprocess
import threading
import time
import re
import os
from core.app     import BaseScreen
from core.colors  import cp, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED
from core.widgets import safe_addstr, draw_box

# Environnement propre pour les appels bluetooth (isole du tty curses)
_BT_ENV = dict(os.environ)
_BT_ENV.setdefault("DBUS_SYSTEM_BUS_ADDRESS", "unix:path=/run/dbus/system_bus_socket")

# Tous les appels subprocess BT doivent utiliser ces kwargs
_SAFE_KW = dict(
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    env=_BT_ENV,
)


def _run(cmd: list, timeout: float = 3.0) -> str:
    """Lance une commande BT en isolation totale du terminal. Retourne stdout."""
    try:
        r = subprocess.run(cmd, timeout=timeout, **_SAFE_KW)
        return r.stdout.decode(errors="replace")
    except subprocess.TimeoutExpired:
        return ""
    except Exception:
        return ""


def _run_sudo(cmd: list, timeout: float = 8.0) -> bool:
    """Lance une commande sudo sans interaction terminal."""
    try:
        subprocess.run(
            ["sudo", "-n", *cmd],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=True,
        )
        return True
    except Exception:
        return False


class BluetoothScreen(BaseScreen):
    name = "bluetooth"

    def __init__(self, app):
        super().__init__(app)
        self._sel       = 0
        self._devices   = []
        self._status    = "Appuyez sur [S] pour scanner"
        self._scanning  = False
        self._bt_on     = False
        self._busy      = False

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def on_show(self):
        threading.Thread(target=self._refresh, daemon=True, name="bt-refresh").start()

    # ── Refresh état ──────────────────────────────────────────────────────

    def _refresh(self):
        """Rafraîchit l'état BT et la liste des appareils (thread-safe)."""
        # État de l'adaptateur via hciconfig (ne nécessite pas le daemon)
        hci_out = _run(["hciconfig", "hci0"], timeout=2)
        self._bt_on = bool(hci_out and "UP" in hci_out)

        if not self._bt_on:
            self._devices = []
            return

        # Appareils couplés via bluetoothctl — timeout court
        paired = _run(["bluetoothctl", "paired-devices"], timeout=3)
        devices = []
        for line in paired.splitlines():
            line = line.strip()
            # Format : "Device XX:XX:XX:XX:XX:XX Nom"
            m = re.match(r"Device\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
            if m:
                mac  = m.group(1)
                name = m.group(2).strip() or mac
                connected = self._is_connected_fast(mac)
                devices.append({"mac": mac, "name": name, "connected": connected})

        self._devices = devices

    def _is_connected_fast(self, mac: str) -> bool:
        """Vérifie connexion via hcitool con (rapide, sans daemon)."""
        out = _run(["hcitool", "con"], timeout=2)
        return mac.upper() in out.upper()

    # ── DRAW ──────────────────────────────────────────────────────────────

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("BLUETOOTH CONTROL", "Scan · Connexion · Audio")

        # ── Barre statut ──────────────────────────────────────────────────
        bt_str = "ACTIF  ●" if self._bt_on else "INACTIF ○  [A] pour activer"
        bt_col = cp(C_OK) | curses.A_BOLD if self._bt_on else cp(C_ERROR)
        draw_box(s, 1, 1, 4, w-2, "ÉTAT BLUETOOTH")
        safe_addstr(s, 2, 3, "Adaptateur : hci0  MAC: 58:02:05:DD:C2:F2    ", cp(C_DIM))
        safe_addstr(s, 3, 3, "État       : ", cp(C_DIM))
        safe_addstr(s, 3, 16, bt_str, bt_col)

        # ── Statut opération courante ─────────────────────────────────────
        scan_str = " ⟳ SCAN EN COURS..." if self._scanning else ""
        busy_str = " ⟳ " + self._status if self._busy else ""
        status_line = scan_str or busy_str or self._status
        status_col  = cp(C_WARN) | curses.A_BOLD if (self._scanning or self._busy) else cp(C_DIM)
        safe_addstr(s, 5, 3, status_line[:w-6], status_col)

        # ── Liste périphériques ───────────────────────────────────────────
        list_y  = 6
        max_dev = min(len(self._devices), h - list_y - 5)
        box_h   = max(3, max_dev + 2)
        draw_box(s, list_y, 1, box_h, w-2, "PÉRIPHÉRIQUES COUPLÉS")

        if not self._devices:
            msg = "Aucun appareil couplé" if self._bt_on else "BT inactif — appuyez [A]"
            safe_addstr(s, list_y+1, 3, msg, cp(C_DIM))
        else:
            for i, dev in enumerate(self._devices[:max_dev]):
                row = list_y + 1 + i
                dot     = "●" if dev["connected"] else "○"
                dot_col = cp(C_OK) | curses.A_BOLD if dev["connected"] else cp(C_DIM)
                name    = dev["name"][:max(1, w-28)]
                mac     = dev["mac"]

                if i == self._sel:
                    safe_addstr(s, row, 2, " " * (w-4), cp(C_SELECTED))
                    safe_addstr(s, row, 3, f" ► {dot} {name:<30}  {mac}", cp(C_SELECTED) | curses.A_BOLD)
                else:
                    safe_addstr(s, row, 3, f"   ", cp(C_DIM))
                    safe_addstr(s, row, 6, dot, dot_col)
                    safe_addstr(s, row, 8, f"{name:<30}  {mac}", cp(C_DEFAULT))

        # ── Aide touches ──────────────────────────────────────────────────
        help_y = list_y + box_h + 1
        if help_y < h - 2:
            draw_box(s, help_y, 1, 3, w-2, "COMMANDES")
            cmds = "[A] Activer  [D] Désactiver  [S] Scanner  [C] Connecter  [X] Déconnecter  [R] Rafraîchir"
            safe_addstr(s, help_y+1, 3, cmds[:w-6], cp(C_DIM))

        # Appareils connus en mémoire
        from config import BT_DEVICES
        mem_y = help_y + 3
        if mem_y < h - 2 and BT_DEVICES:
            draw_box(s, mem_y, 1, min(len(BT_DEVICES)+2, h-mem_y-1), w-2, "APPAREILS CONNUS")
            for i, (mac, name) in enumerate(BT_DEVICES.items()):
                row = mem_y + 1 + i
                if row >= h-1:
                    break
                connected = self._is_connected_fast(mac)
                dot     = "●" if connected else "○"
                dot_col = cp(C_OK) if connected else cp(C_DIM)
                safe_addstr(s, row, 3, f"{dot} {name:<24}  {mac}", cp(C_DEFAULT))
                safe_addstr(s, row, 3, dot, dot_col)

        self.draw_nav_hint([("↑↓","SÉLECT"), ("A","ACTIVER"), ("D","DÉSACT"),
                             ("S","SCAN"), ("C","CONNECT"), ("X","DÉCO"),
                             ("R","REFRESH"), ("ESC","RETOUR")])
        s.noutrefresh()

    # ── HANDLE_KEY ────────────────────────────────────────────────────────

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}

        nav = {
            curses.KEY_UP:   lambda: self._move(-1),
            curses.KEY_DOWN: lambda: self._move(+1),
        }
        actions = {
            ord('a'): lambda: self._bt_power(True),
            ord('A'): lambda: self._bt_power(True),
            ord('d'): lambda: self._bt_power(False),
            ord('D'): lambda: self._bt_power(False),
            ord('s'): self._scan,
            ord('S'): self._scan,
            ord('c'): self._connect_sel,
            ord('C'): self._connect_sel,
            ord('x'): self._disconnect_sel,
            ord('X'): self._disconnect_sel,
            ord('r'): lambda: threading.Thread(
                target=self._refresh, daemon=True).start(),
            ord('R'): lambda: threading.Thread(
                target=self._refresh, daemon=True).start(),
        }

        if key in nav:
            nav[key]()
        elif key in actions:
            actions[key]()

        return None

    def _move(self, delta: int):
        if self._devices:
            self._sel = max(0, min(len(self._devices)-1, self._sel + delta))

    # ── Activation BT ────────────────────────────────────────────────────

    def _bt_power(self, on: bool):
        if self._busy:
            return
        self._busy  = True
        self._status = "Activation BT..." if on else "Désactivation BT..."
        threading.Thread(
            target=self._do_bt_power, args=(on,),
            daemon=True, name="bt-power"
        ).start()

    def _do_bt_power(self, on: bool):
        try:
            if on:
                # Démasquer + démarrer le service
                _run_sudo(["systemctl", "unmask", "bluetooth.service"])
                _run_sudo(["systemctl", "start",  "bluetooth.service"], timeout=10)
                time.sleep(1.5)
                _run_sudo(["hciconfig", "hci0", "up"])
                time.sleep(0.5)
                self._status = "Bluetooth activé"
            else:
                _run_sudo(["hciconfig", "hci0", "down"])
                self._status = "Bluetooth désactivé"
        except Exception as e:
            self._status = f"Erreur: {e}"
        finally:
            self._busy = False
            self._refresh()

    # ── Scan ─────────────────────────────────────────────────────────────

    def _scan(self):
        if self._scanning or not self._bt_on:
            if not self._bt_on:
                self._status = "BT inactif — appuyez [A] pour activer"
            return
        self._scanning = True
        self._status   = "Scan en cours (10s)..."
        threading.Thread(
            target=self._do_scan, daemon=True, name="bt-scan"
        ).start()

    def _do_scan(self):
        """
        Scan via hcitool scan (isolation totale du terminal curses).
        hcitool ne nécessite pas le daemon bluez et n'accède jamais au tty.
        """
        found = []
        try:
            # Scan classique (appareils visibles) — 10 secondes max
            r = subprocess.run(
                ["hcitool", "scan", "--flush"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=15,
                env=_BT_ENV,
            )
            out = r.stdout.decode(errors="replace")
            for line in out.splitlines():
                line = line.strip()
                m = re.match(r"([0-9A-Fa-f:]{17})\s+(.*)", line)
                if m:
                    mac  = m.group(1)
                    name = m.group(2).strip() or mac
                    connected = self._is_connected_fast(mac)
                    found.append({"mac": mac, "name": name, "connected": connected})
        except subprocess.TimeoutExpired:
            pass
        except Exception as e:
            self._status = f"Erreur scan: {e}"
            self._scanning = False
            return

        # Fusionner avec les appareils déjà couplés
        existing_macs = {d["mac"].upper() for d in self._devices}
        for dev in found:
            if dev["mac"].upper() not in existing_macs:
                self._devices.append(dev)

        count = len(found)
        self._status   = f"Scan terminé — {count} appareil(s) trouvé(s)"
        self._scanning = False

    # ── Connexion / Déconnexion ───────────────────────────────────────────

    def _connect_sel(self):
        if not self._devices or self._sel >= len(self._devices) or self._busy:
            return
        mac = self._devices[self._sel]["mac"]
        self._busy   = True
        self._status = f"Connexion → {mac}..."
        threading.Thread(
            target=self._do_connect, args=(mac,),
            daemon=True, name="bt-connect"
        ).start()

    def _do_connect(self, mac: str):
        """
        Connexion via bluetoothctl en mode non-interactif (stdin=DEVNULL).
        bluetoothctl accepte les commandes depuis un script quand stdin n'est
        pas un tty — pas d'interface readline, pas de codes ANSI émis.
        """
        try:
            # Utiliser un heredoc via sh pour forcer le mode non-interactif
            script = f"connect {mac}\n"
            r = subprocess.run(
                ["bluetoothctl"],
                input=script.encode(),
                stdin=subprocess.PIPE,    # PIPE (pas tty) → mode batch
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=20,
                env=_BT_ENV,
            )
            out = r.stdout.decode(errors="replace")
            if "Connected: yes" in out or "successful" in out.lower():
                self._status = f"✓ Connecté : {mac}"
            else:
                self._status = f"✗ Échec connexion {mac}"
        except subprocess.TimeoutExpired:
            self._status = f"Timeout connexion {mac}"
        except Exception as e:
            self._status = f"Erreur: {e}"
        finally:
            self._busy = False
            self._refresh()

    def _disconnect_sel(self):
        if not self._devices or self._sel >= len(self._devices) or self._busy:
            return
        mac = self._devices[self._sel]["mac"]
        self._busy   = True
        self._status = f"Déconnexion {mac}..."
        threading.Thread(
            target=self._do_disconnect, args=(mac,),
            daemon=True, name="bt-disconnect"
        ).start()

    def _do_disconnect(self, mac: str):
        try:
            script = f"disconnect {mac}\n"
            subprocess.run(
                ["bluetoothctl"],
                input=script.encode(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=10,
                env=_BT_ENV,
            )
            self._status = f"Déconnecté : {mac}"
        except Exception as e:
            self._status = f"Erreur: {e}"
        finally:
            self._busy = False
            self._refresh()
