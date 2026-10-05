"""KYRONEXT LINK presence and WebRTC signalling (LAN/Tailscale only)."""
from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import time
import uuid
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

BASE = Path(__file__).parent
CONFIG_PATH = Path(os.environ.get("KYRONEXT_LINK_CONFIG", BASE / "kyronext_link_config.json"))
TRANSPONDER_PATH = Path(os.environ.get("KYRONEXT_TRANSPONDER_STATE", BASE / "kyronext_transponder.json"))
ALLOWED_STATES = {"online", "offline", "busy", "in-call"}
SIGNAL_TYPES = {"invite", "accept", "reject", "hangup", "offer", "answer", "ice"}
STALE_AFTER = 45
LOCATION_STALE_AFTER = 3600
NATIVE_CONTROL = "http://127.0.0.1:45828"


def _load_config() -> dict:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    data.setdefault("local_node", "kitt-manix")
    data.setdefault("shared_token", os.environ.get("KYRONEXT_LINK_TOKEN", ""))
    data.setdefault("nodes", [])
    return data


CONFIG = _load_config()
LOCAL_NODE = str(CONFIG["local_node"])
NODES = {str(item.get("id")): dict(item) for item in CONFIG["nodes"] if item.get("id")}
PRESENCE: dict[str, dict] = {}
CLIENTS: dict[web.WebSocketResponse, dict] = {}


def _load_transponder() -> bool:
    try:
        return bool(json.loads(TRANSPONDER_PATH.read_text(encoding="utf-8")).get("enabled", True))
    except Exception:
        return True


def _save_transponder(enabled: bool) -> None:
    tmp = TRANSPONDER_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps({"enabled": bool(enabled), "updated_at": time.time()}), encoding="utf-8")
    tmp.replace(TRANSPONDER_PATH)


TRANSPONDER_ENABLED = _load_transponder()


def _peer_ip(request: web.Request) -> str:
    peer = request.transport.get_extra_info("peername") if request.transport else None
    return str(peer[0]).split("%", 1)[0] if peer else ""


def _allowed(request: web.Request) -> bool:
    token = request.headers.get("X-Kyronext-Link-Token", "") or request.query.get("token", "")
    configured = str(CONFIG.get("shared_token", ""))
    if configured and token and __import__("hmac").compare_digest(token, configured):
        return True
    try:
        ip = ipaddress.ip_address(_peer_ip(request))
        return ip.is_private or ip.is_loopback or ip in ipaddress.ip_network("100.64.0.0/10")
    except ValueError:
        return False


def _clean_location(data: dict) -> dict:
    try:
        lat, lon = float(data.get("lat")), float(data.get("lon"))
    except (TypeError, ValueError):
        return {}
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return {}
    try:
        accuracy = max(0.0, min(float(data.get("accuracy", 0) or 0), 500000.0))
    except (TypeError, ValueError):
        accuracy = 0.0
    source = str(data.get("location_source") or data.get("source") or "network").lower()
    if source not in {"gps", "network", "configured"}:
        source = "network"
    label = str(data.get("location_label") or data.get("label") or "")[:120]
    return {"lat": lat, "lon": lon, "accuracy": accuracy, "location_source": source,
            "location_label": label, "location_at": time.time()}


def _node_view(node_id: str) -> dict:
    cfg = NODES.get(node_id, {"id": node_id, "name": node_id, "country": ""})
    live = PRESENCE.get(node_id, {})
    age = time.time() - float(live.get("last_seen", 0))
    enabled = bool(cfg.get("enabled", True))
    state = live.get("state", "offline") if enabled and age <= STALE_AFTER else "offline"
    lat = live.get("lat")
    lon = live.get("lon")
    location_source = live.get("location_source", "")
    location_label = live.get("location_label", "")
    accuracy = live.get("accuracy")
    transponder_enabled = bool(live.get("transponder_enabled", TRANSPONDER_ENABLED if node_id == LOCAL_NODE else True))
    if not transponder_enabled:
        lat = lon = accuracy = None
        location_source = location_label = ""
    elif lat is None or lon is None:
        lat, lon = cfg.get("lat"), cfg.get("lon")
        if lat is not None and lon is not None:
            location_source = "configured"
            location_label = cfg.get("approximate_location", "")
            accuracy = cfg.get("accuracy", 50000)
    return {
        "id": node_id, "name": cfg.get("name", node_id), "owner": cfg.get("owner", ""),
        "country": cfg.get("country", ""), "flag": cfg.get("flag", ""),
        "state": state, "enabled": enabled,
        "location_mode": cfg.get("location_mode", "hidden"),
        "approximate_location": cfg.get("approximate_location", "") if cfg.get("location_mode") == "approximate" else "",
        "map_x": cfg.get("map_x") if cfg.get("location_mode") == "approximate" else None,
        "map_y": cfg.get("map_y") if cfg.get("location_mode") == "approximate" else None,
        "lat": lat, "lon": lon, "accuracy": accuracy,
        "location_source": location_source, "location_label": location_label,
        "transponder_enabled": transponder_enabled,
        "last_seen": live.get("last_seen") if state != "offline" else None,
    }


async def _broadcast(node_id: str, payload: dict) -> None:
    dead = []
    for ws, info in tuple(CLIENTS.items()):
        if info.get("node_id") == node_id and not ws.closed:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
    for ws in dead:
        CLIENTS.pop(ws, None)


async def presence(request: web.Request) -> web.Response:
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    nodes = [_node_view(node_id) for node_id in NODES]
    return web.json_response({"protocol": "kyronext-link/1", "local_node": LOCAL_NODE, "stale_after": STALE_AFTER, "nodes": nodes})


async def heartbeat(request: web.Request) -> web.Response:
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400)
    node_id = str(body.get("node_id", ""))[:48]
    if node_id not in NODES:
        return web.json_response({"error": "unknown node"}, status=404)
    state = str(body.get("state", "online"))
    if state not in ALLOWED_STATES:
        return web.json_response({"error": "invalid state"}, status=400)
    loc = _clean_location(body)
    previous = PRESENCE.get(node_id, {})
    transponder_enabled = body.get("transponder_enabled", previous.get("transponder_enabled", True)) is not False
    record = {"state": state, "last_seen": time.time(), "source": _peer_ip(request), "transponder_enabled": transponder_enabled}
    for key in ("lat", "lon", "accuracy", "location_source", "location_label", "location_at"):
        if key in loc:
            record[key] = loc[key]
        elif key in previous:
            record[key] = previous[key]
    if not transponder_enabled:
        for key in ("lat", "lon", "accuracy", "location_source", "location_label", "location_at"):
            record.pop(key, None)
    PRESENCE[node_id] = record
    await _broadcast(node_id, {"type": "presence", "node": _node_view(node_id)})
    return web.json_response({"ok": True, "node": _node_view(node_id)})


async def location_update(request: web.Request) -> web.Response:
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400)
    if not TRANSPONDER_ENABLED:
        return web.json_response({"error": "transponder disabled", "enabled": False}, status=409)
    loc = _clean_location(body)
    if not loc:
        return web.json_response({"error": "invalid location"}, status=400)
    current = dict(PRESENCE.get(LOCAL_NODE, {}))
    current.update(loc)
    current["state"] = current.get("state", "online")
    current["last_seen"] = time.time()
    PRESENCE[LOCAL_NODE] = current
    await _broadcast(LOCAL_NODE, {"type": "presence", "node": _node_view(LOCAL_NODE)})
    return web.json_response({"ok": True, "node": _node_view(LOCAL_NODE)})


async def transponder(request: web.Request) -> web.Response:
    global TRANSPONDER_ENABLED
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        TRANSPONDER_ENABLED = body.get("enabled") is True
        _save_transponder(TRANSPONDER_ENABLED)
        current = dict(PRESENCE.get(LOCAL_NODE, {}))
        current["transponder_enabled"] = TRANSPONDER_ENABLED
        current["last_seen"] = time.time()
        if not TRANSPONDER_ENABLED:
            for key in ("lat", "lon", "accuracy", "location_source", "location_label", "location_at"):
                current.pop(key, None)
        PRESENCE[LOCAL_NODE] = current
        await _broadcast(LOCAL_NODE, {"type": "presence", "node": _node_view(LOCAL_NODE)})
    return web.json_response({"ok": True, "enabled": TRANSPONDER_ENABLED, "mode": "gps_transponder"})


async def _network_location() -> dict:
    try:
        async with ClientSession(timeout=ClientTimeout(total=5)) as session:
            async with session.get("https://ipwho.is/") as resp:
                if resp.status != 200:
                    return {}
                data = await resp.json()
        if not data.get("success", True):
            return {}
        label = ", ".join(x for x in [data.get("city"), data.get("region"), data.get("country")] if x)
        return _clean_location({"lat": data.get("latitude"), "lon": data.get("longitude"),
                                "accuracy": 30000, "location_source": "network",
                                "location_label": label})
    except Exception:
        return {}


def _clean_signal(body: dict) -> dict | None:
    kind = str(body.get("type", ""))
    source, target = str(body.get("source", ""))[:48], str(body.get("target", ""))[:48]
    if kind not in SIGNAL_TYPES or source not in NODES or target not in NODES:
        return None
    payload = body.get("payload", {})
    if not isinstance(payload, dict) or len(json.dumps(payload)) > 131072:
        return None
    return {"protocol": "kyronext-link/1", "type": kind, "source": source, "target": target,
            "call_id": re.sub(r"[^a-zA-Z0-9_-]", "", str(body.get("call_id", "")))[:64] or uuid.uuid4().hex,
            "payload": payload, "ts": int(time.time() * 1000)}


async def _deliver_or_forward(signal: dict) -> tuple[bool, str]:
    target = signal["target"]
    if target == LOCAL_NODE:
        await _broadcast(target, signal)
        return True, "local"
    cfg = NODES.get(target, {})
    base = str(cfg.get("api_base", "")).rstrip("/")
    if not base:
        return False, "target unavailable"
    headers = {"X-Kyronext-Link-Forwarded": "1"}
    token = str(CONFIG.get("shared_token", ""))
    if token:
        headers["X-Kyronext-Link-Token"] = token
    try:
        async with ClientSession(timeout=ClientTimeout(total=4)) as session:
            async with session.post(base + "/api/link/signal", json=signal, headers=headers) as response:
                return response.status < 300, f"peer HTTP {response.status}"
    except Exception as exc:
        return False, type(exc).__name__


async def signal(request: web.Request) -> web.Response:
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    try:
        clean = _clean_signal(await request.json())
    except Exception:
        clean = None
    if not clean:
        return web.json_response({"error": "invalid signal"}, status=400)
    # A forwarded message must terminate here; this prevents relay loops.
    if request.headers.get("X-Kyronext-Link-Forwarded") == "1" and clean["target"] != LOCAL_NODE:
        return web.json_response({"error": "wrong target"}, status=409)
    ok, detail = await _deliver_or_forward(clean)
    return web.json_response({"ok": ok, "delivery": detail, "signal": clean}, status=200 if ok else 503)


async def _native(method: str, path: str, body: dict | None = None) -> tuple[int, bytes, str]:
    try:
        async with ClientSession(timeout=ClientTimeout(total=6)) as session:
            async with session.request(method, NATIVE_CONTROL + path, json=body) as response:
                return response.status, await response.read(), response.headers.get("Content-Type", "application/json")
    except Exception as exc:
        payload = json.dumps({"available": False, "state": "unavailable", "last_error": type(exc).__name__}).encode()
        return 503, payload, "application/json"


async def native_status(_request: web.Request) -> web.Response:
    status, data, content_type = await _native("GET", "/status")
    return web.Response(body=data, status=status, content_type=content_type.split(";", 1)[0])


async def native_devices(_request: web.Request) -> web.Response:
    status, data, content_type = await _native("GET", "/devices")
    return web.Response(body=data, status=status, content_type=content_type.split(";", 1)[0])


async def native_command(request: web.Request) -> web.Response:
    try:
        body = await request.json() if request.can_read_body else {}
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400)
    status, data, content_type = await _native("POST", "/" + request.path.rsplit("/", 1)[-1], body)
    return web.Response(body=data, status=status, content_type=content_type.split(";", 1)[0])


async def native_frame(_request: web.Request) -> web.Response:
    path = Path("/tmp/kyronext_remote_frame.jpg")
    try:
        data = path.read_bytes()
    except OSError:
        return web.Response(status=404)
    return web.Response(body=data, content_type="image/jpeg", headers={"Cache-Control": "no-store, max-age=0"})


async def native_mjpeg(request: web.Request) -> web.StreamResponse:
    response = web.StreamResponse(headers={"Content-Type": "multipart/x-mixed-replace; boundary=frame", "Cache-Control": "no-store"})
    await response.prepare(request)
    last_mtime = 0
    try:
        while True:
            path = Path("/tmp/kyronext_remote_frame.jpg")
            try:
                stat = path.stat()
                if stat.st_mtime_ns != last_mtime:
                    data = path.read_bytes(); last_mtime = stat.st_mtime_ns
                    await response.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(data)).encode() + b"\r\n\r\n" + data + b"\r\n")
            except OSError:
                pass
            await asyncio.sleep(0.1)
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return response


async def websocket(request: web.Request) -> web.StreamResponse:
    if not _allowed(request):
        return web.json_response({"error": "LAN/Tailscale only"}, status=403)
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=131072)
    await ws.prepare(request)
    info = {"node_id": "", "client_id": uuid.uuid4().hex}
    CLIENTS[ws] = info
    await ws.send_json({"type": "ready", "protocol": "kyronext-link/1", "client_id": info["client_id"]})
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                body = json.loads(msg.data)
            except Exception:
                continue
            if body.get("type") == "hello" and str(body.get("node_id")) == LOCAL_NODE:
                state = str(body.get("state", "online"))
                if state not in ALLOWED_STATES:
                    state = "online"
                info["node_id"] = LOCAL_NODE
                info["state"] = state
                PRESENCE[LOCAL_NODE] = {"state": state, "last_seen": time.time()}
                await ws.send_json({"type": "hello", "ok": True, "node_id": LOCAL_NODE})
            else:
                clean = _clean_signal(body)
                if clean and clean["source"] == LOCAL_NODE:
                    ok, detail = await _deliver_or_forward(clean)
                    await ws.send_json({"type": "ack", "call_id": clean["call_id"], "ok": ok, "delivery": detail})
    finally:
        CLIENTS.pop(ws, None)
        if info.get("node_id") == LOCAL_NODE:
            live_states = [x.get("state", "online") for x in CLIENTS.values() if x.get("node_id") == LOCAL_NODE]
            if not any(x in {"busy", "in-call"} for x in live_states):
                PRESENCE[LOCAL_NODE] = {"state": "online", "last_seen": time.time()}
    return ws


async def _fleet_heartbeat(app: web.Application) -> None:
    await asyncio.sleep(2)
    while True:
        local = NODES.get(LOCAL_NODE, {})
        current_state = PRESENCE.get(LOCAL_NODE, {}).get("state", "online")
        native_active = False
        native_code, native_data, _ = await _native("GET", "/status")
        if native_code == 200:
            try:
                native_state = json.loads(native_data).get("state", "idle")
                if native_state == "connected": current_state = "in-call"; native_active = True
                elif native_state in {"outgoing", "incoming", "connecting"}: current_state = "busy"; native_active = True
                elif native_state == "idle" and current_state in {"busy", "in-call"}: current_state = "online"
            except Exception: pass
        live_states = [x.get("state", "online") for x in CLIENTS.values() if x.get("node_id") == LOCAL_NODE]
        if not native_active and current_state in {"busy", "in-call"} and not any(x in {"busy", "in-call"} for x in live_states):
            current_state = "online"
            PRESENCE[LOCAL_NODE] = {"state": "online", "last_seen": time.time()}
        body = {"protocol": "kyronext-link/1", "node_id": LOCAL_NODE,
                "state": current_state, "transponder_enabled": TRANSPONDER_ENABLED}
        local_live = PRESENCE.get(LOCAL_NODE, {})
        for key in ("lat", "lon", "accuracy", "location_source", "location_label"):
            if TRANSPONDER_ENABLED and local_live.get(key) is not None:
                body[key] = local_live.get(key)
        headers = {}
        if CONFIG.get("shared_token"):
            headers["X-Kyronext-Link-Token"] = str(CONFIG["shared_token"])
        for node_id, cfg in NODES.items():
            base = str(cfg.get("api_base", "")).rstrip("/")
            if node_id == LOCAL_NODE or not base or not cfg.get("enabled", True):
                continue
            try:
                async with ClientSession(timeout=ClientTimeout(total=3)) as session:
                    await session.post(base + "/api/link/heartbeat", json=body, headers=headers)
            except Exception:
                pass
        local_record = dict(PRESENCE.get(LOCAL_NODE, {}))
        local_record.update({"state": body["state"], "last_seen": time.time()})
        PRESENCE[LOCAL_NODE] = local_record
        await asyncio.sleep(15)


async def _start(app: web.Application) -> None:
    PRESENCE[LOCAL_NODE] = {"state": "online", "last_seen": time.time(), "transponder_enabled": TRANSPONDER_ENABLED}
    netloc = await _network_location() if TRANSPONDER_ENABLED else {}
    if TRANSPONDER_ENABLED and netloc:
        PRESENCE[LOCAL_NODE].update(netloc)
    app["kyronext_link_heartbeat"] = asyncio.create_task(_fleet_heartbeat(app))


async def _stop(app: web.Application) -> None:
    task = app.get("kyronext_link_heartbeat")
    if task:
        task.cancel()


def setup(app: web.Application) -> None:
    app.router.add_get("/api/link/presence", presence)
    app.router.add_post("/api/link/heartbeat", heartbeat)
    app.router.add_post("/api/link/location", location_update)
    app.router.add_get("/api/link/transponder", transponder)
    app.router.add_post("/api/link/transponder", transponder)
    app.router.add_post("/api/link/signal", signal)
    app.router.add_get("/api/link/ws", websocket)
    app.router.add_get("/api/link/native/status", native_status)
    app.router.add_get("/api/link/native/devices", native_devices)
    for command in ("call", "accept", "reject", "hangup", "mic", "camera", "audio-config"):
        app.router.add_post("/api/link/native/" + command, native_command)
    app.router.add_get("/api/link/native/remote-frame.jpg", native_frame)
    app.router.add_get("/api/link/native/remote.mjpg", native_mjpeg)
    app.on_startup.append(_start)
    app.on_cleanup.append(_stop)


def voice_result(text: str) -> dict | None:
    norm = " ".join(__import__("unicodedata").normalize("NFKD", text).encode("ascii", "ignore").decode().lower().split())
    if re.search(r"\b(?:active|allume|enclenche|ouvre)\b.*\b(?:transpondeur|balise gps|localisation gps)\b|\brends[- ]?moi detectable\b|\bautorise\b.*\b(?:position|localisation)\b", norm):
        reply = "Transpondeur GPS activé. Balise de position autorisée. Le véhicule devient détectable sur le réseau sécurisé F.L.A.G."
        return {"reply": reply, "tts_reply": reply, "action": "link_transponder_on"}
    if re.search(r"\b(?:coupe|eteins|desactive|ferme)\b.*\b(?:transpondeur|balise gps|localisation gps)\b|\brends[- ]?moi invisible\b|\bne (?:me )?localise plus\b", norm):
        reply = "Transpondeur GPS coupé. Aucune coordonnée de position ne sera transmise."
        return {"reply": reply, "tts_reply": reply, "action": "link_transponder_off"}
    if re.search(r"\b(?:etat|statut)\b.*\btranspondeur\b|\btranspondeur (?:actif|active|coupe|allume)\b", norm):
        reply = "Le système affiche l’état actuel du transpondeur GPS."
        return {"reply": reply, "tts_reply": reply, "action": "link_transponder_status"}
    # KYRONEXT VOICE SATELLITE ALIASES V2
    # Priorité haute : « active les satellites », « mets les satellites »,
    # « lance le satellite », etc. doivent ouvrir la détection, jamais le menu d'appels.
    _sat_call_menu = bool(re.search(
        r"\b(?:appel|appelle|appeler|menu|liste|contacts?|telephone|contacte|contacter)\b.*\b(?:satel\w*|satcom)\b",
        norm,
    ))
    _sat_target = bool(re.search(r"\b(?:satel\w*|satcom|flag)\b", norm)) or "f.l.a.g" in norm
    # Une question descriptive (« comment fonctionne la localisation par
    # satellites ? ») ne doit jamais ouvrir la carte. Il faut une intention
    # impérative explicite au début de la phrase.
    _sat_action = bool(re.search(
        r"^(?:(?:kitt|karr)[,\s]+)?"
        r"(?:(?:s[' ]?il te plait|peux[- ]tu|pourrais[- ]tu|est[- ]ce que tu peux|tu peux|je veux que tu)[,\s]+)?"
        r"(?:active|activez|activer|mets|met|mettre|allume|allumer|enclenche|enclencher|"
        r"lance|lancer|demarre|demarrer|declenche|declencher|ouvre|ouvrir|affiche|afficher|"
        r"montre|montrer|recherche|rechercher|detecte|detecter|localise|localiser|repere|reperer|"
        r"scanne|scanner)\b",
        norm,
    ))
    _vehicle_scan = _sat_action and bool(re.search(r"\b(?:vehicules?|chevaliers?)\b", norm))
    if not _sat_call_menu and ((_sat_target and _sat_action) or _vehicle_scan):
        reply = "J'active la détection satellitaire."
        return {"reply": reply, "tts_reply": reply, "action": "link_map"}

    menu_patterns = (
        r"\bappel satellite\b", r"\bmenu (?:des )?appels?\b", r"\bmenu satellite\b",
        r"\bliste (?:des )?appels?\b", r"\bqui (?:puis[- ]?je|peux[- ]?je|peut[- ]?on) appeler\b",
        r"\bqui appeler\b", r"\bcontacts? satellite\b", r"\bouvre (?:le )?menu (?:des )?appels?\b"
    )
    if any(re.search(p, norm) for p in menu_patterns) or norm in {"appel", "appelle", "appeler", "satellite"}:
        reply = "J'ouvre le menu des appels satellite. Vous pouvez appeler Manix, Dadou ou Pascal."
        return {"reply": reply, "tts_reply": reply, "action": "link_menu"}
    if re.search(r"\bqui est en ligne\b", norm):
        reply = "J'affiche les membres disponibles sur le réseau satellite."
        return {"reply": reply, "tts_reply": reply, "action": "link_status"}
    # Tolère les erreurs STT observées dans les conversations réelles.
    call_intent = bool(re.search(
        r"\b(?:appel|appelle|appeler|apel|apele|apeler|apelle|appele|aphel|atpel|artelle|affainer|contacte|contacter|contact|communication)\b",
        norm,
    ))
    # « Qu'appelle-t-on… ? » et « Comment X appelle-t-il… ? » sont des
    # questions documentaires, jamais des ordres de communication satellite.
    descriptive_call_question = bool(re.match(
        r"^(?:comment|pourquoi|qu(?:e|oi)?|quel(?:le)?|qui|ou|quand)\b",
        norm,
    ))
    if call_intent and not descriptive_call_question:
        if re.search(r"\b(?:dadou|dadu|d[' ]?adou|dadoux|karr|car)\b", norm):
            reply = "J'appelle Dadou."
            return {"reply": reply, "tts_reply": reply, "action": "link_call_karr-dadou"}
        if re.search(r"\bpascal\b", norm):
            reply = "J'appelle Pascal."
            return {"reply": reply, "tts_reply": reply, "action": "link_call_kitt-pascal"}
        if re.search(r"\b(?:manix|monix)\b", norm):
            reply = "J'appelle Manix."
            return {"reply": reply, "tts_reply": reply, "action": "link_call_kitt-manix"}
        if re.search(r"\b(?:kitt|kit)\b", norm):
            reply = "Précisez Manix ou Pascal. J'ouvre le menu des appels satellite."
            return {"reply": reply, "tts_reply": reply, "action": "link_menu"}
    commands = [
        (
            r"\b(?:raccroche|raccrocher|racroche|racrocher|racrosh|rackrosch|rackroch|ra croche|rai kouchi|rai kouchy)\b"
            r"|\b(?:arrete|stop|stoppe|coupe|termine|quitte|annule|ferme|deconnecte)\s+"
            r"(?:l[' ]?|la |le )?(?:appel|communication|liaison)\b"
            r"|\bmet(?:s)?\s+fin\s+(?:a|au)\s+(?:l[' ]?|la |le )?(?:appel|communication|liaison)\b"
            r"|\bfin\s+(?:de\s+)?(?:l[' ]?|la |le )?(?:appel|communication|liaison)\b",
            "link_hangup", "Je raccroche."
        ),
        (r"\b(?:coupe|eteins?|desactive) (?:le )?micro\b|\bmicro off\b", "link_mic_off", "Micro coupé."),
        (r"\b(?:remets|reactive|active|allume) (?:le )?micro\b|\bmicro on\b", "link_mic_on", "Micro réactivé."),
        (r"\b(?:coupe|eteins?|desactive) (?:la )?camera\b|\bcamera off\b", "link_camera_off", "Caméra coupée."),
        (r"\b(?:remets|reactive|active|allume) (?:la )?camera\b|\bcamera on\b", "link_camera_on", "Caméra réactivée."),
        (r"\b(?:(?:ouvre|affiche|active|lance|demarre|declenche) (?:la |le )?(?:carte (?:reseau|satellite|satellitaire)|detection satellit(?:e|aire)|recherche satellit(?:e|aire)|scan satellite|satellite)|(?:active|lance|demarre|declenche) (?:le )?satellite|(?:recherche|localise|detecte) (?:les )?(?:vehicules|chevaliers)(?: knight rider)?(?: par satellite)?|scan satellit(?:e|aire))\b", "link_map", "J'active la détection satellitaire."),
    ]
    for pattern, action, reply in commands:
        if re.search(pattern, norm):
            return {"reply": reply, "tts_reply": reply, "action": action}
    return None
