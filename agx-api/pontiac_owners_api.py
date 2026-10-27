"""Moderated Pontiac/Knight Rider owner gallery endpoints for the KITT aiohttp service.

Copy this module beside kyronex_server.py and register its routes with
register_pontiac_owner_routes(app, admin_token=...). No visitor profile or photo
is public until an administrator approves it.
"""
from __future__ import annotations

import asyncio
import base64
import hmac
import io
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

from aiohttp import web
from PIL import Image, ImageOps


DATA_ROOT = Path("/home/kitt/kitt-ai/data/pontiac_owners")
DATA_FILE = DATA_ROOT / "profiles.json"
PHOTO_ROOT = DATA_ROOT / "photos"
MAX_PHOTO_BYTES = 900 * 1024
MAX_PHOTOS = 4
MAX_PROFILES = 300
MAX_IMAGE_PIXELS = 20_000_000
_LOCK = asyncio.Lock()
_PROFILE_ID = re.compile(r"^[0-9a-f]{32}$")
_RATE_WINDOW_SECONDS = 3600
_RATE_MAX_POSTS = 5
_RATE_LIMIT: dict[str, list[float]] = {}
_REGION_CENTERS = {
    "be": ("Belgique", 50.5, 4.5), "fr": ("France", 46.2, 2.2),
    "nl": ("Pays-Bas", 52.1, 5.3), "de": ("Allemagne", 51.2, 10.4),
    "lu": ("Luxembourg", 49.8, 6.1), "gb": ("Royaume-Uni", 54.0, -2.0),
    "ch": ("Suisse", 46.8, 8.2), "es": ("Espagne", 40.4, -3.7),
    "it": ("Italie", 42.5, 12.5), "pt": ("Portugal", 39.4, -8.2),
    "se": ("Suède", 60.1, 18.6), "no": ("Norvège", 60.5, 8.5),
    "dk": ("Danemark", 56.0, 9.5), "pl": ("Pologne", 52.0, 19.0),
    "ca": ("Canada", 56.1, -106.3), "us": ("États-Unis", 39.8, -98.6),
    "mx": ("Mexique", 23.6, -102.5), "br": ("Brésil", -10.8, -52.9),
    "ar": ("Argentine", -38.4, -63.6), "jp": ("Japon", 36.2, 138.3),
    "kr": ("Corée du Sud", 36.5, 127.9), "in": ("Inde", 20.6, 78.9),
    "au": ("Australie", -25.3, 133.8), "nz": ("Nouvelle-Zélande", -40.9, 174.9),
    "eu_other": ("Autre pays d’Europe", 50.0, 15.0),
    "na_other": ("Autre région d’Amérique du Nord", 44.0, -100.0),
    "sa_other": ("Autre région d’Amérique du Sud", -15.0, -60.0),
    "africa": ("Afrique", 1.0, 17.0),
    "asia_other": ("Autre région d’Asie", 34.0, 100.0),
    "oceania": ("Autre région d’Océanie", -25.0, 133.0),
}


def _cors(response: web.StreamResponse) -> web.StreamResponse:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Admin-Token"
    response.headers["Vary"] = "Origin"
    return response


def _read_data() -> dict[str, list[dict[str, Any]]]:
    if DATA_FILE.exists():
        try:
            _secure_directory(DATA_ROOT)
            os.chmod(DATA_FILE, 0o600)
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            if all(isinstance(data.get(key), list) for key in ("pending", "approved", "rejected")):
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return {"pending": [], "approved": [], "rejected": []}


def _secure_directory(path: Path) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)


def _write_private_file(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise


def _write_data(data: dict[str, list[dict[str, Any]]]) -> None:
    _secure_directory(DATA_ROOT)
    temporary = DATA_FILE.with_suffix(".json.tmp")
    try:
        _write_private_file(temporary, json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
        os.replace(temporary, DATA_FILE)
        os.chmod(DATA_FILE, 0o600)
    finally:
        temporary.unlink(missing_ok=True)


def _rate_limited(request: web.Request) -> bool:
    """Limit POST attempts in memory only; never store or log the source IP."""
    now = time.monotonic()
    cutoff = now - _RATE_WINDOW_SECONDS
    for address, attempts in list(_RATE_LIMIT.items()):
        active = [attempt for attempt in attempts if attempt > cutoff]
        if active:
            _RATE_LIMIT[address] = active
        else:
            _RATE_LIMIT.pop(address, None)
    address = request.remote or "unknown"
    attempts = _RATE_LIMIT.setdefault(address, [])
    if len(attempts) >= _RATE_MAX_POSTS:
        return True
    attempts.append(now)
    return False


def _clean_text(value: Any, maximum: int, field: str, *, required: bool = False) -> str:
    if not isinstance(value, str):
        value = ""
    clean = " ".join(value.replace("\x00", "").split())[:maximum]
    if required and not clean:
        raise ValueError(f"Le champ « {field} » est requis.")
    return clean


def _private_position(body: dict[str, Any]) -> tuple[str, float | None, float | None]:
    """Keep human-readable location fields while placing the globe marker coarsely."""
    country = body.get("country")
    # Accept submissions from the previous form version during browser-cache overlap.
    if country in (None, ""):
        country = body.get("region")
    city = _clean_text(body.get("city"), 60, "ville")
    province = _clean_text(body.get("province"), 60, "région")
    if country in (None, ""):
        return " · ".join(part for part in (city, province) if part), None, None
    if not isinstance(country, str) or country not in _REGION_CENTERS:
        raise ValueError("Choisis un pays dans la liste.")
    country_label, latitude, longitude = _REGION_CENTERS[country]
    # These are the user-entered display labels; coordinates stay at the country center.
    display_location = " · ".join(part for part in (city, province, country_label) if part)
    # Round again for storage; the public marker is never a precise place.
    return display_location, round(latitude / 2) * 2, round(longitude / 2) * 2


def _sanitize_photo(data_url: Any) -> bytes:
    if not isinstance(data_url, str) or not data_url.startswith("data:image/jpeg;base64,"):
        raise ValueError("Les photos doivent être des JPEG préparés par le navigateur.")
    encoded = data_url.partition(",")[2]
    if len(encoded) > MAX_PHOTO_BYTES * 4 // 3 + 16:
        raise ValueError("Chaque photo doit faire moins de 900 Ko.")
    try:
        original = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error):
        raise ValueError("Une photo est illisible.")
    if not original or len(original) > MAX_PHOTO_BYTES or not original.startswith(b"\xff\xd8\xff"):
        raise ValueError("Une photo JPEG est invalide ou trop volumineuse.")
    try:
        with Image.open(io.BytesIO(original)) as image:
            if image.format != "JPEG" or image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Une photo dépasse la taille d’image autorisée.")
            image = ImageOps.exif_transpose(image).convert("RGB")
            output = io.BytesIO()
            # Re-encoding strips all user-supplied EXIF and GPS metadata.
            image.save(output, format="JPEG", quality=86, optimize=True, progressive=True)
            sanitized = output.getvalue()
    except (OSError, Image.DecompressionBombError):
        raise ValueError("Le contenu d’une photo est invalide.")
    if len(sanitized) > MAX_PHOTO_BYTES:
        raise ValueError("Une photo reste trop volumineuse après nettoyage.")
    return sanitized


def _public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        key: profile.get(key)
        for key in ("id", "name", "car", "year", "location", "latitude", "longitude", "story", "submittedAt")
    } | {"photos": [f"/api/pontiac-owners/photo/{profile['id']}/{index}" for index in range(len(profile.get("photoNames", [])))]}


async def get_approved_owner(profile_id: str) -> dict[str, str] | None:
    """Return the minimal identity needed by KITT Chat for an approved, photo-backed owner."""
    if not isinstance(profile_id, str) or not _PROFILE_ID.fullmatch(profile_id):
        return None
    async with _LOCK:
        profile = next(
            (item for item in _read_data()["approved"] if item.get("id") == profile_id),
            None,
        )
        first_photo = PHOTO_ROOT / profile_id / "0.jpg"
        if not profile or not profile.get("photoNames") or not first_photo.is_file():
            return None
        return {"id": profile_id, "name": str(profile.get("name") or "")}


def register_pontiac_owner_routes(
    app: web.Application,
    *,
    admin_token: str,
    data_root: Path = DATA_ROOT,
    notify=None,
) -> None:
    """Attach the community endpoints to the existing aiohttp app."""
    global DATA_ROOT, DATA_FILE, PHOTO_ROOT
    DATA_ROOT = Path(data_root)
    DATA_FILE = DATA_ROOT / "profiles.json"
    PHOTO_ROOT = DATA_ROOT / "photos"

    def is_admin(request: web.Request) -> bool:
        presented = request.headers.get("X-Admin-Token", "")
        return bool(admin_token) and hmac.compare_digest(presented.encode(), admin_token.encode())

    async def approved(_request: web.Request) -> web.Response:
        async with _LOCK:
            items = [_public_profile(item) for item in _read_data()["approved"]]
        return _cors(web.json_response({"approved": items}))

    async def submit(request: web.Request) -> web.Response:
        if _rate_limited(request):
            return _cors(web.json_response(
                {"ok": False, "error": "Trop de dossiers depuis cette connexion. Réessaie dans une heure."},
                status=429,
            ))
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise ValueError("Dossier invalide.")
            if body.get("website"):
                return _cors(web.json_response({"ok": True}))  # honeypot; do not store bot submissions
            name = _clean_text(body.get("name"), 48, "pseudo", required=True)
            car = _clean_text(body.get("car"), 80, "voiture", required=True)
            year = _clean_text(body.get("year"), 24, "période", required=True)
            story = _clean_text(body.get("story"), 420, "présentation", required=True)
            location, latitude, longitude = _private_position(body)
            raw_photos = body.get("photos", [])
            if not isinstance(raw_photos, list) or len(raw_photos) > MAX_PHOTOS:
                raise ValueError("Quatre photos au maximum sont acceptées.")
            if not raw_photos:
                raise ValueError("Ajoute au moins une photo de ta Pontiac.")
            photos = [_sanitize_photo(item) for item in raw_photos]
            if not body.get("consent"):
                raise ValueError("Le consentement de partage est requis.")
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return _cors(web.json_response({"ok": False, "error": str(error) or "Dossier invalide."}, status=400))
        except Exception:
            return _cors(web.json_response({"ok": False, "error": "Corps de requête invalide."}, status=400))

        profile_id = uuid.uuid4().hex
        _secure_directory(DATA_ROOT)
        _secure_directory(PHOTO_ROOT)
        photo_dir = PHOTO_ROOT / profile_id
        _secure_directory(photo_dir)
        try:
            for index, payload in enumerate(photos):
                _write_private_file(photo_dir / f"{index}.jpg", payload)
            profile = {
                "id": profile_id, "name": name, "car": car, "year": year,
                "location": location, "latitude": latitude, "longitude": longitude,
                "story": story, "photoNames": [f"{i}.jpg" for i in range(len(photos))],
                "status": "pending", "submittedAt": int(time.time()),
            }
            async with _LOCK:
                data = _read_data()
                if len(data["pending"]) + len(data["approved"]) >= MAX_PROFILES:
                    raise ValueError("La galerie a atteint sa capacité maximale pour le moment.")
                data["pending"].append(profile)
                _write_data(data)
        except Exception as error:
            for path in photo_dir.glob("*"):
                path.unlink(missing_ok=True)
            photo_dir.rmdir()
            if isinstance(error, ValueError):
                return _cors(web.json_response({"ok": False, "error": str(error)}, status=429))
            raise
        if notify:
            try:
                result = notify(f"Nouvelle Pontiac Knight Rider proposée : {name} — {car}")
                if asyncio.iscoroutine(result):
                    asyncio.create_task(result)
            except Exception:
                pass
        return _cors(web.json_response({"ok": True, "id": profile_id}, status=201))

    async def pending(request: web.Request) -> web.Response:
        if not is_admin(request):
            return _cors(web.json_response({"ok": False, "error": "Non autorisé."}, status=401))
        try:
            offset = max(0, int(request.query.get("offset", "0")))
        except ValueError:
            offset = 0
        async with _LOCK:
            rows = _read_data()["pending"]
            result = [{**_public_profile(row), "status": "pending"} for row in rows[offset:offset + 5]]
        return _cors(web.json_response({"pending": result, "offset": offset, "total": len(rows)}))

    async def pending_photo(request: web.Request) -> web.Response:
        if not is_admin(request):
            return _cors(web.json_response({"ok": False, "error": "Non autorisé."}, status=401))
        profile_id = request.match_info.get("profile_id", "")
        photo_index = request.match_info.get("photo_index", "")
        if not _PROFILE_ID.fullmatch(profile_id) or not photo_index.isdigit() or int(photo_index) >= MAX_PHOTOS:
            return web.Response(status=404)
        async with _LOCK:
            item = next((entry for entry in _read_data()["pending"] if entry["id"] == profile_id), None)
            if not item or int(photo_index) >= len(item.get("photoNames", [])):
                return web.Response(status=404)
            path = PHOTO_ROOT / profile_id / f"{photo_index}.jpg"
            if not path.is_file():
                return web.Response(status=404)
            _secure_directory(PHOTO_ROOT)
            _secure_directory(path.parent)
            os.chmod(path, 0o600)
            content = path.read_bytes()
        return _cors(web.Response(body=content, content_type="image/jpeg", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}))

    async def decide(request: web.Request) -> web.Response:
        if not is_admin(request):
            return _cors(web.json_response({"ok": False, "error": "Non autorisé."}, status=401))
        try:
            body = await request.json()
        except Exception:
            return _cors(web.json_response({"ok": False, "error": "JSON invalide."}, status=400))
        profile_id, action = body.get("id"), body.get("action")
        if not isinstance(profile_id, str) or not _PROFILE_ID.fullmatch(profile_id) or action not in ("approve", "reject"):
            return _cors(web.json_response({"ok": False, "error": "Paramètres invalides."}, status=400))
        async with _LOCK:
            data = _read_data()
            profile = next((item for item in data["pending"] if item["id"] == profile_id), None)
            if profile is None:
                return _cors(web.json_response({"ok": False, "error": "Profil introuvable."}, status=404))
            data["pending"] = [item for item in data["pending"] if item["id"] != profile_id]
            if action == "approve":
                profile["status"] = "approved"
                data["approved"].append(profile)
            else:
                data["rejected"].append({"id": profile_id, "decidedAt": int(time.time())})
            _write_data(data)
        if action == "reject":
            directory = PHOTO_ROOT / profile_id
            if directory.exists():
                for path in directory.glob("*"):
                    path.unlink(missing_ok=True)
                directory.rmdir()
        return _cors(web.json_response({"ok": True}))

    async def photo(request: web.Request) -> web.Response:
        profile_id = request.match_info.get("profile_id", "")
        photo_index = request.match_info.get("photo_index", "")
        if not _PROFILE_ID.fullmatch(profile_id) or not photo_index.isdigit() or int(photo_index) >= MAX_PHOTOS:
            return web.Response(status=404)
        async with _LOCK:
            entry = next((item for item in _read_data()["approved"] if item["id"] == profile_id), None)
            if not entry or int(photo_index) >= len(entry.get("photoNames", [])):
                return web.Response(status=404)
            path = PHOTO_ROOT / profile_id / f"{photo_index}.jpg"
            if not path.is_file():
                return web.Response(status=404)
            _secure_directory(PHOTO_ROOT)
            _secure_directory(path.parent)
            os.chmod(path, 0o600)
            payload = path.read_bytes()
        response = web.Response(body=payload, content_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})
        return _cors(response)

    async def options(_request: web.Request) -> web.Response:
        return _cors(web.Response(status=204))

    app.router.add_get("/api/pontiac-owners/approved", approved)
    app.router.add_post("/api/pontiac-owners/submit", submit)
    app.router.add_get("/api/pontiac-owners/pending", pending)
    app.router.add_get("/api/pontiac-owners/pending-photo/{profile_id}/{photo_index}", pending_photo)
    app.router.add_post("/api/pontiac-owners/decide", decide)
    app.router.add_get("/api/pontiac-owners/photo/{profile_id}/{photo_index}", photo)
    for method, path in (
        ("POST", "/api/pontiac-owners/submit"),
        ("GET", "/api/pontiac-owners/approved"),
        ("GET", "/api/pontiac-owners/pending"),
        ("POST", "/api/pontiac-owners/decide"),
        ("GET", "/api/pontiac-owners/pending-photo/{profile_id}/{photo_index}"),
    ):
        app.router.add_route("OPTIONS", path, options)
