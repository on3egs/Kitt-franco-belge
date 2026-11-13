"""Livre d'or Midnight Disk : commentaires publics et boîte privée, sur SQLite."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

DEFAULT_ORIGINS = {
    "https://kitt-franco-belge.be", "https://www.kitt-franco-belge.be",
    "https://on3egs.github.io", "https://karr-dadoo.kitt-franco-belge.be",
    "http://192.168.129.25:3001", "http://192.168.129.25:3000",
    "http://127.0.0.1:3001", "http://localhost:3001",
    "http://127.0.0.1:3000", "http://localhost:3000",
}
PREFIX = "/api/midnight"


def clean(value, maximum, minimum=0):
    if not isinstance(value, str):
        raise ValueError("Un champ contient une valeur invalide.")
    value = "".join(c for c in value if c in "\n\t" or ord(c) >= 32).strip()
    if not minimum <= len(value) <= maximum:
        raise ValueError("Vérifiez la longueur des champs du message.")
    return value


def utc(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


def public_entry(row):
    return {"id": row["id"], "author": row["author"], "crew": row["crew"],
            "message": row["message"], "created_at": utc(row["created_at"])}


def reply(data, status=200):
    return web.json_response(data, status=status, dumps=lambda v: json.dumps(v, ensure_ascii=False))


def require_admin(request):
    given = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not hmac.compare_digest(given.encode(), request.app["admin_token"].encode()):
        raise web.HTTPUnauthorized(text='{"error":"Clé d’accès incorrecte."}', content_type="application/json")


@web.middleware
async def cors(request, handler):
    origin = request.headers.get("Origin")
    if origin and origin not in request.app["origins"]:
        return reply({"error": "Cette origine n’est pas autorisée."}, 403)
    try:
        response = web.Response(status=204) if request.method == "OPTIONS" else await handler(request)
    except web.HTTPException as error:
        response = error
    except (ValueError, json.JSONDecodeError):
        response = reply({"error": "Le formulaire contient une valeur invalide."}, 400)
    except Exception:
        import logging
        logging.exception("Guestbook request failed")
        response = reply({"error": "Le livre d’or est momentanément indisponible."}, 500)
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


async def health(request):
    request.app["db"].execute("SELECT 1").fetchone()
    return reply({"ok": True})


async def entries(request):
    before = int(request.query.get("before", 9223372036854775807))
    if before < 1:
        raise ValueError()
    rows = request.app["db"].execute(
        "SELECT * FROM entries WHERE visibility='public' AND deleted_at IS NULL AND id<? ORDER BY id DESC LIMIT 21", (before,)
    ).fetchall()
    total = request.app["db"].execute("SELECT COUNT(*) FROM entries WHERE visibility='public' AND deleted_at IS NULL").fetchone()[0]
    shown = rows[:20]
    return reply({"entries": [public_entry(row) for row in shown], "total": total,
                  "next": shown[-1]["id"] if len(rows) > 20 else None})


async def create_entry(request):
    if request.content_type != "application/json":
        return reply({"error": "Format de message invalide."}, 415)
    body = await request.json()
    if not isinstance(body, dict):
        raise ValueError()
    if body.get("website"):
        return reply({"error": "Cette transmission ne peut pas être acceptée."}, 400)
    author = clean(body.get("author", ""), 60, 2).replace("\n", " ")
    crew = clean(body.get("crew", ""), 60).replace("\n", " ")
    message = clean(body.get("message", ""), 2000, 3)
    visibility = body.get("visibility", "public")
    if visibility not in ("public", "private"):
        raise ValueError()
    email = clean(body.get("email", ""), 254) if visibility == "private" else ""
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return reply({"error": "Vérifiez votre adresse e-mail, ou laissez ce champ vide."}, 400)
    request_id = clean(body.get("request_id", ""), 64, 16)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", request_id):
        raise ValueError()
    if len(re.findall(r"https?://", message, re.I)) > 2:
        return reply({"error": "Merci de limiter votre message à deux liens."}, 400)
    address = request.headers.get("CF-Connecting-IP") or request.remote or "unknown"
    ip_hash = hmac.new(request.app["admin_token"].encode(), address.encode(), hashlib.sha256).hexdigest()
    db = request.app["db"]
    old = db.execute("SELECT * FROM entries WHERE request_id=?", (request_id,)).fetchone()
    if old:
        if (old["ip_hash"], old["author"], old["crew"], old["message"], old["visibility"], old["email"]) != (ip_hash, author, crew, message, visibility, email):
            return reply({"error": "Une autre transmission utilise cet identifiant. Rechargez la page."}, 409)
        return reply({"ok": True, "visibility": visibility, "entry": public_entry(old) if visibility == "public" else None}, 200)
    now = time.time()
    count = db.execute("SELECT COUNT(*) FROM entries WHERE ip_hash=? AND created_at>?", (ip_hash, now-900)).fetchone()[0]
    if count >= 3:
        response = reply({"error": "Votre signal a bien porté. Patientez quinze minutes avant un nouveau message."}, 429)
        response.headers["Retry-After"] = "900"
        return response
    with db:
        cur = db.execute("INSERT INTO entries(author,crew,message,visibility,email,created_at,ip_hash,request_id) VALUES(?,?,?,?,?,?,?,?)",
                         (author, crew, message, visibility, email, now, ip_hash, request_id))
    row = db.execute("SELECT * FROM entries WHERE id=?", (cur.lastrowid,)).fetchone()
    return reply({"ok": True, "visibility": visibility, "entry": public_entry(row) if visibility == "public" else None}, 201)


async def admin_entries(request):
    require_admin(request)
    rows = request.app["db"].execute("SELECT * FROM entries ORDER BY id DESC LIMIT 200").fetchall()
    return reply({"entries": [{**public_entry(row), "visibility": row["visibility"], "email": row["email"], "hidden": row["deleted_at"] is not None} for row in rows]})


async def hide_entry(request):
    require_admin(request)
    identity = int(request.match_info["id"])
    with request.app["db"]:
        cursor = request.app["db"].execute("UPDATE entries SET deleted_at=? WHERE id=?", (time.time(), identity))
    return reply({"ok": True}, 200) if cursor.rowcount else reply({"error": "Message introuvable."}, 404)


async def restore_entry(request):
    require_admin(request)
    identity = int(request.match_info["id"])
    with request.app["db"]:
        cursor = request.app["db"].execute("UPDATE entries SET deleted_at=NULL WHERE id=?", (identity,))
    return reply({"ok": True}, 200) if cursor.rowcount else reply({"error": "Message introuvable."}, 404)


async def admin_page(request):
    response = web.FileResponse(Path(__file__).with_name("admin.html"))
    response.headers["Content-Security-Policy"] = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def create_app(directory, origins=None):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    token_file = directory / "admin-token"
    if not token_file.exists():
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_urlsafe(36))
    token = token_file.read_text().strip()
    db_path = directory / "guestbook.sqlite3"
    db = sqlite3.connect(db_path)
    os.chmod(db_path, 0o600)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY AUTOINCREMENT,author TEXT NOT NULL,crew TEXT NOT NULL,message TEXT NOT NULL,visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),email TEXT NOT NULL,created_at REAL NOT NULL,ip_hash TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,deleted_at REAL)")
    db.execute("CREATE INDEX IF NOT EXISTS entries_ip_time ON entries(ip_hash,created_at)")
    db.commit()
    app = web.Application(middlewares=[cors], client_max_size=12*1024)
    app["db"], app["admin_token"], app["origins"] = db, token, origins if origins is not None else DEFAULT_ORIGINS
    app.add_routes([web.get(PREFIX+"/health", health), web.get(PREFIX+"/entries", entries),
                    web.post(PREFIX+"/entries", create_entry), web.get(PREFIX+"/admin", admin_page),
                    web.get(PREFIX+"/admin/entries", admin_entries), web.delete(PREFIX+"/admin/entries/{id}", hide_entry),
                    web.post(PREFIX+"/admin/entries/{id}/restore", restore_entry),
                    web.options(PREFIX+"/{path:.*}", lambda request: web.Response(status=204))])
    async def close_db(_app):
        db.close()
    app.on_cleanup.append(close_db)
    return app


if __name__ == "__main__":
    data = os.environ.get("MIDNIGHT_DATA_DIR", str(Path.home()/".local/share/kyronext-midnight/data"))
    web.run_app(create_app(data), host="127.0.0.1", port=int(os.environ.get("MIDNIGHT_PORT", "4398")))
