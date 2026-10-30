"""Photo sharing and on-demand local image descriptions for the community chat."""
from __future__ import annotations

import asyncio
import hmac
import io
import json
import os
import re
import secrets
import shutil
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from aiohttp import web
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 25_000_000
MAX_IMAGES = 200
MAX_STORAGE_BYTES = 150 * 1024 * 1024
MIN_FREE_BYTES = 256 * 1024 * 1024
RETENTION_SECONDS = 90 * 86400
_IMAGE_ID = re.compile(r"^[0-9a-f]{32}$")
_LAST_PROGRESS_BY_SPEAKER: dict[str, str] = {}
_PROGRESS_LINES = {
    "KITT": (
        "Photo reçue. Je la récupère sur l’AGX et je l’examine ; un instant.",
        "L’image arrive. Je l’ouvre, je regarde les détails et je te réponds juste après.",
        "Un petit instant : je charge la photo et je vérifie ce qui est clairement visible.",
        "J’ai reçu le cliché. Je le passe au scanner visuel et je reviens vers toi.",
        "La photo est en cours de lecture. Je prends le temps de bien l’observer.",
        "Je récupère l’image et je l’inspecte maintenant ; laisse-moi quelques secondes.",
        "Fichier reçu. Je l’affiche et je vérifie les éléments que je peux confirmer.",
        "Je m’occupe de la photo. Je l’ouvre et je regarde ce qu’elle montre vraiment.",
        "L’image est arrivée sur l’AGX. Je l’examine et je te fais un retour précis.",
        "Je charge le cliché. Encore un instant pendant que j’en vérifie les détails.",
        "Bien reçu. Je regarde la photo maintenant, sans tirer de conclusion trop vite.",
        "Je récupère la photo, je l’ouvre et je te décris ce que j’y distingue.",
        "Photo reçue. Je vérifie la scène et les détails visibles avant de te répondre.",
        "Je lance l’examen de l’image. Je te dis ce que je peux réellement y voir.",
        "Laisse-moi une seconde : je charge la photo et je la regarde attentivement.",
        "Le cliché est bien arrivé. Je l’inspecte et je reviens avec mes observations.",
    ),
    "KARR": (
        "Bon, je récupère cette photo. J’espère qu’elle mérite cette interruption.",
        "Très bien, je la charge. Ne prends pas mon aide pour de l’enthousiasme.",
        "Je télécharge l’image et je la regarde. Oui, quelqu’un doit bien s’en charger.",
        "Un instant. J’ouvre cette photo, puisque cela semble si urgent.",
        "Je m’en occupe. Inutile de me remercier avant même le résultat.",
        "Bon, je vais examiner ce cliché. Tâchons d’y consacrer le moins de temps possible.",
        "Photo reçue. J’interromps donc mes calculs pour l’inspecter.",
        "Je récupère l’image. J’imagine que tu attendais mon avis avec impatience.",
        "Très bien, je regarde. Cette tâche aurait pu attendre, mais soit.",
        "Je charge la photo. Faisons vite : j’avais des calculs plus intéressants.",
        "D’accord, je m’y colle. Voyons au moins si cette image est intéressante.",
        "L’image est arrivée. Je l’examine, même si mon enthousiasme reste mesuré.",
        "Je vais regarder cette photo. Pas besoin d’en faire une cérémonie.",
        "Bon. Je récupère le fichier et je vérifie ce qu’il montre.",
        "Je lance l’analyse. J’espère que cette interruption aura une bonne raison.",
        "Photo en cours d’ouverture. Je fais cela uniquement parce que tu l’as demandé.",
        "Je l’inspecte. Essaie de ne pas confondre efficacité et bonne volonté.",
        "Très bien, je prends quelques cycles pour cette image. Profites-en.",
        "Le cliché est reçu. Je vais donc m’en occuper, puisque personne d’autre ne le fait.",
        "Je regarde. Que cette photo soit au moins à la hauteur de l’interruption.",
    ),
}


def photo_progress_text(speaker: str) -> str:
    """Choose une annonce d’analyse différente de la précédente pour ce personnage."""
    character = "KARR" if speaker == "KARR" else "KITT"
    choices = _PROGRESS_LINES[character]
    previous = _LAST_PROGRESS_BY_SPEAKER.get(character)
    available = [line for line in choices if line != previous] or list(choices)
    selected = secrets.choice(available)
    _LAST_PROGRESS_BY_SPEAKER[character] = selected
    return selected


def normalize_photo(data: bytes) -> tuple[bytes, int, int]:
    """Decode a real raster image, orient it, bound its size and remove metadata."""
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("Photo vide ou supérieure à 8 Mo.")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP", "GIF"}:
                raise ValueError("Utilise une photo JPEG, PNG, WebP ou GIF.")
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("Photo trop grande : 25 millions de pixels maximum.")
            source.seek(0)
            source.load()
            oriented = ImageOps.exif_transpose(source)
            mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
            pixels = oriented.convert(mode)
            pixels.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            # A fresh image also removes EXIF/GPS, ICC and text chunks.
            clean = Image.new(mode, pixels.size)
            clean.paste(pixels)
            output = io.BytesIO()
            clean.save(output, format="WEBP", quality=85, method=4)
            return output.getvalue(), clean.width, clean.height
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise ValueError("Photo illisible ou format non pris en charge.") from exc


class ChatImageStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.manifest_path = self.root / "manifest.json"
        self.records: dict[str, dict[str, Any]] = {}
        try:
            if self.manifest_path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("Manifest too large")
            raw = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                self.records = {
                    key: value for key, value in raw.items()
                    if isinstance(key, str) and _IMAGE_ID.fullmatch(key) and isinstance(value, dict)
                    and isinstance(value.get("ownerId"), str)
                    and isinstance(value.get("createdAt"), (int, float))
                    and isinstance(value.get("room"), str)
                    and isinstance(value.get("messageId"), str)
                }
        except (OSError, ValueError):
            pass

    def path(self, image_id: str) -> Path:
        if not _IMAGE_ID.fullmatch(image_id):
            raise ValueError("Identifiant photo invalide.")
        return self.root / f"{image_id}.webp"

    def _write_manifest(self, records: dict[str, dict[str, Any]]) -> None:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.root / ".manifest.tmp"
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(records, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.manifest_path)

    def get(self, image_id: str) -> dict[str, Any] | None:
        record = self.records.get(image_id)
        if not record or record["createdAt"] < time.time() - RETENTION_SECONDS:
            return None
        try:
            return dict(record) if self.path(image_id).is_file() else None
        except ValueError:
            return None

    def prune(self) -> None:
        cutoff = time.time() - RETENTION_SECONDS
        expired = [key for key, value in self.records.items() if value["createdAt"] < cutoff]
        if not expired:
            return
        updated = {key: value for key, value in self.records.items() if key not in expired}
        self._write_manifest(updated)
        self.records = updated
        for image_id in expired:
            self.path(image_id).unlink(missing_ok=True)

    def add(self, data: bytes, metadata: dict[str, Any]) -> str:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.prune()
        physical = list(self.root.glob("*.webp"))
        if len(physical) >= MAX_IMAGES or sum(path.stat().st_size for path in physical) + len(data) > MAX_STORAGE_BYTES:
            raise OSError("Stockage photo du salon plein.")
        if shutil.disk_usage(self.root).free < MIN_FREE_BYTES + len(data):
            raise OSError("Espace disque insuffisant sur l’AGX.")
        image_id = uuid.uuid4().hex
        target = self.path(image_id)
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(data)
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
        updated = {**self.records, image_id: {**metadata, "bytes": len(data)}}
        try:
            self._write_manifest(updated)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        self.records = updated
        return image_id

    def remove(self, image_id: str) -> None:
        if image_id not in self.records:
            return
        updated = {key: value for key, value in self.records.items() if key != image_id}
        self._write_manifest(updated)
        self.records = updated
        self.path(image_id).unlink(missing_ok=True)


def register_chat_image_routes(
    app: web.Application, *,
    authenticate: Callable[[web.Request], Awaitable[str | None]],
    owner_name: Callable[[str], Awaitable[str]],
    cors: Callable[[web.Response], web.Response],
    root: Path,
    append_history: Callable[[str, dict[str, Any]], Awaitable[None]],
    broadcast: Callable[[str, dict[str, Any]], Awaitable[None]],
    allowed_rooms: set[str],
    describe_provider: Callable[[bytes, str, str], Awaitable[str]] | None = None,
    admin_token: str = "",
    after_upload: Callable[[str, str, bytes, asyncio.Lock], None] | None = None,
) -> None:
    store = ChatImageStore(root)
    storage_lock = asyncio.Lock()
    vision_lock = asyncio.Lock()
    upload_slots = asyncio.Semaphore(2)
    attempts: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def error(message: str, status: int) -> web.Response:
        return cors(web.json_response({"error": message}, status=status))

    def limited(owner: str, kind: str, maximum: int) -> bool:
        now = time.monotonic()
        for key, stamps in list(attempts.items()):
            if not stamps or stamps[-1] < now - 60:
                attempts.pop(key, None)
        bucket = attempts[(owner, kind)]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= maximum:
            return True
        bucket.append(now)
        return False

    async def process_upload(request: web.Request) -> web.Response:
        owner = await authenticate(request)
        if owner is None:
            return error("Connecte-toi au salon pour partager une photo.", 401)
        if limited(owner, "upload", 5):
            return error("Trop de photos à la fois. Patiente un instant.", 429)
        if request.content_length and request.content_length > MAX_UPLOAD_BYTES + 65536:
            return error("Photo trop volumineuse : 8 Mo maximum.", 413)
        data = bytearray()
        fields: dict[str, str] = {}
        seen_image = False
        try:
            reader = await request.multipart()
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "image":
                    if seen_image:
                        return error("Choisis une seule photo à la fois.", 400)
                    seen_image = True
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        data.extend(chunk)
                        if len(data) > MAX_UPLOAD_BYTES:
                            return error("Photo trop volumineuse : 8 Mo maximum.", 413)
                elif part.name in {"room", "caption"} and part.name not in fields:
                    raw = bytearray()
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        raw.extend(chunk)
                        if len(raw) > 3000:
                            return error("Légende trop longue.", 400)
                    fields[part.name] = raw.decode("utf-8")
                else:
                    return error("Champ de partage photo invalide.", 400)
        except (ValueError, AssertionError, UnicodeDecodeError):
            return error("Envoi photo invalide.", 400)
        room = fields.get("room", "general")
        caption = " ".join(fields.get("caption", "").split())
        if room not in allowed_rooms or len(caption) > 500 or not data:
            return error("Photo, salon valide et légende de 500 caractères maximum requis.", 400)
        try:
            clean, width, height = await asyncio.to_thread(normalize_photo, bytes(data))
        except ValueError as exc:
            return error(str(exc), 400)
        name = " ".join(str(await owner_name(owner)).split())[:48]
        if not name:
            return error("Profil propriétaire introuvable.", 403)
        message_id = uuid.uuid4().hex[:16]
        timestamp = int(time.time() * 1000)
        metadata = {"ownerId": owner, "name": name, "room": room, "createdAt": time.time(), "messageId": message_id,
                    "width": width, "height": height, "caption": caption}
        try:
            async with storage_lock:
                image_id = await asyncio.to_thread(store.add, clean, metadata)
        except OSError:
            return error("Le stockage photo est plein ou indisponible. Réessaie plus tard.", 503)
        photo = {"id": image_id, "url": f"/api/kitt-chat/images/{image_id}.webp", "width": width, "height": height,
                 "alt": caption or f"Photo partagée par {name}", "ownerId": owner}
        line = {"id": message_id, "name": name, "text": caption, "timestamp": timestamp, "kind": "message", "image": photo}
        await append_history(room, line)
        await broadcast(room, {"type": "message", "message": line})
        if after_upload is not None and describe_provider is not None:
            after_upload(room, image_id, clean, vision_lock)
        return cors(web.json_response({"ok": True, "message": line}, status=201))

    async def upload(request: web.Request) -> web.Response:
        if upload_slots.locked():
            return error("L’AGX prépare déjà plusieurs photos. Réessaie dans un instant.", 429)
        async with upload_slots:
            return await process_upload(request)

    async def image(request: web.Request) -> web.Response:
        image_id = request.match_info["image_id"]
        if not _IMAGE_ID.fullmatch(image_id):
            return error("Photo introuvable.", 404)
        async with storage_lock:
            record = store.get(image_id)
            if record is None:
                return error("Photo supprimée ou expirée.", 404)
            try:
                data = await asyncio.to_thread(store.path(image_id).read_bytes)
            except OSError:
                return error("Photo introuvable.", 404)
        return cors(web.Response(body=data, content_type="image/webp", headers={
            "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, immutable",
        }))

    async def remove(request: web.Request) -> web.Response:
        image_id = request.match_info["image_id"]
        if not _IMAGE_ID.fullmatch(image_id):
            return error("Photo introuvable.", 404)
        owner = await authenticate(request)
        given = request.headers.get("X-Admin-Token", "")
        administrator = bool(admin_token and hmac.compare_digest(given.encode(), admin_token.encode()))
        if owner is None and not administrator:
            return error("Connexion requise pour supprimer cette photo.", 401)
        try:
            async with storage_lock:
                record = store.get(image_id)
                if record is None:
                    return error("Photo introuvable.", 404)
                if record["ownerId"] != owner and not administrator:
                    return error("Seul l’auteur peut supprimer cette photo.", 403)
                await asyncio.to_thread(store.remove, image_id)
        except OSError:
            return error("Impossible de supprimer la photo maintenant.", 503)
        await broadcast(record["room"], {"type": "image_removed", "imageId": image_id, "id": record["messageId"]})
        return cors(web.json_response({"ok": True, "imageId": image_id}))

    async def describe(request: web.Request) -> web.Response:
        owner = await authenticate(request)
        if owner is None:
            return error("Connecte-toi pour demander une description.", 401)
        if describe_provider is None:
            return error("L’analyse d’image locale n’est pas disponible sur l’AGX pour le moment.", 503)
        if limited(owner, "describe", 4):
            return error("Trop de demandes de description. Patiente un instant.", 429)
        image_id = request.match_info["image_id"]
        if not _IMAGE_ID.fullmatch(image_id):
            return error("Photo introuvable.", 404)
        try:
            raw = bytearray()
            while not request.content.at_eof():
                raw.extend(await request.content.read(4097 - len(raw)))
                if len(raw) > 4096:
                    return error("Question trop longue.", 413)
            body = json.loads(raw) if raw else {}
            if not isinstance(body, dict):
                raise ValueError
            speaker = body.get("speaker", "KITT")
            question = body.get("question", "Décris ce que tu vois sur cette image.")
            if speaker not in ("KITT", "KARR") or not isinstance(question, str) or not question.strip() or len(question) > 500:
                raise ValueError
            question = " ".join(question.split())
        except (ValueError, TypeError):
            return error("Choisis KITT ou KARR et une question de 500 caractères maximum.", 400)
        async with storage_lock:
            record = store.get(image_id)
            if record is None:
                return error("Photo supprimée ou expirée.", 404)
            try:
                data = await asyncio.to_thread(store.path(image_id).read_bytes)
            except OSError:
                return error("Photo introuvable.", 404)
        if vision_lock.locked():
            return error("L’AGX examine déjà une image. Réessaie dans un instant.", 429)
        try:
            # L'annonce est un vrai message du personnage choisi : les clients
            # du salon l'affichent et la lisent avec la voix correspondante.
            progress_line = {
                "id": uuid.uuid4().hex[:16], "name": speaker,
                "text": photo_progress_text(speaker), "timestamp": int(time.time() * 1000),
                "kind": "message", "category": "photo_progress", "referenceImageId": image_id,
            }
            await append_history(record["room"], progress_line)
            await broadcast(record["room"], {"type": "message", "message": progress_line})
            async with vision_lock:
                await broadcast(record["room"], {"type": "bot_status", "speaker": speaker, "active": True})
                try:
                    answer = await describe_provider(data, question, speaker)
                finally:
                    await broadcast(record["room"], {"type": "bot_status", "speaker": speaker, "active": False})
            answer = " ".join(str(answer or "").split())[:600]
            if not answer:
                raise ValueError
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[KITT_CHAT_IMAGES] Description photo failed: {type(exc).__name__}", flush=True)
            if store.get(image_id) is not None:
                failure_line = {
                    "id": uuid.uuid4().hex[:16], "name": speaker,
                    "text": (
                        "Bon, l’analyse a échoué. Réessaie, et cette fois le système fera peut-être son travail."
                        if speaker == "KARR" else
                        "Je n’ai pas pu terminer l’analyse de cette photo. Tu peux réessayer dans un instant."
                    ),
                    "timestamp": int(time.time() * 1000), "kind": "message",
                    "category": "photo_progress", "referenceImageId": image_id,
                }
                try:
                    await append_history(record["room"], failure_line)
                    await broadcast(record["room"], {"type": "message", "message": failure_line})
                except Exception:
                    pass
            return error("L’AGX n’a pas pu analyser cette image. Aucune description n’a été inventée.", 503)
        # A deletion during inference must not resurrect a removed attachment.
        if store.get(image_id) is None:
            return error("La photo a été supprimée pendant l’analyse.", 410)
        line = {"id": uuid.uuid4().hex[:16], "name": speaker, "text": answer, "timestamp": int(time.time() * 1000),
                "kind": "message", "referenceImageId": image_id}
        await append_history(record["room"], line)
        await broadcast(record["room"], {"type": "message", "message": line})
        return cors(web.json_response({"ok": True, "message": line}))

    async def options(_request: web.Request) -> web.Response:
        return cors(web.Response(status=204))

    async def startup(_app: web.Application) -> None:
        try:
            async with storage_lock:
                await asyncio.to_thread(store.prune)
        except OSError:
            print("[KITT_CHAT_IMAGES] Expired image cleanup deferred", flush=True)

    app.on_startup.append(startup)
    app.router.add_post("/api/kitt-chat/images", upload)
    app.router.add_get("/api/kitt-chat/images/{image_id}.webp", image)
    app.router.add_delete("/api/kitt-chat/images/{image_id}", remove)
    app.router.add_post("/api/kitt-chat/images/{image_id}/describe", describe)
    for route in ("/api/kitt-chat/images", "/api/kitt-chat/images/{image_id}", "/api/kitt-chat/images/{image_id}/describe"):
        app.router.add_route("OPTIONS", route, options)
