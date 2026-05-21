"""Accueil vocal personnalise - generation de "Bonjour <prenom>" via ElevenLabs.

PREPARE - module autonome, PAS ENCORE cable a l'application. En attente de la
cle API ElevenLabs (Manix la fournira plus tard).

Principe : l'audio est genere UNE SEULE FOIS par prenom puis mis en cache dans
state/greetings/. Aux demarrages suivants on rejoue le fichier en cache, sans
aucun appel reseau.

Installation : aucune dependance supplementaire (utilise la lib standard
`urllib`). Il suffit de renseigner la cle API dans state/elevenlabs.json :

    {"api_key": "VOTRE_CLE_ELEVENLABS", "voice_id": "21m00Tcm4TlvDq8ikWAM"}
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

from . import paths

_CONFIG_FILE = paths.STATE_DIR / "elevenlabs.json"
_GREETING_DIR = paths.STATE_DIR / "greetings"

# Voix ElevenLabs par defaut (a ajuster selon le compte de Manix).
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
_API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


def _config() -> dict:
    """Lit state/elevenlabs.json (cle API + voice_id optionnel)."""
    try:
        return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def greeting_path(name: str) -> Path:
    """Chemin du fichier audio en cache pour ce prenom."""
    safe = "".join(c for c in name.lower() if c.isalnum()) or "user"
    return _GREETING_DIR / f"bonjour_{safe}.mp3"


def ensure_greeting(name: str) -> Path | None:
    """Retourne le MP3 "Bonjour <prenom>", genere via ElevenLabs si besoin.

    Genere une seule fois par prenom ; ensuite le cache est reutilise.
    Retourne None si la generation echoue (cle absente, hors ligne...).
    """
    name = (name or "").strip()
    if not name:
        return None

    out = greeting_path(name)
    if out.exists() and out.stat().st_size > 0:
        return out  # deja en cache : aucun appel API

    cfg = _config()
    key = str(cfg.get("api_key", "")).strip()
    if not key:
        return None  # cle API absente : accueil vocal indisponible
    voice_id = str(cfg.get("voice_id", "")).strip() or DEFAULT_VOICE_ID

    _GREETING_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({
        "text": f"Bonjour {name}.",
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode("utf-8")

    req = urllib.request.Request(
        _API_URL.format(voice_id=voice_id),
        data=payload,
        method="POST",
        headers={
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            audio = resp.read()
    except (urllib.error.URLError, OSError, ValueError):
        return None

    if not audio:
        return None
    out.write_bytes(audio)
    return out
