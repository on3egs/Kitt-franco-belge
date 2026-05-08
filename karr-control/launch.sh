#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  KARR CONTROL CENTER — Script de lancement
#  Assure : TERM, locale, chemins Python corrects
# ══════════════════════════════════════════════════════════════

export TERM="${TERM:-xterm-256color}"
export PYTHONIOENCODING=utf-8
export LANG="${LANG:-fr_FR.UTF-8}"
export LC_ALL="${LC_ALL:-fr_FR.UTF-8}"

# Variables PulseAudio session (nécessaires si lancé en TTY hors session)
if [ -z "$XDG_RUNTIME_DIR" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Vérifier Python3
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERREUR : python3 introuvable"
    exit 1
fi

exec python3 main.py "$@"
