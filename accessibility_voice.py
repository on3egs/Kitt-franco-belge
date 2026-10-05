"""Commandes vocales d'accessibilité, partagées par les serveurs Kyronext."""
from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path


class AccessibilityVoice:
    def __init__(self, settings_file: str | Path):
        self.settings_file = Path(settings_file)
        self.pending: dict[str, tuple[float, str, float]] = {}
        self.defaults = {
            "ui_resolution": "auto", "ui_scale": 1.0, "touch_10inch": False,
            "system_resolution_change": False, "volume": 75,
            "display_intensity": 100,
        }

    @staticmethod
    def _norm(value: str) -> str:
        value = unicodedata.normalize("NFD", str(value).casefold())
        value = "".join(c for c in value if unicodedata.category(c) != "Mn")
        return re.sub(r"\s+", " ", value).strip()

    def _load(self) -> dict:
        settings = dict(self.defaults)
        try:
            data = json.loads(self.settings_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                settings.update({k: data[k] for k in settings if k in data})
        except (OSError, ValueError):
            pass
        settings["ui_scale"] = max(.75, min(1.75, float(settings["ui_scale"])))
        settings["display_intensity"] = max(20, min(100, int(settings["display_intensity"])))
        return settings

    def _save(self, settings: dict) -> dict:
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.settings_file.with_suffix(".voice.tmp")
        tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.settings_file)
        return settings

    @staticmethod
    def _confirmation(value: str) -> bool | None:
        if re.fullmatch(r"(?:oui|d accord|vas y|confirme|confirmer|ok|okay)", value):
            return True
        if re.fullmatch(r"(?:non|annule|annuler|laisse tomber|laisse comme ca)", value):
            return False
        return None

    def handle(self, message: str, session_id: str) -> tuple[str, str | None] | None:
        value = self._norm(message)
        now = time.monotonic()
        pending = self.pending.get(session_id)
        if pending and pending[0] <= now:
            self.pending.pop(session_id, None)
            pending = None
        if pending:
            answer = self._confirmation(value)
            if answer is not None:
                self.pending.pop(session_id, None)
                if not answer:
                    return "D'accord, je ne change rien.", None
                settings = self._load()
                kind, target = pending[1], pending[2]
                if kind == "scale":
                    settings["ui_scale"] = round(max(.75, min(1.75, target)), 2)
                    reply = f"C'est fait, j'ai réglé la taille du texte à {round(settings['ui_scale'] * 100)} %."
                else:
                    settings["display_intensity"] = int(max(20, min(100, target)))
                    reply = f"C'est fait, l'intensité de l'affichage est réglée à {settings['display_intensity']} %."
                self._save(settings)
                return reply, "ui_settings_changed"
            # Une nouvelle commande annule silencieusement l'ancienne demande.
            self.pending.pop(session_id, None)

        scale_request = bool(re.search(
            r"agrand(?:is|ir)|augmente(?:r)?\s+(?:la\s+)?(?:taille|police|typograph|texte)|"
            r"ecritures?\s+plus\s+grand|texte\s+.*(?:trop\s+petit|illisible)|"
            r"du mal a lire|n arrive pas a lire|remets?\s+la\s+taille\s+normale|"
            r"redui(?:s|re)\s+la\s+taille|texte\s+au\s+(?:minimum|maximum)|"
            r"agrand(?:is|ir)\s+encore",
            value,
        ))
        display_request = bool(re.search(
            r"(?:intensite|luminosite|affichage|ecran).*(?:affichage|ecran|maximum|minimum|"
            r"sombre|lumineux|pour cent|%)|(?:augmente|diminue|mets?|regle).*(?:luminosite|intensite|affichage)",
            value,
        ))
        vague_reading = bool(re.search(r"(?:ne vois pas bien|trop petit|n arrive pas a lire|texte est illisible)", value))
        if vague_reading and not display_request:
            if re.search(r"\b(?:ecran|affichage|sombre|lumineux)\b", value):
                return "Veux-tu que j'augmente l'intensité de l'affichage ?", None
            return "Veux-tu que j'agrandisse le texte ?", None

        settings = self._load()
        if scale_request:
            target = settings["ui_scale"]
            if re.search(r"redui|minimum", value):
                target = .75
            elif re.search(r"maximum", value):
                target = 1.75
            elif re.search(r"normal", value):
                target = 1.0
            elif re.search(r"encore|agrand", value):
                target += .10
            else:
                target += .10
            self.pending[session_id] = (now + 12, "scale", max(.75, min(1.75, target)))
            return "Tu veux que j'agrandisse le texte ?", None

        if display_request:
            match = re.search(r"(\d{1,3})\s*(?:%|pour cent)", value)
            if match:
                target = float(match.group(1))
            elif re.search(r"minimum|diminue|sombre", value):
                target = 20
            else:
                target = 100
            self.pending[session_id] = (now + 12, "intensity", target)
            return f"Tu veux que je règle l'intensité de l'affichage à {int(max(20, min(100, target)))} % ?", None
        return None
