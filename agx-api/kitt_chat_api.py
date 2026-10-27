"""Invite-only, in-memory community chat endpoints for KYRONEXT aiohttp."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import time
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass, field
from collections.abc import Awaitable, Callable
from typing import Any

from aiohttp import WSMsgType, web

ROOMS = [
    {"id": "general", "label": "Le grand salon", "topic": "Le rendez-vous de toute la communauté"},
    {"id": "atelier", "label": "Garage & répliques", "topic": "Pontiac, restauration et KITT"},
    {"id": "electronique", "label": "Électronique", "topic": "LED, capteurs et projets maison"},
    {"id": "radio", "label": "Radio KITT", "topic": "Musique et souvenirs de la série"},
]
_ROOM_IDS = {room["id"] for room in ROOMS}
_INVITES: dict[str, dict[str, Any]] = {}  # SHA-256 -> assigned member + expiry; single-use and memory-only.
_SESSIONS: dict[str, dict[str, Any]] = {}  # SHA-256 -> member name and expiry.
_CLIENTS: dict[int, "Client"] = {}
_HISTORY: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=100))
_JOIN_ATTEMPTS: dict[str, list[float]] = {}
_LOCK = asyncio.Lock()
_TOKEN_TTL = 30 * 24 * 3600
_INVITE_TTL = 7 * 24 * 3600
_JOIN_RATE_WINDOW = 3600
_JOIN_RATE_MAX = 10
_GUEST_RATE_WINDOW = 600
_GUEST_RATE_MAX = 30
_GUEST_MAX = 50
_NAME_MAX = 48
_TEXT_MAX = 500
_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
_GUEST_ATTEMPTS: dict[str, list[float]] = {}


@dataclass
class Client:
    ws: web.WebSocketResponse
    token_hash: str
    name: str
    room: str
    is_guest: bool = False
    sent: deque[float] = field(default_factory=deque)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _cors(response: web.StreamResponse) -> web.StreamResponse:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Admin-Token"
    response.headers["Vary"] = "Origin"
    return response


def _clean_text(value: Any, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    value = "".join(ch for ch in value if unicodedata.category(ch)[0] != "C")
    return " ".join(value.split())[:maximum]


def _join_rate_key(request: web.Request) -> str:
    """Keep only a validated address in memory; never persist or log it here."""
    candidate = request.headers.get("CF-Connecting-IP", "").strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return request.remote or "unknown"


def _join_rate_limited(request: web.Request) -> bool:
    now = time.monotonic()
    cutoff = now - _JOIN_RATE_WINDOW
    for address, attempts in list(_JOIN_ATTEMPTS.items()):
        active = [stamp for stamp in attempts if stamp > cutoff]
        if active:
            _JOIN_ATTEMPTS[address] = active
        else:
            _JOIN_ATTEMPTS.pop(address, None)
    address = _join_rate_key(request)
    attempts = _JOIN_ATTEMPTS.setdefault(address, [])
    if len(attempts) >= _JOIN_RATE_MAX:
        return True
    attempts.append(now)
    return False


def _online(room: str) -> list[dict[str, str]]:
    return [{"name": client.name} for client in _CLIENTS.values() if client.room == room and not client.is_guest]


async def _send(client: Client, packet: dict[str, Any]) -> bool:
    try:
        await client.ws.send_json(packet)
        return True
    except (ConnectionError, RuntimeError, asyncio.CancelledError):
        return False


async def _broadcast(room: str, packet: dict[str, Any]) -> None:
    stale: list[int] = []
    for key, client in list(_CLIENTS.items()):
        if client.room == room and not await _send(client, packet):
            stale.append(key)
    for key in stale:
        _CLIENTS.pop(key, None)


async def _presence(room: str) -> None:
    await _broadcast(room, {"type": "presence", "members": _online(room)})


def _guest_rate_limited(request: web.Request) -> bool:
    now = time.monotonic()
    cutoff = now - _GUEST_RATE_WINDOW
    for address, attempts in list(_GUEST_ATTEMPTS.items()):
        active = [stamp for stamp in attempts if stamp > cutoff]
        if active:
            _GUEST_ATTEMPTS[address] = active
        else:
            _GUEST_ATTEMPTS.pop(address, None)
    address = _join_rate_key(request)
    attempts = _GUEST_ATTEMPTS.setdefault(address, [])
    if len(attempts) >= _GUEST_RATE_MAX:
        return True
    attempts.append(now)
    return False


def register_kitt_chat_routes(
    app: web.Application,
    *,
    admin_token: str,
    owner_lookup: Callable[[str], Awaitable[dict[str, str] | None]],
) -> None:
    async def status(_request: web.Request) -> web.Response:
        return _cors(web.json_response({
            "online": True, "rooms": ROOMS, "guestViewOnly": True, "ownerPhotosRequired": True,
        }))

    async def create_invitation(request: web.Request) -> web.Response:
        given = request.headers.get("X-Admin-Token", "")
        if not admin_token or not hmac.compare_digest(given.encode(), admin_token.encode()):
            return _cors(web.json_response({"ok": False, "error": "Acces administrateur requis."}, status=401))
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise ValueError
            owner_id = _clean_text(body.get("ownerId"), 64)
        except Exception:
            return _cors(web.json_response({"ok": False, "error": "Selectionne un profil Pontiac valide."}, status=400))
        owner = await owner_lookup(owner_id)
        if not owner:
            return _cors(web.json_response({"ok": False, "error": "Ce profil n'est pas valide avec une photo sur le globe."}, status=403))
        name = _clean_text(owner.get("name"), _NAME_MAX)
        if not 2 <= len(name) <= _NAME_MAX:
            return _cors(web.json_response({"ok": False, "error": "Le nom du profil valide doit faire 2 a 24 caracteres."}, status=400))
        now = time.time()
        for token, invitation in list(_INVITES.items()):
            if invitation["expires"] <= now:
                _INVITES.pop(token, None)
        if len(_INVITES) >= 250:
            return _cors(web.json_response({"ok": False, "error": "Trop d'invitations actives."}, status=429))
        code = secrets.token_urlsafe(15)
        _INVITES[_digest(code)] = {"ownerId": owner_id, "name": name, "expires": now + _INVITE_TTL}
        return _cors(web.json_response({
            "ok": True, "code": code, "ownerId": owner_id, "name": name,
            "expiresInSeconds": _INVITE_TTL,
        }, status=201))

    async def join(request: web.Request) -> web.Response:
        if _join_rate_limited(request):
            return _cors(web.json_response({"ok": False, "error": "Trop de tentatives. Reessaie plus tard."}, status=429))
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise ValueError
            invite = _clean_text(body.get("invite"), 100)
            owner_id = _clean_text(body.get("ownerId"), 64)
        except Exception:
            return _cors(web.json_response({"ok": False, "error": "Requete invalide."}, status=400))
        if not invite or not owner_id:
            return _cors(web.json_response({"ok": False, "error": "Invitation et profil Pontiac valide requis."}, status=400))
        owner = await owner_lookup(owner_id)
        if not owner:
            return _cors(web.json_response({"ok": False, "error": "Le profil Pontiac doit etre valide avec une photo sur le globe."}, status=403))
        name = _clean_text(owner.get("name"), _NAME_MAX)
        if not 2 <= len(name) <= _NAME_MAX:
            return _cors(web.json_response({"ok": False, "error": "Le nom du profil Pontiac est invalide."}, status=403))
        invite_hash = _digest(invite)
        async with _LOCK:
            invitation = _INVITES.get(invite_hash)
            if invitation is None or invitation["expires"] < time.time():
                _INVITES.pop(invite_hash, None)
                return _cors(web.json_response({"ok": False, "error": "Code invalide, expire ou deja utilise."}, status=403))
            if invitation["ownerId"] != owner_id or invitation["name"].casefold() != name.casefold():
                return _cors(web.json_response({"ok": False, "error": "Ce code appartient a un autre profil Pontiac."}, status=403))
            for token_hash, session in list(_SESSIONS.items()):
                if session["expires"] < time.time():
                    _SESSIONS.pop(token_hash, None)
            if any(session["name"].casefold() == name.casefold() for session in _SESSIONS.values()):
                return _cors(web.json_response({"ok": False, "error": "Ce pseudo est actuellement utilise."}, status=409))
            if len(_SESSIONS) >= 500:
                return _cors(web.json_response({"ok": False, "error": "Capacite de membres atteinte."}, status=503))
            token = secrets.token_urlsafe(32)
            _SESSIONS[_digest(token)] = {
                "ownerId": owner_id, "name": name, "expires": time.time() + _TOKEN_TTL,
            }
            _INVITES.pop(invite_hash, None)
        return _cors(web.json_response({
            "ok": True, "token": token, "ownerId": owner_id, "name": name,
            "expiresInSeconds": _TOKEN_TTL,
        }, status=201))

    async def websocket(request: web.Request) -> web.StreamResponse:
        if _guest_rate_limited(request):
            return _cors(web.Response(status=429, text="Too many guest connections"))
        ws = web.WebSocketResponse(heartbeat=25, max_msg_size=4096, compress=False)
        await ws.prepare(request)
        try:
            first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        except (asyncio.TimeoutError, ValueError, TypeError):
            await ws.close(code=4001, message=b"Authentication required")
            return ws
        if not isinstance(first, dict):
            await ws.close(code=4001, message=b"Authentication required")
            return ws
        room = first.get("room", "general")
        if not isinstance(room, str) or room not in _ROOM_IDS:
            await ws.close(code=4001, message=b"Invalid room")
            return ws
        is_guest = first.get("type") == "guest"
        token_hash = ""
        if is_guest:
            name = "Visiteur"
        else:
            if first.get("type") != "auth":
                await ws.close(code=4001, message=b"Authentication required")
                return ws
            raw_token = first.get("token", "")
            if not isinstance(raw_token, str) or not _TOKEN_PATTERN.fullmatch(raw_token):
                await ws.close(code=4001, message=b"Invalid session")
                return ws
            token_hash = _digest(raw_token)
            session = _SESSIONS.get(token_hash)
            if not session or session["expires"] < time.time():
                _SESSIONS.pop(token_hash, None)
                await ws.close(code=4001, message=b"Session expired")
                return ws
            owner = await owner_lookup(session.get("ownerId", ""))
            if not owner or owner.get("name", "").casefold() != session["name"].casefold():
                _SESSIONS.pop(token_hash, None)
                await ws.close(code=4001, message=b"Owner profile is no longer approved")
                return ws
            name = session["name"]
        client = Client(ws=ws, token_hash=token_hash, name=name, room=room, is_guest=is_guest)
        key = id(ws)
        async with _LOCK:
            if not is_guest and any(c.name.casefold() == client.name.casefold() for c in _CLIENTS.values() if not c.is_guest):
                await ws.close(code=4002, message=b"Name already online")
                return ws
            if len(_CLIENTS) >= 80:
                await ws.close(code=1013, message=b"Room full")
                return ws
            if is_guest and sum(1 for c in _CLIENTS.values() if c.is_guest) >= _GUEST_MAX:
                await ws.close(code=1013, message=b"Guest preview is full")
                return ws
            _CLIENTS[key] = client
            history = list(_HISTORY[room])
            if is_guest:
                history = history[-30:]
            await ws.send_json({
                "type": "ready", "room": room, "history": history,
                "members": _online(room), "member": not is_guest,
            })
            if not is_guest:
                line = {
                    "id": secrets.token_hex(8), "name": "KITT",
                    "text": f"{client.name} entre dans le salon.",
                    "timestamp": int(time.time() * 1000), "kind": "system",
                }
                _HISTORY[room].append(line)
            else:
                line = None
        if line:
            await _broadcast(room, {"type": "message", "message": line})
            await _presence(room)
        try:
            async for packet in ws:
                if packet.type != WSMsgType.TEXT:
                    continue
                try:
                    data = json.loads(packet.data)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                if data.get("type") == "switch":
                    target = data.get("room")
                    if not isinstance(target, str) or target not in _ROOM_IDS:
                        continue
                    previous = client.room
                    if previous == target:
                        continue
                    client.room = target
                    if not client.is_guest:
                        await _presence(previous)
                    history = list(_HISTORY[target])
                    await ws.send_json({"type": "room", "room": target, "history": history[-30:] if client.is_guest else history})
                    if not client.is_guest:
                        await _presence(target)
                    continue
                if data.get("type") != "message":
                    continue
                if client.is_guest:
                    await ws.send_json({"type": "error", "message": "Mode visiteur : lecture seule. Inscris une Pontiac sur le globe pour participer."})
                    continue
                now_mono = time.monotonic()
                while client.sent and client.sent[0] < now_mono - 10:
                    client.sent.popleft()
                if len(client.sent) >= 8:
                    await ws.send_json({"type": "error", "message": "Ralentis un instant avant d'envoyer un autre message."})
                    continue
                text = _clean_text(data.get("text"), _TEXT_MAX)
                if not text:
                    continue
                client.sent.append(now_mono)
                line = {
                    "id": secrets.token_hex(8), "name": client.name, "text": text,
                    "timestamp": int(time.time() * 1000), "kind": "message",
                }
                _HISTORY[client.room].append(line)
                await _broadcast(client.room, {"type": "message", "message": line})
        finally:
            if _CLIENTS.pop(key, None) is not None and not client.is_guest:
                line = {
                    "id": secrets.token_hex(8), "name": "KITT",
                    "text": f"{client.name} quitte le salon.",
                    "timestamp": int(time.time() * 1000), "kind": "system",
                }
                _HISTORY[client.room].append(line)
                await _broadcast(client.room, {"type": "message", "message": line})
                await _presence(client.room)
        return ws

    async def options(_request: web.Request) -> web.Response:
        return _cors(web.Response(status=204))

    app.router.add_get("/api/kitt-chat/status", status)
    app.router.add_post("/api/kitt-chat/join", join)
    app.router.add_post("/api/kitt-chat/invitations", create_invitation)
    app.router.add_get("/api/kitt-chat/ws", websocket)
    app.router.add_route("OPTIONS", "/api/kitt-chat/join", options)
    app.router.add_route("OPTIONS", "/api/kitt-chat/invitations", options)
