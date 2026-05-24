"""Accueil vocal personnalise - "Bonjour <prenom>".

L'application salue l'utilisateur par son prenom au demarrage. L'audio est lu
depuis une banque MP3 pre-generee : aux lancements normaux, aucun calcul ni
appel reseau n'a lieu.

Deux emplacements de fichiers :
  - assets/greetings/  banque pre-generee, livree avec l'application (versionnee)
  - state/greetings/   cache local, pour un prenom absent de la banque

--- Generer la banque (methode principale : voix Guy Chapelier, locale) ---

    python3 scripts/generate_greetings.py

Synthetise "Bonjour <prenom>" pour chaque prenom de kyronext/prenoms.txt avec
Piper TTS et la voix Guy Chapelier (celle du serveur LLM KITT) : local, gratuit,
hors-ligne. Voir scripts/generate_greetings.py.

--- Repli : generation a la volee via ElevenLabs (prenom hors banque) ---

Si un prenom est absent de la banque, ensure_greeting() tente une synthese
ElevenLabs lorsque state/elevenlabs.json contient une cle API (modele :
elevenlabs.example.json). Sans cle, l'accueil vocal reste simplement silencieux.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import paths

_CONFIG_FILE = paths.STATE_DIR / "elevenlabs.json"
_BANK_DIR = paths.ASSETS_DIR / "greetings"     # banque livree avec l'application
_CACHE_DIR = paths.STATE_DIR / "greetings"     # cache genere a la volee
_NAMES_FILE = Path(__file__).resolve().parent / "prenoms.txt"

# Voix ElevenLabs de repli si state/elevenlabs.json n'en precise aucune.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
_API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


def _config() -> dict:
    """Lit state/elevenlabs.json (cle API + voice_id optionnel)."""
    try:
        return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _slug(name: str) -> str:
    """Identifiant de fichier sur pour un prenom (minuscules, alphanumerique)."""
    return "".join(c for c in name.lower() if c.isalnum()) or "user"


def greeting_path(name: str) -> Path | None:
    """Chemin du MP3 deja disponible pour ce prenom, ou None s'il n'existe pas.

    La banque livree (assets/) est prioritaire sur le cache local (state/).
    """
    slug = _slug(name)
    for directory in (_BANK_DIR, _CACHE_DIR):
        candidate = directory / f"bonjour_{slug}.mp3"
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    return None


def generic_greeting() -> Path | None:
    """Chemin du "Bonjour" generique (sans prenom), ou None s'il est absent.

    Sert de repli chaleureux quand le prenom n'est pas dans la banque.
    """
    for directory in (_BANK_DIR, _CACHE_DIR):
        candidate = directory / "bonjour.mp3"
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    return None


def _synthesize(text: str, key: str, voice_id: str) -> bytes | None:
    """Appelle ElevenLabs et retourne l'audio MP3, ou None en cas d'echec."""
    payload = json.dumps({
        "text": text,
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
    return audio or None


def ensure_greeting(name: str) -> Path | None:
    """Retourne le MP3 "Bonjour <prenom>", en le generant via ElevenLabs au besoin.

    Genere une seule fois par prenom (cache dans state/greetings/). Retourne
    None si la generation echoue (cle absente, hors ligne...).
    """
    name = (name or "").strip()
    if not name:
        return None

    existing = greeting_path(name)
    if existing is not None:
        return existing  # banque ou cache : aucun appel reseau

    cfg = _config()
    key = str(cfg.get("api_key", "")).strip()
    if not key:
        return generic_greeting()  # pas de cle : repli sur le "Bonjour" generique
    voice_id = str(cfg.get("voice_id", "")).strip() or DEFAULT_VOICE_ID

    audio = _synthesize(f"Bonjour {name}.", key, voice_id)
    if audio is None:
        return generic_greeting()  # echec ElevenLabs : repli sur le generique

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = _CACHE_DIR / f"bonjour_{_slug(name)}.mp3"
    out.write_bytes(audio)
    return out


def load_names() -> list[str]:
    """Liste des prenoms de kyronext/prenoms.txt (lignes vides et # ignores)."""
    try:
        lines = _NAMES_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    names: list[str] = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith("#"):
            names.append(line)
    return names


def batch_generate(names: list[str] | None = None) -> int:
    """Genere la banque assets/greetings/ pour une liste de prenoms.

    Les prenoms deja presents sont ignores : la commande est relançable. Retourne
    le nombre de fichiers crees lors de cet appel.
    """
    if names is None:
        names = load_names()
    if not names:
        print("Aucun prenom a generer (kyronext/prenoms.txt vide ou absent).")
        return 0

    cfg = _config()
    key = str(cfg.get("api_key", "")).strip()
    if not key:
        print("Cle API absente. Renseignez state/elevenlabs.json :")
        print('    {"api_key": "VOTRE_CLE", "voice_id": "VOTRE_VOICE_ID"}')
        return 0
    voice_id = str(cfg.get("voice_id", "")).strip() or DEFAULT_VOICE_ID

    _BANK_DIR.mkdir(parents=True, exist_ok=True)
    created = 0
    total = len(names)
    for i, name in enumerate(names, start=1):
        out = _BANK_DIR / f"bonjour_{_slug(name)}.mp3"
        if out.exists() and out.stat().st_size > 0:
            print(f"[{i}/{total}] {name} - deja present, ignore")
            continue
        audio = _synthesize(f"Bonjour {name}.", key, voice_id)
        if audio is None:
            print(f"[{i}/{total}] {name} - ECHEC (reseau ou cle invalide)")
            continue
        out.write_bytes(audio)
        created += 1
        print(f"[{i}/{total}] {name} - OK ({len(audio)} octets)")
        time.sleep(0.4)  # courtoisie envers l'API

    print(f"\nTermine : {created} nouveau(x) fichier(s). Banque : {_BANK_DIR}")
    return created


if __name__ == "__main__":
    batch_generate()
