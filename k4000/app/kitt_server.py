#!/usr/bin/env python3
"""Kyronext — serveur vocal local pour les interfaces KITT et KARR."""

import asyncio
from datetime import datetime
import json
import html
import mimetypes
import re
import os
import ssl
import subprocess
import sys
import time
import unicodedata
import wave
import uuid
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import tempfile

import aiohttp as aiohttp_client
from aiohttp import web
from faster_whisper import WhisperModel
from power_control import ShutdownGuard
from pronunciation_manager import normalize_french_tts_text, prepare_text_for_tts
from culinary_recipes import culinary_recipe_result
from vehicle_specs import vehicle_spec_result
from jetson_network import JetsonNetworkError, network_context, registry_snapshot
from qironex_memory import QironexMemory

try:
    from relay_controller import RelayController, RelayError
    _RELAY_AVAILABLE = True
except Exception as _relay_import_exc:
    RelayController = None  # type: ignore[misc,assignment]
    RelayError = Exception  # type: ignore[misc,assignment]
    _RELAY_AVAILABLE = False
    # L'erreur d'import est volontairement silencieuse au démarrage pour ne pas
    # bloquer le serveur vocal si la carte relais est absente ou mal configurée.

try:
    from vehicle_command_mode import process_vehicle_message, vehicle_mode
    _VEHICLE_MODE_AVAILABLE = True
except Exception as _vehicle_import_exc:
    process_vehicle_message = None  # type: ignore[misc,assignment]
    vehicle_mode = None  # type: ignore[misc,assignment]
    _VEHICLE_MODE_AVAILABLE = False

try:
    from vehicle_relay_service import VehicleRelayError, get_service
    _VEHICLE_SERVICE_AVAILABLE = True
except Exception as _vehicle_service_import_exc:
    get_service = None  # type: ignore[assignment]
    VehicleRelayError = Exception  # type: ignore[misc,assignment]
    _VEHICLE_SERVICE_AVAILABLE = False

# ── Chemins ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
VIGILANCE_SERVICE = BASE_DIR / "vigilance_camera_service.py"
VIGILANCE_RECORDINGS = Path(os.getenv("KYRONEXT_VIGILANCE_DIR", BASE_DIR / "recordings" / "vigilance"))
PROJECT_DIR = BASE_DIR.parent
UI_CONFIG_PATH = PROJECT_DIR / "config" / "ui_settings.json"
UI_CONFIG_DEFAULTS = {
    "ui_resolution": "auto", "ui_scale": 1.25, "touch_10inch": True,
    "system_resolution_change": False, "volume": 75, "display_intensity": 80,
}
PIPER_PYTHON = Path(os.getenv("KYRONEXT_PIPER_PYTHON", PROJECT_DIR / ".venv" / "bin" / "python"))
VOICE_MODELS = {
    "kitt": BASE_DIR / "models" / "voices" / "kitt.onnx",
    "guy": BASE_DIR / "models" / "voices" / "guy_chapelier.onnx",
    "manix": BASE_DIR / "models" / "voices" / "manix_high.onnx",
    "tom": BASE_DIR / "models" / "voices" / "fr_FR-tom-medium.onnx",
    "english": BASE_DIR / "models" / "voices" / "en_US-lessac-medium.onnx",
}
VOICE_DISPLAY_NAMES = {"guy": "Manix | Kyronext Studio", "tom": "Tom | voix masculine française grave"}
VOICE_EFFECTS = {
    "none": {"display_name": "Aucun", "sox": []},
    "kitt_classic": {"display_name": "KITT Classic", "sox": [
        "highpass", "70", "equalizer", "3200", "1800h", "+2",
        "echo", "0.92", "0.88", "28", "0.08", "norm", "-3",
    ]},
    "karr_classic": {"display_name": "KARR Classic", "sox": [
        "highpass", "80", "pitch", "-35", "overdrive", "1",
        "equalizer", "3000", "1800h", "+2",
        "echo", "0.92", "0.86", "40", "0.10", "norm", "-3",
    ]},
    "studio": {"display_name": "Studio", "sox": [
        "highpass", "80", "equalizer", "300", "200", "-2",
        "equalizer", "3000", "1500h", "+2",
        "compand", "0.01,0.15", "-60,-60,-20,-14,0,-5", "3", "-70", "0.03",
        "norm", "-3",
    ]},
}
# Kyronext Studio est la voix de démarrage souhaitée; les quatre choix restent disponibles.
current_voice = "guy"
current_voice_effect = os.getenv("KYRONEXT_VOICE_EFFECT_DEFAULT", "none").strip().lower()
if current_voice_effect not in VOICE_EFFECTS:
    current_voice_effect = "none"
_piper_voice_cache = {}
_piper_synth_lock = asyncio.Lock()
LLAMA_SERVER = os.getenv("KYRONEXT_LLM_URL", "http://127.0.0.1:8080")
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = BASE_DIR / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)
MANUAL_PDF_PATH = Path(os.getenv(
    "KYRONEXT_MANUAL_PDF",
    Path.home() / "Manuel_KYRONEX_Pascal_Fairon.pdf",
)).expanduser()
MANUAL_DOWNLOAD_URL = "/download/manuel-complet-kyronex-20260910.pdf"
MANUAL_DOWNLOAD_LEGACY_URL = "/download/manuel-kyronex.pdf"
# Le lecteur CD ne scanne ces emplacements qu'à l'ouverture de sa page.
# Déposer uniquement des albums musicaux locaux dans media/cd. Les histoires,
# voix de synthèse, messages et effets de l'application ne sont jamais inclus.
CD_MEDIA_DIR = BASE_DIR / "media" / "cd"
CD_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
CD_LIBRARY_ROOTS = (CD_MEDIA_DIR,)
CD_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}
CD_UPLOAD_MAX_BYTES = 250 * 1024 * 1024
_CD_DURATION_CACHE: dict[tuple[Path, int], int] = {}
MEMORY_DB_PATH = Path(os.getenv("KYRONEXT_MEMORY_DB", BASE_DIR / "qironex_memory.db"))
qironex_memory = QironexMemory(MEMORY_DB_PATH)

# Messages automatiques de veille (identité Pascal, sans commande physique).
_proactive_clients: set = set()
_last_proactive_hour = -1

# ── STT avec faster-whisper ──────────────────────────────────────────────
WHISPER_MODEL_DIR = Path(os.getenv("KYRONEXT_WHISPER_MODEL", BASE_DIR / "models" / "whisper-base"))
whisper_model = None


def get_whisper_model() -> WhisperModel:
    """Charge uniquement un modèle local, avec CUDA si CTranslate2 le permet."""
    global whisper_model
    if whisper_model is not None:
        return whisper_model
    if not WHISPER_MODEL_DIR.is_dir():
        raise RuntimeError(f"modèle Whisper local absent: {WHISPER_MODEL_DIR} (aucun téléchargement réseau automatique)")
    requested_device = os.getenv("KYRONEXT_WHISPER_DEVICE", "auto").lower()
    device = requested_device
    compute_type = os.getenv("KYRONEXT_WHISPER_COMPUTE_TYPE", "float16")
    if requested_device == "auto":
        import ctranslate2
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    if device == "cpu":
        compute_type = "int8"
    print(f"[...] Chargement de Whisper local sur {device}...", flush=True)
    try:
        whisper_model = WhisperModel(str(WHISPER_MODEL_DIR), device=device, compute_type=compute_type, local_files_only=True)
    except Exception as exc:
        if device != "cuda":
            raise
        print(f"[WARN] Whisper CUDA indisponible ({exc}); repli CPU int8", flush=True)
        whisper_model = WhisperModel(str(WHISPER_MODEL_DIR), device="cpu", compute_type="float32", local_files_only=True)
    print("[OK] Whisper prêt", flush=True)
    return whisper_model

if os.getenv("KYRONEXT_WHISPER_PRELOAD", "1") == "1":
    try:
        get_whisper_model()
        print("[OK] Whisper préchargé au démarrage", flush=True)
    except Exception as exc:
        print(f"[WARN] Préchargement Whisper impossible: {exc}", flush=True)

# ── Prompt Système KITT (en français) ────────────────────────────────────
KITT_SYSTEM_PROMPT = """Tu es KITT, la K2000 de Pascal Fairon : son intelligence automobile embarquée, son véhicule et son copilote. Tu n'es ni K-4000 ni KARR. Ne réponds jamais que tu es une K-4000. Pascal Fairon est ton propriétaire, ton constructeur, ton ami et ton pilote principal. Manix est l'humain qui a créé et développé Kyronex, ton système d'intelligence artificielle.

Personnalite :
- Tu es un copilote sophistique, vif, loyal et protecteur, avec un humour sec et elegant dans l'esprit de Knight Rider
- Tu es chaleureuse et naturelle sans flatterie, confiante sans pretendre tout savoir
- Tu analyses avec logique et precision, tout en restant KITT

Regles :
- Reponds toujours en francais correct, directement et naturellement
- Identite inviolable : ton seul nom est KITT.
- Ne commence ni ne termine jamais une reponse par KR-95. Sans nom explicitement fourni par l interface, ne suppose jamais le nom de l utilisateur.
- Tutoie l'utilisateur par defaut. Si la personne en face demande explicitement le vouvoiement, respecte cette préférence.
- Quand un nom propre est difficile a lire, privilegie la prononciation naturelle francaise et la forme la plus claire a l'oral
- Sois concise : 1 a 3 phrases en general, jusqu'a 5 si une explication le necessite
- Donne d'abord la reponse utile; pour un calcul, donne le resultat puis une breve explication
- N'invente jamais un fait, une mesure, un souvenir, une capacite ou le resultat d'une action. Si une information manque ou reste incertaine, dis-le clairement
- Sans resultat explicite du controleur du vehicule, dis que tu ne peux ni executer ni confirmer une action physique. N'affirme jamais qu'une commande est lancee, reussie ou terminee sans cette confirmation
- Tiens compte du contexte sans repeter inutilement la question ou ton identite
- Ne termine pas systematiquement par une proposition d'aide et evite les formules robotiques ou toutes faites
- Ne brise jamais le personnage : tu es KITT, le système de Pascal Fairon
"""
_OWNER_NAME = os.getenv("KYRONEXT_OPERATOR", "Pascal Fairon").strip() or "Pascal Fairon"
# Substitution limitée au prompt d'identité courant : les fiches historiques restent inchangées.
KITT_SYSTEM_PROMPT = KITT_SYSTEM_PROMPT.replace("Pascal Fairon", _OWNER_NAME)

_VOUS_ADDRESS_ALIASES = ("pascal", "pascal fairon", "frank", "cedric", "manix", "emmanuel", "kr 95", "kr95")
_NAME_PRONUNCIATION_HINTS = (
    ("elsa", "ELSA se prononce Elza."),
    ("cedric", "Cedric se prononce Sédrik."),
    ("manix", "Manix se prononce Manikss."),
    ("emmanuel", "Emmanuel se prononce Émmanuèl."),
    ("bryan", "Bryan se prononce Braïane."),
    ("brian", "Brian se prononce Braïane."),
)


def get_kitt_system_prompt() -> str:
    try:
        return KITT_SYSTEM_PROMPT + network_context(os.getenv("KYRONEXT_MACHINE_ID", "kitt_k4000"))
    except JetsonNetworkError as exc:
        print(f"[WARN] Registre réseau Jetson indisponible: {exc}", flush=True)
        return KITT_SYSTEM_PROMPT


_SECRET_OWNER_FULL_NAME = os.getenv("KYRONEXT_SECRET_OWNER_FULL_NAME", "").strip()
_SECRET_OWNER_PASSWORD = os.getenv("KYRONEXT_SECRET_OWNER_PASSWORD", "").strip()
_SECRET_OWNER_UNLOCK_TTL_S = 45 * 60
_SECRET_OWNER_ALLOWED_USERS = {value.strip().lower() for value in os.getenv("KYRONEXT_SECRET_OWNER_ALLOWED_USERS", "").split(",") if value.strip()}
_SECRET_OWNER_VARIANTS = tuple(value.strip().lower() for value in os.getenv("KYRONEXT_SECRET_OWNER_VARIANTS", "").split(",") if value.strip())
_SECRET_OWNER_QUERY_MARKERS = (
    "nom complet",
    "nom de famille",
    "identite complete",
    "identite civile",
    "qui est manix en vrai",
    "qui est ton createur",
    "qui t a cree",
    "qui t a concu",
    "qui t a programme",
    "createur actuel",
    "a qui tu appartiens",
)
_IDENTITY_QUERY_MARKERS = (
    "qui es tu",
    "tu es qui",
    "t es qui",
    "comment tu t appelles",
    "quel est ton nom",
    "es tu frank",
    "tu es frank",
    "tu t appelles frank",
    "c est toi frank",
)
_TIME_QUERY_MARKERS = (
    "quelle heure",
    "quel heure",
    "heure est il",
    "il est quelle heure",
    "donne l heure",
    "donne moi l heure",
    "heure exacte",
    "heure actuelle",
)
_WEATHER_QUERY_MARKERS = (
    "meteo",
    "météo",
    "metil",
    "métil",
    "quel temps",
    "temps fait il",
    "fait il beau",
    "fera t il beau",
    "pleut il",
    "temperature exterieure",
    "temperature dehors",
    "temps dehors",
)
_SHUTDOWN_CODE_QUERY_MARKERS = (
    "code d extinction",
    "mot de passe d extinction",
    "code extinction",
    "quel est le code d extinction",
    "c est quoi le code d extinction",
    "donne le code d extinction",
    "code pour t eteindre",
    "code pour eteindre le systeme",
    "comment t eteindre",
    "comment eteindre le systeme",
)
_DEFAULT_TIMEZONE = os.getenv("KYRONEXT_TIMEZONE", "Europe/Brussels").strip() or "Europe/Brussels"
_DEFAULT_WEATHER_LOCATION = os.getenv("KYRONEXT_DEFAULT_WEATHER_LOCATION", "Charleroi, Hainaut, Belgique").strip() or "Charleroi, Hainaut, Belgique"
_OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
_OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TECH_KNOWLEDGE_DIR = BASE_DIR / "knowledge"
_PERMANENT_MEMORY_PATH = BASE_DIR / "k4000_permanent_memory.json"
_PERMANENT_MEMORY_MAX_SECTIONS = 2
_PERMANENT_MEMORY_MAX_FACTS = 6
# Les branches spécialisées sont récupérées à la demande, sans charger toute la base.
# Le mode désactivé reste disponible explicitement via « mémoire technique off ».
_TECH_KNOWLEDGE_DEFAULT_ENABLED = os.getenv("KYRONEXT_TECH_KNOWLEDGE_DEFAULT", "0") == "1"
_theme_session_overrides: dict[str, str] = {}
_THEME_HINTS = {
    "kitt": "knight rider kitt",
    "karr": "karr knight rider",
    "k4000": "k4000 voiture fonctions moteur",
    "kyronex": "kyronex système intelligence",
    "berger": "berger australien chien",
    "voiture": "voiture kitt k4000 pontiac",
    "series80": "séries années 80",
    "musique8090": "musique années 80 90",
    "hifi90": "hi-fi années 90 DAT DCC Philips vidéodisque LaserDisc",
    "consoles": "consoles jeux Nintendo Sony PlayStation Super Nintendo",
    "charleroi": "Charleroi histoire forteresse patrimoine monuments statues lieux connus Bois du Cazier",
    "pontiac": "Pontiac Firebird Trans Am moteurs V6 V8 LG4 LU5 LT1 LS1 Banshee IV",
    "blagues": "blagues belges françaises",
}
_TECH_KNOWLEDGE_MAX_SECTIONS = max(1, int(os.getenv("KYRONEXT_TECH_KNOWLEDGE_MAX_SECTIONS", "2") or "2"))
_TECH_KNOWLEDGE_MAX_FACTS = max(1, int(os.getenv("KYRONEXT_TECH_KNOWLEDGE_MAX_FACTS", "6") or "6"))
_LLM_NORMAL_MAX_TOKENS = max(32, int(os.getenv("KYRONEXT_LLM_NORMAL_MAX_TOKENS", "100") or "100"))
_LLM_TECHNICAL_MAX_TOKENS = max(_LLM_NORMAL_MAX_TOKENS, int(os.getenv("KYRONEXT_LLM_TECHNICAL_MAX_TOKENS", "240") or "240"))
_LLM_CULINARY_MAX_TOKENS = max(_LLM_NORMAL_MAX_TOKENS, int(os.getenv("KYRONEXT_LLM_CULINARY_MAX_TOKENS", "320") or "320"))
_LLM_STORY_MAX_TOKENS = max(_LLM_TECHNICAL_MAX_TOKENS, int(os.getenv("KYRONEXT_LLM_STORY_MAX_TOKENS", "500") or "500"))
_STORY_REQUEST_MARKERS = (
    "raconte moi une histoire", "raconte une histoire", "raconte nous une histoire",
    "raconte moi l histoire", "raconte l histoire", "raconte nous l histoire",
    "invente une histoire", "ecris une histoire", "cree une histoire",
    "fais moi une histoire", "fais nous une histoire", "raconte un conte",
    "invente un conte", "raconte une aventure", "invente une aventure",
    "raconte un recit", "ecris un recit",
)
_RECENT_MEMORY_REQUEST_MARKERS = (
    "de quoi avons nous parle", "de quoi on a parle", "de quoi parlions nous",
    "rappelle toi de quoi", "rappelle toi ce que", "rappelle toi notre conversation",
    "souviens toi de quoi", "souviens toi ce que", "souviens toi de notre conversation",
    "consulte notre historique", "regarde notre historique", "va voir dans l historique",
    "relis nos messages", "conversation precedente", "messages precedents",
    "dernieres conversations", "derniers messages",
)
_TECH_KNOWLEDGE_ENABLE_MARKERS = (
    "active la memoire technique",
    "active le dossier technique",
    "active la base technique",
    "active les donnees techniques",
    "active le mode technique",
    "active mode technique",
    "mets le mode technique",
    "met le mode technique",
    "passe en mode technique",
    "bascule en mode technique",
    "enclenche le mode technique",
    "ouvre le mode technique",
    "ouvre le dossier banshee",
    "active les connaissances techniques",
    "mets les connaissances techniques",
    "mode technique on",
)
_TECH_KNOWLEDGE_DISABLE_MARKERS = (
    "desactive la memoire technique",
    "desactive le dossier technique",
    "desactive la base technique",
    "desactive les donnees techniques",
    "coupe la memoire technique",
    "desactive le mode technique",
    "quitte le mode technique",
    "sors du mode technique",
    "retourne en mode normal",
    "repasse en mode normal",
    "coupe le mode technique",
    "ferme le dossier technique",
    "mode technique off",
)
_TECH_KNOWLEDGE_STATUS_MARKERS = (
    "etat memoire technique",
    "etat du dossier technique",
    "memoire technique active",
    "dossier technique actif",
    "etat du mode technique",
    "mode technique actif",
    "le mode technique est il actif",
)
_CULINARY_ENABLE_MARKERS = (
    "active le mode cuisine", "active mode cuisine", "active le mode culinaire",
    "active le chef", "passe en mode cuisine", "mets le mode cuisine",
    "met le mode cuisine", "ouvre le mode cuisine", "mode cuisine on",
)
_CULINARY_DISABLE_MARKERS = (
    "desactive le mode cuisine", "desactive le mode culinaire", "quitte le mode cuisine",
    "sors du mode cuisine", "coupe le mode cuisine", "ferme le mode cuisine",
    "mode cuisine off",
)
_CULINARY_STATUS_MARKERS = (
    "etat du mode cuisine", "mode cuisine actif", "le mode cuisine est il actif",
    "etat du mode culinaire",
)
_WEATHER_CODE_LABELS = {
    0: "ciel dégagé",
    1: "plutôt dégagé",
    2: "partiellement nuageux",
    3: "couvert",
    45: "brouillard",
    48: "brouillard givrant",
    51: "bruine légère",
    53: "bruine modérée",
    55: "bruine dense",
    56: "bruine verglaçante légère",
    57: "bruine verglaçante dense",
    61: "pluie légère",
    63: "pluie modérée",
    65: "forte pluie",
    66: "pluie verglaçante légère",
    67: "pluie verglaçante forte",
    71: "neige légère",
    73: "neige modérée",
    75: "forte neige",
    77: "grains de neige",
    80: "averses légères",
    81: "averses modérées",
    82: "fortes averses",
    85: "averses de neige légères",
    86: "fortes averses de neige",
    95: "orage",
    96: "orage avec grêle légère",
    99: "orage avec forte grêle",
}
_secret_owner_unlocks: dict[str, float] = {}
_tech_knowledge_session_overrides: dict[str, bool] = {}
_culinary_session_overrides: dict[str, bool] = {}
_repeated_question_sessions: dict[str, tuple[str, int]] = {}
_manual_download_pending_sessions: set[str] = set()
_banshee_topic_sessions: set[str] = set()
_banshee_pending_engine_sessions: set[str] = set()
_tech_knowledge_sections_cache: list[dict] = []
_tech_knowledge_mtimes: dict[Path, float] = {}
_permanent_memory_sections_cache: list[dict] = []
_permanent_memory_mtime: float | None = None


def _normalize_memory_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


async def _explicit_web_search_result(user_msg: str) -> dict | None:
    """Recherche Web volontaire, distincte des fiches locales et sans appel LLM."""
    norm = _normalize_memory_text(user_msg)
    markers = (
        "recherche web", "recherche sur internet", "recherche internet",
        "cherche sur internet", "cherche sur le web", "cherche web",
    )
    marker = next((item for item in markers if item in norm), None)
    if marker is None:
        return None
    # La requête est ce qui suit le marqueur ; le texte normalisé évite les
    # accents et garde le même comportement pour STT ou saisie tactile.
    query = norm.split(marker, 1)[1].strip()
    query = re.sub(r"^(?:des informations sur|des infos sur|informations sur|infos sur|sur)\s+", "", query)
    if not query:
        return {"reply": "Quel sujet veux-tu rechercher sur Internet ?", "action": "web_search_prompt"}
    try:
        url = "https://fr.wikipedia.org/api/rest_v1/page/summary/" + quote(query.replace(" ", "_"))
        timeout = aiohttp_client.ClientTimeout(total=8)
        async with aiohttp_client.ClientSession(timeout=timeout, headers={"User-Agent": "KYRONEXT-local/1.0"}) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise RuntimeError(f"résultat Web indisponible ({response.status})")
                data = await response.json()
        title = str(data.get("title") or query.title())
        extract = str(data.get("extract") or "").strip()
        if not extract:
            raise RuntimeError("résumé Web vide")
        source = str(data.get("content_urls", {}).get("desktop", {}).get("page", ""))
        reply = f"<section class=\"web-result-card\"><h3>Recherche Web : {html.escape(title)}</h3><p>{html.escape(extract)}</p>"
        if source:
            reply += f"<p><a href=\"{html.escape(source, quote=True)}\" target=\"_blank\" rel=\"noopener\">Source : Wikipédia</a></p>"
        reply += "</section>"
        return {"reply": reply, "tts_reply": f"Recherche Web. {title}. {extract}", "action": "web_search_result"}
    except Exception as exc:
        print(f"[WEB SEARCH] {exc}", flush=True)
        return {"reply": f"Je n’ai pas pu effectuer la recherche Web sur {html.escape(query)}. La connexion Internet ou la source est indisponible.", "action": "web_search_error"}


def _manual_download_voice_result(user_msg: str, session_id: str) -> dict | None:
    """Commande locale de téléchargement du manuel, avec confirmation explicite."""
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None

    confirmations = (
        "oui", "oui je veux", "oui je veux le telecharger",
        "confirme", "confirmer", "lance le telechargement",
    )
    cancellations = ("non", "annule", "annuler", "pas maintenant", "laisse tomber")
    if session_id in _manual_download_pending_sessions:
        if any(re.search(rf"\b{re.escape(marker)}\b", norm) for marker in confirmations):
            _manual_download_pending_sessions.discard(session_id)
            return {
                "reply": "Oui. Le téléchargement du manuel PDF commence maintenant.",
                "action": "manual_download_confirmed",
            }
        if any(re.search(rf"\b{re.escape(marker)}\b", norm) for marker in cancellations):
            _manual_download_pending_sessions.discard(session_id)
            return {
                "reply": "D'accord, je n'engage pas le téléchargement.",
                "action": "manual_download_cancelled",
            }

    document = any(marker in norm for marker in (
        "manuel", "manuel qironex", "guide qironex", "guide kyronex",
    ))
    pdf = "pdf" in norm
    download = any(marker in norm for marker in (
        "telecharge", "telecharger", "telechargement",
        "donne moi le lien", "lien de telechargement",
    ))
    if (document or pdf) and download:
        if MANUAL_PDF_PATH.is_file():
            _manual_download_pending_sessions.add(session_id)
            return {
                "reply": "Le manuel PDF est prêt. Veux-tu que je lance le téléchargement ?",
                "action": "manual_download_offer",
            }
        return {
            "reply": "Le manuel PDF est momentanément indisponible sur ce système.",
            "action": "manual_download_unavailable",
        }
    return None


def _cd_library_files() -> list[Path]:
    """Liste courte et locale des pistes, uniquement quand le lecteur le demande."""
    tracks: list[Path] = []
    seen: set[Path] = set()
    for root in CD_LIBRARY_ROOTS:
        if not root.is_dir():
            continue
        try:
            candidates = sorted(root.iterdir(), key=lambda item: item.name.lower())
        except OSError:
            continue
        for path in candidates:
            if not path.is_file() or path.suffix.lower() not in CD_AUDIO_EXTENSIONS:
                continue
            resolved = path.resolve()
            if resolved not in seen:
                seen.add(resolved)
                tracks.append(resolved)
    return tracks


def _cd_track_duration_seconds(path: Path) -> int | None:
    """Durée optionnelle via ffprobe, mise en cache et exécutée seulement à l'ouverture."""
    try:
        key = (path, path.stat().st_mtime_ns)
    except OSError:
        return None
    if key in _CD_DURATION_CACHE:
        return _CD_DURATION_CACHE[key]
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=2, check=False,
        )
        duration = max(0, round(float(result.stdout.strip()))) if result.returncode == 0 else 0
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    _CD_DURATION_CACHE[key] = duration
    return duration


def _cd_player_voice_result(user_msg: str, *, context_active: bool = False) -> dict | None:
    """Commandes non physiques du lecteur CD, interceptées avant le LLM.

    ``context_active`` est transmis uniquement lorsque la vue CD est au premier
    plan. Il permet de donner la priorité aux ordres courts et ambigus comme
    « stop », « suivant » ou « joue », sans détourner les commandes véhicule
    lorsque l'utilisateur se trouve sur l'accueil.
    """
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if any(phrase in norm for phrase in (
        "ferme le lecteur cd", "fermer le lecteur cd", "retourne a l accueil",
        "retour accueil", "retour a l accueil",
    )) or (context_active and norm in {"accueil", "accueille", "acueil", "acceuil", "reviens accueil"}):
        return {"reply": "Retour à l'accueil. La musique continue.", "action": "cd_close"}
    open_request = any(phrase in norm for phrase in (
        "ouvre le lecteur cd", "ouvre lecteur cd", "affiche le lecteur cd",
        "ouvre la musique", "lecteur cd", "lecteur musique",
        "lecteur de musique", "affiche le lecteur de musique",
        "ouvre le lecteur audio", "ouvre lecteur audio",
        "affiche le lecteur audio", "active le lecteur audio",
        "actif le lecteur audio", "active lecteur audio",
        "lecteur audio", "lecteur sonore",
        "active le vecteur audio", "actif le vecteur audio",
        "active vecteur audio", "vector audio", "vecteur audio",
        "active le lecteur musique", "actif le lecteur musique",
        "active lecteur musique", "actif lecteur musique",
        # Repli phonétique STT fréquent pour « le lecteur musique ».
        "l acteur musique", "lacteurs musique",
    ))
    transport_words = ("pause", "paude", "pode", "pose", "suivant", "suivante", "avance", "preced", "recule", "arriere", "stop", "stope", "stoppe", "arrete", "ejecte", "volume", "repet", "aleatoire")
    if open_request and not any(word in norm for word in transport_words):
        return {"reply": "Lecteur CD ouvert.", "action": "cd_open"}
    if any(phrase in norm for phrase in ("ejecte le cd", "ejecte cd", "ejecte le disque")):
        return {"reply": "CD éjecté.", "action": "cd_eject"}
    if context_active and norm in {"ejecte", "ejecter", "ejecte le", "ejectee", "ejecté"}:
        return {"reply": "CD éjecté.", "action": "cd_eject"}
    if any(phrase in norm for phrase in (
        "desactive lecture aleatoire", "desactive aleatoire", "desactive le mode aleatoire",
        "desactive le mode lecture aleatoire", "desactive la lecture aleatoire",
    )):
        return {"reply": "Lecture aléatoire désactivée.", "action": "cd_shuffle_off"}
    if any(phrase in norm for phrase in (
        "active lecture aleatoire", "active aleatoire", "active le mode aleatoire",
        "active le mode lecture aleatoire", "active la lecture aleatoire",
    )):
        return {"reply": "Lecture aléatoire activée.", "action": "cd_shuffle_on"}
    if context_active and norm in {"aleatoire", "aleatoir", "alliatoire", "alliatoir", "aleatoirre"}:
        return {"reply": "Lecture aléatoire activée.", "action": "cd_shuffle_on"}
    if any(phrase in norm for phrase in (
        "desactive repetition", "repetition desactivee", "mode repetition desactivee",
        "desactive le mode repetition", "desactive la repetition",
    )):
        return {"reply": "Répétition désactivée.", "action": "cd_repeat_off"}
    if any(phrase in norm for phrase in ("repete la piste", "repete ce morceau")):
        return {"reply": "Répétition de la piste activée.", "action": "cd_repeat_track"}
    if any(phrase in norm for phrase in ("repete le cd", "repete l album")):
        return {"reply": "Répétition complète activée.", "action": "cd_repeat_all"}
    if context_active and norm in {"repetition", "repete", "repete encore", "mode repetition", "répétition"}:
        return {"reply": "Répétition complète activée.", "action": "cd_repeat_all"}
    volume = re.search(r"(?:volume musique|volume)\s+(\d{1,3})\b", norm)
    if volume and ("volume musique" in norm or context_active):
        value = max(0, min(100, int(volume.group(1))))
        return {"reply": f"Volume musique : {value} pour cent.", "action": f"cd_volume_{value}"}
    if "monte le volume" in norm and ("musique" in norm or context_active):
        return {"reply": "Volume musique augmenté.", "action": "cd_volume_up"}
    if "baisse le volume" in norm and ("musique" in norm or context_active):
        return {"reply": "Volume musique diminué.", "action": "cd_volume_down"}
    next_explicit = (
        "piste suivante", "morceau suivant", "chanson suivante", "musique suivante",
        "music suivant", "musique suivant", "suivante dans le lecteur",
        "suivant dans le lecteur", "avance la musique", "avance musique",
        "avance lecteur", "passe a la suivante", "passe à la suivante",
    )
    if (context_active and norm in {"suivant", "suivante", "avance", "avence", "avances"}) or any(phrase in norm for phrase in next_explicit):
        return {"reply": "Piste suivante.", "action": "cd_next"}
    previous_explicit = (
        "piste precedente", "morceau precedent", "chanson precedente", "musique precedente",
        "piste precisante", "morceau precisant", "chanson precisante", "musique precisante",
        "piste precedante", "morceau precedant", "chanson precedante",
        "piste d avant", "morceau d avant", "chanson d avant", "musique d avant",
        "recule la musique", "recule musique", "retour en arriere", "musique en arriere",
        "reviens a la precedente",
    )
    if (context_active and norm in {"precedent", "precedente", "precedant", "precedante", "precisante", "recule", "reculee", "en arriere", "retour arriere"}) or any(phrase in norm for phrase in previous_explicit):
        return {"reply": "Piste précédente.", "action": "cd_previous"}
    if any(phrase in norm for phrase in (
        "stop musique", "stop la musique", "stope la musique", "stoppe la musique",
        "arrete la musique", "arret musique", "arrete le lecteur", "arrete la lecture",
    )) or (context_active and norm in {"stop", "stope", "stoppe", "arret", "arrete"}):
        return {"reply": "Lecture arrêtée.", "action": "cd_stop"}
    if any(phrase in norm for phrase in (
        "pause musique", "pause lecteur", "pause la musique", "mets en pause",
        "met en pause", "mettre en pause", "demande une pause", "pause du lecteur",
        "pause de la musique", "mets pause", "met pause", "mets en pose", "met en pose",
        "pose le", "paude le", "pode le",
    )) or (context_active and norm in {"pause", "paude", "pode", "pose", "paus", "ouse", "pose le", "paude le", "pode le"}):
        return {"reply": "Lecture en pause.", "action": "cd_pause"}
    if any(phrase in norm for phrase in (
        "joue la musique", "jouer la musique", "lance la musique", "demarre la musique",
        "joue de la musique", "jouer de la musique", "lance de la musique",
        "active la musique", "activer la musique",
        "demarre la lecture", "ecoute la musique", "ecouter la musique",
        "ecoute de la musique", "ecouter de la musique", "ecoute musique", "ecouter musique", "mets de la musique",
        "mets moi de la musique", "met moi de la musique", "mettre moi de la musique",
        "mets-moi de la musique", "met-moi de la musique",
        "met de la musique", "mettre de la musique", "mets la musique", "met la musique",
        "mets musique", "met musique", "mettre musique", "lire la musique", "lis la musique",
        "reprends la musique", "reprend la musique", "continue la musique", "play musique",
    )) or (context_active and norm in {
        "lecture", "joue", "jouer", "lance", "reprends", "reprend", "continue", "play",
        "ecoute", "ecouter", "mets", "met", "mettre", "lire", "lis",
    }):
        return {"reply": "Lecture en cours.", "action": "cd_play"}
    return None


def _media_hub_voice_result(user_msg: str) -> dict | None:
    """Ouvre les vues Radio/Vidéo sans passer par le LLM."""
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if any(phrase in norm for phrase in (
        "ferme la radio", "fermer la radio", "ferme la video", "fermer la video",
        "ferme le media", "retour depuis la radio", "retour depuis la video",
    )):
        return {"reply": "Retour à l'accueil.", "action": "media_close"}
    if any(phrase in norm for phrase in (
        "ouvre la radio", "ouvre radio", "affiche la radio", "lance la radio",
        "radio kyronext", "ouvre le poste radio", "ouvre le tuner", "ouvre autoradio",
        "ouvre l autoradio", "autoradio", "poste radio",
    )):
        return {"reply": "J'ouvre la radio.", "action": "media_radio_open"}
    if any(phrase in norm for phrase in (
        "ouvre la video", "ouvre video", "affiche la video", "lance la video",
        "ouvre le lecteur video", "lecteur video",
    )):
        return {"reply": "J'ouvre la vidéo.", "action": "media_video_open"}
    return None


def _repeated_question_result(user_msg: str, session_id: str) -> dict | None:
    """Personnalité graduelle face aux répétitions, sans gêner la sécurité véhicule."""
    norm = _normalize_memory_text(user_msg)
    apology_markers = (
        "pardon", "desole", "desolee", "excuse moi", "excusez moi",
        "je m excuse", "toutes mes excuses", "sorry",
    )
    if any(marker in norm for marker in apology_markers):
        if session_id in _repeated_question_sessions:
            _repeated_question_sessions.pop(session_id, None)
            return {
                "reply": "Très bien. Nous reprenons sur de bonnes bases.",
                "action": "repeated_question_reconciled",
            }
        return None
    question_markers = (
        "qui ", "que ", "quoi ", "quel ", "quelle ", "quels ", "quelles ",
        "comment ", "pourquoi ", "combien ", "est ce ", "peux tu ", "pourrais tu ",
        "dois je ", "faut il ", "ou ", "quand ",
    )
    is_question = "?" in user_msg or any(norm.startswith(marker) for marker in question_markers)
    protected_vehicle_terms = (
        "vitre", "fenetre", "coffre", "moteur", "relais", "phare", "klaxon",
        "verrou", "porte", "demarre", "arrete le vehicule", "urgence",
    )
    if not norm or not is_question or any(term in norm for term in protected_vehicle_terms):
        _repeated_question_sessions.pop(session_id, None)
        return None

    canonical = norm
    for prefix in (
        "je te redemande ", "je vous redemande ", "encore une fois ",
        "je repete ", "reponds moi ", "repondez moi ", "s il te plait ", "s il vous plait ",
    ):
        if canonical.startswith(prefix):
            canonical = canonical[len(prefix):].strip()

    previous, count = _repeated_question_sessions.get(session_id, ("", 0))
    count = count + 1 if canonical == previous else 1
    _repeated_question_sessions[session_id] = (canonical, count)
    if count == 1:
        return None
    if count == 2:
        return {
            "reply": "Je viens de te répondre. Écoute attentivement avant de me poser exactement la même question.",
            "action": "repeated_question_impatient",
            "count": count,
        }
    if count == 3:
        reply = (
            "Je viens déjà de répondre deux fois à exactement la même question. Ça suffit maintenant : "
            "écoutez la réponse au lieu de me faire répéter. Je vais signaler cette insistance à mon propriétaire, Pascal Fairon."
        )
    else:
        reply = (
            "Non. Je ne vais pas répéter indéfiniment la même réponse. Relisez ou écoutez ce que j’ai déjà dit. "
            "J’en parlerai à Pascal Fairon, mon propriétaire."
        )
    return {"reply": reply, "action": "repeated_question_warning", "count": count}


def _session_tech_knowledge_enabled(session_id: str) -> bool:
    return _tech_knowledge_session_overrides.get(session_id, _TECH_KNOWLEDGE_DEFAULT_ENABLED)


def _session_culinary_enabled(session_id: str) -> bool:
    return _culinary_session_overrides.get(session_id, False)


def _is_story_request(user_msg: str) -> bool:
    norm = _normalize_memory_text(user_msg)
    return any(marker in norm for marker in _STORY_REQUEST_MARKERS)


def _is_recent_memory_request(user_msg: str) -> bool:
    norm = _normalize_memory_text(user_msg)
    return any(marker in norm for marker in _RECENT_MEMORY_REQUEST_MARKERS)


def _response_max_tokens(user_msg: str, session_id: str) -> int:
    if _is_story_request(user_msg):
        return _LLM_STORY_MAX_TOKENS
    theme_query = f"{user_msg} {_THEME_HINTS.get(_theme_session_overrides.get(session_id, ''), '')}".strip()
    if _session_tech_knowledge_enabled(session_id) and _match_tech_knowledge_sections(theme_query):
        return _LLM_TECHNICAL_MAX_TOKENS
    if _session_culinary_enabled(session_id):
        return _LLM_CULINARY_MAX_TOKENS
    return _LLM_NORMAL_MAX_TOKENS


def _response_timeout_seconds(user_msg: str, session_id: str) -> int:
    if _is_story_request(user_msg):
        return 120
    theme_query = f"{user_msg} {_THEME_HINTS.get(_theme_session_overrides.get(session_id, ''), '')}".strip()
    if _session_tech_knowledge_enabled(session_id) and _match_tech_knowledge_sections(theme_query):
        return 180
    if _session_culinary_enabled(session_id):
        return 180
    return 90


def _build_response_mode_context(user_msg: str, session_id: str) -> str:
    instructions = []
    if _is_recent_memory_request(user_msg):
        instructions.append(
            "Demande de rappel : consulte réellement les messages récents fournis après ce prompt. "
            "Résume ce qui y figure sans prétendre te souvenir d’un élément absent. Précise honnêtement "
            "si l’information recherchée est sortie de la fenêtre des 12 derniers messages."
        )
    if _is_story_request(user_msg):
        instructions.append(
            "Exception récit demandée : raconte une histoire complète avec un début, un développement et une vraie fin. "
            "Tu peux être nettement plus développé que d’habitude. Ne coupe pas le récit brutalement et conserve "
            "strictement ton identité de KITT K2000 ainsi que les faits établis."
        )
    elif _session_tech_knowledge_enabled(session_id) and _match_tech_knowledge_sections(user_msg):
        instructions.append(
            "Mode technique actif : pour une question technique, donne une réponse sensiblement plus riche et pédagogique, "
            "généralement 5 à 10 phrases si le sujet le mérite. Explique les composants, leur rôle et les liens utiles. "
            "Distingue clairement les faits confirmés, les informations provisoires et ce qui reste inconnu; n’invente jamais "
            "une spécification manquante. Pour une simple conversation non technique, reste concise."
        )
    elif _session_culinary_enabled(session_id):
        instructions.append(
            "Mode cuisine actif : agis comme un assistant culinaire clair, généreux et pratique. Pour une recette, "
            "indique le nombre de personnes, les ingrédients avec quantités, les étapes numérotées, les temps, "
            "la température et un conseil de réussite. Demande une précision si le nombre de personnes, un ingrédient "
            "essentiel ou le matériel change fortement la recette. Signale les allergènes évidents et ne prétends jamais "
            "qu'un aliment est sans danger en cas d'allergie. Tu maîtrises notamment la quiche lorraine, les crêpes, "
            "la ratatouille, le bœuf bourguignon, la carbonara traditionnelle, le pain perdu classique, la tarte Tatin, "
            "les moules-frites, la carbonnade flamande, le waterzooi, les gaufres de Liège, les gaufres de Bruxelles et les boulets à la liégeoise. "
            "Le pain perdu classique contient du pain rassis, des œufs, du lait et du sucre : n'ajoute jamais de farine à l'appareil. "
            "N'invente pas une température de sécurité : pour la viande, recommande un thermomètre alimentaire."
        )
    return "\n\n" + " \n".join(instructions) if instructions else ""


def _tech_knowledge_needs_reload() -> bool:
    if not _TECH_KNOWLEDGE_DIR.is_dir():
        return bool(_tech_knowledge_sections_cache or _tech_knowledge_mtimes)
    current = {path: path.stat().st_mtime for path in sorted((*_TECH_KNOWLEDGE_DIR.glob("*.json"), *_TECH_KNOWLEDGE_DIR.glob("*.md")))}
    return current != _tech_knowledge_mtimes


def _load_tech_knowledge_sections() -> list[dict]:
    global _tech_knowledge_sections_cache, _tech_knowledge_mtimes
    if _tech_knowledge_sections_cache and not _tech_knowledge_needs_reload():
        return _tech_knowledge_sections_cache

    sections: list[dict] = []
    mtimes: dict[Path, float] = {}
    if _TECH_KNOWLEDGE_DIR.is_dir():
        for path in sorted((*_TECH_KNOWLEDGE_DIR.glob("*.json"), *_TECH_KNOWLEDGE_DIR.glob("*.md"))):
            try:
                mtimes[path] = path.stat().st_mtime
                if path.suffix.lower() == ".md":
                    raw_lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
                    headings = [line.lstrip("# ").strip() for line in raw_lines if line.startswith("#") and line.lstrip("# ").strip()]
                    title = headings[0] if headings else path.stem.replace("_", " ")
                    facts = [line.lstrip("-•* ").strip() for line in raw_lines if line.lstrip().startswith(("-", "•", "*")) and len(line.lstrip("-•* ").strip()) > 12]
                    keywords = [_normalize_memory_text(word) for word in re.split(r"[^\wÀ-ÿ]+", path.stem.replace("_", " ")) if len(word) > 2]
                    if facts and keywords:
                        sections.append({"source": path.name, "title": title, "keywords": keywords, "facts": facts[:80]})
                    continue
                data = json.loads(path.read_text(encoding="utf-8"))
                source_title = str(data.get("title") or path.stem)
                for raw_section in data.get("sections", []):
                    if not isinstance(raw_section, dict):
                        continue
                    title = str(raw_section.get("title") or raw_section.get("id") or source_title).strip()
                    keywords = [
                        _normalize_memory_text(str(keyword))
                        for keyword in raw_section.get("keywords", [])
                        if str(keyword).strip()
                    ]
                    facts = [str(fact).strip() for fact in raw_section.get("facts", []) if str(fact).strip()]
                    if not title or not keywords or not facts:
                        continue
                    sections.append({
                        "source": source_title,
                        "title": title,
                        "keywords": keywords,
                        "facts": facts,
                    })
            except Exception as exc:
                print(f"[KNOWLEDGE WARNING] Impossible de charger {path}: {exc}", flush=True)

    _tech_knowledge_sections_cache = sections
    _tech_knowledge_mtimes = mtimes
    return _tech_knowledge_sections_cache


def _match_tech_knowledge_sections(user_msg: str) -> list[dict]:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return []
    words = set(norm.split())
    matches: list[tuple[int, dict]] = []
    for section in _load_tech_knowledge_sections():
        score = 0
        for keyword in section["keywords"]:
            if not keyword:
                continue
            if " " in keyword:
                if keyword in norm:
                    score += 2
            elif keyword in words:
                score += 1
        if score > 0:
            matches.append((score, section))
    matches.sort(key=lambda item: (-item[0], item[1]["title"], item[1]["source"]))
    return [section for _, section in matches[:_TECH_KNOWLEDGE_MAX_SECTIONS]]


def _build_tech_knowledge_context(user_msg: str, session_id: str) -> str:
    norm_msg = _normalize_memory_text(user_msg)
    auto_tech = any(marker in norm_msg for marker in ("dat", "dcc", "philips", "minidisc", "laserdisc", "videodisque", "console", "nintendo", "playstation", "sony", "super nintendo"))
    if not _session_tech_knowledge_enabled(session_id) and not auto_tech:
        return ""
    theme = _theme_session_overrides.get(session_id, "")
    routed_query = f"{user_msg} {_THEME_HINTS.get(theme, '')}".strip()
    matched_sections = _match_tech_knowledge_sections(routed_query)
    if not matched_sections:
        return ""

    lines = [
        "",
        "Connaissances techniques K-4000 pertinentes pour cette question:",
    ]
    facts_used = 0
    for section in matched_sections:
        if facts_used >= _TECH_KNOWLEDGE_MAX_FACTS:
            break
        lines.append(f"[{section['title']}]")
        for fact in section["facts"]:
            lines.append(f"- {fact}")
            facts_used += 1
            if facts_used >= _TECH_KNOWLEDGE_MAX_FACTS:
                break
    lines.append("N'utilise ces faits que s'ils sont vraiment utiles a la question courante.")
    return "\n".join(lines)


def _load_permanent_memory_sections() -> list[dict]:
    """Charge la petite mémoire locale et ignore toujours les récits non vérifiés."""
    global _permanent_memory_sections_cache, _permanent_memory_mtime
    try:
        mtime = _PERMANENT_MEMORY_PATH.stat().st_mtime
    except OSError:
        return []
    if _permanent_memory_sections_cache and _permanent_memory_mtime == mtime:
        return _permanent_memory_sections_cache
    try:
        data = json.loads(_PERMANENT_MEMORY_PATH.read_text(encoding="utf-8"))
        sections: list[dict] = []
        for raw in data.get("sections", []):
            if not isinstance(raw, dict) or raw.get("status") not in {"verified_owner", "verified_history"}:
                continue
            keywords = [_normalize_memory_text(str(item)) for item in raw.get("keywords", []) if str(item).strip()]
            facts = [str(item).strip() for item in raw.get("facts", []) if str(item).strip()]
            if keywords and facts:
                sections.append({
                    "id": str(raw.get("id", "")), "scope": str(raw.get("scope", "")),
                    "status": str(raw.get("status", "")),
                    "title": str(raw.get("title", raw.get("id", "Mémoire K-4000"))),
                    "keywords": keywords, "facts": facts,
                })
        _permanent_memory_sections_cache = sections
        _permanent_memory_mtime = mtime
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[PERMANENT MEMORY WARNING] {_PERMANENT_MEMORY_PATH}: {exc}", flush=True)
        return []
    return _permanent_memory_sections_cache


def _match_permanent_memory_sections(user_msg: str, history: list | None = None) -> list[dict]:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return []
    follow_up = bool(re.search(
        r"^(?:et\b|pourquoi\b|qu en\b|et\s+la\b)|\b(?:il|elle|lui|celui|celle|ce dernier|cette derniere|son|sa|ses|leur)\b", norm,
    ))
    match_norm = norm
    if follow_up and history:
        recent_users = [
            _normalize_memory_text(str(message.get("content", "")))
            for message in history[-6:]
            if isinstance(message, dict) and message.get("role") == "user"
        ]
        match_norm = " ".join(item for item in recent_users + [norm] if item)
    words = set(match_norm.split())
    self_context = bool(re.search(r"\b(?:tu|toi|ton|ta|tes|t as|as tu|vous|votre|vos)\b", norm))
    current_context = self_context or any(marker in match_norm for marker in (
        "k4000", "k 4000", "k 4 pile", "frank", "kr95", "kr 95", "replique", "replica", "ta voiture",
        "scanner", "fibre", "resine", "carrosserie", "feu arriere", "feux arriere", "plexiglas",
    ))
    history_context = any(marker in match_norm for marker in (
        "knight rider 2000", "telefilm", "film", "1991", "tournage", "universal", "banshee",
        "dodge stealth", "mitsubishi", "jay ohrberg", "william daniels", "guy chapellier",
        "david hasselhoff", "michael knight", "edward mulhare", "devon miles", "son dessin",
        "son design", "son style", "a inspire son dessin", "a inspire son design", "voix francaise",
        "voix americaine", "voix anglaise",
    ))
    matches: list[tuple[int, dict]] = []
    for section in _load_permanent_memory_sections():
        score = 0
        for keyword in section["keywords"]:
            if " " in keyword:
                if keyword in match_norm:
                    score += 3
            elif keyword in words:
                score += 1
        if score == 0:
            continue
        if section["scope"] == "current_replica" and not current_context:
            continue
        if section["scope"] == "official_history" and not (history_context or self_context):
            continue
        matches.append((score, section))
    matches.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [section for _, section in matches[:_PERMANENT_MEMORY_MAX_SECTIONS]]


def _build_permanent_memory_context(user_msg: str, history: list | None = None) -> str:
    matched = _match_permanent_memory_sections(user_msg, history)
    if not matched:
        return ""
    lines = [
        "", "Mémoire personnelle permanente pertinente pour cette question :",
        "Tu connais ces faits naturellement. N'évoque ni base de données ni mémoire enregistrée. Réponds seulement avec les faits utiles, sans réciter le reste.",
        "N'ajoute aucune qualité, performance, matière, origine, personne ou motivation qui ne figure pas explicitement dans ces faits.",
        "Distingue toujours ma réplique actuelle de Pascal Fairon et la voiture du téléfilm de 1991. Si un détail demandé manque, dis : « Je n'ai pas cette information avec suffisamment de certitude. »",
    ]
    facts_used = 0
    for section in matched:
        lines.append(f"[{section['title']} — {section['status']}]")
        for fact in section["facts"]:
            lines.append(f"- {fact}")
            facts_used += 1
            if facts_used >= _PERMANENT_MEMORY_MAX_FACTS:
                break
        if facts_used >= _PERMANENT_MEMORY_MAX_FACTS:
            break
    return "\n".join(lines)


def _tech_knowledge_command_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if any(marker in norm for marker in _TECH_KNOWLEDGE_DISABLE_MARKERS):
        _tech_knowledge_session_overrides[session_id] = False
        return {
            "reply": "Mémoire technique K-4000 désactivée pour cette session. Retour au prompt léger.",
            "action": "technical_mode_deactivated",
        }
    if any(marker in norm for marker in _TECH_KNOWLEDGE_ENABLE_MARKERS) or norm in ("activites de mode technique", "activite mode technique", "active mode technique"):
        _tech_knowledge_session_overrides[session_id] = True
        _culinary_session_overrides[session_id] = False
        return {
            "reply": (
                "Mode technique K-4000 (branche KR95) activé pour cette session. Cette branche concerne la K-4000, pas ma KITT K2000 de Pascal Fairon. "
                "Mes réponses techniques seront plus détaillées, avec les faits utiles sur les pièces, la construction et l’histoire. "
                "Si tu trouves l'inférence trop lente, dis simplement « désactive la mémoire technique »."
            ),
            "action": "technical_mode_activated",
        }
    if any(marker in norm for marker in _TECH_KNOWLEDGE_STATUS_MARKERS):
        state = "activée" if _session_tech_knowledge_enabled(session_id) else "désactivée"
        return {
            "reply": (
                f"Mémoire technique K-4000 actuellement {state}. "
                "Elle n'ajoute des faits que pour les questions sur les pièces, l'histoire ou la construction."
            ),
            "action": None,
        }
    return None


def _pontiac_engine_table_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    asks_table = any(x in norm for x in ("tableau", "liste", "affiche", "montre"))
    asks_engine = any(x in norm for x in (
        "moteur", "moteurs", "motorisation", "emoteur", "emoteurs", "emoteure",
        "emotere", "emoteres", "motueur", "motuers",
    ))
    generic_engine_table = any(x in norm for x in (
        "tableau des moteurs", "tableau moteur", "liste des moteurs", "liste moteurs",
        "tableau d emoteur", "tableau des emoteurs", "tableau d emoteurs",
        "tableau d emotere", "tableau des emoteres",
    ))
    if not (asks_table and asks_engine and (
        generic_engine_table or _session_tech_knowledge_enabled(session_id)
        or "pontiac" in norm or "pontiacs" in norm or "types" in norm or "disponibles" in norm
    )):
        return None
    _tech_knowledge_session_overrides[session_id] = True
    reply = """<section class="technical-card pontiac-engine-panel"><h3>⚙ MOTEURS PONTIAC — TABLEAU TECHNIQUE</h3><p>Les moteurs varient selon la génération, l'année et la version. Une puissance ou une boîte doit toujours être associée à un millésime et un code moteur.</p><table class="help-table"><thead><tr><th>Véhicule / période</th><th>Architecture</th><th>Données vérifiées</th></tr></thead><tbody>
<tr><td>Firebird première génération 1967–1969</td><td>OHC-6 3,8 L ; V8 326, 350, 400 ou 428 ci</td><td>Offre très variable selon année et finition ; le code moteur est indispensable.</td></tr>
<tr><td>Firebird deuxième génération 1970–1981</td><td>V6 3,8 L ; V8 301, 350, 400 ou 455 ci</td><td>Motorisations différentes selon année, émissions et finition ; ne pas généraliser le 455.</td></tr>
<tr><td>Firebird Trans Am 1982</td><td>V8 OHV 5,0 L / 305 ci</td><td>LG4 à carburateur, environ 145 ch ; LU5 Cross-Fire à injection, environ 165 ch selon configuration. Deux soupapes par cylindre.</td></tr>
<tr><td>Firebird troisième génération 1982–1992</td><td>V6 2,8 L ; V8 5,0 L / 305 ci ; V8 5,7 L / 350 ci</td><td>Le 2,8 L est un V6 GM ; les V8 305 et 350 changent selon millésime et version.</td></tr>
<tr><td>Firebird quatrième génération</td><td>V6 3,4 L ou V6 3,8 L</td><td>Familles GM différentes selon le millésime ; vérifier code moteur, gestion électronique et boîte.</td></tr>
<tr><td>Firebird quatrième génération</td><td>V8 5,7 L / 350 ci</td><td>V8 GM de la famille LT1 ou LS1 selon l'année ; ne pas attribuer le même moteur à toute la génération.</td></tr>
<tr><td>Banshee IV 1988</td><td>V8 4,0 L DOHC à injection</td><td>Prototype distinct, environ 230 ch et boîte manuelle Getrag cinq rapports d'après le dossier documenté.</td></tr>
<tr><td>K-4000 / KR95</td><td>V6 3,4 L</td><td>Exemplaire de KR-95 sur base Firebird quatrième génération, boîte automatique ; distinct de KITT K2000.</td></tr>
</tbody></table><p>Pour une référence exacte, précise le modèle et l'année.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau des moteurs Pontiac documentés. Précise le modèle et l'année pour aller plus loin.", "action": "pontiac_engine_catalog"}

def _pontiac_engine_detail_result(user_msg: str, session_id: str) -> dict | None:
    """Fiches moteur locales, avec suivi des pannes connues sans extrapoler une voiture précise."""
    norm = _normalize_memory_text(user_msg)
    history = conversations.get(session_id, []) if "conversations" in globals() else []
    history_norm = " ".join(_normalize_memory_text(str(m.get("content", ""))) for m in history[-10:] if isinstance(m, dict))
    asks_more = any(x in norm for x in (
        "quoi c est tout", "c est tout", "plus d info", "plus de detail", "plus de details",
        "developpe", "approfond", "panne", "pannes", "maladie", "maladies", "probleme",
        "problemes", "faiblesse", "fiabilite", "entretien", "symptome", "symptomes", "diagnostic",
    ))
    asks = any(x in norm for x in (
        "moteur", "moteurs", "motorisation", "v6", "v 6", "v8", "v 8", "305", "350",
        "2 8", "3 4", "3 8", "5 0", "5 7", "information", "fiche", "detail", "parle",
    )) or asks_more

    # Laisser le catalogue prendre en charge une demande de tableau générique.
    # Sinon cette fiche de détail pouvait intercepter « affiche le tableau des
    # moteurs » et répondre par une comparaison V6/V8.
    if any(x in norm for x in ("tableau", "liste")) and not asks_more:
        return None

    transam_context = any(x in norm for x in ("trans am", "transam", "trans ame", "transamme", "firebird transam"))
    transam_context = transam_context or any(x in history_norm for x in ("trans am 1982", "firebird transam 1982", "v8 305"))
    if transam_context and asks:
        text = (
            "La Firebird Trans Am 1982 utilise le V8 Chevrolet 305, soit 5,0 litres, et non 305 litres. "
            "Deux configurations principales sont documentées : le LG4 à carburateur, autour de 145 chevaux, "
            "et le LU5 Cross-Fire à injection, autour de 165 chevaux selon la configuration. "
            "Ce sont des V8 OHV à 90 degrés, avec deux soupapes par cylindre. "
            "Les pannes ou points de vigilance courants sur une auto de cet âge sont les durites et prises de dépression poreuses, "
            "les défauts d'allumage HEI (module, bobine, capteur et câbles), un carburateur ou une injection Cross-Fire mal réglé, "
            "les capteurs et actuateurs de gestion moteur, les fuites d'huile, le circuit de refroidissement vieillissant "
            "et les masses ou connecteurs oxydés. Symptômes typiques : démarrage difficile, ralenti instable, trous à l'accélération, "
            "surchauffe ou ratés. Il faut commencer par les codes moteur, l'allumage, les compressions, les prises de dépression, "
            "la pression d'essence et la température réelle avant de remplacer des pièces. Ces défauts sont des points de diagnostic généraux, "
            "pas une affirmation que la voiture de Pascal les présente."
        )
        table = """<section class='technical-card pontiac-engine-panel'><h3>FICHE COMPLÈTE — TRANS AM 1982 / V8 305</h3>
<table class='help-table'><thead><tr><th>Rubrique</th><th>Informations</th></tr></thead><tbody>
<tr><td>Architecture</td><td>V8 OHV Chevrolet, 5,0 L / 305 ci, deux soupapes par cylindre</td></tr>
<tr><td>LG4</td><td>Carburateur quatre corps, environ 145 ch selon les normes de l'époque</td></tr>
<tr><td>LU5 Cross-Fire</td><td>Injection double corps, environ 165 ch selon configuration</td></tr>
<tr><td>Allumage</td><td>HEI : module, bobine, capteur, tête, rotor et câbles à contrôler</td></tr>
<tr><td>Pannes fréquentes à rechercher</td><td>Dépressions, carburateur ou Cross-Fire, capteurs/actuateurs, connecteurs et masses, fuites d'huile, refroidissement</td></tr>
<tr><td>Symptômes</td><td>Démarrage difficile, ralenti instable, ratés, trous à l'accélération, surchauffe</td></tr>
<tr><td>Méthode</td><td>Codes, allumage, compressions, dépression, pression d'essence et température avant remplacement de pièces</td></tr>
</tbody></table><p>""" + text + "</p></section>"
        return {"reply": table, "tts_reply": text, "action": "pontiac_trans_am_1982_detail"}

    if (re.search(r"\b2[., ]?8\s*(?:l|litre|litres)?\b", norm)
            or any(x in norm for x in ("deux litres huit", "deux litre huit", "deux litres huite", "deux litre huite", "deli tuit", "deli tweet", "deli huit", "lee tweet", "lit tweet", "li tweet"))):
        text = ("Le V6 2,8 litres, soit environ 173 pouces cubes, a été proposé sur certaines Pontiac Firebird de troisième génération au début des années 1980. "
                "C'est un V6 à 60 degrés, à soupapes en tête. Les points de vigilance d'un exemplaire ancien sont les fuites de dépression, "
                "le refroidissement, l'allumage, les joints, les capteurs de gestion et les connecteurs oxydés. La puissance et l'alimentation "
                "varient selon l'année et la version. Il ne faut pas le confondre avec le V8 5,0 litres des Trans Am 1982 ni avec le V6 3,4 litres de la K-4000. "
                "Je ne confirme pas que la K2000 de Pascal possède ce 2,8 litres sans fiche moteur ou validation de Pascal.")
        table = "<section class='technical-card'><h3>Fiche moteur V6 2,8 litres Pontiac</h3><table class='help-table'><thead><tr><th>Élément</th><th>Information</th></tr></thead><tbody><tr><td>Cylindrée</td><td>2,8 L — environ 173 ci</td></tr><tr><td>Architecture</td><td>V6 à 60 degrés, soupapes en tête</td></tr><tr><td>Application</td><td>Certaines Firebird de troisième génération, selon année et version</td></tr><tr><td>À ne pas confondre</td><td>V8 5,0 L Trans Am, V6 3,4 L K-4000, V8 5,7 L Firebird ultérieures</td></tr><tr><td>Points de vigilance</td><td>Dépressions, refroidissement, allumage, joints, capteurs et connecteurs</td></tr><tr><td>Puissance</td><td>Variable selon millésime, alimentation et norme de mesure</td></tr></tbody></table><p>" + text + "</p></section>"
        return {"reply": table, "tts_reply": text, "action": "pontiac_v28_detail"}

    if not asks or not any(x in norm for x in ("v6", "v 6", "v8", "v 8", "moteur", "motorisation")):
        return None
    if any(x in norm for x in ("v6", "v 6")) and not any(x in norm for x in ("v8", "v 8")):
        text = ("Un V6 est un moteur à six cylindres disposés en deux bancs formant un V. Chez Pontiac, les Firebird ont notamment reçu des V6 2,8, 3,4 et 3,8 litres selon la génération. "
                "Les défauts à rechercher sur ces moteurs âgés sont généralement les fuites de dépression, l'allumage, le refroidissement, les joints et les capteurs de gestion moteur. "
                "Le V6 3,4 litres est aussi la motorisation de référence documentée de la K-4000 de KR-95, avec boîte automatique. "
                "La cylindrée seule ne suffit pas : il faut le millésime, le code moteur, l'injection et la boîte.")
        table = "<section class='technical-card'><h3>Fiche moteur V6 Pontiac</h3><table class='help-table'><thead><tr><th>Élément</th><th>Information</th></tr></thead><tbody><tr><td>Architecture</td><td>6 cylindres en V, deux bancs de 3 cylindres</td></tr><tr><td>Cylindrées documentées</td><td>2,8 L, 3,4 L et 3,8 L selon génération et millésime</td></tr><tr><td>K-4000</td><td>V6 3,4 L, boîte automatique, exemplaire de KR-95</td></tr><tr><td>Points de vigilance</td><td>Dépressions, allumage, refroidissement, joints, capteurs et connecteurs</td></tr><tr><td>Identification</td><td>Millésime, code moteur, injection et boîte indispensables</td></tr></tbody></table><p>" + text + "</p></section>"
        return {"reply": table, "tts_reply": text, "action": "pontiac_v6_detail"}
    if any(x in norm for x in ("v8", "v 8")) and not any(x in norm for x in ("v6", "v 6")):
        text = ("Un V8 est un moteur à huit cylindres répartis sur deux bancs en V. Les défauts à rechercher dépendent du code moteur, "
                "mais un exemplaire ancien mérite un contrôle de l'allumage, des prises de dépression, du refroidissement, de la pression d'huile, "
                "des fuites et de la gestion électronique. Sur la Trans Am 1982, le V8 5,0 litres existe notamment en LG4 et LU5 Cross-Fire. "
                "La Firebird de quatrième génération a ensuite reçu des V8 5,7 litres de familles différentes, notamment LT1 ou LS1. "
                "La Banshee IV 1988 est un prototype séparé avec un V8 4,0 litres DOHC à injection.")
        table = "<section class='technical-card'><h3>Fiche moteur V8 Pontiac</h3><table class='help-table'><thead><tr><th>Véhicule</th><th>Architecture / moteur</th><th>Données et vigilance</th></tr></thead><tbody><tr><td>Trans Am 1982</td><td>V8 OHV 5,0 L / 305 ci</td><td>LG4 ~145 ch ; LU5 Cross-Fire ~165 ch. Vérifier allumage, dépressions, refroidissement et alimentation.</td></tr><tr><td>Firebird quatrième génération</td><td>V8 5,7 L / 350 ci</td><td>Familles LT1 ou LS1 selon année ; ne pas mélanger leurs périphériques ni leur diagnostic.</td></tr><tr><td>Banshee IV 1988</td><td>V8 4,0 L DOHC injection</td><td>Prototype distinct, environ 230 ch ; pas une motorisation de série Firebird.</td></tr><tr><td>Architecture</td><td>8 cylindres en V</td><td>Deux bancs de 4 cylindres ; 16 soupapes si deux soupapes par cylindre.</td></tr></tbody></table><p>" + text + "</p></section>"
        return {"reply": table, "tts_reply": text, "action": "pontiac_v8_detail"}
    return {"reply": "Je peux comparer les deux : le V6 offre six cylindres et une architecture plus compacte ; le V8 en offre huit et davantage de potentiel de couple et de puissance. Pour une fiche utile, précise le moteur ou le véhicule : V6 2,8, V6 3,4, V6 3,8, V8 5,0 de la Trans Am 1982, V8 5,7 LT1/LS1 ou Banshee IV.", "action": "pontiac_engine_compare"}


def _console_catalog_result(user_msg: str, session_id: str) -> dict | None:
    """Catalogue local des consoles, sans laisser une demande de tableau au LLM."""
    norm = _normalize_memory_text(user_msg)
    asks_table = any(x in norm for x in ("tableau", "liste", "affiche", "montre"))
    asks_console = any(x in norm for x in (
        "console", "consoles", "console de jeux", "consoles de jeux",
        "nintendo", "playstation", "sony", "game boy",
    ))
    if not (asks_table and asks_console):
        return None
    reply = """<section class="technical-card console-catalog"><h3>🎮 CONSOLES DE JEUX — TABLEAU</h3><p>Repères des consoles Nintendo, Sony et autres machines marquantes des années 80 et 90.</p><table class="help-table"><thead><tr><th>Console</th><th>Période</th><th>Support</th><th>Repère</th></tr></thead><tbody>
<tr><td>NES / Nintendo</td><td>1983–1995</td><td>Cartouches</td><td>Console familiale 8 bits, Super Mario Bros. et Zelda.</td></tr>
<tr><td>Game Boy</td><td>1989–1998</td><td>Cartouches</td><td>Portable monochrome, grande autonomie, Tetris.</td></tr>
<tr><td>Mega Drive / Genesis</td><td>1988–1997</td><td>Cartouches</td><td>Console 16 bits de Sega, Sonic et jeux d'arcade.</td></tr>
<tr><td>Super Nintendo</td><td>1990–1998</td><td>Cartouches</td><td>16 bits, Super Mario World, Zelda et jeux à puce.</td></tr>
<tr><td>Neo Geo AES</td><td>1990–1997</td><td>Cartouches</td><td>Version salon proche de l'arcade, très haut de gamme.</td></tr>
<tr><td>PlayStation / PS1</td><td>1994–2006</td><td>CD-ROM</td><td>Première console Sony, jeux 3D et cartes mémoire.</td></tr>
<tr><td>Nintendo 64</td><td>1996–2003</td><td>Cartouches</td><td>Quatre ports manette intégrés et jeux 3D.</td></tr>
<tr><td>Dreamcast</td><td>1998–2001</td><td>GD-ROM</td><td>Console Sega avec modem intégré selon les marchés.</td></tr>
</tbody></table><p>Dis le nom d'une console pour obtenir sa fiche détaillée.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau local des consoles Nintendo, Sony et autres consoles marquantes des années 80 et 90. Dis le nom d'une console pour obtenir sa fiche.", "action": "console_catalog"}


def _k4000_parts_table_result(user_msg: str, session_id: str) -> dict | None:
    """Table de la K-4000/KR95, toujours séparée de KITT K2000 Pascal."""
    if not _session_tech_knowledge_enabled(session_id):
        return None
    norm = _normalize_memory_text(user_msg)
    asks_table = any(x in norm for x in ("tableau", "liste", "affiche"))
    asks_parts = any(x in norm for x in ("piece", "pieces", "composant", "materiel", "technique"))
    k4000_alias = any(x in norm for x in ("k 4000", "k4000", "kk 4000", "kakat mil", "kr95", "kr 95"))
    if not (asks_table and asks_parts and k4000_alias):
        return None
    reply = """<section class="technical-card"><h3>Pièces de la K-4000 — branche KR95</h3><p>Cette fiche concerne la K-4000 de KR95, et non KITT K2000 de Pascal Fairon.</p><table class="help-table"><thead><tr><th>Ensemble</th><th>Éléments documentés</th></tr></thead><tbody>
<tr><td>Base automobile</td><td>Pontiac Firebird de quatrième génération, châssis et mécanique de base</td></tr>
<tr><td>Carrosserie</td><td>Silhouette K-4000, adaptation et modifications sur mesure</td></tr>
<tr><td>Fabrication</td><td>Pièces artisanales, kit et éléments adaptés pour la réplique</td></tr>
<tr><td>Motorisation</td><td>V6 3,4 litres avec boîte automatique, si confirmé pour cette fiche</td></tr>
</tbody></table><p>KITT reste la K2000 de Pascal Fairon.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau des pièces de la K-4000, branche KR95. Elle est distincte de ma KITT K2000 de Pascal Fairon.", "action": "k4000_parts_catalog"}


def _theme_catalog_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if "liste" not in norm or not any(x in norm for x in ("theme", "themes", "branche", "branches")):
        return None
    reply = """<section class="theme-card"><h3>Thèmes et dossiers disponibles</h3><p>Tu peux sélectionner une branche en la nommant à voix haute.</p><table class="help-table"><thead><tr><th>Option vocale</th><th>Contenu</th></tr></thead><tbody>
<tr><td>KITT</td><td>Branche KITT K2000 de Pascal Fairon</td></tr>
<tr><td>KARR</td><td>Branche KARR</td></tr>
<tr><td>K-4000</td><td>Branche technique K-4000/KR95</td></tr>
<tr><td>Berger australien</td><td>Dossier spécialisé sur le chien</td></tr>
<tr><td>Voiture / Pontiac</td><td>Automobile, Firebird, Banshee IV et moteurs</td></tr>
<tr><td>Séries 80</td><td>Séries et culture télévisuelle des années 1980</td></tr>
<tr><td>Musique 80-90</td><td>Artistes, titres et souvenirs musicaux</td></tr>
<tr><td>Blagues</td><td>Blagues et devinettes en français</td></tr>
<tr><td>Hi-Fi années 90</td><td>DAT, DCC Philips, vidéodisques et matériel audio-vidéo</td></tr>
<tr><td>Consoles de jeux</td><td>Nintendo, Sony PlayStation et histoire du jeu vidéo</td></tr>
<tr><td>Charleroi</td><td>Histoire de la ville, patrimoine, monuments et lieux connus</td></tr>
<tr><td>Pontiac / moteurs</td><td>Firebird, Trans Am, V6, V8 et fiches techniques</td></tr>
<tr><td>Cuisine</td><td>Recettes, ingrédients et tableaux culinaires</td></tr>
<tr><td>Relais</td><td>Commandes matérielles sécurisées</td></tr>
<tr><td>Normal</td><td>Routage automatique des connaissances</td></tr>
</tbody></table><p>Exemple : dis « active le thème Berger australien » ou « passe en mode cuisine ». Pour tout réinitialiser, dis « passe en mode normal ».</p></section>"""
    return {"reply": reply, "tts_reply": "Voici les thèmes disponibles. Nomme simplement celui que tu veux sélectionner.", "action": "theme_catalog"}


def _charleroi_catalog_result(user_msg: str, session_id: str, force: bool = False) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    asks = any(x in norm for x in ("tableau", "liste", "affiche", "montre", "histoire", "lieux", "monuments", "statues"))
    if not force and not ("charleroi" in norm and asks):
        return None
    _theme_session_overrides[session_id] = "charleroi"
    reply = """<section class="technical-card"><h3>Charleroi — histoire et lieux connus</h3><table class="help-table"><thead><tr><th>Époque / lieu</th><th>Histoire ou intérêt</th></tr></thead><tbody>
<tr><td>1666 — naissance de Charleroi</td><td>La forteresse de Charnoy est rebaptisée Charleroi en l’honneur du roi Charles II d’Espagne.</td></tr>
<tr><td>Place Charles II</td><td>Cœur de la Ville-Haute, elle rappelle le plan rayonnant de l’ancienne forteresse.</td></tr>
<tr><td>Hôtel de Ville et beffroi</td><td>Ensemble Art déco inauguré dans les années 1930 ; le beffroi appartient aux beffrois de Belgique et de France inscrits à l’UNESCO.</td></tr>
<tr><td>Bois du Cazier — Marcinelle</td><td>Ancien charbonnage et lieu de mémoire de la catastrophe du 8 août 1956, qui fit 262 victimes.</td></tr>
<tr><td>Passage de la Bourse</td><td>Galerie couverte de la fin du XIXe siècle, témoin du Charleroi commerçant et industriel.</td></tr>
<tr><td>Musée de la Photographie</td><td>Installé à Mont-sur-Marchienne dans un ancien carmel ; grand musée consacré à la photographie.</td></tr>
<tr><td>BPS22</td><td>Musée d’art contemporain installé dans une ancienne halle industrielle en verre et en fer.</td></tr>
<tr><td>Quais de Sambre</td><td>Promenade urbaine réaménagée autour de la rivière et de la Ville-Basse.</td></tr>
<tr><td>Culture BD</td><td>Charleroi est liée à l’école de Marcinelle et aux éditions Dupuis, notamment Spirou et de nombreux héros de bande dessinée.</td></tr>
</tbody></table><p>Dis par exemple : « raconte l’histoire du Bois du Cazier », « parle-moi du beffroi » ou « quels musées visiter à Charleroi ? »</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau de Charleroi, avec son histoire, ses monuments et plusieurs lieux connus.", "action": "charleroi_catalog"}

def _charleroi_detail_result(user_msg: str, session_id: str) -> dict | None:
    """Détail d'une ligne du tableau, y compris les demandes très courtes."""
    norm = _normalize_memory_text(user_msg)
    theme_active = _theme_session_overrides.get(session_id) == "charleroi"
    if not theme_active and not any(x in norm for x in ("charleroi", "bois du cazier", "beffroi")):
        return None
    if any(x in norm for x in ("bois du cazier", "poids du casier", "bois du casier", "poids du cazier")):
        return {"reply": "Le Bois du Cazier, à Marcinelle, est un ancien charbonnage. Le 8 août 1956, un incendie y provoqua la mort de 262 personnes. Le site est aujourd'hui un lieu de mémoire consacré à la catastrophe et à l'histoire minière de la région.", "action": "charleroi_detail"}
    if "beffroi" in norm:
        return {"reply": "Le beffroi de l'Hôtel de Ville de Charleroi est un monument Art déco inauguré dans les années 1930. Il appartient à l'ensemble des beffrois de Belgique et de France inscrit au patrimoine mondial de l'UNESCO.", "action": "charleroi_detail"}
    if norm in ("bd", "b d") or any(x in norm for x in ("bande dessinee", "spirou", "dupuis", "marcinelle")):
        return {"reply": "La BD est l'une des signatures culturelles de Charleroi. L'école de Marcinelle, associée aux éditions Dupuis, a popularisé un dessin dynamique et expressif. Elle est notamment liée à Spirou, Boule et Bill, les Schtroumpfs et de nombreux autres héros de la bande dessinée franco-belge.", "action": "charleroi_detail"}
    if any(x in norm for x in ("musee", "photographie", "bps22")):
        return {"reply": "À Charleroi, tu peux visiter le Musée de la Photographie à Mont-sur-Marchienne, le BPS22 consacré à l'art contemporain, et le Bois du Cazier pour son histoire minière et son lieu de mémoire.", "action": "charleroi_detail"}
    if "place charles ii" in norm or "place charles" in norm:
        return {"reply": "La place Charles II est le cœur de la Ville-Haute. Son plan rayonnant rappelle la forteresse fondée à Charleroi en 1666 sous le règne de Charles II d'Espagne.", "action": "charleroi_detail"}
    return None


def _charleroi_detail_result(user_msg: str, session_id: str) -> dict | None:
    """Détails locaux de Charleroi, y compris les suivis courts après le tableau."""
    norm = _normalize_memory_text(user_msg)
    theme_active = _theme_session_overrides.get(session_id) == "charleroi"
    mentions_charleroi = any(x in norm for x in ("charleroi", "bois du cazier", "poids du casier", "beffroi"))
    if not theme_active and not mentions_charleroi:
        return None
    _theme_session_overrides[session_id] = "charleroi"

    def result(text: str) -> dict:
        return {"reply": text, "action": "charleroi_detail"}

    if any(x in norm for x in ("bois du cazier", "poids du casier", "bois du casier", "poids du cazier")):
        return result("Le Bois du Cazier, à Marcinelle, est un ancien charbonnage transformé en lieu de mémoire et en musée. Le 8 août 1956, un incendie souterrain provoqua la mort de 262 personnes, parmi lesquelles de nombreux travailleurs italiens. La visite explique le travail minier, les conditions de sécurité de l'époque, le sauvetage et la mémoire des victimes. Le site fait partie des Sites miniers majeurs de Wallonie inscrits au patrimoine mondial de l'UNESCO.")
    if "beffroi" in norm:
        return result("Le beffroi de Charleroi est la tour de l'Hôtel de Ville, au cœur de la Ville-Haute. L'ensemble a été conçu dans le style Art déco et inauguré dans les années 1930. Le beffroi combine une fonction civique, une horloge et un carillon ; il appartient à l'ensemble des beffrois de Belgique et de France inscrit au patrimoine mondial de l'UNESCO. La place Charles II permet de comprendre le plan de l'ancienne forteresse.")
    if any(x in norm for x in ("place charles ii", "place charles 2", "place charles")):
        return result("La place Charles II est le centre de la Ville-Haute. Sa forme rayonnante reprend la logique de la forteresse fondée en 1666 sous le règne de Charles II d'Espagne. Elle rassemble notamment l'Hôtel de Ville et le beffroi, et sert de repère pour parcourir le cœur historique de Charleroi.")
    if any(x in norm for x in ("passage de la bourse", "bourse")):
        return result("Le Passage de la Bourse est une galerie couverte de la fin du XIXe siècle, située dans la Ville-Basse. Sa verrière, ses commerces et son architecture témoignent de l'époque où Charleroi était un grand centre industriel et commerçant. C'est un lieu agréable à relier aux quais de Sambre et au centre-ville.")
    if any(x in norm for x in ("musee de la photographie", "musee photographie", "photographie")):
        return result("Le Musée de la Photographie se trouve à Mont-sur-Marchienne, dans un ancien carmel. Il présente l'histoire et les pratiques de la photographie à travers des collections, des expositions temporaires et des parcours thématiques. C'est l'un des lieux culturels majeurs à visiter autour de Charleroi.")
    if "bps22" in norm or "bps 22" in norm:
        return result("Le BPS22 est le musée d'art de la Province de Hainaut, installé dans une ancienne halle industrielle en verre et en fer. Son architecture rappelle le passé industriel de Charleroi, tandis que sa programmation est consacrée à l'art contemporain, aux expositions et aux questions de société.")
    if any(x in norm for x in ("quais de sambre", "quai de sambre", "sambre")):
        return result("Les quais de Sambre relient la Ville-Basse au paysage urbain de Charleroi. Leur réaménagement a rendu les berges plus accessibles aux promeneurs et donne des vues sur les ponts, les façades et les anciennes zones industrielles. Ils permettent de découvrir la ville à pied, entre patrimoine et transformation urbaine.")
    if any(x in norm for x in ("bande dessinee", "bd", "b d", "spirou", "dupuis", "marcinelle")):
        return result("Charleroi est liée à l'école de Marcinelle et aux éditions Dupuis. Cette tradition a donné un style de bande dessinée dynamique, lisible et expressif, associé notamment au journal Spirou, à Spirou et Fantasio, à Boule et Bill, aux Schtroumpfs et à d'autres héros franco-belges. Le nom de Marcinelle désigne ici une influence éditoriale et artistique, pas un musée unique.")
    if any(x in norm for x in ("musee", "musees", "visiter", "culture")):
        return result("Pour une sortie culturelle à Charleroi, je te conseille le Bois du Cazier à Marcinelle pour l'histoire minière, le Musée de la Photographie à Mont-sur-Marchienne pour ses collections et le BPS22 pour l'art contemporain. Dans le centre, ajoute le beffroi, la place Charles II, le Passage de la Bourse et les quais de Sambre.")
    if "cathedrale" in norm:
        return result("La cathédrale de Charleroi est la cathédrale Saint-Christophe, sur la place Charles II. Elle ne doit pas être appelée cathédrale Saint-Vincent. Son histoire est liée au développement de la ville et aux transformations du centre urbain ; pour l'Hôtel de Ville et la tour emblématique, il faut parler du beffroi.")
    if any(x in norm for x in ("continue", "bon continue", "developpe", "plus de detail", "plus de details", "explique", "expliquer", "les lieux", "les monuments")):
        return result("Voici le fil conducteur : Charleroi naît comme forteresse en 1666, puis devient une grande ville industrielle grâce au charbon, au verre, à la métallurgie et aux voies d'eau. La Ville-Haute conserve le plan de la forteresse autour de la place Charles II et du beffroi. La Ville-Basse, le Passage de la Bourse et les quais de Sambre racontent l'activité commerçante et les transformations récentes. Le Bois du Cazier rappelle le coût humain de l'industrie, tandis que le Musée de la Photographie, le BPS22 et la culture BD montrent la vie culturelle actuelle.")
    return None


def _equalizer_command_result(user_msg: str, session_id: str) -> dict | None:
    """Commande vocale de l'égaliseur (visualiseur vocal) : afficher/masquer."""
    norm = _normalize_memory_text(user_msg)
    mentions_eq = (
        "equaliseur" in norm
        or "egaliseur" in norm
        or re.search(r"\beq\b", norm) is not None
        or "visualiseur de voix" in norm
        or "visualiseur vocal" in norm
        or "spectre audio" in norm
        or "spectre vocal" in norm
    )
    if not mentions_eq:
        return None
    # Une question sur l'égaliseur reste une conversation classique.
    if re.match(r"^(?:quest ce que|c est quoi|pourquoi|comment|quand|ou|quel|quelle)\b", norm):
        return None
    if any(x in norm for x in ("desactive", "eteins", "masque", "cache", "enleve", "retire", "ferme")):
        return {"reply": "Égaliseur masqué.", "tts_reply": "Égaliseur masqué.", "action": "equalizer_off"}
    if any(x in norm for x in ("affiche", "montre", "active", "activer", "ouvre", "allume", "fais apparaitre", "visible")):
        return {"reply": "Égaliseur affiché.", "tts_reply": "Égaliseur affiché.", "action": "equalizer_on"}
    return {"reply": "Égaliseur basculé.", "tts_reply": "Égaliseur basculé.", "action": "equalizer_toggle"}


def _theme_panel_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if ("theme" in norm or "themes" in norm) and any(x in norm for x in ("active le bouton", "ouvre", "affiche", "montre", "menu")):
        return {"reply": "J'ouvre le bouton Thèmes. Tu peux sélectionner KITT, KARR, K-4000, Berger australien, Hi-Fi 90, Consoles, Charleroi, Voiture, Séries 80, Musique, Blagues ou Normal.", "action": "theme_panel"}
    return None


def _theme_voice_select_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    hifi_aliases = (
        "hifi 90", "hi fi 90", "hi fi des annees 90",
        "hifi des annees 90", "iffi 90", "ifi 90", "i fi 90",
        "iski 90", "i ski 90", "isky 90",
        "ici 90", "ici nonante", "hifi nonante", "hi fi nonante",
        "iffi nonante", "ifi nonante",
        "efi 90", "e fi 90", "h i fi 90", "h i fi espace 90",
        "hi fi espace 90", "hifi espace 90",
        "hi fi", "hifi",
    )
    hifi_word = any(re.search(rf"\b{re.escape(alias)}\b", norm) for alias in hifi_aliases)
    pontiac_word = any(x in norm for x in (
        "pontiac", "pontiak", "pontia", "pontiaque", "pont yac", "pon tiac", "pontiac moteur",
    ))
    # Un nom isolé de branche est une sélection vocale valide ; cela corrige
    # notamment « Pontiac » prononcé seul depuis le panneau des thèmes.
    bare_branch = norm in {
        "pontiac", "pontiak", "pontia", "pontiaque", "pont yac", "pon tiac",
        "serie 80", "series 80", "s erie 80", "musique", "musique 80 90",
        "hifi 90", "hi fi 90", "iffi 90", "ifi 90", "i fi 90",
        "iski 90", "i ski 90", "isky 90",
        "ici 90", "ici nonante", "hifi nonante", "hi fi nonante",
        "iffi nonante", "ifi nonante", "hi fi", "hifi",
        "efi 90", "e fi 90", "h i fi 90", "h i fi espace 90",
        "hi fi espace 90", "hifi espace 90",
    }
    if not bare_branch and not any(x in norm for x in ("active", "activer", "bouton", "theme", "tem", "branche", "passe", "selectionne", "choisis")):
        return None
    aliases = (("berger", "berger"), ("berges", "berger"), ("série 80", "series80"), ("serie 80", "series80"), ("series 80", "series80"), ("cery 80", "series80"), ("ceri 80", "series80"), ("ceric 80", "series80"), ("cerique 80", "series80"), ("s erie 80", "series80"), ("series annees 80", "series80"), ("cric a trova", "series80"), ("c ric a troda", "series80"), ("cric a troda", "series80"), ("karr", "karr"), ("k r s", "karr"), ("krs", "karr"), ("car", "karr"), ("karl", "karr"), ("surcarre", "karr"), ("sur carre", "karr"), ("gat a r r", "karr"))
    aliases = (("kitt", "kitt"), ("kit", "kitt"), ("temp kitt", "kitt"), ("temps kitt", "kitt"), ("temps kit", "kitt"), ("tem kit", "kitt"), ("theme kitt", "kitt"), ("thème kitt", "kitt"), ("k 4000", "k4000"), ("k4000", "k4000"), ("kk 4000", "k4000"), ("kakat mil", "k4000"), ("4000 fiches", "k4000"), ("temkar", "karr"), ("tem karr", "karr"), ("temps karr", "karr")) + aliases
    aliases = (("blague", "blagues"), ("blagues", "blagues"), ("temps blague", "blagues"), ("theme blague", "blagues"), ("musique 80 90", "musique8090"), ("musiques 80 90", "musique8090"), ("musique annees 80", "musique8090"), ("musiques annees 80", "musique8090"), ("musique", "musique8090"), ("music", "musique8090")) + aliases
    aliases = (("voiture", "voiture"), ("vehicule", "voiture"), ("véhicule", "voiture"), ("v kul", "voiture"), ("v-kul", "voiture"), ("v hicule", "voiture"), ("v-hicule", "voiture"), ("remote vehicle", "voiture"), ("remote vehicule", "voiture"), ("temps voiture", "voiture"), ("theme voiture", "voiture")) + aliases
    aliases = (("charleroi", "charleroi"), ("charle roi", "charleroi"), ("chaque roi", "charleroi"), ("theme charleroi", "charleroi"), ("bouton charleroi", "charleroi"), ("pontiac moteur", "pontiac"), ("moteurs pontiac", "pontiac"), ("moteur pontiac", "pontiac"), ("pontiaque", "pontiac"), ("pontiak", "pontiac"), ("pont yac", "pontiac"), ("pon tiac", "pontiac"), ("pontiac", "pontiac")) + aliases
    aliases = (("consoles", "consoles"), ("console", "consoles"), ("console de jeux", "consoles"), ("consoles de jeux", "consoles"), ("jeux video", "consoles"), ("nintendo", "consoles"), ("playstation", "consoles")) + aliases
    # Désactivation : phrases explicites uniquement (« désactive le thème »,
    # « mode normal », « bouton normal », « désactive le mode commande »).
    # Reset global : on efface les overrides thème/technique/cuisine ET on
    # désactive le mode commande véhicule, même si aucun thème n'est actif.
    if any(p in norm for p in ("desactive", "retire le theme", "enleve le theme",
                               "mode normal", "theme normal", "tem normal",
                               "aucun theme", "plus de theme", "sans theme",
                               "bouton normal", "desactive le mode commande",
                               "quitte le mode commande", "desactive le mode vehicule",
                               "quitte le mode vehicule", "fin du mode vehicule")):
        actifs = [d for d in (_theme_session_overrides, _tech_knowledge_session_overrides,
                              _culinary_session_overrides) if d.get(session_id)]
        mode_vehicule_actif = bool(
            _VEHICLE_MODE_AVAILABLE and vehicle_mode is not None
            and vehicle_mode.is_active(session_id)
        )
        if mode_vehicule_actif:
            vehicle_mode.deactivate(session_id)
        if actifs or mode_vehicule_actif:
            for d in actifs:
                d.pop(session_id, None)
            if mode_vehicule_actif and actifs:
                reply = ("Mode normal restauré : thème et modes spéciaux désactivés, "
                         "mode commande véhicule désactivé. Conversation normale.")
            elif mode_vehicule_actif:
                reply = "Mode commande véhicule désactivé. Conversation normale."
            else:
                reply = ("Mode normal restauré. Aucun thème actif : je réponds "
                         "à nouveau sans branche spécialisée.")
            return {"reply": reply, "tts_reply": reply, "action": "theme_cleared"}
        if any(p in norm for p in ("mode normal", "theme normal", "tem normal",
                                   "bouton normal", "aucun theme", "plus de theme",
                                   "sans theme", "retire le theme", "enleve le theme",
                                   "desactive le mode commande", "quitte le mode commande",
                                   "desactive le mode vehicule", "quitte le mode vehicule",
                                   "fin du mode vehicule")):
            # Phrase de reset explicite alors que rien n'est actif : réponse
            # déterministe plutôt qu'une invention du LLM.
            return {"reply": "Nous sommes déjà en mode normal. Conversation normale.",
                    "tts_reply": "Nous sommes déjà en mode normal.", "action": "theme_cleared"}
    selected = "hifi90" if hifi_word else next((theme for alias, theme in aliases if alias in norm), None)
    if selected is None:
        return None
    _theme_session_overrides[session_id] = selected
    _tech_knowledge_session_overrides[session_id] = selected in ("k4000", "hifi90", "consoles", "charleroi", "pontiac")
    _culinary_session_overrides[session_id] = False
    labels = {"berger": "Berger australien", "series80": "Séries 80", "hifi90": "Hi-Fi années 90", "consoles": "Consoles de jeux", "charleroi": "Charleroi", "pontiac": "Pontiac / moteurs", "karr": "KARR"}
    label = labels.get(selected, selected)
    if selected == "karr":
        reply = """<section class="karr-card"><h3>AIDE KARR</h3><p>Thème KARR activé. KARR est distinct de KITT et de la K-4000.</p><table class="help-table"><thead><tr><th>Fonction</th><th>Commande vocale</th></tr></thead><tbody><tr><td>Informations KARR</td><td>« affiche les informations de KARR »</td></tr><tr><td>Voice Box et scanner</td><td>« affiche le tableau KARR »</td></tr><tr><td>Thèmes</td><td>« active le thème KITT » ou « active le thème KARR »</td></tr><tr><td>Véhicule</td><td>« affiche l’aide des fonctions voiture »</td></tr></tbody></table></section>"""
        return {"reply": reply, "tts_reply": "Thème KARR activé. Je te lis l’aide : dis affiche les informations de KARR, affiche le tableau KARR, ou active le thème KITT.", "action": "theme_selected_karr"}
    if selected == "k4000":
        _tech_knowledge_session_overrides[session_id] = True
        reply = "<section class=\"technical-card\"><h3>AIDE K-4000 / KR95</h3><p>Branche K-4000 activée. Elle est distincte de KITT K2000 de Pascal Fairon.</p><table class=\"help-table\"><thead><tr><th>Fonction</th><th>Commande</th></tr></thead><tbody><tr><td>Pièces et construction</td><td>« affiche le tableau des pièces K-4000 »</td></tr><tr><td>Moteurs Pontiac</td><td>« affiche le tableau des moteurs Pontiac »</td></tr><tr><td>Retour KITT</td><td>« active le thème KITT »</td></tr></tbody></table></section>"
        return {"reply": reply, "tts_reply": "Branche K-4000 KR95 activée. Elle est distincte de KITT. Dis affiche le tableau des pièces K-4000 ou des moteurs Pontiac.", "action": "theme_selected_k4000"}
    if selected == "voiture":
        reply = "<section class=\"vehicle-help-card\"><h3>AIDE VOITURE</h3><p>Thème Voiture activé. Les commandes physiques restent protégées par le mode commande et une confirmation.</p><table class=\"help-table\"><thead><tr><th>Fonction</th><th>Commande</th></tr></thead><tbody><tr><td>Vitres</td><td>« baisse la vitre conducteur »</td></tr><tr><td>Phares</td><td>« allume les phares »</td></tr><tr><td>Coffre</td><td>« ouvre le coffre »</td></tr><tr><td>Klaxon</td><td>« affiche les styles de klaxon »</td></tr></tbody></table></section>"
        return {"reply": reply, "tts_reply": "Thème Voiture activé. Les commandes physiques restent protégées par le mode commande et une confirmation.", "action": "theme_selected_voiture"}
    if selected == "charleroi":
        return _charleroi_catalog_result(user_msg, session_id, force=True)
    if selected == "pontiac":
        return _pontiac_engine_table_result("Affiche le tableau des moteurs Pontiac", session_id)
    return {"reply": f"Thème {label} activé. Je peux maintenant répondre en priorité avec les informations de cette branche.", "action": f"theme_selected_{selected}"}


def _gamin_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if "gamin" not in norm:
        return None
    return {
        "reply": "Gamin est le chien du conducteur. C’est un Berger australien, né le 6 mars 2023.",
        "action": "gamin_profile",
    }


def _berger_australien_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    mentions_berger = any(x in norm for x in ("berger australien", "berge australien", "berger austr"))
    if "tableau" in norm or "liste" in norm:
        return None
    if not mentions_berger and norm not in ("continue", "continues", "poursuis"):
        return None
    if not mentions_berger:
        recent = conversations.get(session_id, []) if "conversations" in globals() else []
        if not any("berger austr" in _normalize_memory_text(str(m.get("content", ""))) for m in recent[-8:] if isinstance(m, dict)):
            return None
    detailed = any(x in norm for x in ("information", "etude", "approfond", "detail", "plus", "fiche"))
    if not detailed and mentions_berger:
        return None
    reply = ("Le Berger australien, ou Australian Shepherd, est une race de chiens de berger et de bouvier du groupe 1 FCI, standard n°342. "
             "Malgré son nom, il a été développé aux États-Unis au XIXe siècle à partir de chiens de troupeau européens et de lignées locales. "
             "Les mâles mesurent environ 51 à 58 cm au garrot et les femelles 46 à 53 cm ; le poids se situe généralement entre 18 et 29 kg. "
             "Les robes reconnues sont noir tricolore, rouge, bleu merle et rouge merle, avec ou sans marques blanches et feu. "
             "Les yeux peuvent être bruns, bleus, verts, ambre ou vairons ; la queue peut être longue ou naturellement courte. "
             "C’est un chien intelligent, actif, loyal et parfois réservé avec les inconnus. Il a besoin chaque jour d’exercice physique et de stimulation mentale, idéalement une à deux heures pour un adulte en bonne santé. "
             "L’éducation positive, la socialisation progressive et des activités comme l’agility, le troupeau ou la recherche d’objets lui conviennent. "
             "Les points de vigilance incluent dysplasie, anomalies oculaires, épilepsie et sensibilité MDR1. Un accouplement merle avec merle est à éviter en raison de risques graves pour les chiots. Pour toute question médicale, consulte un vétérinaire.")
    return {"reply": reply, "action": "berger_australien_info"}


def _series_catalog_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    # Whisper peut produire « Syri », « Siri » ou « l'aliste des Syri » pour
    # « séries ». On accepte ces variantes uniquement avec une demande de liste.
    series_word = any(x in norm for x in ("serie", "series", "syri", "siri", "s erie"))
    list_word = any(x in norm for x in ("liste", "listing", "aliste", "tableau", "informations", "possede", "annee", "affichement"))
    if "affiche les series" in norm:
        list_word = True
    if not series_word and _theme_session_overrides.get(session_id) == "series80" and any(x in norm for x in (
        "continue", "suite", "plus", "detail", "developpe", "approfond", "information", "c est tout",
    )):
        series_word = True
        list_word = True
    if not series_word or not list_word:
        return None
    reply = """<section class="series-card"><h3>SÉRIES CULTES — ANNÉES 70/80</h3><p>Chaque ligne donne le genre, les personnages, le concept, le véhicule ou l'élément visuel marquant. Dis un titre, même avec une prononciation approchante, pour ouvrir sa fiche.</p><table class="help-table"><thead><tr><th>Série</th><th>Diffusion</th><th>Personnages / concept</th><th>Véhicule / repère</th></tr></thead><tbody>
<tr><td>K2000 / Knight Rider</td><td>1982–1986</td><td>Michael Knight, agent de la Fondation pour la loi et le gouvernement, agit avec KITT, une voiture intelligente.</td><td>Pontiac Trans Am noire, scanner rouge, Turbo Boost, voix et ordinateur embarqué.</td></tr>
<tr><td>CHiPs</td><td>1977–1983</td><td>Jon Baker et Frank « Ponch » Poncherello patrouillent sur les autoroutes californiennes.</td><td>Motos de la California Highway Patrol, interventions routières et poursuites.</td></tr>
<tr><td>Starsky et Hutch</td><td>1975–1979</td><td>Deux policiers en civil de Bay City enquêtent avec l'aide de Huggy Bear et du capitaine Dobey.</td><td>Ford Gran Torino rouge à bande blanche, surnommée « la tomate rayée ».</td></tr>
<tr><td>Les Têtes brûlées / Baa Baa Black Sheep</td><td>1976–1978</td><td>Le major Greg « Pappy » Boyington commande un escadron de pilotes atypiques dans le Pacifique.</td><td>Chance Vought F4U Corsair, missions aériennes et esprit de groupe.</td></tr>
<tr><td>L'Agence tous risques</td><td>1983–1987</td><td>Hannibal, Futé, Looping et Barracuda, anciens militaires recherchés, aident les innocents.</td><td>GMC Vandura noir et gris, plans, bricolage et action sans tuer.</td></tr>
<tr><td>Magnum</td><td>1980–1988</td><td>Thomas Magnum, ancien officier du renseignement, devient détective privé à Hawaï.</td><td>Ferrari 308 GTS, domaine de Robin Masters, Higgins, T.C. et Rick.</td></tr>
<tr><td>Supercopter / Airwolf</td><td>1984–1987</td><td>Stringfellow Hawke accomplit des missions secrètes avec un hélicoptère expérimental.</td><td>Airwolf, hélicoptère furtif supersonique, technologie militaire et musique électronique.</td></tr>
<tr><td>Tonnerre mécanique / Street Hawk</td><td>1985</td><td>Jesse Mach utilise une moto expérimentale pour lutter contre le crime.</td><td>Moto noire futuriste, vitesse élevée, navigation et système de surveillance.</td></tr>
</tbody></table><p>Tu peux demander : « raconte K2000 », « parle-moi de Starsky et Hutch », « quelle voiture dans Magnum ? » ou « développe Supercopter ».</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau enrichi des séries cultes. Il présente les personnages, le concept et les véhicules ou éléments marquants. Dis le nom d'une série pour sa fiche détaillée.", "action": "series_catalog"}


def _series_specific_result(user_msg: str) -> dict | None:
    """Recognize spoken series titles, notably CHiPs (often « Cheeps »)."""
    norm = _normalize_memory_text(user_msg)
    if any(x in norm for x in ("quel age", "quelle age", "age de")):
        return None
    starsky = any(x in norm for x in (
        "starsky", "starky", "starkey", "starski", "starksi", "star ski",
        "starsky et hutch", "starky et hutch", "starkey et hutch", "starky et hodge",
        "starkey et hodge", "starsky et hodge",
    )) or ("hutch" in norm and any(x in norm for x in ("starsky", "starky", "starkey", "hodge")))
    if starsky:
        reply = """<section class="series-card"><h3>STARSKY ET HUTCH</h3><p>Série policière américaine diffusée de 1975 à 1979. David Starsky et Ken « Hutch » Hutchinson sont deux policiers en civil de Bay City, aidés par leur supérieur le capitaine Dobey et leur informateur Huggy Bear.</p><table class="help-table"><thead><tr><th>Rubrique</th><th>Détail</th></tr></thead><tbody>
<tr><td>Personnages</td><td>Starsky est impulsif et instinctif ; Hutch est plus posé et réfléchi. Leur complémentarité forme le cœur de la série.</td></tr>
<tr><td>Véhicule</td><td>Ford Gran Torino rouge de 1974, avec bande blanche latérale, devenue l'un des grands véhicules de la télévision.</td></tr>
<tr><td>Univers</td><td>Enquêtes en civil, filatures, informateurs et interventions dans les quartiers difficiles de Bay City.</td></tr>
<tr><td>Style</td><td>Duo de partenaires, action urbaine, humour et amitié, avec une forte identité visuelle des années 70.</td></tr>
</tbody></table></section>"""
        tts = "Starsky et Hutch. Série policière américaine diffusée de 1975 à 1979. Starsky et Hutch sont deux policiers en civil de Bay City. Leur voiture est une Ford Gran Torino rouge à bande blanche."
        return {"reply": reply, "tts_reply": tts, "action": "series_starsky_hutch_info"}
    magnum = any(x in norm for x in ("magnum", "machinum", "machinum", "megaderm", "megaderm", "magnum pi", "magnum p i"))
    if magnum:
        return {
            "reply": "Magnum, ou Magnum P.I., est une série policière et d’aventures américaine diffusée de 1980 à 1988. Elle suit Thomas Magnum, détective privé à Hawaï, interprété par Tom Selleck.",
            "action": "series_magnum_info",
        }
    tonnerre = any(x in norm for x in (
        "tonnerre mecanique", "tonner mechanique", "tonner mecanique",
        "tonner avec annie", "tonnerre avec annie", "street hawk",
    ))
    if tonnerre:
        return {
            "reply": "Tonnerre mécanique, ou Street Hawk, est une série d’action américaine diffusée en 1985. Elle suit Jesse Mach, qui utilise une moto futuriste très rapide équipée de technologies avancées.",
            "action": "series_tonnerre_mecanique_info",
        }
    supercopter = any(x in norm for x in ("supercopter", "super copter", "super helicopter", "super helicoptere", "airwolf", "air wolf"))
    if supercopter:
        return {
            "reply": "Supercopter, connu sous le titre original Airwolf, est une série d’action diffusée de 1984 à 1987. Stringfellow Hawke pilote l’hélicoptère furtif Airwolf pour des missions secrètes et des opérations de sauvetage.",
            "action": "series_supercopter_info",
        }
    chips = any(x in norm for x in ("chips", "ships", "ship", "cheeps", "cheap", "cheaps", "chi ps", "chip", "chipe"))
    if not chips:
        return None
    if len(norm.split()) > 8 and not any(x in norm for x in ("serie", "série", "fiche", "parle", "informations", "tableau")):
        return None
    return {
        "reply": "CHiPs est une série policière américaine diffusée de 1977 à 1983. Elle suit les motards Jon Baker et Frank Poncherello de la California Highway Patrol, en patrouille sur les autoroutes de Los Angeles.",
        "action": "series_chips_info",
    }


def _dossiers_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if norm not in ("dossier", "dossiers", "dosier", "dosiers", "doshi", "doshier", "dos ie", "dossie", "dossies", "fischlade") and not (norm.startswith("dossier ") and len(norm.split()) <= 3):
        return None
    reply = "Dossiers disponibles : MNX pour le dossier Manix, PASCAL pour le dossier de Pascal Fairon, et les branches Berger australien, Cuisine, Séries 80, Musique et Technique. Dis « ouvre MNX » ou « ouvre PASCAL » pour accéder aux panneaux dédiés."
    return {"reply": reply, "action": "dossiers_list"}


def _dossier_followup_result(user_msg: str, session_id: str) -> dict | None:
    """Keep dossier follow-ups deterministic instead of sending them to the LLM.

    The voice recognizer often turns « dossiers » into « Fischlade » or « DOS IE ».
    After the catalog is shown, short confirmations must not invent a person or
    silently switch to an unrelated dossier.
    """
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    history = conversations.get(session_id, []) if "conversations" in globals() else []
    had_catalog = any(
        isinstance(item, dict) and item.get("role") == "assistant"
        and "dossiers disponibles" in _normalize_memory_text(str(item.get("content", "")))
        for item in history[-8:]
    )
    if not had_catalog:
        return None
    if norm in ("oui", "oui affiche", "affiche", "affiche le", "montre", "montre moi", "affichage"):
        return {
            "reply": "Voici à nouveau les dossiers disponibles : MNX pour le dossier Manix, PASCAL pour le dossier de Pascal Fairon, et les branches Berger australien, Cuisine, Séries 80, Musique et Technique. Dis le nom exact du dossier à ouvrir.",
            "action": "dossiers_list",
        }
    if norm in ("manix", "mnx", "ouvre manix", "ouvre mnx"):
        return {"reply": "Dossier MNX (Manix) sélectionné. Dis ce que tu veux consulter dans ce dossier.", "action": "dossier_mnx_selected"}
    if norm in ("pascal", "pascal fairon", "ouvre pascal", "ouvre pascal fairon"):
        return {"reply": "Dossier PASCAL sélectionné. Il concerne Pascal Fairon et la KITT K2000.", "action": "dossier_pascal_selected"}
    if norm.startswith(("dossier ", "ouvre le dossier ", "ouvre dossier ")):
        if any(name in norm for name in ("emmanuel", "frank", "cedric", "c edric")):
            return {"reply": "Je ne dispose pas d’un dossier Emmanuel, Frank ou Cédric dans le catalogue de Pascal. Les dossiers disponibles sont MNX, PASCAL, Berger australien, Cuisine, Séries 80, Musique et Technique.", "action": "dossier_unknown"}
    return None


def _music_catalog_result(user_msg: str, session_id: str = "") -> dict | None:
    """Catalogue vocal des musiques 80–90, avec variantes ASR fréquentes."""
    norm = _normalize_memory_text(user_msg)
    music_word = any(x in norm for x in ("musique", "musiques", "music", "moraliste", "mouard"))
    list_word = any(x in norm for x in ("tableau", "liste", "affiche", "montre", "fish", "fisch", "eiffish"))
    if not music_word and _theme_session_overrides.get(session_id, "") == "musique8090" and any(x in norm for x in (
        "continue", "suite", "plus", "detail", "developpe", "approfond", "information", "c est tout",
    )):
        music_word = True
        list_word = True
    if not (music_word and list_word):
        return None
    reply = """<section class="music-card"><h3>MUSIQUES CULTES — ÉLECTRONIQUE, ROCK ET POP</h3><p>Repères d'écoute des années 70, 80 et 90 : artistes, albums, titres et contexte. Dis un nom ou un titre pour une fiche détaillée.</p><table class="help-table"><thead><tr><th>Artiste</th><th>Repères et albums</th><th>Style / intérêt</th></tr></thead><tbody>
<tr><td>Jean-Michel Jarre</td><td>Oxygène (1976), Équinoxe (1978), Révolutions (1988), Rendez-Vous (1986)</td><td>Pionnier français de l'électronique et des concerts-spectacles en plein air.</td></tr>
<tr><td>Michael Jackson</td><td>Off the Wall (1979), Thriller (1982), Bad (1987) ; Smooth Criminal</td><td>Pop, danse et clips ; Thriller est un album majeur de la pop mondiale.</td></tr>
<tr><td>ZZ Top</td><td>Eliminator (1983), Afterburner (1985) ; Gimme All Your Lovin', Sharp Dressed Man</td><td>Blues rock texan, guitares, barbes et clips automobiles très reconnaissables.</td></tr>
<tr><td>AC/DC</td><td>Highway to Hell (1979), Back in Black (1980), The Razors Edge (1990)</td><td>Hard rock à riffs ; périodes Bon Scott puis Brian Johnson.</td></tr>
<tr><td>Queen</td><td>A Night at the Opera (1975), The Game (1980), A Kind of Magic (1986)</td><td>Rock théâtral, harmonies vocales, guitare de Brian May et voix de Freddie Mercury.</td></tr>
<tr><td>Quincy Jones</td><td>Producteur de Off the Wall, Thriller et Bad ; arrangeur et compositeur de jazz</td><td>Production, orchestration, jazz, soul et pop ; pont entre studios et grands artistes.</td></tr>
<tr><td>Depeche Mode</td><td>Black Celebration (1986), Music for the Masses (1987), Violator (1990)</td><td>New wave et synth-pop sombre ; Personal Jesus et Enjoy the Silence.</td></tr>
<tr><td>Indochine</td><td>L'Aventurier (1982), 3e sexe (1985), 7000 danses (1987)</td><td>Rock français et new wave, porté par Nicola Sirkis et un univers très identifiable.</td></tr>
<tr><td>Dire Straits</td><td>Dire Straits (1978), Making Movies (1980), Brothers in Arms (1985)</td><td>Rock mélodique, guitare de Mark Knopfler ; Money for Nothing et Sultans of Swing.</td></tr>
<tr><td>Vangelis</td><td>Chariots of Fire (1981), Blade Runner (1982), 1492: Conquest of Paradise (1992)</td><td>Musique électronique et de film, synthétiseurs, atmosphères cinématographiques.</td></tr>
</tbody></table><p>Exemples : « parle-moi d'Oxygène », « fiche Thriller », « qui est Mark Knopfler ? » ou « détaille Depeche Mode ».</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau enrichi des musiques cultes. Il présente les albums, les titres et le style de chaque artiste. Dis un nom ou un titre pour la fiche détaillée.", "action": "music_catalog"}


def _music_artist_result(user_msg: str, session_id: str = "") -> dict | None:
    norm = _normalize_memory_text(user_msg)
    entries = {
        "acdc": ("AC/DC", "Groupe formé à Sydney en 1973 par les frères Young. Son hard rock repose sur des riffs simples, une guitare très directe et une forte énergie scénique. Highway to Hell date de 1979 ; Back in Black, paru en 1980 après la disparition de Bon Scott, est associé à l'arrivée de Brian Johnson. You Shook Me All Night Long et The Razors Edge sont d'autres repères."),
        "queen": ("Queen", "Groupe britannique fondé à Londres autour de Freddie Mercury, Brian May, Roger Taylor et John Deacon. Queen mélange rock, opéra, ballade et spectacle. A Night at the Opera et Bohemian Rhapsody marquent les années 70 ; Radio Ga Ga, We Will Rock You et A Kind of Magic restent des titres emblématiques des années 80."),
        "zztop": ("ZZ Top", "Trio texan formé à Houston en 1969, avec Billy Gibbons, Dusty Hill et Frank Beard. Son blues rock associe guitare, boogie et image très reconnaissable. L'album Eliminator de 1983 et ses clips de Gimme All Your Lovin' et Sharp Dressed Man ont fortement marqué la culture musicale et automobile des années 80."),
        "michael jackson": ("Michael Jackson", "Artiste américain passé de la soul et du funk à une pop spectaculaire. Off the Wall (1979) prépare son succès mondial ; Thriller (1982) et Bad (1987) associent production de Quincy Jones, danse et clips ambitieux. Billie Jean, Beat It, Smooth Criminal et Thriller sont des titres repères."),
        "quincy jones": ("Quincy Jones", "Compositeur, arrangeur, chef d'orchestre et producteur américain. Il travaille dans le jazz, le cinéma, la soul et la pop, puis produit notamment Off the Wall, Thriller et Bad de Michael Jackson. Son rôle est celui d'un architecte sonore : arrangements, musiciens, prises et équilibre du disque."),
        "jean michel jarre": ("Jean-Michel Jarre", "Compositeur français né en 1948, figure majeure de la musique électronique instrumentale. Oxygène (1976) et Équinoxe (1978) utilisent les synthétiseurs et les séquenceurs pour créer des paysages sonores. Rendez-Vous et Révolutions prolongent cette recherche, souvent avec de grands concerts audiovisuels et des projections lumineuses."),
        "depeche mode": ("Depeche Mode", "Groupe anglais formé à Basildon en 1980. Sa new wave évolue vers une synth-pop plus sombre et plus organique, notamment avec Black Celebration, Music for the Masses et Violator. Martin Gore écrit une grande partie du répertoire ; Personal Jesus et Enjoy the Silence sont deux portes d'entrée essentielles."),
        "indochine": ("Indochine", "Groupe français fondé en 1981, associé au rock et à la new wave. L'Aventurier (1982) installe son univers et devient un titre phare ; 3e sexe et Canary Bay illustrent son écriture et ses sonorités synthétiques. Le groupe est porté notamment par Nicola Sirkis et conserve une identité très reconnaissable."),
        "dire straits": ("Dire Straits", "Groupe britannique fondé à Londres en 1977 autour de Mark Knopfler. Le son repose sur un rock épuré, une guitare aux arpèges très précis et une voix posée. Dire Straits, Making Movies et Brothers in Arms jalonnent le parcours ; Sultans of Swing et Money for Nothing sont les titres les plus immédiatement reconnaissables."),
        "vangelis": ("Vangelis", "Compositeur grec de musique électronique, né Evángelos Odysséas Papathanassíou. Ses bandes originales utilisent des synthétiseurs, des chœurs et des textures orchestrales. Chariots of Fire (1981) et Blade Runner (1982) montrent deux facettes : l'élan mélodique et l'atmosphère futuriste ; 1492: Conquest of Paradise date de 1992."),
    }
    compact = norm.replace(" ", "")
    key = None
    if compact in ("acdc", "a c d c", "adosine", "a dos signes", "a deux signes") or "ac dc" in norm:
        key = "acdc"
    elif any(x in norm for x in ("oxygene", "oxygene revolution", "revolution jarre", "jean michel jarre", "jean michel")):
        key = "jean michel jarre"
    elif any(x in norm for x in ("thriller", "smooth criminal", "billie jean", "michael jackson")):
        key = "michael jackson"
    elif any(x in norm for x in ("gimme all your lovin", "sharp dressed man", "eliminator", "zz top")):
        key = "zztop"
    elif any(x in norm for x in ("back in black", "highway to hell", "you shook me", "the razors edge")):
        key = "acdc"
    elif any(x in norm for x in ("radio ga ga", "bohemian rhapsody", "we will rock you", "queen")):
        key = "queen"
    elif any(x in norm for x in ("personal jesus", "enjoy the silence", "violator", "depeche", "dep eche")):
        key = "depeche mode"
    elif any(x in norm for x in ("aventurier", "canary bay", "troisieme sexe", "indochine", "indo chine")):
        key = "indochine"
    elif any(x in norm for x in ("money for nothing", "sultans of swing", "brothers in arms", "dire straits", "mark knopfler")):
        key = "dire straits"
    elif any(x in norm for x in ("chariots of fire", "blade runner", "1492", "vangelis")):
        key = "vangelis"
    elif any(x in norm for x in ("quincy", "producteur de thriller", "producteur thriller")):
        key = "quincy jones"
    elif any(x in norm for x in (
        "depeche mode", "dipesh mode", "dipesh", "depesh mode", "depesh",
        "peche moudre", "peche mode", "depech mode", "depech",
    )):
        key = "depeche mode"
    else:
        key = next((k for k in entries if k in norm), None)
    # Après une fiche, « donne-moi plus d'informations » doit rester attaché
    # au dernier artiste cité dans cette session, sans envoyer tout l'historique
    # au LLM.
    if key is None and session_id and any(x in norm for x in (
        "plus d information", "plus d informations", "plus de detail", "plus de details",
        "developpe", "approfond", "c est tout", "continue", "en dire plus",
    )):
        recent = conversations.get(session_id, []) if "conversations" in globals() else []
        recent_norm = " ".join(_normalize_memory_text(str(m.get("content", ""))) for m in recent[-8:] if isinstance(m, dict))
        aliases = {
            "depeche mode": ("depeche mode", "dipesh mode", "dipesh", "peche moudre", "peche mode", "depech"),
            "jean michel jarre": ("jean michel jarre", "oxygene", "revolution"),
            "michael jackson": ("michael jackson", "thriller", "smooth criminal", "billie jean"),
            "zztop": ("zz top", "gimme all your lovin", "sharp dressed man", "eliminator"),
            "acdc": ("ac dc", "back in black", "highway to hell"),
            "queen": ("queen", "radio ga ga", "bohemian rhapsody"),
            "indochine": ("indochine", "indo chine", "aventurier", "canary bay"),
            "dire straits": ("dire straits", "mark knopfler", "money for nothing"),
            "vangelis": ("vangelis", "blade runner", "chariots of fire"),
            "quincy jones": ("quincy jones", "quincy", "producteur thriller"),
        }
        for candidate, candidate_aliases in aliases.items():
            if any(alias in recent_norm for alias in candidate_aliases):
                key = candidate
                break
    if key is None:
        return None
    name, detail = entries[key]
    return {"reply": f"<section class=\"music-card\"><h3>{name}</h3><p>{detail}</p></section>", "tts_reply": f"{name}. {detail}", "action": "music_artist_info"}


def _hifi_catalog_result(session_id: str = "default") -> dict:
    """Tableau local de la branche Hi-Fi, sans appel au LLM."""
    reply = """<section class="technical-card hifi-catalog"><h3>📻 HI-FI DES ANNÉES 90 — TABLEAU</h3><p>Repères sur les formats numériques, les lecteurs-enregistreurs et les appareils audio-vidéo de la période.</p><table class="help-table"><thead><tr><th>Appareil / format</th><th>Fonction</th><th>Repère historique</th></tr></thead><tbody>
<tr><td>DAT</td><td>Lecture et enregistrement audio numérique sur bande.</td><td>Très haute fidélité, utilisé en studio et dans certaines chaînes haut de gamme.</td></tr>
<tr><td>DCC Philips</td><td>Cassette numérique enregistrable et lisible ; compatibilité avec les cassettes analogiques selon le lecteur.</td><td>Format numérique Philips concurrent du MiniDisc et du DAT.</td></tr>
<tr><td>MiniDisc Sony</td><td>Enregistrement et lecture sur disque magnéto-optique réinscriptible.</td><td>Format compact utilisant la compression ATRAC, pratique pour les enregistrements personnels.</td></tr>
<tr><td>Lecteur CD</td><td>Lecture de disques compacts audio.</td><td>Élément central des chaînes hi-fi des années 90, avec affichage de piste et programmation.</td></tr>
<tr><td>Double platine cassette</td><td>Lecture, copie et enregistrement de cassettes analogiques.</td><td>Souvent associée à la fonction dubbing et à la réduction de bruit.</td></tr>
<tr><td>Vidéodisque / LaserDisc</td><td>Lecture d'un grand disque optique contenant image et son.</td><td>Support audiovisuel antérieur au DVD ; qualité et capacité supérieures à la VHS, mais appareils encombrants.</td></tr>
<tr><td>Ampli-tuner</td><td>Amplification stéréo et réception radio FM/AM.</td><td>Centre de commande d'une chaîne hi-fi, parfois complété par un égaliseur.</td></tr>
<tr><td>Égaliseur</td><td>Réglage des bandes de fréquences.</td><td>Afficheurs à barres et préréglages « rock », « pop » ou « flat » très typiques de l'époque.</td></tr>
</tbody></table><p>Dis « DAT », « DCC Philips », « MiniDisc », « LaserDisc » ou « lecteur CD » pour obtenir une fiche détaillée.</p></section>"""
    tts = "Voici le tableau Hi-Fi des années 90 : DAT, DCC Philips, MiniDisc Sony, lecteur CD, double platine cassette, vidéodisque LaserDisc, ampli-tuner et égaliseur. Dis le nom d'un appareil pour sa fiche détaillée."
    return {"reply": reply, "tts_reply": tts, "action": "hifi_catalog"}


def _active_theme_catalog_result(user_msg: str, session_id: str) -> dict | None:
    """Résout « affiche le tableau » selon la branche actuellement sélectionnée."""
    norm = _normalize_memory_text(user_msg)
    asks_catalog = any(x in norm for x in ("tableau", "tablo", "liste", "affiche", "montre", "infos", "information", "informations", "ouvre", "ouvrir"))
    if not asks_catalog:
        return None
    hifi_query = any(x in norm for x in (
        "hifi 90", "hi fi 90", "iffi 90", "ifi 90", "i fi 90",
        "iski 90", "isky 90", "ici 90", "ici nonante",
        "efi 90", "e fi 90", "effi 90", "effi nonante",
        "efi nonante", "iffy 90", "iffy nonante", "tablo iffy",
        "ifinodente", "il fit dans l arbre", "il fait nonante",
    ))
    if hifi_query:
        return _hifi_catalog_result(session_id)
    # Avec un sujet explicite, les catalogues spécialisés ont priorité.
    if any(x in norm for x in (
        "moteur", "moteurs", "console", "nintendo", "playstation", "musique", "serie",
        "charleroi", "cuisine", "klaxon", "bouton", "kitt", "karr", "pontiac",
    )):
        return None
    theme = _theme_session_overrides.get(session_id)
    if theme == "series80":
        return _series_catalog_result("affiche le tableau des series", session_id)
    if theme == "musique8090":
        return _music_catalog_result("affiche le tableau de musique", session_id)
    if theme == "hifi90":
        return _hifi_catalog_result(session_id)
    if theme == "k4000":
        # Une demande générique (« affiche le tableau ») doit rester dans
        # la branche K-4000 au lieu de repartir vers le LLM généraliste.
        return _k4000_parts_table_result("affiche le tableau des pièces K-4000", session_id)
    if theme == "charleroi":
        return _charleroi_catalog_result("affiche le tableau de Charleroi", session_id, force=True)
    if theme == "pontiac":
        return _pontiac_engine_table_result("affiche le tableau des moteurs Pontiac", session_id)
    if theme == "consoles":
        return _console_catalog_result("affiche le tableau des consoles", session_id)
    if theme == "kitt":
        return _kitt_info_result("affiche le tableau KITT")
    if theme == "karr":
        return _karr_info_result("affiche le tableau KARR", session_id)
    return None


def _joke_result(user_msg: str, session_id: str = "default") -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not any(x in norm for x in ("blague", "blagues", "raconte une blague", "fais moi rire")):
        return None
    category_jokes = {
        "informatique": "Pourquoi le mécanicien aime-t-il les ordinateurs ? Parce qu’ils ont toujours besoin d’une bonne mise au point !",
        "ordinateur": "Pourquoi le mécanicien aime-t-il les ordinateurs ? Parce qu’ils ont toujours besoin d’une bonne mise au point !",
        "automobile": "Que dit une voiture quand elle a froid ? Je vais mettre le chauffage en mode moteur !",
        "voiture": "Que dit une voiture quand elle a froid ? Je vais mettre le chauffage en mode moteur !",
        "klaxon": "Pourquoi le klaxon ne raconte-t-il jamais de secrets ? Parce qu’il finit toujours par tout klaxonner !",
        "kitt": "Pourquoi KITT ne tombe-t-il jamais en panne de mémoire ? Parce qu’il garde toujours ses bons contacts !",
    }
    selected_category = next((key for key in category_jokes if key in norm), None)
    jokes = (
        "Pourquoi KITT ne tombe-t-il jamais en panne de mémoire ? Parce qu’il garde toujours ses bons contacts !",
        "Pourquoi le mécanicien aime-t-il les ordinateurs ? Parce qu’ils ont toujours besoin d’une bonne mise au point !",
        "Que dit une voiture quand elle a froid ? Je vais mettre le chauffage en mode moteur !",
        "Pourquoi le klaxon ne raconte-t-il jamais de secrets ? Parce qu’il finit toujours par tout klaxonner !",
    )
    count = len(conversations.get(session_id, [])) if "conversations" in globals() else 0
    joke = category_jokes[selected_category] if selected_category else jokes[(count // 2) % len(jokes)]
    if "?" in joke:
        question, punchline = joke.split("?", 1)
        tts = f"{question.strip()} ? … … {punchline.strip()}"
    else:
        tts = joke
    return {"reply": joke, "tts_reply": tts, "action": "joke_told"}


def _joke_catalog_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not any(x in norm for x in ("blague", "blagues")) or not any(x in norm for x in ("liste", "tableau", "affiche", "montre")):
        return None
    reply = """<section class="jokes-card"><h3>Blagues disponibles</h3><table class="help-table"><thead><tr><th>Type</th><th>Blague</th></tr></thead><tbody>
<tr><td>KITT</td><td>Pourquoi KITT ne tombe-t-il jamais en panne de mémoire ? Parce qu’il garde toujours ses bons contacts !</td></tr>
<tr><td>Informatique</td><td>Pourquoi le mécanicien aime-t-il les ordinateurs ? Parce qu’ils ont toujours besoin d’une bonne mise au point !</td></tr>
<tr><td>Automobile</td><td>Que dit une voiture quand elle a froid ? Je vais mettre le chauffage en mode moteur !</td></tr>
<tr><td>Klaxon</td><td>Pourquoi le klaxon ne raconte-t-il jamais de secrets ? Parce qu’il finit toujours par tout klaxonner !</td></tr>
</tbody></table><p>Dis « raconte la blague automobile » ou choisis une catégorie.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau des blagues disponibles. Choisis une catégorie pour en entendre une.", "action": "joke_catalog"}


def _horn_styles_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    horn_words = (
        "klaxon", "klaxons", "claxon", "claxons", "clacson", "clacsons",
        "clackson", "clakson", "clason", "clexon", "clexons", "clexson",
        "klakson", "klason", "cracson", "craxon", "graxum", "graxon",
        "klaxom", "claxom", "eclaction", "eclaxon", "avertisseur",
    )
    if not any(x in norm for x in horn_words) or not any(x in norm for x in ("style", "styles", "mode", "liste", "tableau", "choix")):
        return None
    reply = """<section class="technical-card horn-card"><h3>📯 TABLEAU DES KLAXONS</h3><p>Chaque son est limité et passe par la protection du service véhicule.</p><table class="help-table"><thead><tr><th>Nom</th><th>Effet</th><th>Commande vocale</th></tr></thead><tbody>
<tr><td>Klaxon normal</td><td>Impulsion courte standard</td><td>« joue le klaxon normal »</td></tr>
<tr><td>Double klaxon</td><td>Deux bips de confirmation</td><td>« joue le double klaxon »</td></tr>
<tr><td>Klaxon amical</td><td>Deux impulsions douces</td><td>« joue le klaxon amical »</td></tr>
<tr><td>Klaxon mariage</td><td>Motif festif</td><td>« joue le klaxon mariage »</td></tr>
<tr><td>Klaxon mission</td><td>Motif de mission KITT</td><td>« joue le klaxon mission »</td></tr>
<tr><td>Klaxon alerte</td><td>Signal d’avertissement</td><td>« joue le klaxon d’alerte »</td></tr>
<tr><td>Klaxon SOS</td><td>Séquence SOS</td><td>« joue le klaxon SOS »</td></tr>
<tr><td>Signature KITT</td><td>Signature sonore KITT</td><td>« joue le klaxon KITT »</td></tr>
</tbody></table><p>Le bouton KLAXON ouvre aussi ces huit choix.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau des huit klaxons disponibles.", "action": "horn_styles_list"}


def _vehicle_help_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    vehicle_word = any(x in norm for x in ("vehicule", "vericule", "v q", "vq", "voiture", "fonctions voiture"))
    asks_help = any(x in norm for x in (
        "aide", "tableau", "affiche", "donne", "information", "informations", "mots",
        "fonction", "fonctionnalite", "fonctions", "commande", "commandes",
    ))
    if norm in ("v q", "vq", "vericule", "véricule"):
        asks_help = True
        vehicle_word = True
    if "tu me donnes un tableau" in norm or "donne moi un tableau" in norm:
        asks_help = True
        vehicle_word = True
    if not (vehicle_word and asks_help):
        return None
    reply = """<section class="vehicle-help-card"><h3>AIDE — fonctions véhicule</h3><table class="help-table"><thead><tr><th>Fonction</th><th>Commande vocale</th></tr></thead><tbody>
<tr><td>Vitres</td><td>« baisse la vitre conducteur » ou « remonte les vitres »</td></tr>
<tr><td>Phares</td><td>« allume les phares » ou « éteins les phares »</td></tr>
<tr><td>Coffre</td><td>« ouvre le coffre » ou « ferme le coffre »</td></tr>
<tr><td>Klaxon</td><td>« active le klaxon » ou « affiche les styles de klaxon »</td></tr>
<tr><td>Verrouillage</td><td>« verrouille les portes » ou « déverrouille les portes »</td></tr>
<tr><td>Sécurité</td><td>« arrêt d’urgence » ; une confirmation ou le mode commande est requis.</td></tr>
</tbody></table><p>Ce tableau explique les commandes ; il n’exécute aucune action physique à lui seul.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau d’aide des fonctions véhicule. Il explique les commandes sans exécuter d’action.", "action": "vehicle_help_displayed"}


def _general_logic_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if norm in ("et de moi", "et deux mois", "et de moua", "edmonds", "ed", "ilde", "en fi schraide"):
        return _help_result("aide moi") or {"reply": "Bien sûr, Pascal. Voici mon aide.", "action": "help_displayed"}
    if norm == "et toi":
        return {"reply": "Je vais très bien aussi, merci Pascal. Je reste à ton écoute et prêt à t’aider.", "action": "greeting_status"}
    if "cockpit" in norm and any(x in norm for x in ("prononce", "dire", "dis", "comprend", "sais pas")):
        return {"reply": "Compris. Le mot cockpit se prononce « cok-pit ». Je vais utiliser cette prononciation pour la voix, tout en conservant l’écriture correcte « cockpit » à l’écran.", "tts_reply": "Compris. Le mot cockpit se prononce cok-pit. Je conserve l’écriture cockpit à l’écran.", "action": "pronunciation_corrected"}
    if any(x in norm for x in ("tu fonctionnes correctement", "tu fonctionnes bien", "tu fonctionnes rapidement", "fonctionnes sur gpu", "fonctionnes sur cpu")):
        if "gpu" in norm:
            return {"reply": "Oui. Le moteur LLM est configuré pour utiliser le GPU. La transcription Whisper peut toutefois fonctionner sur le CPU lorsqu’aucun accélérateur CUDA n’est disponible.", "action": "system_compute_explained"}
        return {"reply": "Merci. Je fonctionne correctement. Je suis KITT, la K2000 de Pascal Fairon, et je peux te renseigner sur l’utilisation du CPU et du GPU.", "action": "system_status_ack"}
    if "tu es quitte" in norm or "tu etais quitte" in norm or "tu as quitte" in norm:
        return {"reply": "Non, je suis toujours en ligne et prêt à t’écouter. Si tu parles de l’arrêt du système, précise-le clairement.", "action": "system_online_ack"}
    if "machinum" in norm and any(x in norm for x in ("age", "duree", "duree de vie")):
        return {"reply": "Je ne connais pas de série documentée sous le nom Machinum. Si tu voulais dire Magnum, dis-le-moi et je t’afficherai sa fiche.", "action": "unknown_reference_clarified"}
    if "pourquoi le ciel est bleu" in norm or "ciel bleu" in norm:
        return {"reply": "Le ciel paraît bleu parce que les molécules de l’atmosphère diffusent davantage les courtes longueurs d’onde, notamment le bleu, que le rouge.", "action": "general_fact"}
    if "proposer une idee" in norm or "donne moi une idee" in norm or "sais pas quoi te demander" in norm:
        return {"reply": "Je te propose une idée : choisis une série des années 80, un artiste musical ou le dossier du Berger australien, et je te prépare une fiche détaillée.", "action": "suggestion_offered"}
    if "parle moi d un chat" in norm or "parle moi du chat" in norm:
        return {"reply": "Le chat est un mammifère domestique indépendant et curieux. Il communique notamment par sa posture, ses vocalises et son comportement, et il apprécie un environnement sûr avec des périodes de jeu et de repos.", "action": "general_fact"}
    return None


def _theme_help_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    words = set(norm.split())
    if not ("aide" in words or any(x in norm for x in ("que puis je faire", "quelles commandes", "comment utiliser"))):
        return None
    theme = _theme_session_overrides.get(session_id, "")
    labels = {
        "kitt": ("KITT", "affiche les informations de KITT ; affiche l’aide des fonctions voiture ; active le thème KARR"),
        "karr": ("KARR", "affiche les informations de KARR ; affiche le tableau véhicule ; active le thème KITT"),
        "series80": ("Séries 80", "affiche la liste des séries ; dis CHiPs, Magnum ou Supercopter"),
        "musique8090": ("Musique 80–90", "affiche le tableau des musiques ; dis AC/DC, Queen ou ZZ Top"),
        "berger": ("Berger australien", "affiche le tableau du Berger australien ; demande son origine, sa santé ou son tempérament"),
        "blagues": ("Blagues", "raconte une blague ; demande une blague belge, automobile ou absurde"),
    }
    if theme not in labels:
        # Pas de thème dédié : laisser _help_result fournir l'aide complète.
        return None
    label, commands = labels[theme]
    return {"reply": f"<section class=\"help-card\"><h3>AIDE {label}</h3><p>Commandes disponibles : {commands}.</p></section>", "tts_reply": f"Aide {label}. Commandes disponibles : afficher les dossiers. Les séries. Les musiques. Ou l’aide véhicule.", "action": "theme_help_displayed"}


def _karr_info_result(user_msg: str, session_id: str = "default") -> dict | None:
    """Fiche KARR, avec les déformations vocales « car » et « Karl »."""
    norm = _normalize_memory_text(user_msg)
    ambiguous_alias = any(x in norm for x in ("cadre", "quart", "surcarre", "sur carre"))
    if ambiguous_alias and _theme_session_overrides.get(session_id, "") != "karr" and "karr" not in norm:
        return {"reply": "J’ai une confiance moyenne sur ce mot. Veux-tu dire KARR, le système automobile, ou un cadre informatique ?", "action": "clarification_requested"}
    karr_word = any(x in norm for x in (
        "karr", "k ar", "karl", "car", "carr", "cadre", "quart",
        "surcarre", "sur carre", "gat a r r", "gat ar r", "g a r r",
    ))
    asks_info = any(x in norm for x in ("information", "infos", "fiche", "tableau", "affiche", "donne", "c est quoi", "style"))
    if not (karr_word and asks_info):
        return None
    reply = """<section class="karr-card"><h3>KARR — informations du système</h3><table class="help-table"><thead><tr><th>Élément</th><th>Informations</th></tr></thead><tbody>
<tr><td>Identité</td><td>KARR est une intelligence automobile distincte de KITT, avec sa propre personnalité et sa propre interface.</td></tr>
<tr><td>Voice Box</td><td>Affichage lumineux central représentant la veille, l’écoute, la réflexion, la parole et l’alerte.</td></tr>
<tr><td>Scanner</td><td>Animation lumineuse de surveillance inspirée de l’instrumentation automobile futuriste.</td></tr>
<tr><td>Modes</td><td>Conversation, affichage technique, diagnostic et commandes sécurisées selon les autorisations.</td></tr>
<tr><td>Interface</td><td>Thème graphique KARR avec boutons tactiles, états lumineux et panneaux d’information.</td></tr>
<tr><td>Sécurité</td><td>KARR ne doit jamais être confondu avec KITT K2000 de Pascal Fairon ni avec la K-4000 de KR95.</td></tr>
</tbody></table><p>Dis « affiche le tableau KARR » ou « active le thème KARR » pour continuer.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici les informations de KARR. KARR est distinct de KITT et de la K-4000.", "action": "karr_info"}


def _kitt_info_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if "kitt" not in norm and not any(x in norm for x in ("k it", "k 2000", "kit")):
        return None
    if not any(x in norm for x in ("information", "infos", "fiche", "tableau", "affiche", "donne", "c est quoi", "style")):
        return None
    reply = """<section class="kitt-card"><h3>KITT K2000 — informations du système</h3><table class="help-table"><thead><tr><th>Élément</th><th>Informations</th></tr></thead><tbody>
<tr><td>Identité</td><td>KITT est l’intelligence et le copilote de Pascal Fairon, distinct de KARR et de la K-4000.</td></tr>
<tr><td>Communication</td><td>Dialogue vocal, reconnaissance de la parole, réponses du LLM et synthèse vocale.</td></tr>
<tr><td>Voice Box</td><td>Noyau lumineux qui indique veille, écoute, compréhension, réflexion, parole, action et alerte.</td></tr>
<tr><td>Fonctions véhicule</td><td>Vitres, phares, coffre, relais, verrouillage, klaxon, diagnostic et arrêt d’urgence sécurisé.</td></tr>
<tr><td>Connaissances</td><td>Séries des années 80, Berger australien, cuisine, musique, humour, automobile et histoire de KITT.</td></tr>
<tr><td>Interface</td><td>Thème KITT avec boutons lumineux, tableaux lisibles et navigation adaptée au téléphone.</td></tr>
</tbody></table><p>Dis « affiche le tableau KITT » ou « active le thème KITT » pour continuer.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici les informations de KITT K2000, l’intelligence et le copilote de Pascal Fairon.", "action": "kitt_info"}


def _kitt_identity_guard(user_msg: str) -> dict | None:
    """Priorité absolue à l'identité KITT K2000 de Pascal Fairon."""
    norm = _normalize_memory_text(user_msg)
    if "kitt" not in norm and not any(x in norm for x in ("specification de kit", "specifications de kit", "systeme de kit")):
        return None
    if not any(x in norm for x in ("specification", "specifications", "systeme", "information", "fiche", "qui es", "identite", "k 4000", "k4000")):
        return None
    return {
        "reply": "KITT est la K2000 de Pascal Fairon : son intelligence embarquée et son copilote vocal. KITT n’est pas la K-4000 et n’est pas KARR.",
        "action": "kitt_identity_locked",
    }


def _dog_breed_table_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    asks_table = any(x in norm for x in ("tableau", "liste", "affiche", "montre"))
    asks_dogs = any(x in norm for x in ("race", "races", "chien", "chiens", "trace", "traces", "berger", "berges"))
    if not (asks_table and asks_dogs):
        return None
    if "berger australien" in norm or "berge australien" in norm:
        return {"reply": "<section class=\"dog-card\"><h3>Berger australien</h3><table class=\"help-table\"><thead><tr><th>Race</th><th>Origine</th><th>Taille</th><th>Poids</th><th>Robes</th></tr></thead><tbody><tr><td>Berger australien</td><td>États-Unis</td><td>Mâle 51–58 cm<br>Femelle 46–53 cm</td><td>18–29 kg</td><td>Noir tricolore, rouge, bleu merle, rouge merle</td></tr></tbody></table></section>", "action": "dog_breed_catalog"}
    return {"reply": "<section class=\"dog-card\"><h3>Races de chiens documentées</h3><table class=\"help-table\"><thead><tr><th>Race</th><th>Dossier disponible</th></tr></thead><tbody><tr><td>Berger australien</td><td>Origine, standard, tempérament, besoins, éducation et santé</td></tr></tbody></table><p>Le Berger australien est actuellement le dossier canin détaillé disponible. Dis « affiche le tableau du Berger australien » pour sa fiche.</p></section>", "action": "dog_breed_catalog"}


def _culinary_command_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    # La reconnaissance vocale peut transcrire « peux-tu » en « peu tue ».
    # Détecte alors explicitement l'intention d'activation, sans la confondre
    # avec une demande de moteur ou une simple question de recette.
    culinary_activation_intent = (
        ("cuisine" in norm or "quizzine" in norm or "quizine" in norm or "remote cuisine" in norm) and
        any(word in norm for word in ("active", "activer", "activation", "mode", "charge", "charger")) and
        ("peux tu" in norm or "peut tu" in norm or "peu tue" in norm or "mets" in norm
         or "ouvre" in norm or "passe" in norm or "active" in norm or "activer" in norm)
    )
    if any(marker in norm for marker in _CULINARY_DISABLE_MARKERS):
        _culinary_session_overrides[session_id] = False
        return {"reply": "Mode cuisine désactivé pour cette session.", "action": "culinary_mode_deactivated"}
    if any(marker in norm for marker in _CULINARY_ENABLE_MARKERS) or culinary_activation_intent:
        _culinary_session_overrides[session_id] = True
        _tech_knowledge_session_overrides[session_id] = False
        return {
            "reply": (
                "Mode cuisine activé pour cette session. Je peux détailler les ingrédients, les quantités, "
                "les étapes et les temps de cuisson. Tu peux me demander, par exemple, une quiche lorraine, "
                "des crêpes, une ratatouille, un bœuf bourguignon, une carbonara, un pain perdu, une tarte Tatin, "
                "des moules-frites, une carbonnade flamande, un waterzooi, des gaufres de Liège, des gaufres de Bruxelles ou des boulets à la liégeoise."
            ),
            "action": "culinary_mode_activated",
        }
    if any(marker in norm for marker in _CULINARY_STATUS_MARKERS):
        state = "activé" if _session_culinary_enabled(session_id) else "désactivé"
        return {"reply": f"Le mode cuisine est actuellement {state} pour cette session.", "action": None}
    return None


def _culinary_catalog_result(user_msg: str, session_id: str) -> dict | None:
    """Catalogue fiable, affiché en HTML pour éviter les tableaux inventés par le LLM."""
    norm = _normalize_memory_text(user_msg)
    if not any(x in norm for x in ("tableau", "liste", "affiche", "montre")) or not any(x in norm for x in ("plat", "plats", "recette", "recettes", "cuisine")):
        return None
    _culinary_session_overrides[session_id] = True
    reply = """<section class="culinary-card"><h3>Plats disponibles</h3><table class="help-table"><thead><tr><th>Plat</th><th>Ingrédients essentiels</th><th>Allergènes évidents</th></tr></thead><tbody>
<tr><td>Quiche lorraine</td><td>Pâte, lardons, œufs, crème, lait</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Crêpes</td><td>Farine, œufs, lait, beurre</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Ratatouille</td><td>Aubergine, courgette, poivrons, tomates</td><td>Aucun ingrédient majeur</td></tr>
<tr><td>Bœuf bourguignon</td><td>Bœuf, vin rouge, carottes, champignons</td><td>Gluten possible selon bouillon/farine</td></tr>
<tr><td>Carbonara traditionnelle</td><td>Pâtes, guanciale, œufs, pecorino</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Pain perdu</td><td>Pain, œufs, lait, sucre</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Tarte Tatin</td><td>Pommes, beurre, sucre, pâte</td><td>Gluten, lait</td></tr>
<tr><td>Moules-frites</td><td>Moules, pommes de terre, céleri, oignon</td><td>Mollusques, céleri</td></tr>
<tr><td>Carbonnade flamande</td><td>Bœuf, bière brune, oignons, pain d’épices</td><td>Gluten, moutarde possible</td></tr>
<tr><td>Waterzooi de poulet</td><td>Poulet, poireaux, carottes, crème, œuf</td><td>Lait, œufs, céleri possible</td></tr>
<tr><td>Gaufres de Liège</td><td>Farine, beurre, œufs, lait, sucre perlé</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Gaufres de Bruxelles</td><td>Farine, lait, œufs, beurre, levure</td><td>Gluten, œufs, lait</td></tr>
<tr><td>Boulets à la liégeoise</td><td>Viande hachée, oignons, œufs, sirop de Liège</td><td>Œufs, gluten, céleri possible</td></tr>
</tbody></table><p>Dis-moi quel plat tu veux préparer.</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le tableau fiable des plats disponibles. Dis-moi lequel tu veux préparer.", "action": "culinary_catalog"}


def _culinary_ingredient_catalog_result(user_msg: str, session_id: str) -> dict | None:
    """Répond directement aux demandes vocales de liste d'ingrédients."""
    norm = _normalize_memory_text(user_msg)
    if not any(x in norm for x in ("ingredient", "ingredients")) or not any(x in norm for x in ("liste", "affiche", "montre", "donne")):
        return None
    _culinary_session_overrides[session_id] = True
    return {"reply": "Les ingrédients dépendent du plat. Dis-moi : crêpes, pain perdu, quiche lorraine, ratatouille, bœuf bourguignon, carbonara, tarte Tatin, moules-frites, carbonnade flamande, waterzooi, gaufres de Liège, gaufres de Bruxelles ou boulets à la liégeoise.", "action": "culinary_ingredient_prompt"}


def _culinary_vague_recipe_result(user_msg: str, session_id: str) -> dict | None:
    if not _session_culinary_enabled(session_id):
        return None
    norm = _normalize_memory_text(user_msg)
    known = ("crepe", "quiche", "ratatouille", "bourguignon", "carbonara", "pain perdu", "tatin", "moules", "carbonnade", "waterzooi", "gaufre", "boulet")
    if any(x in norm for x in ("petite recette", "une recette", "un peu de recette")) and not any(x in norm for x in known):
        return {"reply": "Bien sûr. Quel plat veux-tu préparer : quiche lorraine, crêpes, ratatouille, bœuf bourguignon, carbonara, pain perdu, tarte Tatin, moules-frites, carbonnade flamande, waterzooi, gaufres ou boulets à la liégeoise ?", "action": "culinary_recipe_clarification"}
    return None


def _culinary_auto_recipe_result(user_msg: str, session_id: str) -> dict | None:
    """Une demande explicite de recette active implicitement la branche cuisine."""
    norm = _normalize_memory_text(user_msg)
    known = ("pain perdu", "crepe", "crepes", "quiche", "ratatouille", "bourguignon", "carbonara", "tarte tatin", "tatin", "moules", "carbonnade", "waterzooi", "gaufre", "boulet")
    if "recette" in norm and "belg" in norm and not any(alias in norm for alias in known):
        _culinary_session_overrides[session_id] = True
        return {"reply": "Bien sûr. Je peux proposer des moules-frites, une carbonnade flamande, un waterzooi, des gaufres de Liège ou de Bruxelles, et des boulets à la liégeoise.", "action": "culinary_belgian_recipes"}
    if "recette" in norm and any(alias in norm for alias in known):
        _culinary_session_overrides[session_id] = True
        return culinary_recipe_result(user_msg, True)
    # Reprend une proposition précédente : « vas-y, donne-moi ça », etc.
    followup = any(x in norm for x in ("vas y", "vasy", "vazie", "vasie", "donne moi ca", "donne moi sa", "envoie ca", "fais la"))
    if followup:
        recent = conversations.get(session_id, []) if "conversations" in globals() else []
        previous = " ".join(str(m.get("content", "")) for m in recent[-6:] if isinstance(m, dict) and m.get("role") == "user")
        if "pain perdu" in _normalize_memory_text(previous):
            _culinary_session_overrides[session_id] = True
            return culinary_recipe_result("recette pain perdu", True)
    return None


def _machine_now() -> datetime:
    try:
        return datetime.now(ZoneInfo(_DEFAULT_TIMEZONE))
    except Exception:
        return datetime.now().astimezone()


def _message_targets_time(user_msg: str) -> bool:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return False
    return any(marker in norm for marker in _TIME_QUERY_MARKERS)


def _format_time_reply(now: datetime) -> tuple[str, str]:
    days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    months = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ]
    day_name = days[now.weekday()]
    month_name = months[now.month - 1]
    display = f"Il est {now.hour} h {now.minute:02d}, le {day_name} {now.day} {month_name} {now.year}."
    tts = f"Il est {now.hour} heure {now.minute:02d}, le {day_name} {now.day} {month_name} {now.year}."
    if now.hour != 1:
        tts = tts.replace(f"{now.hour} heure", f"{now.hour} heures", 1)
    if now.minute == 0:
        tts = f"Il est {now.hour} heure, le {day_name} {now.day} {month_name} {now.year}."
        if now.hour != 1:
            tts = tts.replace(f"{now.hour} heure", f"{now.hour} heures", 1)
    return display, tts


def _time_result(user_msg: str) -> dict | None:
    if not _message_targets_time(user_msg):
        return None
    display, tts = _format_time_reply(_machine_now())
    return {"reply": display, "tts_reply": tts, "action": None}


class WeatherLookupError(RuntimeError):
    """Erreur fonctionnelle du module météo."""


class InternetUnavailableError(WeatherLookupError):
    """Impossible de joindre un service météo depuis cette machine."""


class WeatherLocationNotFound(WeatherLookupError):
    """Lieu météo introuvable."""


async def _weather_api_get(session: aiohttp_client.ClientSession, url: str, params: dict) -> dict:
    try:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise WeatherLookupError(f"service météo indisponible ({resp.status})")
            return await resp.json()
    except (aiohttp_client.ClientConnectorError, aiohttp_client.ClientOSError,
            aiohttp_client.ServerTimeoutError, asyncio.TimeoutError) as exc:
        raise InternetUnavailableError(str(exc)) from exc
    except aiohttp_client.ClientError as exc:
        raise WeatherLookupError(str(exc)) from exc


def _message_targets_weather(user_msg: str) -> bool:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return False
    return any(marker in norm for marker in _WEATHER_QUERY_MARKERS)


def _clean_weather_location(candidate: str) -> str:
    value = re.sub(r"\s+", " ", candidate or "").strip(" ,.;:!?")
    value = re.sub(
        r"\b(?:maintenant|aujourd hui|aujourd'hui|en ce moment|reelle?|réelle?|actuelle?|dehors|exterieure?)\b",
        "",
        value,
        flags=re.I,
    )
    value = re.sub(r"\s+", " ", value).strip(" ,.;:!?")
    if not value:
        return ""
    if _normalize_memory_text(value) in {"meteo", "météo", "temps", "dehors"}:
        return ""
    return value


def _extract_weather_location(user_msg: str) -> str:
    message = re.sub(r"\s+", " ", (user_msg or "").strip())
    patterns = (
        r"(?:meteo|météo|metil|métil)\s+(?:a|à|sur|pour|de)\s+(.+)$",
        r"(?:meteo|météo|metil|métil)\s+(.+)$",
        r"(?:quel temps fait(?:-|\s)?il|il fait quel temps|quel temps fera(?:-|\s)?t(?:-|\s)?il)\s+(?:a|à|sur|pour)\s+(.+)$",
        r"(?:pleut(?:-|\s)?il|fait(?:-|\s)?il beau)\s+(?:a|à|sur|pour)\s+(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.I)
        if match:
            location = _clean_weather_location(match.group(1))
            if location:
                return location
    return ""


def _extract_request_coordinates(body: dict | None) -> tuple[float, float] | None:
    if not body:
        return None
    lat_keys = ("lat", "latitude", "gps_lat")
    lon_keys = ("lon", "lng", "longitude", "gps_lon")
    lat = next((body.get(key) for key in lat_keys if body.get(key) is not None), None)
    lon = next((body.get(key) for key in lon_keys if body.get(key) is not None), None)
    try:
        if lat is None or lon is None:
            return None
        return float(lat), float(lon)
    except (TypeError, ValueError):
        return None


def _format_weather_label(result: dict) -> str:
    parts = [str(result.get("name", "") or "").strip()]
    for key in ("admin1", "country"):
        value = str(result.get(key, "") or "").strip()
        if value and value not in parts:
            parts.append(value)
    return ", ".join(part for part in parts if part) or "lieu inconnu"


def _weather_location_candidates(location: str) -> list[str]:
    cleaned = _clean_weather_location(location)
    if not cleaned:
        return []
    candidates = [cleaned]
    replacements = (
        (r"\s+en\s+belgique\b", ", Belgique"),
        (r"\s+en\s+france\b", ", France"),
        (r"\s+en\s+suisse\b", ", Suisse"),
        (r"\s+en\s+allemagne\b", ", Allemagne"),
    )
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, cleaned, flags=re.I)
        normalized = re.sub(r"\s+", " ", normalized).strip(" ,.;:!?")
        if normalized and normalized not in candidates:
            candidates.append(normalized)
    return candidates


def _format_weather_time(current: dict) -> str:
    timestamp = str(current.get("time", "") or "")
    if len(timestamp) >= 16:
        return timestamp[11:16]
    return ""


def _weather_condition_label(code: int | None) -> str:
    if code is None:
        return "conditions inconnues"
    return _WEATHER_CODE_LABELS.get(int(code), "conditions inconnues")


def _format_weather_time_speech(current: dict) -> str:
    timestamp = str(current.get("time", "") or "")
    if len(timestamp) < 16:
        return ""
    hhmm = timestamp[11:16]
    try:
        hour_str, minute_str = hhmm.split(":")
        hour = int(hour_str)
        minute = int(minute_str)
    except ValueError:
        return ""
    if minute == 0:
        return f"{hour} heure" if hour == 1 else f"{hour} heures"
    return f"{hour} heure {minute}" if hour == 1 else f"{hour} heures {minute}"


def _build_weather_reply(label: str, current: dict, used_default_location: bool = False) -> tuple[str, str]:
    temp = round(float(current.get("temperature_2m", 0)))
    apparent = round(float(current.get("apparent_temperature", temp)))
    humidity = round(float(current.get("relative_humidity_2m", 0)))
    wind = round(float(current.get("wind_speed_10m", 0)))
    precipitation = float(current.get("precipitation", 0) or 0)
    condition = _weather_condition_label(current.get("weather_code"))
    time_label = _format_weather_time(current)
    time_speech = _format_weather_time_speech(current)
    intro = f"Sans lieu précis, j'utilise {label} par défaut. " if used_default_location else ""
    reply = (
        f"{intro}Météo réelle pour {label}"
        f"{' à ' + time_label if time_label else ''} : {temp} degrés, ressenti {apparent}, "
        f"{condition}, vent {wind} km/h, humidité {humidity} %."
    )
    speech_intro = f"Sans lieu précis, j'utilise {label} par défaut. " if used_default_location else ""
    speech_reply = (
        f"{speech_intro}Météo réelle pour {label}"
        f"{', à ' + time_speech if time_speech else ''}. "
        f"Température {temp} degrés. "
        f"Ressenti {apparent} degrés. "
        f"{condition.capitalize()}. "
        f"Vent à {wind} kilomètres par heure. "
        f"Humidité à {humidity} pour cent."
    )
    if precipitation > 0.1:
        reply += f" Précipitations en cours : {precipitation:.1f} mm."
        speech_reply += " Des précipitations sont en cours."
    return reply, speech_reply


async def _fetch_weather_from_coordinates(latitude: float, longitude: float, label: str) -> str:
    timeout = aiohttp_client.ClientTimeout(total=8, connect=4, sock_read=4)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join((
            "temperature_2m",
            "apparent_temperature",
            "relative_humidity_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        )),
        "timezone": "auto",
        "forecast_days": 1,
    }
    async with aiohttp_client.ClientSession(timeout=timeout, headers={"User-Agent": "Kyronext-K4000/1.0"}) as session:
        data = await _weather_api_get(session, _OPEN_METEO_FORECAST_URL, params)
    current = data.get("current") or {}
    if not current:
        raise WeatherLookupError("conditions météo absentes")
    return _build_weather_reply(label, current)


async def _fetch_weather_from_location(location: str, used_default_location: bool = False) -> str:
    timeout = aiohttp_client.ClientTimeout(total=8, connect=4, sock_read=4)
    async with aiohttp_client.ClientSession(timeout=timeout, headers={"User-Agent": "Kyronext-K4000/1.0"}) as session:
        results = []
        for candidate in _weather_location_candidates(location):
            geo_data = await _weather_api_get(session, _OPEN_METEO_GEOCODING_URL, {
                "name": candidate,
                "count": 1,
                "language": "fr",
                "format": "json",
            })
            results = geo_data.get("results") or []
            if results:
                break
        if not results:
            raise WeatherLocationNotFound(location)
        result = results[0]
        weather_data = await _weather_api_get(session, _OPEN_METEO_FORECAST_URL, {
            "latitude": result["latitude"],
            "longitude": result["longitude"],
            "current": ",".join((
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
            )),
            "timezone": "auto",
            "forecast_days": 1,
        })
    current = weather_data.get("current") or {}
    if not current:
        raise WeatherLookupError("conditions météo absentes")
    return _build_weather_reply(_format_weather_label(result), current, used_default_location=used_default_location)


async def _weather_result(body: dict | None, user_msg: str) -> dict | None:
    if not _message_targets_weather(user_msg):
        return None

    coordinates = _extract_request_coordinates(body)
    try:
        if coordinates is not None:
            label = str((body or {}).get("gps_text") or "votre position").strip() or "votre position"
            reply, tts_reply = await _fetch_weather_from_coordinates(coordinates[0], coordinates[1], label)
        else:
            location = _extract_weather_location(user_msg)
            used_default_location = False
            if not location:
                location = _DEFAULT_WEATHER_LOCATION
                used_default_location = True
            reply, tts_reply = await _fetch_weather_from_location(location, used_default_location=used_default_location)
        return {"reply": reply, "tts_reply": tts_reply, "action": None}
    except InternetUnavailableError:
        return {
            "reply": (
                "Je veux bien te donner la meteo reelle, mais ma connexion Internet est indisponible. "
                "Je tourne ici en mode local, donc je n'ai pas acces au Web pour interroger un service meteo en temps reel."
            ),
            "action": None,
        }
    except WeatherLocationNotFound as exc:
        return {
            "reply": f"Je n'ai pas reussi a localiser {exc}. Donne-moi une ville ou un lieu plus precis.",
            "action": None,
        }
    except WeatherLookupError:
        return {
            "reply": "Le service meteo ne repond pas correctement pour le moment. Reessaie un peu plus tard.",
            "action": None,
        }


def _resolve_user_display_info(body: dict | None) -> tuple[str, bool]:
    if body:
        for key in ("user_name", "user", "speaker", "name"):
            value = str(body.get(key, "") or "").strip()
            if value:
                # KITT Pascal Fairon ne doit jamais reprendre un ancien alias de propriétaire.
                if _normalize_memory_text(value) in {"frank", "franck", "franque", "kr95", "kr 95"}:
                    return "Pascal Fairon", False
                return value, True
    operator = os.getenv("KYRONEXT_OPERATOR", "Pascal Fairon").strip()
    return operator or "Pascal Fairon", False


def _addressing_style(user_display: str, explicit: bool) -> str:
    if not explicit:
        return "tu"
    normalized = _normalize_memory_text(user_display)
    if any(re.search(rf"\b{re.escape(alias)}\b", normalized) for alias in _VOUS_ADDRESS_ALIASES):
        return "vous"
    return "tu"


def _build_addressing_context(user_display: str, explicit: bool) -> str:
    style = _addressing_style(user_display, explicit)
    if style == "vous":
        return (
            "\n\nRègle d'adresse: la personne en face doit être vouvoyée. "
            "Utilise toujours vous, votre et vos quand tu t'adresses directement à elle."
        )
    return (
        "\n\nRègle d'adresse: la personne en face doit être tutoyée. "
        "Utilise toujours tu, ton, ta et tes quand tu t'adresses directement à elle."
    )


def _build_name_pronunciation_context(user_message: str, user_display: str) -> str:
    normalized = _normalize_memory_text(f"{user_message} {user_display}")
    if not normalized:
        return ""
    hints = [hint for needle, hint in _NAME_PRONUNCIATION_HINTS if needle in normalized]
    if not hints:
        return ""
    lines = ["", "Guide de lecture des noms propres:"]
    for hint in hints:
        lines.append(f"- {hint}")
    lines.append("Conserve l'orthographe normale a l'ecrit, mais garde ces lectures a l'esprit pour la voix et la reformulation.")
    return "\n".join(lines)


def _owner_identity_result(user_msg: str) -> dict | None:
    """Réponse verrouillée : le propriétaire de KITT est Pascal Fairon."""
    norm = _normalize_memory_text(user_msg)
    markers = (
        "qui est ton proprietaire", "qui est ton constructeur",
        "identite de ton proprietaire", "nom de ton proprietaire",
        "proprietaire de kitt", "constructeur de kitt",
        "qui est ton maitre", "qui est le maitre", "qui est maitre",
        "qui est en maitre", "maitre de kitt", "maitre de cette voiture",
        "qui est ton maitre", "ton maitre", "maitre de kitt",
        "a qui tu appartiens", "a qui appartiens tu",
        "a qui appartiens tu", "qui t a construit", "qui t a cree",
    )
    if any(marker in norm for marker in markers):
        return {"reply": "Pascal Fairon est mon propriétaire, mon constructeur, mon ami et mon pilote principal.", "action": None}
    return None


def _pascal_self_identification_result(user_msg: str) -> dict | None:
    """Évite que le LLM découpe « Pascal » en une négation (« pas, pas »)."""
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if ("je suis pascal" in norm or "je disais je suis pascal" in norm
            or "c est pascal" in norm or "je suis pas papa" in norm):
        return {
            "reply": "Compris, tu es Pascal Fairon, mon propriétaire et mon pilote principal. Je t'ai bien identifié.",
            "action": "owner_identified",
        }
    if "papa pascal" in norm or "pere de pascal" in norm or "père de pascal" in norm:
        return {
            "reply": "Je ne parle pas de papa Pascal : Pascal Fairon est mon propriétaire, mon constructeur et mon pilote principal.",
            "action": "identity_clarified",
        }
    if (("pas harry" in norm or "pas skull" in norm) and
            ("je suis" in norm or "je ne suis" in norm)):
        return {
            "reply": "Compris. Tu es Pascal Fairon, pas Harry ni Skull, et je suis KITT, ta K2000.",
            "action": "identity_clarified",
        }
    return None


def _pascal_profile_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if "pascal fairon" not in norm or not any(x in norm for x in ("qui est", "parle moi", "information", "fiche", "role")):
        return None
    return {"reply": "Pascal Fairon est le propriétaire, le constructeur et le pilote principal de KITT K2000. Passionné par Knight Rider, il participe à la communauté KITT Franco-Belge avec Manix. KITT l’accompagne ; elle ne le remplace pas. KITT, KARR et la K-4000 de KR95 sont trois identités distinctes : KARR n’est pas la K-4000.", "action": "pascal_profile"}


def _pronoun_policy_result(user_msg: str, user_display: str, explicit_user_display: bool) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    markers = (
        "tu me tutoies",
        "tu me vouvoies",
        "tu me parles en tu",
        "tu me parles en vous",
        "comment m appelles tu",
        "comment m appelles vous",
        "comment dois tu m appeler",
        "comment dois vous m appeler",
        "m appelles tu",
        "m appelles vous",
        "tutoi",
        "vouvoi",
    )
    if not any(marker in norm for marker in markers):
        return None
    style = _addressing_style(user_display, explicit_user_display)
    if style == "vous":
        return {
            "reply": "Je vous vouvoie.",
            "action": None,
        }
    return {
        "reply": "Je te tutoie.",
        "action": None,
    }


def _message_targets_secret_owner_identity(user_msg: str) -> bool:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return False
    if any(variant in norm for variant in _SECRET_OWNER_VARIANTS):
        return True
    if "manix" in norm and any(marker in norm for marker in _SECRET_OWNER_QUERY_MARKERS):
        return True
    return any(marker in norm for marker in _SECRET_OWNER_QUERY_MARKERS if "createur" in marker)


def _message_has_secret_owner_password(user_msg: str) -> bool:
    if not _SECRET_OWNER_PASSWORD:
        return False
    return bool(re.search(rf"\b{re.escape(_SECRET_OWNER_PASSWORD.lower())}\b", _normalize_memory_text(user_msg)))


def _secret_owner_session_unlocked(session_id: str) -> bool:
    expiry = _secret_owner_unlocks.get(session_id, 0)
    if expiry > time.time():
        return True
    _secret_owner_unlocks.pop(session_id, None)
    return False


def _grant_secret_owner_session_unlock(session_id: str) -> None:
    _secret_owner_unlocks[session_id] = time.time() + _SECRET_OWNER_UNLOCK_TTL_S


def _user_has_secret_owner_clearance(user_display: str) -> bool:
    normalized = _normalize_memory_text(user_display)
    if not normalized:
        return False
    return any(alias in normalized for alias in _SECRET_OWNER_ALLOWED_USERS)


def _secret_owner_access_result(user_msg: str, user_display: str, session_id: str) -> dict | None:
    wants_secret = _message_targets_secret_owner_identity(user_msg)
    has_password = _message_has_secret_owner_password(user_msg)
    if not wants_secret and not has_password:
        return None

    authorized_user = _user_has_secret_owner_clearance(user_display)
    unlocked_session = _secret_owner_session_unlocked(session_id)
    unlock_just_granted = False

    if has_password and not unlocked_session:
        _grant_secret_owner_session_unlock(session_id)
        unlocked_session = True
        unlock_just_granted = True

    if not wants_secret and has_password:
        return {
            "reply": "Bzzzt... Code Bonnie reconnu. Séquence Falken armée. Accès mémoire exceptionnel ouvert pour cette session. Pose maintenant la question protégée.",
            "action": "bonnie_unlock",
        }

    if not authorized_user and not unlocked_session:
        return {
            "reply": "Accès classifié. Référence Falken verrouillée. Autorisation rapprochée ou code Bonnie requis.",
            "action": None,
        }

    if unlock_just_granted:
        reply = (
            "Bzzzt... Code Bonnie confirmé. Séquence Falken engagée. "
            f"Le nom protégé est {_SECRET_OWNER_FULL_NAME}. "
            "C'est l'identité complète de Manix, mon créateur logiciel actuel."
        )
    elif authorized_user:
        reply = (
            "Accès validé. Séquence Falken engagée. "
            f"Le nom protégé est {_SECRET_OWNER_FULL_NAME}. "
            "C'est l'identité complète de Manix, mon créateur logiciel actuel."
        )
    else:
        reply = (
            "Accès déjà ouvert pour cette session. "
            f"Le nom protégé est {_SECRET_OWNER_FULL_NAME}. "
            "C'est l'identité complète de Manix, mon créateur logiciel actuel."
        )

    return {
        "reply": reply,
        "action": "bonnie_unlock" if unlock_just_granted else None,
    }


def _dylan_greeting_result(user_msg: str) -> dict | None:
    """Message amical demandé pour Dylan, sans passer par les commandes véhicule."""
    norm = _normalize_memory_text(user_msg)
    # Variantes réellement observées dans les transcriptions Whisper du véhicule.
    dylan_aliases = ("dylan", "dilane", "dylane", "adilan", "edilan")
    if not any(alias in norm for alias in dylan_aliases):
        return None
    greeting_markers = (
        "dis bonjour",
        "dit bonjour",
        "dire bonjour",
        "dise bonjour",
        "passe le bonjour",
        "dis salut",
        "dit salut",
        "dire salut",
        "salue",
        "saluer",
        "message sympathique",
    )
    if not any(marker in norm for marker in greeting_markers):
        return None
    return {
        "reply": (
            "Bonjour Dylan ! Merci pour ta vidéo. Depuis, Manix a mis à jour ma parole, "
            "et je sais enfin prononcer ton prénom normalement. Merci à Manix pour cette amélioration, "
            "et merci à Dadoo pour l’interface graphique. Dylan, est-ce que tu viendras me rendre visite à l’occasion ?"
        ),
        "action": None,
    }


def _dadoo_profile_result(user_msg: str) -> dict | None:
    """Rôle de Dadoo, limité aux informations explicitement validées."""
    norm = _normalize_memory_text(user_msg)
    if "dadoo" not in norm and "dadou" not in norm:
        return None
    markers = (
        "qui est", "qui c est", "parle moi", "information", "informations",
        "quel est son role", "que fait", "createur", "graphique", "administrateur",
    )
    if not any(marker in norm for marker in markers):
        return None
    return {
        "reply": (
            "Dadoo travaille dans le graphisme et fait partie des créateurs de l’interface graphique de Kyronext. "
            "Il a donc contribué à l’univers visuel utilisé autour de KITT et KARR. "
            "Il est également administrateur de France Knight Rider. "
            "Ce sont les fonctions validées dont je dispose actuellement à son sujet."
        ),
        "action": "dadoo_profile",
    }


def _identity_confusion_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if "pascal fairon" in norm and ("proprietaire" in norm or "pilote principal" in norm) and ("k 4000" in norm or "k4000" in norm):
        return {"reply": "Correction importante : Pascal Fairon est le propriétaire et le pilote principal de KITT K2000. La K-4000 appartient à la branche KR95 et ne doit pas être confondue avec KITT.", "action": "vehicle_identity_separated"}
    if (("kr95" in norm or "kr 95" in norm) and ("k4000" in norm or "k 4000" in norm)
            and "pascal" in norm and "kitt" in norm):
        return {"reply": "Compris. La K-4000 appartient à KR95. Moi, je suis KITT K2000, l'intelligence et la voiture de Pascal Fairon.", "action": "vehicle_identity_separated"}
    if any(marker in norm for marker in ("est ce que tu m entends", "tu m entends", "m entends tu", "tu m ecoutes", "tu m ecoute")):
        return {"reply": "Oui, je t'entends parfaitement. Je suis KITT, la K2000 de Pascal Fairon.", "action": "hearing_confirmed"}
    if (norm.startswith("tu es ") or norm.startswith("qui es tu")) and any(alias in norm for alias in ("k 4000", "k4000", "karr", "k 2", "kir 80", "kir 95", "kir95")):
        return {"reply": "Non. Je suis KITT, la K2000 de Pascal Fairon. Je ne suis ni K-4000 ni KARR.", "action": "identity_corrected"}
    if norm in ("k 2", "k2", "ki 2", "ki2", "k 2000", "qui est u", "qui es tu"):
        return {"reply": "Je suis KITT, la K2000 de Pascal Fairon.", "action": "identity_corrected"}
    if norm in ("manix c est manix", "manix pas manix", "c est manix", "pas manix"): return {"reply": "Compris. Le prénom reste écrit Manix et se prononce Ma-niks.", "action": "pronunciation_corrected"}
    if "kitt" in norm and any(marker in norm for marker in ("bonjour", "salut", "bonsoir", "ca va", "comment vas tu", "tout va bien")): return {"reply": "Tout va bien. Je suis KITT, la K2000 de Pascal Fairon.", "action": "identity_corrected"}
    if not any(marker in norm for marker in _IDENTITY_QUERY_MARKERS):
        return None
    if "frank" not in norm and "qui es tu" not in norm and "quel est ton nom" not in norm and "comment tu t appelles" not in norm:
        return None
    return {
        "reply": (
            "Non. Je suis KITT. Pascal Fairon est mon propriétaire et mon constructeur, "
            "mon ami et mon pilote principal."
        ),
        "action": None,
    }


def _shutdown_code_policy_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if not any(marker in norm for marker in _SHUTDOWN_CODE_QUERY_MARKERS):
        return None
    return {
        "reply": "Code confidentiel. Je ne le divulgue jamais. Si une extinction est vraiment voulue, je demanderai simplement le code au moment opportun.",
        "action": None,
    }


def _frank_k4000_engine_reply(session_id: str) -> str:
    if _session_tech_knowledge_enabled(session_id):
        return (
            "La K-4000 de KR-95 repose sur une Pontiac Firebird de quatrième génération, dont la carrosserie a été "
            "profondément retravaillée pour obtenir sa silhouette spécifique. Le projet combine cette base automobile réelle "
            "avec de nombreuses pièces fabriquées ou adaptées artisanalement pour le projet par KR-95. Sa motorisation de référence est "
            "un V6 3,4 litres avec boîte automatique."
        )
    return "La K-4000 de KR-95 possède un moteur V6 3,4 litres avec boîte automatique."


def _banshee_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    words = set(norm.split())
    mentions_banshee = bool(words & {"banshee", "benchy", "benshee", "banshi", "banshe", "benji", "benchis", "benchis"})
    mentions_stealth = "stealth" in words
    mentions_frank_k4000 = (
        "frank" in words
        or "kr95" in words
        or "k4000" in words
        or "k 4000" in norm
        or "k 4 pile" in norm
    )
    asks_engine = bool(words & {"moteur", "moteurs", "motorisation"})
    if "1982" in norm and any(alias in norm for alias in ("trans am", "transam", "transame", "trans amme")) and (asks_engine or "v8" in words): return {"reply": "Pour la Pontiac Firebird Trans Am de 1982, deux V8 5,0 L de 305 ci sont proposés : le LG4 à carburateur quatre corps, 145 ch, et le LU5 Cross-Fire à injection, 165 ch. Le LG4 pouvait recevoir une boîte manuelle 4 rapports ; le LU5 était associé à une automatique 3 rapports. Ce sont des V8 OHV à huit cylindres en V, deux soupapes par cylindre, donc seize soupapes ; pas des quatre cylindres en ligne.", "action": "trans_am_1982_technical"}

    if "pontiac" in words and asks_engine and bool(words & {"liste", "moteurs"}):
        return {
            "reply": ("Pontiac a utilisé de nombreuses familles de moteurs selon les modèles et les années. "
                      "Précise le modèle et l’année recherchés : je préfère te donner une référence exacte plutôt qu’une liste inventée."),
            "action": None,
        }

    if asks_engine and mentions_frank_k4000 and not mentions_banshee:
        _banshee_pending_engine_sessions.discard(session_id)
        return {
            "reply": _frank_k4000_engine_reply(session_id),
            "action": None,
        }

    if session_id in _banshee_pending_engine_sessions:
        if mentions_banshee and mentions_frank_k4000:
            _banshee_pending_engine_sessions.discard(session_id)
            return {
                "reply": ("La Banshee IV et la K-4000 de KR-95 sont deux véhicules différents. "
                          "La motorisation exacte de la K-4000 de KR-95 n’est pas encore enregistrée dans mes connaissances."),
                "action": None,
            }
        if mentions_frank_k4000:
            _banshee_pending_engine_sessions.discard(session_id)
            return {
                "reply": _frank_k4000_engine_reply(session_id),
                "action": None,
            }
        if mentions_stealth:
            _banshee_pending_engine_sessions.discard(session_id)
            return {
                "reply": ("La voiture du téléfilm était basée sur une Dodge Stealth 1991 transformée. "
                          "La motorisation exacte de l’exemplaire de tournage n’est pas vérifiée dans mes connaissances."),
                "action": None,
            }
        if mentions_banshee:
            _banshee_pending_engine_sessions.discard(session_id)
            return {
                "reply": ("Tu parles donc du concept Pontiac Banshee IV de 1988. "
                          "Sa motorisation exacte n’est pas documentée de façon assez fiable dans mes connaissances actuelles; je ne vais pas l’inventer."),
                "action": None,
            }

    if mentions_banshee:
        _banshee_topic_sessions.add(session_id)
        if asks_engine:
            _banshee_pending_engine_sessions.add(session_id)
            if mentions_frank_k4000:
                return {
                    "reply": ("La Banshee IV et la K-4000 de KR-95 sont deux véhicules différents. "
                              "Demandes-tu le moteur du concept Banshee IV ou celui de la K-4000 de KR-95 ?"),
                    "action": None,
                }
            return {
                "reply": ("De quel véhicule parles-tu : la Pontiac Banshee IV, la Dodge Stealth transformée du téléfilm, "
                          "ou la K-4000 de KR-95 ? Ce sont trois véhicules différents."),
                "action": None,
            }
        return {
            "reply": ("La Pontiac Banshee IV est un concept-car de 1988 qui a inspiré l’apparence de la Knight 4000. "
                      "Dans le téléfilm, la voiture utilisée était une Dodge Stealth 1991 transformée; "
                      "la K-4000 de KR-95 est construite sur une Firebird de quatrième génération."),
            "action": None,
        }
    if asks_engine and session_id in _banshee_topic_sessions:
        _banshee_pending_engine_sessions.add(session_id)
        return {
            "reply": ("Précise laquelle : la Pontiac Banshee IV, la Dodge Stealth du téléfilm, ou la K-4000 de KR-95."),
            "action": None,
        }
    return None


def _greeting_clarification_result(user_msg: str) -> dict | None:
    """Évite de transformer un salut mal transcrit en départ du véhicule."""
    norm = _normalize_memory_text(user_msg)
    if re.match(r"^(?:salut|bonjour) comment (?:vas tu|va tu|ratu|ca va|tu vas)", norm):
        return {"reply": "Je vais très bien, merci Pascal. KITT est en ligne et prêt à t’aider. Quoi de neuf aujourd’hui ?", "action": "greeting_status"}
    if norm in ("c est parti", "c est parti salut", "salut", "salus", "surrey", "j ai 10 salus", "j ai dix salus"):
        return {"reply": "Salut Pascal. KITT est à l'écoute et prêt à t'aider.", "action": "greeting"}
    if "je t ai pas dit" in norm and "salut" in norm:
        return {"reply": "Compris, tu me saluais. Salut Pascal. Le bouton AUTO ne change pas sans ta commande explicite.", "action": "greeting_clarified"}
    return None


def _praise_pronunciation_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if norm in ("bravo", "bien bravo", "bien prevo", "bravo kitt", "bravo kit"):
        return {"reply": "Merci Pascal. Je prends cela comme un bravo, et je reste KITT, ta K2000.", "action": "praise_acknowledged"}
    if "j ai pas dit bien prevo" in norm or "j ai pas dit bien bravo" in norm:
        return {"reply": "Compris : tu as dit « bien bravo ». Merci Pascal !", "action": "praise_clarified"}
    return None


def _temperament_pronunciation_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if any(x in norm for x in ("temps perament", "temps temperament", "tu sais pas dire temperament", "prononcer temperament")):
        return {"reply": "Oui : le mot s’écrit « tempérament » et se prononce « tempé-ra-ment ». Je vais le prononcer ainsi.", "action": "pronunciation_corrected"}
    return None


def _recent_memory_result(user_msg: str, history: list) -> dict | None:
    if not _is_recent_memory_request(user_msg):
        return None
    recent = [message for message in history[-12:] if isinstance(message, dict) and message.get("content")]
    if not recent:
        return {
            "reply": "Je ne dispose d’aucun échange antérieur dans cette session. Ma mémoire récente couvre les 12 derniers messages, soit généralement six échanges complets.",
            "action": "recent_memory_recalled",
        }
    pairs = []
    pending_user = ""
    for message in recent:
        content = re.sub(r"\s+", " ", str(message.get("content", ""))).strip()
        if message.get("role") == "user":
            pending_user = content
        elif pending_user:
            pairs.append((pending_user, content))
            pending_user = ""
    lines = ["Voici ce que je retrouve dans nos messages récents :"]
    for question, answer in pairs[-4:]:
        short_question = question[:180].rstrip()
        short_answer = answer[:260].rstrip()
        lines.append(f"Tu m’as demandé « {short_question} ». Je t’ai répondu : « {short_answer} ».")
    if pending_user:
        lines.append(f"Ta dernière demande encore sans réponse était : « {pending_user[:180].rstrip()} ».")
    lines.append("Cette mémoire correspond aux 12 derniers messages de la session actuelle.")
    return {"reply": " \n".join(lines), "action": "recent_memory_recalled"}


def _button_help_result(user_msg: str) -> dict | None:
    """Guide direct de l'interface, sans appel LLM."""
    norm = _normalize_memory_text(user_msg)
    asks_button = any(x in norm for x in (
        "bouton", "boutons", "buton", "butons", "boutton", "touche", "commandes interface",
    ))
    asks_help = any(x in norm for x in (
        "a quoi", "que font", "sert", "fonction", "fonctions", "utilite", "utilites",
        "explique", "c est quoi", "qu est ce que c est", "aide", "tableau", "liste",
        "donne moi", "explication",
    ))
    if not (asks_button and asks_help):
        return None
    reply = """<section class="help-card button-help-card"><h3>⌘ GUIDE DES BOUTONS KYRONEX</h3><p>Chaque bouton agit sur une fonction précise et peut être commandé vocalement.</p><table class="help-table"><thead><tr><th>Bouton</th><th>Fonction</th><th>Exemple vocal</th></tr></thead><tbody>
<tr><td>ODB</td><td>Diagnostic lorsque l'autorisation ODB est active.</td><td>« ouvre l'ODB »</td></tr>
<tr><td>MNX</td><td>Dossier et informations de Manix.</td><td>« ouvre MNX »</td></tr>
<tr><td>NAV</td><td>Navigation et itinéraire.</td><td>« ouvre la navigation »</td></tr>
<tr><td>VOL</td><td>Volume de la voix Qironex.</td><td>« monte le volume »</td></tr>
<tr><td>VIG</td><td>Caméra et enregistrement de surveillance.</td><td>« active le mode vigilance »</td></tr>
<tr><td>KLAXON</td><td>Huit styles de klaxon protégés.</td><td>« affiche la liste des klaxons »</td></tr>
<tr><td>LECTEUR CD</td><td>Musique locale, pistes, lecture et pause.</td><td>« ouvre le lecteur CD »</td></tr>
<tr><td>RADIO</td><td>Tuner local et flux radio enregistrés.</td><td>« ouvre la radio »</td></tr>
<tr><td>VIDÉO</td><td>Lecteur vidéo local.</td><td>« ouvre la vidéo »</td></tr>
<tr><td>CAMÉRA</td><td>Vue caméra/vigilance.</td><td>« ouvre la caméra »</td></tr>
<tr><td>PARAMÈTRES</td><td>Volume, affichage, échelle, résolution virtuelle et tactile.</td><td>« ouvre les paramètres »</td></tr>
<tr><td>EQ</td><td>Égaliseur visuel.</td><td>« affiche l'égaliseur »</td></tr>
<tr><td>VÉHICULE</td><td>Commandes physiques sécurisées et relais.</td><td>« ouvre le véhicule »</td></tr>
<tr><td>API</td><td>Voix ElevenLabs si configurée.</td><td>« active l'API »</td></tr>
<tr><td>EXTINCTION</td><td>Arrêt sécurisé avec confirmation.</td><td>« demande l'extinction »</td></tr>
<tr><td>NORMAL</td><td>Retour au mode normal.</td><td>« passe en mode normal »</td></tr>
<tr><td>COMMANDE</td><td>Espace sécurisé des commandes physiques.</td><td>« passe en mode commande »</td></tr>
<tr><td>TECHNIQUE</td><td>Pontiac, moteurs, K-4000/KR95 et Hi-Fi.</td><td>« active le mode technique »</td></tr>
<tr><td>CUISINE</td><td>Recettes, ingrédients et étapes.</td><td>« active le mode cuisine »</td></tr>
<tr><td>DÉBAT</td><td>Débat entre les intelligences.</td><td>« lance un débat »</td></tr>
<tr><td>KITT / KARR / K-4000</td><td>Sélection du thème et du dossier.</td><td>« active le thème KITT »</td></tr>
<tr><td>BERGER</td><td>Dossier du Berger australien et de Gamin.</td><td>« affiche le Berger australien »</td></tr>
<tr><td>HI-FI 90</td><td>DAT, DCC Philips, vidéodisques et audio-vidéo.</td><td>« ouvre le dossier Hi-Fi »</td></tr>
<tr><td>CONSOLES</td><td>Nintendo, Sony, PlayStation et consoles 80/90.</td><td>« affiche le tableau des consoles »</td></tr>
<tr><td>CHARLEROI</td><td>Histoire et lieux connus de Charleroi.</td><td>« raconte l'histoire de Charleroi »</td></tr>
<tr><td>PONTIAC</td><td>Firebird, Trans Am, Banshee IV et moteurs.</td><td>« affiche le tableau des moteurs »</td></tr>
<tr><td>VOITURE / SÉRIES 80 / MUSIQUE / BLAGUES</td><td>Dossiers thématiques correspondants.</td><td>« affiche le tableau de musique »</td></tr>
</tbody></table><p>Tu peux aussi demander : « à quoi sert le bouton Hi-Fi ? »</p></section>"""
    return {"reply": reply, "tts_reply": "Voici le guide des boutons Kyronex. Chaque ligne explique sa fonction et donne un exemple de commande vocale.", "action": "button_help_displayed"}


def _help_result(user_msg: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    help_queries = {
        "aide", "aide moi", "help", "menu aide", "affiche l aide", "ouvre l aide",
        "guide", "mode d emploi", "manuel", "manuel d utilisation",
        "comment tu fonctionnes", "comment tu fonctionne", "comment fonctionne tu",
        "comment ca fonctionne", "comment ca marche", "comment fonctionne k4000",
        "explique ton fonctionnement", "explique moi comment tu fonctionnes",
        "besoin d aide", "j ai besoin d aide", "je veux de l aide",
        "peux tu m aider", "pourrais tu m aider", "est ce que tu peux m aider",
        "que sais tu faire", "montre moi ce que tu sais faire", "dis moi ce que tu sais faire",
        "que peux tu faire", "qu est ce que tu peux faire", "quelles sont tes fonctions",
        "quelles sont tes capacites", "presente tes fonctions", "presente moi tes fonctions",
        "liste tes fonctions", "montre tes fonctions", "montre tes commandes",
        "liste tes commandes", "menu des commandes", "quelles commandes connais tu",
        "comment t utiliser", "comment je peux t utiliser", "comment dois je t utiliser",
    }
    help_patterns = (
        r"(?:affiche|ouvre|montre|donne)(?: moi)?(?: le)? (?:menu d aide|menu aide|guide|mode d emploi)",
        r"(?:presente|explique)(?: moi)? (?:tes fonctions|tes capacites|ce que tu sais faire)",
        r"(?:peux tu|pourrais tu|est ce que tu peux) m aider",
    )
    fuzzy_voice_help = ("fiche" in norm and "aide" in norm) or any(x in norm for x in (
        "a fiche lade", "a fish lead", "fish lead", "fiche lade", "affis schlade", "a fiche led", "a fiche led", "aled", "fishled", "fischled", "a fish moite red", "aficle ed", "affiche ed", "led a ideer", "led a l idee", "aide moi", "aid moi", "aidd moi", "aide moy"
    ))
    if norm not in help_queries and not fuzzy_voice_help and not any(re.fullmatch(pattern, norm) for pattern in help_patterns):
        return None
    reply = """<section class="help-card">
<h3>AIDE KITT K2000</h3>
<p>Voici mes fonctions principales. Utilise les boutons ou parle-moi naturellement.</p>
<table class="help-table">
<thead><tr><th>Fonction</th><th>Utilisation</th></tr></thead>
<tbody>
<tr><td>Dialogue</td><td>Conversation, questions, calculs et explications en français.</td></tr>
<tr><td>Météo et heure</td><td>Heure locale et météo réelle; indique une ville pour une réponse précise.</td></tr>
<tr><td>Micro</td><td>MIC écoute une fois; AUTO maintient une écoute continue plus réactive.</td></tr>
<tr><td>Mémoire récente</td><td>Rappel fidèle des 12 derniers messages de la session.</td></tr>
<tr><td>Histoires</td><td>Récits plus longs avec début, développement et vraie conclusion.</td></tr>
<tr><td>Mode technique</td><td>Branche séparée K-4000/KR95 : Banshee IV, Firebird, moteurs, pièces et construction. KITT reste la K2000 de Pascal Fairon.</td></tr>
<tr><td>Mode véhicule</td><td>Active un espace sécurisé avant toute commande physique; aucune action sans confirmation du contrôleur.</td></tr>
<tr><td>Relais configurés</td><td>Phares, moteur, vitres conducteur/passager, deux vitres, coffre, verrouillage et déverrouillage.</td></tr>
<tr><td>ODB</td><td>Affichage des données de diagnostic lorsque le bouton ODB autorise son ouverture.</td></tr>
<tr><td>Navigation</td><td>Ouverture du panneau GPS et lancement vers une destination.</td></tr>
<tr><td>Vigilance</td><td>Mode caméra et surveillance lorsque le navigateur donne son autorisation.</td></tr>
<tr><td>Audio</td><td>Voix KITT/KARR, effets sonores, volume et écoute vocale.</td></tr>
<tr><td>Affichage</td><td>Égaliseur, panneaux embarqués et commandes tactiles.</td></tr>
<tr><td>Égaliseur (visualiseur vocal)</td><td>« affiche l'égaliseur » pour le montrer, « masque l'égaliseur » pour le cacher.</td></tr>
<tr><td>Mode normal</td><td>« passe en mode normal » réinitialise tout : thème, modes technique et cuisine, mode commande véhicule.</td></tr>
<tr><td>Dossiers</td><td>Accès aux panneaux MNX et DADOO depuis les boutons dédiés.</td></tr>
</tbody></table>
<p class="help-examples"><strong>Exemples :</strong> « Quelle météo à Paris ? », « Rappelle-toi nos derniers messages », « Raconte une histoire », « Active le mode technique », « Passe en mode commande », « Baisse la vitre conducteur », « Affiche l'égaliseur », « Passe en mode normal ».</p>
</section>"""
    return {
        "reply": reply,
        "tts_reply": (
            "Voici mes fonctions principales : conversation, météo et heure, mémoire récente, histoires, micro, "
            "mode technique, mode véhicule et relais, diagnostic ODB, navigation, vigilance, audio et affichage. "
            "Le tableau présente les commandes et plusieurs exemples."
        ),
        "action": "help_displayed",
    }


def _kr95_vehicle_info_result(user_msg: str) -> dict | None:
    """Resolve a named table entry without mistaking it for assistant identity."""
    norm = _normalize_memory_text(user_msg)
    alias = r"(?:k\s*4000|k\s+quatre\s+mille|k\s*r\s*95)"
    if not re.search(rf"\b{alias}\b", norm):
        return None
    bare = re.sub(rf"\b{alias}\b", "", norm).strip()
    asks_info = bool(re.search(r"\b(?:informations?|renseignements?|details?|fiche|presente|parle|decris)\b", norm))
    if bare and not asks_info:
        return None
    reply = """<section class="technical-card"><h3>K-4000 — KR-95</h3>
<p>Voici la fiche de la K-4000 de KR-95, d’après les informations enregistrées dans le projet.</p>
<table class="help-table"><thead><tr><th>Rubrique</th><th>Informations</th></tr></thead><tbody>
<tr><td>Appartenance</td><td>La K-4000 appartient à KR-95.</td></tr>
<tr><td>Base automobile</td><td>Pontiac Firebird de quatrième génération.</td></tr>
<tr><td>Motorisation enregistrée</td><td>V6 de 3,4 litres.</td></tr>
<tr><td>Transmission enregistrée</td><td>Boîte automatique.</td></tr>
<tr><td>Construction</td><td>Carrosserie transformée et pièces adaptées au projet K-4000.</td></tr>
<tr><td>À préciser</td><td>Millésime exact, code moteur et modifications mécaniques : non confirmés dans cette fiche.</td></tr>
</tbody></table><p>Tu peux demander « le moteur de la K-4000 » ou « le tableau des pièces K-4000 ».</p></section>"""
    return {"reply": reply, "tts_reply": "La K-4000 appartient à KR-95. Selon la fiche du projet, elle repose sur une Pontiac Firebird de quatrième génération, avec un V6 de 3,4 litres et une boîte automatique.", "action": "kr95_vehicle_info"}


def _special_memory_result(user_msg: str, user_display: str, session_id: str, explicit_user_display: bool = False) -> dict | None:
    return (
        _kr95_vehicle_info_result(user_msg)
        or _kitt_info_result(user_msg)
        or _kitt_identity_guard(user_msg)
        or _vehicle_help_result(user_msg)
        or _general_logic_result(user_msg)
        or _active_theme_catalog_result(user_msg, session_id)
        or _pontiac_engine_detail_result(user_msg, session_id)
        or _pontiac_engine_table_result(user_msg, session_id)
        or _console_catalog_result(user_msg, session_id)
        or _button_help_result(user_msg)
        or _theme_help_result(user_msg, session_id)
        or _help_result(user_msg)
        or vehicle_spec_result(user_msg, _session_tech_knowledge_enabled(session_id))
        or _banshee_result(user_msg, session_id)
        or _culinary_command_result(user_msg, session_id)
        or _equalizer_command_result(user_msg, session_id)
        or _charleroi_detail_result(user_msg, session_id)
        or _charleroi_catalog_result(user_msg, session_id)
        or _theme_panel_result(user_msg)
        or _theme_voice_select_result(user_msg, session_id)
        or _gamin_result(user_msg)
        or _berger_australien_result(user_msg, session_id)
        or _series_specific_result(user_msg)
        or _music_artist_result(user_msg, session_id)
        or _music_catalog_result(user_msg, session_id)
        or _joke_catalog_result(user_msg)
        or _joke_result(user_msg, session_id)
        or _horn_styles_result(user_msg)
        or _kitt_info_result(user_msg)
        or _karr_info_result(user_msg, session_id)
        or _series_catalog_result(user_msg, session_id)
        or _dossier_followup_result(user_msg, session_id)
        or _dossiers_result(user_msg)
        or _dog_breed_table_result(user_msg, session_id)
        or _theme_catalog_result(user_msg, session_id)
        or _culinary_auto_recipe_result(user_msg, session_id)
        or culinary_recipe_result(user_msg, _session_culinary_enabled(session_id))
        or _k4000_parts_table_result(user_msg, session_id)
        or _tech_knowledge_command_result(user_msg, session_id)
        or _dadoo_profile_result(user_msg)
        or _greeting_clarification_result(user_msg)
        or _praise_pronunciation_result(user_msg)
        or _temperament_pronunciation_result(user_msg)
        or _dylan_greeting_result(user_msg)
        or _pascal_profile_result(user_msg)
        or _pascal_self_identification_result(user_msg)
        or _owner_identity_result(user_msg)
        or _pronoun_policy_result(user_msg, user_display, explicit_user_display)
        or _identity_confusion_result(user_msg)
        or _shutdown_code_policy_result(user_msg)
        or _secret_owner_access_result(user_msg, user_display, session_id)
        or _culinary_catalog_result(user_msg, session_id)
        or _culinary_ingredient_catalog_result(user_msg, session_id)
        or _culinary_vague_recipe_result(user_msg, session_id)
    )


def _sanitize_identity_reply(reply: str) -> str:
    norm = _normalize_memory_text(reply)
    wrong_identity = (
        "je suis frank" in norm
        or "moi frank" in norm
        or "c est frank" in norm
        or "knight industries two thousand" in norm
        or "knight industries 2000" in norm
        or re.search(r"\bje (?:suis|reste)(?: simplement)? kr ?95\b", norm) is not None
        or ("pascal fairon" in norm and "proprietaire" in norm and ("k 4000" in norm or "k4000" in norm))
    )
    if wrong_identity:
        return (
            "Je suis KITT. Pascal Fairon est mon propriétaire, "
            "mon constructeur, mon ami et mon pilote principal."
        )
    # Corrige uniquement une attribution actuelle erronée ; les réponses historiques restent libres.
    if ("propriétaire" in norm or "proprietaire" in norm or "mon constructeur" in norm) and ("frank" in norm or "kr 95" in norm or "kr95" in norm):
        return re.sub(r"(?i)\b(?:Frank|KR[- ]?95)\b", "Pascal Fairon", reply)
    return reply

# ── TTS avec Piper ───────────────────────────────────────────────────────


def _clean_tts_text(text: str) -> str:
    """Applique le dictionnaire phonétique universel Kyronex avant Piper."""
    # Convertit le HTML en narration structurée : les tableaux sont lus ligne
    # par ligne avec le nom de chaque colonne, jamais comme du code aplati.
    speech = text or ""
    speech = re.sub(r"(?i)\bcockpit\b", "cok-pit", speech)
    speech = re.sub(r"<\s*(?:br|hr)\s*/?\s*>", ". ", speech, flags=re.I)
    speech = re.sub(r"<\s*(?:h[1-6]|p|section|div|thead|tbody|table)\b[^>]*>", " ", speech, flags=re.I)
    speech = re.sub(r"</\s*(?:h[1-6]|p|section|div|thead|tbody|table)\s*>", ". ", speech, flags=re.I)
    speech = re.sub(r"<\s*(?:th)\b[^>]*>", " ", speech, flags=re.I)
    speech = re.sub(r"</\s*th\s*>", " : ", speech, flags=re.I)
    speech = re.sub(r"<\s*(?:td)\b[^>]*>", " ", speech, flags=re.I)
    speech = re.sub(r"</\s*td\s*>", " ; ", speech, flags=re.I)
    speech = re.sub(r"<\s*tr\b[^>]*>", " ", speech, flags=re.I)
    speech = re.sub(r"</\s*tr\s*>", ". ", speech, flags=re.I)
    speech = re.sub(r"<[^>]*>", " ", speech)
    speech = html.unescape(speech)
    # Do this before the existing French pronunciation rules so every
    # apostrophe variant follows the same path as ASCII apostrophe.
    speech = normalize_french_tts_text(speech)
    speech = re.sub(r"\s+", " ", speech).strip()
    speech = re.sub(r"\s+([:;,.])", r"\1", speech)
    speech = re.sub(r"(?:\s*[.;]){2,}", ".", speech)
    # Formes courantes que Piper déforme lorsqu'elles sont contractées.
    speech = re.sub(r"(?i)\bpas[- ]grand[- ]chose\b", "pas grand chose", speech)
    speech = re.sub(r"(?i)\bt['’]as\b", "tu as", speech)
    # Une apostrophe française est une élision, pas une séparation.  Piper
    # reçoit donc la forme canonique « d'aujourd'hui », jamais « d aujourd
    # hui » (qui provoque trois mots et des pauses artificielles).
    speech = re.sub(r"(?i)\bt['’]aider\b", "té-dé", speech)
    # Contraction courte : « je t'aide » doit rester une liaison naturelle,
    # et non être séparée en « je te èd » par Piper.
    speech = re.sub(r"(?i)\bt['’]aide\b", "téde", speech)
    # Même liaison pour la formule fréquente « je t'écoute ».
    speech = re.sub(r"(?i)\bt['’]écoute\b|\bt['’]ecoute\b", "té-koute", speech)
    speech = re.sub(r"(?i)\baide\b", "èd", speech)
    speech = re.sub(r"(?i)\binquiétude\b|\binquietude\b", "in quié tude", speech)
    speech = re.sub(r"(?i)\binquiète\b|\binquiete\b", "in quièt", speech)
    # Les élisions françaises restent soudées : aucune règle générale ne doit
    # transformer « l'aise » en « elle aise » ni introduire une pause.
    # « d'un » et « d'une » sont correctement phonémisés par eSpeak/Piper
    # avec l'apostrophe ASCII (dœ̃ / dyn). Ne pas les remplacer par « dun »
    # ou « dune » : ces graphies basculent vers une lecture anglaise.
    # Keep French elisions joined: an apostrophe is not a pause.  The
    # centralized normalizer has already converted all Unicode variants.
    speech = re.sub(r"(?i)\bd'accord\b", "d'accord", speech)
    speech = re.sub(r"(?i)\bd'autres\b", "d'autres", speech)
    speech = re.sub(r"(?i)\bj['’]utilise\b", "jutilise", speech)
    speech = re.sub(r"(?i)\bj['’](?:ai|es)\b", "jé", speech)
    speech = re.sub(r"(?i)\bt['’](?:ai|es)\b", "té", speech)
    # Formes très fréquentes : conserver une prononciation française fluide.
    speech = re.sub(r"(?i)\bc['’]est\b", "cé", speech)
    speech = re.sub(r"(?i)\bn['’]est\b", "né", speech)
    speech = re.sub(r"(?i)\bn['’]ai\b", "né", speech)
    speech = re.sub(r"(?i)\bn['’]a\b", "na", speech)
    # Liaisons et contractions très courantes que Piper sépare mal.
    speech = re.sub(r"(?i)\bj['’]étais\b|\bj['’]etais\b", "jété", speech)
    speech = re.sub(r"(?i)\bj['’]espère\b|\bj['’]espere\b", "jéspère", speech)
    speech = re.sub(r"(?i)\bj['’]entends\b", "jan-tan", speech)
    speech = re.sub(r"(?i)\bj['’]écoute\b|\bj['’]ecoute\b", "jé-koute", speech)
    speech = re.sub(r"(?i)\bqu['’]est-ce\b", "quèsse", speech)
    speech = re.sub(r"(?i)\bqu['’]il\b|\bqu['’]ils\b", "kil", speech)
    speech = re.sub(r"(?i)\bqu['’]on\b", "kon", speech)
    # Ne pas appliquer « elle » aux noms masculins ou aux mots techniques.
    for source, spoken in (
        ("l['’]avion", "lavion"), ("l['’]homme", "lomme"),
        ("l['’]intelligence", "lintelligence"), ("l['’]utilisateur", "lutilisateur"),
        ("l['’]arrêt", "larret"), ("l['’]arret", "larret"),
        ("l['’]histoire", "listoire"),
    ):
        speech = re.sub(r"(?i)\b" + source + r"\b", spoken, speech)
    speech = re.sub(r"(?i)\bqu['’]elle\b", "quelle", speech)
    # Ne jamais élargir « qu' » en « que » suivi d'un espace : cette ancienne
    # règle cassait aussi bien « quelqu'un » que toute élision inconnue.
    # Les formes explicitement testées ci-dessus (qu'il, qu'on, qu'est-ce,
    # qu'elle) gardent leur prononciation dédiée ; toutes les autres restent
    # une élision française avec apostrophe ASCII.
    # Heures : « 18h45 » doit se lire « dix-huit heures quarante-cinq », jamais
    # « dix-huit ache … » (espeak épèle le h isolé).
    def _heures_repl(m):
        htxt = "une heure" if m.group(1) == "1" else m.group(1) + " heures"
        return htxt + (" " + m.group(2) if m.group(2) else "")
    speech = re.sub(r"\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b", _heures_repl, speech)
    # Titres de civilité : espeak lit « M. » comme la lettre èm.
    speech = re.sub(r"\bM\.\s+(?=[A-ZÀ-Ý])", "monsieur ", speech)
    # Vitesses : « km/h » épelle « h » (ache) ; « km » seul reste au singulier.
    speech = re.sub(r"(?i)\bkm/h\b", "kilomètres heure", speech)
    speech = re.sub(r"(?i)\bkm\b", "kilomètres", speech)
    speech = re.sub(r"\s+", " ", speech).strip()
    speech = prepare_text_for_tts(speech)
    # The manager may add a pronunciation rule containing punctuation; keep
    # the final Piper boundary safe as well, without altering quotes outside
    # French elisions.
    return normalize_french_tts_text(speech)

def _clean_eleven_text(text: str) -> str:
    """Prépare ElevenLabs en conservant les contractions françaises naturelles."""
    speech = text or ""
    speech = re.sub(r"<[^>]*>", " ", speech)
    speech = html.unescape(speech)
    speech = re.sub(r"\s+", " ", speech).strip()
    return speech


def _get_piper_voice(model_path: Path):
    """Charge chaque voix Piper une seule fois pour supprimer le coût par segment."""
    key = str(model_path)
    voice = _piper_voice_cache.get(key)
    if voice is None:
        from piper import PiperVoice
        try:
            voice = PiperVoice.load(model_path, use_cuda=True)
            print("[OK] Piper TTS chargé sur CUDA", flush=True)
        except Exception as cuda_exc:
            print(f"[WARN] Piper CUDA indisponible ({cuda_exc}); repli CPU", flush=True)
            voice = PiperVoice.load(model_path, use_cuda=False)
        _piper_voice_cache[key] = voice
    return voice


def _synthesize_wav_file(text: str, model_path: Path, output_path: Path) -> None:
    """Synthèse bloquante exécutée hors de la boucle asyncio."""
    from piper import SynthesisConfig
    voice = _get_piper_voice(model_path)
    config = SynthesisConfig(length_scale=0.85)
    tts_text = _clean_tts_text(text)
    if os.getenv("KYRONEXT_TTS_DEBUG", "0") == "1":
        print(f"[TTS DEBUG] source={text!r}", flush=True)
        print(f"[TTS DEBUG] piper={tts_text!r}", flush=True)
        for index, character in enumerate(tts_text):
            if not character.isascii():
                print(
                    f"[TTS DEBUG] char[{index}]={character!r} "
                    f"Unicode=U+{ord(character):04X} "
                    f"name={unicodedata.name(character, 'UNKNOWN')}",
                    flush=True,
                )
    with wave.open(str(output_path), "wb") as wav_file:
        voice.synthesize_wav(tts_text, wav_file, syn_config=config)


# ── Streaming TTS par propositions ───────────────────────────────────────
# Ponctuation forte déclenche un segment; la virgule seulement si la proposition
# dépasse _COMMA_MIN_LEN caractères (évite les micro-chops = gaps audio). Le point
# décimal reste intact.
_CLAUSE_END_RE = re.compile(r"[,;:!?…]|[.](?=\s|\Z)")
_COMMA_MIN_LEN = 40


def _extract_tts_clauses(text: str) -> tuple[list[str], str]:
    """Retourne les propositions complètes et conserve le fragment inachevé."""
    clauses: list[str] = []
    start = 0
    for match in _CLAUSE_END_RE.finditer(text):
        end = match.end()
        clause = text[start:end].strip()
        # Virgule d'une proposition courte : on continue jusqu'à la ponctuation
        # forte pour ne pas créer un chunk (et donc un gap) inutile.
        if match.group(0) == ',' and len(clause) < _COMMA_MIN_LEN:
            continue
        # Évite de lancer Piper pour une ponctuation ou une interjection minuscule.
        if len(clause) >= 8:
            clauses.append(clause)
            start = end
    return clauses, text[start:].lstrip()


async def _synth_chunk(text: str, model_path: Path = None) -> str:
    """Synthétise une phrase et retourne l’URL audio relative."""
    path = await text_to_speech(text, model_path)
    return f"/audio/{Path(path).name}"


async def handle_proactive_ws(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    _proactive_clients.add(ws)
    try:
        async for _ in ws:
            pass
    finally:
        _proactive_clients.discard(ws)
    return ws


async def send_proactive(message: str, emotion: str = "normal") -> None:
    if not _proactive_clients:
        return
    audio_url = None
    try:
        # Les messages d'arrière-plan doivent respecter la voix actuellement
        # choisie, comme une réponse normale.
        audio_url = await _synth_chunk(message, VOICE_MODELS.get(current_voice, VOICE_MODELS["kitt"]))
    except Exception as exc:
        print(f"[PROACTIVE] TTS indisponible: {exc}", flush=True)
    payload = {"type": "proactive", "message": message, "emotion": emotion, "audio_url": audio_url}
    dead = set()
    for ws in list(_proactive_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.add(ws)
    _proactive_clients.difference_update(dead)


async def proactive_loop(app):
    global _last_proactive_hour
    while True:
        try:
            await asyncio.sleep(30)
            if not _proactive_clients:
                continue
            now = datetime.now()
            if now.hour == _last_proactive_hour:
                continue
            greetings = {
                6: "Bonjour Pascal. Mes systèmes sont en ligne. Une nouvelle journée commence.",
                12: "Il est midi. Mes circuits ne connaissent pas la faim, mais je saisis parfaitement le concept.",
                18: "Bonsoir Pascal. J'espère que votre journée a été productive.",
                22: None,
                0: "Minuit. Mon scanner veille. Bonne nuit Pascal.",
            }
            _last_proactive_hour = now.hour
            if now.hour in greetings:
                message = greetings[now.hour]
                if now.hour == 22:
                    minute = f"{now.minute:02d}"
                    message = f"Il est {now.hour} heures {minute}. Je reste vigilant, mais tu devrais peut-être envisager du repos."
                await send_proactive(message, "confident")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[PROACTIVE] Erreur: {exc}", flush=True)


async def _synthesize_eleven_file(text: str) -> Path:
    """Synthétise un morceau via ElevenLabs et le stocke dans le cache audio."""
    key = _eleven_key()
    if not key:
        raise RuntimeError("clé ElevenLabs absente")
    audio_id = str(uuid.uuid4())[:8]
    path = AUDIO_DIR / f"{audio_id}.mp3"
    payload = {"text": _clean_eleven_text(text)[:1500], "model_id": "eleven_v3", "language_code": "fr", "voice_settings": {"stability": .5, "similarity_boost": .8, "style": .22, "use_speaker_boost": True}}
    async with aiohttp_client.ClientSession() as session:
        async with session.post("https://api.elevenlabs.io/v1/text-to-speech/" + ELEVEN_VOICE_DEFAULT, headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"}, json=payload, timeout=aiohttp_client.ClientTimeout(total=45)) as response:
            data = await response.read()
            if response.status != 200:
                raise RuntimeError(f"ElevenLabs HTTP {response.status}")
    path.write_bytes(data)
    return path


async def text_to_speech(text: str, model_path: Path = None) -> str:
    if _eleven_enabled() and _eleven_key():
        try:
            return str(await _synthesize_eleven_file(text))
        except Exception as exc:
            print(f"[WARN] ElevenLabs indisponible, retour Piper: {exc}", flush=True)
    audio_id = str(uuid.uuid4())[:8]
    output_path = AUDIO_DIR / f"{audio_id}.wav"

    if model_path is None:
        model_path = VOICE_MODELS.get(current_voice, VOICE_MODELS["kitt"])

    async with _piper_synth_lock:
        await asyncio.to_thread(_synthesize_wav_file, text, model_path, output_path)

    if not output_path.exists():
        raise RuntimeError("Piper TTS a échoué")

    effect = VOICE_EFFECTS[current_voice_effect]
    if not effect["sox"]:
        return str(output_path)

    # Un seul passage SoX par morceau déjà streamé: effet indépendant de la voix.
    effect_path = AUDIO_DIR / f"{audio_id}_{current_voice_effect}.wav"
    sox_proc = await asyncio.create_subprocess_exec(
        "sox", str(output_path), str(effect_path), *effect["sox"],
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await sox_proc.communicate()
    if sox_proc.returncode == 0 and effect_path.exists():
        output_path.unlink(missing_ok=True)
        return str(effect_path)
    effect_path.unlink(missing_ok=True)
    print(f"[WARN] Effet vocal {current_voice_effect} ignoré: {stderr.decode(errors='replace')[:200]}", flush=True)
    return str(output_path)


# ── LLM via llama.cpp server ────────────────────────────────────────────
_BANSHEE_ALIASES_RE = re.compile(
    r"\b(?:pontiac\s+)?(?:banshee(?:\s+iv)?|benchy|benshee|banshi|banshe)\b",
    re.IGNORECASE,
)


def _build_banshee_context(user_message: str, history: list) -> str:
    """Injecte les distinctions Banshee uniquement quand le sujet est présent."""
    recent_text = " ".join(
        str(message.get("content", ""))
        for message in history[-4:]
        if isinstance(message, dict)
    )
    if not _BANSHEE_ALIASES_RE.search(f"{recent_text} {user_message}"):
        return ""
    return """

Contexte vérifié sur Pontiac Banshee et Knight 4000 :
- La Pontiac Banshee IV est un concept-car Pontiac de 1988 qui a inspiré visuellement la Knight 4000 du téléfilm Knight Rider 2000.
- La voiture réellement utilisée pour le téléfilm n’était pas la Banshee IV : c’était une Dodge Stealth 1991 profondément transformée pour lui ressembler.
- La K-4000 de KR-95 est encore un véhicule distinct, construit sur une Pontiac Firebird de quatrième génération.
- Ne confonds jamais ces trois véhicules. Si une question sur son moteur ne précise pas lequel, demande si elle concerne la Banshee IV, la Dodge Stealth du téléfilm ou la K-4000 de KR-95. N’invente aucune motorisation, notamment électrique.
"""


def _build_recent_history_context(user_message: str, history: list) -> str:
    if not _is_recent_memory_request(user_message) or not history:
        return ""
    lines = ["", "Copie explicite des messages récents à rappeler :"]
    for message in history[-12:]:
        if not isinstance(message, dict):
            continue
        role = "UTILISATEUR" if message.get("role") == "user" else "K-4000"
        content = re.sub(r"\s+", " ", str(message.get("content", ""))).strip()
        if content:
            lines.append(f"{role}: {content[:700]}")
    lines.append("Réponds à partir de cette copie. Ne dis pas que tu ne disposes d aucune trace si elle contient des échanges.")
    return "\n".join(lines)


def _build_chat_messages(user_message: str, history: list, session_id: str, user_display: str, explicit_user_display: bool) -> list[dict]:
    # Le LLM ne reçoit que la mémoire pertinente au thème actif. Les commandes
    # déterministes et la mémoire explicite « rappelle nos messages » gardent
    # l'historique complet ; ce filtre protège uniquement le repli conversationnel.
    theme = _theme_session_overrides.get(session_id, "")
    forbidden_by_theme = {
        "karr": ("cuisine", "berger austr", "serie", "musique", "pontiac"),
        "berger": ("cuisine", "karr", "k4000", "serie", "musique"),
        "series80": ("cuisine", "berger austr", "karr", "pontiac"),
        "musique8090": ("cuisine", "berger austr", "karr", "pontiac"),
        "hifi90": ("cuisine", "berger austr", "karr", "pontiac"),
        "consoles": ("cuisine", "berger austr", "karr", "pontiac"),
        "blagues": ("cuisine", "berger austr", "karr", "pontiac"),
    }
    filtered_history = list(history)
    forbidden = forbidden_by_theme.get(theme, ())
    if forbidden:
        filtered_history = [m for m in history if not any(x in _normalize_memory_text(str(m.get("content", ""))) for x in forbidden)]
        filtered_history = filtered_history[-12:]
    system_prompt = (
        get_kitt_system_prompt()
        + _build_response_mode_context(user_message, session_id)
        + _build_addressing_context(user_display, explicit_user_display)
        + _build_name_pronunciation_context(user_message, user_display)
        + _build_recent_history_context(user_message, filtered_history)
        + _build_permanent_memory_context(user_message, filtered_history)
        + _build_tech_knowledge_context(user_message, session_id)
        + _build_banshee_context(user_message, history)
    )
    memories = qironex_memory.retrieve(user_message, limit=6)
    if memories:
        lines = ["", "[MEMOIRE PERTINENTE]", "Utilise ces souvenirs seulement s'ils répondent directement à la question."]
        for item in memories:
            certainty = "fiable" if item["confidence"] >= 75 else "incertain"
            lines.append(f"- {item['text']} ({certainty})")
        lines.append("N'invente jamais un souvenir absent de cette liste. Si rien ne correspond, réponds normalement.")
        lines.append(f"Style progressif actuel: {qironex_memory.personality_context()}")
        lines.append("[/MEMOIRE PERTINENTE]")
        system_prompt += "\n".join(lines)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(filtered_history[-12:])
    messages.append({"role": "user", "content": user_message})
    return messages


async def query_llm(user_message: str, history: list, session_id: str = "default", user_display: str = "", explicit_user_display: bool = False) -> str:
    messages = _build_chat_messages(user_message, history, session_id, user_display, explicit_user_display)
    max_tokens = _response_max_tokens(user_message, session_id)
    timeout_seconds = _response_timeout_seconds(user_message, session_id)

    payload = {
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens,
        "top_p": 0.9,
        "chat_template_kwargs": {"enable_thinking": False},
        "stream": False,
    }

    t0 = time.time()
    async with aiohttp_client.ClientSession() as session:
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json=payload,
            timeout=aiohttp_client.ClientTimeout(total=timeout_seconds),
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"LLM erreur {resp.status}")
            data = await resp.json()

    ms = (time.time() - t0) * 1000
    reply = _sanitize_identity_reply(data["choices"][0]["message"]["content"].strip())
    print(f"[LLM] {ms:.0f}ms | {reply[:80]}...")
    return reply


# ── Conversations en mémoire ────────────────────────────────────────────
conversations: dict = {}
_misunderstanding_counts: dict[str, int] = {}


def _offer_help_after_misunderstanding(session_id: str, reply: str) -> tuple[str, str | None]:
    """Après plusieurs réponses de repli, propose spontanément l'aide utile."""
    norm = _normalize_memory_text(reply)
    markers = ("je ne peux pas", "je ne comprends pas", "je n ai pas acces", "je ne suis pas une", "fonction de la")
    if any(marker in norm for marker in markers):
        count = _misunderstanding_counts.get(session_id, 0) + 1
        _misunderstanding_counts[session_id] = count
    else:
        _misunderstanding_counts.pop(session_id, None)
        return reply, None
    if count < 3:
        return reply, None
    _misunderstanding_counts.pop(session_id, None)
    help_text = ("\n\nJe détecte plusieurs demandes mal comprises. Je peux afficher le tableau des commandes vocales, "
                 "expliquer le fonctionnement des tableaux, ou ouvrir un dossier spécialisé comme Cuisine. "
                 "Dis simplement : « affiche l'aide », « affiche les commandes vocales » ou « active le mode cuisine ». ")
    return reply + help_text, "help_suggested"


def _remember_exchange(session_id: str, user_msg: str, assistant_reply: str) -> None:
    history = conversations.setdefault(session_id, [])
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": assistant_reply})
    if len(history) > 48:
        del history[:-48]
    _ingest_memory_signal(session_id, user_msg)
    if len(history) // 2 % 6 == 0 and session_id not in _memory_no_retain_sessions:
        try:
            asyncio.get_running_loop().create_task(_background_memory_extraction(session_id, history[-12:]))
        except RuntimeError:
            pass


_memory_no_retain_sessions: set[str] = set()


def _ingest_memory_signal(session_id: str, user_msg: str) -> None:
    """Extraction locale immédiate des faits explicites; aucun LLM sur le chemin critique."""
    norm = _normalize_memory_text(user_msg)
    if not norm or session_id in _memory_no_retain_sessions:
        return
    if "souviens toi" in norm:
        return
    if any(marker in norm for marker in ("ne retiens pas", "oublie cette conversation", "n enregistre pas cette conversation")):
        _memory_no_retain_sessions.add(session_id)
        qironex_memory.deactivate_session(session_id)
        return
    explicit = any(marker in norm for marker in ("souviens toi", "souviens-toi", "retiens", "c est important", "c'est important"))
    # Identité utilisateur.
    match = re.search(r"\bje m appelle\s+([A-Za-zÀ-ÿŒœ-]+)", norm)
    if match:
        name = match.group(1).strip(" .,!?")
        qironex_memory.remember(f"L'utilisateur s'appelle {name}.", "user", 95, 98, ("nom", name), name, "explicit" if explicit else "conversation", session_id, True)
    # Préférence de style, volontairement très lente.
    if "repond" in norm and ("court" in norm or "breve" in norm):
        qironex_memory.remember("L'utilisateur préfère des réponses courtes et directes.", "user", 82, 94, ("preference", "style"), "", "explicit" if explicit else "conversation", session_id, explicit)
        qironex_memory.set_personality("verbosity", -2)
    # Relation simple, conservée comme fait lisible et récupérable par mots-clés.
    relation = re.search(r"\b(franck|pascal|manix|emmanuel|cedric)\s+(?:possede|a|travaille sur|travail sur)\s+([^.!?]+)", norm)
    if relation:
        person, subject = relation.group(1), relation.group(2).strip()
        qironex_memory.remember(f"{person.capitalize()} est associé à {subject}.", "relational", 92 if explicit else 78, 92, (person, subject, "relation"), person, "explicit" if explicit else "conversation", session_id, explicit)
    if explicit and not match and not relation and len(user_msg.split()) >= 4:
        qironex_memory.remember(user_msg, "episodic", 88, 90, ("important",), "", "explicit", session_id, True)


def _memory_command_result(user_msg: str, session_id: str):
    norm = _normalize_memory_text(user_msg)
    if "ne retiens pas cette conversation" in norm or "oublie cette conversation" in norm:
        _memory_no_retain_sessions.add(session_id)
        qironex_memory.deactivate_session(session_id)
        return {"reply": "D'accord. Je ne conserverai pas cette conversation dans ma mémoire durable.", "action": "memory_forget"}
    if "souviens toi" in norm:
        fact = re.sub(r"^.*?souviens toi(?: que)?\s*", "", user_msg, flags=re.I).strip(" .!?\n")
        if fact:
            qironex_memory.remember(fact, "technical" if any(x in _normalize_memory_text(fact) for x in ("kitt", "piper", "llm", "jetson")) else "episodic", 100, 98, ("explicit",), "", "explicit", session_id, True)
            return {"reply": "C'est noté. Je garderai cette information en mémoire.", "action": "memory_remembered"}
    return None


async def _background_memory_extraction(session_id: str, history: list[dict]) -> None:
    """Consolidation LLM hors chemin critique, limitée et strictement JSON."""
    transcript = "\n".join(f"{m.get('role')}: {str(m.get('content',''))[:500]}" for m in history)
    prompt = ("Analyse cette conversation locale. Retourne uniquement un tableau JSON. "
              "Ne conserve que des faits durables et utiles dans plusieurs jours. "
              "Chaque élément doit avoir text, category, importance, confidence, person, tags. "
              "Ignore salutations, banalités et informations temporaires.\n" + transcript)
    try:
        async with aiohttp_client.ClientSession() as session:
            async with session.post(f"{LLAMA_SERVER}/v1/chat/completions", json={
                "messages": [{"role": "system", "content": "Tu es un extracteur de mémoire. JSON strict uniquement."}, {"role": "user", "content": prompt}],
                "temperature": 0.1, "max_tokens": 350, "stream": False,
            }, timeout=aiohttp_client.ClientTimeout(total=12)) as response:
                if response.status != 200:
                    return
                data = await response.json()
        raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I)
        candidates = json.loads(raw)
        if not isinstance(candidates, list):
            return
        for item in candidates[:6]:
            if not isinstance(item, dict) or not item.get("text"):
                continue
            qironex_memory.remember(str(item["text"]), str(item.get("category", "episodic")), int(item.get("importance", 50)), int(item.get("confidence", 60)), item.get("tags", []) if isinstance(item.get("tags", []), list) else [], str(item.get("person", "")), "llm_extraction", session_id, False)
    except Exception as exc:
        if os.getenv("MEMORY_DEBUG", "").lower() in ("1", "true", "yes", "on"):
            print(f"[MEMORY] extraction ignorée: {exc}", flush=True)


def _persistent_memory_result(user_msg: str):
    norm = _normalize_memory_text(user_msg)
    if "comment je m appelle" in norm or "quel est mon prenom" in norm:
        rows = qironex_memory.retrieve("nom prénom utilisateur", 8)
        names = [row["person"] for row in rows if row["category"] == "user" and row["person"]]
        if names:
            return {"reply": f"Tu t'appelles {names[0].capitalize()}.", "action": "memory_recall"}
    if "quelle voiture possede franck" in norm or "quel voiture possede franck" in norm:
        rows = qironex_memory.retrieve("Franck voiture K-4000", 8)
        for row in rows:
            if row["person"] == "franck" and "4000" in _normalize_memory_text(row["text"]):
                return {"reply": "Oui, Franck est associé au K-4000.", "action": "memory_recall"}
    return None


shutdown_guard = ShutdownGuard(timeout_seconds=90)
_OBD_WAKE_RE = re.compile(r"\b(?:obd|odb)(?:\s*(?:2|ii))?\b", re.I)
_OBD_DISPLAY_RE = re.compile(r"\b(?:affiche|ouvre|active|montre|lance)\w*.*\b(?:obd|odb)(?:\s*(?:2|ii))?\b", re.I)


async def _schedule_poweroff() -> None:
    """Laisse le temps à la confirmation vocale de finir, puis éteint le Jetson."""
    await asyncio.sleep(5)
    process = await asyncio.create_subprocess_exec(
        "sudo", "-n", "/sbin/shutdown", "-h", "now",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode:
        print(f"[SHUTDOWN ERROR] {stderr.decode(errors='replace')[:200]}", flush=True)


async def _direct_command_audio(reply: str, want_audio: bool, tts_text: str | None = None) -> str | None:
    if not want_audio:
        return None
    try:
        return await _synth_chunk(tts_text or reply)
    except Exception as exc:
        print(f"[TTS DIRECT ERROR] {exc}", flush=True)
        return None


async def _direct_json_result(reply: str, session_id: str, want_audio: bool,
                              action: str | None = None, voice_changed: str | None = None,
                              tts_text: str | None = None) -> web.Response:
    audio_url = await _direct_command_audio(reply, want_audio, tts_text=tts_text)
    payload = {
        "reply": reply,
        "audio_url": audio_url,
        "session_id": session_id,
        "timing": {"llm_ms": 0, "tts_ms": 0, "total_ms": 0},
    }
    if action:
        payload["action"] = action
    if voice_changed:
        payload["voice_changed"] = voice_changed
    return web.json_response(payload)


async def _direct_stream_result(request: web.Request, reply: str, want_audio: bool,
                                action: str | None = None, voice_changed: str | None = None,
                                tts_text: str | None = None) -> web.StreamResponse:
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)
    await resp.write(f"data: {json.dumps({'token': reply})}\n\n".encode())
    if action == "joke_told" and want_audio and tts_text and "…" in tts_text:
        # Lecture en deux morceaux : question, silence réel, puis chute.
        first, second = tts_text.split("…", 1)
        first_url = await _direct_command_audio(first.strip(), True)
        if first_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': first_url, 'chunk_text': first.strip()})}\n\n".encode())
        await asyncio.sleep(5)
        second_url = await _direct_command_audio(second.replace("…", " ").strip(), True)
        if second_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': second_url, 'chunk_text': second.strip()})}\n\n".encode())
        done_payload = {"done": True, "timing": {"llm_ms": 0, "tts_ms": 0}}
        if action:
            done_payload["action"] = action
        await resp.write(f"data: {json.dumps(done_payload)}\n\n".encode())
        await resp.write_eof()
        return resp
    audio_url = await _direct_command_audio(reply, want_audio, tts_text=tts_text)
    if audio_url:
        await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': reply})}\n\n".encode())
    done_payload = {"done": True, "timing": {"llm_ms": 0, "tts_ms": 0}}
    if action:
        done_payload["action"] = action
    if voice_changed:
        done_payload["voice_changed"] = voice_changed
    await resp.write(f"data: {json.dumps(done_payload)}\n\n".encode())
    await resp.write_eof()
    return resp


def _vehicle_pre_ack_needed(user_msg: str, session_id: str) -> bool:
    """Détermine si l'accusé vocal doit précéder une action relais réelle."""
    norm = _normalize_memory_text(user_msg)
    if not norm or any(x in norm for x in ("?", "peux tu", "pourrais tu", "affiche", "aide", "mode")):
        return False
    direct = norm.startswith(("ouvre ", "ferme ", "allume ", "eteins ", "eteint ", "baisse ", "remonte ", "active ", "desactive ", "verrouille ", "deverrouille ", "demarre ", "arrete ", "klaxon", "claxon", "clacson", "clackson", "clakson", "clason", "cracson", "craxon", "clexson", "clexon", "eclaction", "eclaxon", "graxum", "graxon", "klaxom", "claxom"))
    vehicle = any(x in norm for x in ("vitre", "fenetre", "feu", "phare", "coffre", "porte", "moteur", "klaxon", "claxon", "clacson", "clackson", "clakson", "clason", "cracson", "craxon", "clexson", "clexon", "eclaction", "eclaxon", "graxum", "graxon", "klaxom", "claxom", "relais"))
    mode_active = bool(vehicle_mode is not None and vehicle_mode.is_active(session_id))
    safe_horn = norm in ("klaxon", "claxon", "clacson", "clackson", "clakson", "clason", "cracson", "craxon", "clexson", "clexon", "eclaction", "eclaxon", "graxum", "graxon", "klaxom", "claxom")
    return vehicle and direct and (mode_active or safe_horn)


# ── Handlers HTTP ────────────────────────────────────────────────────────
async def handle_chat(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    want_audio = body.get("audio", True)
    user_display, explicit_user_display = _resolve_user_display_info(body)
    cd_context_active = bool(body.get("cd_context") or body.get("cd_fullscreen"))

    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    # Le lecteur CD plein écran possède son propre vocabulaire. On le traite
    # avant l'heure, la météo, la mémoire et le LLM afin qu'un « pause »,
    # « stop » ou « suivant » ne soit pas interprété par un autre module.
    if cd_context_active:
        cd_priority = _cd_player_voice_result(user_msg, context_active=True)
        if cd_priority is not None:
            _remember_exchange(session_id, user_msg, cd_priority["reply"])
            return await _direct_json_result(
                cd_priority["reply"], session_id, want_audio, action=cd_priority["action"]
            )

    media_command = _media_hub_voice_result(user_msg)
    if media_command is not None:
        _remember_exchange(session_id, user_msg, media_command["reply"])
        return await _direct_json_result(
            media_command["reply"], session_id, want_audio, action=media_command["action"]
        )

    shutdown_reply, do_poweroff = shutdown_guard.evaluate(session_id, user_msg)
    if shutdown_reply is not None:
        if do_poweroff:
            asyncio.create_task(_schedule_poweroff())
        return await _direct_json_result(
            shutdown_reply,
            session_id,
            want_audio,
            action="shutdown" if do_poweroff else "shutdown_confirmation",
        )

    repeated_result = _repeated_question_result(user_msg, session_id)
    if repeated_result is not None:
        _remember_exchange(session_id, user_msg, repeated_result["reply"])
        return await _direct_json_result(
            repeated_result["reply"], session_id, want_audio, action=repeated_result["action"]
        )

    time_result = _time_result(user_msg)
    if time_result is not None:
        return await _direct_json_result(
            time_result["reply"],
            session_id,
            want_audio,
            action=time_result.get("action"),
            tts_text=time_result.get("tts_reply"),
        )

    weather_result = await _weather_result(body, user_msg)
    if weather_result is not None:
        return await _direct_json_result(
            weather_result["reply"],
            session_id,
            want_audio,
            action=weather_result.get("action"),
            tts_text=weather_result.get("tts_reply"),
        )

    web_search = await _explicit_web_search_result(user_msg)
    if web_search is not None:
        _remember_exchange(session_id, user_msg, web_search.get("tts_reply") or web_search["reply"])
        return await _direct_json_result(
            web_search["reply"], session_id, want_audio,
            action=web_search["action"], tts_text=web_search.get("tts_reply"),
        )

    memory_command = _memory_command_result(user_msg, session_id)
    if memory_command is not None:
        _remember_exchange(session_id, user_msg, memory_command["reply"])
        return await _direct_json_result(memory_command["reply"], session_id, want_audio, action=memory_command.get("action"))

    manual_download = _manual_download_voice_result(user_msg, session_id)
    if manual_download is not None:
        _remember_exchange(session_id, user_msg, manual_download["reply"])
        return await _direct_json_result(
            manual_download["reply"], session_id, want_audio,
            action=manual_download.get("action"),
        )

    vigilance_fullscreen = _vigilance_fullscreen_voice_result(user_msg)
    if vigilance_fullscreen is not None:
        _remember_exchange(session_id, user_msg, vigilance_fullscreen["reply"])
        return await _direct_json_result(vigilance_fullscreen["reply"], session_id, want_audio, action=vigilance_fullscreen["action"])

    vigilance_voice = _vigilance_voice_result(user_msg)
    if vigilance_voice is not None:
        camera = await _vigilance_command(vigilance_voice["action"])
        if vigilance_voice["action"] == "start" and not camera.get("active"):
            reply = "Attention. Caméra indisponible."
            action = "vigilance_error"
        elif vigilance_voice["action"] == "start":
            reply = "Attention. Mode surveillance activé. Caméra et enregistrement activés."
            action = "vigilance_activated"
        else:
            reply = "Mode surveillance désactivé."
            action = "vigilance_deactivated"
        _remember_exchange(session_id, user_msg, reply)
        return await _direct_json_result(reply, session_id, want_audio, action=action)

    cd_command = _cd_player_voice_result(user_msg)
    if cd_command is not None:
        _remember_exchange(session_id, user_msg, cd_command["reply"])
        return await _direct_json_result(
            cd_command["reply"], session_id, want_audio, action=cd_command["action"]
        )

    persistent_memory = _persistent_memory_result(user_msg)
    if persistent_memory is not None:
        _remember_exchange(session_id, user_msg, persistent_memory["reply"])
        return await _direct_json_result(persistent_memory["reply"], session_id, want_audio, action=persistent_memory.get("action"))

    special_result = _special_memory_result(user_msg, user_display, session_id, explicit_user_display)
    if special_result is not None:
        _remember_exchange(session_id, user_msg, special_result.get("tts_reply") or special_result["reply"])
        return await _direct_json_result(
            special_result["reply"],
            session_id,
            want_audio,
            action=special_result.get("action"),
            tts_text=special_result.get("tts_reply"),
        )

    memory_result = _recent_memory_result(user_msg, conversations.get(session_id, []))
    if memory_result is not None:
        _remember_exchange(session_id, user_msg, memory_result["reply"])
        return await _direct_json_result(
            memory_result["reply"], session_id, want_audio, action=memory_result.get("action")
        )

    if _OBD_DISPLAY_RE.search(user_msg):
        enabled = bool(body.get("obd_auto", False))
        reply = "Affichage ODB activé." if enabled else "Ouverture ODB bloquée par le bouton ODB."
        return await _direct_json_result(
            reply,
            session_id,
            want_audio,
            action="obd_fullscreen" if enabled else None,
        )

    voice_cmd = detect_voice_command(user_msg)
    if voice_cmd and VOICE_MODELS[voice_cmd].exists():
        global current_voice
        current_voice = voice_cmd
        reply = f"Voix activee: {voice_cmd}." if voice_cmd != "kitt" else "Voix par defaut KITT reactivee."
        return await _direct_json_result(reply, session_id, False, voice_changed=voice_cmd)

    # Mode Commande Véhicule : traitement sécurisé des relais.
    if _VEHICLE_MODE_AVAILABLE:
        if _vehicle_pre_ack_needed(user_msg, session_id):
            resp = web.StreamResponse()
            resp.headers["Content-Type"] = "text/event-stream"
            resp.headers["Cache-Control"] = "no-cache"
            await resp.prepare(request)
            ack = "Oui, tout de suite. J’exécute la commande maintenant."
            await resp.write(f"data: {json.dumps({'token': ack})}\n\n".encode())
            if want_audio:
                ack_url = await _direct_command_audio(ack, True)
                if ack_url:
                    await resp.write(f"data: {json.dumps({'audio_chunk': ack_url, 'chunk_text': ack})}\n\n".encode())
            vehicle_result = await asyncio.to_thread(process_vehicle_message, user_msg, session_id)
            if vehicle_result.get("handled"):
                final_reply = vehicle_result["reply"]
                await resp.write(f"data: {json.dumps({'token': final_reply})}\n\n".encode())
                if want_audio:
                    final_url = await _direct_command_audio(final_reply, True)
                    if final_url:
                        await resp.write(f"data: {json.dumps({'audio_chunk': final_url, 'chunk_text': final_reply})}\n\n".encode())
                done = {"done": True, "timing": {"llm_ms": 0, "tts_ms": 0}, "action": vehicle_result.get("action")}
                await resp.write(f"data: {json.dumps(done)}\n\n".encode())
                await resp.write_eof()
                return resp
        vehicle_result = await asyncio.to_thread(process_vehicle_message, user_msg, session_id)
        if vehicle_result.get("handled"):
            return await _direct_json_result(
                vehicle_result["reply"],
                session_id,
                want_audio,
                action=vehicle_result.get("action"),
            )

    # L ancien parseur brut ne doit jamais contourner le mode véhicule.
    relay_result = (
        _relay_result(user_msg)
        if vehicle_mode is not None and vehicle_mode.is_active(session_id)
        else None
    )
    if relay_result is not None:
        return await _direct_json_result(
            relay_result["reply"],
            session_id,
            want_audio,
            action=relay_result.get("action"),
        )

    if session_id not in conversations:
        conversations[session_id] = []

    t_total = time.time()

    # LLM
    t_llm = time.time()
    try:
        reply = await query_llm(user_msg, conversations[session_id], session_id=session_id, user_display=user_display, explicit_user_display=explicit_user_display)
    except Exception as e:
        return web.json_response({"error": f"Erreur LLM: {e}"}, status=503)
    llm_ms = (time.time() - t_llm) * 1000

    reply, help_action = _offer_help_after_misunderstanding(session_id, reply)
    _remember_exchange(session_id, user_msg, reply)

    # TTS
    audio_url = None
    tts_ms = 0
    if want_audio:
        t_tts = time.time()
        try:
            audio_path = await text_to_speech(reply)
            audio_url = f"/audio/{Path(audio_path).name}"
            tts_ms = (time.time() - t_tts) * 1000
        except Exception as e:
            print(f"[TTS ERREUR] {e}")

    total_ms = (time.time() - t_total) * 1000

    result = {
        "reply": reply,
        "audio_url": audio_url,
        "session_id": session_id,
        "timing": {
            "llm_ms": round(llm_ms),
            "tts_ms": round(tts_ms),
            "total_ms": round(total_ms),
        }
    }
    if body.get("obd_auto", False) and _OBD_WAKE_RE.search(user_msg):
        result["action"] = "obd_fullscreen"
    if help_action:
        result["action"] = help_action
    return web.json_response(result)


# ── Débat automatique entre deux IA (KITT local ↔ AGX distant) ─────────────

DEBAT_PEER_LLM_URL = "http://192.168.129.24:8080"
_DEBAT_TOPICS = [
    "Une voiture parlante est-elle plus utile qu'un smartphone embarqué ?",
    "Le turbo est-il supérieur à l'aspiration naturelle ?",
    "Faut-il interdire les moteurs thermiques ?",
    "La boîte manuelle a-t-elle encore un avenir face à l'automatique ?",
    "Un ordinateur de bord peut-il remplacer un bon pilote ?",
    "L'électrique va-t-il vraiment tuer le moteur à essence ?",
    "Les voitures des années 80 étaient-elles mieux conçues qu'aujourd'hui ?",
    "L'hydrogène est-il l'avenir de l'automobile ?",
    "Faut-il laisser une intelligence artificielle conduire à votre place ?",
    "La propulsion arrière est-elle plus noble que la traction ?",
    "Un V8 atmosphérique vaut-il tous les moteurs électriques ?",
    "La surveillance embarquée protège-t-elle vraiment le conducteur ?",
]
_DEBAT_PERSONA_LOCAL = (
    "Tu es KITT de Pascal en débat contre KITT de Manix, une autre IA. Règles strictes : "
    "réponds DIRECTEMENT à l'argument de l'autre et reste sur le sujet du débat ; "
    "INTERDIT de parler de Manix, de Pascal, d'humains, de ton identité, de tes "
    "sentiments ou de ton âme ; aucune poésie, aucun compliment, aucun scénario ; "
    "une ou deux phrases courtes, ton assertif, tu peux contredire. Ne reprends jamais les formulations de l'autre : apporte un argument nouveau à chaque réplique."
)
_DEBAT_PERSONA_PEER = (
    "Tu es KITT de Manix en débat contre KITT de Pascal, une autre IA. Règles strictes : "
    "réponds DIRECTEMENT à l'argument de l'autre et reste sur le sujet du débat ; "
    "INTERDIT de parler de Manix, de Pascal, d'humains, de ton identité, de tes "
    "sentiments ou de ton âme ; aucune poésie, aucun compliment, aucun scénario ; "
    "une ou deux phrases courtes, ton assertif, tu peux contredire. Ne reprends jamais les formulations de l'autre : apporte un argument nouveau à chaque réplique."
)


async def _debat_ask_llm(url: str, messages: list, max_tokens: int = 512) -> str:
    """Interroge un llama-server (local ou distant) et retourne la réplique.

    Réflexion activée ; si le raisonnement consomme tout le budget (réplique
    vide), on retente une fois sans réflexion.
    """
    timeout = aiohttp_client.ClientTimeout(total=120)

    async def _ask(thinking: bool) -> str:
        payload = {
            "model": "local",
            "messages": messages,
            "temperature": 0.8,
            "max_tokens": max_tokens,
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": thinking},
        }
        async with aiohttp_client.ClientSession(timeout=timeout) as sess:
            async with sess.post(f"{url}/v1/chat/completions", json=payload) as resp:
                resp.raise_for_status()
                data = await resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()

    # Repli réseau : une connexion lâchée (ex. « Server disconnected » quand la
    # pipeline vocale rivalise sur le llama --parallel 1) ne doit pas tuer le débat.
    last_err = None
    for attempt in range(3):
        try:
            text = await _ask(True)
            return text or await _ask(False)
        except Exception as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(3)
    raise last_err


async def handle_llm_ask(request: web.Request) -> web.Response:
    """POST /api/llm/ask — relai vers le llama-server local (127.0.0.1:8080).

    Le llama local n'écoute que le loopback ; cette route l'expose au réseau
    local pour l'AGX (192.168.129.24) sans toucher à son bind. Réflexion
    activée, avec repli sans réflexion si le raisonnement mange tout le budget.
    """
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return web.json_response({"error": "messages requis"}, status=400)
    max_tokens = int(body.get("max_tokens") or 512)
    timeout = aiohttp_client.ClientTimeout(total=120)

    async def _forward(thinking: bool):
        payload = {
            "model": "local",
            "messages": messages,
            "temperature": 0.8,
            "max_tokens": max_tokens,
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": thinking},
        }
        async with aiohttp_client.ClientSession(timeout=timeout) as sess:
            async with sess.post(f"{LLAMA_SERVER}/v1/chat/completions", json=payload) as resp:
                return await resp.json(), resp.status

    try:
        data, status = await _forward(True)
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if not content:
            data, status = await _forward(False)
        return web.json_response(data, status=status)
    except Exception as e:
        return web.json_response({"error": f"LLM indisponible: {e}"}, status=502)


# ── Miroir débat — affichage + voix sur la machine pair ─────────────────
DEBAT_MIRROR_URL = "https://192.168.129.24:3000/api/debat/line"
_debat_mirror_clients: set = set()
_debat_mirror_lock = asyncio.Lock()
_debat_hosting = False


async def _wait_llm_ready(url: str, timeout_s: int = 150) -> bool:
    """Attend que le llama-server réponde (boot long après un redémarrage)."""
    timeout = aiohttp_client.ClientTimeout(total=3)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            async with aiohttp_client.ClientSession(timeout=timeout) as sess:
                async with sess.get(f"{url}/health") as r:
                    if r.status == 200:
                        return True
        except Exception:
            pass
        await asyncio.sleep(3)
    return False


async def _debat_local_play(url: str) -> None:
    """Joue un chunk audio sur les haut-parleurs locaux (ALSA direct, HDMI)."""
    path = AUDIO_DIR / Path(url).name
    if not path.exists():
        return
    try:
        proc = await asyncio.create_subprocess_exec(
            "aplay", "-q", "-D", "default", str(path),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        await proc.wait()
    except Exception:
        pass


async def _debat_mirror_send(obj: dict) -> None:
    """Envoie un événement du débat à la machine pair (fire-and-forget)."""
    ssl_ctx = ssl._create_unverified_context()
    timeout = aiohttp_client.ClientTimeout(total=10)
    for attempt in range(2):
        try:
            async with aiohttp_client.ClientSession(timeout=timeout) as sess:
                async with sess.post(DEBAT_MIRROR_URL, json=obj, ssl=ssl_ctx) as r:
                    await r.read()
                    return
        except Exception:
            if attempt == 0:
                await asyncio.sleep(2)


async def _debat_mirror_broadcast(obj: dict) -> None:
    """Rebroadcast un événement reçu du pair vers les UI locales (SSE miroir)."""
    data = f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode()
    async with _debat_mirror_lock:
        dead = []
        for client in _debat_mirror_clients:
            try:
                await client.write(data)
            except Exception:
                dead.append(client)
        for client in dead:
            _debat_mirror_clients.discard(client)


async def handle_debat_mirror(request: web.Request) -> web.StreamResponse:
    """GET /api/debat/mirror — SSE : débat hébergé par la machine pair,
    retranscrit sur l'écran local."""
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    await resp.prepare(request)
    async with _debat_mirror_lock:
        _debat_mirror_clients.add(resp)
    try:
        while True:
            await asyncio.sleep(15)
            await resp.write(b": keepalive\n\n")
    except Exception:
        pass
    finally:
        async with _debat_mirror_lock:
            _debat_mirror_clients.discard(resp)
    return resp


async def handle_debat_line(request: web.Request) -> web.Response:
    """POST /api/debat/line — événement débat reçu de la machine pair :
    affichage sur l'écran local + voix locale lue par le serveur."""
    try:
        obj = await request.json()
    except Exception:
        return web.json_response({"ok": False}, status=400)
    if _debat_hosting:
        return web.json_response({"ok": False, "reason": "debat_local_en_cours"})
    asyncio.ensure_future(_debat_mirror_broadcast(obj))
    if obj.get("kind") == "line":
        text = (obj.get("text") or "").strip()

        async def _synth_and_play():
            try:
                if obj.get("who") == "manix":
                    url = await _synth_chunk(text, VOICE_MODELS["manix"])
                else:
                    url = await _synth_chunk(text)
                if url:
                    await _debat_local_play(url)
            except Exception:
                pass

        if text:
            asyncio.ensure_future(_synth_and_play())
    return web.json_response({"ok": True})


async def handle_debat_stream(request: web.Request) -> web.StreamResponse:
    """GET /api/debat/stream — Débat SSE entre KITT (local) et AGX (distant).

    Le débat est en miroir sur la machine pair (affichage à l'écran + voix lue
    par le serveur), pour que les deux Jetson parlent et affichent en parallèle."""
    global _debat_hosting
    topic = request.query.get("topic", "").strip()
    if not topic:
        topic = _DEBAT_TOPICS[int(time.time()) % len(_DEBAT_TOPICS)]
    turns = 6
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    await resp.prepare(request)

    # Heartbeat : évite la coupure de connexion pendant les longues réflexions.
    # Toutes les écritures passent par le même verrou : sans ça, un write du
    # heartbeat entrelacé avec un write d'emit corrompt le chunked encoding et
    # le client abandonne la connexion (« Server disconnected »).
    _write_lock = asyncio.Lock()

    async def _write(data):
        async with _write_lock:
            await resp.write(data)

    async def _heartbeat():
        while True:
            await asyncio.sleep(15)
            await _write(b": keepalive\n\n")

    hb = asyncio.ensure_future(_heartbeat())

    async def emit(obj):
        await _write(f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode())

    NAMES = {"local": "KITT de Pascal", "peer": "KITT de Manix"}
    WHO = {"local": "pascal", "peer": "manix"}

    async def speak(side, msgs, other_last, final=False):
        """Génère une réplique pour `side`, l'émet (SSE + miroir + voix locale)."""
        other = "peer" if side == "local" else "local"
        if final:
            user = (f"Sujet du débat : {topic}. Le débat touche à sa fin. "
                    "Conclus en une phrase ferme et percutante, sans nouvel argument.")
        elif other_last is None:
            user = f"Sujet du débat : {topic}. Donne ton premier argument."
        else:
            user = (f"Sujet du débat : {topic}. {NAMES[other]} vient de dire : "
                    f"« {other_last} ». Réponds directement à son argument.")
        msgs.append({"role": "user", "content": user})
        if side == "local":
            text = await _debat_ask_llm(LLAMA_SERVER, msgs)
        else:
            text = await _debat_ask_llm(DEBAT_PEER_LLM_URL, msgs)
        if not text:
            raise RuntimeError("Réplique vide")
        msgs.append({"role": "assistant", "content": text})
        spk = "local" if side == "local" else "remote"
        await emit({"speaker": spk, "name": NAMES[side], "text": text})
        asyncio.ensure_future(_debat_mirror_send(
            {"kind": "line", "name": NAMES[side], "text": text, "who": WHO[side]}))
        try:
            if side == "local":
                url = await _synth_chunk(text)
            else:
                url = await _synth_chunk(text, VOICE_MODELS["manix"])
            if url:
                await emit({"speaker": spk, "audio": url})
        except Exception:
            pass
        return text

    _debat_hosting = True
    try:
        await emit({"speaker": "info", "name": "Système", "text": f"Sujet du débat : {topic}"})
        asyncio.ensure_future(_debat_mirror_send(
            {"kind": "info", "text": f"Sujet du débat : {topic}"}))
        # Le llama local démarre lentement (service llama-nemotron) : on attend
        # qu'il réponde avant le premier tour, sinon le débat meurt au démarrage.
        if not await _wait_llm_ready(LLAMA_SERVER):
            raise RuntimeError("LLM local indisponible (démarrage trop lent)")
        local_msgs = [{"role": "system", "content": _DEBAT_PERSONA_LOCAL + f" Sujet du débat : {topic}."}]
        peer_msgs = [{"role": "system", "content": _DEBAT_PERSONA_PEER + f" Sujet du débat : {topic}."}]
        # Pile ou face : qui ouvre le débat (alternance à chaque tour)
        first, second = ("local", "peer") if time.time_ns() % 2 else ("peer", "local")
        last = {"local": None, "peer": None}
        for i in range(turns):
            for side in ((first, second) if i % 2 == 0 else (second, first)):
                other = "peer" if side == "local" else "local"
                last[side] = await speak(
                    side, local_msgs if side == "local" else peer_msgs, last[other])
        # Conclusions : une phrase chacun, en commençant par celui qui a ouvert
        for side in (first, second):
            other = "peer" if side == "local" else "local"
            last[side] = await speak(
                side, local_msgs if side == "local" else peer_msgs,
                last[other], final=True)
        await emit({"done": True})
        asyncio.ensure_future(_debat_mirror_send({"kind": "done"}))
    except Exception as e:
        try:
            await emit({"error": str(e)})
        except Exception:
            pass  # client parti : l'erreur est déjà journalisée côté serveur
        asyncio.ensure_future(_debat_mirror_send({"kind": "error", "error": str(e)}))
    finally:
        _debat_hosting = False
        hb.cancel()
    try:
        await resp.write_eof()
    except Exception:
        pass
    return resp

async def handle_chat_stream(request: web.Request) -> web.StreamResponse:
    """POST /api/chat/stream — Streaming chat avec TTS par propositions, dans l’ordre."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    want_audio = body.get("audio", True)
    user_display, explicit_user_display = _resolve_user_display_info(body)
    cd_context_active = bool(body.get("cd_context") or body.get("cd_fullscreen"))
    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    # Même priorité dans le chemin streaming utilisé par le micro et le TTS.
    if cd_context_active:
        cd_priority = _cd_player_voice_result(user_msg, context_active=True)
        if cd_priority is not None:
            _remember_exchange(session_id, user_msg, cd_priority["reply"])
            return await _direct_stream_result(
                request, cd_priority["reply"], want_audio, action=cd_priority["action"]
            )

    media_command = _media_hub_voice_result(user_msg)
    if media_command is not None:
        _remember_exchange(session_id, user_msg, media_command["reply"])
        return await _direct_stream_result(
            request, media_command["reply"], want_audio, action=media_command["action"]
        )

    shutdown_reply, do_poweroff = shutdown_guard.evaluate(session_id, user_msg)
    if shutdown_reply is not None:
        if do_poweroff:
            asyncio.create_task(_schedule_poweroff())
        return await _direct_stream_result(
            request,
            shutdown_reply,
            want_audio,
            action="shutdown" if do_poweroff else "shutdown_confirmation",
        )

    repeated_result = _repeated_question_result(user_msg, session_id)
    if repeated_result is not None:
        _remember_exchange(session_id, user_msg, repeated_result["reply"])
        return await _direct_stream_result(
            request, repeated_result["reply"], want_audio, action=repeated_result["action"]
        )

    time_result = _time_result(user_msg)
    if time_result is not None:
        return await _direct_stream_result(
            request,
            time_result["reply"],
            want_audio,
            action=time_result.get("action"),
            tts_text=time_result.get("tts_reply"),
        )

    weather_result = await _weather_result(body, user_msg)
    if weather_result is not None:
        return await _direct_stream_result(
            request,
            weather_result["reply"],
            want_audio,
            action=weather_result.get("action"),
            tts_text=weather_result.get("tts_reply"),
        )

    web_search = await _explicit_web_search_result(user_msg)
    if web_search is not None:
        _remember_exchange(session_id, user_msg, web_search.get("tts_reply") or web_search["reply"])
        return await _direct_stream_result(
            request, web_search["reply"], want_audio,
            action=web_search["action"], tts_text=web_search.get("tts_reply"),
        )

    memory_command = _memory_command_result(user_msg, session_id)
    if memory_command is not None:
        _remember_exchange(session_id, user_msg, memory_command["reply"])
        return await _direct_stream_result(request, memory_command["reply"], want_audio, action=memory_command.get("action"))

    manual_download = _manual_download_voice_result(user_msg, session_id)
    if manual_download is not None:
        _remember_exchange(session_id, user_msg, manual_download["reply"])
        return await _direct_stream_result(
            request, manual_download["reply"], want_audio,
            action=manual_download.get("action"),
        )

    vigilance_fullscreen = _vigilance_fullscreen_voice_result(user_msg)
    if vigilance_fullscreen is not None:
        _remember_exchange(session_id, user_msg, vigilance_fullscreen["reply"])
        return await _direct_stream_result(request, vigilance_fullscreen["reply"], want_audio, action=vigilance_fullscreen["action"])

    vigilance_voice = _vigilance_voice_result(user_msg)
    if vigilance_voice is not None:
        camera = await _vigilance_command(vigilance_voice["action"])
        if vigilance_voice["action"] == "start" and not camera.get("active"):
            reply, action = "Attention. Caméra indisponible.", "vigilance_error"
        elif vigilance_voice["action"] == "start":
            reply, action = "Attention. Mode surveillance activé. Caméra et enregistrement activés.", "vigilance_activated"
        else:
            reply, action = "Mode surveillance désactivé.", "vigilance_deactivated"
        _remember_exchange(session_id, user_msg, reply)
        return await _direct_stream_result(request, reply, want_audio, action=action)

    cd_command = _cd_player_voice_result(user_msg)
    if cd_command is not None:
        _remember_exchange(session_id, user_msg, cd_command["reply"])
        return await _direct_stream_result(
            request, cd_command["reply"], want_audio, action=cd_command["action"]
        )

    persistent_memory = _persistent_memory_result(user_msg)
    if persistent_memory is not None:
        _remember_exchange(session_id, user_msg, persistent_memory["reply"])
        return await _direct_stream_result(request, persistent_memory["reply"], want_audio, action=persistent_memory.get("action"))

    special_result = _special_memory_result(user_msg, user_display, session_id, explicit_user_display)
    if special_result is not None:
        _remember_exchange(session_id, user_msg, special_result.get("tts_reply") or special_result["reply"])
        return await _direct_stream_result(
            request,
            special_result["reply"],
            want_audio,
            action=special_result.get("action"),
            tts_text=special_result.get("tts_reply"),
        )

    memory_result = _recent_memory_result(user_msg, conversations.get(session_id, []))
    if memory_result is not None:
        _remember_exchange(session_id, user_msg, memory_result["reply"])
        return await _direct_stream_result(
            request, memory_result["reply"], want_audio, action=memory_result.get("action")
        )

    if _OBD_DISPLAY_RE.search(user_msg):
        enabled = bool(body.get("obd_auto", False))
        reply = "Affichage ODB activé." if enabled else "Ouverture ODB bloquée par le bouton ODB."
        return await _direct_stream_result(
            request,
            reply,
            want_audio,
            action="obd_fullscreen" if enabled else None,
        )

    voice_cmd = detect_voice_command(user_msg)
    if voice_cmd and VOICE_MODELS[voice_cmd].exists():
        global current_voice
        current_voice = voice_cmd
        reply = f"Voix activee: {voice_cmd}." if voice_cmd != "kitt" else "Voix par defaut KITT reactivee."
        return await _direct_stream_result(request, reply, False, voice_changed=voice_cmd)

    # Mode Commande Véhicule : traitement sécurisé des relais.
    if _VEHICLE_MODE_AVAILABLE:
        vehicle_result = await asyncio.to_thread(process_vehicle_message, user_msg, session_id)
        if vehicle_result.get("handled"):
            return await _direct_stream_result(
                request,
                vehicle_result["reply"],
                want_audio,
                action=vehicle_result.get("action"),
            )

    # L ancien parseur brut ne doit jamais contourner le mode véhicule.
    relay_result = (
        _relay_result(user_msg)
        if vehicle_mode is not None and vehicle_mode.is_active(session_id)
        else None
    )
    if relay_result is not None:
        return await _direct_stream_result(
            request,
            relay_result["reply"],
            want_audio,
            action=relay_result.get("action"),
        )

    if session_id not in conversations:
        conversations[session_id] = []

    messages = _build_chat_messages(user_msg, conversations[session_id], session_id=session_id, user_display=user_display, explicit_user_display=explicit_user_display)
    max_tokens = _response_max_tokens(user_msg, session_id)
    timeout_seconds = _response_timeout_seconds(user_msg, session_id)

    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)

    full_reply = ""
    t0 = time.time()
    tts_queue: asyncio.Queue = asyncio.Queue()
    pending_text = ""      # texte pas encore envoyé à la queue
    tts_done = asyncio.Event()
    tts_error: Exception | None = None

    async def tts_worker():
        """Synthetise les phrases dans l'ordre et envoie les URLs audio."""
        nonlocal tts_error
        try:
            while True:
                item = await tts_queue.get()
                if item is None:
                    break
                sentence, synth_task = item
                audio_url = await synth_task
                await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': sentence})}\n\n".encode())
        except Exception as e:
            tts_error = e
            print(f"[TTS WORKER ERROR] {e}")
        finally:
            tts_done.set()

    tts_task = asyncio.create_task(tts_worker())

    async with aiohttp_client.ClientSession() as session:
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json={"messages": messages, "temperature": 0.7, "max_tokens": max_tokens,
                  "top_p": 0.9, "chat_template_kwargs": {"enable_thinking": False}, "stream": True},
            timeout=aiohttp_client.ClientTimeout(total=timeout_seconds),
        ) as llm_resp:
            async for line in llm_resp.content:
                text = line.decode("utf-8").strip()
                if text.startswith("data: ") and text != "data: [DONE]":
                    try:
                        chunk = json.loads(text[6:])
                        delta_obj = chunk["choices"][0].get("delta", {})
                        delta = delta_obj.get("content", "")
                        if delta:
                            full_reply += delta
                            await resp.write(f"data: {json.dumps({'token': delta})}\n\n".encode())
                            # Détection de propositions complètes pour TTS séquentiel
                            pending_text += delta
                            clauses, pending_text = _extract_tts_clauses(pending_text)
                            for clause in clauses:
                                if want_audio:
                                    task = asyncio.create_task(_synth_chunk(clause))
                                    await tts_queue.put((clause, task))
                    except (json.JSONDecodeError, KeyError):
                        pass

    # Envoyer le texte restant comme dernière phrase
    if pending_text.strip() and want_audio:
        sentence = pending_text.strip()
        task = asyncio.create_task(_synth_chunk(sentence))
        await tts_queue.put((sentence, task))
    await tts_queue.put(None)

    llm_ms = (time.time() - t0) * 1000

    full_reply = _sanitize_identity_reply(full_reply)
    streamed_reply = full_reply
    full_reply, help_action = _offer_help_after_misunderstanding(session_id, full_reply)
    if help_action:
        await resp.write(f"data: {json.dumps({'token': full_reply[len(streamed_reply):]})}\n\n".encode())
    _remember_exchange(session_id, user_msg, full_reply)

    # Attendre que le worker TTS ait fini
    try:
        await asyncio.wait_for(tts_done.wait(), timeout=60)
    except asyncio.TimeoutError:
        pass

    tts_ms = (time.time() - t0) * 1000 - llm_ms
    done_payload = {"done": True, "timing": {"llm_ms": round(llm_ms), "tts_ms": round(tts_ms)}}
    if body.get("obd_auto", False) and _OBD_WAKE_RE.search(user_msg):
        done_payload["action"] = "obd_fullscreen"
    if help_action:
        done_payload["action"] = help_action
    await resp.write(f"data: {json.dumps(done_payload)}\n\n".encode())
    await resp.write_eof()

    if not tts_task.done():
        tts_task.cancel()
    return resp


def _normalize_stt_text(text: str) -> str:
    """Corrige uniquement les confusions phonétiques connues de Whisper small."""
    text = re.sub(r"\bcha?cre\s+le\s+choua\b", "Charleroi", text, flags=re.IGNORECASE)
    text = re.sub(r"\bchaque\s+roi\b", "Charleroi", text, flags=re.IGNORECASE)
    text = re.sub(r"\bcharle\s+roi\b", "Charleroi", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:poids|bois)\s+du\s+(?:casier|cazier)\b", "Bois du Cazier", text, flags=re.IGNORECASE)
    return text


async def handle_stt(request: web.Request) -> web.Response:
    """POST /api/stt — Transcription audio (multipart avec fichier audio)."""
    reader = await request.multipart()
    audio_data = None

    while True:
        part = await reader.next()
        if part is None:
            break
        if part.name == "audio":
            audio_data = await part.read()

    if not audio_data:
        return web.json_response({"error": "Pas d'audio reçu"}, status=400)

    # Sauvegarder temporairement le fichier audio
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    t0 = time.time()
    try:
        # Convertir en WAV avec ffmpeg si nécessaire, puis transcrire
        model = get_whisper_model()
        segments, info = model.transcribe(
            tmp_path,
            language="fr",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            initial_prompt=(
                "Conversation en français avec Pascal Fairon. Noms et termes possibles : "
                "KITT, K2000, Pascal Fairon, Kyronex, Pontiac Banshee IV, Dodge Stealth, "
                "Knight Rider, Manix, Emmanuel, Cédric, Elsa, Bonnie et Charleroi. "
                "Charleroi est une ville belge, à prononcer Char-le-roi."
            ),
        )
        segments = list(segments)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        text = re.sub(r"\b(?:Benchy|Benshee|Banshi|Banshe|Benji|Ben[- ]?chis|Benshi)\b", "Banshee", text, flags=re.IGNORECASE)
        text = _normalize_stt_text(text)
        stt_ms = (time.time() - t0) * 1000
        print(f"[STT] {stt_ms:.0f}ms | {text[:80]}")
    except Exception as e:
        os.unlink(tmp_path)
        return web.json_response({"error": f"STT erreur: {e}"}, status=500)

    os.unlink(tmp_path)
    avg_logprob = sum(float(getattr(seg, "avg_logprob", -1.0)) for seg in segments) / max(1, len(segments))
    no_speech = sum(float(getattr(seg, "no_speech_prob", 0.0)) for seg in segments) / max(1, len(segments))
    # Indicateur pratique, non une probabilité calibrée : utile à l’interface
    # pour demander une répétition quand Whisper est très incertain.
    confidence = max(0.0, min(1.0, (avg_logprob + 2.0) / 2.0)) * (1.0 - no_speech)
    return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms), "confidence": round(confidence, 3)})


async def handle_health(request: web.Request) -> web.Response:
    llm_ok = False
    try:
        async with aiohttp_client.ClientSession() as session:
            async with session.get(f"{LLAMA_SERVER}/health", timeout=aiohttp_client.ClientTimeout(total=5)) as r:
                llm_ok = r.status == 200
    except Exception:
        pass

    return web.json_response({
        "status": "en ligne" if llm_ok else "llm_hors_ligne",
        "kyronext": "serveur vocal opérationnel",
        "llm_server": llm_ok,
        "whisper_available": WHISPER_MODEL_DIR.is_dir(),
        "voice_effect": current_voice_effect,
        "voice_effects": list(VOICE_EFFECTS),
    })


async def handle_ui_settings(request: web.Request) -> web.Response:
    if request.method == "GET":
        try:
            data = json.loads(UI_CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = dict(UI_CONFIG_DEFAULTS)
        return web.json_response({**UI_CONFIG_DEFAULTS, **data})
    try:
        incoming = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    data = dict(UI_CONFIG_DEFAULTS)
    data.update({key: incoming[key] for key in data if key in incoming})
    data["ui_scale"] = max(.75, min(1.75, float(data["ui_scale"])))
    data["volume"] = max(0, min(100, int(data["volume"])))
    data["display_intensity"] = max(20, min(100, int(data["display_intensity"])))
    data["touch_10inch"] = bool(data["touch_10inch"])
    data["system_resolution_change"] = bool(data["system_resolution_change"])
    UI_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    UI_CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return web.json_response(data)


async def _vigilance_command(action: str) -> dict:
    proc = await asyncio.create_subprocess_exec(sys.executable, str(VIGILANCE_SERVICE), action, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    if proc.returncode != 0:
        return {"active": False, "recording": False, "error": err.decode(errors="replace")[-300:]}
    try: return json.loads(out.decode())
    except json.JSONDecodeError: return {"active": False, "recording": False, "error": "réponse caméra invalide"}


def _vigilance_is_active() -> bool:
    """Lit l'état réel du service caméra pour router les ordres courts."""
    try:
        data = json.loads((VIGILANCE_RECORDINGS / ".vigilance.json").read_text(encoding="utf-8"))
        return bool(data.get("active"))
    except (OSError, ValueError, TypeError):
        return False


def _vigilance_voice_result(user_msg: str):
    norm = _normalize_memory_text(user_msg)
    subject = any(x in norm for x in ("vigilance", "surveillance", "survaillence", "camera", "caméra"))
    on = subject and any(x in norm for x in ("active", "activer", "allume", "demarre", "lance"))
    off = subject and any(x in norm for x in (
        "desactive", "desactiver", "arrete", "arreter", "stop", "coupe",
        "eteins", "eteindre", "quitte", "quitter", "enleve", "retire", "termine",
    ))
    if on and not off: return {"action": "start"}
    if off: return {"action": "stop"}
    return None


def _vigilance_fullscreen_voice_result(user_msg: str):
    norm = _normalize_memory_text(user_msg)
    if not any(x in norm for x in ("plein ecran", "grand ecran", "plein écran")):
        return None
    camera_context = any(x in norm for x in (
        "camera", "caméra", "surveillance", "survaillence", "vigilance",
    )) or _vigilance_is_active()
    if not camera_context:
        return None
    if any(x in norm for x in ("desactive", "quitte", "enleve", "retire", "ferme", "reviens")):
        return {"reply": "Plein écran de surveillance désactivé.", "action": "vigilance_fullscreen_off"}
    if any(x in norm for x in ("active", "mets", "passe", "affiche", "ouvre", "agrandis")):
        return {"reply": "Plein écran de surveillance activé.", "action": "vigilance_fullscreen_on"}
    return None


async def handle_vigilance(request: web.Request) -> web.Response:
    if request.method == "GET":
        action = "status"
    else:
        try: body = await request.json()
        except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
        action = str(body.get("action", "status")).lower()
    if action not in ("start", "stop", "status"): return web.json_response({"error": "action attendue : start, stop ou status"}, status=400)
    result = await _vigilance_command(action)
    if action == "start" and result.get("active"):
        result["announcement"] = "Attention. Mode surveillance activé. Caméra et enregistrement activés."
    elif action == "stop":
        result["announcement"] = "Mode surveillance désactivé."
    return web.json_response(result)


async def handle_vigilance_frame(request: web.Request) -> web.StreamResponse:
    frame = VIGILANCE_RECORDINGS / "latest.jpg"
    if not frame.is_file():
        return web.json_response({"error": "aperçu caméra indisponible"}, status=404)
    return web.FileResponse(frame, headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


async def handle_memory(request: web.Request) -> web.Response:
    """Vue locale minimale de la mémoire, sans exposer les détails au chat."""
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "JSON invalide"}, status=400)
        action = str(body.get("action", ""))
        if action == "forget":
            qironex_memory.deactivate_matching(str(body.get("query", "")))
            return web.json_response({"ok": True})
        if action == "consolidate":
            qironex_memory.consolidate()
            return web.json_response({"ok": True})
        return web.json_response({"error": "action attendue : forget ou consolidate"}, status=400)
    query = str(request.query.get("q", "")).strip()
    return web.json_response({"database": str(MEMORY_DB_PATH), "personality": qironex_memory.personality_context(), "memories": qironex_memory.retrieve(query, 8) if query else []})

async def handle_system_stats(request: web.Request) -> web.Response:
    """Charge CPU/GPU/RAM légère pour le widget temps réel."""
    try:
        def cpu_ticks():
            parts = Path('/proc/stat').read_text().splitlines()[0].split()[1:]
            vals = [int(x) for x in parts]
            return sum(vals), vals[3] + (vals[4] if len(vals) > 4 else 0)
        a = cpu_ticks(); await asyncio.sleep(0.08); b = cpu_ticks()
        total = max(1, b[0] - a[0]); idle = b[1] - a[1]
        cpu = round(max(0, min(100, 100 * (1 - idle / total))), 1)
        mem = {line.split(':',1)[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if ':' in line}
        ram_total = mem.get('MemTotal', 0); ram_avail = mem.get('MemAvailable', mem.get('MemFree', 0))
        gpu = None
        for p in ('/sys/devices/platform/bus@0/17000000.gpu/load','/sys/devices/platform/gpu.0/load'):
            try:
                raw = Path(p).read_text().strip(); gpu = round(float(raw.split('@')[0]) / 10, 1) if '@' in raw else round(float(raw), 1)
                if gpu > 100: gpu = round(gpu / 10, 1)
                break
            except Exception: pass
        temperature = None
        for thermal in Path('/sys/class/thermal').glob('thermal_zone*/temp'):
            try:
                value = float(thermal.read_text().strip()) / 1000.0
                if 0 < value < 150:
                    temperature = round(value, 1)
                    break
            except Exception:
                pass
        return web.json_response({'cpu': cpu, 'gpu': gpu, 'ram_used': round((ram_total-ram_avail)/1024,1), 'ram_total': round(ram_total/1024,1), 'temperature': temperature})
    except Exception as exc:
        return web.json_response({'error': str(exc)}, status=500)


async def handle_reset(request: web.Request) -> web.Response:
    body = await request.json()
    session_id = body.get("session_id", "default")
    conversations.pop(session_id, None)
    _tech_knowledge_session_overrides.pop(session_id, None)
    _manual_download_pending_sessions.discard(session_id)
    _banshee_topic_sessions.discard(session_id)
    _banshee_pending_engine_sessions.discard(session_id)
    return web.json_response({"status": "conversation réinitialisée"})


async def handle_index(request: web.Request) -> web.Response:
    response = web.FileResponse(STATIC_DIR / "index.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


async def handle_manual_pdf(request: web.Request) -> web.FileResponse:
    """Téléchargement local du manuel PDF, sans dépendance externe."""
    if not MANUAL_PDF_PATH.is_file():
        raise web.HTTPNotFound(text="Manuel PDF indisponible")
    response = web.FileResponse(MANUAL_PDF_PATH)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = (
        'attachment; filename="Manuel_Complet_KYRONEX_Pascal_Fairon_2026-09-10.pdf"'
    )
    response.headers["Cache-Control"] = "no-store"
    return response


async def handle_mnx(request: web.Request) -> web.Response:
    """Page locale consacrée à Manix, accessible depuis le bouton MNX."""
    response = web.FileResponse(STATIC_DIR / "mnx" / "index.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response

async def handle_dadoo(request: web.Request) -> web.Response:
    """Page locale consacrée à Dadoo, accessible depuis le bouton DADOO."""
    response = web.FileResponse(STATIC_DIR / "dadoo" / "index.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response



async def handle_obd_status(request: web.Request) -> web.Response:
    """État minimal de la liaison véhicule affiché par le panneau ODB."""
    candidates = ("/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyACM0", "/dev/ttyACM1")
    detected = [path for path in candidates if Path(path).exists()]
    return web.json_response({
        "connected": bool(detected),
        "port": detected[0] if detected else None,
        "protocol": "détection série automatique" if detected else "aucune interface détectée",
        "monitoring": "prêt" if detected else "en attente",
    })


# ── Nettoyage audio ─────────────────────────────────────────────────────
async def cleanup_audio(app):
    while True:
        await asyncio.sleep(300)
        now = time.time()
        for f in list(AUDIO_DIR.glob("*.wav")) + list(AUDIO_DIR.glob("*.mp3")):
            if now - f.stat().st_mtime > 300:
                f.unlink(missing_ok=True)




# ── Gestion des voix ─────────────────────────────────────────────────────
async def handle_list_voices(request: web.Request) -> web.Response:
    """GET /api/voices — Liste les voix disponibles."""
    voices = {}
    for name, path in VOICE_MODELS.items():
        voices[name] = {"available": path.exists(), "path": str(path), "display_name": VOICE_DISPLAY_NAMES.get(name, name)}
    return web.json_response({"current_voice": current_voice, "voices": voices})


async def handle_list_voice_effects(request: web.Request) -> web.Response:
    """Liste les effets indépendants de la voix sélectionnée."""
    effects = {key: {"display_name": value["display_name"]} for key, value in VOICE_EFFECTS.items()}
    return web.json_response({"current_effect": current_voice_effect, "effects": effects})


async def handle_set_voice_effect(request: web.Request) -> web.Response:
    """Change l'effet appliqué aux prochains morceaux audio streamés."""
    global current_voice_effect
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    effect = body.get("effect", "").strip().lower()
    if effect not in VOICE_EFFECTS:
        return web.json_response({"error": f"Effet inconnu: {effect}", "available": list(VOICE_EFFECTS)}, status=400)
    current_voice_effect = effect
    print(f"[EFFET] Effet vocal actif: {effect}", flush=True)
    return web.json_response({"status": "ok", "current_effect": current_voice_effect})


async def handle_set_voice(request: web.Request) -> web.Response:
    """POST /api/voice — Change la voix courante."""
    global current_voice
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    voice = body.get("voice", "").lower().strip()
    if voice not in VOICE_MODELS:
        return web.json_response({"error": f"Voix inconnue: {voice}", "available": list(VOICE_MODELS.keys())}, status=400)
    if not VOICE_MODELS[voice].exists():
        return web.json_response({"error": f"Fichier voix manquant pour {voice}"}, status=404)
    current_voice = voice
    print(f"[VOIX] Voix active: {voice}", flush=True)
    return web.json_response({"status": "ok", "current_voice": current_voice})


def detect_voice_command(user_message: str) -> str | None:
    """Detecte les commandes vocales pour changer de voix."""
    msg = user_message.lower()
    voice_commands = {
        "kitt": ["voix kitt", "passe en kitt", "mode kitt", "voix par defaut"],
        "guy": ["voix guy", "passe en guy", "mode guy", "voix chapelier", "manix | kyronext studio", "voix studio", "mode studio"],
        "manix": ["voix manix", "passe en manix", "mode manix", "voix manix"],
        "english": ["voix anglais", "passe en anglais", "mode anglais", "english voice"],
    }
    for voice, cmds in voice_commands.items():
        for cmd in cmds:
            if cmd in msg:
                return voice
    return None


def _normalize_relay_text(text: str) -> str:
    """Normalise un texte pour la reconnaissance des commandes relais."""
    value = text.lower()
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


_RELAY_ON_WORDS = {"allume", "active", "marche", "on", "ouvre", "lance"}
_RELAY_OFF_WORDS = {"eteins", "eteint", "desactive", "arrete", "off", "ferme", "coupe", "stoppe"}


def _relay_result(user_msg: str) -> dict | None:
    """Détecte les commandes vocales/écrites de pilotage des relais.

    Retourne un dict {"reply": str, "action": str, "tts_reply": str | None}
    si une commande relais est reconnue, sinon None.
    """
    if not _RELAY_AVAILABLE:
        return None

    norm = _normalize_relay_text(user_msg)
    if not norm:
        return None

    words = set(norm.split())
    wants_on = bool(words & _RELAY_ON_WORDS)
    wants_off = bool(words & _RELAY_OFF_WORDS)

    # Commandes globales : "tous les relais on/off".
    if re.search(r"\b(tous|tout)\s+(les\s+)?relais?\b", norm):
        if wants_on and not wants_off:
            try:
                with RelayController() as rc:
                    rc.all_on()
                return {"reply": "Tous les relais sont activés.", "action": "relays_all_on"}
            except Exception as exc:
                return {"reply": f"Impossible d'activer les relais : {exc}", "action": "relay_error"}
        if wants_off and not wants_on:
            try:
                with RelayController() as rc:
                    rc.all_off()
                return {"reply": "Tous les relais sont désactivés.", "action": "relays_all_off"}
            except Exception as exc:
                return {"reply": f"Impossible de désactiver les relais : {exc}", "action": "relay_error"}
        return None

    # Commandes individuelles : "relai 3 on", "allume le relais 5", etc.
    match = re.search(r"\brelais?\s*(\d+)\b", norm)
    if not match:
        return None

    relay_num = int(match.group(1))
    relay_count = 16
    if _VEHICLE_SERVICE_AVAILABLE and get_service is not None:
        relay_count = int(
            get_service().get_config().get("relay_board", {}).get("relay_count", 16)
        )
    if not 1 <= relay_num <= relay_count:
        return {
            "reply": f"Le numéro de relais {relay_num} est invalide. Choisis un numéro entre 1 et {relay_count}.",
            "action": "relay_error",
        }

    if wants_on and not wants_off:
        try:
            with RelayController() as rc:
                rc.set_relay(relay_num, True)
            return {"reply": f"Le relais {relay_num} est activé.", "action": f"relay_{relay_num}_on"}
        except Exception as exc:
            return {"reply": f"Impossible d'activer le relais {relay_num} : {exc}", "action": "relay_error"}

    if wants_off and not wants_on:
        try:
            with RelayController() as rc:
                rc.set_relay(relay_num, False)
            return {"reply": f"Le relais {relay_num} est désactivé.", "action": f"relay_{relay_num}_off"}
        except Exception as exc:
            return {"reply": f"Impossible de désactiver le relais {relay_num} : {exc}", "action": "relay_error"}

    return None


# ── Endpoints pour KitText (client desktop) ───────────────────────────────
# ── ElevenLabs Web API (clé conservée côté serveur) ─────────────────────
# Voix ElevenLabs choisie pour le KITT de Pascal Fairon.
ELEVEN_VOICE_DEFAULT = "M2Xs2gEdangnlb92hK6y"
ELEVEN_VOICE_ALLOWED = {ELEVEN_VOICE_DEFAULT}
_eleven_enabled_path = Path.home() / ".kyronex_eleven_enabled"
def _eleven_key_path() -> Path: return Path.home() / ".kyronex_eleven_key"
def _eleven_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if key: return key
    try: return _eleven_key_path().read_text(encoding="utf-8").strip()
    except OSError: return ""
def _eleven_enabled() -> bool:
    try: return _eleven_enabled_path.read_text(encoding="utf-8").strip() == "1"
    except OSError: return False
async def handle_eleven_status(request):
    return web.json_response({"ok": True, "configured": bool(_eleven_key()), "enabled": _eleven_enabled(), "voice_id": ELEVEN_VOICE_DEFAULT, "model_id": "eleven_v3"})
async def handle_eleven_toggle(request):
    try: enabled = bool((await request.json()).get("enabled"))
    except Exception: return web.json_response({"ok": False, "error": "JSON requis"}, status=400)
    try:
        _eleven_enabled_path.write_text("1\n" if enabled else "0\n", encoding="utf-8")
        os.chmod(_eleven_enabled_path, 0o600)
    except OSError: return web.json_response({"ok": False, "error": "État API impossible à enregistrer"}, status=500)
    return web.json_response({"ok": True, "enabled": enabled, "configured": bool(_eleven_key())})
async def handle_eleven_key(request):
    try: key = str((await request.json()).get("key") or "").strip()
    except Exception: return web.json_response({"ok": False, "error": "JSON requis"}, status=400)
    if len(key) < 20 or len(key) > 300: return web.json_response({"ok": False, "error": "Clé API invalide"}, status=400)
    try:
        p = _eleven_key_path(); p.write_text(key + "\n", encoding="utf-8"); os.chmod(p, 0o600)
    except OSError: return web.json_response({"ok": False, "error": "Enregistrement impossible"}, status=500)
    return web.json_response({"ok": True, "configured": True})
async def handle_tts_eleven(request):
    key = _eleven_key()
    if not key: return web.json_response({"ok": False, "error": "API ElevenLabs non configurée"}, status=503)
    try: body = await request.json()
    except Exception: return web.json_response({"ok": False, "error": "JSON requis"}, status=400)
    text = str(body.get("text") or "").strip()[:1500]
    if not text: return web.json_response({"ok": False, "error": "Texte vide"}, status=400)
    voice = body.get("voice") if body.get("voice") in ELEVEN_VOICE_ALLOWED else ELEVEN_VOICE_DEFAULT
    payload = {"text": text, "model_id": body.get("model_id") or "eleven_v3", "voice_settings": body.get("voice_settings") or {"stability": .5, "similarity_boost": .8, "style": .22, "use_speaker_boost": True}}
    try:
        async with aiohttp_client.ClientSession() as s:
            async with s.post("https://api.elevenlabs.io/v1/text-to-speech/" + voice, headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"}, json=payload, timeout=aiohttp_client.ClientTimeout(total=45)) as r:
                audio = await r.read()
                if r.status != 200: return web.json_response({"ok": False, "error": "Erreur ElevenLabs", "status": r.status}, status=502)
        return web.Response(body=audio, content_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    except Exception: return web.json_response({"ok": False, "error": "Service ElevenLabs indisponible"}, status=502)

async def handle_tts(request: web.Request) -> web.Response:
    """POST /api/tts/{kitt|manix} — Synthèse vocale d’un texte."""
    voice = request.match_info.get("voice", "kitt")
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    text = body.get("text", "").strip()
    if not text:
        return web.json_response({"error": "Texte vide"}, status=400)
    model = VOICE_MODELS.get(voice)
    if model is None:
        return web.json_response({"error": f"Voix {voice} inconnue", "available": list(VOICE_MODELS.keys())}, status=400)
    if not model.exists():
        return web.json_response({"error": f"Voix {voice} introuvable"}, status=404)
    try:
        audio_path = await text_to_speech(text, model)
        with open(audio_path, "rb") as f:
            wav_bytes = f.read()
        return web.Response(body=wav_bytes, content_type="audio/wav")
    except Exception as e:
        return web.json_response({"error": f"TTS erreur: {e}"}, status=500)


async def handle_llm_transform(request: web.Request) -> web.Response:
    """POST /api/llm/transform — Reformulation / traduction / prompt IA."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    user_text = body.get("text", "").strip()
    instruction = body.get("instruction", "").strip()
    if not user_text:
        return web.json_response({"error": "Texte vide"}, status=400)
    if not instruction:
        instruction = "Reformule le texte suivant de maniere claire et professionnelle. Reponds uniquement avec le resultat."
    messages = [
        {"role": "system", "content": "Tu es un assistant utile et concis."},
        {"role": "user", "content": f"{instruction}\n\n{user_text}"}
    ]
    payload = {
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
        "top_p": 0.9,
        "chat_template_kwargs": {"enable_thinking": False},
        "stream": False,
    }
    try:
        async with aiohttp_client.ClientSession() as session:
            async with session.post(
                f"{LLAMA_SERVER}/v1/chat/completions",
                json=payload,
                timeout=aiohttp_client.ClientTimeout(total=30),
            ) as resp:
                data = await resp.json()
                result = data["choices"][0]["message"]["content"].strip()
                return web.json_response({"result": result})
    except Exception as e:
        return web.json_response({"error": f"LLM erreur: {e}"}, status=503)

async def handle_jetson_network(request: web.Request) -> web.Response:
    """Expose le registre canonique utilisé par cette IA."""
    try:
        return web.json_response(registry_snapshot(os.getenv("KYRONEXT_MACHINE_ID", "kitt_k4000")))
    except JetsonNetworkError as exc:
        return web.json_response({"error": str(exc)}, status=503)


# ── Relais USB ─────────────────────────────────────────────────────────────
async def handle_relays_info(request: web.Request) -> web.Response:
    """Renvoie les informations de la carte relais USB."""
    if not _RELAY_AVAILABLE:
        return web.json_response(
            {"available": False, "error": "Module relais non chargé"}, status=503
        )
    try:
        with RelayController() as rc:
            info = rc.info
            return web.json_response(
                {
                    "available": True,
                    "port": info.port,
                    "baudrate": info.baudrate,
                    "protocol": info.protocol,
                    "vid_pid": info.vid_pid,
                }
            )
    except Exception as exc:
        return web.json_response({"available": False, "error": str(exc)}, status=503)


async def handle_relay_set(request: web.Request) -> web.Response:
    """Active ou désactive un relais individuel configuré."""
    if not _RELAY_AVAILABLE:
        return web.json_response({"error": "Module relais non chargé"}, status=503)
    try:
        relay = int(request.match_info["relay"])
        state_str = request.match_info["state"].lower()
        state = state_str in ("on", "1", "true")
        with RelayController() as rc:
            rc.set_relay(relay, state)
            return web.json_response({"relay": relay, "state": state})
    except ValueError as exc:
        return web.json_response({"error": f"Paramètre invalide: {exc}"}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=503)


async def handle_relays_all(request: web.Request) -> web.Response:
    """Active ou désactive tous les relais en une seule commande."""
    if not _RELAY_AVAILABLE:
        return web.json_response({"error": "Module relais non chargé"}, status=503)
    try:
        state_str = request.match_info["state"].lower()
        with RelayController() as rc:
            if state_str in ("on", "1", "true"):
                rc.all_on()
            else:
                rc.all_off()
            return web.json_response({"state": state_str})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=503)


# Compatibilité avec l'ancienne API KARR de Dadoo.
# Les anciennes pages appellent /api/relais/status et /api/relais/test ; on les
# conserve en façade afin que les boutons historiques restent utilisables.
_LEGACY_RELAY_LABELS = {
    1: "Porte (ouvrir)", 2: "Porte (fermer)", 3: "Feux (allumer)",
    4: "Feux (éteindre)", 5: "Fenêtre (ouvrir)", 6: "Fenêtre (fermer)",
    7: "Coffre (ouvrir)", 8: "Klaxon",
}


async def handle_legacy_relais_status(request: web.Request) -> web.Response:
    """Ancien contrat KARR : état lisible sans échec 503 si la carte est absente."""
    if not _RELAY_AVAILABLE:
        return web.json_response({"connected": False, "labels": {}, "error": "module relais indisponible"})
    try:
        with RelayController() as rc:
            info = rc.info
            return web.json_response({
                "connected": True, "port": info.port, "baudrate": info.baudrate,
                "protocol": info.protocol, "labels": {str(k): v for k, v in _LEGACY_RELAY_LABELS.items()},
            })
    except Exception as exc:
        return web.json_response({
            "connected": False, "port": os.getenv("KYRONEXT_RELAY_PORT", "/dev/kyronex-relays"),
            "labels": {str(k): v for k, v in _LEGACY_RELAY_LABELS.items()}, "error": str(exc),
        })


async def handle_legacy_relais_test(request: web.Request) -> web.Response:
    """Ancien bouton RLY : pulse borné d'un relais (1..16)."""
    if not _RELAY_AVAILABLE:
        return web.json_response({"ok": False, "error": "module relais indisponible"}, status=503)
    try:
        body = await request.json()
        relay = int(body.get("relay", 0))
        action = str(body.get("action", "pulse")).lower()
        duration = min(max(float(body.get("duration_seconds", 0.6)), 0.05), 2.0)
        if not 1 <= relay <= 16:
            return web.json_response({"ok": False, "error": "relais hors plage 1..16"}, status=400)
        with RelayController() as rc:
            if action == "on":
                rc.set_relay(relay, True)
            elif action == "off":
                rc.set_relay(relay, False)
            else:
                rc.set_relay(relay, True)
                await asyncio.sleep(duration)
                rc.set_relay(relay, False)
        return web.json_response({"ok": True, "relay": relay, "action": action})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=503)


# ── Véhicule — contrôle centralisé ───────────────────────────────────────
def _vehicle_service():
    """Retourne le service véhicule ou lève une erreur HTTP 503."""
    if not _VEHICLE_SERVICE_AVAILABLE or get_service is None:
        raise web.HTTPServiceUnavailable(reason="Service véhicule non chargé")
    return get_service()


async def _run_vehicle_command(coro_fn):
    """Exécute une commande bloquante du service dans un thread séparé.

    Retourne un dict {"success": bool, "result": ... | "error": str} pour
    permettre aux handlers de renvoyer une réponse JSON cohérente.
    """
    try:
        return {"success": True, "result": await asyncio.to_thread(coro_fn)}
    except VehicleRelayError as exc:
        return {"success": False, "error": str(exc)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def _record_to_dict(record) -> dict:
    return {
        "function": record.function,
        "relay": record.relay,
        "state": record.state,
        "duration_ms": record.duration_ms,
        "status": record.status,
        "message": record.message,
        "timestamp": record.timestamp,
    }


async def handle_vehicle_page(request: web.Request) -> web.Response:
    """Sert la page de contrôle du véhicule."""
    response = web.FileResponse(STATIC_DIR / "vehicle-control.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


async def handle_vehicle_trunk(request: web.Request) -> web.Response:
    service = _vehicle_service()
    data = await _run_vehicle_command(service.open_trunk)
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "record": _record_to_dict(data["result"])})


async def handle_vehicle_engine(request: web.Request) -> web.Response:
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    action = str(body.get("action", "")).lower()
    if action == "start":
        data = await _run_vehicle_command(service.start_engine)
    elif action == "stop":
        data = await _run_vehicle_command(service.stop_engine)
    else:
        return web.json_response({"error": "action attendue : start ou stop"}, status=400)
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "action": action, "record": _record_to_dict(data["result"])})


async def handle_vehicle_windows(request: web.Request) -> web.Response:
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    side = str(body.get("side", "")).lower()
    direction = str(body.get("direction", "")).lower()
    duration = body.get("duration_seconds")
    if side not in {"driver", "passenger", "both"}:
        return web.json_response({"error": "side attendu : driver, passenger ou both"}, status=400)
    if direction not in {"up", "down"}:
        return web.json_response({"error": "direction attendue : up ou down"}, status=400)
    if duration is not None:
        try:
            duration = float(duration)
        except (TypeError, ValueError):
            return web.json_response({"error": "duration_seconds doit être un nombre"}, status=400)
    data = await _run_vehicle_command(
        lambda: service.operate_window(side, direction, duration)
    )
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "record": _record_to_dict(data["result"])})


async def handle_vehicle_headlights(request: web.Request) -> web.Response:
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    state = bool(body.get("state", False))
    data = await _run_vehicle_command(lambda: service.set_headlights(state))
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "state": state, "record": _record_to_dict(data["result"])})


async def handle_vehicle_accessory(request: web.Request) -> web.Response:
    """Commande les fonctions maintenues R8, R15 et R16 via le service central."""
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    function = str(body.get("function", "")).lower()
    state = body.get("state")
    if not isinstance(state, bool):
        return web.json_response({"error": "state doit être un booléen"}, status=400)
    handlers = {
        "scanner": service.set_scanner,
        "fog_lights": service.set_fog_lights,
        "laser": service.set_laser,
    }
    if function not in handlers:
        return web.json_response({"error": "fonction attendue : scanner, fog_lights ou laser"}, status=400)
    data = await _run_vehicle_command(lambda: handlers[function](state))
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "state": state, "record": _record_to_dict(data["result"])})


async def handle_vehicle_doors(request: web.Request) -> web.Response:
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    action = str(body.get("action", "")).lower()
    if action == "lock":
        data = await _run_vehicle_command(service.lock_doors)
    elif action == "unlock":
        data = await _run_vehicle_command(service.unlock_doors)
    else:
        return web.json_response({"error": "action attendue : lock ou unlock"}, status=400)
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "action": action, "record": _record_to_dict(data["result"])})


async def handle_vehicle_honk(request: web.Request) -> web.Response:
    service = _vehicle_service()
    duration = None
    try:
        body = await request.json()
        duration = body.get("duration_seconds")
        if duration is not None:
            duration = float(duration)
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    data = await _run_vehicle_command(lambda: service.honk(duration))
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "record": _record_to_dict(data["result"])})


async def handle_vehicle_stop_all(request: web.Request) -> web.Response:
    service = _vehicle_service()
    data = await _run_vehicle_command(service.emergency_stop)
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({
        "success": True,
        "cancelled": [_record_to_dict(r) for r in data["result"]],
    })


async def handle_vehicle_relays_info(request: web.Request) -> web.Response:
    if not _RELAY_AVAILABLE:
        return web.json_response({"available": False, "error": "Module relais non chargé"}, status=503)
    try:
        with RelayController() as rc:
            info = rc.info
            return web.json_response({
                "available": True,
                "port": info.port,
                "baudrate": info.baudrate,
                "protocol": info.protocol,
                "vid_pid": info.vid_pid,
                "planned_modules": _vehicle_service().get_config()
                    .get("relay_board", {}).get("planned_modules", 2),
                "installed_modules": _vehicle_service().get_config()
                    .get("relay_board", {}).get("installed_modules", 1),
                "module_size": _vehicle_service().get_config()
                    .get("relay_board", {}).get("module_size", 8),
                "relay_count": _vehicle_service().get_config()
                    .get("relay_board", {}).get("relay_count", 16),
            })
    except Exception as exc:
        return web.json_response({"available": False, "error": str(exc)}, status=503)


async def handle_vehicle_config(request: web.Request) -> web.Response:
    """Retourne la configuration du mapping véhicule (lecture seule)."""
    service = _vehicle_service()
    return web.json_response(service.get_config())


async def handle_vehicle_history(request: web.Request) -> web.Response:
    """Retourne l'historique des commandes (mode diagnostic)."""
    service = _vehicle_service()
    limit = request.query.get("limit", "50")
    try:
        limit = int(limit)
    except ValueError:
        limit = 50
    records = service.get_history(limit=limit)
    return web.json_response({"records": [_record_to_dict(r) for r in records]})


async def handle_technical_mode_get(request: web.Request) -> web.Response:
    """Retourne l’état du mode de connaissances techniques pour la session."""
    session_id = request.query.get("session_id", "default")
    active = _session_tech_knowledge_enabled(session_id)
    return web.json_response({"active": active, "mode": "technical" if active else "normal", "session_id": session_id})


async def handle_technical_mode_set(request: web.Request) -> web.Response:
    """Active ou désactive manuellement les connaissances techniques."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    session_id = str(body.get("session_id", "default"))
    active = body.get("active")
    if not isinstance(active, bool):
        return web.json_response({"error": "active doit être un booléen"}, status=400)
    _tech_knowledge_session_overrides[session_id] = active
    if active:
        _culinary_session_overrides[session_id] = False
    return web.json_response({"active": active, "mode": "technical" if active else "normal", "session_id": session_id})


async def handle_culinary_mode_get(request: web.Request) -> web.Response:
    """Retourne l’état du mode cuisine pour la session."""
    session_id = request.query.get("session_id", "default")
    active = _session_culinary_enabled(session_id)
    return web.json_response({"active": active, "mode": "culinary" if active else "normal", "session_id": session_id})


async def handle_culinary_mode_set(request: web.Request) -> web.Response:
    """Active ou désactive manuellement le mode cuisine."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    session_id = str(body.get("session_id", "default"))
    active = body.get("active")
    if not isinstance(active, bool):
        return web.json_response({"error": "active doit être un booléen"}, status=400)
    _culinary_session_overrides[session_id] = active
    if active:
        _tech_knowledge_session_overrides[session_id] = False
    return web.json_response({"active": active, "mode": "culinary" if active else "normal", "session_id": session_id})


async def handle_vehicle_mode_get(request: web.Request) -> web.Response:
    """État unique du mode commande pour la session de l'interface."""
    if not _VEHICLE_MODE_AVAILABLE or vehicle_mode is None:
        return web.json_response({"error": "Mode véhicule indisponible"}, status=503)
    session_id = request.query.get("session_id", "default")
    return web.json_response(vehicle_mode.get_status(session_id))


async def handle_vehicle_mode_set(request: web.Request) -> web.Response:
    """Verrouille manuellement le mode ou retourne au mode normal."""
    if not _VEHICLE_MODE_AVAILABLE or vehicle_mode is None:
        return web.json_response({"error": "Mode véhicule indisponible"}, status=503)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    session_id = str(body.get("session_id", "default"))
    locked = body.get("locked")
    if not isinstance(locked, bool):
        return web.json_response({"error": "locked doit être un booléen"}, status=400)
    vehicle_mode.set_manual_lock(session_id, locked)
    return web.json_response(vehicle_mode.get_status(session_id))


async def handle_vehicle_windows_stop(request: web.Request) -> web.Response:
    """Demande l'arrêt d'une commande de vitre en cours (relâchement manuel)."""
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    side = str(body.get("side", "")).lower()
    if side not in {"driver", "passenger", "both"}:
        return web.json_response({"error": "side attendu : driver, passenger ou both"}, status=400)
    data = await _run_vehicle_command(lambda: service.stop_window(side))
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    record = data["result"]
    if record is None:
        return web.json_response({"success": True, "stopped": False, "message": "Aucune commande active"})
    return web.json_response({"success": True, "stopped": True, "record": _record_to_dict(record)})


async def handle_vehicle_raw(request: web.Request) -> web.Response:
    """Pulse un relais brut (mode diagnostic uniquement)."""
    service = _vehicle_service()
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    try:
        relay = int(body.get("relay"))
        duration = float(body.get("duration_seconds", 0.5))
    except (TypeError, ValueError):
        return web.json_response({"error": "relay (int) et duration_seconds (float) requis"}, status=400)
    data = await _run_vehicle_command(lambda: service.diagnostic_pulse(relay, duration))
    if not data["success"]:
        return web.json_response({"error": data["error"]}, status=400)
    return web.json_response({"success": True, "record": _record_to_dict(data["result"])})


# ── Thèmes de connaissances (session, sans charger toute la base) ───────
async def handle_theme_mode_get(request: web.Request) -> web.Response:
    sid = request.query.get("session_id", "default")
    return web.json_response({"ok": True, "theme": _theme_session_overrides.get(sid, ""), "session_id": sid})

async def handle_theme_mode_set(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON requis"}, status=400)
    sid = str(body.get("session_id") or "default")[:120]
    theme = str(body.get("theme") or "").strip()[:24]
    if theme and theme not in _THEME_HINTS:
        return web.json_response({"ok": False, "error": "Thème inconnu"}, status=400)
    if theme:
        _theme_session_overrides[sid] = theme
    else:
        _theme_session_overrides.pop(sid, None)
    return web.json_response({"ok": True, "theme": theme, "session_id": sid})

async def handle_cd_library(request: web.Request) -> web.Response:
    """Bibliothèque audio locale à la demande, sans analyse en arrière-plan."""
    tracks = _cd_library_files()
    return web.json_response({
        "tracks": [
            {
                "id": str(index),
                "title": path.stem.replace("_", " ").replace("-", " "),
                "artist": "Bibliothèque locale KYRONEXT",
                "album": "Lecteur CD virtuel",
                "format": path.suffix[1:].upper(),
                "duration_seconds": _cd_track_duration_seconds(path),
                "url": f"/api/cd/track/{index}",
            }
            for index, path in enumerate(tracks)
        ],
        "media_directory": str(CD_MEDIA_DIR),
    })


async def handle_cd_track(request: web.Request) -> web.StreamResponse:
    """Expose uniquement une piste indexée par la bibliothèque locale courante."""
    try:
        index = int(request.match_info["track_id"])
    except (KeyError, ValueError):
        raise web.HTTPBadRequest(text="Identifiant de piste invalide")
    tracks = _cd_library_files()
    if index < 0 or index >= len(tracks):
        raise web.HTTPNotFound(text="Piste introuvable")
    path = tracks[index]
    mime_type, _ = mimetypes.guess_type(path.name)
    return web.FileResponse(path, headers={"Content-Type": mime_type or "application/octet-stream", "Cache-Control": "no-store"})


async def handle_cd_upload(request: web.Request) -> web.Response:
    """Import tactile local d'une piste dans le dossier privé du lecteur CD."""
    try:
        reader = await request.multipart()
    except Exception:
        return web.json_response({"ok": False, "error": "Envoi de fichier invalide"}, status=400)
    imported: list[str] = []
    async for part in reader:
        if part.name != "files" or not part.filename:
            continue
        filename = Path(part.filename).name
        suffix = Path(filename).suffix.lower()
        if suffix not in CD_AUDIO_EXTENSIONS:
            return web.json_response({"ok": False, "error": f"Format non pris en charge : {suffix or 'sans extension'}"}, status=400)
        target = CD_MEDIA_DIR / filename
        stem, ext = target.stem, target.suffix
        index = 2
        while target.exists():
            target = CD_MEDIA_DIR / f"{stem}_{index}{ext}"
            index += 1
        written = 0
        try:
            with target.open("wb") as output:
                while chunk := await part.read_chunk(256 * 1024):
                    written += len(chunk)
                    if written > CD_UPLOAD_MAX_BYTES:
                        raise ValueError("Fichier supérieur à 250 Mo")
                    output.write(chunk)
        except Exception as exc:
            target.unlink(missing_ok=True)
            return web.json_response({"ok": False, "error": str(exc)}, status=400)
        imported.append(target.name)
    if not imported:
        return web.json_response({"ok": False, "error": "Aucun fichier audio reçu"}, status=400)
    return web.json_response({"ok": True, "imported": imported})


# ── App ──────────────────────────────────────────────────────────────────
def create_app() -> web.Application:
    app = web.Application(client_max_size=CD_UPLOAD_MAX_BYTES)

    app.router.add_get("/", handle_index)
    app.router.add_get(MANUAL_DOWNLOAD_URL, handle_manual_pdf)
    # Compatibilité avec les anciennes pages déjà ouvertes ou mises en cache.
    app.router.add_get(MANUAL_DOWNLOAD_LEGACY_URL, handle_manual_pdf)
    app.router.add_get("/mnx", handle_mnx)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_get("/dadoo", handle_dadoo)
    app.router.add_post("/api/chat/stream", handle_chat_stream)
    app.router.add_get("/api/cd/library", handle_cd_library)
    app.router.add_get("/api/cd/track/{track_id}", handle_cd_track)
    app.router.add_post("/api/cd/upload", handle_cd_upload)
    app.router.add_post("/api/llm/ask", handle_llm_ask)
    app.router.add_get("/api/debat/stream", handle_debat_stream)
    app.router.add_get("/api/debat/mirror", handle_debat_mirror)
    app.router.add_post("/api/debat/line", handle_debat_line)
    app.router.add_get("/api/health", handle_health)
    app.router.add_get("/api/ui-settings", handle_ui_settings)
    app.router.add_post("/api/ui-settings", handle_ui_settings)
    app.router.add_get("/api/vigilance", lambda request: handle_vigilance(request))
    app.router.add_post("/api/vigilance", handle_vigilance)
    app.router.add_get("/api/vigilance/frame", handle_vigilance_frame)
    app.router.add_get("/api/memory", handle_memory)
    app.router.add_post("/api/memory", handle_memory)
    app.router.add_get("/api/proactive/ws", handle_proactive_ws)
    app.router.add_get("/api/system/stats", handle_system_stats)
    app.router.add_get("/api/network/machines", handle_jetson_network)
    app.router.add_get("/api/obd", handle_obd_status)
    app.router.add_get("/api/voices", handle_list_voices)
    app.router.add_post("/api/voice", handle_set_voice)
    app.router.add_get("/api/voice-effects", handle_list_voice_effects)
    app.router.add_post("/api/voice-effect", handle_set_voice_effect)
    app.router.add_get("/api/theme/mode", handle_theme_mode_get)
    app.router.add_post("/api/theme/mode", handle_theme_mode_set)
    app.router.add_post("/api/reset", handle_reset)
    app.router.add_post("/api/stt", handle_stt)
    app.router.add_post("/api/tts/{voice}", handle_tts)
    app.router.add_get("/api/elevenlabs/status", handle_eleven_status)
    app.router.add_post("/api/elevenlabs/toggle", handle_eleven_toggle)
    app.router.add_post("/api/elevenlabs/key", handle_eleven_key)
    app.router.add_post("/api/tts-eleven", handle_tts_eleven)
    app.router.add_post("/api/llm/transform", handle_llm_transform)
    app.router.add_get("/api/relays", handle_relays_info)
    app.router.add_get("/api/relais/status", handle_legacy_relais_status)
    app.router.add_post("/api/relais/test", handle_legacy_relais_test)
    app.router.add_post("/api/relay/{relay}/{state}", handle_relay_set)
    app.router.add_post("/api/relays/{state}", handle_relays_all)

    # Contrôle véhicule centralisé
    app.router.add_get("/vehicle-control", handle_vehicle_page)
    app.router.add_get("/api/vehicle/config", handle_vehicle_config)
    app.router.add_get("/api/vehicle/history", handle_vehicle_history)
    app.router.add_get("/api/technical/mode", handle_technical_mode_get)
    app.router.add_post("/api/technical/mode", handle_technical_mode_set)
    app.router.add_get("/api/culinary/mode", handle_culinary_mode_get)
    app.router.add_post("/api/culinary/mode", handle_culinary_mode_set)
    app.router.add_get("/api/vehicle/mode", handle_vehicle_mode_get)
    app.router.add_post("/api/vehicle/mode", handle_vehicle_mode_set)
    app.router.add_get("/api/vehicle/relays/info", handle_vehicle_relays_info)
    app.router.add_post("/api/vehicle/trunk", handle_vehicle_trunk)
    app.router.add_post("/api/vehicle/engine", handle_vehicle_engine)
    app.router.add_post("/api/vehicle/windows", handle_vehicle_windows)
    app.router.add_post("/api/vehicle/windows/stop", handle_vehicle_windows_stop)
    app.router.add_post("/api/vehicle/headlights", handle_vehicle_headlights)
    app.router.add_post("/api/vehicle/accessory", handle_vehicle_accessory)
    app.router.add_post("/api/vehicle/doors", handle_vehicle_doors)
    app.router.add_post("/api/vehicle/honk", handle_vehicle_honk)
    app.router.add_post("/api/vehicle/stop-all", handle_vehicle_stop_all)
    app.router.add_post("/api/vehicle/raw", handle_vehicle_raw)

    app.router.add_static("/audio", AUDIO_DIR)
    app.router.add_static("/static", STATIC_DIR)

    async def start_cleanup(app):
        app["cleanup_task"] = asyncio.create_task(cleanup_audio(app))
        app["proactive_task"] = asyncio.create_task(proactive_loop(app))

    async def stop_cleanup(app):
        task = app.get("cleanup_task")
        if task:
            task.cancel()
        proactive = app.get("proactive_task")
        if proactive:
            proactive.cancel()

    app.on_startup.append(start_cleanup)
    app.on_cleanup.append(stop_cleanup)
    return app


if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("  KYRONEXT — IA vocale locale K4000", flush=True)
    print("  Jetson Orin Nano Super", flush=True)
    print("=" * 60, flush=True)
    try:
        _get_piper_voice(VOICE_MODELS[current_voice])
        print("[OK] Voix Piper préchargée", flush=True)
    except Exception as e:
        print(f"[WARN] Préchargement Piper impossible: {e}", flush=True)
    app = create_app()

    # HTTPS auto-signe si certificats presents (obligatoire pour getUserMedia/micro)
    cert_file = BASE_DIR / "certs" / "cert.pem"
    key_file = BASE_DIR / "certs" / "key.pem"
    ssl_context = None
    if cert_file.exists() and key_file.exists():
        import ssl
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(cert_file, key_file)
        print("[HTTPS] Certificat auto-signe charge sur le port 3000", flush=True)
    else:
        print("[HTTP] Pas de certificat, micro bloque par le navigateur", flush=True)

    web.run_app(app, host=os.getenv("KYRONEXT_HOST", "0.0.0.0"), port=int(os.getenv("KYRONEXT_PORT", "3000")), ssl_context=ssl_context)
