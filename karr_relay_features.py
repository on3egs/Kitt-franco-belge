"""Commandes physiques KMTronic pour KARR de Dadoo.

Ce module garde la logique dangereuse hors du serveur principal : exclusion des
relais de vitre, duree maximale du klaxon et coupure systematique au nettoyage.
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import unicodedata
from pathlib import Path

from relais.kitt_relais import BOARD, NB_RELAIS, RELAY_LABELS

WINDOW_TRAVEL_TIME = 6.0
WINDOW_DOWN = 5
WINDOW_UP = 6
HORN_RELAY = 8
HORN_MAX_ON = 2.0
SOS_REAL_CYCLE = 30 * 60
SOS_REAL_PAUSE = 60
CUSTOM_FILE = Path(__file__).resolve().parent / "relais" / "horn_patterns.json"

ON, OFF = True, False

RELAY_ACTIONS = {
    "relay_door_open": (1, "pulse", "J'ouvre la porte. Tache elementaire."),
    "relay_door_close": (2, "pulse", "Je ferme la porte."),
    "relay_lights_open": (3, "pulse", "Feux allumes. Meme vous devriez maintenant voir clair."),
    "relay_lights_close": (4, "pulse", "Feux eteints."),
    "relay_window_open": (WINDOW_DOWN, "window", "J'ouvre la fenetre."),
    "relay_window_close": (WINDOW_UP, "window", "Je ferme la fenetre."),
    "relay_trunk_open": (7, "pulse", "J'ouvre le coffre."),
    "relay_horn": (HORN_RELAY, "pulse", "Klaxon active."),
}

HORN_PATTERNS = {
    "victoire": {
        "label": "Victoire", "aliases": ["victoire", "victory", "triomphe"],
        "seq": [(ON, .4), (OFF, .2), (ON, .4), (OFF, .2), (ON, .4), (OFF, .2), (ON, 1.5)],
    },
    "champions": {
        "label": "Champions", "aliases": ["champions", "champion", "sportif"],
        "seq": [(ON, .5), (OFF, .2), (ON, .5), (OFF, .2), (ON, 1.0), (OFF, .3), (ON, 1.3)],
    },
    "supporters": {
        "label": "Supporters", "aliases": ["supporters", "supporter", "fans"],
        "seq": [(ON, .25), (OFF, .15), (ON, .25), (OFF, .15), (ON, .5), (OFF, .35), (ON, 1.2)],
    },
    "fete": {
        "label": "Fete", "aliases": ["fete", "party", "fiesta"],
        "seq": [(ON, .15), (OFF, .1), (ON, .15), (OFF, .1), (ON, .5), (OFF, .25), (ON, 1.4)],
    },
    "sos": {
        "label": "SOS", "aliases": ["sos", "detresse", "secours", "morse"],
        "seq": [
            (ON, .2), (OFF, .2), (ON, .2), (OFF, .2), (ON, .2), (OFF, .4),
            (ON, .6), (OFF, .2), (ON, .6), (OFF, .2), (ON, .6), (OFF, .4),
            (ON, .2), (OFF, .2), (ON, .2), (OFF, .2), (ON, .2), (OFF, .6),
        ] * 2,
    },
}
BUILTINS = set(HORN_PATTERNS)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def _load_custom() -> None:
    try:
        data = json.loads(CUSTOM_FILE.read_text(encoding="utf-8"))
        for name, item in data.items():
            if name not in BUILTINS and isinstance(item.get("seq"), list):
                item["seq"] = [(bool(x[0]), float(x[1])) for x in item["seq"]]
                HORN_PATTERNS[name] = item
    except (FileNotFoundError, ValueError, TypeError, json.JSONDecodeError):
        pass


def _save_custom() -> None:
    CUSTOM_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {k: v for k, v in HORN_PATTERNS.items() if k not in BUILTINS}
    CUSTOM_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


_load_custom()

HORN_ROOT = r"[kc][lr]a(?:qu?e?\s*s|[kxcs]{1,3})on\w*"
SOS_WORD = r"(?:s\.?\s?o\.?\s?s|au\s+secours|d[ee]tresse)"
PATTERNS = [
    (re.compile(r"(?:ouvr|deverrouill)\w*.{0,20}\bportes?\b", re.I), "relay_door_open"),
    (re.compile(r"(?:ferm|verrouill)\w*.{0,20}\bportes?\b", re.I), "relay_door_close"),
    (re.compile(r"(?:ouvr|allum)\w*.{0,20}(?:feux|phares?|lumieres?)", re.I), "relay_lights_open"),
    (re.compile(r"(?:ferm|eteins|eteign|coupe)\w*.{0,20}(?:feux|phares?|lumieres?)", re.I), "relay_lights_close"),
    (re.compile(r"(?:ouvr|descend|baiss)\w*.{0,20}(?:fenetres?|vitres?)", re.I), "relay_window_open"),
    (re.compile(r"(?:ferm|remont|mont)\w*.{0,20}(?:fenetres?|vitres?)", re.I), "relay_window_close"),
    (re.compile(r"(?:ouvr|deverrouill)\w*.{0,20}(?:coffre|malle)", re.I), "relay_trunk_open"),
    (re.compile(rf"(?:arret|stop|coupe|annul|termin|desactiv|cesse)\w*[^.!?]{{0,25}}{SOS_WORD}", re.I), "relay_sos_stop"),
    (re.compile(rf"(?:declench|enclench|active)\w*[^.!?]{{0,25}}{SOS_WORD}|{SOS_WORD}[^.!?]{{0,25}}(?:reel|vrai|urgence|non.?stop|permanent|continu|30\s*min)|\bdetresse\w*\b", re.I), "relay_sos_real"),
    (re.compile(r"\b(?:s\.?\s?o\.?\s?s|au\s+secours)\b", re.I), "relay_sos"),
    (re.compile(rf"(?:list|inventaire|montre|affiche|quels?|combien)\w*[^.!?]{{0,30}}{HORN_ROOT}", re.I), "relay_horn_list"),
    (re.compile(rf"(?:cree|ajoute|invente|genere)\w*[^.!?]{{0,30}}{HORN_ROOT}", re.I), "relay_horn_create"),
    (re.compile(rf"{HORN_ROOT}\s+(?:de\s+|du\s+|la\s+|le\s+|pour\s+)*([\w'-]+)", re.I), "relay_horn_pattern"),
    (re.compile(rf"{HORN_ROOT}|avertisseur\s+sonore", re.I), "relay_horn"),
]


def match_command(text: str):
    """Retourne (type, match) apres normalisation des accents du STT."""
    normalized = _norm(text)
    for pattern, func_type in PATTERNS:
        found = pattern.search(normalized)
        if found:
            return func_type, found
    return None, None

_window_task: asyncio.Task | None = None
_horn_task: asyncio.Task | None = None
_sos_task: asyncio.Task | None = None


async def _set(relay: int, on: bool) -> bool:
    return await asyncio.get_running_loop().run_in_executor(None, BOARD.set, relay, on)


async def _pulse(relay: int, duration: float = .6) -> bool:
    return await asyncio.get_running_loop().run_in_executor(None, BOARD.pulse, relay, duration)


async def _window_run(relay: int) -> None:
    try:
        await _set(relay, True)
        await asyncio.sleep(WINDOW_TRAVEL_TIME)
    finally:
        await _set(relay, False)


async def _window_start(relay: int) -> bool:
    global _window_task
    if _window_task and not _window_task.done():
        _window_task.cancel()
        try:
            await _window_task
        except asyncio.CancelledError:
            pass
    await _set(WINDOW_DOWN, False)
    await _set(WINDOW_UP, False)
    await asyncio.sleep(.1)
    _window_task = asyncio.create_task(_window_run(relay))
    return True


async def _play_sequence(seq) -> None:
    try:
        for state, duration in seq:
            await _set(HORN_RELAY, bool(state))
            await asyncio.sleep(min(float(duration), HORN_MAX_ON) if state else float(duration))
    finally:
        await _set(HORN_RELAY, False)


async def _play_pattern(name: str) -> bool:
    global _horn_task
    item = HORN_PATTERNS.get(name)
    if not item:
        return False
    if _horn_task and not _horn_task.done():
        _horn_task.cancel()
    _horn_task = asyncio.create_task(_play_sequence(item["seq"]))
    return True


async def _sos_loop() -> None:
    try:
        while True:
            started = asyncio.get_running_loop().time()
            while asyncio.get_running_loop().time() - started < SOS_REAL_CYCLE:
                await _play_sequence(HORN_PATTERNS["sos"]["seq"])
                await asyncio.sleep(1)
            await asyncio.sleep(SOS_REAL_PAUSE)
    finally:
        await _set(HORN_RELAY, False)


async def execute(func_type: str, match) -> str:
    global _sos_task
    if func_type == "relay_sos_stop":
        for task in (_sos_task, _horn_task):
            if task and not task.done():
                task.cancel()
        await _set(HORN_RELAY, False)
        return "SOS interrompu. Le silence est retabli."
    if func_type == "relay_sos_real":
        if _sos_task and not _sos_task.done():
            return "Le SOS permanent est deja actif."
        _sos_task = asyncio.create_task(_sos_loop())
        return "SOS permanent active. Dis arrete le SOS pour le couper."
    if func_type == "relay_sos":
        await _play_pattern("sos")
        return "Signal SOS emis. Une mesure raisonnable, pour une fois."
    if func_type == "relay_horn_list":
        names = ", ".join(v["label"] for v in HORN_PATTERNS.values())
        return f"Klaxons disponibles : {names}."
    if func_type == "relay_horn_create":
        name = f"karr-{len(HORN_PATTERNS) + 1}"
        HORN_PATTERNS[name] = {
            "label": name, "aliases": [name],
            "seq": [(ON, round(random.uniform(.15, .5), 2)), (OFF, .15),
                    (ON, round(random.uniform(.3, 1.2), 2))] * 2,
        }
        _save_custom()
        await _play_pattern(name)
        return f"Nouveau motif cree : {name}."
    if func_type == "relay_horn_pattern":
        words = set(re.findall(r"[a-z0-9-]+", _norm(match.string)))
        for name, item in HORN_PATTERNS.items():
            aliases = {_norm(x) for x in item.get("aliases", [])}
            if name in words or aliases & words:
                await _play_pattern(name)
                return f"Motif {item['label']} active."
        await _pulse(HORN_RELAY)
        return "Motif inconnu. Klaxon simple execute."
    relay, mode, reply = RELAY_ACTIONS[func_type]
    if mode == "window":
        ok = await _window_start(relay)
    else:
        ok = await _pulse(relay)
    return reply if ok else f"Commande relais impossible : {BOARD.last_error}."


async def status() -> dict:
    loop = asyncio.get_running_loop()
    connected = await loop.run_in_executor(None, BOARD.is_connected)
    port = await loop.run_in_executor(None, BOARD.port_path)
    return {"available": True, "connected": connected, "port": port,
            "labels": {str(k): v for k, v in RELAY_LABELS.items()},
            "sos_active": bool(_sos_task and not _sos_task.done()),
            "error": BOARD.last_error}


async def test(relay: int, action: str) -> dict:
    if not 1 <= relay <= NB_RELAIS:
        return {"ok": False, "error": "relais hors plage 1..8"}
    if action == "on":
        ok = await _set(relay, True)
    elif action == "off":
        ok = await _set(relay, False)
    else:
        action = "pulse"
        ok = await _pulse(relay)
    return {"ok": ok, "relay": relay, "action": action,
            "error": "" if ok else BOARD.last_error}


async def startup() -> bool:
    loop = asyncio.get_running_loop()
    connected = await loop.run_in_executor(None, BOARD.connect)
    if connected:
        await loop.run_in_executor(None, BOARD.all_off)
    return connected


async def shutdown() -> None:
    for task in (_window_task, _horn_task, _sos_task):
        if task and not task.done():
            task.cancel()
    if BOARD.is_connected():
        await asyncio.get_running_loop().run_in_executor(None, BOARD.all_off)
    BOARD.close()
