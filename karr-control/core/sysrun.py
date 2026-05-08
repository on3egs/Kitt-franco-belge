"""
Helper subprocess — isolation totale du terminal curses.

Toujours utiliser ces fonctions au lieu de subprocess.* directement.
Garantit stdin=DEVNULL sur tous les appels → aucun outil ne peut
hériter du tty de curses et y afficher des codes ANSI.
"""
import subprocess
import os

# Environnement de base propre (hérité du processus principal)
_BASE_ENV = dict(os.environ)

# Kwargs communs à tous les appels système
_SAFE = dict(
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
)

_SAFE_ERR = dict(
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)


def run_out(cmd: list, timeout: float = 4.0, env: dict = None) -> str:
    """Lance cmd, retourne stdout (str). Ne lève jamais d'exception."""
    kw = dict(_SAFE)
    if env:
        kw["env"] = env
    try:
        r = subprocess.run(cmd, timeout=timeout, **kw)
        return r.stdout.decode(errors="replace")
    except subprocess.TimeoutExpired:
        return ""
    except Exception:
        return ""


def run_ok(cmd: list, timeout: float = 8.0, sudo: bool = False) -> bool:
    """Lance cmd, retourne True si code de retour = 0."""
    full_cmd = ["sudo", "-n", *cmd] if sudo else cmd
    try:
        subprocess.run(
            full_cmd, timeout=timeout,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except Exception:
        return False


def run_pipe(cmd: list, input_data: bytes, timeout: float = 20.0, env: dict = None) -> str:
    """
    Lance cmd avec données sur stdin (mode batch/pipe).
    Utilisé pour les outils interactifs comme bluetoothctl :
    en recevant stdin depuis un PIPE (pas un tty), ils passent
    en mode non-interactif et n'émettent aucun code ANSI.
    """
    kw: dict = dict(
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if env:
        kw["env"] = env
    try:
        r = subprocess.run(cmd, input=input_data, timeout=timeout, **kw)
        return r.stdout.decode(errors="replace")
    except subprocess.TimeoutExpired:
        return ""
    except Exception:
        return ""
