#!/usr/bin/env python3
"""
Patch script: inject music/PDF/audio-proxy endpoints into kyronex_server.py
Run on the Jetson: python3 /tmp/apply_jetson.py
"""

import sys

SERVER_FILE = "/home/kitt/kitt-ai/kyronex_server.py"

# ─── Check if already applied ─────────────────────────────────────────────────
with open(SERVER_FILE, "r", encoding="utf-8") as f:
    original = f.read()

if "handle_music_submit" in original:
    print("already applied")
    sys.exit(0)

# ─── Handler code to inject BEFORE create_app() ───────────────────────────────
HANDLERS = r"""
import uuid as _uuid_mod
import aiohttp as _aiohttp_mod

MUSIC_FILE = "/home/kitt/kitt-ai/music_submissions.json"
PDF_FILE   = "/home/kitt/kitt-ai/pdf_submissions.json"

def _load_music():
    if os.path.exists(MUSIC_FILE):
        with open(MUSIC_FILE) as f:
            return json.load(f)
    return {"pending": [], "approved": [], "rejected": []}

def _save_music(data):
    with open(MUSIC_FILE, "w") as f:
        json.dump(data, f, indent=2)

def _load_pdfs():
    if os.path.exists(PDF_FILE):
        with open(PDF_FILE) as f:
            return json.load(f)
    return {"pending": [], "approved": [], "rejected": []}

def _save_pdfs(data):
    with open(PDF_FILE, "w") as f:
        json.dump(data, f, indent=2)

_ADMIN_TOKEN_NEW   = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3"
_TELEGRAM_TOKEN_NEW = "8639685200:AAEkGrfpmQkFCP8TlfB-pq5KsQN8s3OlfWU"
_TELEGRAM_CHAT_NEW  = "8591807736"

async def _send_telegram_new(text):
    url = "https://api.telegram.org/bot" + _TELEGRAM_TOKEN_NEW + "/sendMessage"
    try:
        async with _aiohttp_mod.ClientSession() as s:
            await s.post(url, json={"chat_id": _TELEGRAM_CHAT_NEW, "text": text})
    except Exception:
        pass

# ─── AUDIO PROXY ───────────────────────────────────────────────────────────────

async def handle_audio_proxy(request):
    url = request.rel_url.query.get("url", "")
    if not url:
        return web.Response(status=400, text="missing url")
    try:
        async with _aiohttp_mod.ClientSession() as s:
            async with s.get(url, timeout=_aiohttp_mod.ClientTimeout(total=30)) as resp:
                content_type = resp.headers.get("Content-Type", "audio/mpeg")
                response = web.StreamResponse(
                    headers={
                        "Content-Type": content_type,
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "public, max-age=3600",
                    }
                )
                await response.prepare(request)
                async for chunk in resp.content.iter_chunked(8192):
                    await response.write(chunk)
                await response.write_eof()
                return response
    except Exception as e:
        return web.Response(status=502, text=str(e))

async def handle_audio_proxy_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
    })

# ─── MUSIC ────────────────────────────────────────────────────────────────────

async def handle_music_submit(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    url     = (body.get("url") or "").strip()
    titre   = (body.get("titre") or "Sans titre").strip()[:80]
    artiste = (body.get("artiste") or "Inconnu").strip()[:80]
    pseudo  = (body.get("pseudo") or "Anonyme").strip()[:50]
    message = (body.get("message") or "").strip()[:300]
    if not url:
        return web.json_response({"ok": False, "error": "URL manquante"}, status=400)
    entry = {
        "id": str(_uuid_mod.uuid4()),
        "url": url,
        "titre": titre,
        "artiste": artiste,
        "pseudo": pseudo,
        "message": message,
        "ts": int(time.time()),
        "plays": 0,
    }
    data = _load_music()
    data["pending"].append(entry)
    _save_music(data)
    msg = ("[KITT] Nouvelle musique soumise" + chr(10) +
           "Titre : " + titre + chr(10) +
           "Artiste : " + artiste + chr(10) +
           "Par : " + pseudo + chr(10) +
           "URL : " + url[:100])
    await _send_telegram_new(msg)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_approved(request):
    data = _load_music()
    return web.json_response({"approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_pending(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    data = _load_music()
    return web.json_response({"pending": data["pending"], "approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_decide(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400)
    entry_id = body.get("id", "")
    action   = body.get("action", "")
    data = _load_music()
    entry = next((m for m in data["pending"] if m["id"] == entry_id), None)
    if not entry:
        return web.json_response({"ok": False, "error": "Introuvable"}, status=404)
    data["pending"] = [m for m in data["pending"] if m["id"] != entry_id]
    if action == "approve":
        data["approved"].append(entry)
    else:
        data["rejected"].append(entry)
    _save_music(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_play(request):
    entry_id = request.match_info.get("id", "")
    data = _load_music()
    for m in data["approved"]:
        if m["id"] == entry_id:
            m["plays"] = m.get("plays", 0) + 1
            break
    _save_music(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    })

# ─── PDF ──────────────────────────────────────────────────────────────────────

async def handle_pdf_submit(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    url         = (body.get("url") or "").strip()
    titre       = (body.get("titre") or "Sans titre").strip()[:120]
    description = (body.get("description") or "").strip()[:300]
    categorie   = (body.get("categorie") or "Autre").strip()[:50]
    pseudo      = (body.get("pseudo") or "Anonyme").strip()[:50]
    if not url:
        return web.json_response({"ok": False, "error": "URL manquante"}, status=400)
    entry = {
        "id": str(_uuid_mod.uuid4()),
        "url": url,
        "titre": titre,
        "description": description,
        "categorie": categorie,
        "pseudo": pseudo,
        "ts": int(time.time()),
        "views": 0,
    }
    data = _load_pdfs()
    data["pending"].append(entry)
    _save_pdfs(data)
    msg = ("[KITT] Nouveau PDF soumis" + chr(10) +
           "Titre : " + titre + chr(10) +
           "Categorie : " + categorie + chr(10) +
           "Par : " + pseudo + chr(10) +
           "URL : " + url[:100])
    await _send_telegram_new(msg)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_approved(request):
    data = _load_pdfs()
    return web.json_response({"approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_pending(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    data = _load_pdfs()
    return web.json_response({"pending": data["pending"], "approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_decide(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400)
    entry_id = body.get("id", "")
    action   = body.get("action", "")
    data = _load_pdfs()
    entry = next((p for p in data["pending"] if p["id"] == entry_id), None)
    if not entry:
        return web.json_response({"ok": False, "error": "Introuvable"}, status=404)
    data["pending"] = [p for p in data["pending"] if p["id"] != entry_id]
    if action == "approve":
        data["approved"].append(entry)
    else:
        data["rejected"].append(entry)
    _save_pdfs(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_view(request):
    entry_id = request.match_info.get("id", "")
    data = _load_pdfs()
    for p in data["approved"]:
        if p["id"] == entry_id:
            p["views"] = p.get("views", 0) + 1
            break
    _save_pdfs(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    })

"""

# ─── Routes to add after the existing video routes ────────────────────────────
NEW_ROUTES = """
    # Audio proxy
    app.router.add_get("/api/audio-proxy",           handle_audio_proxy)
    app.router.add_route("OPTIONS", "/api/audio-proxy", handle_audio_proxy_options)

    # Musique
    app.router.add_post("/api/music-submit",         handle_music_submit)
    app.router.add_get("/api/music/approved",        handle_music_approved)
    app.router.add_get("/api/music/pending",         handle_music_pending)
    app.router.add_post("/api/music/decide",         handle_music_decide)
    app.router.add_post("/api/music/play/{id}",      handle_music_play)
    app.router.add_route("OPTIONS", "/api/music-submit",   handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/decide",   handle_music_options)

    # PDF
    app.router.add_post("/api/pdf-submit",           handle_pdf_submit)
    app.router.add_get("/api/pdfs/approved",         handle_pdfs_approved)
    app.router.add_get("/api/pdfs/pending",          handle_pdfs_pending)
    app.router.add_post("/api/pdfs/decide",          handle_pdfs_decide)
    app.router.add_post("/api/pdfs/view/{id}",       handle_pdfs_view)
    app.router.add_route("OPTIONS", "/api/pdf-submit",     handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/decide",    handle_pdfs_options)
"""

# ─── Injection point 1: before create_app() ───────────────────────────────────
INJECT_BEFORE = "def create_app() -> web.Application:"

if INJECT_BEFORE not in original:
    print("ERROR: could not find 'def create_app()' marker in server file")
    sys.exit(1)

# Insert handlers right before create_app
patched = original.replace(INJECT_BEFORE, HANDLERS + INJECT_BEFORE, 1)

# ─── Injection point 2: after last video OPTIONS route ────────────────────────
# The last video route added is:
#   app.router.add_route("OPTIONS", "/api/videos/view/{id}", handle_video_options)
VIDEO_ANCHOR = '    app.router.add_route("OPTIONS", "/api/videos/view/{id}", handle_video_options)'

if VIDEO_ANCHOR not in patched:
    print("ERROR: could not find video anchor route in server file")
    sys.exit(1)

patched = patched.replace(VIDEO_ANCHOR, VIDEO_ANCHOR + "\n" + NEW_ROUTES, 1)

# ─── Write backup and updated file ────────────────────────────────────────────
import shutil
shutil.copy(SERVER_FILE, SERVER_FILE + ".bak")

with open(SERVER_FILE, "w", encoding="utf-8") as f:
    f.write(patched)

print("done")
