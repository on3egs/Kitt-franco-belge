"""
=============================================================
AJOUTS À kyronex_server.py — Musique + PDF + Audio proxy
=============================================================
Colle ce code AVANT la fonction create_app() dans kyronex_server.py
=============================================================
"""

import uuid
import time
import json
import os
import aiohttp

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

ADMIN_TOKEN = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3"
TELEGRAM_TOKEN = "8639685200:AAEkGrfpmQkFCP8TlfB-pq5KsQN8s3OlfWU"
TELEGRAM_CHAT   = "8591807736"

async def _send_telegram(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        async with aiohttp.ClientSession() as s:
            await s.post(url, json={"chat_id": TELEGRAM_CHAT, "text": text})
    except Exception:
        pass

# ─── AUDIO PROXY (pour visualiseur Web Audio API) ─────────────────────────────

async def handle_audio_proxy(request):
    url = request.rel_url.query.get("url", "")
    if not url:
        return web.Response(status=400, text="missing url")
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                content_type = resp.headers.get("Content-Type", "audio/mpeg")
                # Stream par chunks
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
    return web.Response(headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS"})

# ─── MUSIC SUBMIT ──────────────────────────────────────────────────────────────

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
        "id": str(uuid.uuid4()),
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
    await _send_telegram(msg)

    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_approved(request):
    data = _load_music()
    return web.json_response(
        {"approved": data["approved"]},
        headers={"Access-Control-Allow-Origin": "*"}
    )

async def handle_music_pending(request):
    if request.headers.get("X-Admin-Token") != ADMIN_TOKEN:
        return web.Response(status=403, text="Forbidden")
    data = _load_music()
    return web.json_response(
        {"pending": data["pending"], "approved": data["approved"]},
        headers={"Access-Control-Allow-Origin": "*"}
    )

async def handle_music_decide(request):
    if request.headers.get("X-Admin-Token") != ADMIN_TOKEN:
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

# ─── PDF SUBMIT ────────────────────────────────────────────────────────────────

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
        "id": str(uuid.uuid4()),
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
           "Catégorie : " + categorie + chr(10) +
           "Par : " + pseudo + chr(10) +
           "URL : " + url[:100])
    await _send_telegram(msg)

    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_approved(request):
    data = _load_pdfs()
    return web.json_response(
        {"approved": data["approved"]},
        headers={"Access-Control-Allow-Origin": "*"}
    )

async def handle_pdfs_pending(request):
    if request.headers.get("X-Admin-Token") != ADMIN_TOKEN:
        return web.Response(status=403, text="Forbidden")
    data = _load_pdfs()
    return web.json_response(
        {"pending": data["pending"], "approved": data["approved"]},
        headers={"Access-Control-Allow-Origin": "*"}
    )

async def handle_pdfs_decide(request):
    if request.headers.get("X-Admin-Token") != ADMIN_TOKEN:
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

# ─── VIDEO VIEW COUNTER ───────────────────────────────────────────────────────
# Ajouter aussi dans kyronex_server.py (le fichier video_submissions.json existant)

VIDEO_FILE = "/home/kitt/kitt-ai/video_submissions.json"

def _load_videos():
    if os.path.exists(VIDEO_FILE):
        with open(VIDEO_FILE) as f:
            return json.load(f)
    return {"pending": [], "approved": [], "rejected": []}

def _save_videos(data):
    with open(VIDEO_FILE, "w") as f:
        json.dump(data, f, indent=2)

async def handle_video_view(request):
    entry_id = request.match_info.get("id", "")
    data = _load_videos()
    for v in data["approved"]:
        if v["id"] == entry_id:
            v["views"] = v.get("views", 0) + 1
            break
    _save_videos(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

"""
=============================================================
ROUTES à ajouter dans create_app() — dans la liste app.router.add_routes([...])
=============================================================

    # Compteur vues vidéos
    web.post("/api/videos/view/{id}",   handle_video_view),

    # Audio proxy
    web.get("/api/audio-proxy",         handle_audio_proxy),
    web.options("/api/audio-proxy",     handle_audio_proxy_options),

    # Musique
    web.post("/api/music-submit",       handle_music_submit),
    web.get("/api/music/approved",      handle_music_approved),
    web.get("/api/music/pending",       handle_music_pending),
    web.post("/api/music/decide",       handle_music_decide),
    web.post("/api/music/play/{id}",    handle_music_play),
    web.options("/api/music-submit",    handle_music_options),
    web.options("/api/music/decide",    handle_music_options),

    # PDF
    web.post("/api/pdf-submit",         handle_pdf_submit),
    web.get("/api/pdfs/approved",       handle_pdfs_approved),
    web.get("/api/pdfs/pending",        handle_pdfs_pending),
    web.post("/api/pdfs/decide",        handle_pdfs_decide),
    web.post("/api/pdfs/view/{id}",     handle_pdfs_view),
    web.options("/api/pdf-submit",      handle_pdfs_options),
    web.options("/api/pdfs/decide",     handle_pdfs_options),

=============================================================
"""
