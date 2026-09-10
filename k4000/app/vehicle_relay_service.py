"""Service centralisé de contrôle des relais du véhicule K-4000.

Ce module est la seule couche métier autorisée à piloter les relais USB/RS485.
Les commandes vocales (vehicle_command_mode.py) et l'interface graphique
(kitt_server.py) doivent passer par ce service.

Fonctionnalités :
    - Mapping configurable via config/vehicle_relays.json
    - Anti-collision automatique entre directions opposées
    - Timeout de sécurité pour les commandes temporisées
    - Suivi des commandes en cours pour le mode diagnostic
    - Arrêt d'urgence de tous les relais véhicule
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# relay_controller est importé à la volée pour garder ce module testable
# même si pyserial n'est pas disponible.
try:
    from relay_controller import RelayController, RelayError
    _RELAY_AVAILABLE = True
except Exception:  # pragma: no cover
    RelayController = None  # type: ignore[misc,assignment]
    RelayError = Exception  # type: ignore[misc,assignment]
    _RELAY_AVAILABLE = False


logger = logging.getLogger("vehicle_relay_service")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    _formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _stream_handler = logging.StreamHandler()
    _stream_handler.setFormatter(_formatter)
    logger.addHandler(_stream_handler)


# ------------------------------------------------------------------------------
# Chemins et configuration
# ------------------------------------------------------------------------------
PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PROJECT_DIR / "config" / "vehicle_relays.json"

# Suite de (durée du coup, silence suivant). Les longues signatures restent
# bornées à douze secondes et sont toutes interruptibles.
_HORN_SOS_ONCE = (
    (0.12, 0.10), (0.12, 0.10), (0.12, 0.24),
    (0.34, 0.12), (0.34, 0.12), (0.34, 0.24),
    (0.12, 0.10), (0.12, 0.10), (0.12, 0.0),
)
HORN_PATTERNS: dict[str, tuple[tuple[float, float], ...]] = {
    "normal": ((0.25, 0.0),),
    "double": ((0.16, 0.14), (0.16, 0.0)),
    "amical": ((0.13, 0.12), (0.13, 0.16), (0.30, 0.0)),
    "mariage": ((0.14, 0.10), (0.14, 0.10), (0.30, 0.16), (0.14, 0.10), (0.30, 0.0)),
    "mission": ((0.22, 0.18), (0.22, 0.18), (0.22, 0.0)),
    "alerte": tuple((0.18, 0.10) for _ in range(18)),
    "sos": _HORN_SOS_ONCE[:-1] + ((_HORN_SOS_ONCE[-1][0], 0.55),)
           + _HORN_SOS_ONCE[:-1] + ((_HORN_SOS_ONCE[-1][0], 0.55),)
           + _HORN_SOS_ONCE,
    # « du, du, dududu, dudududu, dudu » : groupes 1–1–3–4–2.
    "kitt": (
        (0.10, 0.24), (0.10, 0.24),
        (0.10, 0.07), (0.10, 0.07), (0.10, 0.24),
        (0.10, 0.07), (0.10, 0.07), (0.10, 0.07), (0.10, 0.24),
        (0.10, 0.07), (0.10, 0.0),
    ),
    "panique": tuple((0.18, 0.15) for _ in range(30)),
    "demo": (
        (0.10, 0.24), (0.10, 0.24),
        (0.10, 0.07), (0.10, 0.07), (0.10, 0.36),
        (0.18, 0.14), (0.18, 0.44),
        (0.10, 0.07), (0.10, 0.07), (0.10, 0.07), (0.10, 0.50),
        (0.24, 0.18), (0.24, 0.0),
    ),
}

# Suite de (état des phares, durée). L’état connu avant l’animation est restauré.
LIGHT_PATTERNS: dict[str, tuple[tuple[bool, float], ...]] = {
    "appel": ((True, 0.30), (False, 0.10)),
    "double": ((True, 0.22), (False, 0.18), (True, 0.22), (False, 0.10)),
    "merci": ((True, 0.14), (False, 0.14), (True, 0.14), (False, 0.10)),
    "attention": tuple((state, 0.28) for _ in range(8) for state in (True, False)),
    "sos": (
        (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.24),
        (True, 0.36), (False, 0.14), (True, 0.36), (False, 0.14), (True, 0.36), (False, 0.24),
        (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.10),
    ),
    "kitt": tuple((state, duration) for duration in (0.10, 0.16, 0.24, 0.16, 0.10) for state in (True, False)),
    "sos_super": tuple(
        step
        for repetition in range(3)
        for step in (
            (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.24),
            (True, 0.36), (False, 0.14), (True, 0.36), (False, 0.14), (True, 0.36), (False, 0.24),
            (True, 0.12), (False, 0.12), (True, 0.12), (False, 0.12), (True, 0.12),
            (False, 0.55 if repetition < 2 else 0.10),
        )
    ),
    "panique": tuple((state, 0.31) for _ in range(16) for state in (True, False)),
    "demo": tuple((state, duration) for duration in (0.10, 0.18, 0.28, 0.40, 0.28, 0.18, 0.10, 0.50) for state in (True, False)),
}


# ------------------------------------------------------------------------------
# Modèles de données
# ------------------------------------------------------------------------------
@dataclass
class CommandRecord:
    """Enregistrement d'une commande relais (pour diagnostic et logs)."""

    function: str
    relay: int | None
    state: bool
    duration_ms: int | None
    status: str  # "sent", "active", "completed", "error", "cancelled"
    message: str = ""
    timestamp: float = field(default_factory=time.time)


class VehicleRelayError(Exception):
    """Erreur liée au service de contrôle véhicule."""


# ------------------------------------------------------------------------------
# Service
# ------------------------------------------------------------------------------
class VehicleRelayService:
    """Service unique de contrôle des relais du véhicule K-4000."""

    def __init__(self, config_path: Path | str = DEFAULT_CONFIG_PATH) -> None:
        self.config_path = Path(config_path)
        self._config: dict[str, Any] = self._load_config()
        self._functions: dict[str, dict[str, Any]] = self._config.get("functions", {})
        self._safety: dict[str, Any] = self._config.get("safety", {})
        self._board: dict[str, Any] = self._config.get("relay_board", {})
        self._windows: dict[str, Any] = self._config.get("windows", {})
        self._hardware_lock = threading.RLock()

        # Verrous par fonction antagoniste (ex. vitre conducteur up/down).
        self._locks: dict[str, threading.Lock] = {
            name: threading.Lock() for name in self._functions
        }
        # Verrou global pour l'historique et l'état.
        self._state_lock = threading.Lock()
        self._history: list[CommandRecord] = []
        self._max_history = 100
        self._horn_cancel = threading.Event()
        self._horn_pattern_lock = threading.Lock()
        self._light_cancel = threading.Event()
        self._light_pattern_lock = threading.Lock()
        self._headlights_state = False
        self._scanner_state = False
        self._combined_cancel = threading.Event()
        self._combined_lock = threading.Lock()

        # Commandes activement en cours (pour stop manuel et diagnostic).
        self._active_commands: dict[str, CommandRecord] = {}

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------
    def _load_config(self) -> dict[str, Any]:
        if not self.config_path.exists():
            raise VehicleRelayError(
                f"Fichier de configuration introuvable : {self.config_path}"
            )
        try:
            with self.config_path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as exc:
            raise VehicleRelayError(f"Configuration JSON invalide : {exc}") from exc

    def reload_config(self) -> None:
        """Recharge la configuration à chaud (utile après ajustement du mapping)."""
        with self._state_lock:
            self._config = self._load_config()
            self._functions = self._config.get("functions", {})
            self._safety = self._config.get("safety", {})
            self._board = self._config.get("relay_board", {})
            self._windows = self._config.get("windows", {})
            # Recréer les verrous si de nouvelles fonctions apparaissent.
            for name in self._functions:
                if name not in self._locks:
                    self._locks[name] = threading.Lock()

    def get_config(self) -> dict[str, Any]:
        """Retourne une copie de la configuration chargée."""
        with self._state_lock:
            return json.loads(json.dumps(self._config))

    def _function_conf(self, function: str) -> dict[str, Any]:
        if function not in self._functions:
            raise VehicleRelayError(f"Fonction inconnue : {function}")
        return self._functions[function]

    def _relay_kwargs(self) -> dict[str, Any]:
        """Retourne les arguments pour instancier RelayController."""
        kwargs: dict[str, Any] = {}
        if self._board.get("port"):
            kwargs["port"] = self._board["port"]
        if self._board.get("baudrate"):
            kwargs["baudrate"] = self._board["baudrate"]
        if self._board.get("protocol"):
            kwargs["protocol"] = self._board["protocol"]
        if self._board.get("relay_count"):
            kwargs["relay_count"] = int(self._board["relay_count"])
        return kwargs

    def _installed_relay_count(self) -> int:
        return int(self._board.get("installed_modules", 1)) * int(
            self._board.get("module_size", 8)
        )

    def _require_installed_relay(self, relay: int) -> None:
        installed = self._installed_relay_count()
        if relay > installed:
            module = ((relay - 1) // int(self._board.get("module_size", 8))) + 1
            raise VehicleRelayError(
                f"Relais R{relay} préparé sur le module {module}, mais seulement "
                f"{self._board.get('installed_modules', 1)} module est déclaré installé."
            )

    # ------------------------------------------------------------------
    # Historique / diagnostic
    # ------------------------------------------------------------------
    def _add_record(
        self,
        function: str,
        relay: int | None,
        state: bool,
        duration_ms: int | None,
        status: str,
        message: str = "",
    ) -> CommandRecord:
        record = CommandRecord(
            function=function,
            relay=relay,
            state=state,
            duration_ms=duration_ms,
            status=status,
            message=message,
        )
        with self._state_lock:
            self._history.append(record)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history :]
        return record

    def _update_record_status(self, record: CommandRecord, status: str, message: str = "") -> None:
        record.status = status
        if message:
            record.message = message

    def get_history(self, limit: int = 50) -> list[CommandRecord]:
        """Retourne l'historique des commandes (du plus récent au plus ancien)."""
        with self._state_lock:
            return list(reversed(self._history[-limit:]))

    def get_active_commands(self) -> list[CommandRecord]:
        """Retourne les commandes actuellement en cours."""
        with self._state_lock:
            return list(self._active_commands.values())

    # ------------------------------------------------------------------
    # Pilote relais
    # ------------------------------------------------------------------
    def _ensure_relay_available(self) -> None:
        if not _RELAY_AVAILABLE:
            raise VehicleRelayError("Le contrôleur de relais n'est pas disponible.")

    def _set_relay(self, relay: int, state: bool) -> None:
        """Active ou désactive un relais de manière atomique."""
        self._require_installed_relay(relay)
        self._ensure_relay_available()
        with self._hardware_lock:
            with RelayController(**self._relay_kwargs()) as rc:
                rc.set_relay(relay, state)

    def _pulse_relay(self, relay: int, duration: float) -> None:
        """Envoie une impulsion sur un relais."""
        self._require_installed_relay(relay)
        self._ensure_relay_available()
        with self._hardware_lock:
            with RelayController(**self._relay_kwargs()) as rc:
                rc.pulse_relay(relay, duration)

    # ------------------------------------------------------------------
    # Anti-collision
    # ------------------------------------------------------------------
    def _acquire_function(self, function: str, antagonist: str | None) -> bool:
        """Acquiert le verrou d'une fonction et de son antagoniste si nécessaire.

        Retourne True si l'acquisition a réussi, False si l'antagoniste est actif.
        """
        own_lock = self._locks.get(function)
        if own_lock is None:
            own_lock = threading.Lock()
            self._locks[function] = own_lock

        # On prend d'abord notre propre verrou (non bloquant).
        if not own_lock.acquire(blocking=False):
            return False

        if antagonist:
            antagonist_lock = self._locks.get(antagonist)
            if antagonist_lock is None:
                antagonist_lock = threading.Lock()
                self._locks[antagonist] = antagonist_lock
            # On attend que l'antagoniste ait terminé.
            if not antagonist_lock.acquire(blocking=False):
                own_lock.release()
                return False
            # Délai de sécurité après relâchement de l'antagoniste.
            delay = float(self._safety.get("antagonist_delay_seconds", 0.1))
            if delay > 0:
                time.sleep(delay)

        return True

    def _release_function(self, function: str, antagonist: str | None) -> None:
        """Relâche le verrou d'une fonction et de son antagoniste."""
        own_lock = self._locks.get(function)
        if own_lock and own_lock.locked():
            own_lock.release()
        if antagonist:
            antagonist_lock = self._locks.get(antagonist)
            if antagonist_lock and antagonist_lock.locked():
                antagonist_lock.release()

    # ------------------------------------------------------------------
    # Exécution générique
    # ------------------------------------------------------------------
    def _execute(
        self,
        function: str,
        state: bool,
        duration_seconds: float | None = None,
        allow_override_duration: bool = False,
    ) -> CommandRecord:
        """Exécute une commande configurée et retourne son enregistrement.

        Args:
            function: nom de la fonction dans la configuration.
            state: True pour activer, False pour désactiver (selon le type).
            duration_seconds: durée optionnelle, utilisée pour pulse/timed_hold.
            allow_override_duration: si True, utilise duration_seconds même s'il
                dépasse la valeur par défaut, dans la limite de safety_max_seconds.
        """
        conf = self._function_conf(function)
        relay = conf.get("relay")
        if relay is None:
            raise VehicleRelayError(
                f"La fonction '{function}' n'a pas de relais configuré."
            )
        relay = int(relay)
        cmd_type = conf.get("type", "pulse")
        antagonist = conf.get("antagonist")

        # Détermine la durée effective.
        if duration_seconds is None:
            duration_seconds = float(conf.get("duration_seconds", 0.0))
        else:
            duration_seconds = float(duration_seconds)
            if not allow_override_duration:
                default_duration = float(conf.get("duration_seconds", duration_seconds))
                duration_seconds = min(duration_seconds, default_duration)

        # Limite de sécurité absolue.
        safety_max = conf.get("safety_max_seconds")
        if safety_max is not None:
            safety_max = float(safety_max)
            if duration_seconds > safety_max:
                duration_seconds = safety_max
                logger.warning(
                    "Durée de '%s' limitée à la valeur de sécurité %.1f s",
                    function,
                    safety_max,
                )

        duration_ms = int(duration_seconds * 1000) if duration_seconds else None
        record = self._add_record(
            function=function,
            relay=relay,
            state=state,
            duration_ms=duration_ms,
            status="sent",
        )

        # Anti-collision.
        if not self._acquire_function(function, antagonist):
            self._update_record_status(
                record,
                "error",
                f"Commande '{function}' bloquée : l'antagoniste est actif.",
            )
            return record

        with self._state_lock:
            self._active_commands[function] = record
        self._update_record_status(record, "active")

        try:
            if cmd_type == "on":
                self._set_relay(relay, state)
                self._update_record_status(record, "completed")
            elif cmd_type == "off":
                self._set_relay(relay, state)
                self._update_record_status(record, "completed")
            elif cmd_type == "pulse":
                self._pulse_relay(relay, duration_seconds or 0.5)
                self._update_record_status(record, "completed")
            elif cmd_type == "timed_hold":
                if state:
                    self._timed_hold(function, relay, duration_seconds or 1.0)
                else:
                    # Une commande OFF est immédiate ; elle ne doit surtout pas
                    # réactiver temporairement un accessoire temporisé.
                    self.stop_function(function)
                    self._set_relay(relay, False)
                self._update_record_status(record, "completed")
            else:
                raise VehicleRelayError(f"Type de commande inconnu : {cmd_type}")
        except Exception as exc:
            logger.exception("Erreur lors de l'exécution de %s", function)
            self._update_record_status(record, "error", str(exc))
            raise
        finally:
            with self._state_lock:
                self._active_commands.pop(function, None)
            self._release_function(function, antagonist)

        return record

    def _timed_hold(self, function: str, relay: int, duration: float) -> None:
        """Maintient un relais actif pendant une durée donnée, puis le coupe.

        Peut être interrompu par stop_function() ou emergency_stop().
        """
        self._set_relay(relay, True)
        try:
            # Vérification périodique pour permettre l'arrêt manuel.
            elapsed = 0.0
            step = 0.1
            while elapsed < duration:
                with self._state_lock:
                    record = self._active_commands.get(function)
                if record is None or record.status == "cancelled":
                    logger.info("Commande %s annulée en cours.", function)
                    break
                time.sleep(step)
                elapsed += step
        finally:
            self._set_relay(relay, False)

    def stop_function(self, function: str) -> CommandRecord | None:
        """Demande l'arrêt d'une commande en cours (vitres, etc.)."""
        with self._state_lock:
            record = self._active_commands.get(function)
            if record and record.status == "active":
                record.status = "cancelled"
                return record
        return None

    # ------------------------------------------------------------------
    # Commandes haut niveau
    # ------------------------------------------------------------------
    def open_trunk(self) -> CommandRecord:
        return self._execute("trunk", True)

    def start_engine(self) -> CommandRecord:
        ignition = self._execute("ignition", True)
        if ignition.status != "completed":
            return ignition
        return self._execute("engine_start", True)

    def stop_engine(self) -> CommandRecord:
        return self._execute("engine_stop", False)

    def operate_window(
        self,
        side: str,
        direction: str,
        duration_seconds: float | None = None,
    ) -> CommandRecord:
        """Actionne une vitre.

        Args:
            side: "driver", "passenger" ou "both".
            direction: "up" ou "down".
            duration_seconds: durée optionnelle, limitée par la sécurité.
        """
        if side not in {"driver", "passenger", "both"} or direction not in {"up", "down"}:
            raise VehicleRelayError(f"Commande vitre invalide : {side} {direction}")
        return self._operate_thunder_window(side, direction, duration_seconds)

    def _operate_thunder_window(
        self, side: str, direction: str, duration_seconds: float | None
    ) -> CommandRecord:
        """Séquence d'inversion de polarité décrite par le schéma Thunder."""
        selectors = [int(r) for r in self._windows["selectors"][side]]
        polarity = {int(r): bool(v) for r, v in self._windows[direction].items()}
        neutral = {int(r): bool(v) for r, v in self._windows["neutral"].items()}
        default_key = f"window_default_{direction}_seconds"
        duration = float(
            duration_seconds
            if duration_seconds is not None
            else self._safety.get(default_key, 4.0)
        )
        duration = min(duration, float(self._safety.get("window_max_seconds", 8.0)))
        function = (
            f"windows_both_{direction}"
            if side == "both"
            else f"window_{side}_{direction}"
        )
        record = self._add_record(
            function, None, True, int(duration * 1000), "sent",
            message=f"Thunder polarité {polarity}, sélection {selectors}",
        )
        with self._state_lock:
            if any(name.startswith("window_") for name in self._active_commands):
                self._update_record_status(record, "error", "Une commande de vitre est déjà active.")
                return record
            self._active_commands[function] = record
        self._update_record_status(record, "active")
        try:
            self._ensure_relay_available()
            for relay in [*polarity, *selectors]:
                self._require_installed_relay(relay)
            with self._hardware_lock:
                with RelayController(**self._relay_kwargs()) as rc:
                    for relay in selectors:
                        rc.set_relay(relay, False)
                    for relay, state in neutral.items():
                        rc.set_relay(relay, state)
                    time.sleep(float(self._safety.get("antagonist_delay_seconds", 0.15)))
                    for relay, state in polarity.items():
                        rc.set_relay(relay, state)
                    for relay in selectors:
                        rc.set_relay(relay, True)
                    elapsed = 0.0
                    while elapsed < duration:
                        with self._state_lock:
                            active = self._active_commands.get(function)
                        if active is None or active.status == "cancelled":
                            break
                        time.sleep(0.1)
                        elapsed += 0.1
                    for relay in selectors:
                        rc.set_relay(relay, False)
                    time.sleep(float(self._safety.get("antagonist_delay_seconds", 0.15)))
                    for relay, state in neutral.items():
                        rc.set_relay(relay, state)
            if record.status != "cancelled":
                self._update_record_status(record, "completed")
        except Exception as exc:
            self._update_record_status(record, "error", str(exc))
            raise
        finally:
            with self._state_lock:
                self._active_commands.pop(function, None)
        return record

    def stop_window(self, side: str) -> CommandRecord | None:
        """Arrête une commande de vitre en cours."""
        mapping = {
            "driver": ["window_driver_down", "window_driver_up"],
            "passenger": ["window_passenger_down", "window_passenger_up"],
            "both": ["windows_both_down", "windows_both_up"],
        }
        stopped = None
        for function in mapping.get(side, []):
            record = self.stop_function(function)
            if record and stopped is None:
                stopped = record
        return stopped

    def set_headlights(self, state: bool) -> CommandRecord:
        self.stop_light_pattern()
        record = self._execute("headlights", state)
        if record.status == "completed":
            self._headlights_state = bool(state)
        return record

    def set_scanner(self, state: bool) -> CommandRecord:
        record = self._execute("scanner", state)
        if record.status == "completed":
            self._scanner_state = bool(state)
        return record

    def set_fog_lights(self, state: bool) -> CommandRecord:
        return self._execute("fog_lights", state)

    def set_laser(self, state: bool) -> CommandRecord:
        """Active le laser au maximum cinq secondes, ou le coupe immédiatement."""
        if state:
            return self._execute("laser", True)
        # L'arrêt doit pouvoir interrompre la temporisation déjà en cours. Il
        # contourne donc le verrou logique de la commande ON, mais conserve le
        # verrou matériel de bas niveau autour de l'écriture série.
        self.stop_function("laser")
        conf = self._function_conf("laser")
        relay = int(conf["relay"])
        record = self._add_record("laser", relay, False, None, "sent")
        try:
            self._set_relay(relay, False)
            self._update_record_status(record, "completed")
        except Exception as exc:
            self._update_record_status(record, "error", str(exc))
            raise
        return record

    def lock_doors(self) -> CommandRecord:
        return self._execute("doors_lock", True)

    def unlock_doors(self) -> CommandRecord:
        return self._execute("doors_unlock", True)

    def honk(self, duration_seconds: float | None = None) -> CommandRecord:
        conf = self._function_conf("horn")
        if duration_seconds is None:
            duration_seconds = float(conf.get("duration_seconds", 0.3))
        return self._execute("horn", True, duration_seconds, allow_override_duration=True)

    def play_horn_pattern(self, pattern: str) -> CommandRecord:
        """Joue une signature rythmique bornée et interruptible sur le klaxon."""
        name = str(pattern or "").strip().lower()
        sequence = HORN_PATTERNS.get(name)
        if sequence is None:
            raise VehicleRelayError(f"Mélodie de klaxon inconnue : {pattern}")
        total = sum(duration + pause for duration, pause in sequence)
        if total > 12.0:
            raise VehicleRelayError("La séquence de klaxon dépasse douze secondes.")
        conf = self._function_conf("horn")
        relay = int(conf["relay"])
        record = self._add_record(f"horn_{name}", relay, True, int(total * 1000), "sent")
        if not self._horn_pattern_lock.acquire(blocking=False):
            self._update_record_status(record, "error", "Une séquence de klaxon est déjà active.")
            return record
        self._horn_cancel.clear()
        self._update_record_status(record, "active")
        try:
            for duration, pause in sequence:
                if self._horn_cancel.is_set():
                    self._update_record_status(record, "cancelled", "Séquence interrompue.")
                    break
                self._set_relay(relay, True)
                if self._horn_cancel.wait(duration):
                    self._set_relay(relay, False)
                    self._update_record_status(record, "cancelled", "Séquence interrompue.")
                    break
                self._set_relay(relay, False)
                if pause and self._horn_cancel.wait(pause):
                    self._update_record_status(record, "cancelled", "Séquence interrompue.")
                    break
            else:
                self._update_record_status(record, "completed")
        except Exception as exc:
            self._update_record_status(record, "error", str(exc))
            raise
        finally:
            try:
                self._set_relay(relay, False)
            finally:
                self._horn_pattern_lock.release()
        return record

    def stop_horn(self) -> CommandRecord:
        """Interrompt une mélodie et force immédiatement le relais klaxon à OFF."""
        self._horn_cancel.set()
        conf = self._function_conf("horn")
        relay = int(conf["relay"])
        record = self._add_record("horn_stop", relay, False, None, "sent")
        self._set_relay(relay, False)
        self._update_record_status(record, "completed")
        return record

    def play_light_pattern(self, pattern: str) -> CommandRecord:
        """Joue un code lumineux puis restaure l’état antérieur connu."""
        name = str(pattern or "").strip().lower()
        sequence = LIGHT_PATTERNS.get(name)
        if sequence is None:
            raise VehicleRelayError(f"Code de phares inconnu : {pattern}")
        total = sum(duration for _, duration in sequence)
        if total > 12.0:
            raise VehicleRelayError("Le code de phares dépasse douze secondes.")
        conf = self._function_conf("headlights")
        relay = int(conf["relay"])
        restore_state = self._headlights_state
        record = self._add_record(f"lights_{name}", relay, restore_state, int(total * 1000), "sent")
        if not self._light_pattern_lock.acquire(blocking=False):
            self._update_record_status(record, "error", "Un code de phares est déjà actif.")
            return record
        self._light_cancel.clear()
        self._update_record_status(record, "active")
        try:
            for state, duration in sequence:
                if self._light_cancel.is_set():
                    self._update_record_status(record, "cancelled", "Code lumineux interrompu.")
                    break
                self._set_relay(relay, state)
                if self._light_cancel.wait(duration):
                    self._update_record_status(record, "cancelled", "Code lumineux interrompu.")
                    break
            else:
                self._update_record_status(record, "completed")
        except Exception as exc:
            self._update_record_status(record, "error", str(exc))
            raise
        finally:
            try:
                self._set_relay(relay, restore_state)
            finally:
                self._light_pattern_lock.release()
        return record

    def stop_light_pattern(self) -> CommandRecord:
        """Interrompt le code lumineux et restaure l’état connu des phares."""
        self._light_cancel.set()
        conf = self._function_conf("headlights")
        relay = int(conf["relay"])
        record = self._add_record("lights_stop", relay, self._headlights_state, None, "sent")
        self._set_relay(relay, self._headlights_state)
        self._update_record_status(record, "completed")
        return record

    def play_combined_mode(self, mode: str) -> CommandRecord:
        """Joue un spectacle sûr limité au klaxon, aux phares et au scanner."""
        name = str(mode or "").strip().lower()
        mapping = {
            "sos": ("sos", "sos_super", False),
            "panique": ("panique", "panique", True),
            "demo": ("demo", "demo", True),
        }
        if name not in mapping:
            raise VehicleRelayError(f"Mode combiné inconnu : {mode}")
        if not self._combined_lock.acquire(blocking=False):
            record = self._add_record(f"combined_{name}", None, True, 10000, "error")
            self._update_record_status(record, "error", "Un mode combiné est déjà actif.")
            return record
        horn_pattern, light_pattern, animate_scanner = mapping[name]
        restore_scanner = self._scanner_state
        record = self._add_record(f"combined_{name}", None, True, 10000, "active")
        self._combined_cancel.clear()
        errors: list[str] = []

        def run(action) -> None:
            try:
                result = action()
                if result.status == "error":
                    errors.append(result.message or result.function)
            except Exception as exc:
                errors.append(str(exc))

        horn_thread = threading.Thread(target=run, args=(lambda: self.play_horn_pattern(horn_pattern),), daemon=True)
        light_thread = threading.Thread(target=run, args=(lambda: self.play_light_pattern(light_pattern),), daemon=True)
        horn_thread.start()
        light_thread.start()
        try:
            if animate_scanner:
                scanner_relay = int(self._function_conf("scanner")["relay"])
                deadline = time.monotonic() + 10.0
                scanner_on = False
                while time.monotonic() < deadline and not self._combined_cancel.wait(0.32):
                    scanner_on = not scanner_on
                    self._set_relay(scanner_relay, scanner_on)
            horn_thread.join(timeout=12.5)
            light_thread.join(timeout=12.5)
            if self._combined_cancel.is_set():
                self._update_record_status(record, "cancelled", "Mode combiné interrompu.")
            elif errors:
                self._update_record_status(record, "error", "; ".join(errors)[:300])
            else:
                self._update_record_status(record, "completed")
        finally:
            if animate_scanner:
                self._set_relay(int(self._function_conf("scanner")["relay"]), restore_scanner)
            self._combined_lock.release()
        return record

    def stop_combined_mode(self) -> CommandRecord:
        """Interrompt simultanément le klaxon, les phares et le scanner de démonstration."""
        self._combined_cancel.set()
        self._horn_cancel.set()
        self._light_cancel.set()
        self._set_relay(int(self._function_conf("horn")["relay"]), False)
        self._set_relay(int(self._function_conf("headlights")["relay"]), self._headlights_state)
        self._set_relay(int(self._function_conf("scanner")["relay"]), self._scanner_state)
        record = self._add_record("combined_stop", None, False, None, "completed")
        return record

    def stop_all_vehicle_relays(self) -> list[CommandRecord]:
        """Coupe tous les relais configurés et annule les commandes actives."""
        self._horn_cancel.set()
        self._light_cancel.set()
        self._combined_cancel.set()
        self._headlights_state = False
        cancelled: list[CommandRecord] = []
        with self._state_lock:
            for function, record in list(self._active_commands.items()):
                if record.status == "active":
                    record.status = "cancelled"
                    cancelled.append(record)

        self._ensure_relay_available()
        with self._hardware_lock:
            kwargs = self._relay_kwargs()
            kwargs["relay_count"] = self._installed_relay_count()
            with RelayController(
                **kwargs,
            ) as rc:
                rc.all_off()

        self._add_record(
            function="stop_all",
            relay=None,
            state=False,
            duration_ms=None,
            status="completed",
            message="Tous les relais véhicule ont été coupés.",
        )
        return cancelled

    def emergency_stop(self) -> list[CommandRecord]:
        """Alias de stop_all_vehicle_relays."""
        return self.stop_all_vehicle_relays()

    # ------------------------------------------------------------------
    # Diagnostic brut
    # ------------------------------------------------------------------
    def diagnostic_pulse(
        self,
        relay: int,
        duration_seconds: float,
    ) -> CommandRecord:
        """Pulse un relais brut pour le mode diagnostic.

        La durée est limitée à 10 s pour éviter tout dommage.
        """
        max_relays = int(self._board.get("relay_count", 16))
        if not 1 <= relay <= max_relays:
            raise VehicleRelayError(f"Numéro de relais invalide : {relay}")
        self._require_installed_relay(relay)
        duration_seconds = min(float(duration_seconds), 10.0)
        duration_ms = int(duration_seconds * 1000)
        record = self._add_record(
            function=f"diagnostic_relay_{relay}",
            relay=relay,
            state=True,
            duration_ms=duration_ms,
            status="sent",
        )
        try:
            self._pulse_relay(relay, duration_seconds)
            self._update_record_status(record, "completed")
        except Exception as exc:
            self._update_record_status(record, "error", str(exc))
            raise
        return record


# ------------------------------------------------------------------------------
# Instance globale
# ------------------------------------------------------------------------------
vehicle_service = VehicleRelayService()


def get_service() -> VehicleRelayService:
    return vehicle_service
