#!/usr/bin/env python3
"""Registre réseau partagé des Jetson Kyronext.

La source unique des adresses est config/jetson_fleet.json, ou le chemin donné
par KYRONEX_JETSON_NETWORK_CONFIG pour un test isolé.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "jetson_fleet.json"


class JetsonNetworkError(RuntimeError):
    """Configuration réseau absente ou invalide."""


def config_path() -> Path:
    override = os.environ.get("KYRONEX_JETSON_NETWORK_CONFIG", "").strip()
    return Path(override).expanduser() if override else DEFAULT_CONFIG_PATH


def load_registry() -> dict[str, Any]:
    path = config_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise JetsonNetworkError(f"registre Jetson illisible: {path}: {exc}") from exc
    if data.get("schema_version") != 1 or not isinstance(data.get("machines"), dict):
        raise JetsonNetworkError(f"schéma de registre Jetson invalide: {path}")

    urls: set[str] = set()
    for machine_id, machine in data["machines"].items():
        if not isinstance(machine, dict):
            raise JetsonNetworkError(f"machine invalide: {machine_id}")
        url = str(machine.get("base_url", "")).rstrip("/")
        parsed = urlparse(url)
        try:
            port = parsed.port
        except ValueError as exc:
            raise JetsonNetworkError(f"base_url invalide pour {machine_id}: {url}") from exc
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or port is None:
            raise JetsonNetworkError(f"base_url invalide pour {machine_id}: {url}")
        if url in urls:
            raise JetsonNetworkError(f"base_url dupliquée: {url}")
        urls.add(url)
        machine["base_url"] = url
    return data


def list_machines() -> dict[str, dict[str, Any]]:
    return load_registry()["machines"]


def get_machine(machine_id: str) -> dict[str, Any]:
    try:
        return list_machines()[machine_id].copy()
    except KeyError as exc:
        raise JetsonNetworkError(f"machine Jetson inconnue: {machine_id}") from exc


def get_base_url(machine_id: str) -> str:
    return str(get_machine(machine_id)["base_url"])


def get_host(machine_id: str) -> str:
    host = urlparse(get_base_url(machine_id)).hostname
    if not host:
        raise JetsonNetworkError(f"hôte introuvable pour {machine_id}")
    return host


def get_peers(local_machine_id: str, include_planned: bool = True) -> dict[str, dict[str, Any]]:
    peers = {}
    for machine_id, machine in list_machines().items():
        if machine_id == local_machine_id:
            continue
        if include_planned or machine.get("state") == "active":
            peers[machine_id] = machine.copy()
    return peers


def network_context(local_machine_id: str) -> str:
    machines = list_machines()
    local = machines.get(local_machine_id)
    if local is None:
        raise JetsonNetworkError(f"machine locale inconnue: {local_machine_id}")
    lines = [
        "\nRÉSEAU KYRONEXT PERSISTANT :",
        f"- Tu es enregistrée sous l'identifiant {local_machine_id} ({local['display_name']}).",
        "- Tu connais les autres Jetson et résous toujours leurs adresses via le registre central :",
    ]
    for machine_id, machine in machines.items():
        if machine_id == local_machine_id:
            continue
        state = "active" if machine.get("state") == "active" else "préparée, pas encore connectée"
        lines.append(f"- {machine_id}: {machine['display_name']} — {machine['base_url']} — {state}.")
    lines.append("- Pour toute communication inter-Jetson, utilise get_base_url(machine_id); ne mémorise aucune IP dans le code.")
    return "\n".join(lines)


def registry_snapshot(local_machine_id: str) -> dict[str, Any]:
    registry = load_registry()
    return {
        "schema_version": registry["schema_version"],
        "local_machine_id": local_machine_id,
        "local_machine": get_machine(local_machine_id),
        "peers": get_peers(local_machine_id),
    }


def _main() -> int:
    parser = argparse.ArgumentParser(description="Résolution du registre réseau Jetson")
    parser.add_argument("action", choices=("url", "host", "context", "list"))
    parser.add_argument("machine_id", nargs="?")
    args = parser.parse_args()
    if args.action in {"url", "host", "context"} and not args.machine_id:
        parser.error("machine_id est requis pour cette action")
    if args.action == "url":
        print(get_base_url(args.machine_id))
    elif args.action == "host":
        print(get_host(args.machine_id))
    elif args.action == "context":
        print(network_context(args.machine_id))
    else:
        print(json.dumps(load_registry(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
