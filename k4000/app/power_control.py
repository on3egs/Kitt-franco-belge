"""Validation locale, à deux étapes, des demandes d'extinction vocale."""

from __future__ import annotations

import re
import time
import unicodedata


def normalize_spoken_phrase(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


class ShutdownGuard:
    """Demande une phrase secrète avant d'autoriser l'arrêt du système."""

    REQUESTS = {
        "extinction du systeme",
        "coupe toi",
        "arrete toi",
        "eteins toi",
        "stop",
    }
    PASSWORD = "attention voila la police"

    def __init__(self, timeout_seconds: int = 90) -> None:
        self.timeout_seconds = timeout_seconds
        self._pending: dict[str, float] = {}

    def evaluate(self, session_id: str, message: str) -> tuple[str | None, bool]:
        now = time.monotonic()
        normalized = normalize_spoken_phrase(message)
        expires_at = self._pending.get(session_id, 0)

        if expires_at > now:
            if normalized == self.PASSWORD:
                self._pending.pop(session_id, None)
                return "Mot de passe confirmé. Extinction du système.", True
            if normalized in {"annule", "annulation", "abandonne", "retour"}:
                self._pending.pop(session_id, None)
                return "Extinction annulée.", False
            return "Mot de passe incorrect. Dites annulation pour abandonner.", False

        self._pending.pop(session_id, None)
        if normalized in self.REQUESTS:
            self._pending[session_id] = now + self.timeout_seconds
            return "Commande d'extinction reçue. Donnez le mot de passe.", False
        return None, False
