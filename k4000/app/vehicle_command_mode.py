"""Mode Commande Véhicule — contrôle sécurisé des 16 relais USB/RS-485.

Ce module implémente un mode dédié pour le pilotage des relais depuis le chatbot
Kyronex. Les relais ne sont jamais actionnés pendant une conversation normale.

Règles de sécurité :
    1. Le mode commande véhicule doit être activé explicitement par l'utilisateur.
    2. Une fois activé, seuls les ordres explicites sont exécutés.
    3. Les demandes polies (« peux-tu... ? ») déclenchent une demande de
       confirmation, même en mode commande.
    4. Les phrases narratives ou au futur/passé sont ignorées.
    5. Le mode s'éteint automatiquement après une période d'inactivité.

Les numéros de IntentRule sont des identifiants logiques historiques.
Le mapping physique est exclusivement défini dans config/vehicle_relays.json.
Pour le montage Thunder, R1-R6 sont coordonnés par le service afin d'assurer
l'inversion de polarité et la sélection des deux moteurs de vitre.
"""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
import uuid
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable

# vehicle_relay_service est importé à la volée pour garder ce module testable
# même si pyserial n'est pas disponible.
try:
    from vehicle_relay_service import VehicleRelayError, get_service
    _RELAY_AVAILABLE = True
except Exception:
    VehicleRelayError = Exception  # type: ignore[misc,assignment]
    get_service = None  # type: ignore[assignment]
    _RELAY_AVAILABLE = False


# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
MODE_TIMEOUT_SECONDS = 300  # 5 minutes d'inactivité
PENDING_ACTIVATION_TIMEOUT_SECONDS = 30
LOG_DIR = Path(__file__).parent / "logs"
LOG_FILE = LOG_DIR / "vehicle_commands.log"

LOG_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------------------
# Logger dédié
# ------------------------------------------------------------------------------
_logger = logging.getLogger("vehicle_command_mode")
if not _logger.handlers:
    _logger.setLevel(logging.INFO)
    _formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    _file_handler.setFormatter(_formatter)
    _logger.addHandler(_file_handler)


# ------------------------------------------------------------------------------
# Modèles de données
# ------------------------------------------------------------------------------
@dataclass(frozen=True)
class RelayCommand:
    relay: int
    state: bool
    description: str
    pulse_seconds: float | None = None


@dataclass(frozen=True)
class IntentRule:
    relay: int
    description: str
    on_patterns: tuple[str, ...]
    off_patterns: tuple[str, ...]
    pulse_on_seconds: float | None = None
    pulse_off_seconds: float | None = None


@dataclass
class VehicleSessionState:
    active: bool = False
    manually_locked: bool = False
    last_activity: float = field(default_factory=time.monotonic)
    pending_confirmation: dict | None = None
    pending_activation: dict | None = None


# Phrases de confirmation courtes, prononcées UNIQUEMENT après exécution réelle
# réussie de la commande relais (record.status == "completed").
# Il n'existe aucun retour électrique de position : le logiciel confirme
# seulement ce qu'il sait réellement, c'est-à-dire l'exécution de la commande.
# Format : (phrase si command.state True, phrase si False).
_SUCCESS_REPLIES: dict[str, tuple[str, str]] = {
    "headlights": ("Commande d'allumage des feux envoyée.", "Commande d'extinction des feux envoyée."),
    "engine_start": ("Commande de démarrage envoyée.", "Commande de démarrage envoyée."),
    "engine_stop": ("Commande d'arrêt moteur envoyée.", "Commande d'arrêt moteur envoyée."),
    "window_driver_down": ("Commande d'ouverture de la fenêtre conducteur envoyée.", "Commande d'ouverture de la fenêtre conducteur envoyée."),
    "window_driver_up": ("Commande de fermeture de la fenêtre conducteur envoyée.", "Commande de fermeture de la fenêtre conducteur envoyée."),
    "window_passenger_down": ("Commande d'ouverture de la fenêtre passager envoyée.", "Commande d'ouverture de la fenêtre passager envoyée."),
    "window_passenger_up": ("Commande de fermeture de la fenêtre passager envoyée.", "Commande de fermeture de la fenêtre passager envoyée."),
    "windows_both_down": ("Commande d'ouverture des fenêtres envoyée.", "Commande d'ouverture des fenêtres envoyée."),
    "windows_both_up": ("Commande de fermeture des fenêtres envoyée.", "Commande de fermeture des fenêtres envoyée."),
    "trunk": ("Commande d'ouverture du coffre envoyée.", "Commande d'ouverture du coffre envoyée."),
    "doors_lock": ("Commande de verrouillage des portes envoyée.", "Commande de verrouillage des portes envoyée."),
    "doors_unlock": ("Commande de déverrouillage des portes envoyée.", "Commande de déverrouillage des portes envoyée."),
    "scanner": ("Commande d'activation du scanner envoyée.", "Commande de désactivation du scanner envoyée."),
    "horn": ("Commande du klaxon envoyée.", "Commande du klaxon envoyée."),
    "laser": (
        "Séquence laser de cinq secondes envoyée, avec extinction automatique.",
        "Commande d'extinction immédiate du laser envoyée.",
    ),
    "horn_normal": ("Klaxon normal envoyé.", "Klaxon normal envoyé."),
    "horn_double": ("Double klaxon envoyé.", "Double klaxon envoyé."),
    "horn_amical": ("Klaxon amical envoyé.", "Klaxon amical envoyé."),
    "horn_mariage": ("Klaxon mariage envoyé.", "Klaxon mariage envoyé."),
    "horn_mission": ("Klaxon mission envoyé.", "Klaxon mission envoyé."),
    "horn_alerte": ("Klaxon d'alerte envoyé.", "Klaxon d'alerte envoyé."),
    "horn_sos": ("Séquence SOS du klaxon envoyée.", "Séquence SOS du klaxon envoyée."),
    "horn_kitt": ("Signature klaxon KITT envoyée.", "Signature klaxon KITT envoyée."),
    "horn_stop": ("Commande d'arrêt du klaxon envoyée.", "Commande d'arrêt du klaxon envoyée."),
    "lights_appel": ("Appel de phares envoyé.", "Appel de phares envoyé."),
    "lights_double": ("Double appel de phares envoyé.", "Double appel de phares envoyé."),
    "lights_merci": ("Code de phares merci envoyé.", "Code de phares merci envoyé."),
    "lights_attention": ("Alerte lumineuse envoyée.", "Alerte lumineuse envoyée."),
    "lights_sos": ("Code lumineux S O S envoyé.", "Code lumineux S O S envoyé."),
    "lights_kitt": ("Signature lumineuse KITT envoyée.", "Signature lumineuse KITT envoyée."),
    "lights_stop": ("Commande d'arrêt du code lumineux envoyée.", "Commande d'arrêt du code lumineux envoyée."),
    "combined_sos": ("Super S O S lancé.", "Super S O S lancé."),
    "combined_panique": ("Mode panique lancé pour dix secondes.", "Mode panique lancé pour dix secondes."),
    "combined_demo": ("Mode démonstration lancé.", "Mode démonstration lancé."),
    "combined_stop": ("Mode combiné interrompu.", "Mode combiné interrompu."),
}

# Ces commandes restent routées par le service centralisé (anti-collision,
# durée maximale, journalisation), mais elles ne nécessitent pas le mode
# commande. Les éléments pouvant ouvrir/fermer le véhicule, l'éclairer ou agir
# sur le moteur restent protégés par le mode commande.
_SAFE_NORMAL_RELAYS = frozenset({3, 4, 5, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20})

# Whisper peut transformer « klaxon » en « claxon », « glaxon », « axon »
# ou « l'axonne ». Ces formes ne doivent pas partir au LLM : elles restent
# limitées au vocabulaire klaxon et sont canonisées avant le matching.
_HORN_SPEECH_ALIASES = (
    "klaxon", "claxon", "clacson", "clackson", "clakson", "clason",
    "klakson", "klason", "cracson", "craxon", "clexson", "clexon",
    "eclaction", "eclaxon", "graxum", "graxon", "glaxon", "glaxonne",
    "glaxone", "laxon", "laxonne", "axon", "axonne", "claccon", "claconne",
    "claxonne", "claxone", "klaxonne", "klaxone", "claksonne", "classion",
    "classon", "claxion", "klaxom", "claxom", "jackson",
)

# Variantes que Whisper produit souvent pour les huit motifs. Le rapprochement
# ci-dessous ne sera utilisé qu'après détection d'un contexte klaxon.
_HORN_STYLE_ALIASES: dict[str, tuple[str, ...]] = {
    "normal": ("normal", "normale", "nochmal", "nochmal"),
    "double": ("double", "doubles", "deux", "doubl"),
    "amical": ("amical", "amicale", "amicalle", "amicales"),
    "mariage": ("mariage", "mariages"),
    "mission": ("mission", "missions", "michion", "michon", "mision"),
    "alerte": ("alerte", "alert", "alrt", "echt", "eck", "echec", "echt"),
    "sos": ("sos", "sois", "soie", "soi"),
    "kitt": ("kitt", "kit", "mickael", "michael", "mikael", "michel", "signature"),
}

_HORN_ACTION_WORDS = frozenset({
    "jou", "joue", "joues", "jous", "zoue", "zou", "zoo", "jouer",
    "fais", "faire", "active", "activer", "lance", "lancer", "utilise",
    "actionne", "appuie", "donne", "coup", "bip", "tut",
})


def _horn_similarity(left: str, right: str) -> float:
    """Score léger, local et sans dépendance pour les erreurs STT."""
    return SequenceMatcher(None, left, right, autojunk=False).ratio()


def _horn_alias_present(norm: str) -> bool:
    """Détecte un ancrage klaxon exact ou très proche.

    Le seuil est volontairement strict. Un mot ressemblant à « klaxon » n'est
    accepté que dans une phrase qui ressemble déjà à une commande ; cela évite
    qu'une conversation sur un nom propre ou un sujet voisin actionne un relais.
    """
    tokens = norm.split()
    aliases = set(_HORN_SPEECH_ALIASES)
    if any(token in aliases and token != "jackson" for token in tokens):
        return True
    if "jackson" in tokens:
        # « Jackson » seul reste une personne ; « klaxon à Jackson » est une
        # erreur STT documentée et est autorisée par le contexte de commande.
        if len(tokens) > 1 and bool(set(tokens) & _HORN_ACTION_WORDS):
            return True
    for token in tokens:
        if len(token) < 5:
            continue
        if _horn_similarity(token, "klaxon") >= 0.78:
            return True
    return False


def _replace_fuzzy_horn_style(value: str) -> str:
    """Canonise un motif après que le contexte klaxon est établi."""
    tokens = value.split()
    canonical = {alias: name for name, aliases in _HORN_STYLE_ALIASES.items() for alias in aliases}
    all_styles = tuple(canonical)
    for index, token in enumerate(tokens):
        if token in canonical:
            tokens[index] = canonical[token]
            continue
        # Les mots très courts ou éloignés sont exclus : le mode expert ne
        # devine jamais un motif à partir d'un simple bruit.
        if len(token) < 4:
            continue
        best_style = max(all_styles, key=lambda style: _horn_similarity(token, style))
        if _horn_similarity(token, best_style) >= 0.80:
            tokens[index] = best_style
    return " ".join(tokens)


def _canonicalize_horn_phrase(norm: str) -> str:
    """Réduit les erreurs STT courantes à une intention klaxon canonique.

    La transformation n'est activée que si un alias klaxon est présent. Elle
    ne modifie donc pas les mots « alerte », « normal » ou « SOS » dans une
    conversation générale.
    """
    if not _horn_alias_present(norm):
        return norm
    alias_re = r"\b(?:" + "|".join(map(re.escape, _HORN_SPEECH_ALIASES)) + r")\b"
    value = re.sub(alias_re, "klaxon", norm)
    value = re.sub(r"\b(?:jou|joue|joues|jous|zoue|zoue|zou|zoo)\b", "joue", value)
    value = re.sub(r"\b(?:et\s+sois|et\s+soie|et\s+soi)\b", "sos", value)
    # « klaxon à Mickael/Michael » est une confusion STT fréquente pour
    # « klaxon KITT » dans ce contexte Knight Rider.
    value = _replace_fuzzy_horn_style(value)
    return re.sub(r"\s+", " ", value).strip()


# ------------------------------------------------------------------------------
# Mapping intentions -> relais
# ------------------------------------------------------------------------------
# Chaque entrée associe des patterns ON/OFF à un relais, une description et une
# durée d'impulsion optionnelle. Les patterns sont testés avec re.search dans
# le texte normalisé. L'ordre compte : les règles les plus spécifiques doivent
# être testées en premier pour éviter qu'une commande de vitre conducteur soit
# confondue avec la commande "deux vitres".
_INTENT_RULES: list[IntentRule] = [
    # Modes spectacle combinés, protégés par le mode commande.
    IntentRule(28, "super SOS", (r"^(?:active|lance|demarre|fais)\s+(?:le\s+)?super\s+sos$", r"^super\s+sos$"), ()),
    IntentRule(29, "mode panique", (r"^(?:active|lance|demarre)\s+(?:le\s+)?mode\s+panique$", r"^mode\s+panique$"), ()),
    IntentRule(30, "mode démonstration", (r"^(?:active|lance|demarre)\s+(?:le\s+)?mode\s+(?:demo|demonstration)$", r"^mode\s+(?:demo|demonstration)$"), ()),
    IntentRule(31, "arrêt mode combiné", (), (r"^(?:arrete|coupe|stoppe)\s+(?:le\s+)?(?:mode\s+)?(?:show|demo|demonstration|panique|super\s+sos)$",)),

    # Codes temporaires de phares. Ils restent protégés par le mode commande.
    IntentRule(
        21,
        "appel de phares",
        (
            r"^(?:peux\s+tu|pourrais\s+tu|est\s+ce\s+que\s+tu\s+peux)(?:\s+me)?\s+(?:fais|faire|donner)\s+(?:un|des)?\s*(?:appels?|coups?)\s+de\s+phares?$",
            r"^(?:fais|fait|lance|joue|donne)(?:\s+moi)?\s+(?:un|des|les)?\s*appels?\s+de\s+phares?$",
            r"^appels?\s+de\s+phares?$",
            r"^(?:fais|fait|donne)(?:\s+moi)?\s+(?:un|des)?\s*coups?\s+de\s+phares?$",
            r"^coups?\s+de\s+phares?$",
            r"^(?:fais|fait)(?:\s+moi)?\s+clignoter\s+(?:les\s+)?phares?$",
        ),
        (),
    ),
    IntentRule(
        22,
        "double appel de phares",
        (
            r"^(?:peux\s+tu|pourrais\s+tu|est\s+ce\s+que\s+tu\s+peux)(?:\s+me)?\s+(?:fais|faire|donner)\s+(?:un\s+)?double\s+appel\s+de\s+phares?$",
            r"^(?:fais|fait|lance|joue|donne)(?:\s+moi)?\s+(?:un\s+)?double\s+appel\s+de\s+phares?$",
            r"^double\s+appel\s+de\s+phares?$",
            r"^(?:fais|fait|donne)(?:\s+moi)?\s+deux\s+coups?\s+de\s+phares?$",
            r"^deux\s+coups?\s+de\s+phares?$",
        ),
        (),
    ),
    IntentRule(23, "code phares merci", (r"^(?:fais|lance|joue)\s+(?:le\s+)?code\s+(?:de\s+)?phares\s+merci$", r"^phares\s+merci$"), ()),
    IntentRule(24, "code phares attention", (r"^(?:fais|lance|joue)\s+(?:le\s+)?code\s+(?:de\s+)?phares\s+attention$", r"^phares\s+attention$"), ()),
    IntentRule(25, "code phares SOS", (r"^(?:fais|lance|joue)\s+(?:le\s+)?code\s+(?:de\s+)?phares\s+sos$", r"^phares\s+sos$"), ()),
    IntentRule(26, "code phares KITT", (r"^(?:fais|lance|joue)\s+(?:le\s+)?code\s+(?:de\s+)?phares\s+kitt$", r"^phares\s+kitt$"), ()),
    IntentRule(27, "arrêt code phares", (), (r"^(?:arrete|coupe|stoppe)\s+(?:le\s+)?code\s+(?:de\s+)?phares$",)),

    # Relais 1 — phares / feux (pas de pulse)
    IntentRule(
        relay=1,
        description="phares",
        on_patterns=(
            r"\ballume\s+(les\s+)?phares?\b",
            r"\ballume\s+(les\s+)?feux?\b",
            r"\ballume\s+(les\s+)?lumieres?\b",
            r"\ballume\s+la\s+lumiere\b",
            r"\bmet\s+(les\s+)?phares?\b",
            r"\bmet\s+(les\s+)?feux?\b",
            r"\bmet\s+(les\s+)?lumieres?\b",
            r"\bmet\s+la\s+lumiere\b",
            r"\bmets\s+(les\s+)?phares?\b",
            r"\bmets\s+(les\s+)?feux?\b",
            r"\bmets\s+(les\s+)?lumieres?\b",
            r"\bmets\s+la\s+lumiere\b",
            r"\bactive\s+(les\s+)?phares?\b",
            r"\bactive\s+(les\s+)?feux?\b",
            r"\bactive\s+(les\s+)?lumieres?\b",
            r"\bactive\s+la\s+lumiere\b",
            r"\bphares?\s+on\b",
            r"\bfeux?\s+on\b",
            r"\bouvre\s+(les\s+)?phares?\b",
            r"\bouvre\s+(les\s+)?feux?\b",
        ),
        off_patterns=(
            r"\beteins\s+(les\s+)?phares?\b",
            r"\beteins\s+(les\s+)?feux?\b",
            r"\beteins\s+(les\s+)?lumieres?\b",
            r"\beteins\s+la\s+lumiere\b",
            r"\beteint\s+(les\s+)?phares?\b",
            r"\beteint\s+(les\s+)?feux?\b",
            r"\beteint\s+(les\s+)?lumieres?\b",
            r"\beteint\s+la\s+lumiere\b",
            r"\bferme\s+(les\s+)?phares?\b",
            r"\bferme\s+(les\s+)?feux?\b",
            r"\bcoupe\s+(les\s+)?phares?\b",
            r"\bcoupe\s+(les\s+)?feux?\b",
            r"\bcoupe\s+(les\s+)?lumieres?\b",
            r"\bcoupe\s+la\s+lumiere\b",
            r"\bdesactive\s+(les\s+)?phares?\b",
            r"\bdesactive\s+(les\s+)?feux?\b",
            r"\bdesactive\s+(les\s+)?lumieres?\b",
            r"\bdesactive\s+la\s+lumiere\b",
            r"\bphares?\s+off\b",
            r"\bfeux?\s+off\b",
        ),
    ),

    # Relais 2 — moteur (pulse 2.0s)
    IntentRule(
        relay=2,
        description="moteur",
        pulse_on_seconds=2.0,
        pulse_off_seconds=2.0,
        on_patterns=(
            r"\b(demarre|demarrer)\s+(la\s+)?voiture\b",
            r"\b(demarre|demarrer)\s+(le\s+)?vehicule\b",
            r"\b(demarre|demarrer)\s+(le\s+)?moteur\b",
            r"\b(lance|lancer)\s+(la\s+)?voiture\b",
            r"\b(lance|lancer)\s+(le\s+)?vehicule\b",
            r"\b(lance|lancer)\s+(le\s+)?moteur\b",
            r"\bstart\s+(le\s+)?moteur\b",
            r"\bstart\s+(la\s+)?voiture\b",
            r"\bstart\s+(le\s+)?vehicule\b",
            r"\bmets\s+(le\s+)?contact\b",
            r"\bmet\s+(le\s+)?contact\b",
            r"\ballume\s+(le\s+)?moteur\b",
        ),
        off_patterns=(
            r"\b(arrete|arreter)\s+(le\s+)?moteur\b",
            r"\b(arrete|arreter)\s+(la\s+)?voiture\b",
            r"\b(arrete|arreter)\s+(le\s+)?vehicule\b",
            r"\bstoppe\s+(le\s+)?moteur\b",
            r"\bstoppe\s+(la\s+)?voiture\b",
            r"\bcoupe\s+(le\s+)?moteur\b",
            r"\bcoupe\s+(la\s+)?voiture\b",
            r"\beteins\s+(le\s+)?moteur\b",
        ),
    ),

    # Relais 3 — vitre conducteur (pulse 4s ON / 5s OFF)
    IntentRule(
        relay=3,
        description="vitre conducteur",
        pulse_on_seconds=4.0,
        pulse_off_seconds=5.0,
        on_patterns=(
            r"\bouvre\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bouvre\s+(la\s+)?vitre\s+gauche\b",
            r"\bbaisse\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bbaisse\s+(la\s+)?vitre\s+gauche\b",
            r"\bdescends?\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bdescends?\s+(la\s+)?vitre\s+gauche\b",
            r"\bvitre\s+(du\s+)?conducteur\s+en\s+bas\b",
            r"\bvitre\s+gauche\s+en\s+bas\b",
            r"\bouvre\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bouvre\s+(la\s+)?fenetre\s+gauche\b",
            r"\bbaisse\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bbaisse\s+(la\s+)?fenetre\s+gauche\b",
            r"\bdescends?\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bdescends?\s+(la\s+)?fenetre\s+gauche\b",
            r"\bouvre\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bbaisse\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bdescends?\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bfenetre\s+en\s+bas\b",
        ),
        off_patterns=(
            r"\bferme\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bferme\s+(la\s+)?vitre\s+gauche\b",
            r"\bremonte\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bremonte\s+(la\s+)?vitre\s+gauche\b",
            r"\bmonte\s+(la\s+)?vitre\s+(du\s+)?conducteur\b",
            r"\bmonte\s+(la\s+)?vitre\s+gauche\b",
            r"\bvitre\s+(du\s+)?conducteur\s+en\s+haut\b",
            r"\bvitre\s+gauche\s+en\s+haut\b",
            r"\bferme\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bferme\s+(la\s+)?fenetre\s+gauche\b",
            r"\bremonte\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bremonte\s+(la\s+)?fenetre\s+gauche\b",
            r"\bmonte\s+(la\s+)?fenetre\s+(du\s+)?conducteur\b",
            r"\bmonte\s+(la\s+)?fenetre\s+gauche\b",
            r"\bferme\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bremonte\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bmonte\s+la\s+fenetre(?!\s+(du\s+)?(passager|conducteur|gauche|droite))\b",
            r"\bfenetre\s+en\s+haut\b",
        ),
    ),

    # Relais 4 — vitre passager (pulse 4s ON / 5s OFF)
    IntentRule(
        relay=4,
        description="vitre passager",
        pulse_on_seconds=4.0,
        pulse_off_seconds=5.0,
        on_patterns=(
            r"\bouvre\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bouvre\s+(la\s+)?vitre\s+droite\b",
            r"\bbaisse\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bbaisse\s+(la\s+)?vitre\s+droite\b",
            r"\bdescends?\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bdescends?\s+(la\s+)?vitre\s+droite\b",
            r"\bvitre\s+(du\s+)?passager\s+en\s+bas\b",
            r"\bvitre\s+droite\s+en\s+bas\b",
            r"\bouvre\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bouvre\s+(la\s+)?fenetre\s+droite\b",
            r"\bbaisse\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bbaisse\s+(la\s+)?fenetre\s+droite\b",
            r"\bdescends?\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bdescends?\s+(la\s+)?fenetre\s+droite\b",
            r"\bfenetre\s+(du\s+)?passager\s+en\s+bas\b",
            r"\bfenetre\s+droite\s+en\s+bas\b",
        ),
        off_patterns=(
            r"\bferme\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bferme\s+(la\s+)?vitre\s+droite\b",
            r"\bremonte\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bremonte\s+(la\s+)?vitre\s+droite\b",
            r"\bmonte\s+(la\s+)?vitre\s+(du\s+)?passager\b",
            r"\bmonte\s+(la\s+)?vitre\s+droite\b",
            r"\bvitre\s+(du\s+)?passager\s+en\s+haut\b",
            r"\bvitre\s+droite\s+en\s+haut\b",
            r"\bferme\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bferme\s+(la\s+)?fenetre\s+droite\b",
            r"\bremonte\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bremonte\s+(la\s+)?fenetre\s+droite\b",
            r"\bmonte\s+(la\s+)?fenetre\s+(du\s+)?passager\b",
            r"\bmonte\s+(la\s+)?fenetre\s+droite\b",
            r"\bfenetre\s+(du\s+)?passager\s+en\s+haut\b",
            r"\bfenetre\s+droite\s+en\s+haut\b",
        ),
    ),

    # Relais 5 — deux vitres (pulse 4s ON / 5s OFF)
    IntentRule(
        relay=5,
        description="deux vitres",
        pulse_on_seconds=4.0,
        pulse_off_seconds=5.0,
        on_patterns=(
            r"\bouvre\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\bbaisse\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\bdescends?\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\b(toutes\s+les\s+)?vitres\s+en\s+bas\b",
            r"\bouvre\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bbaisse\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bdescends?\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bouvre\s+les\s+fenetres\b",
            r"\bbaisse\s+les\s+fenetres\b",
            r"\bdescends?\s+les\s+fenetres\b",
            r"\b(toutes\s+les\s+)?fenetres\s+en\s+bas\b",
        ),
        off_patterns=(
            r"\bferme\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\bremonte\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\bmonte\s+(les\s+)?(deux|toutes\s+les)\s+vitres\b",
            r"\b(toutes\s+les\s+)?vitres\s+en\s+haut\b",
            r"\bferme\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bremonte\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bmonte\s+(les\s+)?(deux|toutes\s+les)\s+fenetres\b",
            r"\bferme\s+les\s+fenetres\b",
            r"\bremonte\s+les\s+fenetres\b",
            r"\bmonte\s+les\s+fenetres\b",
            r"\b(toutes\s+les\s+)?fenetres\s+en\s+haut\b",
        ),
    ),

    # Identifiant logique 6 — ouverture/déverrouillage du coffre uniquement.
    IntentRule(
        relay=6,
        description="coffre",
        pulse_on_seconds=1.0,
        pulse_off_seconds=1.0,
        on_patterns=(
            r"\bouvre\s+(le\s+)?coffre\b",
            r"\bouvre\s+(le\s+)?hayon\b",
            r"\bouvre\s+(le\s+)?coffre\s+arriere\b",
            r"\bdeverrouille\s+(le\s+)?coffre\b",
            r"\bouvre\s+(le\s+)?coffre\s+de\s+la\s+voiture\b",
        ),
        off_patterns=(),
    ),

    # Relais 7 — verrouillage (pas de pulse)
    IntentRule(
        relay=7,
        description="verrouillage",
        on_patterns=(
            r"\bverrouille\s+(les\s+)?portes\b",
            r"\bverrouille\s+(la\s+)?voiture\b",
            r"\bverrouille\s+(le\s+)?vehicule\b",
            r"\bferme\s+(les\s+)?portes\b",
            r"\bferme\s+(la\s+)?voiture\b",
            r"\bferme\s+(le\s+)?vehicule\b",
            r"\block\s+(la\s+)?voiture\b",
            r"\block\s+(les\s+)?portes\b",
            r"\block\s+(le\s+)?vehicule\b",
        ),
        off_patterns=(),
    ),

    # Relais 8 — déverrouillage (pas de pulse)
    IntentRule(
        relay=8,
        description="déverrouillage",
        on_patterns=(
            r"\b(deverrouille|deverrouiller)\s+(les\s+)?portes\b",
            r"\b(deverrouille|deverrouiller)\s+(la\s+)?voiture\b",
            r"\b(deverrouille|deverrouiller)\s+(le\s+)?vehicule\b",
            r"\b(ouvre|ouvrir)\s+(les\s+)?portes\b",
            r"\b(ouvre|ouvrir)\s+(la\s+)?voiture\b",
            r"\b(ouvre|ouvrir)\s+(le\s+)?vehicule\b",
            r"\bunlock\s+(la\s+)?voiture\b",
            r"\bunlock\s+(les\s+)?portes\b",
            r"\bunlock\s+(le\s+)?vehicule\b",
        ),
        off_patterns=(),
    ),

    # Identifiant logique 9 — scanner lumineux, autorisé hors mode commande.
    IntentRule(
        relay=9,
        description="scanner",
        on_patterns=(
            r"\b(?:allume|active|lance|mets?)\s+(?:le\s+)?scanner\b",
            r"\bscanner\s+on\b",
            r"^scanner\s+(?:active|activee|allume)$",
        ),
        off_patterns=(
            r"\b(?:eteins|eteint|desactive|coupe|arrete|ferme)\s+(?:le\s+)?scanner\b",
            r"\bscanner\s+off\b",
            r"^scanner\s+(?:eteint|desactive)$",
        ),
    ),

    # Identifiant logique 10 — klaxon, impulsion bornée par le service.
    # Les mélodies sont placées avant le klaxon générique afin que leur nom
    # complet reste prioritaire.
    IntentRule(12, "klaxon normal", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+normal$",), ()),
    IntentRule(13, "double klaxon", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?double\s+klaxon$", r"^klaxon\s+double$"), ()),
    IntentRule(14, "klaxon amical", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+amical$",), ()),
    IntentRule(15, "klaxon mariage", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+(?:de\s+)?mariage$",), ()),
    IntentRule(16, "klaxon mission", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+mission$",), ()),
    IntentRule(17, "klaxon alerte", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+(?:d\s+)?alerte$",), ()),
    IntentRule(18, "klaxon SOS", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+sos$", r"^sos\s+klaxon$"), ()),
    IntentRule(19, "klaxon KITT", (r"^(?:joue\s+|fais\s+)?(?:le\s+)?klaxon\s+kitt$", r"^signature\s+klaxon\s+kitt$"), ()),
    IntentRule(20, "arrêt klaxon", (), (r"^(?:arrete|coupe|stoppe|eteins)\s+(?:le\s+)?klaxon$",)),

    IntentRule(
        relay=10,
        description="klaxon",
        on_patterns=(
            r"^(?:le\s+)?(?:klaxon|claxon|clacson|clackson|clakson|clason|klakson|klason|cracson|craxon|clexson|clexon|eclaction|eclaxon|killa|soon|graxum|graxon|klaxom|claxom)$",
            r"\b(?:active|allume|mets?)\s+(?:(?:le|les)\s+)?(?:mode\s+)?(?:klaxons?|claxons?|clacsons?|clacksons?|claksons?|clasons?|clexons?|eclactions?|eclaxons?|graxums?|graxons?|klaxoms?|claxoms?)\b",
            r"\b(?:klaxonne|klaxonnes|klaxone|klaxoner|klaxonner|clacsonne|clacsonner|claxonne|claxonner|klaksonne|klasonne|cracsonne|clexsonne)\b",
            r"\b(?:fais\s+(?:sonner|retentir|fonctionner)|actionne|utilise)\s+(?:le\s+)?(?:klaxon|claxon|clacson|clackson|clakson|clason|clexon|eclaction|eclaxon|graxum|graxon|klaxom|claxom|jackson)\b",
            r"\b(?:donne|fais)\s+(?:un\s+)?coup\s+de\s+(?:klaxon|claxon|clacson)\b",
            r"\bappuie\s+sur\s+(?:le\s+)?(?:klaxon|claxon|clacson)\b",
            r"^(?:fais\s+)?(?:bip\s+bip|tut\s+tut)$",
        ),
        off_patterns=(),
        pulse_on_seconds=0.3,
    ),

    # Identifiant logique 11 — laser/accessoire. Toujours protégé par le mode
    # commande, contrairement au scanner et au klaxon.
    IntentRule(
        relay=11,
        description="laser",
        on_patterns=(
            r"\b(?:allume|active|lance|mets?|enclenche)\s+(?:le\s+)?laser\b",
            r"^laser\s+(?:on|active|allume)$",
        ),
        off_patterns=(
            r"\b(?:eteins|eteint|desactive|coupe|arrete|ferme)\s+(?:le\s+)?laser\b",
            r"^laser\s+(?:off|eteint|desactive|coupe)$",
        ),
    ),
]

# Mots déclencheurs d'action ON / OFF (impératif + infinitif)
_ON_WORDS = {
    "allume", "allumer", "active", "activer", "marche", "on", "ouvre", "ouvrir",
    "ouverture", "lance", "lancer", "demarre", "demarrer", "baisse", "baisser",
    "descend", "descendre", "verrouille", "verrouiller",
}
_OFF_WORDS = {
    "eteins", "eteindre", "eteint", "desactive", "desactiver", "arrete", "arreter",
    "off", "ferme", "fermer", "coupe", "couper", "stoppe", "stopper",
    "remonte", "remonter", "monte", "monter", "deverrouille", "deverrouiller",
}

# Mots d'ordre direct (impératif fort)
_DIRECT_ORDER_WORDS = {
    "ouvre", "ferme", "allume", "eteins", "eteint", "active", "desactive",
    "lance", "demarre", "arrete", "coupe", "stoppe", "baisse", "remonte",
    "monte", "descend", "verrouille", "deverrouille", "met", "mets",
}

# Mots de demande polie (demande confirmation)
_POLITE_WORDS = {
    "peux", "pourrais", "veux", "voudrais", "peux-tu", "pourrais-tu",
    "veux-tu", "voudrais-tu", "s il te plait", "stp", "svp", "please",
}

# Mots qui indiquent une narration / passé / futur -> ignorer
_NARRATIVE_MARKERS = {
    "hier", "demain", "plus tard", "tout a l heure", "ce matin", "ce soir",
    "la semaine derniere", "la semaine prochaine", "la veille", "le lendemain",
    "je vais", "j ai", "j avais", "je voudrais", "je voudrais bien",
    "j aimerais", "je souhaite", "je pense", "je raconte", "il etait", "elle etait",
}


# ------------------------------------------------------------------------------
# Helpers texte
# ------------------------------------------------------------------------------
def _normalize(text: str) -> str:
    """Normalise le texte pour l'analyse d'intention."""
    value = text.lower()
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _detect_state(words: set[str]) -> bool | None:
    """Détermine si la phrase demande ON ou OFF."""
    on = bool(words & _ON_WORDS)
    off = bool(words & _OFF_WORDS)
    if on and off:
        return None  # ambigu
    if on:
        return True
    if off:
        return False
    return None


def _is_direct_order(norm: str, words: set[str]) -> bool:
    """Vrai si la phrase est un ordre direct impératif."""
    first_word = norm.split()[0] if norm else ""
    if first_word in _DIRECT_ORDER_WORDS:
        return True
    # Présence d'un verbe d'ordre au début d'une proposition courte.
    if re.search(r"^(ouvre|ferme|allume|eteins|eteint|active|desactive|lance|"
                 r"demarre|arrete|coupe|stoppe|baisse|remonte|monte|descend|"
                 r"verrouille|deverrouille|met|mets)\b", norm):
        return True
    return False


def _is_safe_direct_request(norm: str, command: RelayCommand) -> bool:
    """Formulations vocales explicites admises pour les fonctions hors mode."""
    if command.relay not in _SAFE_NORMAL_RELAYS:
        return False
    if command.description == "phares" and re.search(r"\b(?:allume|active|eteins|eteint|desactive|mets?|met|ouvre|ferme|coupe)\b", norm):
        norm = re.sub(r"\b(?:far|fars|fard|fards)\b", "phare", norm)
    if command.description == "klaxon":
        norm = _canonicalize_horn_phrase(norm)
        return bool(
            re.fullmatch(r"(?:le\s+)?klaxon", norm)
            or re.match(
                r"^(?:(?:vas\s+y|allez|maintenant)\s+)?(?:fais\s+)?klaxon\b",
                norm,
            )
            or re.match(r"^(?:donne|fais)\s+(?:un\s+)?coup\s+de\s+klaxon\b", norm)
            or re.match(r"^(?:fais\s+(?:sonner|retentir|fonctionner)|actionne|utilise|appuie\s+sur|active|allume)\s+(?:(?:le|les)\s+)?(?:mode\s+)?klaxon\b", norm)
            or re.fullmatch(r"(?:fais\s+)?(?:bip\s+bip|tut\s+tut)", norm)
        )
    if command.relay in {12, 13, 14, 15, 16, 17, 18, 19, 20}:
        return True
    if command.description == "scanner" and re.fullmatch(r"scanner\s+(?:active|activee|allume|eteint|desactive)", norm):
        return True
    return bool(re.search(
        r"^(?:(?:on|tu)\s+)?(?:ouvre|ouvrir|ouvrez|ferme|fermer|fermez|baisse|baisser|"
        r"descend|descendre|remonte|remonter|monte|monter|active|activer|desactive|desactiver)\b|"
        r"\b(?:vitre|vitres|fenetre|fenetres)\s+(?:ouvre|ouvrir|ferme|fermer|baisse|descend|remonte|monte)\b",
        norm,
    ))


def _is_polite_request(norm: str, words: set[str]) -> bool:
    """Vrai si la phrase est une demande polie nécessitant confirmation."""
    if words & _POLITE_WORDS:
        return True
    if re.search(r"\b(peux|pourrais|veux|voudrais)\s*tu\b", norm):
        return True
    if re.search(r"\bs\s*il\s*te\s*plait\b", norm):
        return True
    return False


def _is_narrative(norm: str, words: set[str]) -> bool:
    """Vrai si la phrase raconte une histoire, parle du passé ou du futur."""
    if any(marker in norm for marker in _NARRATIVE_MARKERS):
        return True
    # "Je voudrais...", "Je vais...", "J'ai...", etc.
    if re.search(r"\bje\s+(voudrais|vais|aimerais|souhaite|pense|suis\s+en\s+train|viens\s+de)\b", norm):
        return True
    # Passé composé / imparfait avec sujet.
    if re.search(r"\b(j\s+|tu\s+|il\s+|elle\s+|on\s+|nous\s+|vous\s+|ils\s+|elles\s+)\w+(e|ai|as|ons|ez|ent|ais|ait|ions|iez|aient)\b", norm):
        return True
    # Temps futur proche ou futur simple explicite.
    if re.search(r"\b(demain|apres\s+demain|plus\s+tard|dans\s+\w+\s+(minute|minutes|heure|heures|jour|jours))\b", norm):
        return True
    return False


# ------------------------------------------------------------------------------
# Classe principale
# ------------------------------------------------------------------------------
class VehicleCommandMode:
    """Gère le mode commande véhicule et l'exécution sécurisée des relais."""

    def __init__(self, timeout_seconds: int = MODE_TIMEOUT_SECONDS) -> None:
        self.timeout_seconds = timeout_seconds
        self._sessions: dict[str, VehicleSessionState] = {}

    # ------------------------------------------------------------------
    # État du mode
    # ------------------------------------------------------------------
    def _get_state(self, session_id: str) -> VehicleSessionState:
        state = self._sessions.get(session_id)
        if state is None:
            state = VehicleSessionState()
            self._sessions[session_id] = state
        return state

    def _refresh_activity(self, session_id: str) -> VehicleSessionState:
        state = self._get_state(session_id)
        state.last_activity = time.monotonic()
        return state

    def _check_timeout(self, session_id: str) -> None:
        state = self._get_state(session_id)
        if (
            state.pending_activation
            and (time.monotonic() - state.pending_activation["timestamp"])
            > PENDING_ACTIVATION_TIMEOUT_SECONDS
        ):
            state.pending_activation = None
        if (
            state.active
            and not state.manually_locked
            and (time.monotonic() - state.last_activity) > self.timeout_seconds
        ):
            _logger.info("Mode véhicule désactivé par timeout (session %s)", session_id)
            state.active = False
            state.pending_confirmation = None

    def activate(self, session_id: str, *, manual_lock: bool = False) -> VehicleSessionState:
        """Active l'unique état véhicule, temporairement ou sans timeout."""
        state = self._refresh_activity(session_id)
        state.active = True
        # Une activation vocale ne doit jamais déverrouiller un mode manuel.
        state.manually_locked = state.manually_locked or bool(manual_lock)
        state.pending_confirmation = None
        state.pending_activation = None
        return state

    def deactivate(self, session_id: str) -> VehicleSessionState:
        """Retourne au mode normal, quelle que soit l'origine de l'activation."""
        state = self._get_state(session_id)
        state.active = False
        state.manually_locked = False
        state.pending_confirmation = None
        state.pending_activation = None
        return state

    def set_manual_lock(self, session_id: str, locked: bool) -> VehicleSessionState:
        return self.activate(session_id, manual_lock=True) if locked else self.deactivate(session_id)

    def get_status(self, session_id: str) -> dict:
        self._check_timeout(session_id)
        state = self._get_state(session_id)
        remaining = None
        if state.active and not state.manually_locked:
            remaining = max(
                0, int(self.timeout_seconds - (time.monotonic() - state.last_activity))
            )
        return {
            "active": state.active,
            "manually_locked": state.manually_locked,
            "mode": "locked" if state.manually_locked else ("timed" if state.active else "normal"),
            "timeout_seconds": self.timeout_seconds,
            "remaining_seconds": remaining,
        }

    def is_active(self, session_id: str) -> bool:
        self._check_timeout(session_id)
        return self._get_state(session_id).active

    # ------------------------------------------------------------------
    # Détection des commandes de mode
    # ------------------------------------------------------------------
    def _detect_mode_command(self, norm: str) -> str | None:
        """Détecte l'activation/désactivation du mode véhicule."""
        activate_phrases = {
            "mode commande vehicule", "active le mode commande vehicule",
            "passe en mode commande vehicule", "mode vehicule", "active le mode vehicule",
            "passe en mode vehicule", "commande vehicule",
            "mode commande", "active le mode commande", "passe en mode commande",
        }
        deactivate_phrases = {
            "desactive le mode commande vehicule", "quitte le mode commande vehicule",
            "mode normal", "passe en mode normal", "desactive le mode vehicule",
            "quitte le mode vehicule", "fin du mode vehicule",
        }
        # Tester la sortie en premier : « désactive le mode commande véhicule »
        # contient aussi la sous-chaîne « mode commande véhicule ».
        if any(p in norm for p in deactivate_phrases):
            return "deactivate"
        if any(p in norm for p in activate_phrases):
            return "activate"
        return None

    # ------------------------------------------------------------------
    # Détection des intentions relais
    # ------------------------------------------------------------------
    def _detect_relay_intent(self, norm: str, words: set[str]) -> RelayCommand | None:
        """Identifie la commande relais demandée par l'utilisateur."""
        # Les demandes polies emploient souvent l'infinitif (« peux-tu ouvrir
        # la vitre ? ») alors que les règles historiques sont à l'impératif.
        # Cette normalisation reste locale au détecteur de commande.
        intent_norm = norm
        # Whisper avale parfois le début de « phare » et produit « far » ou
        # « fard ». Cette correction reste limitée aux phrases contenant déjà
        # un verbe d’éclairage : elle ne modifie pas le vocabulaire général.
        if re.search(r"\b(?:allume|allumer|active|activer|eteins|eteindre|eteint|desactive|desactiver|mets?|met|ouvre|ferme|coupe)\b", intent_norm):
            intent_norm = re.sub(r"\b(?:far|fars|fard|fards)\b", "phare", intent_norm)
        intent_norm = _canonicalize_horn_phrase(intent_norm)
        for infinitive, imperative in (
            ("ouvrir", "ouvre"), ("fermer", "ferme"),
            ("baisser", "baisse"), ("descendre", "descend"),
            ("remonter", "remonte"), ("monter", "monte"),
            ("allumer", "allume"), ("eteindre", "eteins"),
            ("activer", "active"), ("desactiver", "desactive"),
            ("faire", "fais"),
            ("klaxonner", "klaxonne"), ("klaxoner", "klaxonne"),
            ("clacsonner", "klaxonne"), ("claxonner", "klaxonne"),
        ):
            intent_norm = re.sub(rf"\b{infinitive}\b", imperative, intent_norm)
        for conjugated, imperative in (
            ("ouvrez", "ouvre"), ("fermez", "ferme"),
            ("ouvres", "ouvre"), ("fermes", "ferme"),
            ("baissez", "baisse"), ("descendez", "descend"),
            ("remontez", "remonte"), ("montez", "monte"),
            ("allumez", "allume"), ("eteignez", "eteins"),
            ("activez", "active"), ("desactivez", "desactive"),
            ("clacsonne", "klaxonne"), ("claxonne", "klaxonne"),
            ("klaxonnes", "klaxonne"), ("klaksonne", "klaxonne"), ("klasonne", "klaxonne"),
        ):
            intent_norm = re.sub(rf"\b{conjugated}\b", imperative, intent_norm)

        # Les noms de signatures sont suffisamment spécifiques pour être
        # reconnus même lorsque Whisper ajoute « joue », « zou », « zoo »,
        # « de » ou une petite particule autour du mot klaxon.
        if "klaxon" in intent_norm.split():
            horn_signatures = (
                ("sos", 18, None),
                ("mariage", 15, None),
                ("amical", 14, None),
                ("alerte", 17, None),
                ("mission", 16, None),
                ("double", 13, None),
                ("normal", 12, None),
                ("kitt", 19, None),
            )
            for signature, relay, _ in horn_signatures:
                if re.search(rf"\b{signature}\b", intent_norm):
                    return RelayCommand(relay, True, f"klaxon {signature}", None)
        for rule in _INTENT_RULES:
            for pattern in rule.on_patterns:
                if re.search(pattern, intent_norm):
                    return RelayCommand(rule.relay, True, rule.description, rule.pulse_on_seconds)
            for pattern in rule.off_patterns:
                if re.search(pattern, intent_norm):
                    return RelayCommand(rule.relay, False, rule.description, rule.pulse_off_seconds)

        # Formes STT elliptiques observées : « ouvrir fenêtre », « vitre
        # ouvrir ». Elles ne s'appliquent qu'aux vitres, jamais aux portes.
        if re.search(r"\b(?:vitre|vitres|fenetre|fenetres)\b", intent_norm):
            down = bool(re.search(r"\b(?:ouvre|baisse|descend)\b", intent_norm))
            up = bool(re.search(r"\b(?:ferme|remonte|monte)\b", intent_norm))
            if down != up:
                state = down
                both = bool(re.search(r"\b(?:deux|toutes|vitres|fenetres)\b", intent_norm))
                passenger = bool(re.search(r"\b(?:passager|droite)\b", intent_norm))
                relay = 5 if both else 4 if passenger else 3
                description = "deux vitres" if relay == 5 else "vitre passager" if relay == 4 else "vitre conducteur"
                return RelayCommand(relay, state, description, 4.0 if state else 5.0)
        return None

    # ------------------------------------------------------------------
    # Exécution matérielle
    # ------------------------------------------------------------------
    def _map_command_to_service(self, command: RelayCommand):
        """Appelle le service de relais centralisé selon la commande détectée."""
        if get_service is None:
            raise RuntimeError("Le service de relais n'est pas disponible.")
        service = get_service()

        if command.relay == 1:
            return service.set_headlights(command.state)
        if command.relay == 2:
            return service.start_engine() if command.state else service.stop_engine()
        if command.relay == 3:
            return service.operate_window(
                "driver",
                "down" if command.state else "up",
                command.pulse_seconds,
            )
        if command.relay == 4:
            return service.operate_window(
                "passenger",
                "down" if command.state else "up",
                command.pulse_seconds,
            )
        if command.relay == 5:
            return service.operate_window(
                "both",
                "down" if command.state else "up",
                command.pulse_seconds,
            )
        if command.relay == 6:
            return service.open_trunk()
        if command.relay == 7:
            return service.lock_doors()
        if command.relay == 8:
            return service.unlock_doors()
        if command.relay == 9:
            return service.set_scanner(command.state)
        if command.relay == 10:
            return service.honk(command.pulse_seconds)
        if command.relay == 11:
            return service.set_laser(command.state)
        horn_patterns = {
            12: "normal", 13: "double", 14: "amical", 15: "mariage",
            16: "mission", 17: "alerte", 18: "sos", 19: "kitt",
        }
        if command.relay in horn_patterns:
            return service.play_horn_pattern(horn_patterns[command.relay])
        if command.relay == 20:
            return service.stop_horn()
        light_patterns = {
            21: "appel", 22: "double", 23: "merci", 24: "attention",
            25: "sos", 26: "kitt",
        }
        if command.relay in light_patterns:
            return service.play_light_pattern(light_patterns[command.relay])
        if command.relay == 27:
            return service.stop_light_pattern()
        combined_modes = {28: "sos", 29: "panique", 30: "demo"}
        if command.relay in combined_modes:
            return service.play_combined_mode(combined_modes[command.relay])
        if command.relay == 31:
            return service.stop_combined_mode()
        raise ValueError(f"Relais non géré : {command.relay}")

    def _reply_from_record(self, command: RelayCommand, record) -> str:
        """Confirmation courte, prononcée uniquement après exécution réelle.

        "completed" confirme uniquement l'écriture de la séquence sur le port
        série. Sans capteur de position, cela ne confirme jamais le mouvement
        physique de la vitre, du coffre ou d'un autre équipement.
        """
        if record.status != "completed":
            return "Impossible d'exécuter la commande."
        phrases = _SUCCESS_REPLIES.get(record.function)
        if phrases is None:
            return "Commande exécutée."
        reply = phrases[0] if command.state else phrases[1]
        # Les fonctions impulsionnelles sont déjà terminées lorsque le retour
        # vocal est produit : le préciser évite l'ambiguïté « envoyée ».
        if command.pulse_seconds is not None or record.function in {
            "horn", "horn_normal", "horn_double", "horn_amical", "horn_mariage",
            "horn_mission", "horn_alerte", "horn_sos", "horn_kitt", "trunk",
            "doors_lock", "doors_unlock", "engine_start",
        }:
            reply = reply.replace(" envoyée.", " terminée.").replace(" envoyé.", " terminé.")
            if "impulsion" not in reply.lower() and record.function not in {"doors_lock", "doors_unlock"}:
                reply = "Impulsion terminée : " + reply[:1].lower() + reply[1:]
        else:
            reply = "Oui, tout de suite : " + reply[:1].lower() + reply[1:]
        return reply

    def _execute_relay(self, command: RelayCommand, session_id: str, source: str) -> dict:
        """Exécute la commande relais via le service centralisé et journalise."""
        if not _RELAY_AVAILABLE:
            _logger.warning("Tentative d'exécution sans service relais (session %s)", session_id)
            return {
                "handled": True,
                "action": "error",
                "reply": "Le contrôleur de relais n'est pas disponible.",
            }

        try:
            record = self._map_command_to_service(command)
            _logger.info(
                "SERVICE session=%s source=%s function=%s relay=%s state=%s status=%s",
                session_id, source, record.function, record.relay, record.state, record.status,
            )
            return {
                "handled": True,
                "action": record.function,
                "relay": record.relay,
                "state": record.state,
                "reply": self._reply_from_record(command, record),
            }
        except Exception as exc:
            _logger.error("ERREUR session=%s relay=%s state=%s : %s", session_id, command.relay, command.state, exc)
            return {
                "handled": True,
                "action": "error",
                "reply": "Impossible d'exécuter la commande.",
            }

    # ------------------------------------------------------------------
    # Point d'entrée principal
    # ------------------------------------------------------------------
    def process_message(self, user_msg: str, session_id: str = "default") -> dict:
        """Analyse un message utilisateur et décide de l'action à entreprendre.

        Retourne un dict avec au minimum :
            - handled : bool
            - action  : str
            - reply   : str
        """
        state = self._get_state(session_id)
        self._check_timeout(session_id)

        norm = _normalize(user_msg)
        if not norm:
            return {"handled": False, "action": "ignore", "reply": ""}

        words = set(norm.split())

        # Une phrase interrogative explicative reste une conversation, même si
        # elle contient un verbe de commande comme « activer » ou « fermer ».
        if re.match(r"^(?:pourquoi|comment|quand|ou|quel|quelle|quels|quelles|est\s+ce\s+que)\b", norm):
            # « Est-ce que tu peux me faire un appel de phares ? » est une
            # demande d'action, pas une question explicative. Seules les règles
            # spectacle entièrement ancrées peuvent franchir cette exception.
            possible_order = self._detect_relay_intent(norm, words)
            explicit_est_ce_order = (
                norm.startswith("est ce que tu peux ")
                and possible_order is not None
                and 21 <= possible_order.relay <= 31
            )
            if not explicit_est_ce_order:
                return {"handled": False, "action": "ignore", "reply": ""}

        # Arrêt global explicite : autorisé hors mode comme commande de repli.
        # Une simple discussion (« pourquoi couper les relais ? ») ne correspond
        # pas à cette expression ancrée au début de la phrase.
        if re.search(
            r"^(?:coupe|eteins|eteint|desactive|arrete|stoppe|ferme)\s+(?:immediatement\s+)?(?:tous\s+)?les\s+relais\b",
            norm,
        ):
            if get_service is None:
                return {"handled": True, "action": "error", "reply": "Le contrôleur de relais n'est pas disponible."}
            try:
                get_service().stop_all_vehicle_relays()
                return {
                    "handled": True,
                    "action": "relays_all_off",
                    "reply": "Commande d'arrêt de tous les relais envoyée.",
                }
            except Exception as exc:
                _logger.error("ARRÊT GLOBAL impossible session=%s : %s", session_id, exc)
                return {"handled": True, "action": "error", "reply": "Impossible de couper les relais."}

        # Réponse courte à la question de sécurité, interceptée avant la
        # détection du mot « activer » et avant tout envoi au LLM.
        if (
            "pourquoi" in words
            and "mode" in words
            and "commande" in words
            and ("activer" in words or "active" in words)
        ):
            return {
                "handled": True,
                "action": "mode_security_explanation",
                "reply": "C'est une mesure de sécurité décidée par Malik afin d'éviter qu'une commande du véhicule soit déclenchée accidentellement.",
            }

        # Une commande véhicule demandée en mode normal attend une autorisation
        # explicite. Elle ne doit jamais atteindre le LLM.
        if state.pending_activation:
            affirmative = (
                bool(words & {"oui", "ouais", "ok"})
                or "d accord" in norm
                or "vas y" in norm
                or "active le" in norm
                or "active mode" in norm
            )
            negative = (
                bool(words & {"non", "annule", "annuler"})
                or "non merci" in norm
                or "laisse tomber" in norm
            )
            if affirmative:
                pending = state.pending_activation
                pending_message = pending["message"]
                pending_command = pending.get("command")
                state.pending_activation = None
                self.activate(session_id, manual_lock=False)
                # Le « oui » autorise à la fois le mode et l'ordre précisément
                # annoncé. Ne pas demander une seconde confirmation pour une
                # formulation polie telle que « peux-tu faire un appel ? ».
                if pending_command is not None:
                    return self._execute_relay(pending_command, session_id, "mode_activation_confirmed")
                return self.process_message(pending_message, session_id)
            if negative:
                state.pending_activation = None
                return {
                    "handled": True,
                    "action": "mode_activation_cancelled",
                    "reply": "D'accord.",
                }

        # 1. Gestion du mode lui-même.
        mode_cmd = self._detect_mode_command(norm)
        if mode_cmd == "activate":
            state = self.activate(session_id, manual_lock=False)
            _logger.info("Mode commande véhicule ACTIVÉ (session %s)", session_id)
            return {
                "handled": True,
                "action": "mode_activated",
                "reply": "Mode commande véhicule activé. Quel ordre ?",
            }
        if mode_cmd == "deactivate":
            state = self.deactivate(session_id)
            _logger.info("Mode commande véhicule DÉSACTIVÉ (session %s)", session_id)
            return {
                "handled": True,
                "action": "mode_deactivated",
                "reply": "Mode commande véhicule désactivé. Conversation normale.",
            }

        # 2. Gestion des confirmations en attente.
        if state.pending_confirmation:
            if any(w in words for w in {"oui", "confirme", "ok", "valide", "execute"}):
                cmd = state.pending_confirmation["command"]
                state.pending_confirmation = None
                self._refresh_activity(session_id)
                return self._execute_relay(cmd, session_id, "confirmation")
            if any(w in words for w in {"non", "annule", "annuler", "abandonne"}):
                state.pending_confirmation = None
                return {
                    "handled": True,
                    "action": "confirmation_cancelled",
                    "reply": "Commande annulée.",
                }
            # Autre message : on annule la confirmation en attente.
            state.pending_confirmation = None

        # Un relais brut numéroté peut piloter un circuit dangereux. Il ne doit
        # jamais tomber dans la conversation ni être actionné hors mode.
        raw_relay_order = re.match(
            r"^(?:allume|active|ouvre|lance|eteins|eteint|desactive|arrete|stoppe|ferme|coupe)\s+(?:le\s+)?relais\s*\d+\b",
            norm,
        )
        if raw_relay_order and not state.active:
            state.pending_activation = {
                "message": user_msg,
                "command": None,
                "timestamp": time.monotonic(),
            }
            return {
                "handled": True,
                "action": "ask_mode_activation",
                "reply": "Cette commande brute nécessite le mode commande. Veux-tu l'activer ?",
            }

        # 3. Hors mode commande, intercepter toute intention véhicule claire.
        if not state.active:
            command = self._detect_relay_intent(norm, words)
            safe_direct = command is not None and _is_safe_direct_request(norm, command)
            safe_polite = command is not None and command.relay in _SAFE_NORMAL_RELAYS and _is_polite_request(norm, words)
            # Les règles 21 à 31 sont intégralement ancrées (^...$) : si elles
            # correspondent, la phrase entière est une commande explicite. Cela
            # évite que « peux-tu me faire... » soit pris à tort pour un récit
            # par l'ancien détecteur grammatical très conservateur.
            explicit_show_order = command is not None and 21 <= command.relay <= 31
            if command is not None and (not _is_narrative(norm, words) or safe_direct or safe_polite or explicit_show_order):
                if command.relay in _SAFE_NORMAL_RELAYS:
                    # Pas de mode commande pour vitres, scanner ou klaxon. Une
                    # demande formulée poliment garde toutefois une confirmation
                    # explicite, afin de ne pas transformer une conversation en
                    # ordre physique accidentel.
                    if _is_polite_request(norm, words):
                        confirmation_id = str(uuid.uuid4())[:8]
                        state.pending_confirmation = {
                            "id": confirmation_id,
                            "command": command,
                            "timestamp": time.monotonic(),
                        }
                        action_text = "activer" if command.state else "désactiver"
                        return {
                            "handled": True,
                            "action": "ask_confirmation",
                            "confirmation_id": confirmation_id,
                            "reply": f"Tu veux {action_text} {command.description} ? Confirme par 'oui' ou annule par 'non'.",
                        }
                    if not _is_direct_order(norm, words) and not safe_direct:
                        return {"handled": False, "action": "ignore", "reply": ""}
                    return self._execute_relay(command, session_id, "safe_normal_order")
                state.pending_activation = {
                    "message": user_msg,
                    "command": command,
                    "timestamp": time.monotonic(),
                }
                return {
                    "handled": True,
                    "action": "ask_mode_activation",
                    "reply": "Le mode commande n'est pas activé. Voulez-vous l'activer ?",
                }
            return {"handled": False, "action": "ignore", "reply": ""}

        # 4. En mode commande, détecter l'intention.
        command = self._detect_relay_intent(norm, words)
        if command is None:
            # Pas une commande relais reconnue : ignorer pour laisser le LLM répondre.
            return {"handled": False, "action": "ignore", "reply": ""}

        # 5. Classifier le niveau de certitude / politesse.
        if _is_narrative(norm, words) and not (21 <= command.relay <= 31):
            _logger.info("IGNORE narration (session %s): %r", session_id, user_msg)
            return {"handled": False, "action": "ignore", "reply": ""}

        # Une commande véhicule réellement valide renouvelle le mode temporisé.
        # Le verrou manuel reste permanent et utilise le même état.
        self._refresh_activity(session_id)

        if _is_polite_request(norm, words):
            confirmation_id = str(uuid.uuid4())[:8]
            state.pending_confirmation = {
                "id": confirmation_id,
                "command": command,
                "timestamp": time.monotonic(),
            }
            _logger.info("DEMANDE CONFIRMATION session=%s relay=%s state=%s", session_id, command.relay, command.state)
            action_text = "activer" if command.state else "désactiver"
            return {
                "handled": True,
                "action": "ask_confirmation",
                "confirmation_id": confirmation_id,
                "reply": f"Tu veux {action_text} {command.description} ? Confirme par 'oui' ou annule par 'non'.",
            }

        # Ordre direct : la phrase n'est ni une narration, ni une demande polie,
        # et elle correspond à un pattern de commande explicite.
        return self._execute_relay(command, session_id, "direct_order")


# ------------------------------------------------------------------------------
# Instance globale pour Kyronex
# ------------------------------------------------------------------------------
vehicle_mode = VehicleCommandMode()


def process_vehicle_message(user_msg: str, session_id: str = "default") -> dict:
    """Fonction utilitaire pour Kyronex."""
    return vehicle_mode.process_message(user_msg, session_id)


# ------------------------------------------------------------------------------
# Test rapide de l'analyse d'intention (ne commande AUCUN relais)
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    _TEST_CASES: list[tuple[str, str, int | None, bool | None, float | None]] = [
        # narration / futur -> ignore
        ("Hier j'ai ouvert la porte.", "ignore", None, None, None),
        ("Je voudrais ouvrir les portes demain.", "ignore", None, None, None),
        ("Plus tard je baisserai les vitres.", "ignore", None, None, None),
        # politesse -> confirmation
        ("Peux-tu ouvrir les portes ?", "polite", 8, True, None),
        ("Pourrais-tu démarrer la voiture s'il te plaît ?", "polite", 2, True, 2.0),
        # ordres directs — phares
        ("Ouvre les portes.", "direct", 8, True, None),
        ("Allume les phares", "direct", 1, True, None),
        ("Mets les feux", "direct", 1, True, None),
        ("Active les lumières", "direct", 1, True, None),
        ("Coupe les feux", "direct", 1, False, None),
        ("Phares off", "direct", 1, False, None),
        # variantes phonétiques du klaxon observées avec Whisper
        ("Claxon et sois", "direct", 18, True, None),
        ("Jou, le Klaxon, SOS", "direct", 18, True, None),
        ("Joues le Klaxon mariage", "direct", 15, True, None),
        ("Zou le klaxon amicale", "direct", 14, True, None),
        ("Glaxon Alert", "direct", 17, True, None),
        ("Claxon Mission", "direct", 16, True, None),
        ("Zoo le Klaxon, nochmal", "direct", 12, True, None),
        ("Zoo, le klaxon de Kitt", "direct", 19, True, None),
        ("D l axonne a l echec", "direct", 17, True, None),
        ("Double claccon", "direct", 13, True, None),
        ("Classion alerte", "direct", 17, True, None),
        ("Klaxon a Mickael", "direct", 19, True, None),
        # ordres directs — moteur (pulse 2.0s)
        ("Démarre la voiture", "direct", 2, True, 2.0),
        ("Lance le moteur", "direct", 2, True, 2.0),
        ("Start le véhicule", "direct", 2, True, 2.0),
        ("Arrête le moteur", "direct", 2, False, 2.0),
        ("Coupe la voiture", "direct", 2, False, 2.0),
        # ordres directs — vitre conducteur (pulse 4s/5s)
        ("Ouvre la vitre conducteur", "direct", 3, True, 4.0),
        ("Baisse la vitre gauche", "direct", 3, True, 4.0),
        ("Descends la vitre du conducteur", "direct", 3, True, 4.0),
        ("Ferme la vitre conducteur", "direct", 3, False, 5.0),
        ("Remonte la vitre gauche", "direct", 3, False, 5.0),
        # ordres directs — vitre passager (pulse 4s/5s)
        ("Baisse la vitre passager", "direct", 4, True, 4.0),
        ("Ouvre la vitre droite", "direct", 4, True, 4.0),
        ("Monte la vitre du passager", "direct", 4, False, 5.0),
        ("Ferme la vitre droite", "direct", 4, False, 5.0),
        # ordres directs — deux vitres (pulse 4s/5s)
        ("Ouvre les deux vitres", "direct", 5, True, 4.0),
        ("Baisse toutes les vitres", "direct", 5, True, 4.0),
        ("Vitres en bas", "direct", 5, True, 4.0),
        ("Ferme les deux vitres", "direct", 5, False, 5.0),
        ("Monte toutes les vitres", "direct", 5, False, 5.0),
        ("Vitres en haut", "direct", 5, False, 5.0),
        # ordres directs — coffre (pulse 1.0s)
        ("Ouvre le coffre", "direct", 6, True, 1.0),
        ("Ouvre le hayon", "direct", 6, True, 1.0),
        ("Déverrouille le coffre", "direct", 6, True, 1.0),
        # ordres directs — verrouillage / déverrouillage
        ("Verrouille les portes", "direct", 7, True, None),
        ("Ferme la voiture", "direct", 7, True, None),
        ("Lock la voiture", "direct", 7, True, None),
        ("Déverrouille les portes", "direct", 8, True, None),
        ("Ouvre la voiture", "direct", 8, True, None),
        ("Unlock le véhicule", "direct", 8, True, None),
        # ordres directs — feux, variantes supplémentaires
        ("Allume les feux", "direct", 1, True, None),
        ("Éteins les feux", "direct", 1, False, None),
        ("Éteint les feux", "direct", 1, False, None),
        ("Ouvre les feux", "direct", 1, True, None),
        ("Ferme les feux", "direct", 1, False, None),
        ("Ouvre les phares", "direct", 1, True, None),
        ("Ferme les phares", "direct", 1, False, None),
        # ordres directs — fenêtres (variantes de « vitres »)
        ("Ouvre la fenêtre", "direct", 3, True, 4.0),
        ("Ferme la fenêtre", "direct", 3, False, 5.0),
        ("Baisse la fenêtre", "direct", 3, True, 4.0),
        ("Remonte la fenêtre", "direct", 3, False, 5.0),
        ("Ouvre la fenêtre conducteur", "direct", 3, True, 4.0),
        ("Ferme la fenêtre conducteur", "direct", 3, False, 5.0),
        ("Ouvre la fenêtre passager", "direct", 4, True, 4.0),
        ("Ferme la fenêtre passager", "direct", 4, False, 5.0),
        ("Baisse la fenêtre droite", "direct", 4, True, 4.0),
        ("Ouvre les fenêtres", "direct", 5, True, 4.0),
        ("Ferme les fenêtres", "direct", 5, False, 5.0),
        ("Baisse les deux fenêtres", "direct", 5, True, 4.0),
        ("Remonte toutes les fenêtres", "direct", 5, False, 5.0),
        ("Fenêtres en bas", "direct", 5, True, 4.0),
        ("Fenêtres en haut", "direct", 5, False, 5.0),
    ]

    print("Test d'analyse d'intention (aucun relais actionné)\n")
    errors = 0
    for phrase, expected_type, expected_relay, expected_state, expected_pulse in _TEST_CASES:
        norm = _normalize(phrase)
        words = set(norm.split())

        if expected_type == "ignore":
            ok = _is_narrative(norm, words)
            detected_relay = None
            detected_state = None
            detected_pulse = None
        else:
            command = vehicle_mode._detect_relay_intent(norm, words)
            if command is None:
                ok = False
                detected_relay = None
                detected_state = None
                detected_pulse = None
            else:
                detected_relay = command.relay
                detected_state = command.state
                detected_pulse = command.pulse_seconds
                ok = (
                    command.relay == expected_relay
                    and command.state == expected_state
                    and command.pulse_seconds == expected_pulse
                )
                if expected_type == "polite":
                    ok = ok and _is_polite_request(norm, words)
                elif expected_type == "direct":
                    ok = ok and not _is_polite_request(norm, words) and not _is_narrative(norm, words)

        status = "OK" if ok else "ERREUR"
        print(f"  [{status}] {phrase!r}")
        print(
            f"       type={expected_type}, relay={detected_relay}, "
            f"state={detected_state}, pulse={detected_pulse}"
        )
        if not ok:
            errors += 1

    print(f"\nRésultat : {len(_TEST_CASES) - errors}/{len(_TEST_CASES)} tests OK")
    sys.exit(0 if errors == 0 else 1)
