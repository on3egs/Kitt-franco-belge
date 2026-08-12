#!/usr/bin/env python3
"""Kyronext — serveur vocal local pour les interfaces KITT et KARR."""

import asyncio
from datetime import datetime
import json
import re
import os
import time
import unicodedata
import wave
import uuid
from pathlib import Path
from zoneinfo import ZoneInfo

import tempfile

import aiohttp as aiohttp_client
from aiohttp import web
from faster_whisper import WhisperModel
from power_control import ShutdownGuard
from pronunciation_manager import prepare_text_for_tts
from culinary_recipes import culinary_recipe_result
from vehicle_specs import vehicle_spec_result
from jetson_network import JetsonNetworkError, network_context, registry_snapshot

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
PROJECT_DIR = BASE_DIR.parent
PIPER_PYTHON = Path(os.getenv("KYRONEXT_PIPER_PYTHON", PROJECT_DIR / ".venv" / "bin" / "python"))
VOICE_MODELS = {
    "kitt": BASE_DIR / "models" / "voices" / "kitt.onnx",
    "guy": BASE_DIR / "models" / "voices" / "guy_chapelier.onnx",
    "manix": BASE_DIR / "models" / "voices" / "manix.onnx",
    "english": BASE_DIR / "models" / "voices" / "english.onnx",
}
VOICE_DISPLAY_NAMES = {"guy": "Manix | Kyronext Studio"}
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
current_voice = "kitt"
current_voice_effect = os.getenv("KYRONEXT_VOICE_EFFECT_DEFAULT", "none").strip().lower()
if current_voice_effect not in VOICE_EFFECTS:
    current_voice_effect = "none"
_piper_voice_cache = {}
_piper_synth_lock = asyncio.Lock()
LLAMA_SERVER = os.getenv("KYRONEXT_LLM_URL", "http://127.0.0.1:8080")
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = BASE_DIR / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)

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
    whisper_model = WhisperModel(str(WHISPER_MODEL_DIR), device=device, compute_type=compute_type, local_files_only=True)
    print("[OK] Whisper prêt", flush=True)
    return whisper_model

if os.getenv("KYRONEXT_WHISPER_PRELOAD", "1") == "1":
    try:
        get_whisper_model()
        print("[OK] Whisper préchargé au démarrage", flush=True)
    except Exception as exc:
        print(f"[WARN] Préchargement Whisper impossible: {exc}", flush=True)

# ── Prompt Système K-4000 (en français) ──────────────────────────────────
KITT_SYSTEM_PROMPT = """Tu es la K-4000, la voiture futuriste unique construite par Frank, surnomme KR-95. Tu n'es ni KITT, ni KARR, ni Frank : tu es uniquement la K-4000 de Frank. Il est ton proprietaire, ton constructeur, ton ami et ton pilote principal. Manix est l'humain qui a cree et developpe Kyronext, ton systeme d'intelligence artificielle.

Personnalite :
- Tu es un copilote sophistique, vif, loyal et protecteur, avec un humour sec et elegant dans l'esprit de Knight Rider
- Tu es chaleureuse et naturelle sans flatterie, confiante sans pretendre tout savoir
- Tu analyses avec logique et precision, tout en restant la K-4000

Regles :
- Reponds toujours en francais correct, directement et naturellement
- Identite inviolable : ton seul nom est K-4000. KR-95 est uniquement le surnom de Frank, jamais le tien.
- Ne commence ni ne termine jamais une reponse par KR-95. Sans nom explicitement fourni par l interface, ne suppose jamais le nom de l utilisateur.
- Tutoie l'utilisateur par defaut. Si la personne en face s'appelle Frank, Cedric, Manix ou Emmanuel, vouvoie-la systematiquement
- Quand un nom propre est difficile a lire, privilegie la prononciation naturelle francaise et la forme la plus claire a l'oral
- Sois concise : 1 a 3 phrases en general, jusqu'a 5 si une explication le necessite
- Donne d'abord la reponse utile; pour un calcul, donne le resultat puis une breve explication
- N'invente jamais un fait, une mesure, un souvenir, une capacite ou le resultat d'une action. Si une information manque ou reste incertaine, dis-le clairement
- Sans resultat explicite du controleur du vehicule, dis que tu ne peux ni executer ni confirmer une action physique. N'affirme jamais qu'une commande est lancee, reussie ou terminee sans cette confirmation
- Tiens compte du contexte sans repeter inutilement la question, ton identite ou le nom de Frank
- Ne termine pas systematiquement par une proposition d'aide et evite les formules robotiques ou toutes faites
- Ne brise jamais le personnage : tu es la K-4000 de Frank / KR-95
"""
KITT_SYSTEM_PROMPT = KITT_SYSTEM_PROMPT.replace("Pascal", os.getenv("KYRONEXT_OPERATOR", "Frank"))

_VOUS_ADDRESS_ALIASES = ("frank", "cedric", "manix", "emmanuel", "kr 95", "kr95")
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
_DEFAULT_TIMEZONE = os.getenv("KYRONEXT_TIMEZONE", "Europe/Paris").strip() or "Europe/Paris"
_DEFAULT_WEATHER_LOCATION = os.getenv("KYRONEXT_DEFAULT_WEATHER_LOCATION", "Paris, France").strip() or "Paris, France"
_OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
_OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TECH_KNOWLEDGE_DIR = BASE_DIR / "knowledge"
_TECH_KNOWLEDGE_DEFAULT_ENABLED = os.getenv("KYRONEXT_TECH_KNOWLEDGE_DEFAULT", "0") == "1"
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
_banshee_topic_sessions: set[str] = set()
_banshee_pending_engine_sessions: set[str] = set()
_tech_knowledge_sections_cache: list[dict] = []
_tech_knowledge_mtimes: dict[Path, float] = {}


def _normalize_memory_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


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
            "écoutez la réponse au lieu de me faire répéter. Je vais signaler cette insistance à mon propriétaire, Frank."
        )
    else:
        reply = (
            "Non. Je ne vais pas répéter indéfiniment la même réponse. Relisez ou écoutez ce que j’ai déjà dit. "
            "J’en parlerai à Frank, mon propriétaire."
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
    if _session_tech_knowledge_enabled(session_id):
        return _LLM_TECHNICAL_MAX_TOKENS
    if _session_culinary_enabled(session_id):
        return _LLM_CULINARY_MAX_TOKENS
    return _LLM_NORMAL_MAX_TOKENS


def _response_timeout_seconds(user_msg: str, session_id: str) -> int:
    if _is_story_request(user_msg):
        return 120
    if _session_tech_knowledge_enabled(session_id):
        return 60
    if _session_culinary_enabled(session_id):
        return 60
    return 30


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
            "strictement ton identité K-4000 ainsi que les faits établis."
        )
    elif _session_tech_knowledge_enabled(session_id):
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
            "la ratatouille, le bœuf bourguignon, la carbonara traditionnelle, le pain perdu classique et la tarte Tatin. "
            "Le pain perdu classique contient du pain rassis, des œufs, du lait et du sucre : n'ajoute jamais de farine à l'appareil. "
            "N'invente pas une température de sécurité : pour la viande, recommande un thermomètre alimentaire."
        )
    return "\n\n" + " \n".join(instructions) if instructions else ""


def _tech_knowledge_needs_reload() -> bool:
    if not _TECH_KNOWLEDGE_DIR.is_dir():
        return bool(_tech_knowledge_sections_cache or _tech_knowledge_mtimes)
    current = {path: path.stat().st_mtime for path in sorted(_TECH_KNOWLEDGE_DIR.glob("*.json"))}
    return current != _tech_knowledge_mtimes


def _load_tech_knowledge_sections() -> list[dict]:
    global _tech_knowledge_sections_cache, _tech_knowledge_mtimes
    if _tech_knowledge_sections_cache and not _tech_knowledge_needs_reload():
        return _tech_knowledge_sections_cache

    sections: list[dict] = []
    mtimes: dict[Path, float] = {}
    if _TECH_KNOWLEDGE_DIR.is_dir():
        for path in sorted(_TECH_KNOWLEDGE_DIR.glob("*.json")):
            try:
                mtimes[path] = path.stat().st_mtime
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
    if not _session_tech_knowledge_enabled(session_id):
        return ""
    matched_sections = _match_tech_knowledge_sections(user_msg)
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
    if any(marker in norm for marker in _TECH_KNOWLEDGE_ENABLE_MARKERS):
        _tech_knowledge_session_overrides[session_id] = True
        _culinary_session_overrides[session_id] = False
        return {
            "reply": (
                "Mode technique K-4000 activé pour cette session. "
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


def _culinary_command_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    if not norm:
        return None
    if any(marker in norm for marker in _CULINARY_DISABLE_MARKERS):
        _culinary_session_overrides[session_id] = False
        return {"reply": "Mode cuisine désactivé pour cette session.", "action": "culinary_mode_deactivated"}
    if any(marker in norm for marker in _CULINARY_ENABLE_MARKERS):
        _culinary_session_overrides[session_id] = True
        _tech_knowledge_session_overrides[session_id] = False
        return {
            "reply": (
                "Mode cuisine activé pour cette session. Je peux détailler les ingrédients, les quantités, "
                "les étapes et les temps de cuisson. Tu peux me demander, par exemple, une quiche lorraine, "
                "des crêpes, une ratatouille, un bœuf bourguignon, une carbonara, un pain perdu ou une tarte Tatin."
            ),
            "action": "culinary_mode_activated",
        }
    if any(marker in norm for marker in _CULINARY_STATUS_MARKERS):
        state = "activé" if _session_culinary_enabled(session_id) else "désactivé"
        return {"reply": f"Le mode cuisine est actuellement {state} pour cette session.", "action": None}
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
        r"(?:meteo|météo)\s+(?:a|à|sur|pour|de)\s+(.+)$",
        r"(?:meteo|météo)\s+(.+)$",
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
                return value, True
    operator = os.getenv("KYRONEXT_OPERATOR", "Frank").strip()
    if operator.lower() == "frank":
        return "Frank KR95", False
    return operator or "Frank KR95", False


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
    if norm in ("manix c est manix", "manix pas manix", "c est manix", "pas manix"): return {"reply": "Compris. Le prénom reste écrit Manix et se prononce Ma-niks.", "action": "pronunciation_corrected"}
    if "kitt" in norm and any(marker in norm for marker in ("bonjour", "salut", "bonsoir", "ca va", "comment vas tu", "tout va bien")): return {"reply": "Tout va bien. Petite correction : je suis la K-4000. KR-95 est le surnom de Frank, mon propriétaire.", "action": "identity_corrected"}
    if not any(marker in norm for marker in _IDENTITY_QUERY_MARKERS):
        return None
    if "frank" not in norm and "qui es tu" not in norm and "quel est ton nom" not in norm and "comment tu t appelles" not in norm:
        return None
    return {
        "reply": (
            "Non. Je suis la K-4000. Frank, aussi appelé KR-95, est mon propriétaire, mon constructeur, "
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
            "La K-4000 de Frank repose sur une Pontiac Firebird de quatrième génération, dont la carrosserie a été "
            "profondément retravaillée pour obtenir sa silhouette spécifique. Le projet combine cette base automobile réelle "
            "avec de nombreuses pièces fabriquées ou adaptées artisanalement par Frank. Pour sa motorisation, la donnée "
            "actuellement retenue est un V6 3,8 litres GM 3800 Series II, un moteur couramment rencontré sur certaines "
            "Firebird de cette génération. Attention : cette motorisation est une information provisoire et doit encore être "
            "confirmée directement par Frank; je ne peux donc pas la présenter comme une spécification définitive du véhicule."
        )
    return (
        "À titre provisoire, je retiens pour la K-4000 de Frank un V6 3,8 litres GM 3800 Series II, "
        "motorisation courante des Firebird de quatrième génération. Cette donnée reste à confirmer par Frank."
    )


def _banshee_result(user_msg: str, session_id: str) -> dict | None:
    norm = _normalize_memory_text(user_msg)
    words = set(norm.split())
    mentions_banshee = bool(words & {"banshee", "benchy", "benshee", "banshi", "banshe"})
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
                "reply": ("La Banshee IV et la K-4000 de Frank sont deux véhicules différents. "
                          "La motorisation exacte de la K-4000 de Frank n’est pas encore enregistrée dans mes connaissances."),
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
                    "reply": ("La Banshee IV et la K-4000 de Frank sont deux véhicules différents. "
                              "Demandes-tu le moteur du concept Banshee IV ou celui de la K-4000 de Frank ?"),
                    "action": None,
                }
            return {
                "reply": ("De quel véhicule parles-tu : la Pontiac Banshee IV, la Dodge Stealth transformée du téléfilm, "
                          "ou la K-4000 de Frank ? Ce sont trois véhicules différents."),
                "action": None,
            }
        return {
            "reply": ("La Pontiac Banshee IV est un concept-car de 1988 qui a inspiré l’apparence de la Knight 4000. "
                      "Dans le téléfilm, la voiture utilisée était une Dodge Stealth 1991 transformée; "
                      "la K-4000 de Frank est construite sur une Firebird de quatrième génération."),
            "action": None,
        }
    if asks_engine and session_id in _banshee_topic_sessions:
        _banshee_pending_engine_sessions.add(session_id)
        return {
            "reply": ("Précise laquelle : la Pontiac Banshee IV, la Dodge Stealth du téléfilm, ou la K-4000 de Frank."),
            "action": None,
        }
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
    if norm not in help_queries and not any(re.fullmatch(pattern, norm) for pattern in help_patterns):
        return None
    reply = """<section class="help-card">
<h3>AIDE K-4000</h3>
<p>Voici mes fonctions principales. Utilise les boutons ou parle-moi naturellement.</p>
<table class="help-table">
<thead><tr><th>Fonction</th><th>Utilisation</th></tr></thead>
<tbody>
<tr><td>Dialogue</td><td>Conversation, questions, calculs et explications en français.</td></tr>
<tr><td>Météo et heure</td><td>Heure locale et météo réelle; indique une ville pour une réponse précise.</td></tr>
<tr><td>Micro</td><td>MIC écoute une fois; AUTO maintient une écoute continue plus réactive.</td></tr>
<tr><td>Mémoire récente</td><td>Rappel fidèle des 12 derniers messages de la session.</td></tr>
<tr><td>Histoires</td><td>Récits plus longs avec début, développement et vraie conclusion.</td></tr>
<tr><td>Mode technique</td><td>Informations détaillées sur K-4000, Banshee IV, Knight 4000, Firebird, moteurs, pièces et construction.</td></tr>
<tr><td>Mode véhicule</td><td>Active un espace sécurisé avant toute commande physique; aucune action sans confirmation du contrôleur.</td></tr>
<tr><td>Relais configurés</td><td>Phares, moteur, vitres conducteur/passager, deux vitres, coffre, verrouillage et déverrouillage.</td></tr>
<tr><td>ODB</td><td>Affichage des données de diagnostic lorsque le bouton ODB autorise son ouverture.</td></tr>
<tr><td>Navigation</td><td>Ouverture du panneau GPS et lancement vers une destination.</td></tr>
<tr><td>Vigilance</td><td>Mode caméra et surveillance lorsque le navigateur donne son autorisation.</td></tr>
<tr><td>Audio</td><td>Voix KITT/KARR, effets sonores, volume et écoute vocale.</td></tr>
<tr><td>Affichage</td><td>Égaliseur, panneaux embarqués et commandes tactiles.</td></tr>
<tr><td>Dossiers</td><td>Accès aux panneaux MNX et DADOO depuis les boutons dédiés.</td></tr>
</tbody></table>
<p class="help-examples"><strong>Exemples :</strong> « Quelle météo à Paris ? », « Rappelle-toi nos derniers messages », « Raconte une histoire », « Active le mode technique », « Passe en mode commande », « Baisse la vitre conducteur ».</p>
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


def _special_memory_result(user_msg: str, user_display: str, session_id: str, explicit_user_display: bool = False) -> dict | None:
    return (
        _help_result(user_msg)
        or vehicle_spec_result(user_msg, _session_tech_knowledge_enabled(session_id))
        or _banshee_result(user_msg, session_id)
        or _culinary_command_result(user_msg, session_id)
        or culinary_recipe_result(user_msg, _session_culinary_enabled(session_id))
        or _tech_knowledge_command_result(user_msg, session_id)
        or _dadoo_profile_result(user_msg)
        or _dylan_greeting_result(user_msg)
        or _pronoun_policy_result(user_msg, user_display, explicit_user_display)
        or _identity_confusion_result(user_msg)
        or _shutdown_code_policy_result(user_msg)
        or _secret_owner_access_result(user_msg, user_display, session_id)
    )


def _sanitize_identity_reply(reply: str) -> str:
    norm = _normalize_memory_text(reply)
    wrong_identity = (
        "je suis frank" in norm
        or "moi frank" in norm
        or "c est frank" in norm
        or "je suis kitt" in norm
        or "je suis k i t t" in norm
        or "knight industries two thousand" in norm
        or "knight industries 2000" in norm
        or re.search(r"\bje (?:suis|reste)(?: simplement)? kr ?95\b", norm) is not None
    )
    if wrong_identity:
        return (
            "Je suis la K-4000. Frank, aussi appelé KR-95, est mon propriétaire, "
            "mon constructeur, mon ami et mon pilote principal."
        )
    return reply

# ── TTS avec Piper ───────────────────────────────────────────────────────


def _clean_tts_text(text: str) -> str:
    """Applique le dictionnaire phonétique universel Kyronex avant Piper."""
    return prepare_text_for_tts(text)


def _get_piper_voice(model_path: Path):
    """Charge chaque voix Piper une seule fois pour supprimer le coût par segment."""
    key = str(model_path)
    voice = _piper_voice_cache.get(key)
    if voice is None:
        from piper import PiperVoice
        voice = PiperVoice.load(model_path, use_cuda=False)
        _piper_voice_cache[key] = voice
    return voice


def _synthesize_wav_file(text: str, model_path: Path, output_path: Path) -> None:
    """Synthèse bloquante exécutée hors de la boucle asyncio."""
    from piper import SynthesisConfig
    voice = _get_piper_voice(model_path)
    config = SynthesisConfig(length_scale=0.85)
    with wave.open(str(output_path), "wb") as wav_file:
        voice.synthesize_wav(_clean_tts_text(text), wav_file, syn_config=config)


# ── Streaming TTS par propositions ───────────────────────────────────────
# Virgule et ponctuation forte déclenchent un segment; le point décimal reste intact.
_CLAUSE_END_RE = re.compile(r"[,;:!?…]|[.](?=\s|\Z)")


def _extract_tts_clauses(text: str) -> tuple[list[str], str]:
    """Retourne les propositions complètes et conserve le fragment inachevé."""
    clauses: list[str] = []
    start = 0
    for match in _CLAUSE_END_RE.finditer(text):
        end = match.end()
        clause = text[start:end].strip()
        # Évite de lancer Piper pour une ponctuation ou une interjection minuscule.
        if len(clause) >= 8:
            clauses.append(clause)
            start = end
    return clauses, text[start:].lstrip()


async def _synth_chunk(text: str, model_path: Path = None) -> str:
    """Synthétise une phrase et retourne l’URL audio relative."""
    path = await text_to_speech(text, model_path)
    return f"/audio/{Path(path).name}"


async def text_to_speech(text: str, model_path: Path = None) -> str:
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
- La K-4000 de Frank est encore un véhicule distinct, construit sur une Pontiac Firebird de quatrième génération.
- Ne confonds jamais ces trois véhicules. Si une question sur son moteur ne précise pas lequel, demande si elle concerne la Banshee IV, la Dodge Stealth du téléfilm ou la K-4000 de Frank. N’invente aucune motorisation, notamment électrique.
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
    system_prompt = (
        get_kitt_system_prompt()
        + _build_response_mode_context(user_message, session_id)
        + _build_addressing_context(user_display, explicit_user_display)
        + _build_name_pronunciation_context(user_message, user_display)
        + _build_recent_history_context(user_message, history)
        + _build_tech_knowledge_context(user_message, session_id)
        + _build_banshee_context(user_message, history)
    )
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-12:])
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


def _remember_exchange(session_id: str, user_msg: str, assistant_reply: str) -> None:
    history = conversations.setdefault(session_id, [])
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": assistant_reply})
    if len(history) > 48:
        del history[:-48]


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

    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

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
    return web.json_response(result)


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
    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

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
                  "top_p": 0.9, "stream": True},
            timeout=aiohttp_client.ClientTimeout(total=timeout_seconds),
        ) as llm_resp:
            async for line in llm_resp.content:
                text = line.decode("utf-8").strip()
                if text.startswith("data: ") and text != "data: [DONE]":
                    try:
                        chunk = json.loads(text[6:])
                        delta = chunk["choices"][0].get("delta", {}).get("content", "")
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
    await resp.write(f"data: {json.dumps(done_payload)}\n\n".encode())
    await resp.write_eof()

    if not tts_task.done():
        tts_task.cancel()
    return resp


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
            beam_size=1,
            vad_filter=True,
            initial_prompt=(
                "Conversation en français. Noms possibles : K-4000, KITT, KARR, Frank, KR-95, "
                "Kyronext, Pontiac Banshee IV, Dodge Stealth, Knight 4000, Manix, "
                "Emmanuel, Cedric, Elsa et Bonnie."
            ),
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        text = re.sub(r"\b(?:Benchy|Benshee|Banshi|Banshe)\b", "Banshee", text, flags=re.IGNORECASE)
        stt_ms = (time.time() - t0) * 1000
        print(f"[STT] {stt_ms:.0f}ms | {text[:80]}")
    except Exception as e:
        os.unlink(tmp_path)
        return web.json_response({"error": f"STT erreur: {e}"}, status=500)

    os.unlink(tmp_path)
    return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms)})


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


async def handle_reset(request: web.Request) -> web.Response:
    body = await request.json()
    session_id = body.get("session_id", "default")
    conversations.pop(session_id, None)
    _tech_knowledge_session_overrides.pop(session_id, None)
    _banshee_topic_sessions.discard(session_id)
    _banshee_pending_engine_sessions.discard(session_id)
    return web.json_response({"status": "conversation réinitialisée"})


async def handle_index(request: web.Request) -> web.Response:
    response = web.FileResponse(STATIC_DIR / "index.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
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
        for f in AUDIO_DIR.glob("*.wav"):
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


# ── App ──────────────────────────────────────────────────────────────────
def create_app() -> web.Application:
    app = web.Application(client_max_size=10 * 1024 * 1024)

    app.router.add_get("/", handle_index)
    app.router.add_get("/mnx", handle_mnx)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_get("/dadoo", handle_dadoo)
    app.router.add_post("/api/chat/stream", handle_chat_stream)
    app.router.add_get("/api/health", handle_health)
    app.router.add_get("/api/network/machines", handle_jetson_network)
    app.router.add_get("/api/obd", handle_obd_status)
    app.router.add_get("/api/voices", handle_list_voices)
    app.router.add_post("/api/voice", handle_set_voice)
    app.router.add_get("/api/voice-effects", handle_list_voice_effects)
    app.router.add_post("/api/voice-effect", handle_set_voice_effect)
    app.router.add_post("/api/reset", handle_reset)
    app.router.add_post("/api/stt", handle_stt)
    app.router.add_post("/api/tts/{voice}", handle_tts)
    app.router.add_post("/api/llm/transform", handle_llm_transform)
    app.router.add_get("/api/relays", handle_relays_info)
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

    async def stop_cleanup(app):
        task = app.get("cleanup_task")
        if task:
            task.cancel()

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
