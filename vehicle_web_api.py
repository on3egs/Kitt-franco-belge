"""KYRONEXT Thunder vehicle web API — shared with AGX/KARR.
Uses the exact relay service/config ported from Pascal KITT.
"""
from __future__ import annotations
import asyncio
from aiohttp import web
from vehicle_relay_service import VehicleRelayError, get_service
from relay_controller import RelayController

def _service():
    return get_service()

def _record(r):
    if r is None:
        return None
    return {
        "function": r.function, "relay": r.relay, "state": r.state,
        "duration_ms": r.duration_ms, "status": r.status,
        "message": r.message, "timestamp": r.timestamp,
    }

async def _run(fn):
    try:
        return True, await asyncio.to_thread(fn)
    except Exception as exc:
        return False, str(exc)

async def handle_vehicle_trunk(request):
    ok, out = await _run(_service().open_trunk)
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_engine(request):
    try: body = await request.json()
    except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
    action = str(body.get("action", "")).lower()
    if action == "start": fn = _service().start_engine
    elif action == "stop": fn = _service().stop_engine
    else: return web.json_response({"error": "action attendue : start ou stop"}, status=400)
    ok, out = await _run(fn)
    return web.json_response({"success": True, "action": action, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_windows(request):
    try: body = await request.json()
    except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
    side = str(body.get("side", "")).lower()
    direction = str(body.get("direction", "")).lower()
    if side not in {"driver","passenger","both"}: return web.json_response({"error": "side attendu : driver, passenger ou both"}, status=400)
    if direction not in {"up","down"}: return web.json_response({"error": "direction attendue : up ou down"}, status=400)
    duration = body.get("duration_seconds")
    if duration is not None:
        try: duration = float(duration)
        except Exception: return web.json_response({"error": "duration_seconds doit être un nombre"}, status=400)
    ok, out = await _run(lambda: _service().operate_window(side, direction, duration))
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_windows_stop(request):
    try: body = await request.json()
    except Exception: body = {}
    side = str(body.get("side", "both")).lower()
    if side not in {"driver","passenger","both"}: side = "both"
    ok, out = await _run(lambda: _service().stop_window(side))
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_headlights(request):
    try: body = await request.json()
    except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
    state = bool(body.get("state", False))
    ok, out = await _run(lambda: _service().set_headlights(state))
    return web.json_response({"success": True, "state": state, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_accessory(request):
    try: body = await request.json()
    except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
    fn = str(body.get("function", "")).lower()
    state = body.get("state")
    if not isinstance(state, bool): return web.json_response({"error": "state doit être un booléen"}, status=400)
    handlers = {"scanner": _service().set_scanner, "fog_lights": _service().set_fog_lights, "laser": _service().set_laser}
    if fn not in handlers: return web.json_response({"error": "accessoire inconnu"}, status=400)
    ok, out = await _run(lambda: handlers[fn](state))
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_doors(request):
    try: body = await request.json()
    except Exception: return web.json_response({"error": "JSON invalide"}, status=400)
    action = str(body.get("action", "")).lower()
    if action in {"lock","close"}: fn = _service().lock_doors
    elif action in {"unlock","open"}: fn = _service().unlock_doors
    else: return web.json_response({"error": "action attendue : lock ou unlock"}, status=400)
    ok, out = await _run(fn)
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_honk(request):
    try: body = await request.json()
    except Exception: body = {}
    duration = body.get("duration_seconds")
    try: duration = None if duration is None else float(duration)
    except Exception: return web.json_response({"error": "duration_seconds invalide"}, status=400)
    ok, out = await _run(lambda: _service().honk(duration))
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_stop_all(request):
    ok, out = await _run(_service().stop_all_vehicle_relays)
    records = [_record(r) for r in out] if ok else None
    return web.json_response({"success": True, "records": records, "record": {"function":"stop_all","relay":None,"state":False,"duration_ms":None,"status":"completed","message":"Toutes les sorties coupées","timestamp":__import__("time").time()}}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_raw(request):
    return web.json_response(
        {
            "success": False,
            "error": (
                "COMMANDE REFUSÉE — l'activation brute des relais est strictement "
                "interdite pour raison de sécurité. Utilisez les fonctions véhicule "
                "sécurisées ; STOP ALL reste autorisé."
            ),
        },
        status=403,
    )

async def handle_vehicle_horn_pattern(request):
    try: pattern = str((await request.json()).get("pattern","normal")).lower()
    except Exception: return web.json_response({"error":"JSON invalide"}, status=400)
    fn = _service().stop_horn if pattern == "stop" else lambda: _service().play_horn_pattern(pattern)
    ok, out = await _run(fn)
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_light_pattern(request):
    try: pattern = str((await request.json()).get("pattern","appel")).lower()
    except Exception: return web.json_response({"error":"JSON invalide"}, status=400)
    fn = _service().stop_light_pattern if pattern == "stop" else lambda: _service().play_light_pattern(pattern)
    ok, out = await _run(fn)
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_combined_mode(request):
    try: mode = str((await request.json()).get("mode","demo")).lower()
    except Exception: return web.json_response({"error":"JSON invalide"}, status=400)
    fn = _service().stop_combined_mode if mode == "stop" else lambda: _service().play_combined_mode(mode)
    ok, out = await _run(fn)
    return web.json_response({"success": True, "record": _record(out)}) if ok else web.json_response({"error": out}, status=400)

async def handle_vehicle_history(request):
    try: limit = min(max(int(request.query.get("limit","20")),1),100)
    except Exception: limit = 20
    return web.json_response({"records": [_record(r) for r in _service().get_history(limit)]})

async def handle_vehicle_relay_info(request):
    cfg = _service().get_config()
    board = cfg.get("relay_board", {})
    port = board.get("port")
    available = bool(port and __import__("os").path.exists(port))
    return web.json_response({
        "available": available, "port": port or "—",
        "protocol": board.get("protocol","kmtronic"),
        "module_size": int(board.get("module_size",8)),
        "installed_modules": int(board.get("installed_modules",1)),
        "relay_count": int(board.get("relay_count",16)),
        "error": "" if available else "Carte relais non détectée"
    })

async def handle_vehicle_config(request):
    return web.json_response(_service().get_config())
