"""Contrôleur Python pour les 16 relais KMTronic de Kyronex K-4000.

Périphérique attendu :
    KMTronic RS-485 USB Relay Box v1.2 (FTDI FT232R USB UART, VID:PID 0403:6001)
    Lien stable : /dev/kyronex-relays

Protocoles supportés :
    - kmtronic : commandes binaires FF RR SS (cartes KMTronic) [défaut]
    - lc_tech  : commandes binaires A0 RR SS CC (cartes LC Tech / SainSmart)
    - numato   : commandes texte (cartes Numato / clones)
    - icse     : commandes simples ICSE012A/013A/014A
    - generic  : 0xFF tout ON, 0x00 tout OFF (protocole minimal)

Usage simple :
    with RelayController() as rc:
        rc.set_relay(1, True)   # active le relais 1
        rc.set_relay(1, False)  # désactive le relais 1
        rc.all_off()            # sécurité : tout éteint
"""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Literal

import serial

try:
    from relay_setup import find_best_relay_port, list_relay_ports
    _SETUP_AVAILABLE = True
except Exception:  # pragma: no cover
    find_best_relay_port = None  # type: ignore[assignment]
    list_relay_ports = None  # type: ignore[assignment]
    _SETUP_AVAILABLE = False

logger = logging.getLogger(__name__)

RelayProtocol = Literal["lc_tech", "kmtronic", "numato", "icse", "generic"]

DEFAULT_PORT = os.getenv("KYRONEXT_RELAY_PORT", "/dev/kyronex-relays")
# Compatibilité après disparition du lien udev historique : le lien by-id est
# stable pour cette carte FTDI et évite de retomber sur ttyUSB0/ttyUSB1.
if not Path(DEFAULT_PORT).exists():
    _stable_ftdi_port = "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_AL03EICJ-if00-port0"
    if Path(_stable_ftdi_port).exists():
        DEFAULT_PORT = _stable_ftdi_port
DEFAULT_BAUDRATE = int(os.getenv("KYRONEXT_RELAY_BAUDRATE", "9600"))
DEFAULT_PROTOCOL: RelayProtocol = "kmtronic"  # type: ignore[assignment]
DEFAULT_VID = os.getenv("KYRONEXT_RELAY_VID", "0403")
DEFAULT_PID = os.getenv("KYRONEXT_RELAY_PID", "6001")
DEFAULT_VID_PID = f"{DEFAULT_VID}:{DEFAULT_PID}"
DEFAULT_RELAY_COUNT = int(os.getenv("KYRONEXT_RELAY_COUNT", "16"))

_PORT_LOCKS: dict[str, threading.RLock] = {}
_PORT_LOCKS_GUARD = threading.Lock()


def _port_lock(port: str) -> threading.RLock:
    with _PORT_LOCKS_GUARD:
        return _PORT_LOCKS.setdefault(port, threading.RLock())


@dataclass(frozen=True)
class RelayDeviceInfo:
    port: str
    baudrate: int
    protocol: RelayProtocol
    vid_pid: str | None = None
    serial_number: str | None = None


class RelayError(Exception):
    """Erreur liée au contrôleur de relais."""


class RelayController:
    """Contrôleur haut niveau pour une chaîne KMTronic de 8 à 16 relais."""

    PROTOCOLS: tuple[RelayProtocol, ...] = ("lc_tech", "kmtronic", "numato", "icse", "generic")

    def __init__(
        self,
        port: str = DEFAULT_PORT,
        baudrate: int = DEFAULT_BAUDRATE,
        protocol: RelayProtocol | None = None,
        timeout: float = 0.5,
        auto_detect: bool = False,
        relay_count: int = DEFAULT_RELAY_COUNT,
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.relay_count = relay_count
        self._protocol: RelayProtocol = protocol or DEFAULT_PROTOCOL
        self._serial: serial.Serial | None = None
        self._lock = _port_lock(port)
        self._owns_lock = False

        self._lock.acquire()
        self._owns_lock = True
        try:
            self._open()
        except Exception:
            self._owns_lock = False
            self._lock.release()
            raise

        if protocol is None and auto_detect:
            detected = self._autodetect_protocol()
            if detected != self._protocol:
                logger.info("Protocole détecté : %s", detected)
                self._protocol = detected

    # ------------------------------------------------------------------
    # Gestion du port série
    # ------------------------------------------------------------------
    def _open(self) -> None:
        try:
            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=self.timeout,
                write_timeout=self.timeout,
            )
        except serial.SerialException as exc:
            raise RelayError(
                f"Impossible d'ouvrir {self.port}. "
                "Vérifiez que la carte est branchée et la règle udev active."
            ) from exc

        # Certains modules FTDI ont un buffer hardware ; on vide à l'ouverture.
        self._serial.reset_input_buffer()
        self._serial.reset_output_buffer()
        time.sleep(0.05)

    def close(self) -> None:
        """Ferme proprement le port série (tous les relais restent dans leur état)."""
        if self._serial is not None and self._serial.is_open:
            try:
                self._serial.close()
            except Exception as exc:  # pragma: no cover
                logger.warning("Erreur à la fermeture du port série : %s", exc)
            finally:
                self._serial = None
        if self._owns_lock:
            self._owns_lock = False
            self._lock.release()

    def __enter__(self) -> "RelayController":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Propriétés
    # ------------------------------------------------------------------
    @property
    def protocol(self) -> RelayProtocol:
        return self._protocol

    @property
    def info(self) -> RelayDeviceInfo:
        vid_pid = DEFAULT_VID_PID
        serial_number = None
        if _SETUP_AVAILABLE and list_relay_ports is not None:
            for p in list_relay_ports():
                if p.device == self.port:
                    if p.vid and p.pid:
                        vid_pid = f"{p.vid}:{p.pid}"
                    serial_number = p.serial_number
                    break
        return RelayDeviceInfo(
            port=self.port,
            baudrate=self.baudrate,
            protocol=self._protocol,
            vid_pid=vid_pid,
            serial_number=serial_number,
        )

    @classmethod
    def list_compatible_ports(cls) -> list[dict]:
        """Liste les ports série compatibles avec une carte relais USB.

        N'ouvre aucun port et ne commande aucun relais.
        """
        if not _SETUP_AVAILABLE or list_relay_ports is None:
            return []
        return [p._asdict() for p in list_relay_ports() if p.is_known]

    @classmethod
    def detect_port(cls) -> str | None:
        """Retourne le meilleur port relais détecté, ou None."""
        if not _SETUP_AVAILABLE or find_best_relay_port is None:
            return None
        port = find_best_relay_port()
        return port.device if port else None

    # ------------------------------------------------------------------
    # Auto-détection
    # ------------------------------------------------------------------
    def _autodetect_protocol(self) -> RelayProtocol:
        """Tente d'identifier le protocole par une requête de statut.

        Les cartes qui répondent (Numato, certaines KMTronic) sont privilégiées.
        Pour les cartes muettes, le protocole KMTronic est utilisé par défaut
        car le matériel identifié est une carte KMTronic RS-485 USB Relay Box.
        """
        logger.debug("Tentative d'auto-détection du protocole...")

        # 1. Numato : requête texte avec réponse explicite.
        if self._probe_numato():
            return "numato"

        # Ne jamais "sonder" KMTronic avec FF 08 00 : cette trame coupe
        # réellement le relais 8. Le matériel installé est connu et KMTronic
        # reste donc le choix passif par défaut.
        logger.debug("Aucune identification passive ; utilisation de kmtronic par défaut.")
        return "kmtronic"

    def _read_response(self, max_bytes: int = 256, deadline: float = 0.3) -> bytes:
        """Lit une réponse brute du périphérique avec timeout court."""
        if self._serial is None:
            return b""
        deadline_ts = time.monotonic() + deadline
        chunks: list[bytes] = []
        while time.monotonic() < deadline_ts:
            available = self._serial.in_waiting
            if available:
                chunk = self._serial.read(min(available, max_bytes - sum(len(c) for c in chunks)))
                if chunk:
                    chunks.append(chunk)
            if chunks and self._serial.in_waiting == 0:
                break
            time.sleep(0.01)
        return b"".join(chunks)

    def _probe_numato(self) -> bool:
        try:
            self._serial.write(b"relay readall\r")
            self._serial.flush()
            time.sleep(0.1)
            resp = self._read_response()
            if resp and (b"00000000" in resp or b"11111111" in resp or b"relay" in resp.lower()):
                logger.info("Réponse Numato détectée : %r", resp)
                return True
        except Exception as exc:
            logger.debug("Échec sonde Numato : %s", exc)
        return False

    def _probe_kmtronic(self) -> bool:
        """Compatibilité API : aucune sonde active n'est autorisée."""
        return False

    # ------------------------------------------------------------------
    # Commandes relais
    # ------------------------------------------------------------------
    def set_relay(self, relay: int, state: bool) -> None:
        """Change l'état d'un relais adressable.

        Args:
            relay: numéro du relais, de 1 à relay_count.
            state: True pour activer, False pour désactiver.
        """
        if not 1 <= relay <= self.relay_count:
            raise RelayError(f"Numéro de relais invalide : {relay} (attendu 1-{self.relay_count})")

        data = self._build_command(relay, state)
        logger.debug("set_relay relay=%s state=%s protocol=%s cmd=%s",
                     relay, state, self._protocol, data.hex())
        self._write(data)
        # Laisser le temps au relais mécanique de commuter.
        time.sleep(0.02)

    def pulse_relay(self, relay: int, duration: float, state: bool = True) -> None:
        """Active un relais pendant un temps donné, puis le désactive.

        Le relais est toujours remis à l'arrêt, même si une interruption
        survient pendant le délai. Cette méthode est utile pour protéger
        les actionneurs (démarreur, vitres, coffre, etc.).

        Args:
            relay: numéro du relais, de 1 à relay_count.
            duration: durée d'activation en secondes.
            state: état à appliquer pendant la durée (défaut : True).
        """
        if not 1 <= relay <= self.relay_count:
            raise RelayError(f"Numéro de relais invalide : {relay} (attendu 1-{self.relay_count})")
        if duration <= 0:
            raise RelayError(f"Durée d'impulsion invalide : {duration}")

        logger.info("Pulse relais %s pendant %.2f s", relay, duration)
        try:
            self.set_relay(relay, state)
            time.sleep(duration)
        finally:
            self.set_relay(relay, False)
            logger.info("Pulse relais %s terminé, relais coupé", relay)

    def all_on(self) -> None:
        """Active tous les relais configurés."""
        logger.info("Activation de tous les relais")
        for relay in range(1, self.relay_count + 1):
            self.set_relay(relay, True)

    def all_off(self) -> None:
        """Désactive tous les relais configurés (position sûre par défaut)."""
        logger.info("Désactivation de tous les relais")
        for relay in range(1, self.relay_count + 1):
            self.set_relay(relay, False)

    def cycle_relays(self, delay: float = 0.5) -> None:
        """Fait commuter les relais configurés un par un (test matériel)."""
        logger.info("Séquence de test : un relais à la fois")
        self.all_off()
        for relay in range(1, self.relay_count + 1):
            self.set_relay(relay, True)
            time.sleep(delay)
            self.set_relay(relay, False)
            time.sleep(delay / 2)
        self.all_off()

    # ------------------------------------------------------------------
    # Construction des trames
    # ------------------------------------------------------------------
    def _build_command(self, relay: int, state: bool) -> bytes:
        builders = {
            "lc_tech": self._build_lc_tech,
            "kmtronic": self._build_kmtronic,
            "numato": self._build_numato,
            "icse": self._build_icse,
            "generic": self._build_generic,
        }
        return builders[self._protocol](relay, state)

    @staticmethod
    def _build_lc_tech(relay: int, state: bool) -> bytes:
        # Format : [0xA0] [relay] [state] [checksum]
        # checksum = 0xA0 + relay + state
        st = 0x01 if state else 0x00
        checksum = (0xA0 + relay + st) & 0xFF
        return bytes([0xA0, relay, st, checksum])

    @staticmethod
    def _build_kmtronic(relay: int, state: bool) -> bytes:
        return bytes([0xFF, relay, 0x01 if state else 0x00])

    def _build_numato(self, relay: int, state: bool) -> bytes:
        cmd = f"relay {'on' if state else 'off'} {relay - 1}\r"
        return cmd.encode("ascii")

    @staticmethod
    def _build_icse(relay: int, state: bool) -> bytes:
        # ICSE012A/013A : 0x50-0x57 pour ON, 0x58-0x5F pour OFF (relays 1-8)
        base_on = 0x50
        base_off = 0x58
        return bytes([base_on + relay - 1 if state else base_off + relay - 1])

    @staticmethod
    def _build_generic(relay: int, state: bool) -> bytes:
        # Protocole minimal : un octet de masque.
        if relay == 0:
            return bytes([0xFF if state else 0x00])
        mask = 1 << (relay - 1)
        return bytes([mask if state else 0x00])

    # ------------------------------------------------------------------
    # Écriture série bas niveau
    # ------------------------------------------------------------------
    def _write(self, data: bytes) -> None:
        if self._serial is None or not self._serial.is_open:
            raise RelayError("Port série fermé")
        self._serial.reset_input_buffer()
        self._serial.write(data)
        self._serial.flush()


# ------------------------------------------------------------------------------
# API fonctionnelle légère (peut être importée directement par Kyronex)
# ------------------------------------------------------------------------------
def set_relay(relay: int, state: bool, **kwargs) -> None:
    """Ouvre le contrôleur, change un relais, puis ferme."""
    with RelayController(**kwargs) as rc:
        rc.set_relay(relay, state)


def all_off(**kwargs) -> None:
    """Ouvre le contrôleur, éteint tous les relais, puis ferme."""
    with RelayController(**kwargs) as rc:
        rc.all_off()


def all_on(**kwargs) -> None:
    """Ouvre le contrôleur, allume tous les relais, puis ferme."""
    with RelayController(**kwargs) as rc:
        rc.all_on()
