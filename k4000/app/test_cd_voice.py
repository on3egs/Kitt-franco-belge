import ast
import re
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent
tree = ast.parse((BASE / "kitt_server.py").read_text(encoding="utf-8"))
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {"_normalize_memory_text", "_cd_player_voice_result", "_media_hub_voice_result"}]
namespace = {"re": re, "unicodedata": unicodedata}
exec(compile(ast.Module(body=functions, type_ignores=[]), "kitt_server.py", "exec"), namespace)
detect = namespace["_cd_player_voice_result"]
detect_media = namespace["_media_hub_voice_result"]

cases = {
    "ouvre le lecteur CD": "cd_open", "ouvre la musique": "cd_open", "lecteur CD": "cd_open",
    "active le lecteur musique": "cd_open", "actif lecteur musique": "cd_open", "l'acteur musique": "cd_open",
    "lecteur de musique": "cd_open",
    "mets en pause": "cd_pause", "demande une pause du lecteur de musique": "cd_pause", "arrête la musique": "cd_stop",
    "piste suivante": "cd_next", "morceau précédent": "cd_previous", "éjecte le CD": "cd_eject",
    "active lecture aléatoire": "cd_shuffle_on", "désactive lecture aléatoire": "cd_shuffle_off",
    "répète la piste": "cd_repeat_track", "répète le CD": "cd_repeat_all", "désactive répétition": "cd_repeat_off",
    "volume musique 50": "cd_volume_50",
    "ferme le lecteur CD": "cd_close", "retour accueil": "cd_close",
}
for phrase, action in cases.items():
    result = detect(phrase)
    assert result and result["action"] == action, (phrase, result, action)

# Les formes courtes sont volontairement réservées au contexte du lecteur :
# cela évite qu'un « avance », « pause » ou « volume » détourne une commande
# d'un autre module depuis l'accueil.
context_cases = {
    "lecture": "cd_play", "joue": "cd_play", "jouer": "cd_play",
    "écouter de la musique": "cd_play", "écoute de la musique": "cd_play",
    "mettre de la musique": "cd_play", "mets la musique": "cd_play",
    "paude": "cd_pause", "pode": "cd_pause", "pose": "cd_pause",
    "pause": "cd_pause", "pause la musique": "cd_pause",
    "stop": "cd_stop", "stope": "cd_stop", "arrête": "cd_stop",
    "suivant": "cd_next", "suivante": "cd_next", "avance": "cd_next",
    "music suivant": "cd_next", "recule": "cd_previous",
    "précédant": "cd_previous", "en arrière": "cd_previous",
    "monte le volume": "cd_volume_up", "baisse le volume": "cd_volume_down",
    "volume 50": "cd_volume_50",
    "alliatoire": "cd_shuffle_on", "aleatoir": "cd_shuffle_on",
}
for phrase, action in context_cases.items():
    result = detect(phrase, context_active=True)
    assert result and result["action"] == action, (phrase, result, action)

for phrase in ("pause", "stop", "avance", "volume 50"):
    assert detect(phrase) is None, ("commande générique détournée hors contexte", phrase)

media_cases = {
    "ouvre la radio": "media_radio_open", "affiche la radio": "media_radio_open",
    "lance la radio": "media_radio_open", "ouvre le tuner": "media_radio_open",
    "ouvre l'autoradio": "media_radio_open", "autoradio": "media_radio_open",
    "ouvre la vidéo": "media_video_open", "lecteur vidéo": "media_video_open",
    "ferme la radio": "media_close",
}
for phrase, action in media_cases.items():
    result = detect_media(phrase)
    assert result and result["action"] == action, (phrase, result, action)

print(f"OK: {len(cases) + len(context_cases)} commandes CD + {len(media_cases)} commandes radio/vidéo routées sans LLM")
